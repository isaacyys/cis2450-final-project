import { useState, useEffect } from 'react';
import {
    Dialog,
    Box,
    Stack,
    IconButton,
    Typography,
    CircularProgress,
    Chip,
    Grid,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    Legend,
    Tooltip,
    LabelList
} from 'recharts';

const config = require('../config.json');

export default function AirlineCancellationDialog({ open, airlineId, airlineName, onClose }) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [monthlyData, setMonthlyData] = useState([]);

    useEffect(() => {
        if (open && airlineId) {
            fetchCancellationData();
            fetchMonthlyBreakdown();
        }
    }, [open, airlineId]);

    const fetchCancellationData = async () => {
        setLoading(true);
        setData(null);

        try {
            const url = `http://${config.server_host}:${config.server_port}/cancellationRate/${airlineId}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (Array.isArray(result)) {
                // Convert to object keyed by weather category
                const dataObj = {
                    thunderstorm: result.find(r => r.weather_category === 'thunderstorm'),
                    no_thunderstorm: result.find(r => r.weather_category === 'no_thunderstorm'),
                };
                setData(dataObj);
            } else {
                setData(null);
            }
        } catch (error) {
            console.error('Error fetching cancellation data:', error);
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchMonthlyBreakdown = async () => {
        try {
            const url = `http://${config.server_host}:${config.server_port}/cancellationBreakdown/${airlineId}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (Array.isArray(result)) {
                setMonthlyData(result);
            } else {
                setMonthlyData([]);
            }
        } catch (error) {
            console.error('Error fetching monthly breakdown:', error);
            setMonthlyData([]);
        }
    };

    const handleClose = () => {
        onClose();
        setData(null);
    };

    // Prepare bar chart data
    const prepareBarChartData = () => {
        if (!data || (!data.thunderstorm && !data.no_thunderstorm)) return [];

        const chartData = [];

        // Thunderstorm data
        if (data.thunderstorm) {
            chartData.push({
                condition: 'Thunderstorm',
                airline: (data.thunderstorm.cancellation_rate * 100) || 0,
                average: (data.thunderstorm.avg_cancellation_rate * 100) || 0,
                airlineFlights: data.thunderstorm.total_flights,
                averageFlights: data.thunderstorm.total_flights_all,
            });
        }

        // No thunderstorm data
        if (data.no_thunderstorm) {
            chartData.push({
                condition: 'Normal',
                airline: (data.no_thunderstorm.cancellation_rate * 100) || 0,
                average: (data.no_thunderstorm.avg_cancellation_rate * 100) || 0,
                airlineFlights: data.no_thunderstorm.total_flights,
                averageFlights: data.no_thunderstorm.total_flights_all,
            });
        }

        return chartData;
    };

    const barChartData = prepareBarChartData();
    const maxRate = barChartData.length > 0 
        ? Math.max(...barChartData.map(d => Math.max(d.airline, d.average))) * 1.1
        : 10;

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                }
            }}
        >
            <Box
                sx={{
                    position: 'relative',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 50%, rgba(236, 72, 153, 0.1) 100%)',
                    borderRadius: '12px',
                    p: 3,
                }}
            >
                {/* Header */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 2,
                                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <FlightTakeoffIcon sx={{ color: 'white', fontSize: 20 }} />
                        </Box>
                        <Box>
                            <Typography variant="h6" sx={{ color: 'white', fontWeight: 600 }}>
                                {airlineName || 'Airline'} Cancellation Statistics
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                Weather Impact on Flight Cancellations
                            </Typography>
                        </Box>
                    </Stack>
                    <IconButton
                        onClick={handleClose}
                        sx={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            '&:hover': {
                                color: 'white',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            }
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                </Stack>

                {/* Content */}
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
                        <CircularProgress sx={{ color: '#6366f1' }} />
                    </Box>
                ) : data && (data.thunderstorm || data.no_thunderstorm) ? (
                    <Stack spacing={3}>
                        {/* Summary Cards */}
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <Box
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                    }}
                                >
                                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                        Thunderstorm Conditions
                                    </Typography>
                                    <Typography variant="h5" sx={{ color: '#ef4444', fontWeight: 600, mt: 0.5 }}>
                                        {data.thunderstorm 
                                            ? `${(data.thunderstorm.cancellation_rate * 100).toFixed(2)}%`
                                            : 'N/A'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block', mt: 0.5 }}>
                                        {data.thunderstorm 
                                            ? `${data.thunderstorm.total_flights?.toLocaleString()} total flights`
                                            : 'No data'}
                                    </Typography>
                                    {data.thunderstorm && (
                                        <Chip
                                            label={`${Math.round(data.thunderstorm.total_flights * data.thunderstorm.cancellation_rate).toLocaleString()} cancelled flights`}
                                            size="small"
                                            sx={{
                                                mt: 1,
                                                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                color: '#ef4444',
                                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                            }}
                                        />
                                    )}
                                </Box>
                            </Grid>
                            <Grid item xs={6}>
                                <Box
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                    }}
                                >
                                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                        Normal Conditions
                                    </Typography>
                                    <Typography variant="h5" sx={{ color: '#10b981', fontWeight: 600, mt: 0.5 }}>
                                        {data.no_thunderstorm 
                                            ? `${(data.no_thunderstorm.cancellation_rate * 100).toFixed(2)}%`
                                            : 'N/A'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block', mt: 0.5 }}>
                                        {data.no_thunderstorm 
                                            ? `${data.no_thunderstorm.total_flights?.toLocaleString()} total flights`
                                            : 'No data'}
                                    </Typography>
                                    {data.no_thunderstorm && (
                                        <Chip
                                            label={`${Math.round(data.no_thunderstorm.total_flights * data.no_thunderstorm.cancellation_rate).toLocaleString()} cancelled flights`}
                                            size="small"
                                            sx={{
                                                mt: 1,
                                                backgroundColor: 'rgba(251, 146, 60, 0.2)',
                                                color: '#fb923c',
                                                border: '1px solid rgba(251, 146, 60, 0.4)',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                            }}
                                        />
                                    )}
                                </Box>
                            </Grid>
                        </Grid>

                        {/* Comparison Bar Chart */}
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                background: 'rgba(15, 23, 42, 0.5)',
                                border: '1px solid rgba(99, 102, 241, 0.2)',
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 2, textAlign: 'center' }}>
                                Cancellation Rate Comparison
                            </Typography>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart 
                                    data={barChartData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                                    <XAxis 
                                        dataKey="condition" 
                                        stroke="rgba(255, 255, 255, 0.6)"
                                        tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
                                    />
                                    <YAxis 
                                        stroke="rgba(255, 255, 255, 0.6)"
                                        tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
                                        label={{ 
                                            value: 'Cancellation Rate (%)', 
                                            angle: -90, 
                                            position: 'insideLeft', 
                                            fill: 'rgba(255, 255, 255, 0.7)',
                                            style: { textAnchor: 'middle' }
                                        }}
                                        domain={[0, Math.max(20, Math.round(maxRate))]}
                                    />
                                    <Legend 
                                        wrapperStyle={{ color: 'rgba(255, 255, 255, 0.7)' }}
                                    />
                                    <Bar 
                                        dataKey="airline" 
                                        name="This Airline"
                                        fill="#6366f1"
                                        radius={[8, 8, 0, 0]}
                                    ><LabelList
                                        dataKey="airline"
                                        fill="white"
                                        fontSize={12}
                                        formatter={(value) => `${value.toFixed(1)}%`}
                                    />
                                    </Bar>
                                    <Bar 
                                        dataKey="average" 
                                        name="Airlines' Average"
                                        fill="#a855f7"
                                        radius={[8, 8, 0, 0]}>
                                        <LabelList
                                            dataKey="average"
                                            fill="white"
                                            fontSize={12}
                                            formatter={(value) => `${value.toFixed(1)}%`}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>

                        {/* Monthly Trend Chart */}
                        {monthlyData.length > 0 && (
                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    background: 'rgba(15, 23, 42, 0.5)',
                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 2, textAlign: 'center' }}>
                                    Monthly Cancellation Trend
                                </Typography>
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart 
                                        data={monthlyData}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                                        <XAxis 
                                            dataKey="month" 
                                            stroke="rgba(255, 255, 255, 0.6)"
                                            tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
                                            label={{
                                                value: 'Month',
                                                position: 'insideBottom',
                                                offset: -5,
                                                fill: 'rgba(255, 255, 255, 0.7)'
                                            }}
                                        />
                                        <YAxis 
                                            stroke="rgba(255, 255, 255, 0.6)"
                                            tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
                                            label={{ 
                                                value: 'Cancellation %', 
                                                angle: -90, 
                                                position: 'insideLeft', 
                                                fill: 'rgba(255, 255, 255, 0.7)',
                                                style: { textAnchor: 'middle' }
                                            }}
                                        />
                                        <Tooltip 
                                            contentStyle={{
                                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                                borderRadius: '8px',
                                                color: 'white',
                                            }}
                                            formatter={(value, name) => {
                                                if (name === 'cancellation_percentage') {
                                                    return [`${value}%`, 'Cancellation Rate'];
                                                }
                                                return [value, name];
                                            }}
                                        />
                                        <Line 
                                            type="monotone"
                                            dataKey="cancellation_percentage"
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            dot={{ fill: '#6366f1', r: 4 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Box>
                        )}
                    </Stack>
                ) : (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            No cancellation data found for this airline.
                        </Typography>
                    </Box>
                )}
            </Box>
        </Dialog>
    );
}

