// app.js

import { startRouter, navigate, onNavigate } from "./router.js";
import { createRoutineStore } from "./store/routineStore.js";
import { createExerciseStore } from "./store/exerciseStore.js";
import { registerServiceWorker } from "./app/serviceWorkerBootstrap.js";
import { setupRoutineImport } from "./app/routineImportBootstrap.js";

import { mountSessionPage } from "./pages/sessionPage/sessionPage.js";
import { mountRoutinesPage } from "./pages/routinesPage/routinesPage.js";
import { mountRoutineNewPage } from "./pages/routinesPage/routineNewPage.js";
import { mountRoutineDetailPage } from "./pages/routinesPage/routineDetailPage.js";

import { setLocale, getLocale, getLocaleFromUrl, translateDocument, t } from "./internationalization/i18n.js";

registerServiceWorker();

// -----------------------------------------------------------------------------
// Stores
// -----------------------------------------------------------------------------
const routineStore = createRoutineStore();
const exerciseStore = createExerciseStore();

// -----------------------------------------------------------------------------
// Top toolbar actions (global)
// -----------------------------------------------------------------------------
const btnClearAll = document.getElementById("btnClearAll");

btnClearAll.addEventListener("click", () => {
    const ok = confirm(t("confirm.clearAll"));
    if (!ok) return;
    routineStore.clearAll();
    navigate("/routines");
});

const btnUploadRoutine = document.getElementById("btnUploadRoutine");
setupRoutineImport({
    triggerEl: btnUploadRoutine,
    routineStore,
    exerciseStore,
    navigate,
});

// -----------------------------------------------------------------------------
// Mount pages once
// -----------------------------------------------------------------------------
const pages = {
    routines: mountRoutinesPage({ routineStore, exerciseStore }),
    "routine-new": mountRoutineNewPage({ routineStore }),
    routine: mountRoutineDetailPage({ routineStore, exerciseStore }),
    session: mountSessionPage({ routineStore, exerciseStore }),
};

// -----------------------------------------------------------------------------
// Routing
// -----------------------------------------------------------------------------
function showRoute(name) {
    document.querySelectorAll(".route").forEach((el) => {
        el.style.display = (el.dataset.route === name) ? "" : "none";
    });
}

function syncLocaleFromUrl() {
    const locale = getLocaleFromUrl();
    if (locale && locale !== getLocale()) {
        setLocale(locale);
    }
}

startRouter({
    defaultPath: "/routines",
    onRoute({ name, params }) {
        syncLocaleFromUrl();

        showRoute(name);
        translateDocument(document);

        const page = pages[name];
        if (page?.render) {
            page.render(params);
        }
    },
});