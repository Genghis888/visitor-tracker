import { translateCountry } from "./translations.js";

export function renderDashboardVisitors(visits) {

    const container =
        document.getElementById("latestVisitors");

    if (!container)
        return;

    container.innerHTML = "";

    visits.forEach(v => {

        const item = document.createElement("div");

        item.className = "visitor-item";

        item.innerHTML = `

            <div class="visitor-top">

                <span class="visitor-time">

                    ${new Date(v.created_at)
                        .toLocaleTimeString(
                            "pt-BR",
                            {
                                hour:"2-digit",
                                minute:"2-digit"
                            }
                        )}

                </span>

                <span class="visitor-country">

                    ${translateCountry(v.country ?? "Desconhecido")}

                </span>

            </div>

            ${v.host ? `<div class="visitor-site">🌐 ${v.host}</div>` : ""}

            <div class="visitor-location">

                📍 ${v.city ?? "Cidade desconhecida"}

                ${v.region ? " - " + v.region : ""}

            </div>

            <div class="visitor-page">

                📄 ${
                        v.page_title?.trim()
                        || v.page?.trim()
                        || "Página Inicial"
                    }

            </div>

            <div class="visitor-system">

                🌐 ${v.browser ?? "-"}

                ·

                💻 ${v.os ?? "-"}

            </div>

            <div class="visitor-ip">

                🔌 ${v.ip ?? "-"}

            </div>

        `;

        container.appendChild(item);

    });

}