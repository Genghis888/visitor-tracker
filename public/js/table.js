export function renderTable(visits) {

    const tbody = document.querySelector("#visitsTable tbody");

    let html = "";

    visits.forEach(v => {

        const dataHora = new Date(v.created_at)
            .toLocaleString("pt-BR");

        html += `

            <tr>

                <td>${dataHora}</td>

                <td>${v.ip ?? "-"}</td>

                <td>${v.host ?? "-"}</td>

                <td>${v.country ?? "-"}</td>

                <td>${v.region ?? "-"}</td>

                <td>${v.city ?? "-"}</td>

                <td>${v.browser ?? "-"}</td>

                <td>${v.os ?? "-"}</td>

                <td class="url-cell">

                    ${v.full_url ?? "-"}

                </td>

            </tr>

        `;

    });

    tbody.innerHTML = html;

}