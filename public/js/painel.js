import { requireAuth, attachLogoutHandler, getUser } from "./auth.js";
import { getStats, getHourly, getRankings, getVisits, getCountries, getMap, getSites } from "./api.js";
import { initFilters, getCurrentRange } from "./filters.js";
import { initSiteFilter, getCurrentSite } from "./siteFilter.js";
import { renderRanking } from "./rankings.js";
import { renderHourlyChart } from "./charts.js";
import { renderTable } from "./table.js";
import { renderPagination } from "./pagination.js";

// ===== Mapas (instâncias separadas por seção) =====
let mapOverview = null;
let mapFull     = null;
let mapPaises   = null;
let clusterOverview, clusterFull, clusterPaises;
let reportChart = null;

let currentPage = 1;
let allVisits   = [];
let realtimeTimer = null;

// ===== Navegação entre seções =====
function initNav() {
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".section");

    function goTo(sectionId) {
        navItems.forEach(n => n.classList.remove("active"));
        sections.forEach(s => s.classList.add("hidden"));

        const targetNav = document.querySelector(`[data-section="${sectionId}"]`);
        const targetSec = document.getElementById(`section-${sectionId}`);

        if (targetNav) targetNav.classList.add("active");
        if (targetSec) targetSec.classList.remove("hidden");

        // Inicializa mapa quando a seção ficar visível
        if (sectionId === "mapa" && !mapFull) initMapFull();
        if (sectionId === "paises" && !mapPaises) initMapPaises();
        if (sectionId === "realtime") startRealtime();
        else stopRealtime();

        // Invalidate map size se já existir (Leaflet precisa disso)
        if (sectionId === "mapa" && mapFull) setTimeout(() => mapFull.invalidateSize(), 50);
        if (sectionId === "paises" && mapPaises) setTimeout(() => mapPaises.invalidateSize(), 50);

        if (sectionId === "paginas") carregarPaginas();
        if (sectionId === "paises")  carregarPaises();
        if (sectionId === "relatorios") carregarRelatorios();
    }

    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            if (item.classList.contains("nav-external")) return; // deixa o browser navegar
            e.preventDefault();
            goTo(item.dataset.section);
        });
    });

    // Links internos "Ver mapa completo →"
    document.querySelectorAll("[data-goto]").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            goTo(link.dataset.goto);
        });
    });

    // Suporte à URL hash
    const hash = location.hash.replace("#", "");
    if (hash) goTo(hash);
}

