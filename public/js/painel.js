import { requireAuth, attachLogoutHandler, getToken, getUser } from "./auth.js";
import { getStats, getHourly, getRankings, getVisits, getCountries, getCountriesHierarchy, getMap, getSites, getSessions } from "./api.js";
import { initFilters, getCurrentRange } from "./filters.js";
import { initSiteFilter, getCurrentSite } from "./siteFilter.js";
import { renderRanking } from "./rankings.js";
import { renderHourlyChart } from "./charts.js";
import { renderTable } from "./table.js";
import { renderPagination } from "./pagination.js";

// ===== Mapas (instâncias separadas por seção) =====
let mapPaises   = null;
let clusterPaises;
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

        // Oculta controles da topbar nas abas com controles próprios
        const controls = document.getElementById("topbarControls");
        const hiddenSections = ["realtime", "visitantes", "overview", "paises", "relatorios", "porip"];
        if (controls) controls.style.display = hiddenSections.includes(sectionId) ? "none" : "";

        // Inicializa mapa quando a seção ficar visível
        if (sectionId === "paises" && !mapPaises) initMapPaises();
        if (sectionId === "realtime") startRealtime();
        else stopRealtime();

        // Invalidate map size se já existir (Leaflet precisa disso)
        if (sectionId === "paises" && mapPaises) setTimeout(() => mapPaises.invalidateSize(), 50);

        if (sectionId === "paises")  carregarPaises();
        if (sectionId === "relatorios") carregarRelatorios();
        if (sectionId === "porip") carregarTabelaIP();
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
    else {
        // Overview é a seção inicial — oculta controles da topbar
        const controls = document.getElementById("topbarControls");
        if (controls) controls.style.display = "none";
    }
}

