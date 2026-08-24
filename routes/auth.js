import express from "express";
import { supabaseAdmin } from "../services/supabase.js";
import { requireApiAuth } from "../middlewares/auth.js";

const router = express.Router();

// Cadastro de novo usuário
router.post("/register", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                error: "Nome, e-mail e senha são obrigatórios"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "A senha deve ter pelo menos 8 caracteres"
            });
        }

        // Usa signUp em vez de admin.createUser para que o Supabase
        // envie o email de confirmação e exija que o usuário confirme antes de logar
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: { name, role: "user", plan: "free" },
                emailRedirectTo: `${process.env.APP_URL || "http://localhost:3000"}/login.html`
            }
        });

        if (error) {
            // Traduz erros comuns do Supabase
            if (error.message.includes("already registered")) {
                return res.status(409).json({
                    error: "Este e-mail já está cadastrado"
                });
            }
            return res.status(400).json({ error: error.message });
        }

        res.status(201).json({
            success: true,
            message: "Cadastro realizado! Verifique seu e-mail para confirmar a conta."
        });

    } catch (err) {
        console.error("Erro no cadastro:", err);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

// Login — o frontend faz login direto via Supabase JS SDK,
// mas esta rota permite login server-side se necessário
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "E-mail e senha são obrigatórios"
            });
        }

        // Cria um cliente temporário com anon key pra fazer o login
        // (signInWithPassword precisa da anon key, não da service_role)
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            if (error.message.includes("Email not confirmed")) {
                return res.status(401).json({
                    error: "Confirme seu e-mail antes de entrar"
                });
            }
            return res.status(401).json({
                error: "E-mail ou senha inválidos"
            });
        }

        res.json({
            success: true,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            user: {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.name,
                plan: data.user.user_metadata?.plan || "free",
                role: data.user.user_metadata?.role || "user"
            }
        });

    } catch (err) {
        console.error("Erro no login:", err);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

// Retorna dados do usuário autenticado (token via header Authorization)
router.get("/me", async (req, res) => {
    try {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer ")) {
            return res.json({ authenticated: false });
        }

        const token = header.slice(7);
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data, error } = await client.auth.getUser(token);

        if (error || !data?.user) {
            return res.json({ authenticated: false });
        }

        res.json({
            authenticated: true,
            user: {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.name,
                plan: data.user.user_metadata?.plan || "free",
                role: data.user.user_metadata?.role || "user"
            }
        });

    } catch (err) {
        console.error("Erro em /me:", err);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

// Recuperação de senha
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "E-mail é obrigatório" });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.APP_URL || "http://localhost:3000"}/reset-password.html`
        });

        // Não revelamos se o e-mail existe ou não (segurança)
        if (error) console.error("forgot-password error:", error.message);

        res.json({
            success: true,
            message: "Se este e-mail estiver cadastrado, você receberá um link em breve."
        });

    } catch (err) {
        console.error("Erro em forgot-password:", err);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

// Alterar senha
router.post("/change-password", requireApiAuth, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({ error: "Senha deve ter pelo menos 8 caracteres." });
        }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(req.userId, { password });
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Alterar email
router.post("/change-email", requireApiAuth, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes("@")) {
            return res.status(400).json({ error: "Email inválido." });
        }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(req.userId, {
            email,
            email_confirm: false // exige confirmação no novo email
        });
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
