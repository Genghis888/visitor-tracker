import { requireAuth, attachLogoutHandler, getToken, getUser } from "./auth.js";

const BASE = "/api/sites";

// ===== API helpers =====
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
    if (res.status === 401) { window.location.href = "/login.html"; return null; }
    return res.json();
}

async function listarSites()     { return apiFetch(BASE); }
async function criarSite(d)      { return apiFetch(BASE, { method:"POST",  body: JSON.stringify(d) }); }
async function atualizarSite(id,d){ return apiFetch(`${BASE}/${id}`, { method:"PUT",  body: JSON.stringify(d) }); }
async function deletarSite(id)   { return apiFetch(`${BASE}/${id}`, { method:"DELETE" }); }

// ===== Estado =====
let sites = [];
let editingId = null;
let deletingId = null;

// ===== Render =====
function renderSites() {
    const list = document.getElementById("sitesList");
    const empty = document.getElementById("emptyState");

    if (!sites.length) {
        list.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }

    empty.classList.add("hidden");

    list.innerHTML = sites.map(site => `
        <div class="site-card ${site.active ? "" : "inactive"}" data-id="${site.id}">
            <div class="site-icon">🌐</div>

            <div class="site-info">
                <div class="site-name">
                    ${escHtml(site.name)}
                    ${!site.active ? '<span class="badge-inactive">Pausado</span>' : ""}
                </div>
                <div class="site-domain">🔗 ${escHtml(site.domain)}</div>
                <div class="site-meta">
                    <span class="site-visits">
                        <strong>${site.total_visits ?? 0}</strong> visitas registradas
                    </span>
                    <span class="site-token" title="${escHtml(site.token)}">
                        🔑 ${site.token.slice(0, 16)}...
                    </span>
                    <span>Criado em ${formatDate(site.created_at)}</span>
                </div>
            </div>

            <div class="site-actions">
                <button class="btn-icon-sm" onclick="verEmbed(${site.id})">
                    📋 Script
                </button>
                <button class="btn-icon-sm" onclick="editarSite(${site.id})">
                    ✏️ Editar
                </button>
                <button class="btn-icon-sm" onclick="toggleAtivo(${site.id}, ${site.active})">
                    ${site.active ? "⏸ Pausar" : "▶ Ativar"}
                </button>
                <button class="btn-icon-sm btn-danger-sm" onclick="confirmarDelete(${site.id}, '${escHtml(site.name)}')">
                    🗑
                </button>
            </div>
        </div>
    `).join("");
}

