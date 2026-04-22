const fs = require('fs');
const path = require('path');
const connection = require('./duckdb');
const predictor = require('./predictor');

const ROOT_DIR = path.resolve(__dirname, '..');
const AIRPORT_MAP_CSV_PATH = path.join(ROOT_DIR, 'airport_ID_mapping.csv');
const AIRLINE_MAP_CSV_PATH = path.join(ROOT_DIR, 'airline_ID_mapping.csv');

// ---------------------------------------------------------------------------
// Lightweight CSV parser. Handles quoted fields with commas (which the airline
// and airport mapping CSVs both contain) but nothing fancier; good enough for
// these two small files.
// ---------------------------------------------------------------------------
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); row = []; cell = ''; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
};

const loadCsvOnce = (cache, filepath) => {
  if (cache.value) return cache.value;
  try {
    const text = fs.readFileSync(filepath, 'utf8');
    cache.value = parseCsv(text);
  } catch (err) {
    console.warn(`[routes] failed to load ${filepath}: ${err.message}`);
    cache.value = [];
  }
  return cache.value;
};

const airportCache = { value: null };
const airlineCache = { value: null };

const getAirports = () => {
  const rows = loadCsvOnce(airportCache, AIRPORT_MAP_CSV_PATH);
  return rows.map((r) => ({
    iata: (r.iata || '').toUpperCase(),
    name: r.name,
    city: r.city,
    state: r.state,
  })).filter((a) => a.iata);
};

const getAirlines = () => {
  const rows = loadCsvOnce(airlineCache, AIRLINE_MAP_CSV_PATH);
  return rows.map((r) => ({
    id: Number(r.Code),
    description: r.Description,
  })).filter((a) => Number.isFinite(a.id));
};

const getAirportByIata = (iata) => {
  if (!iata) return null;
  const up = String(iata).toUpperCase();
  return getAirports().find((a) => a.iata === up) || null;
};

const SEASONS = {
  summer:  { start: 6, end: 9 },
  spring:  { start: 3, end: 5 },
  fall:    { start: 9, end: 11 },
  winter:  { start: 12, end: 2 },
  all:     { start: 1, end: 12 }
};


// Route 1: GET /avgDelay/:origin/:season
const avgDelay = async function(req, res) {
  const origin = req.params.origin.toUpperCase();
  const season = (req.params.season || "").toLowerCase();

  const range = SEASONS[season];
  if (!range) {
    return res.status(400).json({ error: "Invalid season" });
  }

  let query;
  let params;

  // Handle winter separately because 12–2 wraps across the year boundary.
  if (season === "winter") {
    query = `
      SELECT
        $1 AS origin_iata,
        ROUND(AVG(delay_arr),2) AS avg_arrival_delay_minutes,
        COUNT(*) AS num_flights
      FROM flights
      WHERE origin = $1
        AND cancelled = 0
        AND (
          EXTRACT(MONTH FROM date) >= 12
          OR EXTRACT(MONTH FROM date) <= 2
        );
    `;
    params = [origin];
  } else {
    query = `
      SELECT
        $1 AS origin_iata,
        ROUND(AVG(delay_arr),2) AS avg_arrival_delay_minutes,
        COUNT(*) AS num_flights
      FROM flights
      WHERE origin = $1
        AND cancelled = 0
        AND EXTRACT(MONTH FROM date) BETWEEN $2 AND $3;
    `;
    params = [origin, range.start, range.end];
  }

  connection.query(query, params, (err, result) => {
    if (err) {
      console.log(err);
      return res.json({});
    }
    res.json(result.rows?.[0] || null);
  });
};


// Route 2: GET /avgDelayByAirline/
// Supports query params: airline, origin, dest, months (comma-separated), orderBy, orderDir
const avgDelayByAirline = async function(req, res) {
  const { airline, origin, dest, months, orderBy, orderDir } = req.query;
  
  // Build WHERE conditions dynamically
  let conditions = ['f.cancelled = 0'];
  let params = [];
  let paramIndex = 1;
  
  if (airline) {
    params.push(`%${airline}%`);
    conditions.push(`LOWER(al.name) LIKE LOWER($${paramIndex})`);
    paramIndex++;
  }
  
  if (origin) {
    params.push(origin.toUpperCase());
    conditions.push(`f.origin = $${paramIndex}`);
    paramIndex++;
  }
  
  if (dest) {
    params.push(dest.toUpperCase());
    conditions.push(`f.dest = $${paramIndex}`);
    paramIndex++;
  }
  
  if (months) {
      const monthArray = months.split(',').map(m => parseInt(m)).filter(m => m >= 1 && m <= 12);
    if (monthArray.length > 0) {
      conditions.push(`EXTRACT(MONTH FROM f.date) IN (${monthArray.join(', ')})`);
    }
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Handle ordering
  const validOrderColumns = {
    'airline_id': 'al.id',
    'airline_name': 'al.name',
    'avg_dep_delay': 'avg_dep_delay_minutes',
    'avg_arr_delay': 'avg_arr_delay_minutes',
    'num_flights': 'num_flights'
  };
  
  const orderColumn = validOrderColumns[orderBy] || 'avg_arr_delay_minutes';
  const orderDirection = (orderDir && orderDir.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
  
  const query = `
    SELECT
      al.id AS airline_id,
      al.name AS airline_name,
      ROUND(AVG(f.delay_dep), 2) AS avg_dep_delay_minutes,
      ROUND(AVG(f.delay_arr), 2) AS avg_arr_delay_minutes,
      COUNT(*) AS num_flights
    FROM flights f
    JOIN airlines al ON f.airline = al.id
    ${whereClause}
    GROUP BY al.id, al.name
    ORDER BY ${orderColumn} ${orderDirection};
  `;
  
  connection.query(query, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json({ error: err.message });
    } else {
      res.json(data.rows);
    }
  });
}


