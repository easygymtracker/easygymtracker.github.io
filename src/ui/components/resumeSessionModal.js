// src/ui/components/resumeSessionModal.js
//
// Shown once on app load when a "stopped" (started but not finished) workout
// session is sitting in storage. Lets the user pick up where they left off
// without having to know that pressing "Start" on the routine is what resumes it.

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";
import { bindActions, openModal } from "/src/ui/modal.js";
import { formatMs } from "/src/utils/numberFormat.js";

/**
 * @returns {Promise<"resume"|"discard"|"dismiss">}
 */
export function openResumeSessionModal({ routineName, elapsedMs }) {
    return openModal({
        className: "resumeSessionModal",
        dismissWith: "dismiss",
        setup({ card: modal, close }) {
            const body = t("session.resumeNotice.body")
                .replace("{routine}", escapeHtml(routineName || t("session.exercise.unknown")))
                .replace("{elapsed}", escapeHtml(formatMs(elapsedMs)));

            modal.innerHTML = `
                <h3>${escapeHtml(t("session.resumeNotice.title"))}</h3>
                <p class="muted">${body}</p>

                <div class="modalActions modalActions--spaced">
                    <button type="button" class="btn" data-action="dismiss">
                        ${escapeHtml(t("session.resumeNotice.dismiss"))}
                    </button>
                    <button type="button" class="btn danger" data-action="discard">
                        ${escapeHtml(t("session.resumeNotice.discard"))}
                    </button>
                    <button type="button" class="btn primary uGrow" data-action="resume">
                        ${escapeHtml(t("session.resumeNotice.resume"))}
                    </button>
                </div>
            `;

            bindActions(modal, {
                dismiss: () => close("dismiss"),
                discard: () => close("discard"),
                resume: () => close("resume"),
            });
        },
    });
}
