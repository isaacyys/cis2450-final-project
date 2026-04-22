const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const FLIGHT_DB_PATH = path.join(ROOT_DIR, 'flight_data.duckdb');
const WEATHER_DB_PATH = path.join(ROOT_DIR, 'weather_data.duckdb');
const AIRLINE_MAP_CSV_PATH = path.join(ROOT_DIR, 'airline_ID_mapping.csv');
const AIRPORT_MAP_CSV_PATH = path.join(ROOT_DIR, 'airport_ID_mapping.csv');

// Settings applied first so every subsequent statement returns parseable JSON.
// READ_ONLY is critical: without it, every ATTACH grabs a write lock on the
// .duckdb file, which causes lock contention / silent failures when multiple
// queries run in parallel against the same database file.
const PRELUDE_SQL = `
.timer off
.changes off
.headers off
.mode json
`;

const BOOTSTRAP_SQL = `
ATTACH '${FLIGHT_DB_PATH}' AS flights_db (READ_ONLY);
ATTACH '${WEATHER_DB_PATH}' AS weather_db (READ_ONLY);
CREATE OR REPLACE VIEW flights AS
SELECT
  CAST(YEAR AS INTEGER) AS year,
  CAST(MONTH AS INTEGER) AS month,
  CAST(DAY_OF_MONTH AS INTEGER) AS day_of_month,
  CAST(OP_CARRIER_AIRLINE_ID AS INTEGER) AS airline,
  CAST(OP_CARRIER_FL_NUM AS INTEGER) AS flight_number,
  ORIGIN AS origin,
  DEST AS dest,
  CAST(CRS_DEP_TIME AS INTEGER) AS scheduled_dep,
  CAST(DEP_TIME AS INTEGER) AS actual_dep,
  DEP_DELAY_NEW AS delay_dep,
  CAST(CRS_ARR_TIME AS INTEGER) AS scheduled_arr,
  CAST(ARR_TIME AS INTEGER) AS actual_arr,
  ARR_DELAY_NEW AS delay_arr,
  CANCELLED AS cancelled,
  CANCELLATION_CODE AS cancellation_code,
  ACTUAL_ELAPSED_TIME AS actual_elapsed_time,
  DISTANCE AS distance,
  CARRIER_DELAY AS carrier_delay,
  WEATHER_DELAY AS weather_delay,
  NAS_DELAY AS nas_delay,
  SECURITY_DELAY AS security_delay,
  LATE_AIRCRAFT_DELAY AS late_aircraft_delay,
  CAST(DATE AS DATE) AS date,
  ARRIVAL_DELAYED AS arrival_delayed,
  WEATHER_DELAY_FRACTION AS weather_delay_fraction
FROM flights_db.flights_cleaned;
CREATE OR REPLACE VIEW weather AS
SELECT
  STATION AS station,
  valid_ts,
  CAST(YEAR AS INTEGER) AS year,
  CAST(MONTH AS INTEGER) AS month,
  CAST(DAY AS INTEGER) AS day,
  CAST(HOUR AS INTEGER) AS hour,
  WIND_ANGLE AS wind_angle,
  WIND_SPEED AS wind_speed,
  WIND_GUST AS gust_speed,
  VISIBILITY AS visibility,
  AIR_TEMP AS air_temp,
  DEW_POINT_TEMP AS dew_point_temp,
  PRESSURE AS pressure,
  PRECIPITATION AS precipitation,
  HAS_THUNDERSTORM AS has_thunderstorm,
  CEILING_HEIGHT AS ceiling_height,
  HAS_GUST AS has_gust,
  HAS_CLOUDS AS has_clouds,
  CAST(DATE AS DATE) AS date,
  CASE
    WHEN has_clouds = 1 THEN 'CLOUDY'
    ELSE 'CLEAR'
  END AS cloud_condition
FROM weather_db.weather_cleaned;
CREATE OR REPLACE VIEW airlines AS
WITH mapping AS (
  SELECT
    CAST(Code AS INTEGER) AS id,
    Description AS name
  FROM read_csv_auto('${AIRLINE_MAP_CSV_PATH}', HEADER=TRUE)
)
SELECT DISTINCT
  CAST(f.OP_CARRIER_AIRLINE_ID AS INTEGER) AS id,
  COALESCE(m.name, 'Airline ' || CAST(f.OP_CARRIER_AIRLINE_ID AS VARCHAR)) AS name
FROM flights_db.flights_cleaned f
LEFT JOIN mapping m
  ON CAST(f.OP_CARRIER_AIRLINE_ID AS INTEGER) = m.id
WHERE f.OP_CARRIER_AIRLINE_ID IS NOT NULL;
CREATE OR REPLACE VIEW airports AS
WITH airport_ids AS (
  SELECT DISTINCT ORIGIN AS iata FROM flights_db.flights_cleaned
  UNION
  SELECT DISTINCT DEST AS iata FROM flights_db.flights_cleaned
),
airport_map AS (
  SELECT iata, name, city, state
  FROM read_csv_auto('${AIRPORT_MAP_CSV_PATH}', HEADER=TRUE)
)
SELECT
  ai.iata AS iata,
  COALESCE(am.name, 'Airport ' || ai.iata) AS name,
  am.city  AS city,
  am.state AS state
FROM airport_ids ai
LEFT JOIN airport_map am ON ai.iata = am.iata
WHERE ai.iata IS NOT NULL;
`;

