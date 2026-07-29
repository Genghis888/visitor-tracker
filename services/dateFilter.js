export function getDateFilter(
    range = "today",
    start = null,
    end = null
) {

    // Valida formato YYYY-MM-DD antes de interpolar na query,
    // pra evitar SQL injection via query string.
    const isValidDate = (value) =>
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

    switch (range) {

        case "7":

            return `
                created_at >=
                (NOW() AT TIME ZONE 'America/Sao_Paulo')
                - INTERVAL '7 days'
            `;

        case "30":

            return `
                created_at >=
                (NOW() AT TIME ZONE 'America/Sao_Paulo')
                - INTERVAL '30 days'
            `;

        case "custom":

            if (!isValidDate(start) || !isValidDate(end)) {

                return "TRUE";

            }

            return `
                DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
                BETWEEN
                DATE('${start}')
                AND
                DATE('${end}')
            `;

        default:

            return `
                DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
                =
                DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
            `;

    }

}