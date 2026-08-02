import pool from "../db.js";

// Definição dos planos e seus limites
export const PLANS = {
    free: {
        name:             "Gratuito",
        max_sites:        1,
        history_days:     30,
        can_export:       false,
        max_visits_month: 10000
    },
    pro: {
        name:             "Pro",
        max_sites:        10,
        history_days:     365,
        can_export:       true,
        max_visits_month: 500000
    }
};

// Busca o plano atual do usuário
export async function getUserPlan(userId) {
    const result = await pool.query(
        `SELECT plan_id FROM profiles WHERE id = $1`,
        [userId]
    );
    const planId = result.rows[0]?.plan_id || "free";
    return { planId, ...PLANS[planId] || PLANS.free };
}

// Verifica se o usuário pode criar mais sites
export async function canCreateSite(userId) {
    const plan = await getUserPlan(userId);

    const result = await pool.query(
        `SELECT COUNT(*)::INT AS total FROM sites WHERE user_id = $1`,
        [userId]
    );

    const currentSites = result.rows[0].total;

    return {
        allowed:  currentSites < plan.max_sites,
        current:  currentSites,
        max:      plan.max_sites,
        planId:   plan.planId,
        planName: plan.name
    };
}

// Verifica se o usuário pode exportar CSV
export async function canExport(userId) {
    const plan = await getUserPlan(userId);
    return plan.can_export;
}

// Retorna o filtro de data limitado pelo plano
export function getHistoryLimit(planId) {
    const plan = PLANS[planId] || PLANS.free;
    return plan.history_days;
}
