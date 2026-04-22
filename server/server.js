const express = require('express');
const cors = require('cors');
const routes = require('./routes');

let config = {};
try {
  config = require('./config.json');
} catch (_) {
  config = {};
}

const app = express();
app.use(cors({
  origin: '*',
}));
app.use(express.json({ limit: '128kb' }));

// We use express to define our various API endpoints and
// provide their handlers that we implemented in routes.js
app.get('/avgDelay/:origin/:season', routes.avgDelay);
app.get('/avgDelayByAirline/', routes.avgDelayByAirline);
app.get('/thunderstormsByMonth/:state', routes.thunderstormsByMonth);
app.get('/flightStats', routes.flightStats);
app.get('/airlinePerformance', routes.airlinePerformance);
app.get('/airportDelayStats/:airport', routes.airportDelayStats);
app.get('/airportWeatherStats/:airport', routes.airportWeatherStats);
app.get('/worstRoutes', routes.worstRoutes);
app.get('/routeAirlineBreakdown/:originIata/:destIata', routes.routeAirlineBreakdown);
app.get('/cancellationRate/:airlineID', routes.cancellationRate);
app.get('/cancellationBreakdown/:airlineID', routes.cancellationBreakdown);
app.get('/topAirportsByVolume', routes.topAirportsByVolume);
app.get('/airlineMonthlyPerformance', routes.airlineMonthlyPerformance);
app.get('/windSpeed', routes.windSpeed);
app.get('/flightInfo', routes.flightInfo);
app.get('/unsafeGusts/:airport', routes.unsafeGusts);
app.get('/airportsList', routes.airportsList);
app.get('/airlinesList', routes.airlinesList);
app.get('/predictionMeta', routes.predictionMeta);
app.post('/predictDelay', routes.predictDelay);

const host = process.env.SERVER_HOST || config.server_host || 'localhost';
const port = Number(process.env.SERVER_PORT || config.server_port || 8080);

app.get('/', (req, res) => {
  res.send('API Server is running! Try an endpoint like /flightStats');
});

const server = app.listen(port, () => {
  console.log(`Server running at http://${host}:${port}/`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[server] FATAL: port ${port} is already in use.`);
    console.error(`[server] Another process is bound to this port. Find it with:`);
    console.error(`         lsof -nP -i :${port}`);
    console.error(`[server] Kill it, then re-run \`node server.js\`.\n`);
  } else {
    console.error('[server] FATAL listen error:', err);
  }
  process.exit(1);
});

module.exports = app;
