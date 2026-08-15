import { getSites } from "./api.js";

let currentSite = "all";

export function getCurrentSite() {
    return currentSite;
}

export async function initSiteFilter(onChange, selectId = "siteSelect") {

    const select = document.getElementById(selectId);

    if (!select) return;

    try {

        const sites = await getSites();

        select.innerHTML = `<option value="all">Todos os sites</option>`;

        sites.forEach((site) => {

            const option = document.createElement("option");

            option.value = site.domain || site.host || '';

            option.textContent = site.name || site.domain || site.host || "";

            select.appendChild(option);

        });

        // Se só existe 1 site (ou nenhum), não faz sentido mostrar o seletor
        if (sites.length <= 1) {

            select.closest(".site-filter-wrapper")?.classList.add("hidden");

        }

    } catch (err) {

        console.error("Erro ao carregar sites:", err);

    }

    select.addEventListener("change", () => {

        currentSite = select.value;

        onChange();

    });

}
