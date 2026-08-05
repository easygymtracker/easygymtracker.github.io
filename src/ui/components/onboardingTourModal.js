// ui/components/onboardingTourModal.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";

const STEPS = [
    { icon: "👋", titleKey: "tour.step1.title", bodyKey: "tour.step1.body" },
    { icon: "📋", titleKey: "tour.step2.title", bodyKey: "tour.step2.body" },
    { icon: "▶️", titleKey: "tour.step3.title", bodyKey: "tour.step3.body" },
    { icon: "📈", titleKey: "tour.step4.title", bodyKey: "tour.step4.body" },
    { icon: "🔒", titleKey: "tour.step5.title", bodyKey: "tour.step5.body" },
];

/** Resolves once the tour is skipped, dismissed, or finished — never rejects. */
export function openOnboardingTour() {
    return new Promise((resolve) => {
        let stepIdx = 0;
        let resolved = false;

        const overlay = document.createElement("div");
        overlay.className = "modalOverlay";

        const modal = document.createElement("div");
        modal.className = "modalCard onboardingTourModal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");

        function finish() {
            if (resolved) return;
            resolved = true;
            document.removeEventListener("keydown", onKey);
            overlay.remove();
            resolve();
        }

        function onKey(e) {
            if (e.key === "Escape") finish();
        }

        function render() {
            const step = STEPS[stepIdx];
            const isFirst = stepIdx === 0;
            const isLast = stepIdx === STEPS.length - 1;

            const dots = STEPS
                .map((_, i) => `<span class="tourDot${i === stepIdx ? " tourDot--active" : ""}" aria-hidden="true"></span>`)
                .join("");

            const backAttrs = isFirst ? 'disabled style="visibility:hidden;"' : "";
            const nextLabel = isLast ? (t("tour.done") || "Get started") : (t("tour.next") || "Next");

            modal.innerHTML = `
                <button type="button" class="tourSkipBtn" data-action="skip"
                    aria-label="${escapeHtml(t("tour.skip") || "Skip")}">
                    ${escapeHtml(t("tour.skip") || "Skip")}
                </button>

                <div class="tourIcon" aria-hidden="true">${step.icon}</div>
                <h3 class="tourTitle">${escapeHtml(t(step.titleKey) || "")}</h3>
                <p class="muted tourBody">${escapeHtml(t(step.bodyKey) || "")}</p>

                <div class="tourDots" role="presentation">${dots}</div>

                <div class="modalActions">
                    <button type="button" class="btn" data-action="back" ${backAttrs}>
                        ${escapeHtml(t("tour.back") || "Back")}
                    </button>
                    <button type="button" class="btn primary" data-action="next">
                        ${escapeHtml(nextLabel)}
                    </button>
                </div>
            `;

            modal.querySelector('[data-action="skip"]').onclick = finish;

            modal.querySelector('[data-action="back"]').onclick = () => {
                if (stepIdx === 0) return;
                stepIdx -= 1;
                render();
            };

            modal.querySelector('[data-action="next"]').onclick = () => {
                if (stepIdx < STEPS.length - 1) {
                    stepIdx += 1;
                    render();
                } else {
                    finish();
                }
            };
        }

        render();

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) finish();
        });

        document.addEventListener("keydown", onKey);
    });
}
