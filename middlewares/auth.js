import { supabaseAnon } from "../services/supabase.js";

// Extrai o Bearer token do header Authorization
function extractToken(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
        return header.slice(7);
    }
    return null;
}

// Protege rotas de API — retorna 401 JSON se não autenticado
export async function requireApiAuth(req, res, next) {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ error: "Não autenticado" });
    }

    const { data, error } = await supabaseAnon.auth.getUser(token);

    if (error || !data?.user) {
        return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    // Injeta o usuário no request para uso nas rotas
    req.user = data.user;
    req.userId = data.user.id;

    next();
}

// Protege páginas HTML — redireciona para /login.html se não autenticado
// (usado apenas para SSR; em SPA o frontend cuida disso)
export function requirePageAuth(req, res, next) {
    // Com Supabase Auth o token fica no frontend (localStorage/cookie httpOnly)
    // A proteção de página é feita pelo JS do frontend.
    // Este middleware continua existindo para compatibilidade, mas redireciona
    // apenas se não houver token no header (acesso direto sem JS).
    const token = extractToken(req);
    if (!token) {
        const redirectTo = encodeURIComponent(req.originalUrl);
        return res.redirect(`/login.html?redirect=${redirectTo}`);
    }
    next();
}

// Verifica se o usuário tem role de superadmin (só você)
export async function requireSuperAdmin(req, res, next) {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ error: "Não autenticado" });
    }

    const { data, error } = await supabaseAnon.auth.getUser(token);

    if (error || !data?.user) {
        return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    const role = data.user.user_metadata?.role;

    if (role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado" });
    }

    req.user = data.user;
    req.userId = data.user.id;

    next();
}
