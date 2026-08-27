import { requireAuth, attachLogoutHandler, getToken, getUser } from "./auth.js";
import { getStats, getHourly, getRankings, getVisits, getCountries, getCountriesHierarchy, getMap, getSites, getSessions, blockIp, unblockIp, getBlockedIps, getFavoriteIps, favoriteIp, unfavoriteIp, getIpDetail, getHourlyForRange } from "./api.js";
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
let realtimeTimer      = null;
let lastVisitTimestamp = null;  // timestamp da visita mais recente conhecida
let toastQueue         = [];    // fila de toasts pendentes
let toastShowing       = false; // controle de exibição sequencial

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
let favoriteIpSet      = new Set(); // IPs favoritados pelo usuário
let isProUser         = false;  // Atualizado após login

async function carregarVisitantes(page = 1, search = currentSearch, groupBy = currentGroupBy) {
    currentSessionPage = page;
    currentSearch      = search;
    currentGroupBy     = groupBy;
    const range        = getCurrentRange();
    const sessions     = await getSessions(range, page, 20, search, groupBy);
    if (!sessions) return;
    allSessionsData = sessions.rows || [];

    // Carrega favoritos (só Pro) para destacar visualmente antes de renderizar
    if (isProUser) {
        try {
            const favs = await getFavoriteIps();
            favoriteIpSet = new Set((favs || []).map(f => f.ip));
        } catch { favoriteIpSet = new Set(); }
    } else {
        favoriteIpSet = new Set();
    }

    renderSessions(allSessionsData);
    renderSessionsPagination(sessions);

    // Handler botões favoritar IP ⭐
    document.querySelectorAll(".btn-favorite-ip").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const ip = btn.dataset.ip;
            if (!ip) return;
            btn.disabled = true;
            if (favoriteIpSet.has(ip)) {
                btn.textContent = "⏳";
                const res = await unfavoriteIp(ip);
                if (res.success) {
                    favoriteIpSet.delete(ip);
                    btn.textContent = "☆";
                    btn.title = "Favoritar IP";
                    btn.classList.remove("favorited");
                    btn.closest(".session-card")?.classList.remove("session-card--favorited");
                } else {
                    btn.textContent = "⭐";
                }
            } else {
                btn.textContent = "⏳";
                const res = await favoriteIp(ip);
                if (res.success) {
                    favoriteIpSet.add(ip);
                    btn.textContent = "⭐";
                    btn.title = "Desfavoritar IP";
                    btn.classList.add("favorited");
                    btn.closest(".session-card")?.classList.add("session-card--favorited");
                } else {
                    btn.textContent = "☆";
                }
            }
            btn.disabled = false;
        });
    });

    // Handler botões bloquear IP
    document.querySelectorAll(".btn-block-ip").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const ip = btn.dataset.ip;
            if (!ip) return;
            const confirma = confirm(`Bloquear IP ${ip}?\n\nNovas visitas deste IP serão ignoradas.`);
            if (!confirma) return;
            btn.disabled = true;
            btn.textContent = "⏳";
            const res = await blockIp(ip);
            if (res.success) {
                btn.textContent = "✅";
                btn.title = "IP bloqueado";
                setTimeout(() => { btn.textContent = "🚫"; btn.disabled = false; }, 2000);
            } else {
                btn.textContent = "🚫";
                btn.disabled = false;
                alert("Erro ao bloquear IP.");
            }
        });
    });

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

