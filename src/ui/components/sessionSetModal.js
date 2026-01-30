// src/ui/components/sessionSetModal.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";

function normalizeTuple(v) {
  if (v == null) return { left: null, right: null };
  if (typeof v === "number") return { left: v, right: v };
  return { left: v.left ?? null, right: v.right ?? null };
}

function parseIntOrNull(s) {
  if (s === "" || s == null) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) return NaN;
  return n;
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

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

    const initialRepsTuple = normalizeTuple(initialReps);
    const initialWeightTuple = normalizeTuple(initialWeight);

    const repsValue = laterality === "unilateral"
      ? ""
      : (typeof initialReps === "number" ? initialReps : (initialRepsTuple.left ?? ""));

    modal.innerHTML = `
      <h3>
        ${escapeHtml(
      mode === "create"
        ? (t("session.addSet") || "Add set")
        : t("session.currentSet.done")
    )}
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

      ${laterality === "unilateral"
        ? `
        <div class="row">
          <label>
            ${escapeHtml(t("session.repsLeft") || `${t("session.reps")} (L)`)}
            <input
              type="number"
              min="1"
              step="1"
              value="${initialRepsTuple.left ?? ""}"
              data-field="reps-left"
            />
          </label>
          <label>
            ${escapeHtml(t("session.repsRight") || `${t("session.reps")} (R)`)}
            <input
              type="number"
              min="1"
              step="1"
              value="${initialRepsTuple.right ?? ""}"
              data-field="reps-right"
            />
          </label>
        </div>
      `
        : `
        <label>
          ${escapeHtml(t("session.reps"))}
          <input
            type="number"
            min="1"
            step="1"
            value="${repsValue ?? ""}"
            data-field="reps"
          />
        </label>
      `}

      ${laterality === "unilateral"
        ? `
        <div class="row">
          <label>
            ${escapeHtml(t("session.enterWeightLeft"))}
            <input
              type="number"
              min="0"
              step="any"
              value="${initialWeightTuple.left ?? ""}"
              data-field="weight-left"
            />
          </label>
          <label>
            ${escapeHtml(t("session.enterWeightRight"))}
            <input
              type="number"
              min="0"
              step="any"
              value="${initialWeightTuple.right ?? ""}"
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
            value="${typeof initialWeight === "number" ? initialWeight : (initialWeightTuple.left ?? "")}"
            data-field="weight"
          />
        </label>
      `}

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
    const confirmBtn = modal.querySelector('[data-action="confirm"]');

    const repsInput = modal.querySelector('[data-field="reps"]');
    const repsLeftInput = modal.querySelector('[data-field="reps-left"]');
    const repsRightInput = modal.querySelector('[data-field="reps-right"]');

    const restInput = modal.querySelector('[data-field="rest"]');

    const weightInput = modal.querySelector('[data-field="weight"]');
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

    function validateRepsBilateral(live = false) {
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

    function validateRepsUnilateral(live = false) {
      const lRaw = repsLeftInput.value;
      const rRaw = repsRightInput.value;

      const l = parseIntOrNull(lRaw);
      const r = parseIntOrNull(rRaw);

      const lInvalid = Number.isNaN(l) || (l !== null && l <= 0);
      const rInvalid = Number.isNaN(r) || (r !== null && r <= 0);

      const bothEmpty = (lRaw === "" && rRaw === "");
      markInvalid(repsLeftInput, lInvalid || (bothEmpty && live));
      markInvalid(repsRightInput, rInvalid || (bothEmpty && live));

      if ((lInvalid || rInvalid || bothEmpty) && live) {
        showError(
          t("session.error.invalidReps") ||
          "Reps must be a positive whole number."
        );
      }

      return !lInvalid && !rInvalid && !bothEmpty;
    }

    function validateReps(live = false) {
      if (laterality === "unilateral") return validateRepsUnilateral(live);
      return validateRepsBilateral(live);
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

    repsInput?.addEventListener("input", () => {
      validateAll(true);
      syncConfirmState();
    });

    repsLeftInput?.addEventListener("input", () => {
      validateAll(true);
      syncConfirmState();
    });

    repsRightInput?.addEventListener("input", () => {
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

      let reps;
      if (laterality === "unilateral") {
        reps = {
          left: repsLeftInput.value === "" ? null : Number(repsLeftInput.value),
          right: repsRightInput.value === "" ? null : Number(repsRightInput.value),
        };
      } else {
        reps = Number(repsInput.value);
      }

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

      const repsChanged =
        laterality === "unilateral"
          ? !sameValue(normalizeTuple(reps), normalizeTuple(initialReps))
          : reps !== (typeof initialReps === "number" ? initialReps : (normalizeTuple(initialReps).left ?? null));

      const weightChanged =
        laterality === "unilateral"
          ? !sameValue(normalizeTuple(weight), normalizeTuple(initialWeight))
          : !sameValue(
            weight,
            typeof initialWeight === "number" ? initialWeight : (normalizeTuple(initialWeight).left ?? null)
          );

      const changed =
        repsChanged ||
        weightChanged ||
        restSecondsAfter !== (initialRestSeconds ?? 0);

      close({ reps, weight, restSecondsAfter, changed });
    };

    syncConfirmState();
  });
}