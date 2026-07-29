import pool from "../db.js";

export async function insert(table, data) {

    // Remove campos undefined
    const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    const columns = Object.keys(cleanData);

    const values = Object.values(cleanData);

    const placeholders = columns.map((_, index) => `$${index + 1}`);

    const sql = `
        INSERT INTO ${table}
        (${columns.join(", ")})
        VALUES
        (${placeholders.join(", ")})
    `;

    return pool.query(sql, values);
}