// ===== Inicialização de mapas =====
function createMap(containerId, zoom = 2) {
    const m = L.map(containerId, { zoomControl: true }).setView([20, 0], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(m);
    return m;
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
    const [stats, hourly, rankings] = await Promise.all([
        getStats(range),
        getHourly(range),
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

    // Rankings
    renderRanking("rankBrowsers", rankings.browsers, "browser");
    renderRanking("rankSystems",  rankings.systems,  "os");
    renderRanking("rankDevices",  rankings.devices,  "device_type");
    renderRanking("rankPages",    rankings.pages,    "page");
}

// ===== Visitantes (agrupado por sessão) =====
let currentSessionPage = 1;
let allSessionsData    = [];
let searchTimer        = null;
let currentSearch      = null;
let currentGroupBy     = "visitor";

async function carregarVisitantes(page = 1, search = currentSearch, groupBy = currentGroupBy) {
    currentSessionPage = page;
    currentSearch      = search;
    currentGroupBy     = groupBy;
    const range        = getCurrentRange();
    const sessions     = await getSessions(range, page, 20, search, groupBy);
    if (!sessions) return;
    allSessionsData = sessions.rows || [];
    renderSessions(allSessionsData);
    renderSessionsPagination(sessions);

    // Atualiza cards de stats
    const stats = await getStats(range);
    if (stats) {
        const el = id => document.getElementById(id);
        if (el("visitantesToday"))   el("visitantesToday").textContent   = stats.today ?? 0;
        if (el("visitantesCountries")) el("visitantesCountries").textContent = stats.countries ?? 0;
        // Cidades: conta distintas a partir dos dados carregados
        const cities = new Set((sessions.rows || []).map(r => r.city).filter(Boolean));
        if (el("visitantesCities")) el("visitantesCities").textContent = cities.size;
    }
}

function countryFlag(code) {
    if (!code) return `<img src="https://flagcdn.com/16x12/xx.png" alt="?" style="width:16px;height:12px;border-radius:2px;vertical-align:middle">`;
    const lower = code.toLowerCase();
    return `<img src="https://flagcdn.com/16x12/${lower}.png" alt="${code}" style="width:16px;height:12px;border-radius:2px;vertical-align:middle">`;
}

function formatDuration(seconds) {
    if (!seconds || seconds < 60) return "< 1 min";
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}min`;
    return `${m} min`;
}

function formatTime(iso) {
    return new Date(iso).toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit"
    });
}

function decodeUrl(url) {
    if (!url) return "/";
    try { return decodeURIComponent(url); } catch { return url; }
}

function renderSessions(sessions) {
    const list = document.getElementById("sessionsList");

    if (!sessions.length) {
        list.innerHTML = `<p style="color:var(--text-soft);font-size:14px;padding:20px 0">Nenhuma sessão encontrada.</p>`;
        return;
    }

    list.innerHTML = sessions.map((s, idx) => {
        const pages    = s.pages || [];
        const first    = pages[0];
        const rest     = pages.slice(1);
        const hasMore  = rest.length > 0;

        const firstUrl     = first?.url || "/";
        const firstUrlDec  = decodeUrl(firstUrl);
        const flag         = countryFlag(s.country_code);
        const location     = [s.city, s.region, s.country].filter(Boolean).join(", ") || "Desconhecido";
        const entryDate    = new Date(s.last_time).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
        const entryTime    = formatTime(s.entry_time);
        const lastTime     = formatTime(s.last_time);
        const duration     = formatDuration(s.duration_seconds);

        // Linha de destaque (negrito) conforme modo de agrupamento
        let headerTop;
        if (currentGroupBy === "day") {
            // Negrito = data completa do dia
            const dayLabel = new Date(s.entry_time).toLocaleDateString("pt-BR", {
                weekday: "short", day: "2-digit", month: "2-digit", year: "numeric"
            });
            headerTop = `<span class="session-ip">${dayLabel}</span>`;
        } else if (currentGroupBy === "city") {
            // Negrito = cidade
            const cityLabel = [s.city, s.country].filter(Boolean).join(", ") || "Cidade desconhecida";
            headerTop = `<span class="session-ip">${cityLabel}</span>`;
        } else {
            // visitor ou ip: negrito = IP, depois localização
            headerTop = `<span class="session-ip">${s.ip || "?"}</span>
                         <span class="session-location">— ${location}</span>`;
        }

        const showIp = currentGroupBy === "day" || currentGroupBy === "city";

        const restHtml = rest.map(p => {
            const urlDec = decodeUrl(p.url);
            const titleBadge = p.title ? `<span class="session-page-title">${p.title}</span>` : "";
            return `
                <div class="session-page-item session-collapsed" data-session="${idx}">
                    <span class="session-page-time">${formatTime(p.time)}</span>
                    ${showIp && p.ip ? `<span class="session-page-ip">${p.ip}</span>` : ""}
                    <a href="${p.url || '/'}" target="_blank" rel="noopener"
                       class="session-page-url" title="${urlDec}">${urlDec}</a>
                    ${titleBadge}
                </div>
            `;
        }).join("");

        return `
            <div class="session-card">
                <div class="session-header">
                    <span class="session-flag">${flag}</span>
                    <div class="session-info">
                        <div class="session-top">
                            ${headerTop}
                        </div>
                        <div class="session-meta">
                            <span>🌐 ${s.browser || "?"}</span>
                            <span>🖥 ${s.os || "?"}</span>
                            <span>📄 ${s.page_count} pág.</span>
                            <span>⏱ ${duration}</span>
                            <span>🌍 ${s.host || ""}</span>
                        </div>
                    </div>
                    <span class="session-time">${entryDate} ${lastTime}</span>
                </div>
                <div class="session-pages">
                    <div class="session-page-item">
                        <span class="session-page-time">${formatTime(first?.time || s.entry_time)}</span>
                        ${showIp && first?.ip ? `<span class="session-page-ip">${first.ip}</span>` : ""}
                        <a href="${firstUrl}" target="_blank" rel="noopener"
                           class="session-page-url" title="${firstUrlDec}">${firstUrlDec}</a>
                        ${first?.title ? `<span class="session-page-title">${first.title}</span>` : ""}
                    </div>
                    ${restHtml}
                    ${hasMore ? `
                        <button class="session-expand-btn" data-session="${idx}" data-expanded="false">
                            ＋ ver mais ${rest.length} página${rest.length !== 1 ? "s" : ""}
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
    }).join("");

    // Handler expandir/recolher — usa session-collapsed (sem conflito com CSS externo)
    list.querySelectorAll(".session-expand-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx      = btn.dataset.session;
            const expanded = btn.dataset.expanded === "true";
            const items    = list.querySelectorAll(`.session-collapsed[data-session="${idx}"]`);
            items.forEach(el => {
                el.style.display = expanded ? "none" : "";
            });
            btn.dataset.expanded = String(!expanded);
            const count = items.length;
            btn.textContent = expanded
                ? `＋ ver mais ${count} página${count !== 1 ? "s" : ""}`
                : `－ recolher`;
        });
    });

    // Estado inicial: páginas extras ocultas
    list.querySelectorAll(".session-collapsed").forEach(el => {
        el.style.display = "none";
    });
}

function renderSessionsPagination(data) {
    const container = document.getElementById("sessionsPagination");
    if (!container) return;

    if (data.pages <= 1) { container.innerHTML = ""; return; }

    container.innerHTML = `
        <div class="pagination-summary">
            ${data.total} sessões · página ${data.page} de ${data.pages}
        </div>
        <div class="pagination-controls">
            <button ${data.page <= 1 ? "disabled" : ""}
                onclick="carregarVisitantes(${data.page - 1})">← Anterior</button>
            <span>Página ${data.page} de ${data.pages}</span>
            <button ${data.page >= data.pages ? "disabled" : ""}
                onclick="carregarVisitantes(${data.page + 1})">Próxima →</button>
        </div>
    `;
}

window.carregarVisitantes = carregarVisitantes;

// ===== Páginas & Rankings =====
let reportChartType = "line";

async function carregarRelatorios() {
    const range = getCurrentRange();
    const [hourly, rankings] = await Promise.all([
        getHourly(range),
        getRankings(range)
    ]);

    // Rankings
    renderRanking("rankPagesDetail",    rankings.pages,    "page");
    renderRanking("rankBrowsersDetail", rankings.browsers, "browser");
    renderRanking("rankSystemsDetail",  rankings.systems,  "os");
    renderRanking("rankDevicesDetail",  rankings.devices,  "device_type");

    // Labels e valores
    const labels = hourly.map(v =>
        typeof v.label === "number"
            ? `${String(v.label).padStart(2,"0")}:00`
            : v.label
    );
    const values  = hourly.map(v => v.total);
    const total   = values.reduce((a, b) => a + b, 0);
    const avg     = values.length ? Math.round(total / values.length) : 0;
    const maxVal  = Math.max(...values);
    const peakIdx = values.indexOf(maxVal);

    document.getElementById("reportTotal").textContent = total;
    document.getElementById("reportAvg").textContent   = avg + "/h";
    document.getElementById("reportPeak").textContent  =
        labels[peakIdx] ? `${labels[peakIdx]} (${maxVal})` : "—";

    renderReportChart(labels, values);

    // Igualar altura da coluna direita à esquerda após render completo
    setTimeout(() => {
        const left  = document.querySelector(".relatorio-left");
        const right = document.querySelector(".relatorio-right");
        if (left && right) {
            right.style.maxHeight = left.getBoundingClientRect().height + "px";
            right.style.overflowY = "auto";
        }
    }, 100);
}

function renderReportChart(labels, values) {
    const canvas = document.getElementById("reportChart");
    if (reportChart) reportChart.destroy();

    const isArea = reportChartType === "area";
    const isBar  = reportChartType === "bar";
    const type   = isBar ? "bar" : "line";

    reportChart = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{
                label: "Visitas",
                data: values,
                backgroundColor: isBar
                    ? "rgba(37,99,235,.6)"
                    : isArea
                        ? "rgba(37,99,235,.2)"
                        : "transparent",
                borderColor: "#2563eb",
                borderWidth: isBar ? 1 : 2,
                borderRadius: isBar ? 4 : 0,
                fill: isArea,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: "#2563eb"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,.05)" } },
                y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,.05)" }, beginAtZero: true }
            }
        }
    });
}

// ===== Países =====
async function carregarPaises() {
    const range = getCurrentRange();
    const [hierarchy, mapData] = await Promise.all([
        getCountriesHierarchy(range),
        getMap(range)
    ]);

    const container = document.getElementById("countriesHierarchy");
    if (!hierarchy.length) {
        container.innerHTML = "<div class='hier-empty'>Nenhum dado para o período.</div>";
    } else {
        container.innerHTML = hierarchy.map(c => buildCountryBlock(c)).join("");
        container.querySelectorAll("[data-toggle]").forEach(el => {
            el.addEventListener("click", () => {
                const target = document.getElementById(el.dataset.toggle);
                if (!target) return;
                const open = target.style.display !== "none";
                target.style.display = open ? "none" : "block";
                el.querySelector(".hier-arrow").textContent = open ? "›" : "‹";
            });
        });
    }

    initMapPaises();
    updateMapLayer(clusterPaises, mapData);
}

function buildCountryBlock(c) {
    const cid = "c_" + (c.country_code || c.country).replace(/\W/g, "_");
    return `
    <div class="hier-country">
        <div class="hier-row hier-row-country" data-toggle="${cid}">
            <span class="hier-arrow">›</span>
            <span class="hier-flag">${countryFlag(c.country_code)}</span>
            <span class="hier-label">${c.country || "Desconhecido"}</span>
            <span class="hier-count">${c.total}</span>
        </div>
        <div id="${cid}" class="hier-children" style="display:none">
            ${c.regions.map(r => buildRegionBlock(cid, r)).join("")}
        </div>
    </div>`;
}

function buildRegionBlock(cid, r) {
    const rid = cid + "_r_" + r.region.replace(/\W/g, "_");
    return `
    <div class="hier-region">
        <div class="hier-row hier-row-region" data-toggle="${rid}">
            <span class="hier-arrow">›</span>
            <span class="hier-label">${r.region}</span>
            <span class="hier-count">${r.total}</span>
        </div>
        <div id="${rid}" class="hier-children" style="display:none">
            ${r.cities.map(ci => buildCityBlock(rid, ci)).join("")}
        </div>
    </div>`;
}

function buildCityBlock(rid, ci) {
    const citid = rid + "_ci_" + ci.city.replace(/\W/g, "_");
    return `
    <div class="hier-city">
        <div class="hier-row hier-row-city" data-toggle="${citid}">
            <span class="hier-arrow">›</span>
            <span class="hier-label">${ci.city}</span>
            <span class="hier-count">${ci.total}</span>
        </div>
        <div id="${citid}" class="hier-children" style="display:none">
            ${ci.ips.map(i => `
            <div class="hier-row hier-row-ip">
                <span class="hier-ip">${i.ip}</span>
                <span class="hier-count">${i.visits}</span>
            </div>`).join("")}
        </div>
    </div>`;
}

// ===== Relatórios =====
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

    document.getElementById("realtimeCount").textContent     = stats.online ?? 0;
    document.getElementById("realtimeToday").textContent     = stats.today ?? 0;
    document.getElementById("realtimeCountries").textContent = stats.countries ?? 0;
    document.getElementById("realtimeUnique").textContent    = stats.unique ?? 0;

    // Top cidades e países a partir das visitas
    const allVisits = await getVisits("today", 1, 200);
    const rows = allVisits.rows || [];

    const cityCount    = {};
    const countryCount = {};
    const regionCount  = {};
    rows.forEach(v => {
        if (v.city)    cityCount[v.city]       = (cityCount[v.city] || 0) + 1;
        if (v.country) countryCount[v.country] = (countryCount[v.country] || 0) + 1;
        if (v.region)  regionCount[v.region]   = (regionCount[v.region] || 0) + 1;
    });

    const topCities    = Object.entries(cityCount).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topCountries = Object.entries(countryCount).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topRegions   = Object.entries(regionCount).sort((a,b) => b[1]-a[1]).slice(0,5);

    const breakdown = document.getElementById("realtimeBreakdown");
    breakdown.innerHTML = `
        ${topCountries.length ? `
            <div class="breakdown-title">🌍 Países</div>
            ${topCountries.map(([name, count]) => `
                <div class="breakdown-item">
                    <span class="breakdown-name">${name}</span>
                    <span class="breakdown-count">${count}</span>
                </div>
            `).join("")}
        ` : ""}
        ${topRegions.length ? `
            <div class="breakdown-title" style="margin-top:10px">🗺️ Regiões</div>
            ${topRegions.map(([name, count]) => `
                <div class="breakdown-item">
                    <span class="breakdown-name">${name}</span>
                    <span class="breakdown-count">${count}</span>
                </div>
            `).join("")}
        ` : ""}
        ${topCities.length ? `
            <div class="breakdown-title" style="margin-top:10px">📍 Cidades</div>
            ${topCities.map(([name, count]) => `
                <div class="breakdown-item">
                    <span class="breakdown-name">${name}</span>
                    <span class="breakdown-count">${count}</span>
                </div>
            `).join("")}
        ` : ""}
    `;

    const feed = document.getElementById("realtimeFeed");
    feed.innerHTML = visits.rows.map(v => {
        const ago      = timeSince(new Date(v.created_at));
        const location = [v.city, v.region, v.country].filter(Boolean).join(", ") || "Desconhecido";
        const url      = v.full_url || v.page || "/";
        const badge    = v.page_title
            ? `<span class="feed-badge">${v.page_title}</span>`
            : "";
        return `
            <div class="feed-item">
                <span class="feed-flag">${countryFlag(v.country_code)}</span>
                <div class="feed-info">
                    <div class="feed-top">
                        <span class="feed-ip">${v.ip || "?"}</span>
                        <span class="feed-location">— ${location} · ${v.browser || "?"}</span>
                    </div>
                    <div class="feed-bottom">
                        <a href="${url}" target="_blank" rel="noopener" class="feed-url" title="${url}">${url}</a>
                        ${badge}
                    </div>
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
let ipTableData = [];

async function carregarTabelaIP() {
    const range  = getCurrentRange();
    const visits = await getVisits(range, 1, 500);
    if (!visits) return;

    // Agrupa por IP
    const byIp = {};
    visits.rows.forEach(v => {
        if (!v.ip) return;
        if (!byIp[v.ip]) {
            byIp[v.ip] = {
                ip:          v.ip,
                country:     v.country || "",
                country_code:v.country_code || "",
                city:        v.city || "",
                region:      v.region || "",
                browser:     v.browser || "",
                os:          v.os || "",
                visits:      0,
                last_seen:   v.created_at,
                last_url:    v.full_url || v.page || "/"
            };
        }
        byIp[v.ip].visits++;
        if (v.created_at > byIp[v.ip].last_seen) {
            byIp[v.ip].last_seen = v.created_at;
            byIp[v.ip].last_url  = v.full_url || v.page || "/";
        }
    });

    ipTableData = Object.values(byIp).sort((a,b) => b.visits - a.visits);
    renderTabelaIP(ipTableData);
}

function renderTabelaIP(data) {
    const body  = document.getElementById("ipTableBody");
    const total = document.getElementById("ipTotal");
    if (total) total.textContent = `${data.length} IP${data.length !== 1 ? "s" : ""} únicos`;
    if (!body) return;

    if (!data.length) {
        body.innerHTML = `<div class="ip-grid-empty">Nenhum registro encontrado.</div>`;
        return;
    }

    body.innerHTML = data.map(r => `
        <div class="ip-grid-row">
            <div class="ip-col ip-col-ip">${r.ip}</div>
            <div class="ip-col">${countryFlag(r.country_code)} ${r.country}</div>
            <div class="ip-col">${r.city}</div>
            <div class="ip-col">${r.region}</div>
            <div class="ip-col">${r.browser}</div>
            <div class="ip-col">${r.os}</div>
            <div class="ip-col ip-col-num ip-visits">${r.visits}</div>
            <div class="ip-col ip-time">${new Date(r.last_seen).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
            <div class="ip-col ip-col-url"><a href="${r.last_url}" target="_blank" rel="noopener">${r.last_url}</a></div>
        </div>
    `).join("");
}

function initIpSearch() {
    document.getElementById("ipFilterInput")?.addEventListener("input", e => {
        const termo = e.target.value.toLowerCase().trim();
        if (!termo) return renderTabelaIP(ipTableData);
        const filtered = ipTableData.filter(r =>
            r.ip.includes(termo) ||
            r.country.toLowerCase().includes(termo) ||
            r.city.toLowerCase().includes(termo) ||
            r.region.toLowerCase().includes(termo) ||
            r.browser.toLowerCase().includes(termo) ||
            r.last_url.toLowerCase().includes(termo)
        );
        renderTabelaIP(filtered);
    });

    document.getElementById("refreshPorIP")?.addEventListener("click", carregarTabelaIP);

    // Seletor de tipo de gráfico nos Relatórios
    document.querySelectorAll(".chart-type-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".chart-type-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            reportChartType = btn.dataset.type;
            if (reportChart) {
                const labels = reportChart.data.labels;
                const values = reportChart.data.datasets[0].data;
                renderReportChart(labels, values);
            }
        });
    });
}

// ===== Busca na sessão (server-side com debounce) =====
function initTableSearch() {
    document.getElementById("searchVisits")?.addEventListener("input", (e) => {
        const termo = e.target.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            carregarVisitantes(1, termo || null);
        }, 400);
    });
}

