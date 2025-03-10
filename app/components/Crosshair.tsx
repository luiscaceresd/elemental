'use client';

export default function Crosshair() {
  return (
    <div
      style={{
        position: 'fixed',            // Fixed position relative to viewport
        left: '50%',
        top: '50%',
        width: '20px',
        height: '20px',
        background: 'transparent',
        border: '2px solid white',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)', // Center it perfectly
        pointerEvents: 'none',       // Prevent interference with mouse events
        zIndex: 1000,
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '4px',
          height: '4px',
          backgroundColor: 'white',
          borderRadius: '50%',
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5)',
        }}
      />
    </div>
  );
} 