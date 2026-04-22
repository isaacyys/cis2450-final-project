const config = require('../config.json');

/**
 * Fetch average delay data for a specific airport and season
 */
export const fetchDelayData = (airportCode, season) => {
    const url = `http://${config.server_host}:${config.server_port}/avgDelay/${airportCode}/${season}`;
    
    return fetch(url)
        .then(res => res.json())
        .then(resJson => {
            const record = Array.isArray(resJson) ? resJson[0] : resJson;
            return record || {};
        })
        .catch(() => ({}));
};

/**
 * Fetch delay data for all seasons (for chart)
 */
export const fetchAllSeasons = (airportCode) => {
    const seasons = ['spring', 'summer', 'fall', 'winter'];
    const seasonLabels = {
        spring: 'Spring',
        summer: 'Summer',
        fall: 'Fall',
        winter: 'Winter',
    };

    const seasonPromises = seasons.map(season => 
        fetchDelayData(airportCode, season)
            .then(record => ({
                season: seasonLabels[season],
                seasonValue: season,
                delay: record?.avg_arrival_delay_minutes || 0,
                flights: record?.num_flights || 0,
            }))
            .catch(() => ({
                season: seasonLabels[season],
                seasonValue: season,
                delay: 0,
                flights: 0,
            }))
    );

    return Promise.all(seasonPromises);
};

/**
 * Fetch delay statistics for an airport
 */
export const fetchDelayStats = (airportCode) => {
    const url = `http://${config.server_host}:${config.server_port}/airportDelayStats/${airportCode}`;
    
    return fetch(url)
        .then(res => res.json())
        .then(resJson => {
            const record = Array.isArray(resJson) ? resJson[0] : resJson;
            return record || {};
        })
        .catch(() => ({}));
};

/**
 * Fetch weather statistics for an airport
 */
export const fetchWeatherStats = (airportCode) => {
    const url = `http://${config.server_host}:${config.server_port}/airportWeatherStats/${airportCode}`;
    
    return fetch(url)
        .then(res => res.json())
        .then(resJson => {
            const record = Array.isArray(resJson) ? resJson[0] : resJson;
            return record || {};
        })
        .catch(() => ({}));
};

/**
 * Fetch combined weather/risk data for an airport (calls both endpoints and combines)
 */
export const fetchWeatherData = async (airportCode) => {
    try {
        const [delayStatsResult, weatherStatsResult] = await Promise.allSettled([
            fetchDelayStats(airportCode),
            fetchWeatherStats(airportCode)
        ]);

        const delayStats = delayStatsResult.status === 'fulfilled' ? (delayStatsResult.value || {}) : {};
        const weatherStats = weatherStatsResult.status === 'fulfilled' ? (weatherStatsResult.value || {}) : {};

        if (!delayStats.airport_iata && !weatherStats.airport_iata) {
            return {};
        }
        
        // Combine the results and calculate a combined risk score
        const delayZScore = delayStats.delay_z_score || 0;
        const weatherZScore = weatherStats.weather_z_score || 0;
        const combinedRiskScore = Number(delayZScore) + Number(weatherZScore);
        
        return {
            airport_iata: weatherStats.airport_iata || delayStats.airport_iata || airportCode,
            airport_name: weatherStats.airport_name || delayStats.airport_name || `Airport ${airportCode}`,
            ...delayStats,
            ...weatherStats,
            combined_risk_score: combinedRiskScore,
        };
    } catch (error) {
        return {};
    }
};

/**
 * Fetch current weather from National Weather Service API
 */
export const fetchCurrentWeather = (airportCode) => {
    // Convert IATA code to weather station code by prepending 'K'
    const stationCode = `K${airportCode}`;
    const apiUrl = `https://api.weather.gov/stations/${stationCode}/observations/latest`;

    return fetch(apiUrl)
        .then(res => {
            if (!res.ok) {
                throw new Error('Weather data not available');
            }
            return res.json();
        })
        .then(data => {
            const properties = data.properties || {};
            
            // Extract cloud layer data
            let cloudBase = "N/A";
            let cloudAmount = "CLEAR";
            if (properties.cloudLayers && properties.cloudLayers.length > 0 && properties.cloudLayers[0]) {
                cloudBase = properties.cloudLayers[0].base?.value != null 
                    ? Math.round(properties.cloudLayers[0].base.value) 
                    : "N/A";
                cloudAmount = properties.cloudLayers[0].amount || "CLEAR";
            }

            return {
                textDescription: properties.textDescription || "N/A",
                temperature: properties.temperature?.value != null 
                    ? Math.round(properties.temperature.value) 
                    : "N/A",
                windSpeed: properties.windSpeed?.value != null 
                    ? Number(properties.windSpeed.value).toFixed(2) 
                    : "N/A",
                windGust: properties.windGust?.value != null 
                    ? Number(properties.windGust.value).toFixed(2) 
                    : "N/A",
                visibility: properties.visibility?.value != null 
                    ? Math.round(properties.visibility.value) 
                    : "N/A",
                precipitationLast3Hours: properties.precipitationLast3Hours?.value != null 
                    ? Number(properties.precipitationLast3Hours.value).toFixed(2) 
                    : "0",
                cloudBase: cloudBase,
                cloudAmount: cloudAmount,
            };
        })
        .catch(() => ({}));
};

/**
 * Fetch unsafe gusts data for an airport
 */
export const fetchUnsafeGusts = (airportCode) => {
    const url = `http://${config.server_host}:${config.server_port}/unsafeGusts/${airportCode}`;
    
    return fetch(url)
        .then(res => res.json())
        .then(resJson => {
            const record = Array.isArray(resJson) ? resJson[0] : resJson;
            return record || {};
        })
        .catch(() => ({}));
};

