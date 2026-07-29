import bcrypt from "bcryptjs";
import pool from "../db.js";

export async function findUserByUsername(username) {

    const result = await pool.query(
        `SELECT id, username, password_hash
         FROM admin_users
         WHERE username = $1`,
        [username]
    );

    return result.rows[0] || null;

}

export async function verifyPassword(plainPassword, passwordHash) {

    return bcrypt.compare(plainPassword, passwordHash);

}

export async function hashPassword(plainPassword) {

    const salt = await bcrypt.genSalt(10);

    return bcrypt.hash(plainPassword, salt);

}

export async function updateLastLogin(userId) {

    await pool.query(
        `UPDATE admin_users
         SET last_login_at = NOW()
         WHERE id = $1`,
        [userId]
    );

}

export async function createUser(username, plainPassword) {

    const passwordHash = await hashPassword(plainPassword);

    const result = await pool.query(
        `INSERT INTO admin_users (username, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (username)
         DO UPDATE SET password_hash = EXCLUDED.password_hash
         RETURNING id, username`,
        [username, passwordHash]
    );

    return result.rows[0];

}
