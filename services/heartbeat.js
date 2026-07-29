import pool from "../db.js";

export async function updateHeartbeat(visitor_id) {

    await pool.query(
        `
        UPDATE visits
        SET last_seen = NOW()
        WHERE visitor_id = $1
        `,
        [visitor_id]
    );

}