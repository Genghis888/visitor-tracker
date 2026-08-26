import { getStartDate, getEndDate } from "./filters.js";
import { getCurrentSite } from "./siteFilter.js";
import { getToken, clearSession } from "./auth.js";

// Wrapper central: injeta o JWT em toda chamada de API.
// Se o token expirou (401), limpa a sessão e redireciona pro login.
async function apiFetch(url) {

    const token = getToken();

    const res = await fetch(url, {
        headers: token
            ? { Authorization: `Bearer ${token}` }
            : {}
    });

    if (res.status === 401) {
        clearSession();
        const redirectTo = encodeURIComponent(
            location.pathname + location.search
        );
        window.location.href = `/login.html?redirect=${redirectTo}`;
        return new Promise(() => {});
    }

    return res.json();

}

function buildQuery(range) {

    const params = new URLSearchParams();

    if (range && typeof range === "object" && range.start && range.end) {
        params.set("range", "custom");
        params.set("start", range.start);
        params.set("end", range.end);
    } else {
        params.set("range", range);

        if (range === "custom") {
            params.set("start", getStartDate());
            params.set("end", getEndDate());
        }
    }

    const site = getCurrentSite();

    if (site && site !== "all") {
        params.set("site", site);
    }

    return params.toString();

}

export async function getStats(range) {
    return apiFetch(`/api/stats?${buildQuery(range)}`);
}

export async function getHourly(range) {
    return apiFetch(`/api/stats/hourly?${buildQuery(range)}`);
}

export async function getRankings(range) {
    return apiFetch(`/api/rankings?${buildQuery(range)}`);
}

export async function getVisits(range, page = 1, limit = 25) {
    const query = buildQuery(range) + `&page=${page}&limit=${limit}`;
    return apiFetch(`/api/stats/visits?${query}`);
}

export async function getCountries(range) {
    return apiFetch(`/api/countries?${buildQuery(range)}`);
}

export async function getCountriesHierarchy(range) {
    return apiFetch(`/api/countries/hierarchy?${buildQuery(range)}`);
}

export async function getMap(range) {
    return apiFetch(`/api/map?${buildQuery(range)}`);
}

export async function getSites() {
    return apiFetch("/api/sites");
}

export async function getSessions(range, page = 1, limit = 20, search = null, groupBy = "visitor") {
    const params = new URLSearchParams(buildQuery(range));
    params.set("page", page);
    params.set("limit", limit);
    if (search) params.set("search", search);
    if (groupBy !== "visitor") params.set("groupBy", groupBy);
    return apiFetch(`/api/stats/sessions?${params.toString()}`);
}

export async function getBlockedIps() {
    return apiFetch("/api/blocked-ips");
}

export async function blockIp(ip, reason = "") {
    const token = (await import("./auth.js")).getToken();
    const res = await fetch("/api/blocked-ips", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ip, reason })
    });
    return res.json();
}

export async function unblockIp(ip) {
    const token = (await import("./auth.js")).getToken();
    const res = await fetch(`/api/blocked-ips/${encodeURIComponent(ip)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

export async function getFavoriteIps() {
    return apiFetch("/api/favorite-ips");
}

export async function favoriteIp(ip, label = "") {
    const token = (await import("./auth.js")).getToken();
    const res = await fetch("/api/favorite-ips", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ip, label })
    });
    return res.json();
}

export async function unfavoriteIp(ip) {
    const token = (await import("./auth.js")).getToken();
    const res = await fetch(`/api/favorite-ips/${encodeURIComponent(ip)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

export async function getIpDetail(ip, range = "30") {
    return apiFetch(`/api/stats/ip-detail?ip=${encodeURIComponent(ip)}&range=${range}`);
}
