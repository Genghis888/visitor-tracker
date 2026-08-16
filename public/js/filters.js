let currentRange = "today";
let startDate = null;
let endDate = null;

export function getCurrentRange() {
    if (currentRange === "custom") return { start: startDate, end: endDate };
    return currentRange;
}

export function getStartDate() { return startDate; }
export function getEndDate()   { return endDate; }

export function initFilters(onChange) {
    // Pega TODOS os botões .filter da página
    const allFilters = document.querySelectorAll(".filter");

    allFilters.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove active de todos os botões com o mesmo data-range em todas as seções
            allFilters.forEach(b => b.classList.remove("active"));
            // Ativa todos os botões com o mesmo range (sincroniza visual entre abas)
            document.querySelectorAll(`.filter[data-range="${btn.dataset.range}"]`)
                .forEach(b => b.classList.add("active"));

            currentRange = btn.dataset.range;

            if (currentRange === "custom") {
                // Mostra o customRange da seção ativa
                document.querySelectorAll(".custom-range")
                    .forEach(el => el.classList.remove("hidden"));
                return;
            }

            document.querySelectorAll(".custom-range")
                .forEach(el => el.classList.add("hidden"));

            onChange();
        });
    });

    // Apply de qualquer botão applyRange
    document.querySelectorAll("[id^='applyRange']").forEach(btn => {
        btn.addEventListener("click", () => {
            // Pega as datas da seção onde o botão está
            const container = btn.closest(".custom-range");
            const dates = container?.querySelectorAll("input[type='date']");
            const s = dates?.[0]?.value;
            const e = dates?.[1]?.value;
            if (!s || !e) { alert("Selecione as duas datas."); return; }
            startDate = s;
            endDate   = e;
            document.querySelectorAll(".custom-range")
                .forEach(el => el.classList.add("hidden"));
            onChange();
        });
    });
}