// UNUSED AS OF NOW
// Route 3: GET /thunderstormsByMonth/:state
const thunderstormsByMonth = async function(req, res) {
  const state = String(req.params.state || '').toUpperCase();

  const sql = `
    SELECT
      w.station AS airport_iata,
      a.name AS airport_name,
      EXTRACT(MONTH FROM w.date) AS month,
      COUNT(*) FILTER (WHERE w.has_thunderstorm = 1)::numeric / COUNT(*) AS thunderstorm_fraction
    FROM weather w
    JOIN airports a ON w.station = a.iata
    WHERE a.state = $1
    GROUP BY w.station, a.name, EXTRACT(MONTH FROM w.date)
    ORDER BY thunderstorm_fraction DESC;
  `;

  connection.query(sql, [state], (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// UNUSED AS OF NOW
// Route 4: GET /flightStats
// Optional query params: airline, sourceState, sourceCity, destState, destCity
const flightStats = async function(req, res) {
  const conditions = [];
  const params = [];
  let p = 1;
  const upper = (s) => String(s).toUpperCase();

  if (req.query.airline)     { params.push(req.query.airline);            conditions.push(`al.name = $${p++}`); }
  if (req.query.sourceState) { params.push(upper(req.query.sourceState)); conditions.push(`ao.state = $${p++}`); }
  if (req.query.sourceCity)  { params.push(upper(req.query.sourceCity));  conditions.push(`ao.city  = $${p++}`); }
  if (req.query.destState)   { params.push(upper(req.query.destState));   conditions.push(`ad.state = $${p++}`); }
  if (req.query.destCity)    { params.push(upper(req.query.destCity));    conditions.push(`ad.city  = $${p++}`); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    WITH dep_weather AS (
      SELECT
          f.date,
          f.origin,
          f.dest,
          f.flight_number,
          f.airline,
          f.delay_dep,
          f.delay_arr,
          f.distance,
          w.has_thunderstorm
      FROM flights f
      JOIN weather w
        ON w.station = f.origin
        AND w.date    = f.date
        AND w.hour    = (f.scheduled_dep / 100)
      WHERE f.cancelled = 0
    )
    SELECT
        al.name,
        dw.origin,
        ao.name AS origin_name,
        dw.dest,
        ad.name AS dest_name,
        AVG(dw.delay_dep) AS avg_dep_delay_minutes,
        AVG(dw.delay_arr) AS avg_arr_delay_minutes,
        AVG(dw.distance)  AS avg_distance_miles,
        SUM(CASE WHEN dw.has_thunderstorm = 1 THEN 1 ELSE 0 END)::numeric / COUNT(*) AS frac_dep_with_thunderstorms,
        COUNT(*) AS num_flights
    FROM dep_weather dw
    JOIN airports ao ON dw.origin = ao.iata
    JOIN airports ad ON dw.dest   = ad.iata
    JOIN airlines al ON dw.airline = al.id
    ${whereClause}
    GROUP BY dw.origin, ao.name, dw.dest, ad.name, al.name
    HAVING COUNT(*) >= 50
    ORDER BY avg_arr_delay_minutes DESC;
  `;

  connection.query(sql, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// UNUSED RIGHT NOW
// Route 5: GET /airlinePerformance
// Optional query params: airline, sourceState, sourceCity, destState, destCity
const airlinePerformance = async function(req, res) {
  const innerConds = [];
  const outerConds = [];
  const params = [];
  let p = 1;
  const upper = (s) => String(s).toUpperCase();

  if (req.query.sourceState) { params.push(upper(req.query.sourceState)); innerConds.push(`ao.state = $${p++}`); }
  if (req.query.sourceCity)  { params.push(upper(req.query.sourceCity));  innerConds.push(`ao.city  = $${p++}`); }
  if (req.query.destState)   { params.push(upper(req.query.destState));   innerConds.push(`ad.state = $${p++}`); }
  if (req.query.destCity)    { params.push(upper(req.query.destCity));    innerConds.push(`ad.city  = $${p++}`); }
  if (req.query.airline)     { params.push(req.query.airline);            outerConds.push(`al.name = $${p++}`); }

  const innerWhereExtra = innerConds.length > 0 ? ` AND ${innerConds.join(' AND ')}` : '';
  const outerWhere = outerConds.length > 0 ? `WHERE ${outerConds.join(' AND ')}` : '';

  const sql = `
    WITH flight_weather AS (
      SELECT
          f.airline,
          f.delay_dep,
          f.delay_arr,
          f.weather_delay_fraction,
          CASE
              WHEN w.has_thunderstorm = 1
                OR w.has_gust = 1
                OR w.visibility < 3
              THEN 'adverse'
              ELSE 'normal'
          END AS weather_category
      FROM flights f
        JOIN weather w ON w.station  = f.origin
          AND w.date    = f.date
          AND w.hour    = (f.scheduled_dep / 100)
        JOIN airports ao ON f.origin = ao.iata
        JOIN airports ad ON f.dest   = ad.iata
      WHERE f.cancelled = 0${innerWhereExtra}
    )
    SELECT
        al.id   AS airline_id,
        al.name AS airline_name,
        fw.weather_category,
        AVG(fw.delay_dep) AS avg_dep_delay_minutes,
        AVG(fw.delay_arr) AS avg_arr_delay_minutes,
        AVG(fw.weather_delay_fraction) AS avg_weather_delay_fraction,
        COUNT(*) AS num_flights
    FROM flight_weather fw
    JOIN airlines al ON fw.airline = al.id
    ${outerWhere}
    GROUP BY al.id, al.name, fw.weather_category
    ORDER BY airline_name, weather_category;
  `;

  connection.query(sql, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// Route 6a: GET /airportDelayStats/:airport
// Returns delay statistics for a specific airport (complex query with CTEs and aggregations)
const airportDelayStats = async function (req, res) {
    const airport = req.params.airport;

    if (!airport) {
        return res.status(400).json({ error: "Missing required query param" })
    }

    const sql = `
    WITH airport_delay AS (
      SELECT
          f.origin AS airport_iata,
          AVG(f.delay_arr) AS avg_arr_delay,
          AVG(f.delay_dep) AS avg_dep_delay,
          COUNT(*) AS num_flights,
          COUNT(*) FILTER (WHERE f.delay_arr > 15) AS delayed_flights
      FROM flights f
      WHERE cancelled = 0
      GROUP BY f.origin
      HAVING COUNT(*) >= 100
    ),
    stats AS (
      SELECT
          AVG(avg_arr_delay) AS mean_delay,
          STDDEV_POP(avg_arr_delay) AS sd_delay
      FROM airport_delay
    )
    SELECT
        ad.airport_iata,
        a.name AS airport_name,
        ad.avg_arr_delay,
        ad.avg_dep_delay,
        ad.num_flights,
        ad.delayed_flights,
        (ad.delayed_flights::numeric / ad.num_flights * 100) AS delay_percentage,
        s.mean_delay,
        s.sd_delay,
        (
          (ad.avg_arr_delay - s.mean_delay) 
          / NULLIF(s.sd_delay, 0)
        ) AS delay_z_score
    FROM airport_delay ad
    CROSS JOIN stats s
    JOIN airports a ON ad.airport_iata = a.iata
    WHERE ad.airport_iata = $1;
  `;

    connection.query(sql, [airport], (err, data) => {
        if (err) {
            console.log(err);
            return res.json({});
        }
        res.json(data.rows);
    });
};

// Route 6b: GET /airportWeatherStats/:airport
// Returns weather statistics for a specific airport (complex query with CTEs and aggregations)
const airportWeatherStats = async function (req, res) {
    const airport = req.params.airport;

    if (!airport) {
        return res.status(400).json({ error: "Missing required query param" })
    }

    const sql = `
    WITH airport_weather AS (
      SELECT
          w.station AS airport_iata,
          COUNT(*) FILTER (WHERE w.has_thunderstorm = 1)::numeric / COUNT(*) AS thunderstorm_fraction,
          COUNT(*) FILTER (WHERE w.has_gust = 1)::numeric / COUNT(*) AS gust_fraction,
          AVG(w.visibility) AS avg_visibility,
          AVG(w.wind_speed) AS avg_wind_speed,
          COUNT(*) AS total_weather_records
      FROM weather w
      GROUP BY w.station
    ),
    stats AS (
      SELECT
          AVG(thunderstorm_fraction) AS mean_tstorm,
          STDDEV_POP(thunderstorm_fraction) AS sd_tstorm
      FROM airport_weather
    )
    SELECT
        aw.airport_iata,
        a.name AS airport_name,
        aw.thunderstorm_fraction,
        aw.gust_fraction,
        aw.avg_visibility,
        aw.avg_wind_speed,
        aw.total_weather_records,
        s.mean_tstorm,
        s.sd_tstorm,
        (
          (aw.thunderstorm_fraction - s.mean_tstorm) 
          / NULLIF(s.sd_tstorm, 0)
        ) AS weather_z_score
    FROM airport_weather aw
    CROSS JOIN stats s
    JOIN airports a ON aw.airport_iata = a.iata
    WHERE aw.airport_iata = $1;
  `;

    connection.query(sql, [airport], (err, data) => {
        if (err) {
            console.log(err);
            return res.json({});
        }
        res.json(data.rows);
    });
};


// Route 7: GET /worstRoutes
// Query params: originAirport, destAirport, months (comma-separated), orderBy, orderDir, page, limit
const worstRoutes = async function(req, res) {
  const { originAirport, destAirport, months, orderBy, orderDir, page, limit } = req.query;

  const conditions = ['f.cancelled = 0'];
  const params = [];
  let p = 1;

  // originAirport / destAirport are free-text searches against either the IATA
  // code or the airport name (case-insensitive substring match).
  if (originAirport) {
    params.push(`%${originAirport}%`);
    conditions.push(`(LOWER(ao.name) LIKE LOWER($${p}) OR LOWER(ao.iata) LIKE LOWER($${p}))`);
    p++;
  }
  if (destAirport) {
    params.push(`%${destAirport}%`);
    conditions.push(`(LOWER(ad.name) LIKE LOWER($${p}) OR LOWER(ad.iata) LIKE LOWER($${p}))`);
    p++;
  }

  if (months) {
    const monthArray = months.split(',').map(m => parseInt(m, 10)).filter(m => m >= 1 && m <= 12);
    if (monthArray.length > 0) {
      conditions.push(`EXTRACT(MONTH FROM f.date) IN (${monthArray.join(', ')})`);
    }
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const validOrderColumns = {
    'origin_airport': 'origin_airport',
    'dest_airport':   'dest_airport',
    'avg_delay':      'avg_arr_delay',
    'num_flights':    'num_flights',
  };
  const orderColumn = validOrderColumns[orderBy] || 'avg_arr_delay';
  const orderDirection = (orderDir && orderDir.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(parseInt(limit, 10) || 25, 200));
  const offset   = (pageNum - 1) * pageSize;

  const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
          SELECT ao.iata AS origin_iata, ad.iata AS dest_iata
          FROM flights f
          JOIN airports ao ON f.origin = ao.iata
          JOIN airports ad ON f.dest   = ad.iata
          ${whereClause}
          GROUP BY ao.iata, ao.name, ad.iata, ad.name
          HAVING COUNT(*) >= 10
      ) AS subquery;
  `;

  const limitParam  = `$${p++}`;
  const offsetParam = `$${p++}`;
  const dataParams = [...params, pageSize, offset];

  const dataQuery = `
      SELECT
          ao.iata AS origin_iata,
          ao.name AS origin_airport,
          ad.iata AS dest_iata,
          ad.name AS dest_airport,
          ROUND(AVG(f.delay_arr), 2) AS avg_arr_delay,
          COUNT(*) AS num_flights
      FROM flights f
      JOIN airports ao ON f.origin = ao.iata
      JOIN airports ad ON f.dest   = ad.iata
      ${whereClause}
      GROUP BY ao.iata, ao.name, ad.iata, ad.name
      HAVING COUNT(*) >= 10
      ORDER BY ${orderColumn} ${orderDirection}
      LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  connection.query(countQuery, params, (err, countResult) => {
    if (err) {
      console.log(err);
      return res.json({ error: err.message });
    }

    const total = countResult.rows[0]?.total || 0;

    connection.query(dataQuery, dataParams, (err2, data) => {
      if (err2) {
        console.log(err2);
        res.json({ error: err2.message });
      } else {
        res.json({
          data: data.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: parseInt(total, 10),
            totalPages: Math.ceil(total / pageSize),
          },
        });
      }
    });
  });
}

// Route 7b: GET /routeAirlineBreakdown/:originIata/:destIata
// Optional query param: months (comma-separated)
const routeAirlineBreakdown = async function(req, res) {
  const originIata = req.params.originIata.toUpperCase();
  const destIata = req.params.destIata.toUpperCase();
  const months = req.query.months;

  const conditions = ['f.cancelled = 0', 'f.origin = $1', 'f.dest = $2'];
  const params = [originIata, destIata];

  if (months) {
    const monthArray = months.split(',').map(m => parseInt(m, 10)).filter(m => m >= 1 && m <= 12);
    if (monthArray.length > 0) {
      conditions.push(`EXTRACT(MONTH FROM f.date) IN (${monthArray.join(', ')})`);
    }
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `
      SELECT
          al.id AS airline_id,
          al.name AS airline_name,
          ROUND(AVG(f.delay_arr), 2) AS avg_arr_delay,
          COUNT(*) AS num_flights
      FROM flights f
      JOIN airlines al ON f.airline = al.id
      ${whereClause}
      GROUP BY al.id, al.name
      HAVING COUNT(*) >= 5
      ORDER BY avg_arr_delay DESC;
  `;

  connection.query(sql, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json({ error: err.message });
    } else {
      res.json(data.rows);
    }
  });
}

// Route 8a: GET /cancellationRate/:airlineID
// Returns overall cancellation rate for an airline (complex query with CTEs and weather joins)
const cancellationRate = async function(req, res) {
  const airline = req.params.airlineID;
  if (!airline) {
    return res.status(400).json({ error: "Missing required airline ID" });
  }

  const query = `
      WITH flight_weather AS (
          SELECT
              f.airline,
              al.name AS airline_name,
              f.cancelled,
              CASE WHEN w.has_thunderstorm = 1
                   THEN 'thunderstorm'
                   ELSE 'no_thunderstorm'
              END AS wx
          FROM flights f
          JOIN weather w   ON w.station = f.origin
                          AND w.date    = f.date
                          AND w.hour    = (f.scheduled_dep / 100)
          JOIN airlines al ON f.airline = al.id
      ),
      airline_stats AS (
          SELECT
              fw.airline      AS airline_id,
              fw.airline_name AS airline_name,
              fw.wx           AS weather_category,
              COUNT(*) AS total_flights,
              ROUND(COUNT(*) FILTER (WHERE fw.cancelled = 1)::numeric / COUNT(*), 2) AS cancellation_rate
          FROM flight_weather fw
          WHERE fw.airline = $1
          GROUP BY fw.airline, fw.airline_name, fw.wx
      ),
      overall_stats AS (
          SELECT
              fw.wx AS weather_category,
              COUNT(*) AS total_flights_all,
              ROUND(COUNT(*) FILTER (WHERE fw.cancelled = 1)::numeric / COUNT(*), 2) AS avg_cancellation_rate
          FROM flight_weather fw
          GROUP BY fw.wx
      )
      SELECT
          a.airline_id,
          a.airline_name,
          a.weather_category,
          a.total_flights,
          a.cancellation_rate,
          o.total_flights_all,
          o.avg_cancellation_rate
      FROM airline_stats a
      JOIN overall_stats o ON a.weather_category = o.weather_category
      ORDER BY a.cancellation_rate DESC;
  `;

  connection.query(query, [airline], (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// Route 8b: GET /cancellationBreakdown/:airlineID
// Returns monthly cancellation breakdown for an airline (complex query with CTEs and aggregations)
const cancellationBreakdown = async function(req, res) {
  const airline = req.params.airlineID;

  if (!airline) {
    return res.status(400).json({ error: "Missing required airline ID" });
  }

  const query = `
      WITH monthly_cancellations AS (
          SELECT
              f.airline,
              al.name AS airline_name,
              EXTRACT(MONTH FROM f.date) AS month,
              COUNT(*) AS total_flights,
              COUNT(*) FILTER (WHERE f.cancelled = 1) AS cancelled_flights,
              ROUND(COUNT(*) FILTER (WHERE f.cancelled = 1)::numeric / COUNT(*) * 100, 2) AS cancellation_percentage,
              AVG(f.delay_dep) FILTER (WHERE f.cancelled = 0) AS avg_delay_non_cancelled
          FROM flights f
          JOIN airlines al ON f.airline = al.id
          WHERE f.airline = $1
          GROUP BY f.airline, al.name, EXTRACT(MONTH FROM f.date)
      )
      SELECT
          airline AS airline_id,
          airline_name,
          month,
          total_flights,
          cancelled_flights,
          cancellation_percentage,
          ROUND(avg_delay_non_cancelled::numeric, 2) AS avg_delay_non_cancelled
      FROM monthly_cancellations
      ORDER BY month;
  `;

  connection.query(query, [airline], (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// Route 8c: GET /topAirportsByVolume
// Returns top airports ranked by flight volume (complex query with ranking and aggregations) -- NOT COMPLEX ENOUGH
const topAirportsByVolume = async function(req, res) {
  const limit = req.query.limit || 25;
  
  const query = `
      WITH airport_volume AS (
          SELECT
              f.origin AS airport_iata,
              a.name AS airport_name,
              a.city AS city,
              a.state AS state,
              COUNT(*) AS total_flights,
              COUNT(DISTINCT f.dest) AS unique_destinations,
              COUNT(DISTINCT f.airline) AS airlines_operating,
              AVG(f.delay_arr) FILTER (WHERE f.cancelled = 0) AS avg_arrival_delay,
              COUNT(*) FILTER (WHERE f.cancelled = 1) AS cancelled_flights
          FROM flights f
          JOIN airports a ON f.origin = a.iata
          GROUP BY f.origin, a.name, a.city, a.state
      )
      SELECT
          airport_iata,
          airport_name,
          city,
          state,
          total_flights,
          unique_destinations,
          airlines_operating,
          ROUND(avg_arrival_delay::numeric, 2) AS avg_arrival_delay,
          cancelled_flights,
          ROUND((cancelled_flights::numeric / total_flights * 100), 2) AS cancellation_rate
      FROM airport_volume
      ORDER BY total_flights DESC
      LIMIT $1;
  `;

  connection.query(query, [limit], (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// Route 8d: GET /airlineMonthlyPerformance/:airlineID
// Returns monthly performance metrics for an airline (complex query with CTEs and aggregations)
const airlineMonthlyPerformance = async function(req, res) {
  const airline = req.query.airline || null;
  
  const query = `
      WITH monthly_perf AS (
          SELECT
              f.airline,
              al.name AS airline_name,
              EXTRACT(MONTH FROM f.date) AS month,
              COUNT(*) AS total_flights,
              AVG(f.delay_dep) AS avg_dep_delay,
              AVG(f.delay_arr) AS avg_arr_delay,
              COUNT(*) FILTER (WHERE f.delay_arr > 15) AS significantly_delayed,
              COUNT(*) FILTER (WHERE f.cancelled = 1) AS cancelled
          FROM flights f
          JOIN airlines al ON f.airline = al.id
          ${airline ? 'WHERE f.airline = $1' : ''}
          GROUP BY f.airline, al.name, EXTRACT(MONTH FROM f.date)
      )
      SELECT
          airline AS airline_id,
          airline_name,
          month,
          total_flights,
          ROUND(avg_dep_delay::numeric, 2) AS avg_dep_delay,
          ROUND(avg_arr_delay::numeric, 2) AS avg_arr_delay,
          significantly_delayed,
          cancelled,
          ROUND((significantly_delayed::numeric / total_flights * 100), 2) AS delay_rate,
          ROUND((cancelled::numeric / total_flights * 100), 2) AS cancellation_rate
      FROM monthly_perf
      ORDER BY airline_name, month;
  `;

  const params = airline ? [airline] : [];

  connection.query(query, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// Route 9: GET /windSpeed
// Optional Query Params: minDate, maxDate (YYYY-MM-DD), minHour, maxHour (0-23)
const windSpeed = async function(req, res) {
  const conditions = ['f.cancelled = 0'];
  const params = [];
  let p = 1;

  if (req.query.minDate) { params.push(req.query.minDate); conditions.push(`w.date >= DATE $${p++}`); }
  if (req.query.maxDate) { params.push(req.query.maxDate); conditions.push(`w.date <= DATE $${p++}`); }

  const minHour = parseInt(req.query.minHour, 10);
  const maxHour = parseInt(req.query.maxHour, 10);
  if (Number.isFinite(minHour)) { params.push(minHour); conditions.push(`w.hour >= $${p++}`); }
  if (Number.isFinite(maxHour)) { params.push(maxHour); conditions.push(`w.hour <= $${p++}`); }

  const sql = `
    WITH flight_weather AS (
      SELECT
        w.wind_speed,
        f.delay_dep
      FROM flights f
        JOIN weather w ON w.station = f.origin
        AND w.date    = f.date
        AND w.hour    = (f.scheduled_dep / 100)
      WHERE ${conditions.join(' AND ')}
    )
    SELECT
      (FLOOR(wind_speed / 5.0) * 5)     AS wind_speed_bucket_min,
      (FLOOR(wind_speed / 5.0) * 5) + 5 AS wind_speed_bucket_max,
      AVG(delay_dep) AS avg_dep_delay_minutes,
      COUNT(*) AS num_flights
    FROM flight_weather
    GROUP BY wind_speed_bucket_min, wind_speed_bucket_max
    ORDER BY wind_speed_bucket_min;
  `;

  connection.query(sql, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// Route 10: GET /flightInfo
// Optional query params: airline, sourceState, sourceCity, destState, destCity,
// minDate, maxDate (YYYY-MM-DD), minHour, maxHour (0-23), origin, dest, limit
const flightInfo = async function(req, res) {
  const conditions = [];
  const params = [];
  let p = 1;

  const upper = (s) => String(s).toUpperCase();

  if (req.query.airline)     { params.push(req.query.airline);            conditions.push(`al.name = $${p++}`); }
  if (req.query.sourceState) { params.push(upper(req.query.sourceState)); conditions.push(`ao.state = $${p++}`); }
  if (req.query.sourceCity)  { params.push(upper(req.query.sourceCity));  conditions.push(`ao.city  = $${p++}`); }
  if (req.query.destState)   { params.push(upper(req.query.destState));   conditions.push(`ad.state = $${p++}`); }
  if (req.query.destCity)    { params.push(upper(req.query.destCity));    conditions.push(`ad.city  = $${p++}`); }
  if (req.query.minDate)     { params.push(req.query.minDate);            conditions.push(`w.date >= DATE $${p++}`); }
  if (req.query.maxDate)     { params.push(req.query.maxDate);            conditions.push(`w.date <= DATE $${p++}`); }

  const minHour = parseInt(req.query.minHour, 10);
  const maxHour = parseInt(req.query.maxHour, 10);
  if (Number.isFinite(minHour)) { params.push(minHour); conditions.push(`w.hour >= $${p++}`); }
  if (Number.isFinite(maxHour)) { params.push(maxHour); conditions.push(`w.hour <= $${p++}`); }

  if (req.query.origin) { params.push(upper(req.query.origin)); conditions.push(`f.origin = $${p++}`); }
  if (req.query.dest)   { params.push(upper(req.query.dest));   conditions.push(`f.dest   = $${p++}`); }

  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 10, 1000));
  params.push(limit);
  const limitParam = `$${p++}`;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      f.date,
      f.airline,
      al.name AS airline_name,
      f.flight_number,
      f.origin,
      ao.name AS origin_name,
      f.dest,
      ad.name AS dest_name,
      f.scheduled_dep,
      f.actual_dep,
      f.delay_dep,
      f.scheduled_arr,
      f.actual_arr,
      f.delay_arr,
      w.wind_speed,
      w.visibility,
      w.has_thunderstorm,
      w.has_gust,
      w.cloud_condition
    FROM flights f
    JOIN airlines al ON f.airline = al.id
    JOIN airports ao  ON f.origin = ao.iata
    JOIN airports ad  ON f.dest   = ad.iata
    LEFT JOIN weather w
        ON w.station = f.origin
        AND w.date    = f.date
        AND w.hour    = (f.scheduled_dep / 100)
    ${whereClause}
    ORDER BY f.scheduled_dep
    LIMIT ${limitParam};
  `;

  connection.query(sql, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json({});
    } else {
      res.json(data.rows);
    }
  });
}

// Route 11: Getting fraction of wind gusts that are unsafe
// GET /unsafeGusts/:airport
const unsafeGusts = async function(req, res) {
    const airport = req.params.airport;
    if (!airport) {
        return res.status(400).json({ error: "Missing required query param ?airport=IATA" });
    }

    const sql = `
    WITH flight_weather AS (
      SELECT
        w.gust_speed
      FROM flights f
      JOIN weather w
        ON w.station = f.origin
       AND w.date    = f.date
       AND w.hour    = (f.scheduled_dep / 100)
      WHERE
        f.cancelled = 0
        AND f.origin = $1
    )
    SELECT
      $1::text AS airport_iata,
      CASE
        WHEN COUNT(*) = 0 THEN NULL
        ELSE COUNT(*) FILTER (WHERE gust_speed > 30)::numeric / COUNT(*)
      END AS fraction_gust_over_30
    FROM flight_weather;
  `;

    connection.query(sql, [airport], (err, data) => {
        if (err) {
            console.log(err);
            res.json({});
        } else {
            res.json(data.rows);
        }
    });
};


// ===========================================================================
// Delay prediction endpoints
// ===========================================================================

// The query that trained the CatBoost model reads weather off a curated
// ISD-style table whose units are imperial: WIND_*/GUST are knots, VISIBILITY
// is statute miles, AIR_TEMP/DEW_POINT are Fahrenheit, PRESSURE is hPa,
// PRECIPITATION is inches, CEILING_HEIGHT is feet. The NWS observations feed
// returns SI, so we convert before handing values to the model.
const KMH_TO_KNOTS = 1 / 1.852;
const METERS_TO_MILES = 1 / 1609.344;
const METERS_TO_FEET = 3.28084;
const MM_TO_INCHES = 1 / 25.4;
const PA_TO_HPA = 1 / 100;
const CELSIUS_TO_FAHRENHEIT = (c) => (c * 9) / 5 + 32;

const numericOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Convert a single NWS /observations/latest properties blob into model-ready
// numeric features (knots, Fahrenheit, inches, feet, hPa). Returns `null` for
// any field the API did not supply; the Python predictor then swaps in the
// training-time default so a missing reading never perturbs the prediction.
const extractNwsFeatures = (properties) => {
  if (!properties || typeof properties !== 'object') return {};
  const out = {};

  const windSpeedKmh = numericOrNull(properties.windSpeed?.value);
  if (windSpeedKmh !== null) out.wind_speed_knots = windSpeedKmh * KMH_TO_KNOTS;

  const windGustKmh = numericOrNull(properties.windGust?.value);
  if (windGustKmh !== null) out.wind_gust_knots = windGustKmh * KMH_TO_KNOTS;

  const windDir = numericOrNull(properties.windDirection?.value);
  if (windDir !== null) out.wind_angle_deg = ((windDir % 360) + 360) % 360;

  const visM = numericOrNull(properties.visibility?.value);
  if (visM !== null) out.visibility_miles = visM * METERS_TO_MILES;

  const tempC = numericOrNull(properties.temperature?.value);
  if (tempC !== null) out.air_temp_f = CELSIUS_TO_FAHRENHEIT(tempC);

  const dewC = numericOrNull(properties.dewpoint?.value);
  if (dewC !== null) out.dew_point_f = CELSIUS_TO_FAHRENHEIT(dewC);

  // Prefer sea-level pressure, fall back to barometric (both in Pa).
  const seaPa = numericOrNull(properties.seaLevelPressure?.value);
  const baroPa = numericOrNull(properties.barometricPressure?.value);
  const pressurePa = seaPa ?? baroPa;
  if (pressurePa !== null) out.pressure_hpa = pressurePa * PA_TO_HPA;

  const precipMm = numericOrNull(properties.precipitationLastHour?.value)
    ?? numericOrNull(properties.precipitationLast3Hours?.value);
  if (precipMm !== null) out.precipitation_inches = precipMm * MM_TO_INCHES;

  // Ceiling: first cloud layer with a base; NWS returns meters.
  let ceilingFt = null;
  let hasClouds = null;
  if (Array.isArray(properties.cloudLayers) && properties.cloudLayers.length > 0) {
    hasClouds = 0;
    for (const layer of properties.cloudLayers) {
      const amount = (layer?.amount || '').toUpperCase();
      if (amount && amount !== 'CLR' && amount !== 'SKC' && amount !== 'CLEAR') {
        hasClouds = 1;
      }
      const baseM = numericOrNull(layer?.base?.value);
      if (baseM !== null && ceilingFt === null && ['BKN', 'OVC', 'VV'].includes(amount)) {
        ceilingFt = baseM * METERS_TO_FEET;
      }
    }
  }
  if (ceilingFt !== null) out.ceiling_height_ft = ceilingFt;
  if (hasClouds !== null) out.has_clouds = hasClouds;

  // Crude thunderstorm detector off the textual description.
  const description = String(properties.textDescription || '').toLowerCase();
  out.has_thunderstorm = /thunder|\btstm\b|\bts\b/.test(description) ? 1 : 0;

  return out;
};

// Fetch the most recent METAR-style observation for a US IATA airport via the
// National Weather Service API. The station code is `K<IATA>` for contiguous
// US, which covers the 50 airports in the mapping CSV except a couple of
// Hawaiian/Alaskan exceptions; any failure here yields an empty object and
// the model falls back to its training-time defaults.
const fetchNwsObservation = async (iata) => {
  if (!iata) return {};
  const station = `K${String(iata).toUpperCase()}`;
  const url = `https://api.weather.gov/stations/${station}/observations/latest`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'cis2450-flight-dashboard (educational use)',
        'Accept': 'application/geo+json',
      },
    });
    if (!res.ok) return {};
    const data = await res.json();
    return extractNwsFeatures(data.properties || {});
  } catch (err) {
    return {};
  }
};

