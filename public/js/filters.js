let currentRange = "today";
let startDate = null;
let endDate = null;

export function getCurrentRange() {
    if (currentRange === "custom") return { start: startDate, end: endDate };
    return currentRange;
}

export function getStartDate() { return startDate; }
export function getEndDate()   { return endDate; }

// Inicializa filtros dentro de um container específico (section ou document)
export function initFilters(onChange, container = document) {
    const filtros     = container.querySelectorAll(".filter");
    const customRange = container.querySelector(".custom-range");
    const dateStart   = container.querySelector("input[type='date']:first-of-type") || document.getElementById("dateStart");
    const dateEnd     = container.querySelector("input[type='date']:last-of-type")  || document.getElementById("dateEnd");
    const applyBtn    = container.querySelector("button[id^='applyRange']")         || document.getElementById("applyRange");

    filtros.forEach(btn => {
        btn.onclick = () => {
            // Remove active apenas dos botões deste container
            filtros.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentRange = btn.dataset.range;

            if (currentRange === "custom") {
                if (customRange) customRange.classList.remove("hidden");
                return;
            }

            if (customRange) customRange.classList.add("hidden");
            onChange();
        };
    });

    if (applyBtn) {
        applyBtn.onclick = () => {
            const s = dateStart?.value;
            const e = dateEnd?.value;
            if (!s || !e) { alert("Selecione as duas datas."); return; }
            startDate = s;
            endDate   = e;
            onChange();
        };
    }
}
