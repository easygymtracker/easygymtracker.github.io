// src/ui/components/sessionSetModal.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";

export function openSessionSetModal({
  exerciseName,
  setIndex,
  laterality,
  initialReps,
  initialWeight,
  initialRestSeconds,
  mode = "edit",
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modalOverlay";

    const modal = document.createElement("div");
    modal.className = "modalCard";

    modal.innerHTML = `
      <h3>
        ${escapeHtml(
      mode === "create"
        ? (t("session.addSet") || "Add set")
        : t("session.currentSet.done")
    )
      }
      </h3>

      <p class="muted">
        ${escapeHtml(
        t("session.currentSet.subtitle") ||
        "Enter what you actually performed to track your progress."
      )}
      </p>

      <p class="muted" style="margin-top:4px;">
        ${escapeHtml(exerciseName)} · ${escapeHtml(t("session.set"))} ${setIndex}
      </p>

      <label>
        ${escapeHtml(t("session.reps"))}
        <input
          type="number"
          min="1"
          step="1"
          value="${initialReps ?? ""}"
          data-field="reps"
        />
      </label>

      ${laterality === "unilateral"
        ? `
        <div class="row">
          <label>
            ${escapeHtml(t("session.enterWeightLeft"))}
            <input
              type="number"
              min="0"
              step="any"
              value="${initialWeight?.left ?? ""}"
              data-field="weight-left"
            />
          </label>
          <label>
            ${escapeHtml(t("session.enterWeightRight"))}
            <input
              type="number"
              min="0"
              step="any"
              value="${initialWeight?.right ?? ""}"
              data-field="weight-right"
            />
          </label>
        </div>
      `
        : `
        <label>
          ${escapeHtml(t("session.weight"))}
          <input
            type="number"
            min="0"
            step="any"
            value="${initialWeight ?? ""}"
            data-field="weight"
          />
        </label>
      `
      }

      <label>
        ${escapeHtml(t("session.rest"))} (${escapeHtml(t("session.seconds") || "seconds")})
        <input
          type="number"
          min="0"
          step="1"
          value="${initialRestSeconds ?? ""}"
          data-field="rest"
        />
      </label>

      <div class="modalError muted" style="display:none; margin-top:8px;"></div>

      <div class="modalActions">
        <button type="button" class="btn" data-action="cancel">
          ${escapeHtml(t("common.cancel"))}
        </button>

        <button
          type="button"
          class="currentSetDoneIconBtn"
          data-action="confirm"
          aria-label="${escapeHtml(
        mode === "create"
          ? (t("session.addSet.confirm") || "Add set")
          : t("session.currentSet.done")
      )}"
        >
          <span class="currentSetDoneIcon" aria-hidden="true">✓</span>
          ${escapeHtml(
        mode === "create"
          ? (t("session.addSet.confirm") || "Add set")
          : t("session.currentSet.done")
      )}
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    const errorEl = modal.querySelector(".modalError");
    const repsInput = modal.querySelector('[data-field="reps"]');
    const restInput = modal.querySelector('[data-field="rest"]');
    const weightInput = modal.querySelector('[data-field="weight"]');
    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    const weightLeftInput = modal.querySelector('[data-field="weight-left"]');
    const weightRightInput = modal.querySelector('[data-field="weight-right"]');

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = "";
    }

    function clearError() {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }

    function markInvalid(input, invalid) {
      if (!input) return;
      input.classList.toggle("input--error", invalid);
    }

    function validateReps(live = false) {
      const v = Number(repsInput.value);
      const invalid = !Number.isInteger(v) || v <= 0;
      markInvalid(repsInput, invalid);
      if (invalid && live) {
        showError(
          t("session.error.invalidReps") ||
          "Reps must be a positive whole number."
        );
      }
      return !invalid;
    }

    function validateWeightInput(input, live = false) {
      if (!input) return true;
      if (input.value === "") {
        markInvalid(input, false);
        return true;
      }
      const v = Number(input.value);
      const invalid = !Number.isFinite(v) || v < 0;
      markInvalid(input, invalid);
      if (invalid && live) {
        showError(
          t("session.error.invalidWeight") ||
          "Weight must be zero or a positive number."
        );
      }
      return !invalid;
    }

    function validateRest(live = false) {
      if (!restInput) return true;
      if (restInput.value === "") {
        markInvalid(restInput, false);
        return true;
      }

      const v = Number(restInput.value);
      const invalid = !Number.isInteger(v) || v < 0;
      markInvalid(restInput, invalid);

      if (invalid && live) {
        showError(
          t("session.error.invalidRest") ||
          "Rest must be zero or a positive whole number."
        );
      }

      return !invalid;
    }

    function validateAll(live = false) {
      clearError();

      let ok = validateReps(live);

      if (laterality === "unilateral") {
        ok =
          validateWeightInput(weightLeftInput, live) &&
          validateWeightInput(weightRightInput, live) &&
          ok;
      } else {
        ok = validateWeightInput(weightInput, live) && ok;
      }

      ok = validateRest(live) && ok;

      if (ok) clearError();
      return ok;
    }

    function syncConfirmState() {
      confirmBtn.disabled = !validateAll(false);
    }

    repsInput.addEventListener("input", () => {
      validateAll(true);
      syncConfirmState();
    });

    weightInput?.addEventListener("input", () => {
      validateAll(true);
      syncConfirmState();
    });

    weightLeftInput?.addEventListener("input", () => {
      validateAll(true);
      syncConfirmState();
    });

    weightRightInput?.addEventListener("input", () => {
      validateAll(true);
      syncConfirmState();
    });

    restInput?.addEventListener("input", () => {
      validateAll(true);
      syncConfirmState();
    });

    function close(result) {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve(result);
    }

    modal.querySelector('[data-action="cancel"]').onclick = () => close(null);

    modal.querySelector('[data-action="confirm"]').onclick = () => {
      if (!validateAll(false)) return;

      const reps = Number(repsInput.value);

      let weight;
      if (laterality === "unilateral") {
        weight = {
          left: weightLeftInput.value === "" ? null : Number(weightLeftInput.value),
          right: weightRightInput.value === "" ? null : Number(weightRightInput.value),
        };
      } else {
        weight = weightInput.value === "" ? null : Number(weightInput.value);
      }

      const restSecondsAfter =
        restInput.value === "" ? 0 : Number(restInput.value);

      const changed =
        reps !== initialReps ||
        JSON.stringify(weight) !== JSON.stringify(initialWeight) ||
        restSecondsAfter !== initialRestSeconds;

      close({ reps, weight, restSecondsAfter, changed });
    };
  });
}