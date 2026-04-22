import { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    CircularProgress,
    Box,
} from '@mui/material';
import AirportDetailsDialog from '../components/AirportDetailsDialog';

const config = require('../config.json');

export default function AvgDelayPage() {
    const [selectedAirport, setSelectedAirport] = useState(null);
    const [open, setOpen] = useState(false);
    const [airportData, setAirportData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orderBy, setOrderBy] = useState('total_flights');
    const [orderDir, setOrderDir] = useState('desc');

    useEffect(() => {
        fetchAirportData();
    }, []);

    const fetchAirportData = async (forceRefresh = false) => {
        const CACHE_KEY = 'airport_volume_data';
        const CACHE_TIMESTAMP_KEY = 'airport_volume_data_timestamp';
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

        // Check cache first
        if (!forceRefresh) {
            const cachedData = localStorage.getItem(CACHE_KEY);
            const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
            
            if (cachedData && cachedTimestamp) {
                const now = Date.now();
                const cacheAge = now - parseInt(cachedTimestamp, 10);
                
                // Use cache if it's less than 5 minutes old
                if (cacheAge < CACHE_TTL) {
                    try {
                        const parsedData = JSON.parse(cachedData);
                        setAirportData(parsedData);
                        return; // Use cached data, no API call needed
                    } catch (e) {
                        // If parsing fails, clear cache and fetch fresh data
                        localStorage.removeItem(CACHE_KEY);
                        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
                    }
                }
            }
        }

        // Fetch fresh data
        setLoading(true);
        try {
            const url = `http://${config.server_host}:${config.server_port}/topAirportsByVolume?limit=50`;
            const response = await fetch(url);
            const result = await response.json();
            const data = Array.isArray(result) ? result : [];
            
            // Cache the data
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
            
            setAirportData(data);
        } catch (error) {
            console.error('Error fetching airport data:', error);
            // Try to use cached data as fallback
            const cachedData = localStorage.getItem(CACHE_KEY);
            if (cachedData) {
                try {
                    setAirportData(JSON.parse(cachedData));
                } catch (e) {
                    setAirportData([]);
                }
            } else {
                setAirportData([]);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAirportClick = (airportCode) => {
        setSelectedAirport(airportCode);
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setSelectedAirport(null);
    };

    const handleSort = (column) => {
        if (orderBy === column) {
            // Toggle direction
            setOrderDir(orderDir === 'asc' ? 'desc' : 'asc');
        } else {
            // New column, default to desc
            setOrderBy(column);
            setOrderDir('desc');
        }
    };

    // Sort the data
    const sortedData = [...airportData].sort((a, b) => {
        let aVal = a[orderBy];
        let bVal = b[orderBy];

        // Handle null/undefined values
        if (aVal == null) aVal = orderDir === 'asc' ? Infinity : -Infinity;
        if (bVal == null) bVal = orderDir === 'asc' ? Infinity : -Infinity;

        // For string columns, use localeCompare
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return orderDir === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        // For numeric columns
        return orderDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return (
        <Container>
            <Typography 
                variant="h4" 
                component="h1" 
                gutterBottom
                sx={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    fontWeight: 700,
                }}
            >
                Top 50 Busiest US Airports
            </Typography>

            <Typography 
                variant="body1" 
                paragraph
                sx={{
                    color: 'rgba(255, 255, 255, 0.7)',
                }}
            >
                Browse delay and weather metrics for the top 50 busiest airports in the United States. Click a row for airport details.
            </Typography>

            {/* Airport Data Table */}
            <Box sx={{ mt: 4 }}>
                <Typography 
                    variant="h5" 
                    gutterBottom
                    sx={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontWeight: 700,
                        mb: 2,
                    }}
                >
                    Airport Volume and Delay Summary
                </Typography>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
                        <CircularProgress sx={{ color: '#6366f1' }} />
                    </Box>
                ) : airportData.length > 0 ? (
                    <TableContainer
                        component={Paper}
                        sx={{
                            background: 'rgba(30, 41, 59, 0.5)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                        }}
                    >
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                        <TableSortLabel
                                            active={orderBy === 'airport_iata'}
                                            direction={orderBy === 'airport_iata' ? orderDir : 'asc'}
                                            onClick={() => handleSort('airport_iata')}
                                            sx={{
                                                color: 'rgba(255, 255, 255, 0.9) !important',
                                                '&.Mui-active': {
                                                    color: '#6366f1 !important',
                                                },
                                                '& .MuiTableSortLabel-icon': {
                                                    color: '#6366f1 !important',
                                                },
                                            }}
                                        >
                                            IATA Code
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                        <TableSortLabel
                                            active={orderBy === 'airport_name'}
                                            direction={orderBy === 'airport_name' ? orderDir : 'asc'}
                                            onClick={() => handleSort('airport_name')}
                                            sx={{
                                                color: 'rgba(255, 255, 255, 0.9) !important',
                                                '&.Mui-active': {
                                                    color: '#6366f1 !important',
                                                },
                                                '& .MuiTableSortLabel-icon': {
                                                    color: '#6366f1 !important',
                                                },
                                            }}
                                        >
                                            Airport Name
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                        <TableSortLabel
                                            active={orderBy === 'total_flights'}
                                            direction={orderBy === 'total_flights' ? orderDir : 'asc'}
                                            onClick={() => handleSort('total_flights')}
                                            sx={{
                                                color: 'rgba(255, 255, 255, 0.9) !important',
                                                '&.Mui-active': {
                                                    color: '#6366f1 !important',
                                                },
                                                '& .MuiTableSortLabel-icon': {
                                                    color: '#6366f1 !important',
                                                },
                                            }}
                                        >
                                            Total Flights
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                        <TableSortLabel
                                            active={orderBy === 'avg_arrival_delay'}
                                            direction={orderBy === 'avg_arrival_delay' ? orderDir : 'asc'}
                                            onClick={() => handleSort('avg_arrival_delay')}
                                            sx={{
                                                color: 'rgba(255, 255, 255, 0.9) !important',
                                                '&.Mui-active': {
                                                    color: '#6366f1 !important',
                                                },
                                                '& .MuiTableSortLabel-icon': {
                                                    color: '#6366f1 !important',
                                                },
                                            }}
                                        >
                                            Avg Delay (min)
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                        <TableSortLabel
                                            active={orderBy === 'cancellation_rate'}
                                            direction={orderBy === 'cancellation_rate' ? orderDir : 'asc'}
                                            onClick={() => handleSort('cancellation_rate')}
                                            sx={{
                                                color: 'rgba(255, 255, 255, 0.9) !important',
                                                '&.Mui-active': {
                                                    color: '#6366f1 !important',
                                                },
                                                '& .MuiTableSortLabel-icon': {
                                                    color: '#6366f1 !important',
                                                },
                                            }}
                                        >
                                            Cancel Rate (%)
                                        </TableSortLabel>
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedData.map((row, index) => (
                                    <TableRow 
                                        key={row.airport_iata}
                                        onClick={() => handleAirportClick(row.airport_iata)}
                                        sx={{
                                            cursor: 'pointer',
                                            '&:hover': {
                                                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                            },
                                        }}
                                    >
                                        <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                            {row.airport_iata}
                                        </TableCell>
                                        <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                            {row.airport_name}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                            {row.total_flights?.toLocaleString()}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                            {row.avg_arrival_delay != null ? Number(row.avg_arrival_delay).toFixed(2) : 'N/A'}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                            {row.cancellation_rate != null ? `${row.cancellation_rate}%` : 'N/A'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <Paper 
                        sx={{ 
                            p: 3,
                            background: 'rgba(30, 41, 59, 0.5)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                        }}
                    >
                        <Typography 
                            variant="body1" 
                            sx={{
                                color: 'rgba(255, 255, 255, 0.7)',
                            }}
                        >
                            No airport data available.
                        </Typography>
                    </Paper>
                )}
            </Box>

            <AirportDetailsDialog
                open={open}
                selectedAirport={selectedAirport}
                onClose={handleClose}
            />
        </Container>
    );
}
