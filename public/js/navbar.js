import { attachLogoutHandler } from "./auth.js";

export async function loadNavbar() {

    const container = document.getElementById("navbar");

    if (!container) return;

    const html = await fetch("./partials/navbar.html")
        .then(r => r.text());

    container.innerHTML = html;

    // destaca a página atual

    const atual = location.pathname.split("/").pop();

    container.querySelectorAll("a").forEach(link => {

        if (link.getAttribute("href") === atual) {

            link.classList.add("active");

        }

    });

    attachLogoutHandler();

}