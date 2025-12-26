import { startRouter, navigate, onNavigate } from "./router.js";
import { createRoutineStore } from "./store/routineStore.js";
import { createExerciseStore } from "./store/exerciseStore.js";

import { mountRoutinesPage } from "./pages/routinesPage.js";
import { mountRoutineNewPage } from "./pages/routineNewPage.js";
import { mountRoutineDetailPage } from "./pages/routineDetailPage.js";

// --- store ---
const routineStore = createRoutineStore({ namespace: "gymapp" });
const exerciseStore = createExerciseStore({ namespace: "gymapp" });

// --- top toolbar actions (global) ---
const btnSeed = document.getElementById("btnSeed");
const btnClearAll = document.getElementById("btnClearAll");

btnSeed.addEventListener("click", () => {
  routineStore.seedDemo();
  // refresh current route UI
  onNavigate.emit();
});

btnClearAll.addEventListener("click", () => {
  const ok = confirm("This will delete ALL routines from this device. Continue?");
  if (!ok) return;
  routineStore.clearAll();
  navigate("#/routines");
});

// --- mount pages once ---
const pages = {
  routines: mountRoutinesPage({ routineStore }),
  "routine-new": mountRoutineNewPage({ routineStore }),
  routine: mountRoutineDetailPage({ routineStore, exerciseStore }),
};

// --- route rendering ---
function showRoute(name) {
  document.querySelectorAll(".route").forEach((el) => {
    el.style.display = (el.dataset.route === name) ? "" : "none";
  });
}

startRouter({
  defaultHash: "#/routines",
  onRoute({ name, params }) {
    showRoute(name);
    const page = pages[name];
    if (page?.render) page.render(params);
  },
});