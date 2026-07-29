export const COUNTRIES = {

    "Brazil": "Brasil",

    "United States": "Estados Unidos",

    "Portugal": "Portugal",

    "Spain": "Espanha",

    "France": "França",

    "Germany": "Alemanha",

    "Italy": "Itália",

    "United Kingdom": "Reino Unido",

    "Argentina": "Argentina",

    "Chile": "Chile",

    "Uruguay": "Uruguai",

    "Paraguay": "Paraguai",

    "Bolivia": "Bolívia",

    "Peru": "Peru",

    "Colombia": "Colômbia",

    "Venezuela": "Venezuela",

    "Mexico": "México",

    "Canada": "Canadá",

    "Japan": "Japão",

    "China": "China",

    "Russia": "Rússia",

    "Australia": "Austrália"

};

export function translateCountry(name){

    return COUNTRIES[name] ?? name;

}