function formatReferrer(ref) {
    if (!ref) return "Direto";
    try {
        const url = new URL(ref);
        const host = url.hostname.replace("www.", "");
        if (host.includes("google")) return "Google";
        if (host.includes("bing")) return "Bing";
        if (host.includes("facebook")) return "Facebook";
        if (host.includes("instagram")) return "Instagram";
        if (host.includes("twitter") || host.includes("t.co")) return "Twitter/X";
        if (host.includes("youtube")) return "YouTube";
        if (host.includes("whatsapp")) return "WhatsApp";
        return host;
    } catch { return ref; }
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
        const entryTime    = formatTime(s.entry_time);
        const lastTime     = formatTime(s.last_time);
        const entryDate    = new Date(s.last_time).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
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
            const isFav = favoriteIpSet.has(s.ip);
            const favBtn = isProUser
                ? `<button class="btn-favorite-ip${isFav ? " favorited" : ""}" data-ip="${s.ip}" title="${isFav ? "Desfavoritar IP" : "Favoritar IP"}">${isFav ? "⭐" : "☆"}</button>`
                : "";
            headerTop = `<span class="session-ip">${s.ip || "?"}</span>
                         <span class="session-location">— ${location}</span>
                         ${favBtn}
                         <button class="btn-block-ip" data-ip="${s.ip}" title="Bloquear IP">🚫</button>`;
        }

        const showIp = currentGroupBy === "day" || currentGroupBy === "city";

        const restHtml = rest.map(p => {
            const urlDec = decodeUrl(p.url);
            const titleBadge = p.title ? `<span class="session-page-title">${p.title}</span>` : "";
            const pageDate = new Date(p.time).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
            const pageTime = formatTime(p.time);
            return `
                <div class="session-page-item session-collapsed" data-session="${idx}">
                    <span class="session-page-time">${pageDate} ${pageTime}</span>
                    ${showIp && p.ip ? `<span class="session-page-ip">${p.ip}</span>` : ""}
                    <a href="${p.url || '/'}" target="_blank" rel="noopener"
                       class="session-page-url" title="${urlDec}">${urlDec}</a>
                    ${titleBadge}
                </div>
            `;
        }).join("");

        const cardFavClass = (s.ip && favoriteIpSet.has(s.ip)) ? " session-card--favorited" : "";
        return `
            <div class="session-card${cardFavClass}">
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
                            ${s.isp ? `<span class="session-isp" title="Operadora/ISP">📡 ${s.isp}</span>` : ""}
                            ${s.referrer ? `<span class="session-referrer" title="Origem: ${decodeUrl(s.referrer)}">🔗 ${formatReferrer(s.referrer)}</span>` : ""}
                        </div>
                    </div>
                    <span class="session-time">${lastTime}</span>
                </div>
                <div class="session-pages">
                    <div class="session-page-item">
                        <span class="session-page-time">${new Date(first?.time || s.entry_time).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})} ${formatTime(first?.time || s.entry_time)}</span>
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
    const summary   = document.getElementById("sessionsSummary");
    const container = document.getElementById("sessionsPagination");
    if (!container || !summary) return;

    // Summary sempre visível no topo quando há dados
    summary.innerHTML = data.total > 0
        ? `<span class="pagination-summary">${data.total} sessões · página ${data.page} de ${data.pages}</span>`
        : "";

    // Controls só quando há mais de 1 página
    if (data.pages <= 1) { container.innerHTML = ""; return; }

    container.innerHTML = `
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
let reportChartType   = "line";
let compareEnabled    = false;
let compareStart      = "";
let compareEnd        = "";

async function carregarRelatorios() {
    const range = getCurrentRange();

    // Monta requisições — comparação opcional
    const requests = [getHourly(range), getRankings(range)];
    if (compareEnabled && compareStart && compareEnd) {
        requests.push(getHourlyForRange(compareStart, compareEnd));
    }

    const [hourly, rankings, hourlyCompare] = await Promise.all(requests);

    // Rankings
    renderRanking("rankPagesDetail",    rankings.pages,    "page");
    renderRanking("rankBrowsersDetail", rankings.browsers, "browser");
    renderRanking("rankSystemsDetail",  rankings.systems,  "os");
    renderRanking("rankDevicesDetail",  rankings.devices,  "device_type");
    renderRanking("rankReferrersDetail", rankings.referrers, "referrer");

    // Labels e valores do período atual
    const labels  = hourly.map(v =>
        typeof v.label === "number"
            ? `${String(v.label).padStart(2,"0")}:00`
            : v.label
    );
    const values  = hourly.map(v => v.total);
    const total   = values.reduce((a, b) => a + b, 0);
    const avg     = values.length ? Math.round(total / values.length) : 0;
    const maxVal  = Math.max(...values);
    const peakIdx = values.indexOf(maxVal);

    // Valores de comparação
    const valuesCompare = hourlyCompare ? hourlyCompare.map(v => v.total) : null;
    const totalCompare  = valuesCompare ? valuesCompare.reduce((a, b) => a + b, 0) : null;

    // Atualiza cards com delta
    document.getElementById("reportTotal").innerHTML = total + renderDelta(total, totalCompare);
    document.getElementById("reportAvg").textContent = avg + "/h";
    document.getElementById("reportPeak").textContent =
        labels[peakIdx] ? `${labels[peakIdx]} (${maxVal})` : "—";

    renderReportChart(labels, values, valuesCompare);
}

