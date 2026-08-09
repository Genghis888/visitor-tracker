import express from "express";
import pool from "../db.js";
import { supabaseAdmin } from "../services/supabase.js";

const router = express.Router();

// Overview — métricas gerais do sistema
router.get("/overview", async (req, res) => {
    try {
        const [users, sites, visitsToday, visitsAll, plans] = await Promise.all([

            pool.query(`SELECT COUNT(*)::INT AS total FROM profiles`),

            pool.query(`SELECT COUNT(*)::INT AS total FROM sites`),

            pool.query(`
                SELECT COUNT(*)::INT AS total FROM visits
                WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
                    = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
            `),

            pool.query(`SELECT COUNT(*)::INT AS total FROM visits`),

            pool.query(`
                SELECT plan_id, COUNT(*)::INT AS total
                FROM profiles
                GROUP BY plan_id
                ORDER BY total DESC
            `)
        ]);

        res.json({
            totalUsers:      users.rows[0].total,
            totalSites:      sites.rows[0].total,
            visitsToday:     visitsToday.rows[0].total,
            visitsAll:       visitsAll.rows[0].total,
            plans:           plans.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Lista todos os usuários com seus sites e visitas
router.get("/users", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id,
                p.name,
                p.plan_id,
                p.created_at,
                u.email,
                u.email_confirmed_at,
                u.banned_until,
                u.raw_user_meta_data->>'role' AS role,
                COUNT(DISTINCT s.id)::INT AS total_sites,
                COUNT(DISTINCT v.id)::INT AS total_visits
            FROM profiles p
            JOIN auth.users u ON u.id = p.id
            LEFT JOIN sites s ON s.user_id = p.id
            LEFT JOIN visits v ON v.user_id = p.id
            GROUP BY p.id, p.name, p.plan_id, p.created_at,
                     u.email, u.email_confirmed_at, u.banned_until,
                     u.raw_user_meta_data
            ORDER BY p.created_at DESC
        `);

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Últimos usuários cadastrados (pra overview)
router.get("/users/recent", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.name, p.plan_id, p.created_at, u.email
            FROM profiles p
            JOIN auth.users u ON u.id = p.id
            ORDER BY p.created_at DESC
            LIMIT 5
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lista todos os sites com info do dono
router.get("/sites", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.id,
                s.name,
                s.domain,
                s.active,
                s.created_at,
                p.name AS owner_name,
                u.email AS owner_email,
                COUNT(v.id)::INT AS total_visits
            FROM sites s
            JOIN profiles p ON p.id = s.user_id
            JOIN auth.users u ON u.id = s.user_id
            LEFT JOIN visits v ON v.site_id = s.id
            GROUP BY s.id, s.name, s.domain, s.active, s.created_at,
                     p.name, u.email
            ORDER BY s.created_at DESC
        `);

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Atualiza plano do usuário
router.put("/users/:id/plan", async (req, res) => {
    try {
        const { plan } = req.body;
        const { id }   = req.params;

        if (!["free", "pro"].includes(plan)) {
            return res.status(400).json({ error: "Plano inválido" });
        }

        await pool.query(
            `UPDATE profiles SET plan_id = $1, updated_at = NOW() WHERE id = $2`,
            [plan, id]
        );

        // Atualiza também nos metadados do Supabase Auth
        await supabaseAdmin.auth.admin.updateUserById(id, {
            user_metadata: { plan }
        });

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Bane ou desbane um usuário
router.put("/users/:id/ban", async (req, res) => {
    try {
        const { ban } = req.body;
        const { id }  = req.params;

        if (ban) {
            await supabaseAdmin.auth.admin.updateUserById(id, {
                ban_duration: "876600h" // ~100 anos
            });
        } else {
            await supabaseAdmin.auth.admin.updateUserById(id, {
                ban_duration: "none"
            });
        }

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Rota temporária — preenche page_title a partir do query_string
router.get("/fix-titles", async (req, res) => {
    if (req.query.secret !== "vt-fix-2026") {
        return res.status(401).json({ error: "Não autorizado" });
    }
    try {
        const { rows } = await pool.query(`
            SELECT id, query_string FROM visits
            WHERE query_string LIKE '%n=%'
              AND query_string LIKE '%p=%'
              AND (page_title IS NULL OR page_title = '')
        `);

        let atualizados = 0;
        const erros = [];

        for (const row of rows) {
            try {
                const p = new URLSearchParams(row.query_string);
                const n   = p.get("n");
                const i   = p.get("i");
                const loc = p.get("p");

                if (!n && !loc) continue;

                const partes = [n, i, loc]
                    .filter(Boolean)
                    .map(v => decodeURIComponent(v).trim());

                const title = partes.join(" - ");

                await pool.query(
                    "UPDATE visits SET page_title = $1 WHERE id = $2",
                    [title, row.id]
                );
                atualizados++;
            } catch(e) {
                erros.push({ id: row.id, erro: e.message });
            }
        }

        res.json({
            encontrados: rows.length,
            atualizados,
            erros
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
