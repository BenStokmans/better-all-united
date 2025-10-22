import type { PriceCodeOption, PriceCodeResolverContext } from "../types";
import * as XLSX from "xlsx";
import { makeEl } from "../utils/dom";
import { importCourseMembers, getPriceCodeOptions } from "../services/importer";
import { showOverlayModal, showProgressModal, showReportModal } from "./modals";
import { createButton } from "./components";
import { t } from "../i18n";

const colToIndex = (col: string): number => {
  const c = String(col || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!c) return 0;

  let n = 0;
  for (let i = 0; i < c.length; i++) {
    n = n * 26 + (c.charCodeAt(i) - 64);
  }
  return n - 1;
};

const parseA1Ref = (ref: string): { firstRow: number; lastRow: number } => {
  const m = String(ref || "").match(/^[A-Z]+(\d+):[A-Z]+(\d+)$/i);
  if (!m) return { firstRow: 1, lastRow: 100 };
  return { firstRow: parseInt(m[1], 10), lastRow: parseInt(m[2], 10) };
};

interface ExtractedEntry {
  name: string;
  // Supports multiple mapping columns (combinations)
  priceSource?: string[];
}

export const openExcelImportDialog = async (): Promise<void> => {
  const overlayRef = showOverlayModal({
    title: t("import_from_excel"),
    bodyNodes: [],
    footerNodes: [],
  });

  const { overlay, modal } = overlayRef;

  const fileRow = makeEl("div", {}, { margin: "10px 0" }, [
    makeEl("label", { for: "excelFile", text: t("select_file") }, {}, []),
    makeEl("input", {
      id: "excelFile",
      type: "file",
      accept:
        ".xlsx, .xls, .xlsb, .xlsm, .ods, .csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  ]);

  const sheetRow = makeEl("div", {}, { margin: "10px 0", display: "none" }, [
    makeEl("label", { for: "sheetSelect", text: t("sheet") }),
    makeEl("select", { id: "sheetSelect" }, {}, []),
  ]);

  // Name selection mode: single column OR two columns (first + last)
  let nameMode: "single" | "two" = "single";
  let nameModeSelect: HTMLSelectElement | null = null;

  // Name range row (supports both single and dual column modes)
  const rangeRow = makeEl(
    "div",
    {},
    {
      margin: "10px 0",
      display: "none",
      gap: "8px",
      alignItems: "center",
      flexWrap: "wrap",
    },
    []
  );

  // Single column controls (A + rows)
  const singleColControls = makeEl(
    "div",
    {},
    { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
    [
      makeEl("label", { for: "colInput", text: t("column_letter") }),
      makeEl("input", {
        id: "colInput",
        type: "text",
        value: "A",
        placeholder: "e.g. A",
        size: "3",
      }),
    ]
  );

  // Two columns controls (First + Last with customizable separator)
  const dualColControls = makeEl(
    "div",
    {},
    {
      display: "none",
      gap: "8px",
      alignItems: "center",
      flexWrap: "wrap",
    },
    [
      makeEl("label", {
        for: "firstColInput",
        text: t("first_name_column") || "First name column",
      }),
      makeEl("input", {
        id: "firstColInput",
        type: "text",
        value: "A",
        placeholder: "e.g. A",
        size: "3",
      }),
      makeEl("label", {
        for: "lastColInput",
        text: t("last_name_column") || "Last name column",
      }),
      makeEl("input", {
        id: "lastColInput",
        type: "text",
        value: "B",
        placeholder: "e.g. B",
        size: "3",
      }),
      makeEl("label", {
        for: "nameSepInput",
        text: t("name_separator") || "Separator",
      }),
      makeEl("input", {
        id: "nameSepInput",
        type: "text",
        value: " ",
        placeholder: "e.g. space, comma",
        size: "3",
      }),
    ]
  );

  // Row range and header
  const rowsAndHeaderControls = makeEl(
    "div",
    {},
    { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
    [
      makeEl("label", { for: "rowFrom", text: t("rows_from") }),
      makeEl("input", { id: "rowFrom", type: "number", min: "1", value: "1" }),
      makeEl("label", { for: "rowTo", text: t("to") }),
      makeEl("input", { id: "rowTo", type: "number", min: "1", value: "100" }),
      makeEl("label", { for: "hasHeader", text: t("header_row_skip") }),
      makeEl("input", { id: "hasHeader", type: "checkbox", checked: "true" }),
    ]
  );

  // Name mode selector
  const nameModeRow = makeEl(
    "div",
    {},
    { display: "none", gap: "8px", alignItems: "center", marginTop: "8px" },
    [
      makeEl("label", {
        for: "nameMode",
        text: t("name_mode") || "Name mode",
      }),
      (nameModeSelect = makeEl(
        "select",
        { id: "nameMode" },
        { padding: "6px", borderRadius: "6px", border: "1px solid #d1d5db" },
        [
          makeEl("option", {
            value: "single",
            text: t("single_column") || "Single column",
          }),
          makeEl("option", {
            value: "two",
            text: t("two_columns_first_last") || "Two columns (First + Last)",
          }),
        ]
      ) as HTMLSelectElement),
    ]
  );

  rangeRow.appendChild(nameModeRow);
  rangeRow.appendChild(singleColControls);
  rangeRow.appendChild(dualColControls);
  rangeRow.appendChild(rowsAndHeaderControls);

  const previewTitle = makeEl(
    "div",
    { text: t("preview_first_25") },
    { margin: "6px 0", display: "none", fontWeight: "600" }
  );

  const previewBox = makeEl(
    "pre",
    {},
    {
      display: "none",
      background: "#f9fafb",
      border: "1px solid #e5e7eb",
      padding: "8px",
      borderRadius: "6px",
      maxHeight: "180px",
      overflow: "auto",
      fontSize: "12px",
      whiteSpace: "pre-wrap",
    }
  );

  const actions = makeEl(
    "div",
    {},
    { marginTop: "12px", display: "flex", gap: "8px" },
    []
  );

  const cancelBtn = createButton({
    id: "excel-cancel",
    text: t("cancel"),
    onClick: () => overlay.remove(),
    styles: { background: "#6b7280", border: "1px solid #6b7280" },
  });

  const importBtn = createButton({
    id: "excel-import",
    text: t("start_import"),
    onClick: () => {},
    styles: { background: "#0ea5a5", border: "1px solid #0ea5a5" },
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(importBtn);

  const priceCodeContainer = makeEl(
    "div",
    {},
    {
      display: "none",
      margin: "10px 0",
      padding: "12px",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      background: "#f9fafb",
      flexDirection: "column",
      gap: "8px",
    }
  );

  modal.appendChild(fileRow);
  modal.appendChild(sheetRow);
  modal.appendChild(rangeRow);
  modal.appendChild(priceCodeContainer);
  modal.appendChild(previewTitle);
  modal.appendChild(previewBox);
  modal.appendChild(actions);

  let workbook: XLSX.WorkBook | null = null;
  let sheetNames: string[] = [];
  let table: unknown[][] = [];

  let rawEntries: ExtractedEntry[] = [];
  let uniqueEntries: ExtractedEntry[] = [];
  let priceCodeOptions: PriceCodeOption[] | null = null;
  let priceMode: "single" | "map" = "single";
  let priceCodeSelectSingle: HTMLSelectElement | null = null;

  // MULTI-COLUMN mapping state
  const MAX_COMBINATIONS = 500;
  let priceCodeColumnInputs: HTMLInputElement[] = [];
  let priceCodeMappingContainer: HTMLElement | null = null;
  let priceCodeMappingWrapper: HTMLElement | null = null;
  let priceCodeColumnsList: HTMLElement | null = null;
  let priceCodeNotice: HTMLElement | null = null;
  let priceCodeMappingState: Map<string, string> = new Map();

  const normalizeNameKey = (value: string): string =>
    String(value || "")
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const comboKey = (values: string[]): string =>
    JSON.stringify(values.map((v) => (v ?? "").toString()));

  const makeComboLabel = (
    letters: string[],
    values: string[],
    hasEmptyByCol: boolean[]
  ): string => {
    if (!letters.length) return "";
    if (letters.length === 1) {
      const v = values[0] ?? "";
      if (v) return v;
      return hasEmptyByCol[0] ? "(empty)" : "";
    }
    return letters
      .map((l, i) => {
        const v = values[i] ?? "";
        const show = v || (hasEmptyByCol[i] ? "(empty)" : "");
        return `${l}: ${show}`;
      })
      .join(" · ");
  };

  const getPriceColumnLetters = (): string[] => {
    const letters = priceCodeColumnInputs
      .map((input) =>
        (input.value || "")
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .trim()
      )
      .filter(Boolean);
    // Dedup, preserve order
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of letters) {
      if (!seen.has(l)) {
        seen.add(l);
        out.push(l);
      }
    }
    return out;
  };

  const getUniqueValuesMeta = (): {
    valuesByCol: string[][];
    hasEmptyByCol: boolean[];
  } => {
    const letters = getPriceColumnLetters();
    if (!letters.length) return { valuesByCol: [], hasEmptyByCol: [] };

    const sets: Array<Set<string>> = letters.map(() => new Set<string>());
    const hasEmptyByCol: boolean[] = letters.map(() => false);

    for (const entry of rawEntries) {
      const arr = Array.isArray(entry.priceSource) ? entry.priceSource : [];
      for (let i = 0; i < letters.length; i++) {
        const val = (arr[i] ?? "").toString().trim();
        sets[i].add(val);
        if (val === "") hasEmptyByCol[i] = true;
      }
    }

    return { valuesByCol: sets.map((s) => Array.from(s)), hasEmptyByCol };
  };

  const cartesian = (arrays: string[][]): string[][] => {
    if (!arrays.length) return [];
    return arrays.reduce<string[][]>(
      (acc, curr) => {
        const next: string[][] = [];
        for (const a of acc) {
          for (const b of curr) {
            next.push([...a, b]);
          }
        }
        return next;
      },
      [[]]
    );
  };

  const readFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: "array" });
    sheetNames = workbook.SheetNames || [];

    const select = sheetRow.querySelector("#sheetSelect") as HTMLSelectElement;
    select.innerHTML = "";

    sheetNames.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      select.appendChild(opt);
    });

    sheetRow.style.display = sheetNames.length ? "" : "none";

    if (sheetNames.length) {
      loadSheet(sheetNames[0]);
    }
  };

  const loadSheet = (name: string) => {
    if (!workbook) return;

    const ws = workbook.Sheets[name];
    table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

    rangeRow.style.display = "";
    nameModeRow.style.display = "";
    previewTitle.style.display = "";
    previewBox.style.display = "";

    if (ws["!ref"]) {
      const { firstRow, lastRow } = parseA1Ref(ws["!ref"]);
      const hasHeaderEl = rangeRow.querySelector(
        "#hasHeader"
      ) as HTMLInputElement;
      const rowFromEl = rangeRow.querySelector("#rowFrom") as HTMLInputElement;
      const rowToEl = rangeRow.querySelector("#rowTo") as HTMLInputElement;

      const hasHeaderChecked = !!hasHeaderEl.checked;
      rowFromEl.value = String(
        hasHeaderChecked ? Math.max(2, firstRow) : firstRow
      );
      rowToEl.value = String(lastRow);
    }

    refreshPreview();
  };

  const getNameColumnLetter = (): string => {
    const el = rangeRow.querySelector("#colInput") as HTMLInputElement;
    const value = (el?.value || "A").toUpperCase().replace(/[^A-Z]/g, "");
    return value || "A";
  };

  const getFirstNameColumnLetter = (): string => {
    const el = rangeRow.querySelector("#firstColInput") as HTMLInputElement;
    return (el?.value || "A").toUpperCase().replace(/[^A-Z]/g, "");
  };

  const getLastNameColumnLetter = (): string => {
    const el = rangeRow.querySelector("#lastColInput") as HTMLInputElement;
    return (el?.value || "B").toUpperCase().replace(/[^A-Z]/g, "");
  };

  const getNameSeparator = (): string => {
    const el = rangeRow.querySelector("#nameSepInput") as HTMLInputElement;
    // Default to single space if empty
    return (el?.value ?? " ").toString();
  };

  const getRowStart = (): number =>
    parseInt(
      (rangeRow.querySelector("#rowFrom") as HTMLInputElement).value || "1",
      10
    );

  const getRowEnd = (): number =>
    parseInt(
      (rangeRow.querySelector("#rowTo") as HTMLInputElement).value || "1",
      10
    );

  const hasHeaderRow = (): boolean =>
    !!(rangeRow.querySelector("#hasHeader") as HTMLInputElement).checked;

  const sanitizeColInput = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "");
  };

  const extractEntriesFromRange = (): ExtractedEntry[] => {
    if (!table.length) return [];

    const startRow = Math.max(1, getRowStart()) - 1;
    const endRow = Math.max(startRow, getRowEnd() - 1);
    const skipHeader = hasHeaderRow();

    // Collect indices for all selected price mapping columns
    const priceLetters = getPriceColumnLetters();
    const priceIndices =
      priceLetters.length > 0 ? priceLetters.map((l) => colToIndex(l)) : [];

    const entries: ExtractedEntry[] = [];

    if (nameMode === "single") {
      const colLetter = getNameColumnLetter();
      const colIndex = colToIndex(colLetter);

      for (let r = startRow; r <= endRow && r < table.length; r++) {
        if (skipHeader && r === startRow) continue;

        const row = (table[r] || []) as unknown[];
        const cell = row[colIndex];
        if (cell == null) continue;

        const priceValues =
          priceIndices.length > 0
            ? priceIndices.map((pi) => String(row[pi] ?? "").trim())
            : [];

        const items = String(cell)
          .split(/\r?\n+/)
          .map((s) => s.trim())
          .filter(Boolean);

        for (const item of items) {
          entries.push({
            name: item,
            priceSource: priceIndices.length ? priceValues : undefined,
          });
        }
      }
    } else {
      // nameMode === 'two'
      const firstColLetter = getFirstNameColumnLetter();
      const lastColLetter = getLastNameColumnLetter();
      const firstIndex = colToIndex(firstColLetter);
      const lastIndex = colToIndex(lastColLetter);
      const sep = getNameSeparator();

      for (let r = startRow; r <= endRow && r < table.length; r++) {
        if (skipHeader && r === startRow) continue;

        const row = (table[r] || []) as unknown[];
        const first = row[firstIndex];
        const last = row[lastIndex];

        const firstStr = String(first ?? "").trim();
        const lastStr = String(last ?? "").trim();

        // Skip if both are empty
        if (!firstStr && !lastStr) continue;

        const combined = [firstStr, lastStr]
          .filter((s) => s && s.length)
          .join(sep || " ")
          .replace(/\s+/g, " ")
          .trim();

        if (!combined) continue;

        const priceValues =
          priceIndices.length > 0
            ? priceIndices.map((pi) => String(row[pi] ?? "").trim())
            : [];

        // Unlike single mode, we don't split on newlines because columns carry single values
        entries.push({
          name: combined,
          priceSource: priceIndices.length ? priceValues : undefined,
        });
      }
    }

    return entries;
  };

  const dedupeEntries = (entries: ExtractedEntry[]): ExtractedEntry[] => {
    const seen = new Set<string>();
    const unique: ExtractedEntry[] = [];

    for (const entry of entries) {
      const key = normalizeNameKey(entry.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push({
        name: entry.name,
        priceSource: Array.isArray(entry.priceSource)
          ? entry.priceSource.map((v) => (v ?? "").toString().trim())
          : undefined,
      });
    }

    return unique;
  };

  const requiresPriceCode = (): boolean => !!priceCodeOptions?.length;

  const updateImportButtonState = () => {
    const hasNames = uniqueEntries.length > 0;
    let priceReady = true;

    if (requiresPriceCode()) {
      if (priceMode === "single") {
        priceReady = !!priceCodeSelectSingle?.value;
      } else {
        // priceMode === 'map'
        const { valuesByCol } = getUniqueValuesMeta();
        const combosCount = valuesByCol.reduce(
          (acc, arr) => acc * (arr.length || 1),
          1
        );

        if (!valuesByCol.length) {
          priceReady = false;
        } else if (!combosCount) {
          priceReady = false;
        } else if (combosCount > MAX_COMBINATIONS) {
          priceReady = false;
        } else {
          const combos = cartesian(valuesByCol);
          priceReady = combos.every(
            (vals) => !!priceCodeMappingState.get(comboKey(vals))
          );
        }
      }
    }

    importBtn.disabled = !(hasNames && priceReady);
  };

  const refreshPriceCodeMappingList = () => {
    if (!priceCodeMappingContainer || !priceCodeNotice) {
      updateImportButtonState();
      return;
    }

    priceCodeMappingContainer.replaceChildren();

    if (!requiresPriceCode()) {
      priceCodeNotice.textContent = "";
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    if (priceMode !== "map") {
      priceCodeNotice.textContent = "";
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    const letters = getPriceColumnLetters();
    if (!letters.length) {
      priceCodeNotice.textContent =
        t("enter_pricecode_column_letter") ||
        "Enter one or more column letters for price code mapping";
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    const { valuesByCol, hasEmptyByCol } = getUniqueValuesMeta();
    if (!valuesByCol.length || valuesByCol.some((a) => a.length === 0)) {
      priceCodeNotice.textContent =
        t("no_values_in_column") || "No values found in selected columns";
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    const combos = cartesian(valuesByCol);
    if (combos.length > MAX_COMBINATIONS) {
      priceCodeNotice.textContent = `${
        t("too_many_combinations") || "Too many combinations"
      }: ${combos.length}. ${
        t("narrow_selection_or_values") ||
        "Please narrow your selection (rows/columns) or reduce unique values."
      } (limit: ${MAX_COMBINATIONS})`;
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    priceCodeNotice.textContent =
      t("map_each_value") ||
      "Map each value combination to a price code using the selectors below";

    const nextState = new Map<string, string>();
    combos.forEach((vals) => {
      const k = comboKey(vals);
      const existing = priceCodeMappingState.get(k) ?? "";
      nextState.set(k, existing);
    });
    priceCodeMappingState = nextState;

    combos.forEach((vals) => {
      const k = comboKey(vals);

      const select = makeEl(
        "select",
        {},
        {
          flex: "1",
          padding: "6px",
          borderRadius: "6px",
          border: "1px solid #d1d5db",
          minWidth: "180px",
        },
        [
          makeEl("option", {
            value: "",
            text: t("selecteer_prijscode") || "Selecteer prijscode",
          }),
          ...(priceCodeOptions || []).map((opt) =>
            makeEl("option", {
              value: opt.value,
              text: opt.label || opt.value,
            })
          ),
        ]
      ) as HTMLSelectElement;

      select.value = priceCodeMappingState.get(k) ?? "";
      select.addEventListener("change", () => {
        priceCodeMappingState.set(k, select.value);
        updateImportButtonState();
      });

      const labelText = makeComboLabel(letters, vals, hasEmptyByCol);
      const row = makeEl(
        "div",
        {},
        {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 0",
        },
        [
          makeEl(
            "span",
            { text: labelText },
            {
              minWidth: "220px",
              fontFamily: "monospace",
              color: labelText ? "#111827" : "#6b7280",
              whiteSpace: "pre-wrap",
            }
          ),
          select,
        ]
      );

      priceCodeMappingContainer!.appendChild(row);
    });

    updateImportButtonState();
  };

  const refreshPreview = () => {
    try {
      rawEntries = extractEntriesFromRange();
      uniqueEntries = dedupeEntries(rawEntries);
      const sample = uniqueEntries.slice(0, 25).map((entry) => entry.name);
      previewBox.textContent = sample.length
        ? sample.join("\n")
        : "(no names detected in the selected range)";
    } catch {
      rawEntries = [];
      uniqueEntries = [];
      previewBox.textContent = "(error while reading the selected range)";
    }

    updateImportButtonState();

    if (priceMode === "map") {
      refreshPriceCodeMappingList();
    }
  };

  const setupPriceCodeUI = (options: PriceCodeOption[]): void => {
    if (!options.length || priceCodeOptions) return;

    priceCodeOptions = options;
    priceCodeContainer.style.display = "flex";
    priceCodeContainer.replaceChildren();

    const header = makeEl("div", { text: "Prijscode" }, { fontWeight: "600" });

    const modeSelect = makeEl(
      "select",
      { id: "priceModeSelect" },
      { padding: "6px", borderRadius: "6px", border: "1px solid #d1d5db" },
      [
        makeEl("option", {
          value: "single",
          text: "Gebruik één prijscode voor alle deelnemers",
        }),
        makeEl("option", {
          value: "map",
          text: "Koppel kolomwaarden aan prijscodes (1 of meer kolommen)",
        }),
      ]
    ) as HTMLSelectElement;

    const modeRow = makeEl(
      "div",
      {},
      { display: "flex", flexDirection: "column", gap: "4px" },
      [
        makeEl("label", {
          for: "priceModeSelect",
          text: "Prijscode modus:",
        }),
        modeSelect,
      ]
    );

    priceCodeSelectSingle = makeEl(
      "select",
      { id: "priceCodeSingle" },
      { padding: "6px", borderRadius: "6px", border: "1px solid #d1d5db" },
      [
        makeEl("option", { value: "", text: "Selecteer prijscode" }),
        ...options.map((opt) =>
          makeEl("option", { value: opt.value, text: opt.label || opt.value })
        ),
      ]
    ) as HTMLSelectElement;

    priceCodeSelectSingle.addEventListener("change", updateImportButtonState);

    const singleRow = makeEl(
      "div",
      {},
      { display: "flex", flexDirection: "column", gap: "4px" },
      [
        makeEl("label", { for: "priceCodeSingle", text: "Prijscode:" }),
        priceCodeSelectSingle,
      ]
    );

    // Multi-column mapping UI
    priceCodeNotice = makeEl("div", {}, { color: "#6b7280", fontSize: "12px" });

    priceCodeMappingContainer = makeEl(
      "div",
      {},
      {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        maxHeight: "220px",
        overflow: "auto",
        paddingRight: "4px",
      }
    );

    priceCodeColumnsList = makeEl(
      "div",
      {},
      {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
      }
    );

    const addPriceCodeColumn = (initial?: string) => {
      const row = makeEl(
        "div",
        {},
        { display: "flex", gap: "6px", alignItems: "center" },
        []
      );

      const input = makeEl(
        "input",
        {
          type: "text",
          placeholder: "bijv. B",
          size: "3",
        },
        {
          padding: "6px",
          borderRadius: "6px",
          border: "1px solid #d1d5db",
          width: "80px",
        }
      ) as HTMLInputElement;

      if (initial) input.value = initial;
      sanitizeColInput(input);

      input.addEventListener("input", () => {
        sanitizeColInput(input);
        refreshPreview();
        refreshPriceCodeMappingList();
      });

      const removeBtn = makeEl(
        "button",
        { type: "button", text: "×", title: t("remove") || "Remove" },
        {
          padding: "4px 8px",
          borderRadius: "6px",
          border: "1px solid #d1d5db",
          background: "#fff",
          cursor: "pointer",
          lineHeight: "1",
        }
      ) as HTMLButtonElement;

      removeBtn.addEventListener("click", () => {
        const idx = priceCodeColumnInputs.indexOf(input);
        if (idx >= 0) priceCodeColumnInputs.splice(idx, 1);
        row.remove();
        refreshPreview();
        refreshPriceCodeMappingList();
      });

      row.appendChild(input);
      row.appendChild(removeBtn);
      priceCodeColumnsList!.appendChild(row);
      priceCodeColumnInputs.push(input);
    };

    const addColBtn = makeEl(
      "button",
      { type: "button", text: t("add_column") || "Add column" },
      {
        padding: "6px 10px",
        borderRadius: "6px",
        border: "1px solid #d1d5db",
        background: "#fff",
        cursor: "pointer",
      }
    ) as HTMLButtonElement;

    addColBtn.addEventListener("click", () => {
      addPriceCodeColumn("");
      refreshPreview();
      refreshPriceCodeMappingList();
    });

    // Wrapper for mapping mode
    priceCodeMappingWrapper = makeEl(
      "div",
      {},
      { display: "none", flexDirection: "column", gap: "8px" },
      [
        makeEl(
          "div",
          {},
          {
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
          },
          [
            makeEl("label", {
              text:
                t("columns_for_pricecode") ||
                "Kolommen voor prijscode (1 of meer):",
            }),
            addColBtn,
          ]
        ),
        priceCodeColumnsList,
        priceCodeNotice,
        priceCodeMappingContainer,
      ]
    );

    const syncVisibility = () => {
      singleRow.style.display = priceMode === "single" ? "flex" : "none";
      if (priceCodeMappingWrapper) {
        priceCodeMappingWrapper.style.display =
          priceMode === "map" ? "flex" : "none";
      }
      refreshPriceCodeMappingList();
      updateImportButtonState();
    };

    modeSelect.addEventListener("change", () => {
      priceMode = (modeSelect.value as "single" | "map") || "single";
      syncVisibility();
    });

    priceCodeContainer.appendChild(header);
    priceCodeContainer.appendChild(modeRow);
    priceCodeContainer.appendChild(singleRow);
    priceCodeContainer.appendChild(priceCodeMappingWrapper);

    // Defaults
    priceMode = "single";
    // Add one default column input (optional)
    addPriceCodeColumn("B");
    syncVisibility();
  };

  // Initial button state
  updateImportButtonState();

  // Load price code options
  void (async () => {
    try {
      const options = await getPriceCodeOptions();
      if (!options || !options.length) return;
      setupPriceCodeUI(options);
      refreshPriceCodeMappingList();
      updateImportButtonState();
    } catch (err) {
      console.warn(t("failed_load_pricecodes", { msg: String(err) }));
    }
  })();

  // File selection
  (fileRow.querySelector("#excelFile") as HTMLInputElement).addEventListener(
    "change",
    async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      importBtn.disabled = true;
      importBtn.textContent = t("reading_file");

      try {
        await readFile(file);
        importBtn.textContent = t("start_import");
        refreshPreview();
      } catch (err) {
        importBtn.textContent = t("start_import");
        alert(
          t("failed_read_file", { msg: (err as Error).message || String(err) })
        );
      } finally {
        updateImportButtonState();
      }
    }
  );

  // Sheet selection
  (
    sheetRow.querySelector("#sheetSelect") as HTMLSelectElement
  ).addEventListener("change", (e) => {
    loadSheet((e.target as HTMLSelectElement).value);
  });

  // Name mode change
  nameModeSelect?.addEventListener("change", () => {
    nameMode = (nameModeSelect!.value as "single" | "two") || "single";
    singleColControls.style.display = nameMode === "single" ? "flex" : "none";
    dualColControls.style.display = nameMode === "two" ? "flex" : "none";
    refreshPreview();
  });

  // Range inputs
  rangeRow.addEventListener("input", (ev) => {
    const target = ev.target as HTMLInputElement | HTMLSelectElement;
    if (!target) return;

    // Sanitize column inputs
    if (target.id === "colInput") sanitizeColInput(target as HTMLInputElement);
    if (target.id === "firstColInput")
      sanitizeColInput(target as HTMLInputElement);
    if (target.id === "lastColInput")
      sanitizeColInput(target as HTMLInputElement);

    try {
      refreshPreview();
    } catch {
      // ignore preview errors
    }
  });

  importBtn.onclick = async () => {
    refreshPreview();

    const names = uniqueEntries.map((entry) => entry.name);

    if (!names.length) {
      alert(t("no_names_selected_range"));
      return;
    }

    if (requiresPriceCode()) {
      if (priceMode === "single") {
        if (!priceCodeSelectSingle?.value) {
          alert(t("select_pricecode_for_all"));
          return;
        }
      } else {
        const letters = getPriceColumnLetters();
        if (!letters.length) {
          alert(
            t("give_pricecode_column") ||
              "Please provide one or more columns for price code mapping"
          );
          return;
        }

        const { valuesByCol } = getUniqueValuesMeta();
        const combos = cartesian(valuesByCol);
        if (!combos.length) {
          alert(
            t("no_values_in_pricecode_column") ||
              "No values found in the selected price code columns"
          );
          return;
        }

        if (combos.length > MAX_COMBINATIONS) {
          alert(
            `${t("too_many_combinations") || "Too many combinations"}: ${
              combos.length
            }.`
          );
          return;
        }

        const missing = combos.filter(
          (vals) => !priceCodeMappingState.get(comboKey(vals))
        );
        if (missing.length) {
          alert(t("make_mapping") || "Please complete the mapping.");
          return;
        }
      }
    }

    let progress: ReturnType<typeof showProgressModal> | null = null;
    const controller = new AbortController();

    try {
      importBtn.disabled = true;
      importBtn.textContent = t("importing_count", { count: names.length });

      progress = showProgressModal(names.length, () => controller.abort());

      const priceCodeResolver = requiresPriceCode()
        ? priceMode === "single"
          ? () => priceCodeSelectSingle!.value
          : ({ index }: PriceCodeResolverContext) => {
              const entry = uniqueEntries[index];
              if (!entry) return null;
              const values = Array.isArray(entry.priceSource)
                ? entry.priceSource
                : [];
              const key = comboKey(values);
              return priceCodeMappingState.get(key) ?? null;
            }
        : undefined;

      const report = await importCourseMembers(names, {
        onProgress: progress.update,
        signal: controller.signal,
        priceCodeResolver,
      });

      progress.finish();
      progress = null;
      overlay.remove();
      showReportModal(report);
    } catch (e) {
      if (progress) {
        progress.finish();
        progress = null;
      }
      if ((e as DOMException)?.name === "AbortError") return;
      alert(t("import_failed", { msg: (e as Error).message || String(e) }));
    } finally {
      if (modal.isConnected) {
        importBtn.disabled = false;
        importBtn.textContent = t("start_import");
        updateImportButtonState();
      }
    }
  };
};
