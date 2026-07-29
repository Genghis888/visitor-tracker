let hourlyChart = null;

export function renderHourlyChart(data) {

    const labels = data.map(v => {

        if (typeof v.label === "number") {
            return `${String(v.label).padStart(2, "0")}:00`;
        }

        return v.label;

    });

    const values = data.map(v => v.total);

    if (hourlyChart) {
        hourlyChart.destroy();
    }

    const canvas = document.getElementById("hourlyChart");

    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;



    hourlyChart = new Chart(canvas,{
        
            type: "line",

            data: {

                labels,

                datasets: [{
                    label: "Visitas",

                    data: values,

                    borderColor: "#60a5fa",
                    borderWidth: 2,

                    pointRadius: 3,
                    pointHoverRadius: 5,

                    backgroundColor: "rgba(96,165,250,.15)",

                    fill: true,

                    tension: .45

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                animation: false,

                resizeDelay: 100,

                plugins: {

                    legend: {
                        display: false
                    },

                    tooltip: {

                        displayColors: false,

                        callbacks: {

                            label(ctx) {

                                return `${ctx.parsed.y} visita(s)`;

                            }

                        }

                    }

                },

                scales: {

                    x: {

                        grid: {

                            display: false

                        }

                    },

                    y: {

                        beginAtZero: true,
                        suggestedMax: Math.max(...values)+2,

                        ticks: {

                            precision: 0
                            

                        },

                        grid: {

                            color: "rgba(255,255,255,.08)"

                        }

                    }

                }

            }

        }

    );

}