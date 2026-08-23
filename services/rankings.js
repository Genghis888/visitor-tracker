import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";
import { getBotFilter } from "./botFilter.js";

export async function getRankings(range = "today", start = null, end = null, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const botWhere  = getBotFilter();

    const [browsers, systems, devices, pages, countries] = await Promise.all([
        pool.query(`SELECT browser, COUNT(*)::INT AS total FROM visits
            WHERE browser IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
            GROUP BY browser ORDER BY total DESC LIMIT 10`),
        pool.query(`SELECT os, COUNT(*)::INT AS total FROM visits
            WHERE os IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
            GROUP BY os ORDER BY total DESC LIMIT 10`),
        pool.query(`SELECT device_type, COUNT(*)::INT AS total FROM visits
            WHERE device_type IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
            GROUP BY device_type ORDER BY total DESC LIMIT 5`),
        pool.query(`
            SELECT
                CASE
                    WHEN full_url IS NOT NULL AND full_url <> '' THEN full_url
                    WHEN host IS NOT NULL AND host <> '' THEN CONCAT(host, COALESCE(page, '/'))
                    ELSE COALESCE(page, '/')
                END AS page,
                COUNT(*)::INT AS total
            FROM visits
            WHERE page IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
            GROUP BY 1
            ORDER BY total DESC LIMIT 10`),
        pool.query(`SELECT country, COUNT(*)::INT AS total FROM visits
            WHERE country IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
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
