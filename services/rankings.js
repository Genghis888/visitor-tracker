import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";
import { getBotFilter } from "./botFilter.js";

export async function getRankings(range = "today", start = null, end = null, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const botWhere  = getBotFilter();

    const [browsers, systems, devices, pages, countries, referrers] = await Promise.all([
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
            GROUP BY country ORDER BY total DESC LIMIT 10`),
        pool.query(`
            SELECT
                CASE
                    WHEN referrer IS NULL OR referrer = '' THEN 'Direto'
                    WHEN referrer ILIKE '%google%' THEN 'Google'
                    WHEN referrer ILIKE '%bing%' THEN 'Bing'
                    WHEN referrer ILIKE '%facebook%' THEN 'Facebook'
                    WHEN referrer ILIKE '%twitter%' OR referrer ILIKE '%t.co%' THEN 'Twitter/X'
                    WHEN referrer ILIKE '%instagram%' THEN 'Instagram'
                    WHEN referrer ILIKE '%youtube%' THEN 'YouTube'
                    WHEN referrer ILIKE '%whatsapp%' THEN 'WhatsApp'
                    ELSE referrer
                END AS referrer,
                COUNT(*)::INT AS total
            FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
            GROUP BY 1
            ORDER BY total DESC LIMIT 10`)
    ]);

    return {
        browsers:  browsers.rows,
        systems:   systems.rows,
        devices:   devices.rows,
        pages:     pages.rows,
        countries: countries.rows,
        referrers: referrers.rows
    };
}
