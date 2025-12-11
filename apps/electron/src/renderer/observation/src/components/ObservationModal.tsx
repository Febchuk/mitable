import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

interface ObservationModalProps {
    type: 'start' | 'end';
}

export default function ObservationModal({ type }: ObservationModalProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Entrance animation
        setTimeout(() => setIsVisible(true), 50);
    }, []);

    const handleStart = () => {
        if (!window.observationAPI) {
            return;
        }
        window.observationAPI.startSession();
    };

    const handleEnd = () => {
        if (!window.observationAPI) {
            return;
        }
        window.observationAPI.endSession();
    };

    const handleCancel = () => {
        if (!window.observationAPI) {
            return;
        }
        window.observationAPI.cancel();
    };

    if (type === 'start') {
        return (
            <div
                className={`observation-modal-container transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                }}
            >
                <div
                    style={{
                        backgroundColor: 'rgba(26, 26, 26, 0.95)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: '24px',
                        padding: '32px',
                        maxWidth: '540px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                        <Eye size={28} style={{ color: '#a855f7', marginRight: '12px' }} />
                        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#fff', margin: 0 }}>
                            Start Mitable Session
                        </h2>
                    </div>

                    <p style={{ fontSize: '16px', color: '#d4d4d8', marginBottom: '20px', lineHeight: '1.6' }}>
                        We'll watch your screen to automatically:
                    </p>

                    <ul style={{ fontSize: '15px', color: '#d4d4d8', marginBottom: '28px', paddingLeft: '20px' }}>
                        <li style={{ marginBottom: '8px' }}>Find opportunities to write documentation</li>
                        <li>Automate communications with your team about what you're working on</li>
                    </ul>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleCancel}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '12px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                color: '#d4d4d8',
                                border: 'none',
                                fontSize: '15px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleStart}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '12px',
                                backgroundColor: '#a855f7',
                                color: '#fff',
                                border: 'none',
                                fontSize: '15px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#9333ea';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#a855f7';
                            }}
                        >
                            Start Session
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // End confirmation modal
    return (
        <div
            className={`observation-modal-container transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
            }}
        >
            <div
                style={{
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '24px',
                    padding: '32px',
                    maxWidth: '480px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                }}
            >
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>
                    End Observation Session?
                </h2>

                <p style={{ fontSize: '16px', color: '#d4d4d8', marginBottom: '28px', lineHeight: '1.6' }}>
                    Are you sure you want to stop watching your screen? This will end the current session.
                </p>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleCancel}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            color: '#d4d4d8',
                            border: 'none',
                            fontSize: '15px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleEnd}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '12px',
                            backgroundColor: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            fontSize: '15px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#dc2626';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#ef4444';
                        }}
                    >
                        End Session
                    </button>
                </div>
            </div>
        </div>
    );
}