// ===== Helpers =====
function escHtml(str) {
    return String(str ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString("pt-BR");
}

function getSite(id) {
    return sites.find(s => s.id === id);
}

function gerarEmbed(site) {
    const origem = location.origin;
    return `<!-- Visitor Tracker -->
<script src="${origem}/tracker.js" data-token="${site.token}" async><\/script>`;
}

function gerarEmbedIframe(site) {
    const origem = location.origin;
    return `<!-- Visitor Tracker -->
<iframe src="${origem}/t.html?token=${site.token}&host=${site.domain}&page=/&url=URL_DA_PAGINA&title=TITULO&ref=&qs="
  style="display:none;width:0;height:0;border:0"
  referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}

// ===== Modal: Adicionar / Editar =====
window.abrirModal = function(id = null) {
    editingId = id;
    const site = id ? getSite(id) : null;
    document.getElementById("modalTitle").textContent = id ? "Editar site" : "Adicionar site";
    document.getElementById("siteName").value   = site?.name   || "";
    document.getElementById("siteDomain").value = site?.domain || "";
    document.getElementById("modalError").classList.add("hidden");
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("siteName").focus();
};

window.editarSite = function(id) { abrirModal(id); };

function fecharModal() {
    document.getElementById("modal").classList.add("hidden");
    editingId = null;
}

async function salvarSite() {
    const name   = document.getElementById("siteName").value.trim();
    const domain = document.getElementById("siteDomain").value.trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .toLowerCase();

    const errEl = document.getElementById("modalError");
    errEl.classList.add("hidden");

    if (!name || !domain) {
        errEl.textContent = "Preencha o nome e o domínio.";
        errEl.classList.remove("hidden");
        return;
    }

    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain) && domain !== "localhost") {
        errEl.textContent = "Domínio inválido. Ex: meublog.com.br";
        errEl.classList.remove("hidden");
        return;
    }

    const btn = document.getElementById("modalSave");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    try {
        let result;
        if (editingId) {
            result = await atualizarSite(editingId, { name, domain });
        } else {
            result = await criarSite({ name, domain });
        }

        if (result?.error) {
            if (result.upgrade) {
                errEl.textContent = `${result.error} Faça upgrade para o plano Pro para adicionar mais sites.`;
            } else {
                errEl.textContent = result.error;
            }
            errEl.classList.remove("hidden");
            return;
        }

        fecharModal();
        await carregarSites();

        // Se acabou de criar, abre o modal do embed automaticamente
        if (!editingId && result?.id) {
            setTimeout(() => verEmbed(result.id), 300);
        }

    } finally {
        btn.disabled = false;
        btn.textContent = "Salvar";
    }
}

// ===== Modal: Embed =====
window.verEmbed = function(id) {
    const site = getSite(id);
    if (!site) return;

    document.getElementById("embedCode").textContent = gerarEmbed(site);
    document.getElementById("embedIframeCode").textContent = gerarEmbedIframe(site);
    document.getElementById("copySuccess").classList.add("hidden");

    // Reset abas
    document.querySelectorAll(".embed-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".embed-option").forEach(o => o.classList.add("hidden"));
    document.querySelector("[data-embed='script']").classList.add("active");
    document.getElementById("embedScript").classList.remove("hidden");

    document.getElementById("modalEmbed").classList.remove("hidden");
};

// ===== Toggle ativo/pausado =====
window.toggleAtivo = async function(id, currentActive) {
    await atualizarSite(id, { active: !currentActive });
    await carregarSites();
};

// ===== Modal: Delete =====
window.confirmarDelete = function(id, name) {
    deletingId = id;
    document.getElementById("deleteSiteName").textContent = name;
    document.getElementById("modalDelete").classList.remove("hidden");
};

async function executarDelete() {
    if (!deletingId) return;
    const btn = document.getElementById("deleteConfirm");
    btn.disabled = true;
    btn.textContent = "Excluindo...";
    try {
        await deletarSite(deletingId);
        document.getElementById("modalDelete").classList.add("hidden");
        deletingId = null;
        await carregarSites();
    } finally {
        btn.disabled = false;
        btn.textContent = "Excluir";
    }
}

// ===== Carregar sites =====
async function carregarSites() {
    const data = await listarSites();
    if (!data) return;
    sites = Array.isArray(data) ? data : [];
    renderSites();
}

// ===== Bootstrap =====
document.addEventListener("DOMContentLoaded", async () => {
    const user = await requireAuth();
    if (!user) return;

    const nameEl = document.getElementById("userName");
    if (nameEl) nameEl.textContent = user.name || user.email;

    attachLogoutHandler();

    await carregarSites();

    // Botões
    document.getElementById("btnNovoSite").addEventListener("click", () => abrirModal());
    document.getElementById("modalSave").addEventListener("click", salvarSite);
    document.getElementById("modalCancel").addEventListener("click", fecharModal);
    document.getElementById("modalClose").addEventListener("click", fecharModal);

    document.getElementById("embedClose").addEventListener("click", () => {
        document.getElementById("modalEmbed").classList.add("hidden");
    });

    document.getElementById("copyEmbed").addEventListener("click", async () => {
        const code = document.getElementById("embedCode").textContent;
        await navigator.clipboard.writeText(code);
        document.getElementById("copySuccess").classList.remove("hidden");
        setTimeout(() => document.getElementById("copySuccess").classList.add("hidden"), 2000);
    });

    document.getElementById("copyEmbedIframe").addEventListener("click", async () => {
        const code = document.getElementById("embedIframeCode").textContent;
        await navigator.clipboard.writeText(code);
        document.getElementById("copySuccess").classList.remove("hidden");
        setTimeout(() => document.getElementById("copySuccess").classList.add("hidden"), 2000);
    });

    // Abas do embed
    document.querySelectorAll(".embed-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".embed-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".embed-option").forEach(o => o.classList.add("hidden"));
            tab.classList.add("active");
            document.getElementById("embed" + tab.dataset.embed.charAt(0).toUpperCase() + tab.dataset.embed.slice(1)).classList.remove("hidden");
        });
    });

    document.getElementById("deleteConfirm").addEventListener("click", executarDelete);
    document.getElementById("deleteCancel").addEventListener("click", () => {
        document.getElementById("modalDelete").classList.add("hidden");
        deletingId = null;
    });
    document.getElementById("deleteClose").addEventListener("click", () => {
        document.getElementById("modalDelete").classList.add("hidden");
        deletingId = null;
    });

    // Fechar modal clicando fora
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.add("hidden");
        });
    });

    // Enter no formulário
    ["siteName","siteDomain"].forEach(id => {
        document.getElementById(id).addEventListener("keydown", e => {
            if (e.key === "Enter") salvarSite();
        });
    });
});
