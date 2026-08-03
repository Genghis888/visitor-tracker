import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";

// Agrupa visitas por visitor_id dentro do período selecionado
export async function getSessions(
    range = "today",
    start = null,
    end = null,
    site = null,
    userId = null,
    page = 1,
    limit = 20,
    search = null
) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";

    // Filtro de busca server-side
    const searchWhere = search
        ? `AND (ip ILIKE '%${search.replace(/'/g, "''")}%'
              OR country ILIKE '%${search.replace(/'/g, "''")}%'
              OR city ILIKE '%${search.replace(/'/g, "''")}%'
              OR region ILIKE '%${search.replace(/'/g, "''")}%'
              OR browser ILIKE '%${search.replace(/'/g, "''")}%'
              OR os ILIKE '%${search.replace(/'/g, "''")}%'
              OR host ILIKE '%${search.replace(/'/g, "''")}%')`
        : "";

    const offset = (page - 1) * limit;

    const result = await pool.query(`
        SELECT
            visitor_id,
            MIN(ip) AS ip,
            MIN(country) AS country,
            MIN(country_code) AS country_code,
            MIN(region) AS region,
            MIN(city) AS city,
            MIN(browser) AS browser,
            MIN(os) AS os,
            MIN(device_type) AS device_type,
            MIN(host) AS host,
            MIN(created_at) AS entry_time,
            MAX(created_at) AS last_time,
            COUNT(*)::INT AS page_count,
            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::INT AS duration_seconds,
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'url', COALESCE(full_url, page, '/'),
                    'title', page_title,
                    'time', created_at
                ) ORDER BY created_at
            ) AS pages
        FROM visits
        WHERE ${where}
          AND ${siteWhere}
          AND ${userWhere}
          ${searchWhere}
        GROUP BY visitor_id
        ORDER BY entry_time DESC
        LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await pool.query(`
        SELECT COUNT(DISTINCT visitor_id)::INT AS total
        FROM visits
        WHERE ${where}
          AND ${siteWhere}
          AND ${userWhere}
          ${searchWhere}
    `);

    const total = Number(countResult.rows[0].total);

    return {
        total,
        page,
        pages: Math.ceil(total / limit),
        rows:  result.rows
    };
}
