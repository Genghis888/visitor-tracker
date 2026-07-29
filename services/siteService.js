import pool from "../db.js";
import { randomBytes } from "crypto";

// Gera um token único de 24 caracteres (URL-safe)
export function generateToken() {
    return randomBytes(18).toString("base64url");
}

// Busca site pelo token (usado no /track para identificar user_id e site_id)
export async function findSiteByToken(token) {
    const result = await pool.query(
        `SELECT id, user_id, domain, active
         FROM sites
         WHERE token = $1`,
        [token]
    );
    return result.rows[0] || null;
}

// Lista sites de um usuário
export async function getSitesByUser(userId) {
    const result = await pool.query(
        `SELECT
            s.id,
            s.name,
            s.domain,
            s.token,
            s.active,
            s.created_at,
            COUNT(v.id)::INT AS total_visits
         FROM sites s
         LEFT JOIN visits v ON v.site_id = s.id
         WHERE s.user_id = $1
         GROUP BY s.id
         ORDER BY s.created_at DESC`,
        [userId]
    );
    return result.rows;
}

// Cria um novo site
export async function createSite(userId, name, domain) {
    const token = generateToken();
    const result = await pool.query(
        `INSERT INTO sites (user_id, name, domain, token)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, domain, token, active, created_at`,
        [userId, name, domain.toLowerCase().trim(), token]
    );
    return result.rows[0];
}

// Atualiza site
export async function updateSite(siteId, userId, fields) {
    const allowed = ["name", "domain", "active"];
    const updates = Object.entries(fields)
        .filter(([k]) => allowed.includes(k))
        .map(([k], i) => `${k} = $${i + 3}`);

    if (!updates.length) return null;

    const values = Object.entries(fields)
        .filter(([k]) => allowed.includes(k))
        .map(([, v]) => v);

    const result = await pool.query(
        `UPDATE sites
         SET ${updates.join(", ")}
         WHERE id = $1 AND user_id = $2
         RETURNING id, name, domain, token, active`,
        [siteId, userId, ...values]
    );
    return result.rows[0] || null;
}

// Deleta site (só o dono pode)
export async function deleteSite(siteId, userId) {
    await pool.query(
        `DELETE FROM sites WHERE id = $1 AND user_id = $2`,
        [siteId, userId]
    );
}
