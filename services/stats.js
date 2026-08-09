import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";

export async function getStats(range = "today", start = null, end = null, site = null, userId = null) {

    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";

    const [today, yesterday, unique, countries, online, browsers, systems, devices, pages] =
        await Promise.all([

        pool.query(`SELECT COUNT(*) total FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}`),

        pool.query(`SELECT COUNT(*) total FROM visits
            WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
                = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo') - 1
            AND ${siteWhere} AND ${userWhere}`),

        pool.query(`SELECT COUNT(DISTINCT visitor_id) total FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}`),

        pool.query(`SELECT COUNT(DISTINCT country) total FROM visits
            WHERE country IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}`),

        pool.query(`SELECT COUNT(DISTINCT visitor_id) total FROM visits
            WHERE last_seen >= NOW() - INTERVAL '5 minutes'
            AND ${siteWhere} AND ${userWhere}`),

        pool.query(`SELECT browser, COUNT(*) total FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY browser ORDER BY total DESC LIMIT 5`),

        pool.query(`SELECT os, COUNT(*) total FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY os ORDER BY total DESC LIMIT 5`),

        pool.query(`SELECT device_type, COUNT(*) total FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY device_type ORDER BY total DESC LIMIT 5`),

        pool.query(`SELECT page, COUNT(*) total FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY page ORDER BY total DESC LIMIT 5`)
    ]);

    const todayCount     = Number(today.rows[0].total);
    const yesterdayCount = Number(yesterday.rows[0].total);
    const todayVariation = yesterdayCount > 0
        ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
        : 0;

    return {
        today: todayCount,
        todayVariation,
        unique:    Number(unique.rows[0].total),
        countries: Number(countries.rows[0].total),
        online:    Number(online.rows[0].total),
        browsers:  browsers.rows,
        systems:   systems.rows,
        devices:   devices.rows,
        pages:     pages.rows
    };
}