// Historical per-hour-per-airport flight counts are deterministic so we cache
// them in-process. Same for per-route distance.
const trafficCache = new Map();
const distanceCache = new Map();

const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
  connection.query(sql, params, (err, data) => {
    if (err) reject(err);
    else resolve(data?.rows || []);
  });
});

const getOriginHourlyTraffic = async (origin, hour) => {
  const key = `${origin}|${hour}`;
  if (trafficCache.has(key)) return trafficCache.get(key);
  const rows = await queryAsync(`
    WITH hourly AS (
      SELECT date, COUNT(*) AS c
      FROM flights
      WHERE origin = $1
        AND cancelled = 0
        AND CAST(scheduled_dep / 100 AS BIGINT) = $2
      GROUP BY date
    )
    SELECT COALESCE(MEDIAN(c), 0)::DOUBLE AS median_traffic
    FROM hourly;
  `, [origin, hour]);
  const value = Number(rows?.[0]?.median_traffic) || 0;
  trafficCache.set(key, value);
  return value;
};

const getRouteDistance = async (origin, dest) => {
  const key = `${origin}|${dest}`;
  if (distanceCache.has(key)) return distanceCache.get(key);
  const rows = await queryAsync(`
    SELECT AVG(distance)::DOUBLE AS avg_distance, COUNT(*) AS n
    FROM flights
    WHERE origin = $1 AND dest = $2 AND cancelled = 0;
  `, [origin, dest]);
  const avg = Number(rows?.[0]?.avg_distance);
  const value = Number.isFinite(avg) ? avg : null;
  distanceCache.set(key, value);
  return value;
};

