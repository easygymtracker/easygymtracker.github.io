// ui/components/onboardingTourModal.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";
import { bindActions, openModal } from "/src/ui/modal.js";

const STEPS = [
    { icon: "👋", titleKey: "tour.step1.title", bodyKey: "tour.step1.body" },
    { icon: "📋", titleKey: "tour.step2.title", bodyKey: "tour.step2.body" },
    { icon: "▶️", titleKey: "tour.step3.title", bodyKey: "tour.step3.body" },
    { icon: "📈", titleKey: "tour.step4.title", bodyKey: "tour.step4.body" },
    { icon: "🔒", titleKey: "tour.step5.title", bodyKey: "tour.step5.body" },
];

/** Resolves once the tour is skipped, dismissed, or finished — never rejects. */
export function openOnboardingTour() {
    return openModal({
        className: "onboardingTourModal",
        setup({ card, close }) {
            let stepIdx = 0;

            function render() {
                const step = STEPS[stepIdx];
                const isFirst = stepIdx === 0;
                const isLast = stepIdx === STEPS.length - 1;

                const dots = STEPS
                    .map((_, i) => `<span class="tourDot${i === stepIdx ? " tourDot--active" : ""}" aria-hidden="true"></span>`)
                    .join("");

                card.innerHTML = `
                    <button type="button" class="tourSkipBtn" data-action="skip"
                        aria-label="${escapeHtml(t("tour.skip"))}">
                        ${escapeHtml(t("tour.skip"))}
                    </button>

                    <div class="tourIcon" aria-hidden="true">${step.icon}</div>
                    <h3 class="tourTitle">${escapeHtml(t(step.titleKey))}</h3>
                    <p class="muted tourBody">${escapeHtml(t(step.bodyKey))}</p>

                    <div class="tourDots" role="presentation">${dots}</div>

                    <div class="modalActions">
                        <button type="button" class="btn uInvisible" data-action="back" ${isFirst ? "disabled" : ""}>
                            ${escapeHtml(t("tour.back"))}
                        </button>
                        <button type="button" class="btn primary" data-action="next">
                            ${escapeHtml(isLast ? t("tour.done") : t("tour.next"))}
                        </button>
                    </div>
                `;

                // Back stays laid out but unseen on the first step, so the Next
                // button does not jump sideways between steps.
                card.querySelector('[data-action="back"]').classList.toggle("uInvisible", isFirst);

                bindActions(card, {
                    skip: () => close(),
                    back: () => {
                        if (stepIdx === 0) return;
                        stepIdx -= 1;
                        render();
                    },
                    next: () => {
                        if (stepIdx < STEPS.length - 1) {
                            stepIdx += 1;
                            render();
                        } else {
                            close();
                        }
                    },
                });
            }

            render();
        },
    });
}
