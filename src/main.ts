import { createInputButton } from './ui/components';
import { openExcelImportDialog } from './ui/excel-import';
import { openPasteImportDialog } from './ui/paste-import';
import { onElementAvailable, ready } from './utils/dom';

const attachCourseMembersButtons = (): void => {
  const selector =
    '[data-row-name-prefix="course[_subforms_][coursemembers]"]';
  const idExcel = 'import-course-members-excel';
  const idPaste = 'import-course-members-paste';

  onElementAvailable(selector, () => {
    const targetContainers = document.getElementsByClassName("subform-table__new-row");
    if (targetContainers.length === 0) return;
    const targetContainer = targetContainers[0];

    if (!targetContainer.querySelector(`#${idExcel}`)) {
      const button1 = createInputButton({
        id: idExcel,
        text: 'Import from Excel',
        onClick: openExcelImportDialog,
      });
      targetContainer.appendChild(button1);
    }

    if (!targetContainer.querySelector(`#${idPaste}`)) {
      const button2 = createInputButton({
        id: idPaste,
        text: 'Import from pasted list',
        onClick: openPasteImportDialog,
      });
      targetContainer.appendChild(button2);
    }
  });
};

ready(() => {
  attachCourseMembersButtons();
});