import { navigate } from "../router.js";
import { t } from "../internationalization/i18n.js";
import { escapeHtml } from "../ui/dom.js";
import { routineListItem } from "../ui/components/routineListItem.js";

export function mountRoutinesPage({ routineStore }) {
    const elList = document.getElementById("routineList");
    const elCount = document.getElementById("routineCount");
    const elEmpty = document.getElementById("emptyState");

    elList.addEventListener("click", (e) => {
        const row = e.target.closest(".routineRow");
        const btn = e.target.closest("button[data-action]");
        if (!row || !btn) {
            return;
        }

        const id = row.getAttribute("data-id");
        const action = btn.getAttribute("data-action");

        if (action === "open") {
            navigate(`#/routine/${id}`);
            return;
        }

        if (action === "delete") {
            const routine = routineStore.getById(id);
            const nameOrId = routine?.name?.trim() ? routine.name.trim() : id;
            const ok = confirm(deleteConfirmLabel(escapeHtml(nameOrId)));
            if (!ok) {
                return;
            }
            routineStore.remove(id);
            render();
        }
    });

    function render() {
        const routines = routineStore
            .list()
            .slice()
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

        elCount.textContent = routineCountLabel(routines.length);
        elList.innerHTML = routines.map(routineListItem).join("");

        elEmpty.style.display = routines.length === 0 ? "block" : "none";
    }

    function routineCountLabel(count) {
        if (count === 1) {
            return t("routines.count.one", { count });
        }
        return t("routines.count.other", { count });
    }

    function deleteConfirmLabel(nameOrId) {
        return t("routines.confirmDelete", { name: nameOrId });
    }

    return { render };
}