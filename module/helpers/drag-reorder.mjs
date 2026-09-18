/**
 * Generic drag-to-reorder for a row/grid of items inside one container.
 * Dragging an item live-reflows the DOM on `dragover` (so the layout previews
 * the drop) and `drop` persists the resulting DOM order via `onDrop`.
 *
 * Mirrors the pattern in `inventory-handler.mjs` (`setupDragToReorder`), but
 * generic over container/selectors so it can be reused outside the inventory
 * grid (e.g. HUD Belt slots, the sheet's Equipped Belt list).
 *
 * @param {object} o
 * @param {HTMLElement} o.container - element whose children (matching itemSelector) get reordered
 * @param {string} o.itemSelector - CSS selector for a reorderable, draggable item
 * @param {string} [o.idAttr] - dataset key holding the item's id (default 'itemId')
 * @param {string} [o.boundarySelector] - when the drop target would be "at the end", insert
 *   before the first element matching this selector instead of appending past it
 *   (e.g. empty placeholder slots that must stay last)
 * @param {(orderedIds: string[]) => Promise<void>} o.onDrop - persist the new order
 * @param {AbortSignal} [o.signal]
 * @returns {{ bindItem(el: HTMLElement): void }} call bindItem() for every draggable item element
 */
export function setupDragReorder({ container, itemSelector, idAttr = 'itemId', boundarySelector = null, onDrop, signal }) {
  let dragState = null;

  function bindItem(el) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      dragState = { active: true, draggedEl: el, originalNextSibling: el.nextSibling };
      requestAnimationFrame(() => { if (dragState?.active) el.classList.add('reorder-dragging'); });
    }, { signal });

    el.addEventListener('dragend', () => {
      if (!dragState?.active) return; // drop already cleaned up
      const { draggedEl, originalNextSibling } = dragState;
      draggedEl.classList.remove('reorder-dragging');
      container.insertBefore(draggedEl, originalNextSibling ?? null);
      dragState = null;
    }, { signal });
  }

  container.addEventListener('dragover', (e) => {
    if (!dragState?.active) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const { draggedEl } = dragState;
    const insertBefore = _getInsertionPoint(e.clientX, e.clientY, container, itemSelector, draggedEl);

    if (insertBefore) {
      if (draggedEl.nextSibling !== insertBefore) container.insertBefore(draggedEl, insertBefore);
      return;
    }
    const boundary = boundarySelector ? container.querySelector(boundarySelector) : null;
    if (boundary) {
      if (draggedEl.nextSibling !== boundary) container.insertBefore(draggedEl, boundary);
    } else if (container.lastElementChild !== draggedEl) {
      container.appendChild(draggedEl);
    }
  }, { signal });

  container.addEventListener('drop', async (e) => {
    if (!dragState?.active) return;
    e.preventDefault();
    e.stopPropagation();

    const { draggedEl } = dragState;
    dragState = null;
    draggedEl.classList.remove('reorder-dragging');

    const orderedIds = [...container.querySelectorAll(itemSelector)]
      .map((el) => el.dataset[idAttr])
      .filter(Boolean);

    if (orderedIds.length > 0) await onDrop(orderedIds);
  }, { signal });

  return { bindItem };
}

/**
 * Find the element to insert the dragged item before. Iterates candidates in
 * DOM order (= visual order) and returns the first whose bounding rect is
 * entirely below the cursor, or whose left half contains the cursor — works
 * for both a single-row flex belt and a vertical list.
 * @private
 */
function _getInsertionPoint(cursorX, cursorY, container, itemSelector, draggedEl) {
  const candidates = [...container.querySelectorAll(itemSelector)].filter((el) => el !== draggedEl);
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (cursorY < rect.top) return el;
    if (cursorY <= rect.bottom && cursorX < rect.left + rect.width / 2) return el;
  }
  return null;
}
