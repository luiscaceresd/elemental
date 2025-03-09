'use client';

import { useEffect, useRef } from 'react';

export default function Crosshair() {
  const crosshairRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (crosshairRef.current) {
        // Update the crosshair's position to match the cursor
        crosshairRef.current.style.left = `${event.clientX}px`;
        crosshairRef.current.style.top = `${event.clientY}px`;
      }
    };

    // Attach the mousemove listener to the window
    window.addEventListener('mousemove', onMouseMove);

    // Cleanup the event listener on component unmount
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <div
      ref={crosshairRef}
      style={{
        position: 'absolute',         // Overlay on the canvas
        width: '20px',                // Size of the crosshair
        height: '20px',
        background: 'transparent',    // Hollow center
        border: '2px solid white',    // Visible outline
        borderRadius: '50%',          // Circular shape
        transform: 'translate(-50%, -50%)', // Center on cursor
        pointerEvents: 'none',        // Don't interfere with mouse events
        zIndex: 1000,                 // Stay above other elements
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5)', // Add shadow for visibility
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Add a center dot */}
      <div
        style={{
          width: '4px',
          height: '4px',
          backgroundColor: 'white',
          borderRadius: '50%',
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5)', // Add shadow for visibility
        }}
      />
    </div>
  );
} 