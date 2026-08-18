export function renderRanking(id, dados, campo) {

    const div = document.getElementById(id);

    div.innerHTML = "";

    if (!dados.length) {

        div.innerHTML = `
            <div class="rank-empty">
                Sem dados
            </div>
        `;

        return;

    }

    const maior = dados[0].total;

    dados.forEach(item => {

        const porcentagem = Math.round((item.total / maior) * 100);

        let label = item[campo] || "";
        try { label = decodeURIComponent(label); } catch(e) {}

        div.innerHTML += `

            <div class="rank-item">

                <div class="rank-top">

                    <span class="rank-label">

                        ${label}

                    </span>

                    <span class="rank-value">

                        ${item.total}

                    </span>

                </div>

                <div class="rank-bar">

                    <div
                        class="rank-fill"
                        style="width:${porcentagem}%">

                    </div>

                </div>

            </div>

        `;

    });

}