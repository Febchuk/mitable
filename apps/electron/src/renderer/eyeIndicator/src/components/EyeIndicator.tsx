import { useState } from 'react';
import { Eye } from 'lucide-react';
import logoIconSvg from '../../../assets/logo-icon.svg';

export default function EyeIndicator() {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.screenX, y: e.screenY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            const deltaX = e.screenX - dragStart.x;
            const deltaY = e.screenY - dragStart.y;

            // Move window
            window.eyeIndicatorAPI.moveWindow(deltaX, deltaY);
            setDragStart({ x: e.screenX, y: e.screenY });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    return (
        <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#000',
                borderRadius: '24px', // Full oval: half of width (48px / 2 = 24px)
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                position: 'relative',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            }}
        >
            {/* Logo icon */}
            <div style={{ marginBottom: '12px' }}>
                <img
                    src={logoIconSvg}
                    alt="Mitable"
                    style={{
                        width: '24px',
                        height: '24px',
                    }}
                />
            </div>

            {/* Divider */}
            <div
                style={{
                    width: '32px',
                    height: '1px',
                    backgroundColor: 'rgba(168, 85, 247, 0.3)', // Purple with transparency
                    marginBottom: '12px',
                }}
            />

            {/* Eye icon */}
            <Eye
                size={20}
                style={{
                    color: '#a855f7',
                }}
            />
        </div>
    );
}

