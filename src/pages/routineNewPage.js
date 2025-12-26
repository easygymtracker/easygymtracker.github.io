import { navigate } from "../router.js";

export function mountRoutineNewPage({ routineStore }) {
    const routineName = document.getElementById("routineName");
    const routineDescription = document.getElementById("routineDescription");
    const btnCreateRoutine = document.getElementById("btnCreateRoutine");

    btnCreateRoutine.addEventListener("click", () => {
        const name = routineName.value.trim();
        const description = routineDescription.value.trim();

        if (!name) {
            routineName.focus();
            routineName.style.borderColor = "rgba(248,113,113,0.6)";
            setTimeout(() => (routineName.style.borderColor = ""), 700);
            return;
        }

        const routine = routineStore.create({ name, description });
        navigate(`#/routine/${routine.id}`);
    });

    function render() {
        routineName.value = "";
        routineDescription.value = "";
        setTimeout(() => routineName.focus(), 0);
    }

    return { render };
}