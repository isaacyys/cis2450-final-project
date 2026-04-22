import { useState, useEffect, useMemo } from 'react';
import {
    Container,
    Typography,
    Paper,
    Box,
    Grid,
    Autocomplete,
    TextField,
    Button,
    CircularProgress,
    Alert,
    AlertTitle,
    LinearProgress,
    Chip,
    Stack,
    Divider,
} from '@mui/material';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import {
    fetchAirports,
    fetchAirlines,
    predictDelay,
} from '../services/predictionService';

const gradientText = {
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    fontWeight: 700,
};

const inputSx = {
    '& .MuiOutlinedInput-root': {
        color: 'white',
        '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
        '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.7)' },
        '&.Mui-focused fieldset': { borderColor: '#6366f1' },
    },
    '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#a855f7' },
    '& .MuiOutlinedInput-input': { color: 'white' },
    '& input[type="date"]::-webkit-calendar-picker-indicator': { filter: 'invert(1)' },
    '& input[type="time"]::-webkit-calendar-picker-indicator': { filter: 'invert(1)' },
};

const todayLocal = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
};

const formatNumber = (v, digits = 2) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(digits);
};

export default function DelayPrediction() {
    const [airports, setAirports] = useState([]);
    const [airlines, setAirlines] = useState([]);
    const [lookupsLoading, setLookupsLoading] = useState(true);

    const [origin, setOrigin] = useState(null);
    const [dest, setDest] = useState(null);
    const [airline, setAirline] = useState(null);
    const [date, setDate] = useState(todayLocal());
    const [time, setTime] = useState('08:00');

    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLookupsLoading(true);
            const [aps, als] = await Promise.all([fetchAirports(), fetchAirlines()]);
            if (cancelled) return;
            setAirports(aps.sort((a, b) => a.iata.localeCompare(b.iata)));
            setAirlines(als.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            setLookupsLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const validationError = useMemo(() => {
        if (!origin) return 'Pick an origin airport.';
        if (!dest) return 'Pick a destination airport.';
        if (origin.iata === dest.iata) return 'Origin and destination must differ.';
        if (!airline) return 'Pick an airline.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter a valid date.';
        if (!/^\d{2}:\d{2}$/.test(time)) return 'Enter a valid time.';
        return null;
    }, [origin, dest, airline, date, time]);

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        setErrorMsg(null);
        if (validationError) {
            setErrorMsg(validationError);
            return;
        }
        setSubmitting(true);
        setResult(null);
        const resp = await predictDelay({
            origin: origin.iata,
            dest: dest.iata,
            airlineId: airline.id,
            date,
            time,
        });
        setSubmitting(false);
        if (resp.error) {
            setErrorMsg(resp.error);
            return;
        }
        setResult(resp);
    };

    const probabilityPct = result ? Math.round((result.probability || 0) * 100) : null;
    const probabilityColor = probabilityPct == null
        ? '#6366f1'
        : probabilityPct >= 66
            ? '#ef4444'
            : probabilityPct >= 40
                ? '#f59e0b'
                : '#22c55e';

    return (
        <Container maxWidth="lg">
            <Typography variant="h4" component="h1" gutterBottom sx={gradientText}>
                Arrival Delay Predictor
            </Typography>
            <Typography variant="body1" paragraph sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Pick your flight and we&apos;ll combine historical route data with the live
                National Weather Service observations to score the probability of an arrival
                delay (&gt; 15 minutes), using a gradient-boosted CatBoost model trained on
                years of US domestic flight + weather data.
            </Typography>

            <Paper
                sx={{
                    p: 3,
                    mt: 3,
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                }}
                component="form"
                onSubmit={handleSubmit}
            >
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <Autocomplete
                            options={airports}
                            loading={lookupsLoading}
                            value={origin}
                            onChange={(_, v) => setOrigin(v)}
                            isOptionEqualToValue={(opt, v) => opt?.iata === v?.iata}
                            getOptionLabel={(opt) => (opt ? `${opt.iata} · ${opt.name || ''}`.trim() : '')}
                            renderOption={(props, opt) => (
                                <li {...props} key={opt.iata}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{opt.iata}</Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            {opt.name}{opt.city ? ` — ${opt.city}${opt.state ? `, ${opt.state}` : ''}` : ''}
                                        </Typography>
                                    </Box>
                                </li>
                            )}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Origin airport"
                                    placeholder="Start typing an IATA code or city..."
                                    required
                                    sx={inputSx}
                                />
                            )}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Autocomplete
                            options={airports}
                            loading={lookupsLoading}
                            value={dest}
                            onChange={(_, v) => setDest(v)}
                            isOptionEqualToValue={(opt, v) => opt?.iata === v?.iata}
                            getOptionLabel={(opt) => (opt ? `${opt.iata} · ${opt.name || ''}`.trim() : '')}
                            renderOption={(props, opt) => (
                                <li {...props} key={opt.iata}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{opt.iata}</Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            {opt.name}{opt.city ? ` — ${opt.city}${opt.state ? `, ${opt.state}` : ''}` : ''}
                                        </Typography>
                                    </Box>
                                </li>
                            )}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Destination airport"
                                    placeholder="Start typing an IATA code or city..."
                                    required
                                    sx={inputSx}
                                />
                            )}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Autocomplete
                            options={airlines}
                            loading={lookupsLoading}
                            value={airline}
                            onChange={(_, v) => setAirline(v)}
                            isOptionEqualToValue={(opt, v) => opt?.id === v?.id}
                            getOptionLabel={(opt) => (opt ? `${opt.name || opt.description || 'Airline ' + opt.id}` : '')}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Airline"
                                    placeholder="Pick your carrier..."
                                    required
                                    sx={inputSx}
                                />
                            )}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            fullWidth
                            type="date"
                            label="Departure date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            required
                            sx={inputSx}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            fullWidth
                            type="time"
                            label="Scheduled departure (local)"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ step: 300 }}
                            required
                            sx={inputSx}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                            <Button
                                variant="contained"
                                type="submit"
                                disabled={submitting || lookupsLoading || Boolean(validationError)}
                                startIcon={submitting ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <FlightTakeoffIcon />}
                                sx={{ minWidth: 180, fontWeight: 600 }}
                            >
                                {submitting ? 'Predicting…' : 'Predict delay'}
                            </Button>
                        </Box>
                    </Grid>
                </Grid>

                {errorMsg && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {errorMsg}
                    </Alert>
                )}
            </Paper>

            {result && (
                <Paper
                    sx={{
                        p: 3,
                        mt: 3,
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                    }}
                >
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
                        <Box sx={{ flexShrink: 0, textAlign: 'center' }}>
                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                Probability of delay
                            </Typography>
                            <Typography sx={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: probabilityColor }}>
                                {probabilityPct}%
                            </Typography>
                            <Chip
                                label={result.label === 'LIKELY_DELAYED' ? 'Likely delayed' : 'Likely on-time'}
                                sx={{
                                    mt: 1,
                                    bgcolor: result.label === 'LIKELY_DELAYED' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                    color: result.label === 'LIKELY_DELAYED' ? '#fca5a5' : '#86efac',
                                    fontWeight: 600,
                                }}
                            />
                        </Box>
                        <Box sx={{ flexGrow: 1, width: '100%' }}>
                            <Typography variant="h6" sx={gradientText}>
                                {result.origin?.iata} → {result.dest?.iata}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                {result.origin?.name} to {result.dest?.name}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 1 }}>
                                {result.airline?.description || result.airline?.name} · {result.date} at {result.time}
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                                <LinearProgress
                                    variant="determinate"
                                    value={probabilityPct}
                                    sx={{
                                        height: 10,
                                        borderRadius: 5,
                                        backgroundColor: 'rgba(255,255,255,0.08)',
                                        '& .MuiLinearProgress-bar': {
                                            background: `linear-gradient(90deg, #22c55e 0%, #f59e0b 50%, #ef4444 100%)`,
                                        },
                                    }}
                                />
                            </Box>
                        </Box>
                    </Stack>

                    {result.warnings && result.warnings.length > 0 && (
                        <Alert severity="warning" sx={{ mt: 3 }}>
                            <AlertTitle>Heads up</AlertTitle>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </Alert>
                    )}

                    <Divider sx={{ my: 3, borderColor: 'rgba(99, 102, 241, 0.2)' }} />

                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle1" sx={{ color: '#a855f7', fontWeight: 700, mb: 1 }}>
                                Live weather at {result.origin?.iata}
                            </Typography>
                            <WeatherBlock w={result.weather?.origin} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle1" sx={{ color: '#a855f7', fontWeight: 700, mb: 1 }}>
                                Live weather at {result.dest?.iata}
                            </Typography>
                            <WeatherBlock w={result.weather?.dest} />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle1" sx={{ color: '#a855f7', fontWeight: 700, mb: 1 }}>
                                Historical route context
                            </Typography>
                            <Stack direction="row" spacing={2} flexWrap="wrap">
                                <StatChip label="Distance" value={`${formatNumber(result.historical?.distance_miles, 0)} mi`} />
                                <StatChip
                                    label={`Typical departures/hr at ${result.origin?.iata}`}
                                    value={formatNumber(result.historical?.origin_hourly_traffic_median, 0)}
                                />
                            </Stack>
                        </Grid>
                    </Grid>
                </Paper>
            )}
        </Container>
    );
}

