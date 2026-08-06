// src/ui/components/sessionSetModal.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";
import { openModal } from "/src/ui/modal.js";
import { toSided as normalizeTuple } from "/src/ui/sidedValue.js";

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
  // Backing out (Escape, backdrop, Cancel) resolves null: "no set recorded".
  return openModal({ dismissWith: null, setup({ card: modal, close }) {
    let currentLaterality = laterality ?? "bilateral";

    const initialRepsTuple = normalizeTuple(initialReps);
    const initialWeightTuple = normalizeTuple(initialWeight);

    const bilateralRepsValue =
      currentLaterality === "unilateral"
        ? (initialRepsTuple.left ?? "")
        : (typeof initialReps === "number" ? initialReps : (initialRepsTuple.left ?? ""));

    const bilateralWeightValue =
      currentLaterality === "unilateral"
        ? (initialWeightTuple.left ?? "")
        : (typeof initialWeight === "number" ? initialWeight : (initialWeightTuple.left ?? ""));

    const lateralityLabel = escapeHtml(t("repGroup.lateralityLabel"));
    const bilateralLabel = escapeHtml(t("repGroup.laterality.bilateral"));
    const unilateralLabel = escapeHtml(t("repGroup.laterality.unilateral"));

    modal.innerHTML = `
      <h3>
        ${escapeHtml(
      mode === "create"
        ? t("session.addSet")
        : t("session.currentSet.done")
    )}
      </h3>

      <p class="muted">
        ${escapeHtml(
      t("session.currentSet.subtitle")
    )}
      </p>

      <p class="muted" style="margin-top:4px;">
        ${escapeHtml(exerciseName)} · ${escapeHtml(t("session.set"))} ${setIndex}
      </p>

      <div style="margin: 12px 0 8px;">
        <span class="muted" style="font-size:.85em; display:block; margin-bottom:6px;">${lateralityLabel}</span>
        <div class="lateralityToggle" role="group" aria-label="${lateralityLabel}">
          <button type="button" class="lateralityBtn${currentLaterality === "bilateral" ? " lateralityBtn--active" : ""}" data-laterality="bilateral">
            ${bilateralLabel}
          </button>
          <button type="button" class="lateralityBtn${currentLaterality === "unilateral" ? " lateralityBtn--active" : ""}" data-laterality="unilateral">
            ${unilateralLabel}
          </button>
        </div>
      </div>

      <div data-section="bilateral-reps" ${currentLaterality === "unilateral" ? 'style="display:none"' : ""}>
        <label>
          ${escapeHtml(t("session.reps"))}
          <input
            type="number"
            min="1"
            step="1"
            value="${bilateralRepsValue}"
            data-field="reps"
          />
        </label>
      </div>

      <div data-section="unilateral-reps" ${currentLaterality === "bilateral" ? 'style="display:none"' : ""}>
        <div class="row">
          <label>
            ${escapeHtml(t("session.enterRepsLeft"))}
            <input
              type="number"
              min="1"
              step="1"
              value="${initialRepsTuple.left ?? ""}"
              data-field="reps-left"
            />
          </label>
          <label>
            ${escapeHtml(t("session.enterRepsRight"))}
            <input
              type="number"
              min="1"
              step="1"
              value="${initialRepsTuple.right ?? ""}"
              data-field="reps-right"
            />
          </label>
        </div>
      </div>

      <div data-section="bilateral-weight" ${currentLaterality === "unilateral" ? 'style="display:none"' : ""}>
        <label>
          ${escapeHtml(t("session.weight"))}
          <input
            type="number"
            min="0"
            step="any"
            value="${bilateralWeightValue}"
            data-field="weight"
          />
        </label>
      </div>

      <div data-section="unilateral-weight" ${currentLaterality === "bilateral" ? 'style="display:none"' : ""}>
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
      </div>

      <label>
        ${escapeHtml(t("session.rest"))} (${escapeHtml(t("session.seconds"))})
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
            ? t("session.addSet.confirm")
            : t("session.currentSet.done")
        )}"
        >
          <span class="currentSetDoneIcon" aria-hidden="true">✓</span>
          ${escapeHtml(
          mode === "create"
            ? t("session.addSet.confirm")
            : t("session.currentSet.done")
        )}
        </button>
      </div>
    `;

    const errorEl = modal.querySelector(".modalError");
    const confirmBtn = modal.querySelector('[data-action="confirm"]');

    const repsInput = modal.querySelector('[data-field="reps"]');
    const repsLeftInput = modal.querySelector('[data-field="reps-left"]');
    const repsRightInput = modal.querySelector('[data-field="reps-right"]');

    const restInput = modal.querySelector('[data-field="rest"]');

    const weightInput = modal.querySelector('[data-field="weight"]');
    const weightLeftInput = modal.querySelector('[data-field="weight-left"]');
    const weightRightInput = modal.querySelector('[data-field="weight-right"]');

    const bilateralRepsSec = modal.querySelector('[data-section="bilateral-reps"]');
    const unilateralRepsSec = modal.querySelector('[data-section="unilateral-reps"]');
    const bilateralWeightSec = modal.querySelector('[data-section="bilateral-weight"]');
    const unilateralWeightSec = modal.querySelector('[data-section="unilateral-weight"]');

    function switchLaterality(next) {
      if (next === currentLaterality) return;

      // Copy values across so the user doesn't lose what they typed
      if (next === "unilateral") {
        // bilateral → unilateral: spread bilateral value to both sides
        const rv = repsInput.value;
        if (rv !== "") {
          repsLeftInput.value = rv;
          repsRightInput.value = rv;
        }
        const wv = weightInput.value;
        if (wv !== "") {
          weightLeftInput.value = wv;
          weightRightInput.value = wv;
        }
      } else {
        // unilateral → bilateral: use left value
        if (repsLeftInput.value !== "") repsInput.value = repsLeftInput.value;
        if (weightLeftInput.value !== "") weightInput.value = weightLeftInput.value;
      }

      currentLaterality = next;

      bilateralRepsSec.style.display = next === "bilateral" ? "" : "none";
      unilateralRepsSec.style.display = next === "unilateral" ? "" : "none";
      bilateralWeightSec.style.display = next === "bilateral" ? "" : "none";
      unilateralWeightSec.style.display = next === "unilateral" ? "" : "none";

      modal.querySelectorAll(".lateralityBtn").forEach((btn) => {
        btn.classList.toggle("lateralityBtn--active", btn.dataset.laterality === next);
      });

      clearError();
      validateAll(false);
      syncConfirmState();
    }

    modal.addEventListener("click", (e) => {
      const btn = e.target.closest(".lateralityBtn[data-laterality]");
      if (btn) switchLaterality(btn.dataset.laterality);
    });

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
          t("session.error.invalidReps")
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
          t("session.error.invalidReps")
        );
      }

      return !lInvalid && !rInvalid && !bothEmpty;
    }

    function validateReps(live = false) {
      if (currentLaterality === "unilateral") return validateRepsUnilateral(live);
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
          t("session.error.invalidWeight")
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
          t("session.error.invalidRest")
        );
      }

      return !invalid;
    }

    function validateAll(live = false) {
      clearError();

      let ok = validateReps(live);

      if (currentLaterality === "unilateral") {
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

    repsInput?.addEventListener("input", () => { validateAll(true); syncConfirmState(); });
    repsLeftInput?.addEventListener("input", () => { validateAll(true); syncConfirmState(); });
    repsRightInput?.addEventListener("input", () => { validateAll(true); syncConfirmState(); });
    weightInput?.addEventListener("input", () => { validateAll(true); syncConfirmState(); });
    weightLeftInput?.addEventListener("input", () => { validateAll(true); syncConfirmState(); });
    weightRightInput?.addEventListener("input", () => { validateAll(true); syncConfirmState(); });
    restInput?.addEventListener("input", () => { validateAll(true); syncConfirmState(); });

    modal.querySelector('[data-action="cancel"]').onclick = () => close(null);

    modal.querySelector('[data-action="confirm"]').onclick = () => {
      if (!validateAll(false)) return;

      let reps;
      if (currentLaterality === "unilateral") {
        reps = {
          left: repsLeftInput.value === "" ? null : Number(repsLeftInput.value),
          right: repsRightInput.value === "" ? null : Number(repsRightInput.value),
        };
      } else {
        reps = Number(repsInput.value);
      }

      let weight;
      if (currentLaterality === "unilateral") {
        weight = {
          left: weightLeftInput.value === "" ? null : Number(weightLeftInput.value),
          right: weightRightInput.value === "" ? null : Number(weightRightInput.value),
        };
      } else {
        weight = weightInput.value === "" ? null : Number(weightInput.value);
      }

      const restSecondsAfter =
        restInput.value === "" ? 0 : Number(restInput.value);

      const lateralityChanged = currentLaterality !== (laterality ?? "bilateral");

      const repsChanged = lateralityChanged || (
        currentLaterality === "unilateral"
          ? !sameValue(normalizeTuple(reps), normalizeTuple(initialReps))
          : reps !== (typeof initialReps === "number" ? initialReps : (normalizeTuple(initialReps).left ?? null))
      );

      const weightChanged = lateralityChanged || (
        currentLaterality === "unilateral"
          ? !sameValue(normalizeTuple(weight), normalizeTuple(initialWeight))
          : !sameValue(
            weight,
            typeof initialWeight === "number" ? initialWeight : (normalizeTuple(initialWeight).left ?? null)
          )
      );

      const changed =
        repsChanged ||
        weightChanged ||
        restSecondsAfter !== (initialRestSeconds ?? 0);

      close({ reps, weight, restSecondsAfter, laterality: currentLaterality, changed });
    };

    syncConfirmState();
  } });
}
