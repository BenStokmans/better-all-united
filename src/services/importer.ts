import type { ImportReport, ImportOptions, PriceCodeOption } from "../types";
import { findContactForName } from "./search";
import { sleep } from "../utils/dom";

const contactInputSelector =
  'input.find-field[name*="course[_subforms_][coursemembers]"][name$="[contactid]"]';

const normalize = (value: string): string =>
  String(value || "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const clickAddRow = async (): Promise<void> => {
  const btns = Array.from(document.querySelectorAll("input")).filter(
    (el) => el.type === "button" && el.value && el.value.trim() === "Voeg toe"
  );

  let addBtn: HTMLInputElement | null = null;

  if (btns.length === 1) {
    addBtn = btns[0];
  } else {
    const participantsSection = document
      .querySelector(
        '[data-row-name-prefix="course[_subforms_][coursemembers]"]'
      )
      ?.closest("[class], section, div");

    addBtn =
      (btns.find((b) =>
        participantsSection?.contains(b)
      ) as HTMLInputElement) ||
      btns[0] ||
      null;
  }

  if (!addBtn) throw new Error('Could not find the "Voeg toe" button.');

  addBtn.click();
  await sleep(150);
};

const hasEmptyContactInput = (): boolean =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(contactInputSelector)
  ).some((input) => !normalize(input.value));

const ensureContactRowAvailable = async (): Promise<void> => {
  if (hasEmptyContactInput()) return;
  await clickAddRow();
};

const fillLatestContactId = async (
  contactId: string
): Promise<HTMLInputElement> => {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(contactInputSelector)
  );

  if (!inputs.length) throw new Error("No contactid inputs found.");

  const target =
    inputs
      .filter((i) => !i.value || i.value.trim() === "")
      .sort((a, b) => {
        const m = (el: HTMLInputElement) =>
          el.name.match(/\[coursemembers]\[(\d+)]\[contactid]/);
        const idxA = m(a) ? parseInt(m(a)![1], 10) : -1;
        const idxB = m(b) ? parseInt(m(b)![1], 10) : -1;
        return idxA - idxB;
      })[0] || inputs[inputs.length - 1];

  target.focus();
  target.value = String(contactId);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  target.blur();
  await sleep(100);
  return target;
};

const gatherRows = (table: HTMLTableElement): HTMLTableRowElement[] => {
  const bodyRows = Array.from(
    table.querySelectorAll<HTMLTableRowElement>("tbody tr")
  );
  if (bodyRows.length) return bodyRows;
  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tr")).filter(
    (row) => !row.closest("thead")
  );
};

interface PriceCodeContext {
  columnIndex: number;
  options: PriceCodeOption[];
  table: HTMLTableElement;
}

let priceCodeContext: PriceCodeContext | null = null;
let priceCodeContextPromise: Promise<PriceCodeContext | null> | null = null;

const findPriceCodeHeader = (): {
  table: HTMLTableElement;
  columnIndex: number;
} | null => {
  const span = Array.from(
    document.querySelectorAll<HTMLSpanElement>("td span")
  ).find((el) => normalize(el.textContent || "") === "prijscode");

  if (!span) return null;

  const td = span.closest<HTMLTableCellElement>("td");
  if (!td) return null;

  const headerRow = td.parentElement as HTMLTableRowElement | null;
  if (!headerRow) return null;

  const headerCells = Array.from(headerRow.children).filter(
    (node): node is HTMLTableCellElement => node instanceof HTMLTableCellElement
  );

  const columnIndex = headerCells.indexOf(td);
  if (columnIndex === -1) return null;

  const table = td.closest("table") as HTMLTableElement | null;
  if (!table) return null;

  return { table, columnIndex };
};

const findPriceCodeSelect = (
  table: HTMLTableElement,
  columnIndex: number
): HTMLSelectElement | null => {
  const rows = gatherRows(table);

  for (const row of rows) {
    const cells = Array.from(row.children).filter(
      (node): node is HTMLTableCellElement =>
        node instanceof HTMLTableCellElement
    );
    const cell = cells[columnIndex];
    if (!cell) continue;
    const select = cell.querySelector("select");
    if (select) return select as HTMLSelectElement;
  }

  return null;
};

const ensurePriceCodeContext = async (): Promise<PriceCodeContext | null> => {
  if (priceCodeContext) return priceCodeContext;
  if (priceCodeContextPromise) return priceCodeContextPromise;

  priceCodeContextPromise = (async () => {
    const headerInfo = findPriceCodeHeader();
    if (!headerInfo) return null;

    const { table, columnIndex } = headerInfo;
    let select = findPriceCodeSelect(table, columnIndex);

    if (!select) {
      await clickAddRow();
      select = findPriceCodeSelect(table, columnIndex);
    }

    if (!select) return null;

    const allOptions = Array.from(select.options).map((opt) => ({
      value: String(opt.value ?? ""),
      label: String(opt.textContent ?? opt.label ?? ""),
    }));

    const usable = allOptions.filter((opt) => normalize(opt.value) !== "");

    priceCodeContext = {
      table,
      columnIndex,
      options: usable.length ? usable : allOptions,
    };

    return priceCodeContext;
  })().catch((err) => {
    console.warn("Failed to prepare prijscode context", err);
    return null;
  });

  const ctx = await priceCodeContextPromise;
  if (!ctx) {
    priceCodeContext = null;
    priceCodeContextPromise = null;
    return null;
  }

  priceCodeContextPromise = null;
  return ctx;
};

