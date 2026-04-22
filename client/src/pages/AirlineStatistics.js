import { useState, useEffect, useMemo } from 'react';
import {
    Container,
    Typography,
    Stack,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Paper,
    Box,
    Grid,
    Chip,
    CircularProgress,
    Autocomplete,
} from '@mui/material';
import AirlineCancellationDialog from '../components/AirlineCancellationDialog';

const config = require('../config.json');

// Mapping from BTS airline numeric ID to friendly display name
const AIRLINE_ID_TO_NAME = {
    19393: 'Southwest Airlines',
    19690: 'Hawaiian Airlines',
    19790: 'Delta Air Lines',
    19805: 'American Airlines',
    19930: 'Alaska Airlines',
    19977: 'United Airlines',
    20237: 'Trans States Airlines',
    20253: 'Cape Air',
    20254: 'Colgan Air',
    20258: 'Big Sky Airlines',
    20265: 'Freedom Airlines',
    20291: 'Air Midwest',
    20304: 'SkyWest Airlines',
    20312: 'ATA Airlines',
    20355: 'US Airways',
    20356: 'Skyway Airlines',
    20358: 'Great Lakes Airlines',
    20363: 'Endeavor Air',
    20366: 'ExpressJet Airlines',
    20368: 'Allegiant Air',
    20378: 'Mesa Airlines',
    20397: 'PSA Airlines',
    20398: 'Envoy Air',
    20401: 'Silver Airways',
    20409: 'JetBlue Airways',
    20416: 'Spirit Airlines',
    20418: 'Chautauqua Airlines',
    20422: 'Sun Country Airlines',
    20427: 'Piedmont Airlines',
    20436: 'Frontier Airlines',
    20437: 'AirTran Airways',
    20445: 'CommuteAir',
    20448: 'Shuttle America',
    20452: 'Republic Airline',
    20453: 'ABX Air',
    20500: 'GoJet Airlines',
    21171: 'Virgin America',
    21217: 'Lynx Aviation (Frontier)',
    21618: 'Southern Airways Express',
    21635: 'Contour Airlines',
    21718: 'JSX',
    22080: 'Breeze Airways',
    20207: 'Avelo Airlines',
};

const getAirlineName = (id, fallbackName) => {
    const mapped = AIRLINE_ID_TO_NAME[Number(id)];
    if (mapped) return mapped;
    // If fallback name looks like a number (the DB returned the raw ID), show generic label
    if (fallbackName && /^\d+$/.test(String(fallbackName).trim())) {
        return `Airline ${id}`;
    }
    // Strip trailing ": XX" IATA code pattern for cleaner display
    if (fallbackName) {
        return String(fallbackName).replace(/:\s*[A-Z0-9]{1,4}\s*(\(.*\))?\s*$/, '').trim();
    }
    return `Airline ${id}`;
};

const MONTHS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
];

