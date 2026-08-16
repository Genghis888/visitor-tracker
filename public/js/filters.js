let currentRange = "today";
let startDate = null;
let endDate = null;

export function getCurrentRange() {
    if (currentRange === "custom") return { start: startDate, end: endDate };
    return currentRange;
}

export function getStartDate() { return startDate; }
export function getEndDate()   { return endDate; }

export function initFilters(onChange, container = document) {
    const filtros   = container.querySelectorAll(".filter");
    const customEl  = container.querySelector(".custom-range");
    const dates     = customEl ? customEl.querySelectorAll("input[type='date']") : [];
    const dateStart = dates[0] || null;
    const dateEnd   = dates[1] || null;
    const applyBtn  = customEl ? customEl.querySelector("button") : null;

    filtros.forEach(btn => {
        // Remove listener antigo clonando o botão
        const clone = btn.cloneNode(true);
        btn.parentNode.replaceChild(clone, btn);
        clone.addEventListener("click", () => {
            filtros.forEach(b => {
                const fresh = container.querySelector(`[data-range="${b.dataset.range}"]`);
                if (fresh) fresh.classList.remove("active");
            });
            clone.classList.add("active");
            currentRange = clone.dataset.range;

            if (currentRange === "custom") {
                if (customEl) customEl.classList.remove("hidden");
                return;
            }
            if (customEl) customEl.classList.add("hidden");
            onChange();
        });
    });

    if (applyBtn) {
        const freshApply = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(freshApply, applyBtn);
        freshApply.addEventListener("click", () => {
            if (!dateStart?.value || !dateEnd?.value) {
                alert("Selecione as duas datas.");
                return;
            }
            startDate = dateStart.value;
            endDate   = dateEnd.value;
            onChange();
        });
    }
}
