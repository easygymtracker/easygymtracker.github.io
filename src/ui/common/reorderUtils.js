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

function closestFromEventTarget(target, selector) {
  if (!target) return null;
  if (target.nodeType === 1) return target.closest(selector);
  if (target.nodeType === 3) return target.parentElement?.closest(selector) ?? null;
  return null;
}

function getRowByIndex(containerEl, rowSelector, idx) {
  return containerEl.querySelector(`${rowSelector}[data-index="${idx}"]`);
}

/**
 * Creates a floating "ghost" element that follows pointer/cursor.
 */
function createDragGhostFromRow(rowEl) {
  if (!rowEl) return null;

  const rect = rowEl.getBoundingClientRect();
  const ghost = rowEl.cloneNode(true);

  // Keep it visually consistent but "floating"
  ghost.style.position = "fixed";
  ghost.style.left = "0px";
  ghost.style.top = "0px";
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = "0";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "9999";
  ghost.style.boxSizing = "border-box";
  ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  ghost.style.opacity = "0.95";
  ghost.style.filter = "drop-shadow(0 10px 18px rgba(0,0,0,0.25))";
  ghost.style.transition = "transform 0.02s linear";

  document.body.appendChild(ghost);
  return ghost;
}

function applyTakenStyle(rowEl) {
  if (!rowEl) return;
  rowEl.__reorderPrevStyle = {
    opacity: rowEl.style.opacity,
    transform: rowEl.style.transform,
    filter: rowEl.style.filter,
  };
  rowEl.style.opacity = "0.55";
  rowEl.style.transform = "scale(0.995)";
  rowEl.style.filter = "saturate(0.8)";
}

function clearTakenStyle(rowEl) {
  if (!rowEl) return;
  const prev = rowEl.__reorderPrevStyle;
  if (prev) {
    rowEl.style.opacity = prev.opacity ?? "";
    rowEl.style.transform = prev.transform ?? "";
    rowEl.style.filter = prev.filter ?? "";
    delete rowEl.__reorderPrevStyle;
  } else {
    rowEl.style.opacity = "";
    rowEl.style.transform = "";
    rowEl.style.filter = "";
  }
}

