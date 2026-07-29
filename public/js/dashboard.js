import { loadNavbar } from "./navbar.js";

import { getStats, getHourly, getVisits, getMap } from "./api.js";

import { renderCards } from "./cards.js";
import { renderHourlyChart } from "./charts.js";
import { initMap, updateMap } from "./map.js";
import { renderDashboardVisitors } from "./dashboardVisitors.js";
import { renderRanking } from "./rankings.js";
import { initSiteFilter } from "./siteFilter.js";
import { requireAuth, attachLogoutHandler } from "./auth.js";

async function carregar() {

    console.log("Atualizando Dashboard...");

    const range = "today";

    const [

        stats,

        hourly,

        visits,

        mapData

    ] = await Promise.all([

        getStats(range),

        getHourly(range),

        getVisits(range, 1, 10),

        getMap(range)

    ]);

    renderCards(stats);

    renderRanking("rankBrowsers", stats.browsers, "browser");

    renderRanking("rankSystems", stats.systems, "os");

    renderRanking("rankDevices", stats.devices, "device_type");

    renderRanking("rankPages", stats.pages, "page");

    renderHourlyChart(hourly);

    updateMap(mapData);

    renderDashboardVisitors(visits.rows);

}

document.addEventListener("DOMContentLoaded", async () => {

    const user = await requireAuth();
    if (!user) return;

    await loadNavbar();

    attachLogoutHandler();

    initSiteFilter(carregar);

    initMap();

    carregar();

    document
        .getElementById("refresh")
        .addEventListener("click", carregar);

    setInterval(carregar, 30000);

});
