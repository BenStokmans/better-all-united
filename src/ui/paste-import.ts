import type { PriceCodeOption } from "../types";
import { makeEl } from "../utils/dom";
import { parseBySeparator } from "../utils/names";
import { importCourseMembers, getPriceCodeOptions } from "../services/importer";
import { showOverlayModal, showProgressModal, showReportModal } from "./modals";
import { createButton } from "./components";
import { t } from "../i18n";

export const openPasteImportDialog = (): void => {
  const { overlay, modal } = showOverlayModal({
    title: t("import_from_pasted_list"),
    bodyNodes: [],
    footerNodes: [],
    width: 760,
  });

  const sepRow = makeEl(
    "div",
    {},
    { display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" },
    [
      makeEl("label", { for: "sepSelect", text: t("separator") }),
      makeEl("select", { id: "sepSelect" }, {}, [
        makeEl("option", { value: "auto", text: t("auto_detect") }),
        makeEl("option", { value: "enter", text: t("enter_newline") }),
        makeEl("option", { value: "tab", text: t("tab") }),
        makeEl("option", { value: "comma", text: t("comma") }),
      ]),
    ]
  );

  const ta = makeEl(
    "textarea",
    { id: "pasteArea", placeholder: t("paste_names_here") },
    {
      width: "100%",
      height: "200px",
      padding: "8px",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
      resize: "vertical",
      marginTop: "8px",
      fontFamily:
        "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial",
    }
  ) as HTMLTextAreaElement;

  const preview = makeEl(
    "div",
    { text: t("detected_count", { count: 0 }) },
    { color: "#6b7280", marginTop: "6px" }
  );

  const priceCodeContainer = makeEl(
    "div",
    {},
    {
      display: "none",
      marginTop: "10px",
      padding: "10px",
      border: "1px solid #e5e7eb",
      borderRadius: "6px",
      background: "#f9fafb",
    }
  );

  const actions = makeEl(
    "div",
    {},
    { marginTop: "12px", display: "flex", gap: "8px" },
    []
  );

  const cancelBtn = createButton({
    id: "",
    text: t("cancel"),
    onClick: () => overlay.remove(),
    styles: { background: "#6b7280", border: "1px solid #6b7280" },
  });

  const importBtn = createButton({
    id: "",
    text: t("start_import"),
    onClick: () => {},
    styles: { background: "#0ea5a5", border: "1px solid #0ea5a5" },
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(importBtn);

  modal.appendChild(sepRow);
  modal.appendChild(ta);
  modal.appendChild(preview);
  modal.appendChild(priceCodeContainer);
  modal.appendChild(actions);

  let currentNames: string[] = [];
  let priceCodeOptions: PriceCodeOption[] | null = null;
  let priceCodeSelect: HTMLSelectElement | null = null;

  const requiresPriceCode = (): boolean => !!priceCodeOptions?.length;

  const updateImportButtonState = () => {
    const hasNames = currentNames.length > 0;
    const hasPriceCode = !requiresPriceCode() || !!priceCodeSelect?.value;
    importBtn.disabled = !(hasNames && hasPriceCode);
  };

  const updatePreview = () => {
    const sep = (modal.querySelector("#sepSelect") as HTMLSelectElement)
      .value as "auto" | "tab" | "comma" | "enter";
    currentNames = parseBySeparator(ta.value, sep);
    preview.textContent = `Detected: ${currentNames.length}`;
    updateImportButtonState();
  };

  ta.addEventListener("input", updatePreview);
  (modal.querySelector("#sepSelect") as HTMLSelectElement).addEventListener(
    "change",
    updatePreview
  );

  setTimeout(updatePreview, 0);

  void (async () => {
    try {
      const options = await getPriceCodeOptions();
      if (!options || !options.length) return;

      priceCodeOptions = options;

      priceCodeSelect = makeEl(
        "select",
        { id: "prijscodeSelect" },
        {
          flex: "1",
          padding: "6px",
          borderRadius: "6px",
          border: "1px solid #d1d5db",
        },
        [
          makeEl("option", {
            value: "",
            text: t("selecteer_prijscode"),
          }),
          ...options.map((opt) =>
            makeEl("option", {
              value: opt.value,
              text: opt.label || opt.value,
            })
          ),
        ]
      ) as HTMLSelectElement;

      priceCodeSelect.addEventListener("change", updateImportButtonState);

      const row = makeEl(
        "div",
        {},
        { display: "flex", gap: "8px", alignItems: "center" },
        [
          makeEl(
            "label",
            { for: "prijscodeSelect", text: "Prijscode:" },
            {},
            []
          ),
          priceCodeSelect,
        ]
      );

      priceCodeContainer.appendChild(row);
      priceCodeContainer.style.display = "";
      updateImportButtonState();
    } catch (err) {
      console.warn("Failed to load prijscodes", err);
    }
  })();

  importBtn.onclick = async () => {
    const sep = (modal.querySelector("#sepSelect") as HTMLSelectElement)
      .value as "auto" | "tab" | "comma" | "enter";
    const names = parseBySeparator(ta.value, sep);

    if (!names.length) {
      alert(t("no_names_detected"));
      return;
    }

    if (requiresPriceCode() && !priceCodeSelect?.value) {
      alert(t("select_pricecode_for_all"));
      return;
    }

    importBtn.disabled = true;
    importBtn.textContent = t("importing_count", { count: names.length });

    let progress: ReturnType<typeof showProgressModal> | null = null;
    const controller = new AbortController();

    try {
      progress = showProgressModal(names.length, () => controller.abort());

      const report = await importCourseMembers(names, {
        onProgress: progress.update,
        signal: controller.signal,
        priceCodeResolver:
          requiresPriceCode() && priceCodeSelect
            ? () => priceCodeSelect!.value
            : undefined,
      });

      if (report.aborted) {
        // import was aborted; leave modal and show partial report
        progress.finish();
        progress = null;
        overlay.remove();
        showReportModal(report);
      } else {
        progress.finish();
        progress = null;
        overlay.remove();
        showReportModal(report);
      }
    } catch (e) {
      if (progress) {
        progress.finish();
        progress = null;
      }
      alert(`Import failed: ${(e as Error).message || e}`);
    } finally {
      if (modal.isConnected) {
        importBtn.disabled = false;
        importBtn.textContent = "Start import";
      }
    }
  };
};
