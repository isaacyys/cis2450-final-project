const config = require('../config.json');

const API_BASE = `http://${config.server_host}:${config.server_port}`;

/**
 * Fetch the list of airports the backend knows about. These are the only
 * IATA codes the CatBoost model has seen during training, so we use this list
 * to populate the airport Autocomplete dropdowns and block any free-text
 * entries that would confuse the model.
 */
export const fetchAirports = async () => {
    try {
        const res = await fetch(`${API_BASE}/airportsList`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('fetchAirports failed:', err);
        return [];
    }
};

/**
 * Fetch the list of airlines that appear in the flights table. Same reasoning
 * as fetchAirports - constrains the airline dropdown to values the model has
 * seen.
 */
export const fetchAirlines = async () => {
    try {
        const res = await fetch(`${API_BASE}/airlinesList`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('fetchAirlines failed:', err);
        return [];
    }
};

/**
 * POST /predictDelay.
 *
 * @param {Object} params
 * @param {string} params.origin    - IATA code, e.g. 'ATL'
 * @param {string} params.dest      - IATA code, e.g. 'LAX'
 * @param {number|string} params.airlineId - numeric airline ID (OP_CARRIER_AIRLINE_ID)
 * @param {string} params.date      - 'YYYY-MM-DD'
 * @param {string} params.time      - 'HH:MM' (24-hour)
 * @returns the full backend response, or { error } on failure.
 */
export const predictDelay = async ({ origin, dest, airlineId, date, time }) => {
    try {
        const res = await fetch(`${API_BASE}/predictDelay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, dest, airlineId, date, time }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { error: body.error || `Prediction failed (HTTP ${res.status})` };
        }
        return body;
    } catch (err) {
        return { error: err.message || 'Network error' };
    }
};
