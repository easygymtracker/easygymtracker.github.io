import { importRoutineFromExport, parseRoutineExport } from "../import/routineImport.js";
import { t } from "../internationalization/i18n.js";

export function setupRoutineImport({ triggerEl, routineStore, exerciseStore, navigate }) {
    if (!triggerEl) return () => {};

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = ".json,.gymroutine.json";
    uploadInput.style.display = "none";
    document.body.appendChild(uploadInput);

    const openPicker = () => {
        uploadInput.value = "";
        uploadInput.click();
    };

    const handleClick = () => {
        openPicker();
    };

    const handleKeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
        }
    };

    const handleChange = async () => {
        const file = uploadInput.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();

            // Check if this would update an existing routine
            const { existingRoutine } = parseRoutineExport({ rawText: text, routineStore });

            if (existingRoutine) {
                const msg = t("routines.import.confirmUpdate")
                    .replace("{name}", existingRoutine.name);
                if (!confirm(msg)) return;
            }

            const { routine } = importRoutineFromExport({
                rawText: text,
                routineStore,
                exerciseStore,
            });

            navigate(`/routine/${routine.id}`);
        } catch (err) {
            alert(err?.message || "Failed to import routine");
        }
    };

    triggerEl.addEventListener("click", handleClick);
    triggerEl.addEventListener("keydown", handleKeydown);
    uploadInput.addEventListener("change", handleChange);

    return () => {
        triggerEl.removeEventListener("click", handleClick);
        triggerEl.removeEventListener("keydown", handleKeydown);
        uploadInput.removeEventListener("change", handleChange);
        uploadInput.remove();
    };
}