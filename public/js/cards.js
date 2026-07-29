function variationHTML(value){

    if (value > 0){

        return `
            <div
                class="card-variation positive"
                title="Em relação a ontem">

                ▲ ${value}%

            </div>
        `;

    }

    if (value < 0){

        return `
            <div
                class="card-variation negative"
                title="Em relação a ontem">

                ▼ ${Math.abs(value)}%

            </div>
        `;

    }

    return `
        <div
            class="card-variation neutral"
            title="Mesmo valor de ontem">

            ▬ 0%

        </div>
    `;

}

export function renderCards(stats){

    const today = document.getElementById("today");

    today.innerHTML = `
        ${stats.today}
        ${variationHTML(stats.todayVariation)}
    `;

    document.getElementById("unique").textContent = stats.unique;

    document.getElementById("countries").textContent = stats.countries;

    document.getElementById("online").textContent = stats.online;

}