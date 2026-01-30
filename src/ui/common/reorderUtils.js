// ui/common/reorderUtils.js

/**
 * Move one item in an array from index from to index to (in-place).
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
  return (
    typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function rowFromPoint(rowSelector, x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest(rowSelector) : null;
}

function closestFromEventTarget(target, selector) {
  if (!target) return null;
  if (target.nodeType === 1) return target.closest(selector);
  if (target.nodeType === 3)
    return target.parentElement?.closest(selector) ?? null;
  return null;
}

/**
 * Creates a floating "ghost" element that follows pointer/cursor.
 */
function createDragGhostFromRow(rowEl) {
  if (!rowEl) return null;

  const rect = rowEl.getBoundingClientRect();
  const ghost = rowEl.cloneNode(true);

  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = "0px";
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = "0";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "9999";
  ghost.style.boxSizing = "border-box";
  ghost.style.transform = `translateY(${rect.top}px)`;
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

function moveGhost(ghostEl, y, offsetY) {
  if (!ghostEl) return;
  ghostEl.style.transform = `translateY(${y - offsetY}px)`;
}

/**
 * Attach drag-and-drop reorder behavior
 */
export function attachDragReorder(
  containerEl,
  { rowSelector = ".routineRow[data-index]", onReorder, longPressMs = 220 } = {}
) {
  if (!containerEl) return () => { };
  if (typeof onReorder !== "function") return () => { };

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

  function ensureSingleGhost(rowEl) {
    cleanupGhost(); // 🔒 idempotent guarantee
    ghostEl = createDragGhostFromRow(rowEl);
  }

  // -----------------------
  // Desktop HTML5 DnD
  // -----------------------
  let dragFromIndex = null;

  function onDragStart(e) {
    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;

    dragFromIndex = Number(row.getAttribute("data-index"));

    sourceRowEl = row;
    applyTakenStyle(sourceRowEl);

    const rect = row.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    ensureSingleGhost(row);

    const left = row.getBoundingClientRect().left;
    ghostEl.style.left = `${left}px`;

    moveGhost(ghostEl, e.clientY, offsetY);

    try {
      const img = new Image();
      img.src =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      e.dataTransfer.setDragImage(img, 0, 0);
    } catch { }

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragFromIndex));
  }

  function onDragEnd() {
    dragFromIndex = null;
    cleanupGhost();
  }

  function onDragOver(e) {
    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;
    e.preventDefault();

    if (sourceRowEl && ghostEl) {
      const left = sourceRowEl.getBoundingClientRect().left;
      ghostEl.style.left = `${left}px`;
    }

    moveGhost(ghostEl, e.clientY, offsetY);
  }

  function onDrop(e) {
    const row = closestFromEventTarget(e.target, rowSelector);
    if (!row) return;
    e.preventDefault();

    const toIdx = Number(row.getAttribute("data-index"));
    const fromIdx =
      dragFromIndex ??
      Number(e.dataTransfer.getData("text/plain"));

    if (Number.isInteger(fromIdx) && Number.isInteger(toIdx)) {
      onReorder(fromIdx, toIdx);
    }

    cleanupGhost();
  }

  containerEl.addEventListener("dragstart", onDragStart);
  containerEl.addEventListener("dragend", onDragEnd);
  containerEl.addEventListener("dragover", onDragOver);
  containerEl.addEventListener("drop", onDrop);

  // -----------------------
  // Mobile long-press reorder
  // -----------------------
  let pressTimer = null;
  let armed = false;

  let fromIdx = null;
  let pendingToIdx = null;

  let startX = 0;
  let startY = 0;

  const CANCEL_DRIFT_PX = 18;

  function clearPressTimer() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function cleanupMobile() {
    clearPressTimer();
    armed = false;
    fromIdx = null;
    pendingToIdx = null;

    containerEl.classList.remove("isReordering");
    containerEl.style.userSelect = "";
    containerEl.style.touchAction = "";

    cleanupGhost();
  }

  function armReorder(row) {
    if (armed) return;

    armed = true;

    // 🔒 kill any ghost created by parallel event paths
    cleanupGhost();

    containerEl.classList.add("isReordering");
    containerEl.style.userSelect = "none";
    containerEl.style.touchAction = "none";

    sourceRowEl = row;
    applyTakenStyle(row);

    ensureSingleGhost(row);

    const left = row.getBoundingClientRect().left;
    ghostEl.style.left = `${left}px`;
  }

  function commitIfNeeded() {
    if (
      armed &&
      Number.isInteger(fromIdx) &&
      Number.isInteger(pendingToIdx) &&
      fromIdx !== pendingToIdx
    ) {
      onReorder(fromIdx, pendingToIdx);
    }
  }

  // ---- Pointer Events ----
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

    clearPressTimer();
    pressTimer = setTimeout(() => {
      armReorder(row);

      if (sourceRowEl && ghostEl) {
        const left = sourceRowEl.getBoundingClientRect().left;
        ghostEl.style.left = `${left}px`;
      }

      moveGhost(ghostEl, startY, offsetY);

      try {
        row.setPointerCapture(pointerId);
      } catch { }
    }, longPressMs);
  }

  function onPointerMove(e) {
    if (!armed || e.pointerId !== pointerId) {
      if (pointerId != null && !armed) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > CANCEL_DRIFT_PX || dy > CANCEL_DRIFT_PX) {
          cleanupMobile();
          pointerId = null;
        }
      }
      return;
    }

    e.preventDefault();

    if (sourceRowEl && ghostEl) {
      const left = sourceRowEl.getBoundingClientRect().left;
      ghostEl.style.left = `${left}px`;
    }

    moveGhost(ghostEl, e.clientY, offsetY);

    const row = rowFromPoint(rowSelector, e.clientX, e.clientY);
    if (!row) return;

    const idx = Number(row.getAttribute("data-index"));
    if (Number.isInteger(idx)) pendingToIdx = idx;
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;

    clearPressTimer();
    commitIfNeeded();
    cleanupMobile();
    pointerId = null;
  }

  function onPointerCancel(e) {
    if (e.pointerId !== pointerId) return;
    cleanupMobile();
    pointerId = null;
  }

  containerEl.addEventListener("pointerdown", onPointerDown, { passive: false });
  containerEl.addEventListener("pointermove", onPointerMove, { passive: false });
  containerEl.addEventListener("pointerup", onPointerUp, { passive: true });
  containerEl.addEventListener("pointercancel", onPointerCancel, {
    passive: true,
  });

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

    clearPressTimer();
    pressTimer = setTimeout(() => {
      armReorder(row);

      if (sourceRowEl && ghostEl) {
        const left = sourceRowEl.getBoundingClientRect().left;
        ghostEl.style.left = `${left}px`;
      }

      moveGhost(ghostEl, startY, offsetY);
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

    if (sourceRowEl && ghostEl) {
      const left = sourceRowEl.getBoundingClientRect().left;
      ghostEl.style.left = `${left}px`;
    }

    moveGhost(ghostEl, t0.clientY, offsetY);

    const row = rowFromPoint(rowSelector, t0.clientX, t0.clientY);
    if (!row) return;

    const idx = Number(row.getAttribute("data-index"));
    if (Number.isInteger(idx)) pendingToIdx = idx;
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
    containerEl.removeEventListener("dragstart", onDragStart);
    containerEl.removeEventListener("dragend", onDragEnd);
    containerEl.removeEventListener("dragover", onDragOver);
    containerEl.removeEventListener("drop", onDrop);

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