import type { ImportReport, ImportOptions } from '../types';
import { findContactForName } from './search';
import { sleep } from '../utils/dom';

const clickAddRow = async (): Promise<void> => {
  const btns = Array.from(document.querySelectorAll('input')).filter(
    (el) => el.type === 'button' && el.value && el.value.trim() === 'Voeg toe'
  );

  let addBtn: HTMLInputElement | null = null;

  if (btns.length === 1) {
    addBtn = btns[0];
  } else {
    const participantsSection = document
      .querySelector(
        '[data-row-name-prefix="course[_subforms_][coursemembers]"]'
      )
      ?.closest('[class], section, div');

    addBtn =
      (btns.find((b) => participantsSection?.contains(b)) as HTMLInputElement) ||
      btns[0] ||
      null;
  }

  if (!addBtn) throw new Error('Could not find the "Voeg toe" button.');

  addBtn.click();
  await sleep(150);
};

const fillLatestContactId = async (contactId: string): Promise<void> => {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input.find-field[name*="course[_subforms_][coursemembers]"][name$="[contactid]"]'
    )
  );

  if (!inputs.length) throw new Error('No contactid inputs found.');

  const target =
    inputs
      .filter((i) => !i.value || i.value.trim() === '')
      .sort((a, b) => {
        const m = (el: HTMLInputElement) =>
          el.name.match(/\[coursemembers]\[(\d+)]\[contactid]/);
        const idxA = m(a) ? parseInt(m(a)![1], 10) : -1;
        const idxB = m(b) ? parseInt(m(b)![1], 10) : -1;
        return idxA - idxB;
      })[0] || inputs[inputs.length - 1];

  target.focus();
  target.value = String(contactId);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  target.blur();
  await sleep(100);
};

export const importCourseMembers = async (
  names: string[],
  options: ImportOptions = {}
): Promise<ImportReport> => {
  const { onProgress } = options;
  const signal = options.signal ?? null;
  const notFound: ImportReport['notFound'] = [];
  const ambiguous: ImportReport['ambiguous'] = [];
  const successes: ImportReport['successes'] = [];
  const total = names.length;
  let completed = 0;

  for (let idx = 0; idx < names.length; idx++) {
    const fullName = names[idx];
    if (signal?.aborted) {
      onProgress?.({ step: 'cancel', index: idx, total, completed, name: fullName });
      return { successes, notFound, ambiguous, aborted: true };
    }

    onProgress?.({
      step: 'start',
      index: idx,
      total,
      completed,
      name: fullName,
    });

    let outcome: 'found' | 'notFound' | 'ambiguous' | 'error' = 'error';

    try {
      const result = await findContactForName(fullName, signal);

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      switch (result.status) {
        case 'found':
          await clickAddRow();
          await fillLatestContactId(result.data!.value);
          successes.push({
            name: fullName,
            contactId: String(result.data!.value),
            label: result.data!.label || '',
          });
          outcome = 'found';
          break;

        case 'notFound':
          notFound.push({ name: fullName, reason: result.reason || '' });
          outcome = 'notFound';
          break;

        case 'ambiguous':
          ambiguous.push({
            name: fullName,
            reason: result.reason || '',
            candidates: result.candidates || [],
          });
          outcome = 'ambiguous';
          break;
      }
    } catch (err) {
      // If aborted, break and return partial report
      if ((err as any)?.name === 'AbortError' || (err as DOMException)?.name === 'AbortError') {
        onProgress?.({ step: 'cancel', index: idx, total, completed, name: fullName });
        return { successes, notFound, ambiguous, aborted: true };
      }

      notFound.push({
        name: fullName,
        reason: (err as Error).message || String(err),
      });
      outcome = 'error';
    } finally {
      completed += 1;
      onProgress?.({
        step: 'complete',
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