export const getPriceCodeOptions = async (): Promise<
  PriceCodeOption[] | null
> => {
  const ctx = await ensurePriceCodeContext();
  return ctx?.options ?? null;
};

const applyPriceCodeToRow = (
  contactInput: HTMLInputElement,
  priceCodeValue: string,
  ctx: PriceCodeContext
): void => {
  if (!priceCodeValue) return;

  const row = contactInput.closest("tr");
  if (!row) return;

  const cells = Array.from(row.children).filter(
    (node): node is HTMLTableCellElement => node instanceof HTMLTableCellElement
  );
  const cell = cells[ctx.columnIndex];

  const select = (cell?.querySelector("select") ||
    row.querySelector("select")) as HTMLSelectElement | null;

  if (!select) {
    console.warn("Could not find prijscode select in the row");
    return;
  }

  let resolvedValue = priceCodeValue;

  const hasExactValue = Array.from(select.options).some(
    (opt) => opt.value === resolvedValue
  );

  if (!hasExactValue) {
    const fallback = ctx.options.find(
      (opt) =>
        opt.value === priceCodeValue ||
        normalize(opt.label) === normalize(priceCodeValue)
    );
    if (!fallback) {
      console.warn(
        `Prijscode value "${priceCodeValue}" not available in select.`
      );
      return;
    }
    resolvedValue = fallback.value;
  }

  if (select.value !== resolvedValue) {
    select.value = resolvedValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
};

export const importCourseMembers = async (
  names: string[],
  options: ImportOptions = {}
): Promise<ImportReport> => {
  const { onProgress } = options;
  const signal = options.signal ?? null;
  const notFound: ImportReport["notFound"] = [];
  const ambiguous: ImportReport["ambiguous"] = [];
  const successes: ImportReport["successes"] = [];
  const total = names.length;
  let completed = 0;

  const priceCodeCtx = options.priceCodeResolver
    ? await ensurePriceCodeContext()
    : null;

  if (options.priceCodeResolver && !priceCodeCtx) {
    console.warn(
      "Prijscode resolver provided, but no prijscode column was detected."
    );
  }

  for (let idx = 0; idx < names.length; idx++) {
    const fullName = names[idx];
    if (signal?.aborted) {
      onProgress?.({
        step: "cancel",
        index: idx,
        total,
        completed,
        name: fullName,
      });
      return { successes, notFound, ambiguous, aborted: true };
    }

    onProgress?.({
      step: "start",
      index: idx,
      total,
      completed,
      name: fullName,
    });

    let outcome: "found" | "notFound" | "ambiguous" | "error" = "error";

    try {
      const result = await findContactForName(fullName, signal);

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      switch (result.status) {
        case "found":
          await ensureContactRowAvailable();
          const contactInput = await fillLatestContactId(result.data!.value);

          if (priceCodeCtx && options.priceCodeResolver) {
            const priceCodeValue = options.priceCodeResolver({
              index: idx,
              name: fullName,
              contact: result.data!,
            });

            if (priceCodeValue) {
              applyPriceCodeToRow(
                contactInput,
                String(priceCodeValue),
                priceCodeCtx
              );
            } else {
              console.warn(
                `No prijscode selected for ${fullName}; leaving default.`
              );
            }
          }

          successes.push({
            name: fullName,
            contactId: String(result.data!.value),
            label: result.data!.label || "",
          });
          outcome = "found";
          break;

        case "notFound":
          notFound.push({ name: fullName, reason: result.reason || "" });
          outcome = "notFound";
          break;

        case "ambiguous":
          ambiguous.push({
            name: fullName,
            reason: result.reason || "",
            candidates: result.candidates || [],
          });
          outcome = "ambiguous";
          break;
      }
    } catch (err) {
      // If aborted, break and return partial report
      if (
        (err as any)?.name === "AbortError" ||
        (err as DOMException)?.name === "AbortError"
      ) {
        onProgress?.({
          step: "cancel",
          index: idx,
          total,
          completed,
          name: fullName,
        });
        return { successes, notFound, ambiguous, aborted: true };
      }

      notFound.push({
        name: fullName,
        reason: (err as Error).message || String(err),
      });
      outcome = "error";
    } finally {
      completed += 1;
      onProgress?.({
        step: "complete",
        index: idx,
        total,
        completed,
        name: fullName,
        outcome,
      });
    }
  }

  return { successes, notFound, ambiguous };
};