function StatChip({ label, value }) {
    return (
        <Box
            sx={{
                px: 2,
                py: 1,
                borderRadius: 2,
                bgcolor: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
        >
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>{label}</Typography>
            <Typography variant="body2" sx={{ color: 'white', fontWeight: 600 }}>{value}</Typography>
        </Box>
    );
}

function WeatherBlock({ w }) {
    if (!w || Object.keys(w).length === 0) {
        return (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                No live observation available — training-time defaults were used.
            </Typography>
        );
    }
    const rows = [
        ['Temp (°F)', w.air_temp_f, 1],
        ['Dew point (°F)', w.dew_point_f, 1],
        ['Wind (kt)', w.wind_speed_knots, 1],
        ['Gust (kt)', w.wind_gust_knots, 1],
        ['Wind dir (°)', w.wind_angle_deg, 0],
        ['Visibility (mi)', w.visibility_miles, 1],
        ['Pressure (hPa)', w.pressure_hpa, 1],
        ['Precip (in)', w.precipitation_inches, 2],
        ['Ceiling (ft)', w.ceiling_height_ft, 0],
    ];
    return (
        <Grid container spacing={1}>
            {rows.map(([label, value, digits]) => (
                <Grid item xs={6} sm={4} key={label}>
                    <Box sx={{ px: 1.5, py: 1, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 1 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>
                            {label}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'white', fontWeight: 600 }}>
                            {formatNumber(value, digits)}
                        </Typography>
                    </Box>
                </Grid>
            ))}
            {w.has_thunderstorm ? (
                <Grid item xs={12}>
                    <Chip label="Thunderstorm reported" size="small"
                        sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#fca5a5' }} />
                </Grid>
            ) : null}
        </Grid>
    );
}
