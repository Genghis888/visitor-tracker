import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/", (req, res) => {
    res.json({
        status: "online",
        version: "1.0.0",
        serverTime: new Date().toISOString()
    });
});

router.get("/db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            status: "Banco conectado!",
            time: result.rows[0].now
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            status: "Erro ao conectar ao banco",
            error: err.message
        });

    }
});

export default router;