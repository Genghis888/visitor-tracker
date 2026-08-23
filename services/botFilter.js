// Filtra bots das queries — exclui registros onde visitor_type = 'bot'
export function getBotFilter(includeBots = false) {
    if (includeBots) return "TRUE";
    return `(visitor_type IS NULL OR visitor_type = 'human')`;
}
