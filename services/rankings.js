import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";

export async function getRankings(range = "today", start = null, end = null, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";

    const [browsers, systems, devices, pages, countries] = await Promise.all([
        pool.query(`SELECT browser, COUNT(*)::INT AS total FROM visits
            WHERE browser IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY browser ORDER BY total DESC LIMIT 10`),
        pool.query(`SELECT os, COUNT(*)::INT AS total FROM visits
            WHERE os IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY os ORDER BY total DESC LIMIT 10`),
        pool.query(`SELECT device_type, COUNT(*)::INT AS total FROM visits
            WHERE device_type IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY device_type ORDER BY total DESC LIMIT 5`),
        pool.query(`SELECT page, COUNT(*)::INT AS total FROM visits
            WHERE page IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY page ORDER BY total DESC LIMIT 10`),
        pool.query(`SELECT country, COUNT(*)::INT AS total FROM visits
            WHERE country IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
            GROUP BY country ORDER BY total DESC LIMIT 10`)
    ]);

    return {
        browsers:  browsers.rows,
        systems:   systems.rows,
        devices:   devices.rows,
        pages:     pages.rows,
        countries: countries.rows
    };
}
