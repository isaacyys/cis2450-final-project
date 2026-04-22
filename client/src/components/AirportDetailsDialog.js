import { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    Box,
    Stack,
    IconButton,
    Typography,
    CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FlightIcon from '@mui/icons-material/Flight';
import PerformanceTab from './AirportDetailsDialog/PerformanceTab';
import { fetchDelayData, fetchWeatherData, fetchCurrentWeather, fetchUnsafeGusts } from '../services/airportService';

export default function AirportDetailsDialog({ open, selectedAirport, onClose }) {
    const [loading, setLoading] = useState(false);
    const [bundle, setBundle] = useState(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        if (!open || !selectedAirport) return;

        const requestId = ++requestIdRef.current;
        setLoading(true);
        setBundle(null);

        Promise.all([
            fetchDelayData(selectedAirport, 'all').catch(() => ({})),
            fetchWeatherData(selectedAirport).catch(() => ({})),
            fetchCurrentWeather(selectedAirport).catch(() => ({})),
            fetchUnsafeGusts(selectedAirport).catch(() => ({})),
        ]).then(([delayData, weatherData, currentWeatherData, unsafeGustsData]) => {
            // Discard stale responses if a newer request has been issued
            if (requestId !== requestIdRef.current) return;
            setBundle({
                delayData: delayData || {},
                weatherData: weatherData || {},
                currentWeatherData: currentWeatherData || {},
                unsafeGustsData: unsafeGustsData || {},
            });
            setLoading(false);
        });
    }, [open, selectedAirport]);

    const handleClose = () => {
        requestIdRef.current++;
        setLoading(false);
        setBundle(null);
        onClose();
    };

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
                    minHeight: 320,
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
                                {selectedAirport || 'Airport'} Details
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                Performance & Weather Information
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

                {loading || !bundle ? (
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            py: 8,
                            gap: 2,
                        }}
                    >
                        <CircularProgress sx={{ color: '#6366f1' }} />
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                            Loading airport data...
                        </Typography>
                    </Box>
                ) : (
                    <PerformanceTab
                        selectedAirport={selectedAirport}
                        delayData={bundle.delayData}
                        weatherData={bundle.weatherData}
                        currentWeatherData={bundle.currentWeatherData}
                        unsafeGustsData={bundle.unsafeGustsData}
                    />
                )}
            </Box>
        </Dialog>
    );
}
