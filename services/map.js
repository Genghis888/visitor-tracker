import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";
import { getBotFilter } from "./botFilter.js";

export async function getMapMarkers(range = "today", start = null, end = null, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const botWhere  = getBotFilter();

    const result = await pool.query(`
        SELECT country, country_code, city, latitude, longitude, COUNT(*)::INT AS total
        FROM visits
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND ${where} AND ${siteWhere} AND ${userWhere} AND ${botWhere}
        GROUP BY country, country_code, city, latitude, longitude
        ORDER BY total DESC
    `);
    return result.rows;
}
