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

            option.value = site.token || site.domain || '';

            option.textContent = site.name || site.domain || site.host || "";

            select.appendChild(option);

        });

        // Pré-seleciona site via parâmetro URL (?siteToken=token)
        const urlSite = new URLSearchParams(location.search).get("siteToken");
        if (urlSite) {
            select.value = urlSite;
            currentSite  = urlSite;
        }

        // Se só existe 1 site (ou nenhum), não faz sentido mostrar o seletor
        if (sites.length <= 1 && !urlSite) {

            select.closest(".site-filter-wrapper")?.classList.add("hidden");

        }

        // Se veio com ?site= na URL, dispara onChange para carregar dados filtrados
        // Só dispara no seletor principal (siteSelect) para evitar múltiplos reloads
        if (urlSite && selectId === "siteSelect") {
            onChange();
            // Atualiza badge de site ativo
            const urlParams = new URLSearchParams(location.search);
            const siteName  = urlParams.get("siteName") || urlSite;
            const badge  = document.getElementById("siteActiveBadge");
            const nameEl = document.getElementById("siteActiveName");
            if (badge && nameEl) {
                nameEl.textContent = "📊 " + siteName;
                badge.classList.remove("hidden");
            }
        }

    } catch (err) {

        console.error("Erro ao carregar sites:", err);

    }

    select.addEventListener("change", () => {

        currentSite = select.value;

        onChange();

    });

}
