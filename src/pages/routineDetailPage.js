import { navigate } from "../router.js";
import { SetSeries } from "../models/setSeries.js";

export function mountRoutineDetailPage({ routineStore, exerciseStore }) {
  const routineTitle = document.getElementById("routineTitle");
  const routineDesc = document.getElementById("routineDesc");
  const btnDeleteRoutine = document.getElementById("btnDeleteRoutine");

  const exerciseInput = document.getElementById("exerciseInput");
  const exerciseOptions = document.getElementById("exerciseOptions");
  const seriesDescription = document.getElementById("seriesDescription");
  const btnAddSeries = document.getElementById("btnAddSeries");

  const seriesList = document.getElementById("seriesList");
  const seriesEmpty = document.getElementById("seriesEmpty");

  let currentId = null;

  btnDeleteRoutine.addEventListener("click", () => {
    if (!currentId) return;
    const routine = routineStore.getById(currentId);
    const ok = confirm(`Delete routine "${routine?.name ?? currentId}"?`);
    if (!ok) return;
    routineStore.remove(currentId);
    navigate("#/routines");
  });

  function renderExerciseOptions() {
    const exercises = exerciseStore
      .list()
      .slice()
      .sort((a, b) => String(a.description).localeCompare(String(b.description)));

    exerciseOptions.innerHTML = exercises
      .map((ex) => `<option value="${escapeHtmlAttr(ex.description)}"></option>`)
      .join("");
  }

  function renderSeries(routine) {
    const items = Array.isArray(routine.series) ? routine.series : [];
    seriesList.innerHTML = "";

    if (items.length === 0) {
      seriesEmpty.style.display = "block";
      return;
    }
    seriesEmpty.style.display = "none";

    // Map exerciseId -> exercise description (fast lookup)
    const exById = new Map(exerciseStore.list().map((ex) => [ex.id, ex]));

    for (let i = 0; i < items.length; i++) {
      const s = items[i];
      const ex = exById.get(s.exerciseId);
      const exName = ex?.description ?? "(missing exercise)";
      const desc = s.description || "—";

      const row = document.createElement("div");
      row.className = "routineRow"; // reuse existing row style
      row.innerHTML = `
        <div class="routineMeta">
          <h3>${escapeHtml(exName)}</h3>
          <p>${escapeHtml(desc)}</p>
        </div>
        <div class="rowActions">
          <span class="chip">Series ${i + 1}</span>
          <button class="btn danger" data-action="remove-series" data-index="${i}">Remove</button>
        </div>
      `;
      seriesList.appendChild(row);
    }
  }

  // Remove a series (by index)
  seriesList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='remove-series']");
    if (!btn) return;

    const idx = Number(btn.getAttribute("data-index"));
    const routine = routineStore.getById(currentId);
    if (!routine) return;

    const ok = confirm(`Remove series #${idx + 1}?`);
    if (!ok) return;

    routine.series.splice(idx, 1);
    routineStore.update(routine);
    renderExerciseOptions();
    renderSeries(routine);
  });

  btnAddSeries.addEventListener("click", () => {
    const routine = routineStore.getById(currentId);
    if (!routine) return;

    const typed = String(exerciseInput.value ?? "").trim();
    if (!typed) {
      flashInvalid(exerciseInput);
      return;
    }

    // Find existing exercise by name, or create new
    const exercise = exerciseStore.getOrCreateByDescription(typed);

    // Create SetSeries with associated exercise
    const ss = new SetSeries({
      exerciseId: exercise.id,
      description: String(seriesDescription.value ?? "").trim(),
      repGroups: [],
      restSecondsAfter: 0,
    });

    routine.series.push(ss);
    routineStore.update(routine);

    // Reset inputs
    exerciseInput.value = "";
    seriesDescription.value = "";
    exerciseInput.focus();

    // Refresh UI
    renderExerciseOptions();
    renderSeries(routine);
  });

  function render(params) {
    currentId = params?.id ?? null;

    const routine = currentId ? routineStore.getById(currentId) : null;
    if (!routine) {
      navigate("#/routines");
      return;
    }

    routineTitle.textContent = routine.name || "Routine";
    routineDesc.textContent = routine.description || "—";

    renderExerciseOptions();
    renderSeries(routine);
  }

  return { render };
}

// --- tiny helpers (kept local to avoid extra files) ---
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(s) {
  // for option value=""
  return escapeHtml(s).replaceAll("\n", " ");
}

function flashInvalid(inputEl) {
  inputEl.focus();
  const prev = inputEl.style.borderColor;
  inputEl.style.borderColor = "rgba(248,113,113,0.7)";
  setTimeout(() => (inputEl.style.borderColor = prev), 700);
}