// GET /airportsList -> [{iata, name, city, state}]
const airportsList = (req, res) => {
  try {
    res.json(getAirports());
  } catch (err) {
    console.error('[airportsList]', err);
    res.status(500).json({ error: 'failed to read airport mapping' });
  }
};

// GET /airlinesList -> [{id, name, description}] restricted to the airline
// IDs the CatBoost model was trained on (i.e. those present in flights_cleaned).
// Falls back to the raw CSV if the flights query fails for any reason.
const airlinesList = async (req, res) => {
  try {
    const descByCode = new Map(getAirlines().map((a) => [a.id, a.description]));
    const extractShortName = (desc) => {
      if (!desc) return null;
      // CSV descriptions look like 'Delta Air Lines Inc.: DL' — everything
      // before the final colon is the human-readable name.
      const colonIdx = desc.lastIndexOf(':');
      return colonIdx === -1 ? desc : desc.slice(0, colonIdx).trim();
    };

    let rows = [];
    try {
      rows = await queryAsync(`
        SELECT id, name
        FROM airlines
        ORDER BY name;
      `);
    } catch (err) {
      console.warn('[airlinesList] duckdb lookup failed, falling back to CSV:', err.message);
    }

    const enriched = rows.map((r) => ({
      id: Number(r.id),
      name: extractShortName(descByCode.get(Number(r.id))) || r.name,
      description: descByCode.get(Number(r.id)) || r.name,
    })).filter((r) => Number.isFinite(r.id));

    if (enriched.length > 0) return res.json(enriched);

    const fallback = getAirlines().map((a) => ({
      id: a.id,
      name: extractShortName(a.description),
      description: a.description,
    }));
    res.json(fallback);
  } catch (err) {
    console.error('[airlinesList]', err);
    res.status(500).json({ error: 'failed to load airlines' });
  }
};

