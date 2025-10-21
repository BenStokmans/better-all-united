import { ready, onElementAvailable } from './utils/dom';
import { createButton } from './ui/components';
import { openExcelImportDialog } from './ui/excel-import';
import { openPasteImportDialog } from './ui/paste-import';

const attachCourseMembersButtons = (): void => {
  const selector =
    '[data-row-name-prefix="course[_subforms_][coursemembers]"]';
  const idExcel = 'import-course-members-excel';
  const idPaste = 'import-course-members-paste';

  onElementAvailable(selector, (container) => {
    if (!container.querySelector(`#${idExcel}`)) {
      const button1 = createButton({
        id: idExcel,
        text: 'Import from Excel',
        onClick: openExcelImportDialog,
        styles: {
          marginTop: '12px',
          background: '#6366f1',
          border: '1px solid #6366f1',
        },
      });
      container.appendChild(button1);
    }

    if (!container.querySelector(`#${idPaste}`)) {
      const button2 = createButton({
        id: idPaste,
        text: 'Import from pasted list',
        onClick: openPasteImportDialog,
        styles: {
          marginTop: '12px',
          background: '#10b981',
          border: '1px solid #10b981',
        },
      });
      container.appendChild(button2);
    }
  });
};

ready(() => {
  attachCourseMembersButtons();
});