import { t } from "./i18n";
import { createAnchorButton, createInputButton, createListItem, createToolbarCheckbox } from "./ui/components";
import { openExcelImportDialog } from "./ui/excel-import";
import { openPasteImportDialog } from "./ui/paste-import";
import { openRebookDialog } from "./ui/rebook";
import { onElementAvailable, onElementCreated, ready } from "./utils/dom";
import { getSessionId } from "./utils/session";

let fastSearchEnabled = true;
window.addEventListener("better-all-united-fast-search-state", (event: any) => {
  fastSearchEnabled = event.detail.enabled;
});

const attachFastSearchButtons = (): void => {
  // iframe with id framed-frontend-21000004
  const selector = 'div.dx-toolbar-items-container';

  onElementCreated(selector, () => {
    const targetContainers = document.getElementsByClassName(
      "dx-toolbar-after"
    );
    if (targetContainers.length === 0) return;
    const targetContainer = targetContainers[0];

    const checkbox = createToolbarCheckbox({
      id: "fast-search-contacts",
      text: t("fast_search"),
      title: "",
      checked: fastSearchEnabled,
      onChange: (e) => {
        const enabled = (e.target as HTMLInputElement).checked;
        window.dispatchEvent(
          new CustomEvent("better-all-united-fast-search-state", {
            detail: { enabled },
          })
        );
      },
    });

    targetContainer.appendChild(checkbox);
  });
};


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

const attachRebookButton = (): void => {
  const selector = 'form#form2118';
  onElementAvailable(selector, () => {
    const targetContainer = document.querySelector("div.tmenuLeft > ul");
    if (!targetContainer) return;

    const button = createAnchorButton({
      id: "rebook-transaction",
      text: t("rebook_transaction"),
      onClick: () => {
        openRebookDialog();
      },
    });

    const listItem = createListItem([button]);

    targetContainer.appendChild(listItem);
  });
}


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
  attachFastSearchButtons();
  attachRebookButton();
});

// If we can determine a session id here, broadcast the current fast-search state to all iframes
try {
  const sessionId = getSessionId();
  if (sessionId) {
    // Always broadcast session id so inpage scripts can use it even if the
    // fast-search checkbox hasn't been created yet.
    const sidEvt = new CustomEvent("better-all-united-sessionid", { detail: { sessionId } });
    window.dispatchEvent(sidEvt);
    const frames = document.getElementsByTagName("iframe");
    for (const f of Array.from(frames)) {
      try { f.contentWindow?.dispatchEvent(sidEvt); } catch (e) { /* ignore */ }
    }
  }
} catch (e) {
  console.error("[Better AllUnited] Error broadcasting fast-search-state to iframes", e);
}
