const visitors = new Map();

const FLOOD_TIME = 60 * 1000; // 60 segundos

setInterval(() => {

    const now = Date.now();

    for (const [id, last] of visitors) {

        if (now - last > FLOOD_TIME * 10) {

            visitors.delete(id);

        }

    }

}, FLOOD_TIME);

export function canRegister(visitorId) {
    
    if (!visitorId)
        return true;

    const now = Date.now();

    const lastVisit = visitors.get(visitorId);

    if (lastVisit && now - lastVisit < FLOOD_TIME) {

        return false;

    }

    visitors.set(visitorId, now);

    return true;

}