import { navigate } from "../router.js";
import { routineListItem } from "../ui/components/routineListItem.js";

export function mountRoutinesPage({ routineStore }) {
    const elList = document.getElementById("routineList");
    const elCount = document.getElementById("routineCount");
    const elEmpty = document.getElementById("emptyState");

    // Event delegation for list actions
    elList.addEventListener("click", (e) => {
        const row = e.target.closest(".routineRow");
        const btn = e.target.closest("button[data-action]");
        if (!row || !btn) return;

        const id = row.getAttribute("data-id");
        const action = btn.getAttribute("data-action");

        if (action === "open") {
            navigate(`#/routine/${id}`);
            return;
        }

        if (action === "delete") {
            const routine = routineStore.getById(id);
            const ok = confirm(`Delete routine "${routine?.name ?? id}"?`);
            if (!ok) return;
            routineStore.remove(id);
            render();
        }
    });

    function render() {
        const routines = routineStore.list().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

        elCount.textContent = `${routines.length} routine${routines.length === 1 ? "" : "s"}`;
        elList.innerHTML = routines.map(routineListItem).join("");

        elEmpty.style.display = routines.length === 0 ? "block" : "none";
    }

    return { render };
}