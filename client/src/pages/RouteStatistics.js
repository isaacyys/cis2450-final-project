import { useState, useEffect } from 'react';
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
    TablePagination,
    Paper,
    Box,
    Grid,
    Chip,
    CircularProgress,
    Autocomplete,
} from '@mui/material';
import RouteAirlineBreakdownDialog from '../components/RouteAirlineBreakdownDialog';

const config = require('../config.json');

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

const ROWS_PER_PAGE = 25;

export default function RouteStatistics() {
    // Filter states
    const [originFilter, setOriginFilter] = useState('');
    const [destFilter, setDestFilter] = useState('');
    const [monthsFilter, setMonthsFilter] = useState([]);
    
    // Data and sorting states
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orderBy, setOrderBy] = useState('avg_delay');
    const [orderDir, setOrderDir] = useState('desc');
    
    // Pagination state
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    
    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedRoute, setSelectedRoute] = useState(null);

    // Fetch data on component mount and when filters/sorting/pagination change
    useEffect(() => {
        fetchData();
    }, [orderBy, orderDir, page]);

    const fetchData = async () => {
        setLoading(true);
        
        // Build query params
        const params = new URLSearchParams();
        if (originFilter.trim()) params.append('originAirport', originFilter.trim());
        if (destFilter.trim()) params.append('destAirport', destFilter.trim());
        if (monthsFilter.length > 0) params.append('months', monthsFilter.map(m => m.value).join(','));
        params.append('orderBy', orderBy);
        params.append('orderDir', orderDir);
        params.append('page', (page + 1).toString()); // Server uses 1-based page numbers
        params.append('limit', ROWS_PER_PAGE.toString());
        
        const url = `http://${config.server_host}:${config.server_port}/worstRoutes?${params.toString()}`;
        
        try {
            const response = await fetch(url);
            const result = await response.json();
            
            // Handle both old format (array) and new format (object with data and pagination)
            if (Array.isArray(result)) {
                setData(result);
                setTotalCount(result.length);
            } else if (result.data && result.pagination) {
                setData(result.data);
                setTotalCount(result.pagination.total);
            } else {
                setData([]);
                setTotalCount(0);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            setData([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = () => {
        setPage(0); // Reset to first page when filters change
        fetchData();
    };

    const handleClearFilters = () => {
        setOriginFilter('');
        setDestFilter('');
        setMonthsFilter([]);
        setPage(0); // Reset to first page
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
        setPage(0); // Reset to first page when sorting changes
    };

    const handleRowClick = (row) => {
        setSelectedRoute({
            originIata: row.origin_iata,
            destIata: row.dest_iata,
            originAirport: row.origin_airport,
            destAirport: row.dest_airport,
        });
        setDialogOpen(true);
    };

    const handleDialogClose = () => {
        setDialogOpen(false);
        setSelectedRoute(null);
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
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
                Route Delay Analysis
            </Typography>
            <Typography 
                variant="body1" 
                paragraph
                sx={{
                    color: 'rgba(255, 255, 255, 0.7)',
                }}
            >
                View route delays across the top 50 busiest US airports and click any route for an airline breakdown.
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
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            label="Origin Airport"
                            placeholder="e.g., John F Kennedy Intl"
                            value={originFilter}
                            onChange={(e) => setOriginFilter(e.target.value)}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            label="Destination Airport"
                            placeholder="e.g., Los Angeles Intl"
                            value={destFilter}
                            onChange={(e) => setDestFilter(e.target.value)}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={12} sm={12} md={4}>
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
            ) : data.length > 0 ? (
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
                                        active={orderBy === 'origin_airport'}
                                        direction={orderBy === 'origin_airport' ? orderDir : 'asc'}
                                        onClick={() => handleSort('origin_airport')}
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
                                        Origin Airport
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                    <TableSortLabel
                                        active={orderBy === 'dest_airport'}
                                        direction={orderBy === 'dest_airport' ? orderDir : 'asc'}
                                        onClick={() => handleSort('dest_airport')}
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
                                        Destination Airport
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
                                        active={orderBy === 'avg_delay'}
                                        direction={orderBy === 'avg_delay' ? orderDir : 'asc'}
                                        onClick={() => handleSort('avg_delay')}
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
                                        Avg Arrival Delay (min)
                                    </TableSortLabel>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.map((row, index) => (
                                <TableRow 
                                    key={`${row.origin_iata}-${row.dest_iata}-${index}`}
                                    onClick={() => handleRowClick(row)}
                                    sx={{
                                        cursor: 'pointer',
                                        '&:hover': {
                                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                        },
                                    }}
                                >
                                    <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.origin_airport}
                                    </TableCell>
                                    <TableCell sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.dest_airport}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.num_flights?.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                        {row.avg_arr_delay != null ? Number(row.avg_arr_delay).toFixed(2) : 'N/A'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <TablePagination
                        component="div"
                        count={totalCount}
                        page={page}
                        onPageChange={handleChangePage}
                        rowsPerPage={ROWS_PER_PAGE}
                        rowsPerPageOptions={[]}
                        sx={{
                            color: 'rgba(255, 255, 255, 0.9)',
                            borderTop: '1px solid rgba(99, 102, 241, 0.2)',
                            '& .MuiTablePagination-select': {
                                display: 'none',
                            },
                            '& .MuiTablePagination-selectLabel': {
                                display: 'none',
                            },
                            '& .MuiTablePagination-actions': {
                                color: 'rgba(255, 255, 255, 0.9)',
                            },
                            '& .MuiIconButton-root': {
                                color: 'rgba(255, 255, 255, 0.9)',
                                '&:hover': {
                                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                },
                                '&.Mui-disabled': {
                                    color: 'rgba(255, 255, 255, 0.3)',
                                },
                            },
                        }}
                    />
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
                        No data found with the current filters. Try adjusting your filters.
                    </Typography>
                </Paper>
            )}

            {/* Airline Breakdown Dialog */}
            <RouteAirlineBreakdownDialog
                open={dialogOpen}
                originIata={selectedRoute?.originIata}
                destIata={selectedRoute?.destIata}
                originAirport={selectedRoute?.originAirport}
                destAirport={selectedRoute?.destAirport}
                months={monthsFilter}
                onClose={handleDialogClose}
            />
        </Container>
    );
}
