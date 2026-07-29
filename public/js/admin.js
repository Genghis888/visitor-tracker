import { getStats, getHourly, getRankings, getVisits, getMap } from "./api.js";
import { renderCards } from "./cards.js";
import { renderHourlyChart } from "./charts.js";
import { renderRanking } from "./rankings.js";
import { renderTable } from "./table.js";
import { initFilters, getCurrentRange } from "./filters.js";
import { initMap, updateMap } from "./map.js";
import { renderPagination } from "./pagination.js";
import { attachLogoutHandler, requireAuth } from "./auth.js";
import { initSiteFilter } from "./siteFilter.js";

let currentPage = 1;
const pageSize = 25;

let allVisits = [];

async function carregar(page = currentPage) {
    currentPage = page;
    console.log("Atualizando painel...");
    const range = getCurrentRange();
    const [
        stats,
        hourly,
        rankings,
        visits,
        mapData
] = await Promise.all([
        getStats(range),
        getHourly(range),
        getRankings(range),
        getVisits( range, currentPage, pageSize ),
        getMap(range)
]);
    renderCards(stats);
    renderHourlyChart(hourly);
    renderRanking(
        "rankBrowsers",
        rankings.browsers,
        "browser"
    );
    renderRanking(
        "rankSystems",
        rankings.systems,
        "os"
    );
    renderRanking(
        "rankDevices",
        rankings.devices,
        "device_type"
    );
    renderRanking(
        "rankPages",
        rankings.pages,
        "page"
    );

    allVisits = visits.rows;
    renderTable(allVisits);

    renderPagination(visits, (page) => {
        carregar(page);
    });

    updateMap(mapData);
} 

function filtrarTabela() {

    const termo = document
        .getElementById("searchVisits")
        .value
        .toLowerCase()
        .trim();

    if (!termo) {

        renderTable(allVisits);

        return;

    }

    const filtrados = allVisits.filter(v => {

        return [

            v.country,
            v.city,
            v.browser,
            v.os,
            v.device_type,
            v.page,
            v.page_title,
            v.ip,
            v.host

        ]
        .filter(Boolean)
        .some(valor =>
            valor
                .toString()
                .toLowerCase()
                .includes(termo)
        );

    });

    renderTable(filtrados);

}

document.addEventListener("DOMContentLoaded", async () => {
    const user = await requireAuth();
    if (!user) return; // requireAuth já redirecionou pro login

    console.log("DOM carregado");
    initFilters(carregar);
    initSiteFilter(carregar);
    initMap();
    carregar();
    setInterval(carregar, 30000);
    document
        .getElementById("refresh")
        .addEventListener("click", carregar);

    document
        .getElementById("searchVisits")
        .addEventListener("input", filtrarTabela);

    attachLogoutHandler();
});
