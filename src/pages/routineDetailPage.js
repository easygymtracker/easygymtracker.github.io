import { navigate } from "../router.js";

export function mountRoutineDetailPage({ routineStore }) {
  const routineTitle = document.getElementById("routineTitle");
  const routineDesc = document.getElementById("routineDesc");
  const btnDeleteRoutine = document.getElementById("btnDeleteRoutine");

  let currentId = null;

  btnDeleteRoutine.addEventListener("click", () => {
    if (!currentId) return;

    const routine = routineStore.getById(currentId);
    const ok = confirm(`Delete routine "${routine?.name ?? currentId}"?`);
    if (!ok) return;

    routineStore.remove(currentId);
    navigate("#/routines");
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
  }

  return { render };
}