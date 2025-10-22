import { createInputButton } from "./ui/components";
import { openExcelImportDialog } from "./ui/excel-import";
import { openPasteImportDialog } from "./ui/paste-import";
import { onElementAvailable, ready } from "./utils/dom";
import { t } from "./i18n";

const attachCourseMembersButtons = (): void => {
  const selector = '[data-row-name-prefix="course[_subforms_][coursemembers]"]';
  const idExcel = "import-course-members-excel";
  const idPaste = "import-course-members-paste";

  onElementAvailable(selector, () => {
    const targetContainers = document.getElementsByClassName(
      "subform-table__new-row"
    );
    if (targetContainers.length === 0) return;
    const targetContainer = targetContainers[0];

    if (!targetContainer.querySelector(`#${idExcel}`)) {
      const button1 = createInputButton({
        id: idExcel,
        text: t("import_excel"),
        onClick: openExcelImportDialog,
        styles: { marginRight: "8px" },
      });
      targetContainer.appendChild(button1);
    }

    if (!targetContainer.querySelector(`#${idPaste}`)) {
      const button2 = createInputButton({
        id: idPaste,
        text: t("import_paste"),
        onClick: openPasteImportDialog,
      });
      targetContainer.appendChild(button2);
    }
  });
};

// Setup request interceptor for enhanced multi-word search


// src/content.ts
function injectInpageScript() {
  const script = document.createElement("script");
  // Use a safe access to window.chrome to avoid TypeScript "Cannot find name 'chrome'"
  const runtime = (window as any).chrome?.runtime;
  if (runtime && typeof runtime.getURL === "function") {
    script.src = runtime.getURL("dist/interceptor.js");
  } else {
    throw new Error("Cannot access chrome.runtime to get script URL");
  }
  script.type = "text/javascript";
  // Clean up after load to avoid leaking DOM nodes
  script.onload = () => script.remove();
  (document.documentElement || document.head || document.body).appendChild(
    script
  );
}

try {
  injectInpageScript();
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[Better AllUnited] Failed to inject interceptor.js", e);
}

ready(() => {
  attachCourseMembersButtons();
});
