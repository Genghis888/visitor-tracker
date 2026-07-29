export function renderPagination(data, onChange) {

    let container = document.getElementById("pagination");

    if (!container)
        return;

    container.innerHTML = "";

    const start = (data.page - 1) * 25 + 1;

    const end = Math.min(
        data.page * 25,
        data.total
    );

    const summary = document.createElement("div");

    summary.className = "pagination-summary";

    summary.textContent =
        `Mostrando ${start}–${end} de ${data.total} registros`;

    container.append(summary);

    const prev = document.createElement("button");

    prev.textContent = "◀";

    prev.disabled = data.page === 1;

    prev.onclick = () => onChange(data.page - 1);

    const info = document.createElement("span");

    info.textContent =
        `Página ${data.page} de ${data.pages}`;

    const next = document.createElement("button");

    next.textContent = "▶";

    next.disabled = data.page === data.pages;

    next.onclick = () => onChange(data.page + 1);

const controls = document.createElement("div");

controls.className = "pagination-controls";

controls.append(
    prev,
    info,
    next
);

container.append(controls);

}