// ===== Inicialização de mapas =====
function createMap(containerId, zoom = 2) {
    const m = L.map(containerId, { zoomControl: true }).setView([20, 0], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(m);
    return m;
}

function initMapOverview() {
    if (mapOverview) return;
    mapOverview = createMap("worldMapOverview", 1);
    clusterOverview = L.markerClusterGroup();
    mapOverview.addLayer(clusterOverview);
}

function initMapFull() {
    if (mapFull) return;
    mapFull = createMap("worldMapFull", 2);
    clusterFull = L.markerClusterGroup();
    mapFull.addLayer(clusterFull);
}

function initMapPaises() {
    if (mapPaises) return;
    mapPaises = createMap("worldMapPaises", 2);
    clusterPaises = L.markerClusterGroup();
    mapPaises.addLayer(clusterPaises);
}

function updateMapLayer(cluster, markers) {
    if (!cluster) return;
    cluster.clearLayers();
    markers.forEach(v => {
        if (!v.latitude || !v.longitude) return;
        const marker = L.circleMarker([v.latitude, v.longitude], {
            radius: Math.min(4 + v.total, 16),
            fillColor: v.total >= 10 ? "#ef4444" : v.total >= 5 ? "#f97316" : "#22c55e",
            color: "transparent",
            fillOpacity: 0.75
        });
        marker.bindPopup(`
            <b>${v.city || v.country || "?"}</b><br>
            ${v.country || ""}<br>
            <small>${v.total} visita${v.total !== 1 ? "s" : ""}</small>
        `);
        cluster.addLayer(marker);
    });
}

// ===== Overview =====
async function carregarOverview() {
    const range = getCurrentRange();
    const [stats, hourly, mapData, rankings] = await Promise.all([
        getStats(range),
        getHourly(range),
        getMap(range),
        getRankings(range)
    ]);

    // Cards
    document.getElementById("today").textContent    = stats.today ?? 0;
    document.getElementById("unique").textContent   = stats.unique ?? 0;
    document.getElementById("countries").textContent= stats.countries ?? 0;
    document.getElementById("online").textContent   = stats.online ?? 0;

    const varEl = document.getElementById("todayVariation");
    if (stats.todayVariation > 0)
        varEl.innerHTML = `<span class="card-variation positive">▲ ${stats.todayVariation}%</span>`;
    else if (stats.todayVariation < 0)
        varEl.innerHTML = `<span class="card-variation negative">▼ ${Math.abs(stats.todayVariation)}%</span>`;
    else
        varEl.innerHTML = `<span class="card-variation neutral">▬ 0%</span>`;

    // Gráfico
    renderHourlyChart(hourly);

    // Mapa overview
    initMapOverview();
    updateMapLayer(clusterOverview, mapData);

    // Rankings
    renderRanking("rankBrowsers", rankings.browsers, "browser");
    renderRanking("rankSystems",  rankings.systems,  "os");
    renderRanking("rankDevices",  rankings.devices,  "device_type");
    renderRanking("rankPages",    rankings.pages,    "page");

    // Mapa completo se já visível
    if (mapFull) updateMapLayer(clusterFull, mapData);
}

// ===== Visitantes =====
async function carregarVisitantes(page = 1) {
    currentPage = page;
    const range   = getCurrentRange();
    const visits  = await getVisits(range, page, 25);

    allVisits = visits.rows;
    renderTable(allVisits);
    renderPagination(visits, carregarVisitantes);
}

// ===== Páginas & Rankings =====
async function carregarPaginas() {
    const range    = getCurrentRange();
    const rankings = await getRankings(range);

    renderRanking("rankPagesDetail",   rankings.pages,    "page");
    renderRanking("rankBrowsersDetail",rankings.browsers, "browser");
    renderRanking("rankSystemsDetail", rankings.systems,  "os");
    renderRanking("rankDevicesDetail", rankings.devices,  "device_type");
}

// ===== Países =====
async function carregarPaises() {
    const range    = getCurrentRange();
    const [countries, mapData] = await Promise.all([
        getCountries(range),
        getMap(range)
    ]);

    const list = document.getElementById("countriesList");
    list.innerHTML = countries.map(c => `
        <div class="country-item">
            <span class="country-flag">${countryFlag(c.country_code)}</span>
            <span class="country-name">${c.country || "Desconhecido"}</span>
            <span class="country-total">${c.total}</span>
        </div>
    `).join("");

    initMapPaises();
    updateMapLayer(clusterPaises, mapData);
}

function countryFlag(code) {
    if (!code) return "🏳";
    return code.toUpperCase().replace(/./g,
        c => String.fromCodePoint(127397 + c.charCodeAt()));
}

// ===== Relatórios =====
async function carregarRelatorios() {
    const range  = getCurrentRange();
    const hourly = await getHourly(range);

    const labels = hourly.map(v =>
        typeof v.label === "number"
            ? `${String(v.label).padStart(2,"0")}:00`
            : v.label
    );
    const values = hourly.map(v => v.total);
    const total  = values.reduce((a, b) => a + b, 0);
    const avg    = values.length ? Math.round(total / values.length) : 0;
    const maxVal = Math.max(...values);
    const peakIdx = values.indexOf(maxVal);

    document.getElementById("reportTotal").textContent = total;
    document.getElementById("reportAvg").textContent   = avg + "/h";
    document.getElementById("reportPeak").textContent  =
        labels[peakIdx] ? `${labels[peakIdx]} (${maxVal})` : "—";

    const canvas = document.getElementById("reportChart");
    if (reportChart) reportChart.destroy();
    reportChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Visitas",
                data: values,
                backgroundColor: "rgba(37,99,235,.6)",
                borderColor: "#2563eb",
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,.05)" } },
                y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,.05)" } }
            }
        }
    });
}

// ===== Tempo Real =====
function startRealtime() {
    carregarRealtime();
    realtimeTimer = setInterval(carregarRealtime, 10000);
}

function stopRealtime() {
    if (realtimeTimer) { clearInterval(realtimeTimer); realtimeTimer = null; }
}

async function carregarRealtime() {
    const stats  = await getStats("today");
    const visits = await getVisits("today", 1, 20);

    document.getElementById("realtimeCount").textContent = stats.online ?? 0;

    const feed = document.getElementById("realtimeFeed");
    feed.innerHTML = visits.rows.map(v => {
        const ago = timeSince(new Date(v.created_at));
        return `
            <div class="feed-item">
                <span class="feed-flag">${countryFlag(v.country_code)}</span>
                <div class="feed-info">
                    <div>${v.city || v.country || "Desconhecido"} · ${v.browser || "?"}</div>
                    <div class="feed-url">${v.full_url || v.page || "/"}</div>
                </div>
                <span class="feed-time">${ago}</span>
            </div>
        `;
    }).join("");
}

