import { translateCountry } from "./translations.js";

let map;
let clusterGroup;
let userMovedMap = false;

export function initMap() {

    if (map) return;

    map = L.map("worldMap").setView([-15, -55], 3);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap"
        }
    ).addTo(map);

    clusterGroup = L.markerClusterGroup();

    map.addLayer(clusterGroup);

    map.on("dragstart", () => {
        userMovedMap = true;
    });

    map.on("zoomstart", () => {
        userMovedMap = true;
    });

}

export function updateMap(visitors) {

    clusterGroup.clearLayers();

    const bounds = [];

    visitors.forEach(v => {

        if (!v.latitude || !v.longitude)
            return;

        const flag = v.country_code
        ? `https://flagcdn.com/24x18/${v.country_code.toLowerCase()}.png`
        : "";        

        let markerClass = "visitor-green";

        if (v.total >= 10)
            markerClass = "visitor-red";
        else if (v.total >= 5)
            markerClass = "visitor-orange";
        else if (v.total >= 2)
            markerClass = "visitor-yellow";

        const marker = L.marker(
            [
                v.latitude,
                v.longitude
            ],
            {
                icon: L.divIcon({

                    className: "visitor-marker",

                    html: `<div class="visitor-dot ${markerClass}"></div>`,

                    iconSize: [18, 18],

                    iconAnchor: [9, 9],

                    popupAnchor: [0, -10]

                })
            }
        ).bindPopup(`
            <div class="popup">

                <div class="popup-header">

                    ${
                        flag
                        ?
                        `<img
                            src="${flag}"
                            class="flag"
                            alt="${translateCountry(v.country)}"
                        >`
                        :
                        ""
                    }

                    <strong>
                        ${v.city ?? "Cidade desconhecida"}
                    </strong>

                </div>

                <div class="popup-country">

                    ${translateCountry(v.country)}

                </div>

                <hr>

                <div>

                    👥 ${v.total} visitante(s)

                </div>

            </div>
        `);

        clusterGroup.addLayer(marker);

        bounds.push([
            v.latitude,
            v.longitude
        ]);

    });

    if (!userMovedMap) {

        if (bounds.length === 1) {

            map.setView(bounds[0], 6, {
                animate: false
            });

        } else if (bounds.length > 1) {

            map.fitBounds(bounds, {
                padding: [30, 30],
                animate: false,
                maxZoom: 5
            });

        }

    }

}