export default function AirlineStatistics() {
    // Filter states
    const [airlineFilter, setAirlineFilter] = useState('');
    const [originFilter, setOriginFilter] = useState('');
    const [destFilter, setDestFilter] = useState('');
    const [monthsFilter, setMonthsFilter] = useState([]);
    
    // Data and sorting states
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orderBy, setOrderBy] = useState('avg_arr_delay');
    const [orderDir, setOrderDir] = useState('desc');
    
    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedAirline, setSelectedAirline] = useState(null);

    // Client-side airline name filter applied after fetch
    const filteredData = useMemo(() => {
        if (!airlineFilter.trim()) return data;
        const search = airlineFilter.trim().toLowerCase();
        return data.filter(row => {
            const name = getAirlineName(row.airline_id, row.airline_name).toLowerCase();
            return name.includes(search);
        });
    }, [data, airlineFilter]);

    // Fetch data on component mount and when filters/sorting change
    useEffect(() => {
        fetchData();
    }, [orderBy, orderDir]);

    const fetchData = async () => {
        setLoading(true);

        // Build query params — airline filter is applied client-side using name mapping
        const params = new URLSearchParams();
        if (originFilter.trim()) params.append('origin', originFilter.toUpperCase().trim());
        if (destFilter.trim()) params.append('dest', destFilter.toUpperCase().trim());
        if (monthsFilter.length > 0) params.append('months', monthsFilter.map(m => m.value).join(','));
        params.append('orderBy', orderBy);
        params.append('orderDir', orderDir);

        const url = `http://${config.server_host}:${config.server_port}/avgDelayByAirline/?${params.toString()}`;

        try {
            const response = await fetch(url);
            const result = await response.json();
            setData(Array.isArray(result) ? result : []);
        } catch (error) {
            console.error('Error fetching data:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = () => {
        fetchData();
    };

    const handleClearFilters = () => {
        setAirlineFilter('');
        setOriginFilter('');
        setDestFilter('');
        setMonthsFilter([]);
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

    const handleRowClick = (row) => {
        setSelectedAirline({
            id: row.airline_id,
            name: row.airline_name,
        });
        setDialogOpen(true);
    };

    const handleDialogClose = () => {
        setDialogOpen(false);
        setSelectedAirline(null);
    };

    return (
        <Container maxWidth="xl">
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
                Airline Delay Statistics
            </Typography>
            <Typography 
                variant="body1" 
                paragraph
                sx={{
                    color: 'rgba(255, 255, 255, 0.7)',
                }}
            >
                View and filter airline delays for flights across the top 50 busiest US airports.
            </Typography>

            {/* Filters Section */}
            <Paper
                sx={{
                    p: 3,
                    mb: 3,
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                }}
            >
                <Typography variant="h6" sx={{ color: 'white', mb: 2 }}>
                    Filters
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            label="Airline Name"
                            placeholder="e.g., Delta, Southwest..."
                            value={airlineFilter}
                            onChange={(e) => setAirlineFilter(e.target.value)}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            label="Origin Airport"
                            placeholder="e.g., JFK"
                            value={originFilter}
                            onChange={(e) => setOriginFilter(e.target.value.toUpperCase())}
                            inputProps={{ maxLength: 3 }}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            label="Destination Airport"
                            placeholder="e.g., LAX"
                            value={destFilter}
                            onChange={(e) => setDestFilter(e.target.value.toUpperCase())}
                            inputProps={{ maxLength: 3 }}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Autocomplete
                            multiple
                            options={MONTHS}
                            getOptionLabel={(option) => option.label}
                            value={monthsFilter}
                            onChange={(event, newValue) => {
                                setMonthsFilter(newValue);
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Months"
                                    placeholder="Select months..."
                                />
                            )}
                            renderTags={(value, getTagProps) =>
                                value.map((option, index) => (
                                    <Chip
                                        label={option.label}
                                        {...getTagProps({ index })}
                                        size="small"
                                    />
                                ))
                            }
                        />
                    </Grid>
                </Grid>
                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                    <Button
                        variant="contained"
                        onClick={handleApplyFilters}
                    >
                        Apply Filters
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={handleClearFilters}
                        sx={{
                            borderColor: 'rgba(99, 102, 241, 0.3)',
                            color: 'rgba(255, 255, 255, 0.9)',
                            '&:hover': {
                                borderColor: 'rgba(99, 102, 241, 0.5)',
                            },
                        }}
                    >
                        Clear Filters
                    </Button>
                </Stack>
            </Paper>

            {/* Table Section */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
                    <CircularProgress sx={{ color: '#6366f1' }} />
                </Box>
            ) : filteredData.length > 0 ? (
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
                                        active={orderBy === 'airline_id'}
                                        direction={orderBy === 'airline_id' ? orderDir : 'asc'}
                                        onClick={() => handleSort('airline_id')}
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
                                        Airline ID
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                    <TableSortLabel
                                        active={orderBy === 'airline_name'}
                                        direction={orderBy === 'airline_name' ? orderDir : 'asc'}
                                        onClick={() => handleSort('airline_name')}
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
                                        Airline Name
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                    <TableSortLabel
                                        active={orderBy === 'num_flights'}
                                        direction={orderBy === 'num_flights' ? orderDir : 'asc'}
                                        onClick={() => handleSort('num_flights')}
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
                                        Number of Flights
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                    <TableSortLabel
                                        active={orderBy === 'avg_dep_delay'}
                                        direction={orderBy === 'avg_dep_delay' ? orderDir : 'asc'}
                                        onClick={() => handleSort('avg_dep_delay')}
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
                                        Avg Dep Delay (min)
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                    <TableSortLabel
                                        active={orderBy === 'avg_arr_delay'}
                                        direction={orderBy === 'avg_arr_delay' ? orderDir : 'asc'}
                                        onClick={() => handleSort('avg_arr_delay')}
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
                                        Avg Arr Delay (min)
                                    </TableSortLabel>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredData.map((row, index) => (
                                <TableRow 
                                    key={index}
                                    onClick={() => handleRowClick(row)}
                                    sx={{
                                        cursor: 'pointer',
                                        '&:hover': {
                                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                        },
                                    }}
                                >
                                    <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.airline_id}
                                    </TableCell>
                                    <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {getAirlineName(row.airline_id, row.airline_name)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.num_flights?.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.avg_dep_delay_minutes != null ? Number(row.avg_dep_delay_minutes).toFixed(2) : 'N/A'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.avg_arr_delay_minutes != null ? Number(row.avg_arr_delay_minutes).toFixed(2) : 'N/A'}
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
                        {data.length > 0
                            ? 'No airlines match your search. Try a different airline name.'
                            : 'No data found with the current filters. Try adjusting your filters.'}
                    </Typography>
                </Paper>
            )}

            {/* Cancellation Statistics Dialog */}
            <AirlineCancellationDialog
                open={dialogOpen}
                airlineId={selectedAirline?.id}
                airlineName={selectedAirline?.name}
                onClose={handleDialogClose}
            />
        </Container>
    );
}
