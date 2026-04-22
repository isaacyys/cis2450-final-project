import { Box, Stack, Grid, Typography } from '@mui/material';
import { getRiskScoreColor } from '../../utils/airportUtils';

export default function PerformanceTab({
    selectedAirport,
    delayData,
    weatherData,
    currentWeatherData,
    unsafeGustsData,
}) {
    const cardSx = {
        p: 2,
        borderRadius: 2,
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        height: '100%',
    };

    const sectionSx = {
        p: 2,
        borderRadius: 2,
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
    };

    const airportCode = weatherData?.airport_iata || delayData?.origin_iata || selectedAirport;
    const airportName = weatherData?.airport_name || `Airport ${airportCode || ''}`.trim();

    const metricCards = [
        {
            label: 'Average Delay',
            value: delayData?.avg_arrival_delay_minutes != null
                ? `${Number(delayData.avg_arrival_delay_minutes).toFixed(1)} min`
                : 'N/A',
        },
        {
            label: 'Total Flights',
            value: delayData?.num_flights != null
                ? Number(delayData.num_flights).toLocaleString()
                : 'N/A',
        },
        {
            label: 'Thunderstorm Likelihood',
            value: weatherData?.thunderstorm_fraction != null
                ? `${(Number(weatherData.thunderstorm_fraction) * 100).toFixed(2)}%`
                : 'N/A',
        },
        {
            label: 'Unsafe Gusts Likelihood',
            value: unsafeGustsData?.fraction_gust_over_30 != null
                ? `${(Number(unsafeGustsData.fraction_gust_over_30) * 100).toFixed(2)}%`
                : 'N/A',
        },
        {
            label: 'Combined Risk Score',
            value: weatherData?.combined_risk_score != null
                ? Number(weatherData.combined_risk_score).toFixed(2)
                : 'N/A',
            color: weatherData?.combined_risk_score != null
                ? getRiskScoreColor(weatherData.combined_risk_score)
                : 'white',
        },
        {
            label: 'Airport',
            value: airportCode ? `${airportName} (${airportCode})` : 'N/A',
        },
    ];

    const formatWithUnit = (value, unit) => {
        if (value == null || value === 'N/A') return 'N/A';
        return `${value}${unit}`;
    };

    return (
        <Stack spacing={2.5}>
            <Grid container spacing={2}>
                {metricCards.map((metric) => (
                    <Grid item xs={12} sm={6} md={4} key={metric.label}>
                        <Box sx={cardSx}>
                            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                {metric.label}
                            </Typography>
                            <Typography
                                variant="h6"
                                sx={{ color: metric.color || 'white', fontWeight: 600, mt: 0.75 }}
                            >
                                {metric.value}
                            </Typography>
                        </Box>
                    </Grid>
                ))}
            </Grid>

            <Box sx={sectionSx}>
                <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1.5 }}>
                    Current Weather Conditions
                </Typography>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Condition:</strong> {currentWeatherData?.textDescription || 'N/A'}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Temperature:</strong> {formatWithUnit(currentWeatherData?.temperature, '°C')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Wind Speed:</strong> {formatWithUnit(currentWeatherData?.windSpeed, ' km/h')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Wind Gust:</strong> {formatWithUnit(currentWeatherData?.windGust, ' km/h')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Visibility:</strong> {formatWithUnit(currentWeatherData?.visibility, ' m')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Precipitation (3h):</strong> {formatWithUnit(currentWeatherData?.precipitationLast3Hours, ' mm')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Cloud Base:</strong> {formatWithUnit(currentWeatherData?.cloudBase, ' m')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            <strong>Cloud Amount:</strong> {currentWeatherData?.cloudAmount || 'N/A'}
                        </Typography>
                    </Grid>
                </Grid>
            </Box>
        </Stack>
    );
}
