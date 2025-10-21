import * as XLSX from 'xlsx';
import { makeEl } from '../utils/dom';
import { importCourseMembers } from '../services/importer';
import { showOverlayModal, showProgressModal, showReportModal } from './modals';
import { createButton } from './components';

const colToIndex = (col: string): number => {
  const c = String(col || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!c) return 0;

  let n = 0;
  for (let i = 0; i < c.length; i++) {
    n = n * 26 + (c.charCodeAt(i) - 64);
  }
  return n - 1;
};

const parseA1Ref = (ref: string): { firstRow: number; lastRow: number } => {
  const m = String(ref || '').match(/^[A-Z]+(\d+):[A-Z]+(\d+)$/i);
  if (!m) return { firstRow: 1, lastRow: 100 };
  return { firstRow: parseInt(m[1], 10), lastRow: parseInt(m[2], 10) };
};

export const openExcelImportDialog = async (): Promise<void> => {
  const overlayRef = showOverlayModal({
    title: 'Import members from Excel',
    bodyNodes: [],
    footerNodes: [],
  });

  const { overlay, modal } = overlayRef;

  const fileRow = makeEl('div', {}, { margin: '10px 0' }, [
    makeEl('label', { for: 'excelFile', text: 'Select file: ' }, {}, []),
    makeEl('input', {
      id: 'excelFile',
      type: 'file',
      accept:
        '.xlsx, .xls, .xlsb, .xlsm, .ods, .csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  ]);

  const sheetRow = makeEl(
    'div',
    {},
    { margin: '10px 0', display: 'none' },
    [
      makeEl('label', { for: 'sheetSelect', text: 'Sheet: ' }),
      makeEl('select', { id: 'sheetSelect' }, {}, []),
    ]
  );

  const rangeRow = makeEl(
    'div',
    {},
    {
      margin: '10px 0',
      display: 'none',
      gap: '8px',
      alignItems: 'center',
    },
    [
      makeEl('label', { for: 'colInput', text: 'Column letter:' }),
      makeEl('input', {
        id: 'colInput',
        type: 'text',
        value: 'A',
        placeholder: 'e.g. A',
        size: '3',
      }),
      makeEl('label', { for: 'rowFrom', text: 'Rows from:' }),
      makeEl('input', {
        id: 'rowFrom',
        type: 'number',
        min: '1',
        value: '2',
      }),
      makeEl('label', { for: 'rowTo', text: 'to:' }),
      makeEl('input', { id: 'rowTo', type: 'number', min: '1', value: '100' }),
      makeEl('label', { for: 'hasHeader', text: 'Header row (skip first)?' }),
      makeEl('input', { id: 'hasHeader', type: 'checkbox', checked: 'true' }),
    ]
  );

  const previewTitle = makeEl(
    'div',
    { text: 'Preview (first 25 names):' },
    { margin: '6px 0', display: 'none', fontWeight: '600' }
  );

  const previewBox = makeEl(
    'pre',
    {},
    {
      display: 'none',
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      padding: '8px',
      borderRadius: '6px',
      maxHeight: '180px',
      overflow: 'auto',
      fontSize: '12px',
      whiteSpace: 'pre-wrap',
    }
  );

  const actions = makeEl(
    'div',
    {},
    { marginTop: '12px', display: 'flex', gap: '8px' },
    []
  );

  const cancelBtn = createButton({
    id: 'excel-cancel',
    text: 'Cancel',
    onClick: () => overlay.remove(),
    styles: { background: '#6b7280', border: '1px solid #6b7280' },
  });

  const importBtn = createButton({
    id: 'excel-import',
    text: 'Start import',
    onClick: () => {},
    styles: { background: '#0ea5a5', border: '1px solid #0ea5a5' },
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(importBtn);

  modal.appendChild(fileRow);
  modal.appendChild(sheetRow);
  modal.appendChild(rangeRow);
  modal.appendChild(previewTitle);
  modal.appendChild(previewBox);
  modal.appendChild(actions);

  let workbook: XLSX.WorkBook | null = null;
  let sheetNames: string[] = [];
  let table: unknown[][] = [];

  const readFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array' });
    sheetNames = workbook.SheetNames || [];

    const select = sheetRow.querySelector('#sheetSelect') as HTMLSelectElement;
    select.innerHTML = '';

    sheetNames.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      select.appendChild(opt);
    });

    sheetRow.style.display = sheetNames.length ? '' : 'none';

    if (sheetNames.length) {
      loadSheet(sheetNames[0]);
    }
  };

  const loadSheet = (name: string) => {
    if (!workbook) return;

    const ws = workbook.Sheets[name];
    table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

    rangeRow.style.display = '';
    previewTitle.style.display = '';
    previewBox.style.display = '';

    if (ws['!ref']) {
      const { firstRow, lastRow } = parseA1Ref(ws['!ref']);
      const hasHeaderEl = rangeRow.querySelector(
        '#hasHeader'
      ) as HTMLInputElement;
      const rowFromEl = rangeRow.querySelector('#rowFrom') as HTMLInputElement;
      const rowToEl = rangeRow.querySelector('#rowTo') as HTMLInputElement;

      const hasHeaderChecked = !!hasHeaderEl.checked;
      rowFromEl.value = String(
        hasHeaderChecked ? Math.max(2, firstRow) : firstRow
      );
      rowToEl.value = String(lastRow);
    }

    refreshPreview();
  };

  const extractNamesFromRange = (): string[] => {
    const col =
      (rangeRow.querySelector('#colInput') as HTMLInputElement).value || 'A';
    const rowFrom = parseInt(
      (rangeRow.querySelector('#rowFrom') as HTMLInputElement).value || '1',
      10
    );
    const rowTo = parseInt(
      (rangeRow.querySelector('#rowTo') as HTMLInputElement).value || '1',
      10
    );
    const hasHeader = !!(
      rangeRow.querySelector('#hasHeader') as HTMLInputElement
    ).checked;

    const cIdx = colToIndex(col);
    const start = Math.max(1, rowFrom) - 1;
    const end = Math.max(start, rowTo - 1);
    const names: string[] = [];

    for (let r = start; r <= end && r < table.length; r++) {
      if (hasHeader && r === start) continue;

      const row = (table[r] || []) as unknown[];
      const cell = row[cIdx];
      if (cell == null) continue;

      const items = String(cell)
        .split(/\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      names.push(...items);
    }

    const seen = new Set<string>();
    const unique: string[] = [];

    for (const n of names) {
      const key = String(n || '').normalize('NFC').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(n);
    }

    return unique;
  };

  const refreshPreview = () => {
    const names = extractNamesFromRange();
    const sample = names.slice(0, 25);
    previewBox.textContent = sample.length
      ? sample.join('\n')
      : '(no names detected in the selected range)';
  };

  (fileRow.querySelector('#excelFile') as HTMLInputElement).addEventListener(
    'change',
    async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      importBtn.disabled = true;
      importBtn.textContent = 'Reading file...';

      try {
        await readFile(file);
        importBtn.textContent = 'Start import';
        importBtn.disabled = false;
      } catch (err) {
        importBtn.textContent = 'Start import';
        alert(`Failed to read file: ${(err as Error).message || err}`);
      }
    }
  );

  (sheetRow.querySelector('#sheetSelect') as HTMLSelectElement).addEventListener(
    'change',
    (e) => {
      loadSheet((e.target as HTMLSelectElement).value);
    }
  );

  rangeRow.addEventListener('input', () => {
    try {
      refreshPreview();
    } catch {
      // ignore preview errors
    }
  });

  importBtn.onclick = async () => {
    let progress: ReturnType<typeof showProgressModal> | null = null;
    const controller = new AbortController();

    try {
      const names = extractNamesFromRange();

      if (!names.length) {
        alert('No names found in the selected range.');
        return;
      }

      importBtn.disabled = true;
      importBtn.textContent = `Importing ${names.length}...`;

      progress = showProgressModal(names.length, () => controller.abort());

      const report = await importCourseMembers(names, {
        onProgress: progress.update,
        signal: controller.signal,
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
      alert(`Import failed: ${(e as Error).message || e}`);
    } finally {
      if (modal.isConnected) {
        importBtn.disabled = false;
        importBtn.textContent = 'Start import';
      }
    }
  };
};