// GET /predictionMeta -> metadata about the predictor (feature list, cat
// features). Useful for debugging / showing feature importances in the UI.
const predictionMeta = async (req, res) => {
  try {
    await predictor.readyPromise;
    res.json({
      ready: true,
      feature_names: predictor.featureNames,
      cat_features: predictor.catFeatures,
    });
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
};

// POST /predictDelay
//   body: { origin, dest, airlineId, date: 'YYYY-MM-DD', time: 'HH:MM' }
//   returns: {
//     probability, label, origin, dest, airline, date, time,
//     features_used, weather: {origin: {...}, dest: {...}},
//     warnings: [...]
//   }
const predictDelay = async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const warnings = [];

  // -- 1. Input validation (guardrails against typos / bad values) --------
  const rawOrigin = String(body.origin || '').toUpperCase().trim();
  const rawDest = String(body.dest || '').toUpperCase().trim();
  const rawAirline = body.airlineId ?? body.airline_id ?? body.airline;
  const rawDate = String(body.date || '').trim();
  const rawTime = String(body.time || '').trim();

  const originInfo = getAirportByIata(rawOrigin);
  const destInfo = getAirportByIata(rawDest);
  if (!originInfo) {
    return res.status(400).json({ error: `Unknown origin airport: '${rawOrigin}'. Pick one from /airportsList.` });
  }
  if (!destInfo) {
    return res.status(400).json({ error: `Unknown destination airport: '${rawDest}'. Pick one from /airportsList.` });
  }
  if (originInfo.iata === destInfo.iata) {
    return res.status(400).json({ error: 'Origin and destination must be different airports.' });
  }

  const airlineId = Number(rawAirline);
  if (!Number.isFinite(airlineId) || airlineId <= 0) {
    return res.status(400).json({ error: 'airlineId must be a positive integer.' });
  }
  const airlineMatch = getAirlines().find((a) => a.id === airlineId);
  if (!airlineMatch) {
    warnings.push(`Airline ID ${airlineId} is not in the CSV; proceeding but the model may not have seen it.`);
  }

  // Date: require YYYY-MM-DD; time: require HH:MM (24h).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format.' });
  }
  if (!/^\d{2}:\d{2}$/.test(rawTime)) {
    return res.status(400).json({ error: 'time must be in HH:MM (24-hour) format.' });
  }
  const [yy, mm, dd] = rawDate.split('-').map(Number);
  const [hh, mi] = rawTime.split(':').map(Number);
  if (
    !Number.isInteger(yy) || !Number.isInteger(mm) || !Number.isInteger(dd)
    || mm < 1 || mm > 12 || dd < 1 || dd > 31
    || hh < 0 || hh > 23 || mi < 0 || mi > 59
  ) {
    return res.status(400).json({ error: 'date/time components out of range.' });
  }

  // -- 2. Deterministic derived features ---------------------------------
  const month = mm;
  const day = dd;
  const hour = hh;
  const MONTH_SIN = Math.sin((2 * Math.PI * month) / 12);
  const MONTH_COS = Math.cos((2 * Math.PI * month) / 12);
  const DEP_HOUR_SIN = Math.sin((2 * Math.PI * hour) / 24);
  const DEP_HOUR_COS = Math.cos((2 * Math.PI * hour) / 24);

  // -- 3. Historical aggregates (distance, hourly traffic) ---------------
  let distance = null;
  let originHourlyTraffic = null;
  try {
    [distance, originHourlyTraffic] = await Promise.all([
      getRouteDistance(originInfo.iata, destInfo.iata),
      getOriginHourlyTraffic(originInfo.iata, hour),
    ]);
  } catch (err) {
    warnings.push(`Historical lookup failed (${err.message}); using defaults.`);
  }
  if (distance === null || !Number.isFinite(distance)) {
    warnings.push(`No historical flights for ${originInfo.iata} -> ${destInfo.iata}; using a neutral distance default.`);
    distance = 1000;
  }
  if (originHourlyTraffic === null || !Number.isFinite(originHourlyTraffic)) {
    originHourlyTraffic = 10;
  }

  // -- 4. Live weather for origin and destination ------------------------
  const [originWeather, destWeather] = await Promise.all([
    fetchNwsObservation(originInfo.iata),
    fetchNwsObservation(destInfo.iata),
  ]);
  if (Object.keys(originWeather).length === 0) {
    warnings.push(`Live weather unavailable for ${originInfo.iata}; using training-time defaults for origin features.`);
  }
  if (Object.keys(destWeather).length === 0) {
    warnings.push(`Live weather unavailable for ${destInfo.iata}; using training-time defaults for destination features.`);
  }

  // -- 5. Build feature dict (name -> value). Unknown fields are left off
  //      so the Python predictor substitutes the training-time defaults. --
  const features = {
    DAY_OF_MONTH: day,
    DISTANCE: distance,
    MONTH_SIN,
    MONTH_COS,
    DEP_HOUR_SIN,
    DEP_HOUR_COS,
    ORIGIN: originInfo.iata,
    DEST: destInfo.iata,
    OP_CARRIER_AIRLINE_ID: String(airlineId),
    ORIGIN_HOURLY_TRAFFIC: originHourlyTraffic,
  };

  // Origin weather block. Only copy a feature if we actually have a reading.
  if (originWeather.wind_speed_knots != null) features.ORIGIN_WIND_SPEED = originWeather.wind_speed_knots;
  if (originWeather.wind_gust_knots != null) features.ORIGIN_WIND_GUST = originWeather.wind_gust_knots;
  if (originWeather.wind_angle_deg != null) features.ORIGIN_WIND_ANGLE = originWeather.wind_angle_deg;
  if (originWeather.visibility_miles != null) features.ORIGIN_VISIBILITY = originWeather.visibility_miles;
  if (originWeather.air_temp_f != null) features.ORIGIN_AIR_TEMP = originWeather.air_temp_f;
  // Dew point: default to air temp if missing, matching the training SQL.
  if (originWeather.dew_point_f != null) features.ORIGIN_DEW_POINT_TEMP = originWeather.dew_point_f;
  else if (originWeather.air_temp_f != null) features.ORIGIN_DEW_POINT_TEMP = originWeather.air_temp_f;
  if (originWeather.pressure_hpa != null) features.ORIGIN_PRESSURE = originWeather.pressure_hpa;
  if (originWeather.precipitation_inches != null) features.ORIGIN_PRECIPITATION = originWeather.precipitation_inches;
  if (originWeather.ceiling_height_ft != null) {
    // Matches `LEAST(COALESCE(CEILING_HEIGHT,20000),20000)` + clear-ceiling flag.
    features.ORIGIN_CEILING_HEIGHT = Math.min(originWeather.ceiling_height_ft, 20000);
    features.ORIGIN_IS_CLEAR_CEILING = 0;
  } else {
    features.ORIGIN_CEILING_HEIGHT = 20000;
    features.ORIGIN_IS_CLEAR_CEILING = 1;
  }
  if (originWeather.has_thunderstorm != null) features.ORIGIN_HAS_THUNDERSTORM = originWeather.has_thunderstorm;
  if (originWeather.has_clouds != null) features.ORIGIN_HAS_CLOUDS = originWeather.has_clouds;
  // HAS_GUST mirrors whether we saw a gust reading at all (training data
  // stores a boolean flag for this). Can't be derived reliably from NWS so
  // approximate with 1 when a gust value is present.
  features.ORIGIN_HAS_GUST = originWeather.wind_gust_knots != null ? 1 : 0;

  if (destWeather.wind_speed_knots != null) features.DEST_WIND_SPEED = destWeather.wind_speed_knots;
  if (destWeather.visibility_miles != null) features.DEST_VISIBILITY = destWeather.visibility_miles;
  if (destWeather.precipitation_inches != null) features.DEST_PRECIPITATION = destWeather.precipitation_inches;
  if (destWeather.ceiling_height_ft != null) {
    features.DEST_CEILING_HEIGHT = Math.min(destWeather.ceiling_height_ft, 20000);
    features.DEST_IS_CLEAR_CEILING = 0;
  } else {
    features.DEST_CEILING_HEIGHT = 20000;
    features.DEST_IS_CLEAR_CEILING = 1;
  }
  if (destWeather.has_thunderstorm != null) features.DEST_HAS_THUNDERSTORM = destWeather.has_thunderstorm;

  // -- 6. Predict --------------------------------------------------------
  let prediction;
  try {
    prediction = await predictor.predict(features);
  } catch (err) {
    console.error('[predictDelay] predictor error:', err.message);
    return res.status(503).json({ error: `Prediction service unavailable: ${err.message}` });
  }

  res.json({
    probability: prediction.probability,
    label: prediction.probability >= 0.5 ? 'LIKELY_DELAYED' : 'LIKELY_ON_TIME',
    origin: originInfo,
    dest: destInfo,
    airline: airlineMatch || { id: airlineId, description: `Airline ${airlineId}` },
    date: rawDate,
    time: rawTime,
    features_supplied: features,
    features_used: prediction.features_used,
    weather: {
      origin: originWeather,
      dest: destWeather,
    },
    historical: {
      distance_miles: distance,
      origin_hourly_traffic_median: originHourlyTraffic,
    },
    warnings,
  });
};


module.exports = {
    avgDelay,
    avgDelayByAirline,
    thunderstormsByMonth,
    flightStats,
    airlinePerformance,
    airportDelayStats,
    airportWeatherStats,
    worstRoutes,
    routeAirlineBreakdown,
    cancellationRate,
    cancellationBreakdown,
    topAirportsByVolume,
    airlineMonthlyPerformance,
    windSpeed,
    flightInfo,
    unsafeGusts,
    airportsList,
    airlinesList,
    predictDelay,
    predictionMeta,
}