// ===== Seletor de site =====
// initSites removido — initSiteFilter (siteFilter.js) já popula e monitora o seletor

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

    // Filtro global — atualiza todas as abas ao mudar período
    initFilters(() => {
        carregarOverview();
        carregarVisitantes(1, null);
        carregarPaises();
        carregarRelatorios();
        carregarTabelaIP();
    });

    // Seletor de sites da aba Overview
    initSiteFilter(() => {
        carregarOverview();
    }, "siteSelectOverview");

    // Refresh da aba Overview
    document.getElementById("refreshOverview")?.addEventListener("click", () => {
        carregarOverview();
    });

    initSiteFilter(() => {
        currentSearch = null;
        const searchInput = document.getElementById("searchVisits");
        if (searchInput) searchInput.value = "";
        carregarOverview();
        carregarVisitantes(1, null);
    });

    // Seletor de sites da aba Visitantes (independente)
    initSiteFilter(() => {
        currentSearch = null;
        const searchInput = document.getElementById("searchVisits");
        if (searchInput) searchInput.value = "";
        carregarVisitantes(1, null);
    }, "siteSelectVisitantes");

    // Refresh da aba Visitantes
    document.getElementById("refreshVisitantes")?.addEventListener("click", () => {
        carregarVisitantes(1, currentSearch);
    });
    initTableSearch();
    initIpSearch();

    // Seletor de agrupamento
    document.getElementById("groupBySelect")?.addEventListener("change", (e) => {
        currentGroupBy = e.target.value;
        carregarVisitantes(1, currentSearch, currentGroupBy);
    });

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

    // Botão exportar CSV
    const exportBtn = document.getElementById("exportCsvBtn");
    if (exportBtn) {
        // Verifica se o plano permite exportar
        const token = getToken();
        const planRes = await fetch("/api/sites/plan", {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()).catch(() => null);

        if (planRes && !planRes.can_export) {
            exportBtn.classList.add("locked");
            exportBtn.title = "Disponível apenas no plano Pro";
            exportBtn.textContent = "🔒 Exportar CSV (Pro)";
        }

        exportBtn.addEventListener("click", async () => {
            if (exportBtn.classList.contains("locked")) {
                alert("A exportação CSV está disponível apenas no plano Pro.\n\nFale conosco para fazer upgrade.");
                return;
            }

            const range  = getCurrentRange();
            const site   = getCurrentSite();
            const params = new URLSearchParams({ range });
            if (site && site !== "all") params.set("site", site);

            const url = `/api/stats/export/csv?${params}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });

            if (!res.ok) {
                const data = await res.json();
                alert(data.error || "Erro ao exportar.");
                return;
            }

            const blob     = await res.blob();
            const link     = document.createElement("a");
            link.href      = URL.createObjectURL(blob);
            link.download  = `visitas_${new Date().toISOString().slice(0,10)}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }

    setInterval(carregarOverview, 30000);
});
