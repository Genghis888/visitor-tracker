import pool from "../db.js";
import { getSiteFilter } from "./siteFilter.js";
import { getBotFilter } from "./botFilter.js";

export async function getChartData(range = "today", start = null, end = null, site = null, userId = null) {
    switch (range) {
        case "7":      return getDailyChart(7,  site, userId);
        case "30":     return getDailyChart(30, site, userId);
        case "custom": return getCustomChart(start, end, site, userId);
        default:       return getHourlyChart(site, userId);
    }
}

async function getHourlyChart(site, userId) {
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const botWhere  = getBotFilter();

    const result = await pool.query(`
        SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::INT AS label,
               COUNT(*)::INT AS total
        FROM visits
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
            = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
          AND ${siteWhere} AND ${userWhere} AND ${botWhere}
        GROUP BY label ORDER BY label
    `);

    const hours = Array.from({ length: 24 }, (_, i) => ({ label: i, total: 0 }));
    result.rows.forEach(r => { hours[r.label].total = r.total; });
    return hours;
}

async function getDailyChart(days, site, userId) {
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const botWhere  = getBotFilter();

    const result = await pool.query(`
        SELECT DATE(created_at AT TIME ZONE 'America/Sao_Paulo') AS day,
               COUNT(*)::INT AS total
        FROM visits
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
            >= DATE(NOW() AT TIME ZONE 'America/Sao_Paulo') - ($1::INT - 1)
          AND ${siteWhere} AND ${userWhere} AND ${botWhere}
        GROUP BY day ORDER BY day
    `, [days]);

    const mapa = new Map(result.rows.map(r => [r.day.toISOString().slice(0,10), r.total]));
    const dados = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const chave = d.toISOString().slice(0,10);
        dados.push({ label: d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }), total: mapa.get(chave) || 0 });
    }
    return dados;
}

async function getCustomChart(start, end, site, userId) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const botWhere  = getBotFilter();

    const result = await pool.query(`
        SELECT DATE(created_at AT TIME ZONE 'America/Sao_Paulo') AS day,
               COUNT(*)::INT AS total
        FROM visits
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') BETWEEN $1 AND $2
          AND ${siteWhere} AND ${userWhere} AND ${botWhere}
        GROUP BY day ORDER BY day
    `, [start, end]);

    const mapa = new Map(result.rows.map(r => [r.day.toISOString().slice(0,10), r.total]));
    const dados = [];
    const inicio = new Date(start + "T00:00:00");
    const fim    = new Date(end   + "T00:00:00");
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate()+1)) {
        const chave = d.toISOString().slice(0,10);
        dados.push({ label: d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}), total: mapa.get(chave)||0 });
    }
    return dados;
}