function moveGhost(ghostEl, x, y, offsetX, offsetY) {
  if (!ghostEl) return;
  const gx = x - (offsetX || 0);
  const gy = y - (offsetY || 0);
  ghostEl.style.transform = `translate(${gx}px, ${gy}px)`;
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
 *
 * Visual support:
 *   - The dragged item is "taken" from the list (dimmed)
 *   - A ghost clone follows cursor/finger
 */
export function attachDragReorder(containerEl, {
  rowSelector = '.routineRow[data-index]',
  onReorder,
  longPressMs = 220,
} = {}) {
  if (!containerEl) return () => { };
  if (typeof onReorder !== 'function') return () => { };

  // -----------------------
  // Shared ghost state
  // -----------------------
  let ghostEl = null;
  let sourceRowEl = null;
  let offsetX = 0;
  let offsetY = 0;

  function cleanupGhost() {
    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }
    if (sourceRowEl) {
      clearTakenStyle(sourceRowEl);
      sourceRowEl = null;
    }
    offsetX = 0;
    offsetY = 0;
  }

  // -----------------------
  // Desktop HTML5 DnD
  // -----------------------
  let dragFromIndex = null;

  function onDragStart(e) {
    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;

    dragFromIndex = Number(row.getAttribute('data-index'));

    // make the row look "taken"
    sourceRowEl = row;
    applyTakenStyle(sourceRowEl);

    // compute cursor offset inside row
    const rect = row.getBoundingClientRect();
    offsetX = (typeof e.clientX === "number") ? (e.clientX - rect.left) : 12;
    offsetY = (typeof e.clientY === "number") ? (e.clientY - rect.top) : 12;

    // create ghost + place initially
    ghostEl = createDragGhostFromRow(row);
    moveGhost(ghostEl, e.clientX, e.clientY, offsetX, offsetY);

    // keep default DnD behavior, but try to hide the browser drag image
    try {
      const img = new Image();
      img.src =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      e.dataTransfer.setDragImage(img, 0, 0);
    } catch { }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFromIndex));
  }

  function onDragEnd() {
    dragFromIndex = null;
    cleanupGhost();
  }

  function onDragOver(e) {
    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // update ghost position on dragover (works in most browsers)
    if (ghostEl && typeof e.clientX === "number" && typeof e.clientY === "number") {
      moveGhost(ghostEl, e.clientX, e.clientY, offsetX, offsetY);
    }
  }

  // extra: update ghost even when over gaps / container background
  function onDocDragOver(e) {
    if (!ghostEl) return;
    if (typeof e.clientX !== "number" || typeof e.clientY !== "number") return;
    moveGhost(ghostEl, e.clientX, e.clientY, offsetX, offsetY);
  }

  function onDrop(e) {
    const targetRow = closestFromEventTarget(e.target, rowSelector);
    if (!targetRow) return;
    e.preventDefault();

    const toIdx = Number(targetRow.getAttribute('data-index'));
    let fromIdx = dragFromIndex;

    if (!Number.isInteger(fromIdx)) {
      fromIdx = Number(e.dataTransfer.getData('text/plain'));
    }

    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return;

    onReorder(fromIdx, toIdx);
    cleanupGhost();
  }

  containerEl.addEventListener('dragstart', onDragStart);
  containerEl.addEventListener('dragend', onDragEnd);
  containerEl.addEventListener('dragover', onDragOver);
  containerEl.addEventListener('drop', onDrop);
  document.addEventListener('dragover', onDocDragOver);

  // -----------------------
  // Mobile long-press reorder (single call)
  // -----------------------
  let pressTimer = null;
  let armed = false;

  let fromIdx = null;       // fixed (start index)
  let pendingToIdx = null;  // tracked during drag

  let startX = 0;
  let startY = 0;

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

    cleanupGhost();
  }

  function armReorder(startRow) {
    if (armed) return;
    cleanupGhost();

    armed = true;
    containerEl.classList.add("isReordering");

    containerEl.style.userSelect = "none";
    containerEl.style.touchAction = "none";
    containerEl.addEventListener("contextmenu", preventContextMenu, { passive: false });

    sourceRowEl = startRow;
    applyTakenStyle(sourceRowEl);
    ghostEl = createDragGhostFromRow(startRow);
  }

  function commitIfNeeded() {
    if (!armed) return;
    if (!Number.isInteger(fromIdx) || !Number.isInteger(pendingToIdx)) return;
    if (fromIdx === pendingToIdx) return;
    onReorder(fromIdx, pendingToIdx);
  }

  // ---- Pointer Events path ----
  let pointerId = null;

  function onPointerDown(e) {
    if (!isTouchLike()) return;
    if (e.button != null && e.button !== 0) return;

    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;

    pointerId = e.pointerId;

    fromIdx = Number(row.getAttribute("data-index"));
    pendingToIdx = fromIdx;

    startX = e.clientX;
    startY = e.clientY;

    const rect = row.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    armed = false;
    containerEl.style.userSelect = "none";

    clearPressTimer();
    pressTimer = setTimeout(() => {
      clearPressTimer();
      armReorder(row);
      moveGhost(ghostEl, startX, startY, offsetX, offsetY);
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
        cleanupMobile();
        pointerId = null;
      }
      return;
    }

    e.preventDefault();

    // move ghost
    moveGhost(ghostEl, e.clientX, e.clientY, offsetX, offsetY);

    // track destination
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

  containerEl.addEventListener("pointerdown", onPointerDown, { passive: false });
  containerEl.addEventListener("pointermove", onPointerMove, { passive: false });
  containerEl.addEventListener("pointerup", onPointerUp, { passive: true });
  containerEl.addEventListener("pointercancel", onPointerCancel, { passive: true });

  // ---- Touch Events fallback ----
  function onTouchStart(e) {
    if (!isTouchLike()) return;
    if (!e.touches || e.touches.length !== 1) return;

    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;

    const t0 = e.touches[0];
    startX = t0.clientX;
    startY = t0.clientY;

    fromIdx = Number(row.getAttribute("data-index"));
    pendingToIdx = fromIdx;

    const rect = row.getBoundingClientRect();
    offsetX = t0.clientX - rect.left;
    offsetY = t0.clientY - rect.top;

    armed = false;
    containerEl.style.userSelect = "none";

    clearPressTimer();
    pressTimer = setTimeout(() => {
      clearPressTimer();
      armReorder(row);
      moveGhost(ghostEl, startX, startY, offsetX, offsetY);
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

    e.preventDefault();

    // move ghost
    moveGhost(ghostEl, t0.clientX, t0.clientY, offsetX, offsetY);

    // track destination
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
    document.removeEventListener('dragover', onDocDragOver);

    containerEl.removeEventListener("pointerdown", onPointerDown);
    containerEl.removeEventListener("pointermove", onPointerMove);
    containerEl.removeEventListener("pointerup", onPointerUp);
    containerEl.removeEventListener("pointercancel", onPointerCancel);

    containerEl.removeEventListener("touchstart", onTouchStart);
    containerEl.removeEventListener("touchmove", onTouchMove);
    containerEl.removeEventListener("touchend", onTouchEnd);
    containerEl.removeEventListener("touchcancel", onTouchCancel);

    cleanupMobile();
    cleanupGhost();
  };
}