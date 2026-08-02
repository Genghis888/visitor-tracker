import { requireAuth, attachLogoutHandler, getToken, getUser } from "./auth.js";

const BASE = "/api/admin";

async function apiFetch(url, options = {}) {
    const token = getToken();
    const res = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
    if (res.status === 401 || res.status === 403) {
        window.location.href = "/painel.html";
        return null;
    }
    return res.json();
}

// ===== Navegação =====
function initNav() {
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".section");

    function goTo(sectionId) {
        navItems.forEach(n => n.classList.remove("active"));
        sections.forEach(s => s.classList.add("hidden"));
        document.querySelector(`[data-section="${sectionId}"]`)?.classList.add("active");
        document.getElementById(`section-${sectionId}`)?.classList.remove("hidden");

        if (sectionId === "usuarios") carregarUsuarios();
        if (sectionId === "sites")    carregarSites();
    }

    navItems.forEach(item => {
        item.addEventListener("click", e => {
            e.preventDefault();
            goTo(item.dataset.section);
        });
    });
}

// ===== Overview =====
async function carregarOverview() {
    const [overview, recent] = await Promise.all([
        apiFetch(`${BASE}/overview`),
        apiFetch(`${BASE}/users/recent`)
    ]);

    if (!overview) return;

    document.getElementById("totalUsers").textContent      = overview.totalUsers;
    document.getElementById("totalSites").textContent      = overview.totalSites;
    document.getElementById("totalVisitsToday").textContent= overview.visitsToday;
    document.getElementById("totalVisitsAll").textContent  = overview.visitsAll;

    // Gráfico de planos
    const total = overview.totalUsers || 1;
    const planColors = { free: "#94a3b8", pro: "#2563eb", superadmin: "#fbbf24" };
    const planLabels = { free: "Gratuito", pro: "Pro" };

    document.getElementById("planChart").innerHTML = overview.plans.map(p => `
        <div class="plan-bar-item">
            <div class="plan-bar-top">
                <span>${planLabels[p.plan_id] || p.plan_id}</span>
                <span>${p.total} usuário${p.total !== 1 ? "s" : ""}</span>
            </div>
            <div class="plan-bar-track">
                <div class="plan-bar-fill" style="width:${Math.round(p.total/total*100)}%;background:${planColors[p.plan_id] || "#64748b"}"></div>
            </div>
        </div>
    `).join("");

    // Últimos cadastros
    if (recent) {
        document.getElementById("recentUsers").innerHTML = recent.map(u => `
            <div class="recent-item">
                <div class="recent-avatar">${(u.name || u.email || "?")[0].toUpperCase()}</div>
                <div class="recent-info">
                    <div class="recent-name">${escHtml(u.name || "Sem nome")}</div>
                    <div class="recent-email">${escHtml(u.email)}</div>
                </div>
                <div class="recent-date">${formatDate(u.created_at)}</div>
            </div>
        `).join("");
    }
}

// ===== Usuários =====
let allUsers = [];

async function carregarUsuarios() {
    document.getElementById("usersBody").innerHTML =
        `<tr><td colspan="7" class="loading-cell">Carregando...</td></tr>`;

    const data = await apiFetch(`${BASE}/users`);
    if (!data) return;

    allUsers = data;
    renderUsuarios(allUsers);
}

function renderUsuarios(users) {
    if (!users.length) {
        document.getElementById("usersBody").innerHTML =
            `<tr><td colspan="7" class="loading-cell">Nenhum usuário encontrado.</td></tr>`;
        return;
    }

    document.getElementById("usersBody").innerHTML = users.map(u => `
        <tr>
            <td>
                <div style="font-weight:500">${escHtml(u.name || "Sem nome")}</div>
                <div style="font-size:12px;color:var(--text-soft)">${escHtml(u.email)}</div>
            </td>
            <td>${planBadge(u.plan_id)}</td>
            <td style="text-align:center">${u.total_sites}</td>
            <td style="text-align:center">${u.total_visits}</td>
            <td style="font-size:12px;color:var(--text-soft)">${formatDate(u.created_at)}</td>
            <td>
                ${u.banned_until
                    ? `<span class="badge badge-inactive">Banido</span>`
                    : u.email_confirmed_at
                        ? `<span class="badge badge-active">Ativo</span>`
                        : `<span class="badge badge-inactive">Não confirmado</span>`
                }
                ${u.role === "superadmin" ? `<span class="badge badge-superadmin" style="margin-left:4px">Admin</span>` : ""}
            </td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="action-btn" onclick="abrirModalUsuario('${u.id}')">✏️ Editar</button>
                    ${u.role !== "superadmin" ? `
                        <button class="action-btn danger" onclick="toggleBan('${u.id}', ${!!u.banned_until})">
                            ${u.banned_until ? "✅ Desbanir" : "🚫 Banir"}
                        </button>
                    ` : ""}
                </div>
            </td>
        </tr>
    `).join("");
}

// ===== Sites =====
let allSites = [];

async function carregarSites() {
    document.getElementById("sitesBody").innerHTML =
        `<tr><td colspan="6" class="loading-cell">Carregando...</td></tr>`;

    const data = await apiFetch(`${BASE}/sites`);
    if (!data) return;

    allSites = data;
    renderSites(allSites);
}

