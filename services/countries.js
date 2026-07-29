import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";

export async function getCountries(range = "today", start = null, end = null, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";

    const result = await pool.query(`
        SELECT country, country_code, COUNT(*)::INT AS total
        FROM visits
        WHERE country IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
        GROUP BY country, country_code
        ORDER BY total DESC
    `);
    return result.rows;
}
