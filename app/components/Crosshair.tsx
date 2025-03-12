'use client';

import { useEffect, useState } from 'react';

export default function Crosshair() {
  // State to track if water bending is active
  const [isBending, setIsBending] = useState(false);

  // Animation state for the crosshair
  const [scale, setScale] = useState(1);

  // Listen for mouse down/up events to track bending state
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        setIsBending(true);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        setIsBending(false);
      }
    };

    // Animation frames for pulsing effect when bending
    let animationFrame: number;
    const animate = () => {
      setScale(() => {
        if (isBending) {
          // Pulsing effect between 1.0 and 1.3
          return 1 + 0.3 * Math.sin(Date.now() / 200);
        } else {
          // Return to normal size when not bending
          return 1;
        }
      });
      animationFrame = requestAnimationFrame(animate);
    };

    // Start animation
    animationFrame = requestAnimationFrame(animate);

    // Add event listeners
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    // Cleanup
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      cancelAnimationFrame(animationFrame);
    };
  }, [isBending]);

  // Calculate styles based on bending state
  const crosshairSize = 24 * scale;
  const dotSize = 5 * scale;
  const crosshairColor = isBending ? '#00FFFF' : 'white';
  const glowEffect = isBending ? `0 0 8px #00FFFF` : 'none';

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        width: `${crosshairSize}px`,
        height: `${crosshairSize}px`,
        background: 'transparent',
        border: `2px solid ${crosshairColor}`,
        borderRadius: '50%',
        transform: `translate(-50%, -50%) ${isBending ? 'rotate(45deg)' : 'rotate(0deg)'}`,
        pointerEvents: 'none',
        zIndex: 1000,
        boxShadow: glowEffect,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        transition: isBending ? 'none' : 'all 0.2s ease-out',
      }}
    >
      <div
        style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          backgroundColor: crosshairColor,
          borderRadius: '50%',
          boxShadow: glowEffect,
        }}
      />

      {/* Add direction indicators for when bending is active */}
      {isBending && (
        <>
          <div style={{
            position: 'absolute',
            width: '10px',
            height: '2px',
            backgroundColor: crosshairColor,
            left: '-15px',
            boxShadow: glowEffect,
          }} />
          <div style={{
            position: 'absolute',
            width: '10px',
            height: '2px',
            backgroundColor: crosshairColor,
            right: '-15px',
            boxShadow: glowEffect,
          }} />
          <div style={{
            position: 'absolute',
            width: '2px',
            height: '10px',
            backgroundColor: crosshairColor,
            top: '-15px',
            boxShadow: glowEffect,
          }} />
          <div style={{
            position: 'absolute',
            width: '2px',
            height: '10px',
            backgroundColor: crosshairColor,
            bottom: '-15px',
            boxShadow: glowEffect,
          }} />
        </>
      )}
    </div>
  );
} 