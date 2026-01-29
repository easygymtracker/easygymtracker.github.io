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

// -----------------------------------------------------------------------------
// Service Worker registration + diagnostics
// -----------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
    console.log("[SW] serviceWorker supported");

    window.addEventListener("load", async () => {
        try {
            const reg = await navigator.serviceWorker.register("/sw.js");
            console.log("[SW] registered:", reg.scope);

            // When the SW is ready (installed + activated)
            navigator.serviceWorker.ready.then(() => {
                console.log("[SW] ready");
            });

            // Log initial controller state
            if (navigator.serviceWorker.controller) {
                console.log("[SW] controller present on first load");
            } else {
                console.log("[SW] controller is NULL on first load");
            }

            // Listen for controller takeover
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                console.log("[SW] controller changed — page now controlled");
            });

            // Periodic message to SW (test / heartbeat)
            setInterval(() => {
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: "APP_HEARTBEAT",
                        timestamp: Date.now(),
                    });
                    console.log("[SW] heartbeat sent");
                } else {
                    console.log("[SW] heartbeat skipped — no controller yet");
                }
            }, 3000); // 30 seconds

        } catch (err) {
            console.error("[SW] registration failed:", err);
        }
    });
} else {
    console.warn("[SW] serviceWorker NOT supported");
}

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