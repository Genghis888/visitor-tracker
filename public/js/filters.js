let currentRange = "today";
let startDate = null;
let endDate = null;

export function getCurrentRange() {
    return currentRange;
}

export function getStartDate() {
    return startDate;
}

export function getEndDate() {
    return endDate;
}

export function initFilters(onChange) {

    const filtros = document.querySelectorAll(".filter");

    const customRange = document.getElementById("customRange");

    const dateStart = document.getElementById("dateStart");

    const dateEnd = document.getElementById("dateEnd");

    const applyButton = document.getElementById("applyRange");    

    filtros.forEach(btn => {

        btn.onclick = () => {

            filtros.forEach(b => b.classList.remove("active"));

            btn.classList.add("active");

            currentRange = btn.dataset.range;

            if (currentRange === "custom") {

                customRange.classList.remove("hidden");

                return;

            }

            customRange.classList.add("hidden");

            onChange();

        };

    });

    applyButton.onclick = () => {

        if (!dateStart.value || !dateEnd.value) {

            alert("Selecione as duas datas.");

            return;

        }

        startDate = dateStart.value;

        endDate = dateEnd.value;

        onChange();

    };    

}