function renderSites(sites) {
    if (!sites.length) {
        document.getElementById("sitesBody").innerHTML =
            `<tr><td colspan="6" class="loading-cell">Nenhum site encontrado.</td></tr>`;
        return;
    }

    document.getElementById("sitesBody").innerHTML = sites.map(s => `
        <tr>
            <td style="font-weight:500">${escHtml(s.name)}</td>
            <td style="color:var(--text-soft)">${escHtml(s.domain)}</td>
            <td>
                <div style="font-size:13px">${escHtml(s.owner_name || "—")}</div>
                <div style="font-size:11px;color:var(--text-soft)">${escHtml(s.owner_email)}</div>
            </td>
            <td style="text-align:center">${s.total_visits}</td>
            <td>
                ${s.active
                    ? `<span class="badge badge-active">Ativo</span>`
                    : `<span class="badge badge-inactive">Pausado</span>`
                }
            </td>
            <td style="font-size:12px;color:var(--text-soft)">${formatDate(s.created_at)}</td>
        </tr>
    `).join("");
}

// ===== Modal usuário =====
let editingUserId = null;

window.abrirModalUsuario = function(id) {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;

    editingUserId = id;
    document.getElementById("modalUserTitle").textContent = "Gerenciar usuário";
    document.getElementById("modalUserPlan").value = u.plan_id || "free";
    document.getElementById("modalUserError").classList.add("hidden");

    document.getElementById("modalUserInfo").innerHTML = `
        <div class="info-item">
            <span class="info-label">Nome</span>
            <span class="info-value">${escHtml(u.name || "—")}</span>
        </div>
        <div class="info-item">
            <span class="info-label">E-mail</span>
            <span class="info-value">${escHtml(u.email)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Sites</span>
            <span class="info-value">${u.total_sites}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Visitas</span>
            <span class="info-value">${u.total_visits}</span>
        </div>
    `;

    document.getElementById("modalUser").classList.remove("hidden");
};

async function salvarUsuario() {
    const plan = document.getElementById("modalUserPlan").value;
    const btn  = document.getElementById("modalUserSave");

    btn.disabled = true;
    btn.textContent = "Salvando...";

    const result = await apiFetch(`${BASE}/users/${editingUserId}/plan`, {
        method: "PUT",
        body: JSON.stringify({ plan })
    });

    btn.disabled = false;
    btn.textContent = "Salvar";

    if (!result || result.error) {
        document.getElementById("modalUserError").textContent = result?.error || "Erro ao salvar";
        document.getElementById("modalUserError").classList.remove("hidden");
        return;
    }

    document.getElementById("modalUser").classList.add("hidden");
    await carregarUsuarios();
}

window.toggleBan = async function(id, isBanned) {
    const confirmMsg = isBanned
        ? "Desbanir este usuário?"
        : "Banir este usuário? Ele não conseguirá mais acessar o sistema.";

    if (!confirm(confirmMsg)) return;

    await apiFetch(`${BASE}/users/${id}/ban`, {
        method: "PUT",
        body: JSON.stringify({ ban: !isBanned })
    });

    await carregarUsuarios();
};

// ===== Busca =====
function initSearch() {
    document.getElementById("searchUsers")?.addEventListener("input", e => {
        const termo = e.target.value.toLowerCase().trim();
        if (!termo) { renderUsuarios(allUsers); return; }
        renderUsuarios(allUsers.filter(u =>
            (u.name || "").toLowerCase().includes(termo) ||
            (u.email || "").toLowerCase().includes(termo)
        ));
    });

    document.getElementById("searchSites")?.addEventListener("input", e => {
        const termo = e.target.value.toLowerCase().trim();
        if (!termo) { renderSites(allSites); return; }
        renderSites(allSites.filter(s =>
            (s.domain || "").toLowerCase().includes(termo) ||
            (s.owner_email || "").toLowerCase().includes(termo) ||
            (s.owner_name || "").toLowerCase().includes(termo)
        ));
    });
}

// ===== Helpers =====
function escHtml(str) {
    return String(str ?? "")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatDate(iso) {
    return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

function planBadge(plan) {
    if (plan === "pro") return `<span class="badge badge-pro">Pro</span>`;
    return `<span class="badge badge-free">Gratuito</span>`;
}

// ===== Bootstrap =====
document.addEventListener("DOMContentLoaded", async () => {
    const user = await requireAuth();
    if (!user) return;

    // Só superadmin pode acessar
    if (user.role !== "superadmin") {
        window.location.href = "/painel.html";
        return;
    }

    const nameEl = document.getElementById("userName");
    if (nameEl) nameEl.textContent = user.name || user.email;

    attachLogoutHandler();
    initNav();
    initSearch();

    await carregarOverview();

    // Modal
    document.getElementById("modalUserSave").addEventListener("click", salvarUsuario);
    document.getElementById("modalUserCancel").addEventListener("click", () => {
        document.getElementById("modalUser").classList.add("hidden");
    });
    document.getElementById("modalUserClose").addEventListener("click", () => {
        document.getElementById("modalUser").classList.add("hidden");
    });
    document.getElementById("modalUser").addEventListener("click", e => {
        if (e.target === document.getElementById("modalUser")) {
            document.getElementById("modalUser").classList.add("hidden");
        }
    });
});
