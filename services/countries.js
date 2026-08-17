import pool from "../db.js";
import { getDateFilter } from "./dateFilter.js";
import { getSiteFilter } from "./siteFilter.js";

export async function getCountries(range = "today", start = null, end = null, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";

    const result = await pool.query(`
        SELECT country, country_code, COUNT(*)::INT AS total
        FROM visits
        WHERE country IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
        GROUP BY country, country_code
        ORDER BY total DESC
    `);
    return result.rows;
}

export async function getCountriesHierarchy(range = "today", start = null, end = null, site = null, userId = null) {
    const where     = getDateFilter(range, start, end);
    const siteWhere = getSiteFilter(site);
    const userWhere = userId ? `user_id = '${userId}'` : "TRUE";

    const result = await pool.query(`
        SELECT
            country,
            country_code,
            COALESCE(region, 'Desconhecida') AS region,
            COALESCE(city,   'Desconhecida') AS city,
            ip,
            COUNT(*)::INT AS visits
        FROM visits
        WHERE country IS NOT NULL AND ${where} AND ${siteWhere} AND ${userWhere}
        GROUP BY country, country_code, region, city, ip
        ORDER BY country, region, city, visits DESC
    `);

    const map = new Map();
    for (const row of result.rows) {
        const ck = row.country;
        if (!map.has(ck)) map.set(ck, { country: row.country, country_code: row.country_code, total: 0, regions: new Map() });
        const cObj = map.get(ck);
        cObj.total += row.visits;

        const rk = row.region;
        if (!cObj.regions.has(rk)) cObj.regions.set(rk, { region: rk, total: 0, cities: new Map() });
        const rObj = cObj.regions.get(rk);
        rObj.total += row.visits;

        const citk = row.city;
        if (!rObj.cities.has(citk)) rObj.cities.set(citk, { city: citk, total: 0, ips: [] });
        const citObj = rObj.cities.get(citk);
        citObj.total += row.visits;
        citObj.ips.push({ ip: row.ip, visits: row.visits });
    }

    return [...map.values()].map(c => ({
        country:      c.country,
        country_code: c.country_code,
        total:        c.total,
        regions: [...c.regions.values()].map(r => ({
            region: r.region,
            total:  r.total,
            cities: [...r.cities.values()].map(ci => ({
                city:   ci.city,
                total:  ci.total,
                ips:    ci.ips
            }))
        }))
    }));
}
