// ui/common/reorderUtils.js

/**
 * Move one item in an array from index `from` to index `to` (in-place).
 */
export function moveItem(arr, from, to) {
  if (!Array.isArray(arr)) return;
  if (from === to) return;
  if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  const item = arr.splice(from, 1)[0];
  arr.splice(to, 0, item);
}

/**
 * Trigger a short CSS animation by re-adding a class (expects your .moved/.movedOther CSS).
 */
export function flashMoved(el, className, ms = 350) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), ms);
}

/**
 * Attach drag-and-drop reorder behavior to a container that renders rows with:
 *   - `rowSelector` (default: ".routineRow[data-index]")
 *   - `data-index` attributes
 *
 * On drop, calls `onReorder(fromIdx, toIdx)`.
 */
export function attachDragReorder(containerEl, {
  rowSelector = '.routineRow[data-index]',
  onReorder,
} = {}) {
  if (!containerEl) return () => {};
  if (typeof onReorder !== 'function') return () => {};

  let dragFromIndex = null;

  function onDragStart(e) {
    const row = e.target.closest(rowSelector);
    if (!row) return;

    dragFromIndex = Number(row.getAttribute('data-index'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFromIndex));
    row.style.opacity = '0.7';
  }

  function onDragEnd(e) {
    const row = e.target.closest(rowSelector);
    if (row) row.style.opacity = '';
    dragFromIndex = null;
  }

  function onDragOver(e) {
    const row = e.target.closest(rowSelector);
    if (!row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e) {
    const targetRow = e.target.closest(rowSelector);
    if (!targetRow) return;
    e.preventDefault();

    const toIdx = Number(targetRow.getAttribute('data-index'));
    let fromIdx = dragFromIndex;

    if (!Number.isInteger(fromIdx)) {
      fromIdx = Number(e.dataTransfer.getData('text/plain'));
    }

    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return;
    onReorder(fromIdx, toIdx);
  }

  containerEl.addEventListener('dragstart', onDragStart);
  containerEl.addEventListener('dragend', onDragEnd);
  containerEl.addEventListener('dragover', onDragOver);
  containerEl.addEventListener('drop', onDrop);

  return () => {
    containerEl.removeEventListener('dragstart', onDragStart);
    containerEl.removeEventListener('dragend', onDragEnd);
    containerEl.removeEventListener('dragover', onDragOver);
    containerEl.removeEventListener('drop', onDrop);
  };
}