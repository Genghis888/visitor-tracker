// Gerenciamento de autenticação no frontend via Supabase Auth
// O token JWT é guardado no sessionStorage (limpa ao fechar o browser)

const TOKEN_KEY = "vt_access_token";
const USER_KEY  = "vt_user";

export function saveSession(access_token, user) {
    sessionStorage.setItem(TOKEN_KEY, access_token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

export function getUser() {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
    return !!getToken();
}

// Verifica com o backend se o token ainda é válido.
// Redireciona pra login se não estiver.
export async function requireAuth() {
    const token = getToken();

    if (!token) {
        redirectToLogin();
        return null;
    }

    try {
        const res = await fetch("/auth/me", {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();

        if (!data.authenticated) {
            clearSession();
            redirectToLogin();
            return null;
        }

        return data.user;

    } catch {
        clearSession();
        redirectToLogin();
        return null;
    }
}

export function redirectToLogin() {
    const redirectTo = encodeURIComponent(
        location.pathname + location.search
    );
    window.location.href = `/login.html?redirect=${redirectTo}`;
}

export async function logout() {
    clearSession();
    window.location.href = "/login.html";
}

export function attachLogoutHandler(buttonId = "logoutBtn") {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.addEventListener("click", logout);
    }
}
