import pool from "../db.js";

export async function getSites() {

    const result = await pool.query(`
        SELECT
            host,
            COUNT(*)::INT AS total
        FROM visits
        WHERE host IS NOT NULL
        GROUP BY host
        ORDER BY total DESC
    `);

    return result.rows;

}
