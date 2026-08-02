import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";

// Agrupa visitas em sessões usando a lógica de 30 minutos de inatividade
export async function getSessions(
    range = "today",
    start = null,
    end = null,
    site = null,
    userId = null,
    page = 1,
    limit = 20
) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";
    const offset    = (page - 1) * limit;

    // Busca visitas ordenadas por visitor_id e data
    // Usa LAG para detectar quebra de sessão (> 30 min sem atividade)
    const result = await pool.query(`
        WITH ranked AS (
            SELECT
                visitor_id,
                ip,
                country,
                country_code,
                region,
                city,
                browser,
                os,
                device_type,
                host,
                full_url,
                page,
                page_title,
                created_at,
                LAG(created_at) OVER (
                    PARTITION BY visitor_id ORDER BY created_at
                ) AS prev_time
            FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}
        ),
        with_session AS (
            SELECT *,
                SUM(
                    CASE WHEN prev_time IS NULL
                        OR EXTRACT(EPOCH FROM (created_at - prev_time)) > 1800
                    THEN 1 ELSE 0 END
                ) OVER (
                    PARTITION BY visitor_id ORDER BY created_at
                ) AS session_num
            FROM ranked
        ),
        sessions AS (
            SELECT
                visitor_id,
                session_num,
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
            FROM with_session
            GROUP BY visitor_id, session_num
        )
        SELECT * FROM sessions
        ORDER BY entry_time DESC
        LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Conta total de sessões para paginação
    const countResult = await pool.query(`
        WITH ranked AS (
            SELECT
                visitor_id,
                created_at,
                LAG(created_at) OVER (
                    PARTITION BY visitor_id ORDER BY created_at
                ) AS prev_time
            FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}
        ),
        with_session AS (
            SELECT *,
                SUM(
                    CASE WHEN prev_time IS NULL
                        OR EXTRACT(EPOCH FROM (created_at - prev_time)) > 1800
                    THEN 1 ELSE 0 END
                ) OVER (
                    PARTITION BY visitor_id ORDER BY created_at
                ) AS session_num
            FROM ranked
        )
        SELECT COUNT(DISTINCT (visitor_id, session_num)) AS total
        FROM with_session
    `);

    const total = Number(countResult.rows[0].total);

    return {
        total,
        page,
        pages: Math.ceil(total / limit),
        rows:  result.rows
    };
}
