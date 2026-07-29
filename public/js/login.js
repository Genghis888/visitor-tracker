import { saveSession, isAuthenticated } from "./auth.js";

// Se já estiver logado, redireciona direto
if (isAuthenticated()) {
    const params = new URLSearchParams(location.search);
    window.location.href = params.get("redirect") || "/admin.html";
}

// ===== Abas =====
const tabs = document.querySelectorAll(".tab");
const forms = document.querySelectorAll(".tab-content");

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        forms.forEach(f => f.classList.add("hidden"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.tab + "Form")
            .classList.remove("hidden");
        clearErrors();
    });
});

// ===== Helpers =====
function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove("hidden");
}

function showSuccess(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove("hidden");
}

function clearErrors() {
    document.querySelectorAll(".form-error, .form-success")
        .forEach(el => el.classList.add("hidden"));
}

function setLoading(btnId, loading, defaultText) {
    const btn = document.getElementById(btnId);
    btn.disabled = loading;
    btn.textContent = loading ? "Aguarde..." : defaultText;
}

// ===== Login =====
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading("loginSubmit", true, "Entrar");

    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    try {
        const res  = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            showError("loginError", data.error || "Erro ao entrar");
            return;
        }

        saveSession(data.access_token, data.user);

        const params = new URLSearchParams(location.search);
        window.location.href = params.get("redirect") || "/admin.html";

    } catch {
        showError("loginError", "Erro de conexão. Tente novamente.");
    } finally {
        setLoading("loginSubmit", false, "Entrar");
    }
});

// ===== Cadastro =====
document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading("registerSubmit", true, "Criar conta grátis");

    const name     = document.getElementById("registerName").value.trim();
    const email    = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    try {
        const res  = await fetch("/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            showError("registerError", data.error || "Erro no cadastro");
            return;
        }

        showSuccess("registerSuccess", data.message);
        document.getElementById("registerForm").reset();

    } catch {
        showError("registerError", "Erro de conexão. Tente novamente.");
    } finally {
        setLoading("registerSubmit", false, "Criar conta grátis");
    }
});

// ===== Recuperação de senha =====
document.getElementById("forgotLink").addEventListener("click", (e) => {
    e.preventDefault();
    forms.forEach(f => f.classList.add("hidden"));
    tabs.forEach(t => t.classList.remove("active"));
    document.getElementById("forgotForm").classList.remove("hidden");
    clearErrors();
});

document.getElementById("backToLogin").addEventListener("click", (e) => {
    e.preventDefault();
    forms.forEach(f => f.classList.add("hidden"));
    document.getElementById("loginForm").classList.remove("hidden");
    tabs[0].classList.add("active");
    clearErrors();
});

document.getElementById("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading("forgotSubmit", true, "Enviar link");

    const email = document.getElementById("forgotEmail").value.trim();

    try {
        const res  = await fetch("/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (!res.ok) {
            showError("forgotError", data.error || "Erro ao enviar e-mail");
            return;
        }

        showSuccess("forgotSuccess", "Link enviado! Verifique seu e-mail.");
        document.getElementById("forgotEmail").value = "";

    } catch {
        showError("forgotError", "Erro de conexão. Tente novamente.");
    } finally {
        setLoading("forgotSubmit", false, "Enviar link");
    }
});
