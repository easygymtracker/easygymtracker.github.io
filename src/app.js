import { startRouter, navigate, onNavigate } from "./router.js";
import { createRoutineStore } from "./store/routineStore.js";
import { createExerciseStore } from "./store/exerciseStore.js";

import { mountRoutinesPage } from "./pages/routinesPage.js";
import { mountRoutineNewPage } from "./pages/routineNewPage.js";
import { mountRoutineDetailPage } from "./pages/routineDetailPage.js";

import { t, translateDocument } from "./internationalization/i18n.js";

// --- stores ---
const routineStore = createRoutineStore();
const exerciseStore = createExerciseStore();

// --- top toolbar actions (global) ---
const btnClearAll = document.getElementById("btnClearAll");

btnClearAll.addEventListener("click", () => {
    const ok = confirm(t("confirm.clearAll"));
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

        translateDocument(document);

        const page = pages[name];
        if (page?.render) page.render(params);
    },
});