function timeSince(date) {
    const s = Math.floor((Date.now() - date) / 1000);
    if (s < 60)  return `${s}s atrás`;
    if (s < 3600) return `${Math.floor(s/60)}min atrás`;
    return `${Math.floor(s/3600)}h atrás`;
}

// ===== Busca por IP =====
function initIpSearch() {
    document.getElementById("searchIpBtn").addEventListener("click", buscarIP);
    document.getElementById("ipInput").addEventListener("keydown", e => {
        if (e.key === "Enter") buscarIP();
    });
}

async function buscarIP() {
    const ip  = document.getElementById("ipInput").value.trim();
    const box = document.getElementById("ipResult");

    if (!ip) return;

    box.classList.remove("hidden");
    box.innerHTML = "<p style='color:var(--text-soft)'>Buscando...</p>";

    const visits = await getVisits("30", 1, 100);
    const found  = visits.rows.filter(v => v.ip === ip);

    if (!found.length) {
        box.innerHTML = `<p style='color:var(--text-soft)'>Nenhum registro encontrado para <b>${ip}</b> nos últimos 30 dias.</p>`;
        return;
    }

    box.innerHTML = `
        <p style="font-size:13px;color:var(--text-soft);margin-bottom:12px">
            ${found.length} visita${found.length !== 1 ? "s" : ""} de <b>${ip}</b>
        </p>
        ${found.map(v => `
            <div class="ip-visit-item">
                <span class="ip-visit-time">${new Date(v.created_at).toLocaleString("pt-BR")}</span>
                <span class="ip-visit-location">
                    ${countryFlag(v.country_code)} ${v.city || ""} ${v.country || ""}
                </span>
                <span class="ip-visit-url">${v.full_url || v.page || "/"}</span>
            </div>
        `).join("")}
    `;
}

// ===== Busca na tabela =====
function initTableSearch() {
    document.getElementById("searchVisits")?.addEventListener("input", (e) => {
        const termo = e.target.value.toLowerCase().trim();
        if (!termo) { renderTable(allVisits); return; }
        const filtrados = allVisits.filter(v =>
            [v.country, v.city, v.browser, v.os, v.ip, v.host, v.page_title, v.full_url]
            .filter(Boolean)
            .some(val => val.toString().toLowerCase().includes(termo))
        );
        renderTable(filtrados);
    });
}

// ===== Seletor de site =====
async function initSites() {
    const sites = await getSites();
    const sel   = document.getElementById("siteSelect");

    sel.innerHTML = `<option value="all">Todos os sites</option>`;
    sites.forEach(({ host, total }) => {
        const opt = document.createElement("option");
        opt.value = host;
        opt.textContent = `${host} (${total})`;
        sel.appendChild(opt);
    });

    if (sites.length <= 1) sel.closest(".topbar-right").querySelector(".site-select")?.classList.add("hidden");

    sel.addEventListener("change", () => {
        // getCurrentSite() já vai retornar o novo valor via siteFilter.js
        carregarOverview();
    });
}

// ===== Bootstrap =====
document.addEventListener("DOMContentLoaded", async () => {
    const user = await requireAuth();
    if (!user) return;

    // Exibe nome do usuário
    const nameEl = document.getElementById("userName");
    if (nameEl) nameEl.textContent = user.name || user.email;

    // Mostra link admin só pra superadmin
    if (user.role === "superadmin") {
        document.getElementById("adminLink")?.style.removeProperty("display");
    }

    attachLogoutHandler();

    initNav();
    initFilters(() => {
        carregarOverview();
        carregarVisitantes();
    });
    initSiteFilter(() => {
        carregarOverview();
        carregarVisitantes();
    });
    initTableSearch();
    initIpSearch();

    await carregarOverview();
    await carregarVisitantes();

    // Visitantes: reload quando a seção ficar ativa
    document.querySelector("[data-section='visitantes']").addEventListener("click", () => {
        carregarVisitantes();
    });

    document.getElementById("refresh").addEventListener("click", () => {
        carregarOverview();
        carregarVisitantes();
    });

    setInterval(carregarOverview, 30000);
});
