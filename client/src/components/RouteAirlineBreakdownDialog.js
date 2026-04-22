import { useState, useEffect } from 'react';
import {
    Dialog,
    Box,
    Stack,
    IconButton,
    Typography,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Grid,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FlightIcon from '@mui/icons-material/Flight';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LabelList, PieChart, Pie, Cell, Legend } from 'recharts';

const config = require('../config.json');

// Color palette for pie chart
const COLORS = [
    '#2563eb',
    '#0ea5e9',
    '#7c3aed',
    '#f59e0b',
    '#10b981',
    '#ef4444',
    '#14b8a6',
    '#f97316',
];

// Airline abbreviations
const AIRLINE_ABBREVIATIONS = {
    "Allegiant Air: G4": "Allegiant",
    "American Airlines Inc.: AA": "American",
    "Frontier Airlines Inc.: F9": "Frontier",
    "JetBlue Airways: B6": "JetBlue",
    "Spirit Air Lines: NK": "Spirit",
    "PSA Airlines Inc.: OH": "PSA",
    "SkyWest Airlines Inc.: OO": "SkyWest",
    "United Air Lines Inc.: UA": "United",
    "Envoy Air: MQ": "Envoy",
    "Southwest Airlines Co.: WN": "Southwest",
    "Alaska Airlines Inc.: AS": "Alaska",
    "Delta Air Lines Inc.: DL": "Delta",
    "Endeavor Air Inc.: 9E": "Endeavor",
    "Republic Airline: YX": "Republic"
};

// Helper function to get abbreviated airline name
const getAirlineAbbreviation = (fullName) => {
    return AIRLINE_ABBREVIATIONS[fullName] || fullName;
};

export default function RouteAirlineBreakdownDialog({ open, originIata, destIata, originAirport, destAirport, months, onClose }) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);

    useEffect(() => {
        if (open && originIata && destIata) {
            fetchBreakdownData();
        }
    }, [open, originIata, destIata, months]);

    const fetchBreakdownData = async () => {
        setLoading(true);
        setData([]);

        try {
            const params = new URLSearchParams();
            if (months && months.length > 0) {
                params.append('months', months.map(m => m.value).join(','));
            }
            
            const url = `http://${config.server_host}:${config.server_port}/routeAirlineBreakdown/${encodeURIComponent(originIata)}/${encodeURIComponent(destIata)}?${params.toString()}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (Array.isArray(result)) {
                setData(result);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error('Error fetching breakdown data:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        onClose();
        setData([]);
    };

    // Prepare bar chart data
    const chartData = data.map(row => ({
        airline: getAirlineAbbreviation(row.airline_name),
        fullName: row.airline_name,
        delay: Number(row.avg_arr_delay) || 0,
        flights: row.num_flights,
    }));

    const maxDelay = chartData.length > 0 
        ? Math.max(...chartData.map(d => d.delay)) * 1.1
        : 10;

    // Prepare pie chart data (market share)
    const totalFlights = data.reduce((sum, row) => sum + row.num_flights, 0);
    const pieData = data.map((row, index) => ({
        name: getAirlineAbbreviation(row.airline_name),
        fullName: row.airline_name,
        value: row.num_flights,
        percentage: ((row.num_flights / totalFlights) * 100).toFixed(1),
        color: COLORS[index % COLORS.length],
    }));

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="lg"
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
                            <FlightIcon sx={{ color: 'white', fontSize: 20 }} />
                        </Box>
                        <Box>
                            <Typography variant="h6" sx={{ color: 'white', fontWeight: 600 }}>
                                {originAirport} → {destAirport}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                Airline Performance Breakdown
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
                ) : data.length > 0 ? (
                    <Stack spacing={3}>
                        {/* Charts Section */}
                        <Grid container spacing={2}>
                            {/* Bar Chart */}
                            <Grid item xs={12} md={6}>
                                <Box
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        background: 'rgba(15, 23, 42, 0.5)',
                                        border: '1px solid rgba(99, 102, 241, 0.2)',
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 2, textAlign: 'center' }}>
                                        Average Arrival Delay by Airline
                                    </Typography>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart 
                                            data={chartData}
                                            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                                            <XAxis 
                                                dataKey="airline" 
                                                stroke="rgba(255, 255, 255, 0.6)"
                                                tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
                                            />
                                            <YAxis 
                                                stroke="rgba(255, 255, 255, 0.6)"
                                                tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
                                                label={{ 
                                                    value: 'Avg Delay (min)', 
                                                    angle: -90, 
                                                    position: 'insideLeft', 
                                                    fill: 'rgba(255, 255, 255, 0.7)',
                                                    style: { textAnchor: 'middle' }
                                                }}
                                                domain={[0, Math.round(maxDelay)]}
                                            />
                                            <Bar 
                                                dataKey="delay" 
                                                fill="#6366f1"
                                                radius={[8, 8, 0, 0]}
                                            >
                                                <LabelList
                                                    dataKey="delay"
                                                    fill="white"
                                                    fontSize={11}
                                                    position="top"
                                                    formatter={(value) => `${Number(value).toFixed(1)}`}
                                                />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Box>
                            </Grid>

                            {/* Pie Chart */}
                            <Grid item xs={12} md={6}>
                                <Box
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        background: 'rgba(15, 23, 42, 0.5)',
                                        border: '1px solid rgba(99, 102, 241, 0.2)',
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 2, textAlign: 'center' }}>
                                        Market Share by Airline
                                    </Typography>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percentage }) => {
                                                    if (parseFloat(percentage) < 5) return null;
                                                    return `${percentage}%`;
                                                }}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Legend 
                                                wrapperStyle={{ color: 'rgba(255, 255, 255, 0.7)' }}
                                                iconType="circle"
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Box>
                            </Grid>
                        </Grid>

                        {/* Data Table */}
                        <TableContainer
                            component={Paper}
                            sx={{
                                background: 'rgba(15, 23, 42, 0.5)',
                                border: '1px solid rgba(99, 102, 241, 0.2)',
                            }}
                        >
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                            Airline
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                            Avg Delay (min)
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                            Number of Flights
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {data.map((row, index) => (
                                        <TableRow 
                                            key={index}
                                            sx={{
                                                '&:hover': {
                                                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                                },
                                            }}
                                        >
                                            <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                                {row.airline_name}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                                {row.avg_arr_delay != null ? Number(row.avg_arr_delay).toFixed(2) : 'N/A'}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                                {row.num_flights?.toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                ) : (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            No airline data found for this route.
                        </Typography>
                    </Box>
                )}
            </Box>
        </Dialog>
    );
}

