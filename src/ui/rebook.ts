import { makeEl } from "../utils/dom";
import { showOverlayModal } from "./modals";
import { createButton } from "./components";
import { t } from "../i18n";
import { createDocument } from "../services/document";
import { getSessionId, performAccountSearch } from "../utils/session";

export const openRebookDialog = async (): Promise<void> => {
  const overlayRef = showOverlayModal({
    title: t("rebook_transaction"),
    bodyNodes: [],
    footerNodes: [],
    width: 640,
  });
  const { overlay, modal } = overlayRef;

  const form = makeEl("div", {}, { display: "grid", gap: "8px" }, []);

  // Shared styles for labels/inputs to match native AllUnited look
  const labelStyle: Partial<CSSStyleDeclaration> = {
    display: "block",
    fontSize: "15px",
    color: "#334155",
    paddingRight: "8px",
  };

  const inputStyle: Partial<CSSStyleDeclaration> = {
    width: "100%",
    padding: "10px",
    boxSizing: "border-box",
    borderRadius: "6px",
    border: "1px solid #e6eef3",
    background: "#f8fafb",
    outline: "none",
  };

  const smallInputStyle: Partial<CSSStyleDeclaration> = {
    padding: "8px",
    boxSizing: "border-box",
    borderRadius: "6px",
    border: "1px solid #e6eef3",
    background: "#fff",
  };

  // Description
  const descRow = makeEl(
    "div",
    {},
    { display: "grid", gridTemplateColumns: "160px 1fr", alignItems: "center", gap: "8px" },
    [
      makeEl("label", { for: "rebook-desc", text: t("description") || "Description" }, labelStyle),
      makeEl("input", { id: "rebook-desc", type: "text", value: "" }, inputStyle),
    ]
  );

  // Amount
  const amountRow = makeEl(
    "div",
    {},
    { display: "grid", gridTemplateColumns: "160px 1fr", alignItems: "center", gap: "8px" },
    [
      makeEl("label", { for: "rebook-amount", text: t("amount") || "Amount" }, labelStyle),
      makeEl("input", { id: "rebook-amount", type: "number", step: "0.01", value: "0" }, inputStyle),
    ]
  );

  // From / To dates
  const fromRow = makeEl(
    "div",
    {},
    { display: "grid", gridTemplateColumns: "160px 1fr", alignItems: "center", gap: "8px" },
    [
      makeEl("label", { for: "rebook-from", text: t("from_date") || "From" }, labelStyle),
      makeEl(
        "div",
        {},
        { display: "grid", gridTemplateColumns: "1fr 140px auto auto", gap: "8px", alignItems: "center" },
        [
          makeEl("input", { id: "rebook-from", type: "date" }, smallInputStyle),
          makeEl("input", { id: "rebook-to", type: "date" }, smallInputStyle),
          createButton({
            id: "rebook-to-previous-year",
            text: t("rebook_previous_year") || "-1y",
            onClick: (e) => {
              e.preventDefault();
              const from = form.querySelector("#rebook-from") as HTMLInputElement | null;
              const to = form.querySelector("#rebook-to") as HTMLInputElement | null;
              if (!from || !to) return;
              const parts = parseDateParts(from.value);
              if (!parts) return;
              to.value = safeSetYear(parts.y - 1, parts.m, parts.d);
            },
            styles: { padding: "6px 10px", borderRadius: "6px", background: "#fff", color: "#334155", border: "1px solid #e6eef3" },
          }),
          createButton({
            id: "rebook-to-next-year",
            text: t("rebook_next_year") || "+1y",
            onClick: (e) => {
              e.preventDefault();
              const from = form.querySelector("#rebook-from") as HTMLInputElement | null;
              const to = form.querySelector("#rebook-to") as HTMLInputElement | null;
              if (!from || !to) return;
              const parts = parseDateParts(from.value);
              if (!parts) return;
              to.value = safeSetYear(parts.y + 1, parts.m, parts.d);
            },
            styles: { padding: "6px 10px", borderRadius: "6px", background: "#fff", color: "#334155", border: "1px solid #e6eef3" },
          }),
        ]
      ),
    ]
  );

  // Account codes
  const mainAccountRow = makeEl(
    "div",
    {},
    { display: "grid", gridTemplateColumns: "160px 1fr", alignItems: "center", gap: "8px" },
    [
      makeEl("label", { for: "rebook-main-account", text: t("main_account_code") || "Main account code" }, labelStyle),
      makeEl("input", { id: "rebook-main-account", type: "text", value: "" }, inputStyle),
    ]
  );

  const rebookAccountRow = makeEl(
    "div",
    {},
    { display: "grid", gridTemplateColumns: "160px 1fr", alignItems: "center", gap: "8px" },
    [
      makeEl("label", { for: "rebook-account", text: t("rebook_account") || "Rebook account" }, labelStyle),
      makeEl("input", { id: "rebook-account", type: "text", value: "" }, inputStyle),
    ]
  );

  // Attach autocomplete to account inputs
  const attachAccountAutocomplete = (input: HTMLInputElement) => {
    // container for suggestion list
    const container = makeEl("div", {}, {
      position: "absolute",
      zIndex: "9999",
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "6px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
      maxHeight: "240px",
      overflow: "auto",
      width: "100%",
      display: "none",
    });

    // wrap input in relative container so absolute dropdown positions correctly
    const wrapper = makeEl("div", {}, { position: "relative", width: "100%" }, []);
    // replace input in its parent with the wrapper, then move the input into the wrapper
    const parent = input.parentElement;
    if (parent) {
      parent.replaceChild(wrapper, input);
      wrapper.appendChild(input);
      wrapper.appendChild(container);
    } else {
      // fallback: append container to body
      (input.parentElement as HTMLElement | null)?.appendChild(container);
    }

    let acController: AbortController | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let focusedIndex = -1;
    let results: Array<{ value: string; label: string }> = [];

    const clearResults = () => {
      results = [];
      container.innerHTML = "";
      container.style.display = "none";
      focusedIndex = -1;
    };

    const renderResults = () => {
      container.innerHTML = "";
      if (!results.length) {
        clearResults();
        return;
      }

      results.forEach((opt, idx) => {
        const item = makeEl("div", {}, {
          padding: "8px",
          cursor: "pointer",
          borderBottom: idx === results.length - 1 ? "none" : "1px solid #f3f4f6",
          background: idx === focusedIndex ? "#eef2f7" : "#fff",
        }, [
          makeEl("div", {}, { fontWeight: "600" }, [opt.label]),
          makeEl("div", {}, { color: "#6b7280", fontSize: "12px" }, [opt.value]),
        ]);

        item.addEventListener("mousedown", (e) => {
          // prevent blur
          e.preventDefault();
        });

        item.addEventListener("click", () => {
          // store selected code and show label(code)
          input.dataset.accountCode = opt.value;
          input.value = `${opt.label} (${opt.value})`;
          clearResults();
          input.focus();
        });

        container.appendChild(item);
      });

      container.style.display = "block";
    };

    const doSearch = (term: string) => {
      if (!term || term.length < 1) {
        clearResults();
        return;
      }

      if (acController) {
        acController.abort();
        acController = null;
      }
      acController = new AbortController();

      performAccountSearch(term, undefined, acController.signal)
        .then((opts) => {
          results = opts;
          focusedIndex = -1;
          renderResults();
        })
        .catch(() => {
          // ignore errors (abort etc.)
        });
    };

    input.addEventListener("input", () => {
      // clear stored code when user types
      delete input.dataset.accountCode;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => doSearch(input.value.trim()), 300);
    });

    input.addEventListener("keydown", (ev) => {
      if (!results.length) return;
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        focusedIndex = Math.min(results.length - 1, focusedIndex + 1);
        renderResults();
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        focusedIndex = Math.max(0, focusedIndex - 1);
        renderResults();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (focusedIndex >= 0 && results[focusedIndex]) {
          const opt = results[focusedIndex];
          input.dataset.accountCode = opt.value;
          input.value = `${opt.label} (${opt.value})`;
          clearResults();
        }
      } else if (ev.key === "Escape") {
        clearResults();
      }
    });

    input.addEventListener("blur", () => {
      // small timeout to allow click handler to run
      setTimeout(() => {
        // If the user blurred without choosing from the list, and the input
        // value doesn't contain a parenthesized code at the end (e.g. "Label (1234)"),
        // clear any previously stored accountCode to avoid submitting wrong value.
        const matches = /\((\d+)\)\s*$/.exec(input.value || "");
        if (!matches) delete input.dataset.accountCode;
        clearResults();
      }, 150);
    });
  };

  // initialize autocomplete on both inputs
  attachAccountAutocomplete(
    rebookAccountRow.querySelector("input") as HTMLInputElement
  );
  attachAccountAutocomplete(
    mainAccountRow.querySelector("input") as HTMLInputElement
  );

  // Persist last-used account codes so the extension can prefill them next time.
  const LAST_REBOOK_ACCOUNT_IDENTIFIER = "last_rebook_account_v1";

  const tryResolveAndFill = async (input: HTMLInputElement, storedCode: string | null) => {
    if (!storedCode) return;
    // prefer to set the dataset accountCode so submission uses the stored value
    input.dataset.accountCode = storedCode;
    // attempt to resolve a friendly label for the code so input shows e.g. "Label (1234)"
    try {
      const results = await performAccountSearch(storedCode, getSessionId());
      const match = results.find((r) => r.value === storedCode) || results[0];
      if (match) {
        input.value = `${match.label} (${match.value})`;
        return;
      }
    } catch (err) {
      // ignore errors (session not available, network issue)
    }
    // fallback: show the raw code
    input.value = storedCode;
  };

  // read stored values and prefill inputs (don't block UI if search fails)
  (async () => {
    try {
      const storedRebook = localStorage.getItem(LAST_REBOOK_ACCOUNT_IDENTIFIER);
      const rebookInput = rebookAccountRow.querySelector("input") as HTMLInputElement | null;
      if (rebookInput && storedRebook) await tryResolveAndFill(rebookInput, storedRebook);
    } catch (err) {
      // ignore storage errors
    }
  })();

  form.appendChild(descRow);
  form.appendChild(amountRow);
  form.appendChild(fromRow);
  form.appendChild(mainAccountRow);
  form.appendChild(rebookAccountRow);

  // date helpers used by the button handlers (scoped here so createButton handlers can call them)
  const parseDateParts = (v: string): { y: number; m: number; d: number } | null => {
    if (!v) return null;
    const parts = v.split("-");
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
    return { y, m, d };
  };

  const formatYMD = (y: number, m: number, d: number) =>
    `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const safeSetYear = (y: number, m: number, d: number): string => {
    // Try to construct date with same month/day and new year. If invalid (e.g. Feb 29 -> Feb 29 on non-leap year),
    // fallback to last day of that month.
    const candidate = new Date(y, m - 1, d);
    if (candidate.getFullYear() === y && candidate.getMonth() === m - 1) {
      return formatYMD(y, m, d);
    }
    // fallback: set to last day of month
    const last = new Date(y, m, 0); // day 0 of next month is last day
    return formatYMD(y, m, last.getDate());
  };

  const resultBox = makeEl(
    "div",
    { id: "rebook-result" },
    {
      display: "none",
      whiteSpace: "pre-wrap",
      background: "#ffffff",
      padding: "12px",
      borderRadius: "8px",
      color: "#0f172a",
    }
  );

  const makeResultLine = (text: string, ok = true) => {
    return makeEl("div", {}, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }, [
      makeEl("div", {}, { fontWeight: "600", color: ok ? "#065f46" : "#7f1d1d" }, [text]),
    ]);
  };

  const cancelBtn = createButton({
    id: "rebook-cancel",
    text: t("cancel"),
    onClick: () => overlay.remove(),
    styles: { background: "#6b7280", border: "1px solid #6b7280" },
  });

  const submitBtn = createButton({
    id: "rebook-submit",
    text: t("rebook_transaction") || "Rebook",
    onClick: async (e) => {
      e.preventDefault();
      // The handler is delegated to the named function below; this wrapper calls it.
      await handleSubmit();
    },
    styles: { background: "#0ea5a5", border: "1px solid #0ea5a5" },
  });

  // Named submit handler so we can swap the button behaviour after success
  const handleSubmit = async () => {
    // Read fields
    const desc =
      (document.getElementById("rebook-desc") as HTMLInputElement).value ||
      "";
    const amt =
      parseFloat(
        (document.getElementById("rebook-amount") as HTMLInputElement)
          .value || "0"
      ) || 0;
    const from = (document.getElementById("rebook-from") as HTMLInputElement)
      .value;
    const to = (document.getElementById("rebook-to") as HTMLInputElement)
      .value;
    const mainAccInput = document.getElementById(
      "rebook-main-account"
    ) as HTMLInputElement;
    const rebookAccInput = document.getElementById(
      "rebook-account"
    ) as HTMLInputElement;

    // Prefer the selected account code stored in data-account-code. If not set,
    // fall back to the raw input value (in case user typed a code manually).
    const mainAcc =
      (mainAccInput?.dataset?.accountCode as string) || mainAccInput?.value || "";
    const rebookAcc =
      (rebookAccInput?.dataset?.accountCode as string) || rebookAccInput?.value || "";

    if (!mainAcc || !rebookAcc || !from || !to || !amt) {
      resultBox.style.display = "";
      resultBox.textContent =
        t("rebook_missing_fields") || "Please fill in all required fields";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t("processing") || "Processing...";

    const sessionId = getSessionId();
    if (!sessionId) {
      resultBox.style.display = "";
      resultBox.textContent =
        t("rebook_no_session") || "Session ID not found.";
      submitBtn.disabled = false;
      submitBtn.textContent = t("rebook_transaction") || "Rebook";
      return;
    }

    try {
      // First document on 'from' date
      const doc1 = await createDocument({
        docTypeCode: "MDC",
        documentDate: from,
        currencyCode: "EUR",
        description: desc,
        sessionId: sessionId,
        lines: [
          { accountCode: mainAcc, amount: -Math.abs(amt), description: desc },
          {
            accountCode: rebookAcc,
            amount: Math.abs(amt),
            description: desc,
          },
        ],
      });

      // Second document on 'to' date - reverse signs
      const doc2 = await createDocument({
        docTypeCode: "MDC",
        documentDate: to,
        currencyCode: "EUR",
        description: desc,
        sessionId: sessionId,
        lines: [
          { accountCode: mainAcc, amount: Math.abs(amt), description: desc },
          {
            accountCode: rebookAcc,
            amount: -Math.abs(amt),
            description: desc,
          },
        ],
      });

      resultBox.innerHTML = "";
      resultBox.appendChild(makeResultLine(t("rebook_created") || "Created documents:", true));
      resultBox.appendChild(
        makeResultLine(
          `doc1: ${doc1.success ? doc1.documentId || "" : `ERROR: ${doc1.error}`}`,
          !!doc1.success
        )
      );
      resultBox.appendChild(
        makeResultLine(
          `doc2: ${doc2.success ? doc2.documentId || "" : `ERROR: ${doc2.error}`}`,
          !!doc2.success
        )
      );

      resultBox.style.display = "block";

      // Save last-used account codes so we can prefill them next time
      try {
        localStorage.setItem(LAST_REBOOK_ACCOUNT_IDENTIFIER, String(rebookAcc));
      } catch (e) {
        // ignore storage errors
      }

      // Change submit button to a Done action that closes the modal
      submitBtn.disabled = false;
      submitBtn.textContent = t("done") || "Done";
      submitBtn.onclick = () => overlay.remove();
      Object.assign(submitBtn.style, { background: "#10b981", borderColor: "#10b981" });
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)) || String(err);
      resultBox.innerHTML = "";
      resultBox.appendChild(makeResultLine(msg, false));
      resultBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = t("rebook_transaction") || "Rebook";
    }
  };

  const footer = makeEl(
    "div",
    {},
    { display: "flex", gap: "8px", marginTop: "12px" },
    [cancelBtn, submitBtn]
  );

  modal.appendChild(form);
  modal.appendChild(resultBox);
  modal.appendChild(footer);
};
