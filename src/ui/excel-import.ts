import type { PriceCodeOption, PriceCodeResolverContext } from '../types';
import * as XLSX from 'xlsx';
import { makeEl } from '../utils/dom';
import { importCourseMembers, getPriceCodeOptions } from '../services/importer';
import { showOverlayModal, showProgressModal, showReportModal } from './modals';
import { createButton } from './components';
import { t } from '../i18n';

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

interface ExtractedEntry {
  name: string;
  priceSource?: string;
}

export const openExcelImportDialog = async (): Promise<void> => {
  const overlayRef = showOverlayModal({
    title: t('import_from_excel'),
    bodyNodes: [],
    footerNodes: [],
  });

  const { overlay, modal } = overlayRef;

  const fileRow = makeEl('div', {}, { margin: '10px 0' }, [
  makeEl('label', { for: 'excelFile', text: t('select_file') }, {}, []),
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
  makeEl('label', { for: 'sheetSelect', text: t('sheet') }),
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
  makeEl('label', { for: 'colInput', text: t('column_letter') }),
      makeEl('input', {
        id: 'colInput',
        type: 'text',
        value: 'A',
        placeholder: 'e.g. A',
        size: '3',
      }),
  makeEl('label', { for: 'rowFrom', text: t('rows_from') }),
      makeEl('input', {
        id: 'rowFrom',
        type: 'number',
        min: '1',
        value: '2',
      }),
  makeEl('label', { for: 'rowTo', text: t('to') }),
      makeEl('input', { id: 'rowTo', type: 'number', min: '1', value: '100' }),
  makeEl('label', { for: 'hasHeader', text: t('header_row_skip') }),
      makeEl('input', { id: 'hasHeader', type: 'checkbox', checked: 'true' }),
    ]
  );

  const previewTitle = makeEl(
    'div',
    { text: t('preview_first_25') },
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
    text: t('cancel'),
    onClick: () => overlay.remove(),
    styles: { background: '#6b7280', border: '1px solid #6b7280' },
  });

  const importBtn = createButton({
    id: 'excel-import',
    text: t('start_import'),
    onClick: () => {},
    styles: { background: '#0ea5a5', border: '1px solid #0ea5a5' },
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(importBtn);

  const priceCodeContainer = makeEl(
    'div',
    {},
    {
      display: 'none',
      margin: '10px 0',
      padding: '12px',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      background: '#f9fafb',
      flexDirection: 'column',
      gap: '8px',
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
  let priceMode: 'single' | 'map' = 'single';
  let priceCodeSelectSingle: HTMLSelectElement | null = null;
  let priceCodeColumnInput: HTMLInputElement | null = null;
  let priceCodeMappingContainer: HTMLElement | null = null;
  let priceCodeMappingWrapper: HTMLElement | null = null;
  let priceCodeNotice: HTMLElement | null = null;
  let priceCodeMappingState: Map<string, string> = new Map();

  const normalizeNameKey = (value: string): string =>
    String(value || '')
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

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

  const getNameColumnLetter = (): string => {
    const value = (rangeRow.querySelector('#colInput') as HTMLInputElement).value || 'A';
    const cleaned = value.toUpperCase().replace(/[^A-Z]/g, '');
    return cleaned || 'A';
  };

  const getRowStart = (): number =>
    parseInt((rangeRow.querySelector('#rowFrom') as HTMLInputElement).value || '1', 10);

  const getRowEnd = (): number =>
    parseInt((rangeRow.querySelector('#rowTo') as HTMLInputElement).value || '1', 10);

  const hasHeaderRow = (): boolean =>
    !!(rangeRow.querySelector('#hasHeader') as HTMLInputElement).checked;

  const getPriceColumnLetter = (): string =>
    priceCodeColumnInput
      ? priceCodeColumnInput.value.trim().toUpperCase().replace(/[^A-Z]/g, '')
      : '';

  const extractEntriesFromRange = (): ExtractedEntry[] => {
    if (!table.length) return [];

    const colLetter = getNameColumnLetter();
    const colIndex = colToIndex(colLetter);
    const startRow = Math.max(1, getRowStart()) - 1;
    const endRow = Math.max(startRow, getRowEnd() - 1);
    const skipHeader = hasHeaderRow();

    const priceLetter = getPriceColumnLetter();
    const priceIndex = priceLetter ? colToIndex(priceLetter) : null;

    const entries: ExtractedEntry[] = [];

    for (let r = startRow; r <= endRow && r < table.length; r++) {
      if (skipHeader && r === startRow) continue;

      const row = (table[r] || []) as unknown[];
      const cell = row[colIndex];
      if (cell == null) continue;

      const priceValue =
        priceIndex != null ? String(row[priceIndex] ?? '').trim() : undefined;

      const items = String(cell)
        .split(/\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const item of items) {
        entries.push({
          name: item,
          priceSource: priceIndex != null ? priceValue : undefined,
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
        priceSource: entry.priceSource?.trim() || undefined,
      });
    }

    return unique;
  };

  const getUniquePriceValues = (): string[] => {
    const values = rawEntries.map((entry) => (entry.priceSource ?? '').trim());
    return Array.from(new Set(values));
  };

  const requiresPriceCode = (): boolean => !!priceCodeOptions?.length;

  const updateImportButtonState = () => {
    const hasNames = uniqueEntries.length > 0;
    let priceReady = true;

    if (requiresPriceCode()) {
      if (priceMode === 'single') {
        priceReady = !!priceCodeSelectSingle?.value;
      } else {
        const colLetter = getPriceColumnLetter();
        const uniqueValues = getUniquePriceValues();
        priceReady =
          !!colLetter &&
          uniqueValues.length > 0 &&
          uniqueValues.every((value) => !!priceCodeMappingState.get(value));
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
      priceCodeNotice.textContent = '';
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    if (priceMode !== 'map') {
      priceCodeNotice.textContent = '';
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    const colLetter = getPriceColumnLetter();
    if (!colLetter) {
    priceCodeNotice.textContent = t('enter_pricecode_column_letter');
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

    const uniqueValues = getUniquePriceValues();
    if (!uniqueValues.length) {
  priceCodeNotice.textContent = t('no_values_in_column');
      priceCodeMappingState.clear();
      updateImportButtonState();
      return;
    }

  priceCodeNotice.textContent = t('map_each_value');

    const nextState = new Map<string, string>();
    uniqueValues.forEach((value) => {
      const existing = priceCodeMappingState.get(value) ?? '';
      nextState.set(value, existing);
    });
    priceCodeMappingState = nextState;

    uniqueValues.forEach((value) => {
      const select = makeEl(
        'select',
        {},
        {
          flex: '1',
          padding: '6px',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
        },
        [
          makeEl('option', { value: '', text: t('selecteer_prijscode') }),
          ...(priceCodeOptions || []).map((opt) =>
            makeEl('option', {
              value: opt.value,
              text: opt.label || opt.value,
            })
          ),
        ]
      ) as HTMLSelectElement;

      select.value = priceCodeMappingState.get(value) ?? '';
      select.addEventListener('change', () => {
        priceCodeMappingState.set(value, select.value);
        updateImportButtonState();
      });

      const labelText = value || '(leeg)';
      const row = makeEl(
        'div',
        {},
        { display: 'flex', alignItems: 'center', gap: '8px' },
        [
          makeEl(
            'span',
            { text: labelText },
            {
              minWidth: '120px',
              fontFamily: 'monospace',
              color: value ? '#111827' : '#6b7280',
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
        ? sample.join('\n')
        : '(no names detected in the selected range)';
    } catch {
      rawEntries = [];
      uniqueEntries = [];
      previewBox.textContent = '(error while reading the selected range)';
    }

    updateImportButtonState();

    if (priceMode === 'map') {
      refreshPriceCodeMappingList();
    }
  };

  const setupPriceCodeUI = (options: PriceCodeOption[]): void => {
    if (!options.length || priceCodeOptions) return;

    priceCodeOptions = options;
    priceCodeContainer.style.display = 'flex';
    priceCodeContainer.replaceChildren();

    const header = makeEl('div', { text: 'Prijscode' }, { fontWeight: '600' });

    const modeSelect = makeEl(
      'select',
      { id: 'priceModeSelect' },
      { padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db' },
      [
        makeEl('option', {
          value: 'single',
          text: 'Gebruik één prijscode voor alle deelnemers',
        }),
        makeEl('option', {
          value: 'map',
          text: 'Koppel kolomwaarden aan prijscodes',
        }),
      ]
    ) as HTMLSelectElement;

    const modeRow = makeEl(
      'div',
      {},
      { display: 'flex', flexDirection: 'column', gap: '4px' },
      [
        makeEl('label', { for: 'priceModeSelect', text: 'Prijscode modus:' }),
        modeSelect,
      ]
    );

    priceCodeSelectSingle = makeEl(
      'select',
      { id: 'priceCodeSingle' },
      { padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db' },
      [
        makeEl('option', { value: '', text: 'Selecteer prijscode' }),
        ...options.map((opt) =>
          makeEl('option', { value: opt.value, text: opt.label || opt.value })
        ),
      ]
    ) as HTMLSelectElement;

    priceCodeSelectSingle.addEventListener('change', updateImportButtonState);

    const singleRow = makeEl(
      'div',
      {},
      { display: 'flex', flexDirection: 'column', gap: '4px' },
      [
        makeEl('label', { for: 'priceCodeSingle', text: 'Prijscode:' }),
        priceCodeSelectSingle,
      ]
    );

    priceCodeColumnInput = makeEl(
      'input',
      {
        id: 'priceCodeColumn',
        type: 'text',
        placeholder: 'bijv. B',
        size: '3',
      },
      {
        padding: '6px',
        borderRadius: '6px',
        border: '1px solid #d1d5db',
        width: '80px',
      }
    ) as HTMLInputElement;

    priceCodeColumnInput.addEventListener('input', () => {
      if (!priceCodeColumnInput) return;
      priceCodeColumnInput.value = priceCodeColumnInput.value
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
      refreshPreview();
      refreshPriceCodeMappingList();
    });

    priceCodeNotice = makeEl(
      'div',
      {},
      { color: '#6b7280', fontSize: '12px' }
    );

    priceCodeMappingContainer = makeEl(
      'div',
      {},
      { display: 'flex', flexDirection: 'column', gap: '6px' }
    );

    priceCodeMappingWrapper = makeEl(
      'div',
      {},
      { display: 'none', flexDirection: 'column', gap: '8px' },
      [
        makeEl(
          'div',
          {},
          { display: 'flex', gap: '8px', alignItems: 'center' },
          [
            makeEl('label', { for: 'priceCodeColumn', text: t('column_for_pricecode') }),
            priceCodeColumnInput,
          ]
        ),
        priceCodeNotice,
        priceCodeMappingContainer,
      ]
    );

    const syncVisibility = () => {
      singleRow.style.display = priceMode === 'single' ? 'flex' : 'none';
      if (priceCodeMappingWrapper) {
        priceCodeMappingWrapper.style.display = priceMode === 'map' ? 'flex' : 'none';
      }
      refreshPriceCodeMappingList();
      updateImportButtonState();
    };

    modeSelect.addEventListener('change', () => {
      priceMode = (modeSelect.value as 'single' | 'map') || 'single';
      syncVisibility();
    });

    priceCodeContainer.appendChild(header);
    priceCodeContainer.appendChild(modeRow);
    priceCodeContainer.appendChild(singleRow);
    priceCodeContainer.appendChild(priceCodeMappingWrapper);

    priceMode = 'single';
    syncVisibility();
  };

  updateImportButtonState();

  void (async () => {
    try {
      const options = await getPriceCodeOptions();
      if (!options || !options.length) return;
      setupPriceCodeUI(options);
      refreshPriceCodeMappingList();
      updateImportButtonState();
    } catch (err) {
      console.warn(t('failed_load_pricecodes', { msg: String(err) }));
    }
  })();

  (fileRow.querySelector('#excelFile') as HTMLInputElement).addEventListener(
    'change',
    async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

  importBtn.disabled = true;
  importBtn.textContent = t('reading_file');

      try {
        await readFile(file);
        importBtn.textContent = t('start_import');
        refreshPreview();
      } catch (err) {
        importBtn.textContent = t('start_import');
        alert(t('failed_read_file', { msg: (err as Error).message || String(err) }));
      } finally {
        updateImportButtonState();
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
    refreshPreview();

    const names = uniqueEntries.map((entry) => entry.name);

    if (!names.length) {
      alert(t('no_names_selected_range'));
      return;
    }

    if (requiresPriceCode()) {
      if (priceMode === 'single') {
        if (!priceCodeSelectSingle?.value) {
          alert(t('select_pricecode_for_all'));
          return;
        }
      } else {
        const colLetter = getPriceColumnLetter();
        if (!colLetter) {
          alert(t('give_pricecode_column'));
          return;
        }

        const uniqueValues = getUniquePriceValues();
        if (!uniqueValues.length) {
          alert(t('no_values_in_pricecode_column'));
          return;
        }

        const missing = uniqueValues.filter((value) => !priceCodeMappingState.get(value));
        if (missing.length) {
          alert(t('make_mapping'));
          return;
        }
      }
    }

    let progress: ReturnType<typeof showProgressModal> | null = null;
    const controller = new AbortController();

    try {
  importBtn.disabled = true;
  importBtn.textContent = t('importing_count', { count: names.length });

  progress = showProgressModal(names.length, () => controller.abort());

      const priceCodeResolver = requiresPriceCode()
        ? priceMode === 'single'
          ? () => priceCodeSelectSingle!.value
          : ({ index }: PriceCodeResolverContext) => {
              const entry = uniqueEntries[index];
              if (!entry) return null;
              const key = (entry.priceSource ?? '').trim();
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
      if ((e as DOMException)?.name === 'AbortError') return;
      alert(t('import_failed', { msg: (e as Error).message || String(e) }));
    } finally {
      if (modal.isConnected) {
        importBtn.disabled = false;
        importBtn.textContent = t('start_import');
        updateImportButtonState();
      }
    }
  };
};