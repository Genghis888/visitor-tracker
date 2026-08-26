import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";
import { getBotFilter } from "./botFilter.js";

export async function getLastVisits(range = "today", start = null, end = null, page = 1, limit = 25, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const botWhere  = getBotFilter();
    const offset    = (page - 1) * limit;

    const [totalResult, rowsResult] = await Promise.all([
        pool.query(`SELECT COUNT(*)::INT AS total FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}`),
        pool.query(`
            SELECT created_at, ip, host, country, country_code, region, city,
                   browser, os, device_type, full_url, page, page_title, isp, referrer
            FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset])
    ]);

    const total = totalResult.rows[0].total;
    return { total, page, pages: Math.ceil(total / limit), rows: rowsResult.rows };
}