function renderDelta(current, previous) {
    if (previous === null || previous === undefined) return "";
    if (previous === 0) return previous === current ? "" : ` <span class="delta delta-up">novo</span>`;
    const pct  = Math.round(((current - previous) / previous) * 100);
    const cls  = pct >= 0 ? "delta-up" : "delta-down";
    const sign = pct >= 0 ? "+" : "";
    return ` <span class="delta ${cls}">${sign}${pct}%</span>`;
}

function renderReportChart(labels, values, valuesCompare = null) {
    const canvas = document.getElementById("reportChart");
    if (reportChart) reportChart.destroy();

    const isArea = reportChartType === "area";
    const isBar  = reportChartType === "bar";
    const type   = isBar ? "bar" : "line";
    const hasCompare = valuesCompare && valuesCompare.length > 0;

    // Alinha labels de comparação ao mesmo tamanho
    const compareData = hasCompare
        ? labels.map((_, i) => valuesCompare[i] ?? 0)
        : [];

    const datasets = [{
        label: "Período atual",
        data: values,
        backgroundColor: isBar ? "rgba(37,99,235,.6)" : isArea ? "rgba(37,99,235,.2)" : "transparent",
        borderColor: "#2563eb",
        borderWidth: isBar ? 1 : 2,
        borderRadius: isBar ? 4 : 0,
        fill: isArea,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: "#2563eb"
    }];

    if (hasCompare) {
        datasets.push({
            label: "Período anterior",
            data: compareData,
            backgroundColor: isBar ? "rgba(245,158,11,.35)" : isArea ? "rgba(245,158,11,.15)" : "transparent",
            borderColor: "#f59e0b",
            borderWidth: isBar ? 1 : 2,
            borderRadius: isBar ? 4 : 0,
            borderDash: isBar ? [] : [5, 4],
            fill: isArea,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: "#f59e0b"
        });
    }

    reportChart = new Chart(canvas, {
        type,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: hasCompare, labels: { color: "#94a3b8", boxWidth: 12 } }
            },
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

// ===== IPs Bloqueados =====
async function loadBlockedIps() {
    const list = document.getElementById("blockedIpsList");
    list.innerHTML = '<div class="modal-loading">Carregando...</div>';
    const blocked = await getBlockedIps();
    if (!blocked.length) {
        list.innerHTML = '<div class="blocked-ips-empty">Nenhum IP bloqueado.</div>';
        return;
    }
    list.innerHTML = blocked.map(b => `
        <div class="blocked-ip-item" data-ip="${b.ip}">
            <span class="blocked-ip-addr">${b.ip}</span>
            <span class="blocked-ip-date">${new Date(b.created_at).toLocaleDateString("pt-BR")}</span>
            <button class="btn-unblock" data-ip="${b.ip}">🔓 Desbloquear</button>
        </div>
    `).join("");

    list.querySelectorAll(".btn-unblock").forEach(btn => {
        btn.addEventListener("click", async () => {
            const ip = btn.dataset.ip;
            btn.disabled = true;
            btn.textContent = "⏳";
            await unblockIp(ip);
            btn.closest(".blocked-ip-item").remove();
            if (!list.querySelector(".blocked-ip-item")) {
                list.innerHTML = '<div class="blocked-ips-empty">Nenhum IP bloqueado.</div>';
            }
        });
    });
}

// ===== IPs Favoritos =====
async function loadFavoriteIps() {
    const list = document.getElementById("favoriteIpsList");
    list.innerHTML = '<div class="modal-loading">Carregando...</div>';
    const favs = await getFavoriteIps();
    if (!favs || !favs.length) {
        list.innerHTML = '<div class="blocked-ips-empty">Nenhum IP favorito.</div>';
        return;
    }
    list.innerHTML = favs.map(f => `
        <div class="blocked-ip-item" data-ip="${f.ip}">
            <span class="blocked-ip-addr">⭐ ${f.ip}</span>
            ${f.label ? `<span class="blocked-ip-date">${f.label}</span>` : ""}
            <span class="blocked-ip-date">${new Date(f.created_at).toLocaleDateString("pt-BR")}</span>
            <button class="btn-unfavorite" data-ip="${f.ip}">✕ Remover</button>
        </div>
    `).join("");

    list.querySelectorAll(".btn-unfavorite").forEach(btn => {
        btn.addEventListener("click", async () => {
            const ip = btn.dataset.ip;
            btn.disabled = true;
            btn.textContent = "⏳";
            await unfavoriteIp(ip);
            favoriteIpSet.delete(ip);
            btn.closest(".blocked-ip-item").remove();
            if (!list.querySelector(".blocked-ip-item")) {
                list.innerHTML = '<div class="blocked-ips-empty">Nenhum IP favorito.</div>';
            }
        });
    });
}

// ===== Relatórios =====
// ===== Tempo Real =====
function startRealtime() {
    carregarRealtime();
    realtimeTimer = setInterval(carregarRealtime, 10000);
}

function stopRealtime() {
    if (realtimeTimer) { clearInterval(realtimeTimer); realtimeTimer = null; }
    lastVisitTimestamp = null; toastQueue = []; toastShowing = false;
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

    // Detecta novas visitas e dispara toasts
    if (visits.rows && visits.rows.length > 0) {
        const newest = visits.rows[0].created_at;
        if (lastVisitTimestamp === null) {
            // Primeira carga — só registra, não notifica
            lastVisitTimestamp = newest;
        } else if (newest > lastVisitTimestamp) {
            // Há visitas novas — notifica cada uma
            const novas = visits.rows.filter(v => v.created_at > lastVisitTimestamp);
            novas.reverse().forEach(v => queueToast(v));
            lastVisitTimestamp = newest;
        }
    }

    const feed = document.getElementById("realtimeFeed");
    feed.innerHTML = visits.rows.map(v => {
        const ago      = timeSince(new Date(v.created_at));
        const location = [v.city, v.region, v.country].filter(Boolean).join(", ") || "Desconhecido";
        const url      = decodeUrl(v.full_url || v.page || "/");
        const ispLabel = v.isp ? ` · <span class="feed-isp">${v.isp}</span>` : "";
        const badge    = v.page_title
            ? `<span class="feed-badge">${v.page_title}</span>`
            : "";
        return `
            <div class="feed-item">
                <span class="feed-flag">${countryFlag(v.country_code)}</span>
                <div class="feed-info">
                    <div class="feed-top">
                        <span class="feed-ip">${v.ip || "?"}</span>
                        <span class="feed-location">— ${location} · ${v.browser || "?"}${ispLabel}</span>
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

// ===== Toast de nova visita =====
function showVisitToast(v) {
    const label    = v.page_title || v.page || v.host || "Nova visita";
    const location = [v.city, v.country].filter(Boolean).join(" · ") || "Localização desconhecida";
    const browser  = v.browser || "";

    const toast = document.createElement("div");
    toast.className = "visit-toast";
    toast.innerHTML = `
        <div class="visit-toast-icon">${countryFlag(v.country_code) || "🌐"}</div>
        <div class="visit-toast-body">
            <div class="visit-toast-title">${escHtml(label)}</div>
            <div class="visit-toast-sub">${escHtml(location)}${browser ? " · " + escHtml(browser) : ""}</div>
        </div>
        <button class="visit-toast-close" title="Fechar">✕</button>
    `;
    toast.querySelector(".visit-toast-close").addEventListener("click", () => dismissToast(toast));
    document.body.appendChild(toast);

    // Anima entrada
    requestAnimationFrame(() => toast.classList.add("visit-toast--in"));

    // Auto-dismiss após 5s
    const timer = setTimeout(() => dismissToast(toast), 5000);
    toast.dataset.timer = timer;
}

function dismissToast(toast) {
    clearTimeout(Number(toast.dataset.timer));
    toast.classList.remove("visit-toast--in");
    toast.classList.add("visit-toast--out");
    toast.addEventListener("transitionend", () => {
        toast.remove();
        toastShowing = false;
        if (toastQueue.length) showVisitToast(toastQueue.shift());
    }, { once: true });
}

function escHtml(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function queueToast(v) {
    if (!toastShowing) {
        toastShowing = true;
        showVisitToast(v);
    } else {
        // Máximo 3 na fila para não acumular
        if (toastQueue.length < 3) toastQueue.push(v);
    }
}

function timeSince(date) {
    const s = Math.floor((Date.now() - date) / 1000);
    if (s < 60)  return `${s}s atrás`;
    if (s < 3600) return `${Math.floor(s/60)}min atrás`;
    return `${Math.floor(s/3600)}h atrás`;
}

// ===== Busca por IP =====
let ipTableData   = [];
let ipSortCol     = "visits";
let ipSortDir     = "desc";
let activeIpRow   = null; // IP atualmente expandido

async function carregarTabelaIP() {
    const range  = getCurrentRange();
    const visits = await getVisits(range, 1, 2000);
    if (!visits) return;

    const byIp = {};
    visits.rows.forEach(v => {
        if (!v.ip) return;
        if (!byIp[v.ip]) {
            byIp[v.ip] = {
                ip:           v.ip,
                country:      v.country      || "",
                country_code: v.country_code || "",
                city:         v.city         || "",
                region:       v.region       || "",
                browser:      v.browser      || "",
                os:           v.os           || "",
                isp:          v.isp          || "",
                referrer:     v.referrer     || "",
                visits:       0,
                last_seen:    v.created_at,
                last_url:     v.full_url || v.page || "/",
                last_title:   v.page_title   || ""
            };
        }
        byIp[v.ip].visits++;
        if (v.created_at > byIp[v.ip].last_seen) {
            byIp[v.ip].last_seen  = v.created_at;
            byIp[v.ip].last_url   = v.full_url || v.page || "/";
            byIp[v.ip].last_title = v.page_title || "";
        }
        // mantém ISP/referrer mais recentes
        if (v.isp)      byIp[v.ip].isp      = v.isp;
        if (v.referrer) byIp[v.ip].referrer = v.referrer;
    });

    ipTableData = Object.values(byIp);
    sortAndRenderIP();
}

function sortIpData(data) {
    return [...data].sort((a, b) => {
        let av = a[ipSortCol] ?? "";
        let bv = b[ipSortCol] ?? "";
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        if (av < bv) return ipSortDir === "asc" ? -1 :  1;
        if (av > bv) return ipSortDir === "asc" ?  1 : -1;
        return 0;
    });
}

function sortAndRenderIP(data = ipTableData) {
    renderTabelaIP(sortIpData(data));
}

function renderTabelaIP(data) {
    const body  = document.getElementById("ipTableBody");
    const total = document.getElementById("ipTotal");
    if (total) total.textContent = `${data.length} IP${data.length !== 1 ? "s" : ""} únicos`;
    if (!body) return;

    // Atualiza setas no header
    document.querySelectorAll(".ip-grid-head .ip-col[data-sort]").forEach(th => {
        th.classList.remove("sort-asc","sort-desc");
        if (th.dataset.sort === ipSortCol) th.classList.add("sort-" + ipSortDir);
    });

    if (!data.length) {
        body.innerHTML = `<div class="ip-grid-empty">Nenhum registro encontrado.</div>`;
        return;
    }

    body.innerHTML = data.map(r => {
        let shortUrl = "/";
        try {
            if (r.last_url) {
                const u = new URL(r.last_url);
                const path = decodeURIComponent(u.pathname) || "/";
                // Se pathname é só "/" mas tem query string, usa page_title ou a URL decodificada
                if (path === "/" && u.search) {
                    shortUrl = r.last_title || decodeURIComponent(u.search.slice(1, 50)) + "…";
                } else {
                    shortUrl = path;
                }
                if (shortUrl.length > 55) shortUrl = shortUrl.slice(0, 53) + "…";
            }
        } catch { shortUrl = r.last_url || "/"; }
        return `
        <div class="ip-row-wrapper">
            <div class="ip-grid-row" data-ip="${r.ip}">
                <div class="ip-col ip-col-ip" title="${r.ip}">${r.ip}</div>
                <div class="ip-col">${countryFlag(r.country_code)} ${r.country}</div>
                <div class="ip-col">${r.city}</div>
                <div class="ip-col">${r.isp || "—"}</div>
                <div class="ip-col">${r.browser}</div>
                <div class="ip-col">${r.os}</div>
                <div class="ip-col ip-col-num ip-visits">${r.visits}</div>
                <div class="ip-col ip-time">${new Date(r.last_seen).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
                <div class="ip-col ip-col-url" title="${r.last_url}"><a href="${r.last_url}" target="_blank" rel="noopener">${shortUrl}</a></div>
            </div>
            <div class="ip-detail-panel hidden" data-detail="${r.ip}">
                <div class="ip-detail-loading">⏳ Carregando detalhes...</div>
            </div>
        </div>`;
    }).join("");

    // Clique na linha — expande painel de detalhes
    body.querySelectorAll(".ip-grid-row").forEach(row => {
        row.addEventListener("click", async (e) => {
            if (e.target.closest("a")) return; // não expande ao clicar em link
            const ip     = row.dataset.ip;
            const panel  = row.nextElementSibling; // .ip-detail-panel logo após a row
            if (!panel) return;

            const isOpen = !panel.classList.contains("hidden");
            // Fecha outros
            body.querySelectorAll(".ip-detail-panel").forEach(p => p.classList.add("hidden"));
            body.querySelectorAll(".ip-grid-row").forEach(r => r.classList.remove("ip-row-active"));

            if (isOpen) return; // toggle: fecha se já estava aberto

            panel.classList.remove("hidden");
            row.classList.add("ip-row-active");

            if (panel.dataset.loaded) return; // já carregado

            const range = getCurrentRange();
            const detail = await getIpDetail(ip, range.range || "30");
            if (!detail) {
                panel.innerHTML = `<div class="ip-detail-error">Erro ao carregar detalhes.</div>`;
                return;
            }

            const s = detail.summary;
            const pages = detail.visits.slice(0, 50).map(v => `
                <div class="ip-detail-visit">
                    <span class="ip-detail-time">${new Date(v.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                    <span class="ip-detail-page"><a href="${v.full_url || v.page}" target="_blank">${v.page_title || v.page || v.full_url || "/"}</a></span>
                    ${v.referrer ? `<span class="ip-detail-ref">🔗 ${formatReferrer(v.referrer)}</span>` : ""}
                </div>
            `).join("");

            panel.innerHTML = `
                <div class="ip-detail-inner">
                    <div class="ip-detail-meta">
                        <span>🌍 ${countryFlag(s.country_code)} ${s.country} · ${s.city}${s.region ? ", " + s.region : ""}</span>
                        <span>📡 ${s.isp || "ISP desconhecido"}</span>
                        <span>🖥 ${s.browser} · ${s.os}</span>
                        <span>👁 ${s.total_visits} visita${s.total_visits !== 1 ? "s" : ""}</span>
                        <span>🕐 Primeira: ${s.first_seen ? new Date(s.first_seen).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—"}</span>
                        <span>🕐 Última: ${s.last_seen ? new Date(s.last_seen).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—"}</span>
                    </div>
                    <div class="ip-detail-visits">${pages || "<em>Sem visitas no período.</em>"}</div>
                </div>`;
            panel.dataset.loaded = "1";
        });
    });
}

function initIpSearch() {
    document.getElementById("ipFilterInput")?.addEventListener("input", e => {
        const termo = e.target.value.toLowerCase().trim();
        if (!termo) return sortAndRenderIP(ipTableData);
        const filtered = ipTableData.filter(r =>
            r.ip.includes(termo) ||
            r.country.toLowerCase().includes(termo) ||
            r.city.toLowerCase().includes(termo) ||
            r.region.toLowerCase().includes(termo) ||
            r.browser.toLowerCase().includes(termo) ||
            r.os.toLowerCase().includes(termo) ||
            r.isp.toLowerCase().includes(termo) ||
            r.referrer.toLowerCase().includes(termo) ||
            r.last_url.toLowerCase().includes(termo)
        );
        sortAndRenderIP(filtered);
    });

    // Ordenação por coluna
    document.querySelectorAll(".ip-grid-head .ip-col[data-sort]").forEach(th => {
        th.style.cursor = "pointer";
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (ipSortCol === col) {
                ipSortDir = ipSortDir === "asc" ? "desc" : "asc";
            } else {
                ipSortCol = col;
                ipSortDir = col === "visits" ? "desc" : "asc";
            }
            const termo = document.getElementById("ipFilterInput")?.value?.toLowerCase().trim() || "";
            const base  = termo ? ipTableData.filter(r =>
                r.ip.includes(termo) ||
                r.country.toLowerCase().includes(termo) ||
                r.city.toLowerCase().includes(termo) ||
                r.region.toLowerCase().includes(termo) ||
                r.browser.toLowerCase().includes(termo) ||
                r.os.toLowerCase().includes(termo) ||
                r.isp.toLowerCase().includes(termo) ||
                r.referrer.toLowerCase().includes(termo) ||
                r.last_url.toLowerCase().includes(termo)
            ) : ipTableData;
            sortAndRenderIP(base);
        });
    });

    document.getElementById("refreshPorIP")?.addEventListener("click", carregarTabelaIP);

    // Toggle comparação de períodos
    document.getElementById("compareToggle")?.addEventListener("click", () => {
        compareEnabled = !compareEnabled;
        const panel = document.getElementById("comparePanel");
        const btn   = document.getElementById("compareToggle");
        panel?.classList.toggle("hidden", !compareEnabled);
        btn?.classList.toggle("active", compareEnabled);
        if (!compareEnabled) carregarRelatorios(); // recarrega sem comparação
    });

    document.getElementById("applyCompare")?.addEventListener("click", () => {
        compareStart = document.getElementById("compareStart")?.value || "";
        compareEnd   = document.getElementById("compareEnd")?.value   || "";
        if (!compareStart || !compareEnd) return;
        if (compareEnd < compareStart) {
            alert("A data final de comparação não pode ser anterior à data inicial.");
            return;
        }
        carregarRelatorios();
    });

    // Validação: data final nunca menor que inicial (custom range e compare)
    function bindDateValidation(startId, endId) {
        const s = document.getElementById(startId);
        const e = document.getElementById(endId);
        if (!s || !e) return;
        s.addEventListener("change", () => { if (e.value && e.value < s.value) e.value = s.value; });
        e.addEventListener("change", () => { if (s.value && e.value < s.value) e.value = s.value; });
    }
    bindDateValidation("dateStartRelatorios", "dateEndRelatorios");
    bindDateValidation("compareStart", "compareEnd");
    bindDateValidation("dateStartOverview", "dateEndOverview");
    bindDateValidation("dateStartVisitantes", "dateEndVisitantes");

    // Atalho: preenche comparação automática (período anterior equivalente)
    document.getElementById("compareAuto")?.addEventListener("click", () => {
        const range = getCurrentRange();
        const fmt   = d => d.toISOString().slice(0, 10);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let periodStart, periodEnd, days;

        if (typeof range === "object" && range.start && range.end) {
            // Custom: usa as datas exatas do período atual
            periodStart = new Date(range.start);
            periodEnd   = new Date(range.end);
            const ms    = periodEnd - periodStart;
            days        = Math.max(1, Math.round(ms / 86400000)) + 1;
        } else {
            // Predefinido: calcula as datas reais do período atual
            periodEnd   = new Date(today);
            if (range === "today") {
                periodStart = new Date(today);
                days = 1;
            } else {
                days = parseInt(range) || 30;
                periodStart = new Date(today);
                periodStart.setDate(today.getDate() - days + 1);
            }
        }

        // Período anterior = mesma duração, imediatamente antes
        const compareEndDate   = new Date(periodStart);
        compareEndDate.setDate(compareEndDate.getDate() - 1);
        const compareStartDate = new Date(compareEndDate);
        compareStartDate.setDate(compareEndDate.getDate() - days + 1);

        document.getElementById("compareStart").value = fmt(compareStartDate);
        document.getElementById("compareEnd").value   = fmt(compareEndDate);
        compareStart = fmt(compareStartDate);
        compareEnd   = fmt(compareEndDate);
        carregarRelatorios();
    });

    // Seletor de tipo de gráfico nos Relatórios
    document.querySelectorAll(".chart-type-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".chart-type-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            reportChartType = btn.dataset.type;
            if (reportChart) {
                const labels  = reportChart.data.labels;
                const values  = reportChart.data.datasets[0].data;
                const compare = reportChart.data.datasets[1]?.data || null;
                renderReportChart(labels, values, compare);
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

    // Preenche dados do dropdown
    const nameEl = document.getElementById("userName");
    if (nameEl) nameEl.textContent = user.name || user.email?.split("@")[0];
    const dropName  = document.getElementById("userDropdownName");
    const dropEmail = document.getElementById("userDropdownEmail");
    const dropPlan  = document.getElementById("userDropdownPlan");
    if (dropName)  dropName.textContent  = user.name || "—";
    if (dropEmail) dropEmail.textContent = user.email || "—";
    if (dropPlan)  dropPlan.textContent  = user.plan === "pro" ? "⭐ Pro" : "Gratuito";
    isProUser = user.plan === "pro";

    // Mostra item de favoritos só para Pro
    const menuFavEl = document.getElementById("menuFavoriteIps");
    if (menuFavEl && !isProUser) menuFavEl.style.display = "none";

    // Toggle dropdown
    const menuBtn      = document.getElementById("userMenuBtn");
    const dropdown     = document.getElementById("userDropdown");
    menuBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", () => dropdown?.classList.add("hidden"));

    // Logout
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        import("./auth.js").then(({ clearSession }) => {
            clearSession();
            window.location.href = "/login.html";
        });
    });

    // Mostra link admin só pra superadmin
    if (user.role === "superadmin") {
        document.getElementById("adminLink")?.style.removeProperty("display");
    }

    // === MODAL IPs BLOQUEADOS ===
    const modalBlockedIps = document.getElementById("modalBlockedIps");
    document.getElementById("menuBlockedIps")?.addEventListener("click", async () => {
        dropdown.classList.add("hidden");
        modalBlockedIps.classList.remove("hidden");
        await loadBlockedIps();
    });
    document.getElementById("closeModalBlockedIps")?.addEventListener("click", () => {
        modalBlockedIps.classList.add("hidden");
    });
    modalBlockedIps?.addEventListener("click", (e) => {
        if (e.target === modalBlockedIps) modalBlockedIps.classList.add("hidden");
    });

    // === MODAL IPs FAVORITOS ===
    const modalFavoriteIps = document.getElementById("modalFavoriteIps");
    document.getElementById("menuFavoriteIps")?.addEventListener("click", async () => {
        dropdown.classList.add("hidden");
        modalFavoriteIps.classList.remove("hidden");
        await loadFavoriteIps();
    });
    document.getElementById("closeModalFavoriteIps")?.addEventListener("click", () => {
        modalFavoriteIps.classList.add("hidden");
    });
    modalFavoriteIps?.addEventListener("click", (e) => {
        if (e.target === modalFavoriteIps) modalFavoriteIps.classList.add("hidden");
    });

    // === MODAL ALTERAR SENHA ===
    const modalPwd = document.getElementById("modalChangePassword");
    document.getElementById("menuChangePassword")?.addEventListener("click", () => {
        dropdown.classList.add("hidden");
        modalPwd.classList.remove("hidden");
        document.getElementById("changePasswordError").classList.add("hidden");
        document.getElementById("changePasswordSuccess").classList.add("hidden");
        document.getElementById("newPasswordInput").value = "";
        document.getElementById("confirmPasswordInput").value = "";
    });
    document.getElementById("closeModalChangePassword")?.addEventListener("click", () => {
        modalPwd.classList.add("hidden");
    });
    modalPwd?.addEventListener("click", (e) => {
        if (e.target === modalPwd) modalPwd.classList.add("hidden");
    });
    document.getElementById("submitChangePassword")?.addEventListener("click", async () => {
        const newPwd  = document.getElementById("newPasswordInput").value;
        const confPwd = document.getElementById("confirmPasswordInput").value;
        const errEl   = document.getElementById("changePasswordError");
        const sucEl   = document.getElementById("changePasswordSuccess");
        errEl.classList.add("hidden");
        sucEl.classList.add("hidden");

        if (newPwd.length < 8) { errEl.textContent = "Mínimo 8 caracteres."; errEl.classList.remove("hidden"); return; }
        if (newPwd !== confPwd) { errEl.textContent = "Senhas não coincidem."; errEl.classList.remove("hidden"); return; }

        const res = await fetch("/auth/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({ password: newPwd })
        });
        const data = await res.json();
        if (data.success) {
            sucEl.textContent = "Senha alterada com sucesso!";
            sucEl.classList.remove("hidden");
            setTimeout(() => modalPwd.classList.add("hidden"), 2000);
        } else {
            errEl.textContent = data.error || "Erro ao alterar senha.";
            errEl.classList.remove("hidden");
        }
    });

    // === MODAL ALTERAR EMAIL ===
    const modalEmail = document.getElementById("modalChangeEmail");
    document.getElementById("menuChangeEmail")?.addEventListener("click", () => {
        dropdown.classList.add("hidden");
        modalEmail.classList.remove("hidden");
        document.getElementById("changeEmailError").classList.add("hidden");
        document.getElementById("changeEmailSuccess").classList.add("hidden");
        document.getElementById("newEmailInput").value = "";
    });
    document.getElementById("closeModalChangeEmail")?.addEventListener("click", () => {
        modalEmail.classList.add("hidden");
    });
    modalEmail?.addEventListener("click", (e) => {
        if (e.target === modalEmail) modalEmail.classList.add("hidden");
    });
    document.getElementById("submitChangeEmail")?.addEventListener("click", async () => {
        const newEmail = document.getElementById("newEmailInput").value;
        const errEl    = document.getElementById("changeEmailError");
        const sucEl    = document.getElementById("changeEmailSuccess");
        errEl.classList.add("hidden");
        sucEl.classList.add("hidden");

        if (!newEmail || !newEmail.includes("@")) { errEl.textContent = "Email inválido."; errEl.classList.remove("hidden"); return; }

        const res = await fetch("/auth/change-email", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({ email: newEmail })
        });
        const data = await res.json();
        if (data.success) {
            sucEl.textContent = "Verifique seu novo email para confirmar a alteração.";
            sucEl.classList.remove("hidden");
            setTimeout(() => modalEmail.classList.add("hidden"), 3000);
        } else {
            errEl.textContent = data.error || "Erro ao alterar email.";
            errEl.classList.remove("hidden");
        }
    });

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
            exportBtn.title = "Exportar CSV (plano Pro)";
            exportBtn.textContent = "🔒";
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
