'use client';

import React, { useEffect, useState, CSSProperties } from 'react';

interface WaterMeterProps {
  waterAmount: number;
  maxAmount: number;
  waterCost: number;
  chargeLevel: number;
  isCharging: boolean;
}

export default function WaterMeter({
  waterAmount,
  maxAmount,
  waterCost,
  chargeLevel,
  isCharging
}: WaterMeterProps) {
  // Add pulse animation when enough water is collected
  const [pulseEffect, setPulseEffect] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if device is mobile
  useEffect(() => {
    setIsMobile(
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768
    );
  }, []);

  // Handle pulse effect when enough water is available
  useEffect(() => {
    if (waterAmount >= waterCost && !isCharging) {
      setPulseEffect(true);
      const timer = setTimeout(() => setPulseEffect(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [waterAmount, waterCost, isCharging]);

  // Calculate percentage of water filled
  const fillPercentage = (waterAmount / maxAmount) * 100;

  // Water meter container style
  const containerStyle: CSSProperties = {
    position: 'absolute',
    bottom: isMobile ? '20px' : '30px',
    right: isMobile ? '20px' : '30px',
    width: isMobile ? '70px' : '100px',
    height: isMobile ? '200px' : '300px',
    borderRadius: '25px',
    border: '3px solid rgba(255, 255, 255, 0.7)',
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.3)',
    zIndex: 10
  };

  // Required water level indicator style
  const requiredLevelStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    bottom: `${(waterCost / maxAmount) * 100}%`,
    zIndex: 2
  };

  // Water fill style
  const fillStyle: CSSProperties = {
    backgroundColor: isCharging 
      ? 'rgba(0, 170, 255, 0.8)' // More vibrant when charging
      : 'rgba(0, 150, 255, 0.6)',
    height: `${fillPercentage}%`,
    width: '100%',
    borderTopLeftRadius: '22px',
    borderTopRightRadius: '22px',
    transition: 'height 0.3s ease-out, background-color 0.3s ease',
    boxShadow: '0 0 10px rgba(0, 150, 255, 0.4) inset',
    position: 'relative',
    // Add pulsing glow when enough water collected
    animation: pulseEffect ? 'pulse 2s infinite' : 'none'
  };

  // Charge indicator style
  const chargeIndicatorStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: `${chargeLevel * 100}%`,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transition: 'height 0.1s ease-out',
    opacity: isCharging ? 1 : 0,
  };

  // Water ripple effect
  const rippleStyle: CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '10px',
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 70%)',
    animation: 'ripple 2s ease-in-out infinite',
    opacity: 0.7
  };

  return (
    <>
      <style jsx>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 10px rgba(0, 150, 255, 0.4) inset; }
          50% { box-shadow: 0 0 20px 5px rgba(0, 150, 255, 0.7) inset; }
          100% { box-shadow: 0 0 10px rgba(0, 150, 255, 0.4) inset; }
        }
        @keyframes ripple {
          0% { transform: translateY(0) scale(1); opacity: 0.7; }
          100% { transform: translateY(-20px) scale(1.5); opacity: 0; }
        }
      `}</style>
      <div style={containerStyle}>
        <div style={requiredLevelStyle} />
        <div style={fillStyle}>
          <div style={chargeIndicatorStyle} />
          <div style={rippleStyle} />
        </div>
      </div>
    </>
  );
} 