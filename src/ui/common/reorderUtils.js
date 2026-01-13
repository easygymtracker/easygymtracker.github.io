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

function isTouchLike() {
  return typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(pointer: coarse)").matches;
}

function rowFromPoint(rowSelector, x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest(rowSelector) : null;
}

/**
 * Attach drag-and-drop reorder behavior to a container that renders rows with:
 *   - `rowSelector` (default: ".routineRow[data-index]")
 *   - `data-index` attributes
 *
 * On drop, calls `onReorder(fromIdx, toIdx)`.
 *
 * Mobile support:
 *   - Long-press to enter "reorder mode"
 *   - Drag finger over rows to choose destination
 *   - Calls onReorder ONCE on release
 */
export function attachDragReorder(containerEl, {
  rowSelector = '.routineRow[data-index]',
  onReorder,
  longPressMs = 220,
} = {}) {
  if (!containerEl) return () => { };
  if (typeof onReorder !== 'function') return () => { };

  let dragFromIndex = null;

  function closestFromEventTarget(target, selector) {
    if (!target) return null;
    if (target.nodeType === 1) return target.closest(selector);
    if (target.nodeType === 3) return target.parentElement?.closest(selector) ?? null;
    return null;
  }

  function onDragStart(e) {
    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;

    dragFromIndex = Number(row.getAttribute('data-index'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFromIndex));
    row.style.opacity = '0.7';
  }

  function onDragEnd(e) {
    const row = closestFromEventTarget(e.target, rowSelector);
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

  // -----------------------
  // Mobile long-press reorder (single call)
  // -----------------------
  let pressTimer = null;
  let armed = false;

  let fromIdx = null;       // fixed (start index)
  let pendingToIdx = null;  // tracked during drag

  let startX = 0;
  let startY = 0;

  // allow a little finger drift while long-pressing
  const CANCEL_DRIFT_PX = 18;

  function clearPressTimer() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function preventContextMenu(e) {
    if (!armed) return;
    e.preventDefault();
  }

  function cleanupMobile() {
    clearPressTimer();
    armed = false;
    fromIdx = null;
    pendingToIdx = null;

    containerEl.classList.remove("isReordering");
    containerEl.style.userSelect = "";
    containerEl.style.touchAction = "";
    containerEl.removeEventListener("contextmenu", preventContextMenu);
  }

  function armReorder() {
    armed = true;
    containerEl.classList.add("isReordering");

    // lock down selection + touch gestures while armed
    containerEl.style.userSelect = "none";
    containerEl.style.touchAction = "none";

    // stop iOS long-press menu
    containerEl.addEventListener("contextmenu", preventContextMenu, { passive: false });
  }

  function commitIfNeeded() {
    if (!armed) return;
    if (!Number.isInteger(fromIdx) || !Number.isInteger(pendingToIdx)) return;
    if (fromIdx === pendingToIdx) return;
    onReorder(fromIdx, pendingToIdx);
  }

  // ---- Pointer Events path (preferred when available) ----
  let pointerId = null;

  function onPointerDown(e) {
    if (!isTouchLike()) return;
    if (e.button != null && e.button !== 0) return;

    const row = e.target.closest(rowSelector);
    if (!row) return;

    pointerId = e.pointerId;

    fromIdx = Number(row.getAttribute("data-index"));
    pendingToIdx = fromIdx;

    startX = e.clientX;
    startY = e.clientY;

    armed = false;
    containerEl.style.userSelect = "none";

    clearPressTimer();
    pressTimer = setTimeout(() => {
      armReorder();
      try { row.setPointerCapture(pointerId); } catch { }
    }, longPressMs);
  }

  function onPointerMove(e) {
    if (!isTouchLike()) return;
    if (pointerId == null || e.pointerId !== pointerId) return;

    if (!armed) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > CANCEL_DRIFT_PX || dy > CANCEL_DRIFT_PX) {
        cleanupMobile(); // user is scrolling
        pointerId = null;
      }
      return;
    }

    // armed: prevent scroll and track destination
    e.preventDefault();

    const targetRow = rowFromPoint(rowSelector, e.clientX, e.clientY);
    if (!targetRow) return;

    const toIdx = Number(targetRow.getAttribute("data-index"));
    if (!Number.isInteger(toIdx)) return;

    pendingToIdx = toIdx;
  }

  function onPointerUp(e) {
    if (!isTouchLike()) return;
    if (pointerId == null || e.pointerId !== pointerId) return;

    clearPressTimer();
    commitIfNeeded();
    cleanupMobile();
    pointerId = null;
  }

  function onPointerCancel(e) {
    if (!isTouchLike()) return;
    if (pointerId == null || e.pointerId !== pointerId) return;

    cleanupMobile();
    pointerId = null;
  }

  // Use passive:false on down so browsers don't lock us out of gesture control
  containerEl.addEventListener("pointerdown", onPointerDown, { passive: false });
  containerEl.addEventListener("pointermove", onPointerMove, { passive: false });
  containerEl.addEventListener("pointerup", onPointerUp, { passive: true });
  containerEl.addEventListener("pointercancel", onPointerCancel, { passive: true });

  // ---- Touch Events fallback (for mobile Safari quirks / older browsers) ----
  function onTouchStart(e) {
    if (!isTouchLike()) return;
    if (!e.touches || e.touches.length !== 1) return;

    const row = e.target.closest(rowSelector);
    if (!row) return;

    const t0 = e.touches[0];
    startX = t0.clientX;
    startY = t0.clientY;

    fromIdx = Number(row.getAttribute("data-index"));
    pendingToIdx = fromIdx;

    armed = false;
    containerEl.style.userSelect = "none";

    clearPressTimer();
    pressTimer = setTimeout(() => {
      armReorder();
    }, longPressMs);
  }

  function onTouchMove(e) {
    if (!isTouchLike()) return;
    if (!e.touches || e.touches.length !== 1) return;

    const t0 = e.touches[0];

    if (!armed) {
      const dx = Math.abs(t0.clientX - startX);
      const dy = Math.abs(t0.clientY - startY);
      if (dx > CANCEL_DRIFT_PX || dy > CANCEL_DRIFT_PX) cleanupMobile();
      return;
    }

    // armed: prevent scroll and track destination
    e.preventDefault();

    const targetRow = rowFromPoint(rowSelector, t0.clientX, t0.clientY);
    if (!targetRow) return;

    const toIdx = Number(targetRow.getAttribute("data-index"));
    if (!Number.isInteger(toIdx)) return;

    pendingToIdx = toIdx;
  }

  function onTouchEnd() {
    clearPressTimer();
    commitIfNeeded();
    cleanupMobile();
  }

  function onTouchCancel() {
    cleanupMobile();
  }

  containerEl.addEventListener("touchstart", onTouchStart, { passive: true });
  containerEl.addEventListener("touchmove", onTouchMove, { passive: false });
  containerEl.addEventListener("touchend", onTouchEnd, { passive: true });
  containerEl.addEventListener("touchcancel", onTouchCancel, { passive: true });

  return () => {
    containerEl.removeEventListener('dragstart', onDragStart);
    containerEl.removeEventListener('dragend', onDragEnd);
    containerEl.removeEventListener('dragover', onDragOver);
    containerEl.removeEventListener('drop', onDrop);

    containerEl.removeEventListener("pointerdown", onPointerDown);
    containerEl.removeEventListener("pointermove", onPointerMove);
    containerEl.removeEventListener("pointerup", onPointerUp);
    containerEl.removeEventListener("pointercancel", onPointerCancel);

    containerEl.removeEventListener("touchstart", onTouchStart);
    containerEl.removeEventListener("touchmove", onTouchMove);
    containerEl.removeEventListener("touchend", onTouchEnd);
    containerEl.removeEventListener("touchcancel", onTouchCancel);

    cleanupMobile();
  };
}