const sqlLiteral = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}` : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
};

const bindParams = (sql, params = []) => {
  if (!Array.isArray(params) || params.length === 0) return sql;
  return sql.replace(/\$(\d+)/g, (_, idx) => sqlLiteral(params[Number(idx) - 1]));
};

// Splits a stream of concatenated JSON arrays (as DuckDB CLI emits in JSON
// mode) into individual parsed arrays. Robust to whitespace and to brackets
// that appear inside string literals.
const parseJsonArrays = (text) => {
  const results = [];
  let depth = 0;
  let inStr = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  return results;
};

class DuckDBSession {
  constructor() {
    this.child = null;
    this.queue = [];
    this.current = null;
    this.currentSentinel = null;
    this.stdoutBuf = '';
    this.stderrBuf = '';
    this.bootstrapped = false;
    this.ready = this.start();
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.child = spawn('duckdb', [':memory:'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        reject(err);
        return;
      }

      this.child.stdout.setEncoding('utf8');
      this.child.stderr.setEncoding('utf8');
      this.child.stdout.on('data', (chunk) => this.onStdout(chunk));
      this.child.stderr.on('data', (chunk) => this.onStderr(chunk));
      this.child.on('error', (err) => this.onCrash(err));
      this.child.on('exit', (code, signal) => {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        this.onCrash(new Error(`duckdb CLI exited (${reason}). stderr: ${this.stderrBuf}`));
      });

      this.child.stdin.write(PRELUDE_SQL);

      this.run(BOOTSTRAP_SQL)
        .then(() => {
          this.bootstrapped = true;
          console.log('[duckdb] bootstrap complete; views ready (read-only).');
          resolve();
        })
        .catch((err) => {
          console.error('[duckdb] bootstrap failed:', err.message);
          reject(err);
        });
    });
  }

  onCrash(err) {
    const failures = [this.current, ...this.queue].filter(Boolean);
    this.current = null;
    this.queue = [];
    this.currentSentinel = null;
    for (const job of failures) job.reject(err);
  }

  run(sql) {
    return new Promise((resolve, reject) => {
      this.queue.push({ sql, resolve, reject });
      this.pump();
    });
  }

  pump() {
    if (this.current || this.queue.length === 0) return;
    if (!this.child || !this.child.stdin.writable) {
      const job = this.queue.shift();
      job.reject(new Error('duckdb child process is not writable'));
      return;
    }

    const job = this.queue.shift();
    this.current = job;
    this.stdoutBuf = '';
    this.stderrBuf = '';
    const sentinel = `__DUCK_END_${crypto.randomBytes(8).toString('hex')}__`;
    this.currentSentinel = sentinel;

    // Trailing sentinel SELECT delimits this query's output. DuckDB CLI keeps
    // running subsequent statements even if a prior one errored, so the
    // sentinel reliably appears.
    const payload = `${job.sql}\nSELECT '${sentinel}' AS __sentinel__;\n`;
    this.child.stdin.write(payload);
  }

  onStderr(chunk) {
    this.stderrBuf += chunk;
  }

  onStdout(chunk) {
    this.stdoutBuf += chunk;
    if (!this.currentSentinel) return;
    if (this.stdoutBuf.indexOf(this.currentSentinel) === -1) return;

    const job = this.current;
    const buf = this.stdoutBuf;
    const stderr = this.stderrBuf;

    this.current = null;
    this.currentSentinel = null;
    this.stdoutBuf = '';
    this.stderrBuf = '';

    try {
      const arrays = parseJsonArrays(buf);
      // Last array is always the sentinel result; everything before is the
      // actual query output. Most routes issue a single SELECT, so we return
      // the last non-sentinel array.
      const resultArrays = arrays.slice(0, -1);
      const rows = resultArrays.length > 0 ? resultArrays[resultArrays.length - 1] : [];

      if (stderr && stderr.trim()) {
        // DuckDB printed an error but still ran the sentinel. Surface it.
        job.reject(new Error(stderr.trim()));
      } else {
        job.resolve(rows);
      }
    } catch (e) {
      job.reject(new Error(`Failed to parse duckdb output: ${e.message}\nstderr: ${stderr}\nstdout: ${buf.slice(0, 500)}`));
    } finally {
      this.pump();
    }
  }
}

const session = new DuckDBSession();

session.ready.catch((err) => {
  console.error('[duckdb] session failed to initialize:', err.message);
  process.exitCode = 1;
});

// Make sure the long-lived duckdb child doesn't outlive the Node parent.
// Without this, smoke tests / Ctrl-C runs can leave orphan duckdb processes
// holding read-only locks on the .duckdb files, which then blocks the next
// `node server.js` invocation.
const shutdown = (signal) => {
  try {
    if (session.child && !session.child.killed) {
      session.child.kill('SIGTERM');
    }
  } catch (_) { /* ignore */ }
  if (signal) process.exit(0);
};
process.on('exit', () => shutdown(null));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP',  () => shutdown('SIGHUP'));

const query = (sql, params, callback) => {
  const hasParams = Array.isArray(params);
  const cb = hasParams ? callback : params;
  const queryParams = hasParams ? params : [];
  const boundSql = bindParams(sql, queryParams);

  session.ready
    .then(() => session.run(boundSql))
    .then((rows) => cb(null, { rows }))
    .catch((err) => cb(err));
};

module.exports = {
  query,
};
