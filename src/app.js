// app.js

import { startRouter, navigate, onNavigate } from "./router.js";
import { createRoutineStore } from "./store/routineStore.js";
import { createExerciseStore } from "./store/exerciseStore.js";
import { importRoutineFromExport } from "./import/routineImport.js";

import { mountSessionPage } from "./pages/sessionPage/sessionPage.js";
import { mountRoutinesPage } from "./pages/routinesPage/routinesPage.js";
import { mountRoutineNewPage } from "./pages/routinesPage/routineNewPage.js";
import { mountRoutineDetailPage } from "./pages/routinesPage/routineDetailPage.js";

import { setLocale, getLocale, getLocaleFromUrl, translateDocument, t } from "./internationalization/i18n.js";

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

const btnUploadRoutine = document.getElementById("btnUploadRoutine");

const uploadInput = document.createElement("input");
uploadInput.type = "file";
uploadInput.accept = ".json,.gymroutine.json";
uploadInput.style.display = "none";
document.body.appendChild(uploadInput);

btnUploadRoutine?.addEventListener("click", () => {
    uploadInput.value = "";
    uploadInput.click();
});

btnUploadRoutine?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        uploadInput.value = "";
        uploadInput.click();
    }
});

uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();

        const routine = importRoutineFromExport({
            rawText: text,
            routineStore,
            exerciseStore,
        });

        navigate(`#/routine/${routine.id}`);
    } catch (err) {
        alert(err?.message || "Failed to import routine");
    }
});

// --- mount pages once ---
const pages = {
    routines: mountRoutinesPage({ routineStore, exerciseStore }),
    "routine-new": mountRoutineNewPage({ routineStore }),
    routine: mountRoutineDetailPage({ routineStore, exerciseStore }),
    session: mountSessionPage({ routineStore, exerciseStore }),
};

// --- route rendering ---
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
    defaultHash: "#/routines",
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