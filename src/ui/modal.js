// ui/modal.js
//
// The shell every dialog in the app shares: backdrop, card, Escape, click-away,
// and teardown.
//
// It exists because four hand-rolled copies had drifted apart — two of them
// unregistered their keydown listener only on the Escape path, so closing with a
// button left a listener (and the whole closure behind it) attached to document
// for the life of the page. Centralising it makes "closed" mean one thing.

/**
 * Mounts a modal and resolves once it closes, with whatever `close(value)` was
 * given — or `dismissWith` when the user backs out via Escape or the backdrop.
 *
 * `setup` receives the card to fill in and the close function to wire up. It may
 * re-render `card.innerHTML` as often as it likes (wizard steps, validation).
 *
 * @returns {Promise<any>} Never rejects.
 */
export function openModal({
    className = "",
    dismissible = true,
    dismissWith = undefined,
    labelledBy = null,
    setup,
} = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modalOverlay";

        const card = document.createElement("div");
        card.className = ["modalCard", className].filter(Boolean).join(" ");
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");
        if (labelledBy) card.setAttribute("aria-labelledby", labelledBy);

        let closed = false;

        function close(result) {
            // Guarded: a click handler and Escape can both fire before teardown.
            if (closed) return;
            closed = true;
            document.removeEventListener("keydown", onKeyDown);
            overlay.remove();
            resolve(result);
        }

        function onKeyDown(event) {
            if (event.key !== "Escape" || !dismissible) return;
            event.preventDefault();
            close(dismissWith);
        }

        overlay.addEventListener("click", (event) => {
            if (dismissible && event.target === overlay) close(dismissWith);
        });
        document.addEventListener("keydown", onKeyDown);

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        setup({ card, close, overlay });
    });
}

/**
 * Binds one click handler per `data-action` in the card.
 *
 * Re-binding after a re-render is safe: assigning onclick replaces the previous
 * handler instead of stacking another listener on the same element.
 */
export function bindActions(card, handlers) {
    for (const [action, handler] of Object.entries(handlers)) {
        const el = card.querySelector(`[data-action="${action}"]`);
        if (el) el.onclick = handler;
    }
}
