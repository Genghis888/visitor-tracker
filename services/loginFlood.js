const attempts = new Map();

const WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 8;

setInterval(() => {

    const now = Date.now();

    for (const [ip, data] of attempts) {

        if (now - data.first > WINDOW) {

            attempts.delete(ip);

        }

    }

}, WINDOW);

export function canAttemptLogin(ip) {

    const now = Date.now();

    const data = attempts.get(ip);

    if (!data) {

        attempts.set(ip, { first: now, count: 1 });

        return true;

    }

    if (now - data.first > WINDOW) {

        attempts.set(ip, { first: now, count: 1 });

        return true;

    }

    if (data.count >= MAX_ATTEMPTS) {

        return false;

    }

    data.count++;

    return true;

}

export function resetLoginAttempts(ip) {

    attempts.delete(ip);

}
