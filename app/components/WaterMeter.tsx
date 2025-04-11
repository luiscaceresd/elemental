'use client';

import React, { useEffect, useState, CSSProperties } from 'react';

interface WaterMeterProps {
  currentWater: number;
  maxWater: number;
  requiredWater: number;
  isMobile?: boolean;
}

const WaterMeter: React.FC<WaterMeterProps> = ({
  currentWater,
  maxWater,
  requiredWater,
  isMobile
}) => {
  const [pulseEffect, setPulseEffect] = useState(false);

  useEffect(() => {
    if (currentWater >= requiredWater) {
      setPulseEffect(true);
      const timer = setTimeout(() => setPulseEffect(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [currentWater, requiredWater]);

  const canFire = currentWater >= requiredWater;
  const fillPercentage = Math.min(100, (currentWater / maxWater) * 100);

  const baseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: isMobile ? '8px' : '10px',
    borderRadius: '8px',
    color: 'white',
    fontFamily: 'Arial, sans-serif',
    boxShadow: canFire ? '0 0 15px rgba(0, 255, 255, 0.5)' : 'none',
    transition: 'box-shadow 0.3s ease',
    animation: pulseEffect ? 'pulse 1s ease-in-out' : 'none',
    transform: isMobile ? 'scale(0.9)' : 'scale(1)',
    transformOrigin: 'bottom center',
    width: 'fit-content',
  };

  return (
    <div style={baseStyle} className="water-meter-container">
      <div style={{
        width: isMobile ? '25px' : '30px',
        height: isMobile ? '25px' : '30px',
        borderRadius: '50% 50% 0 50%',
        transform: 'rotate(-45deg)',
        backgroundColor: canFire ? '#00FFFF' : '#00BFFF',
        marginRight: '10px',
        boxShadow: `0 0 ${canFire ? '10px' : '5px'} ${canFire ? '#00FFFF' : '#00BFFF'}`,
        transition: 'all 0.3s ease',
        animation: canFire ? 'waterGlow 2s infinite alternate' : 'none'
      }}></div>
      <div>
        <div style={{
          fontSize: isMobile ? '16px' : '18px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          color: canFire ? '#00FFFF' : 'white',
          textShadow: canFire ? '0 0 5px #00FFFF' : 'none',
          transition: 'all 0.3s ease'
        }}>
          {currentWater} / {maxWater}
          {!isMobile && (
            <span style={{
              fontSize: '14px',
              opacity: canFire ? 1 : 0.8,
              marginLeft: '5px',
              color: canFire ? '#FFFFFF' : '#CCCCCC'
            }}>
              ({requiredWater} needed to fire)
            </span>
          )}
        </div>
        <div style={{
          width: isMobile ? '100px' : '160px',
          height: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          overflow: 'hidden',
          marginTop: '5px',
          boxShadow: 'inset 0 0 5px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{
            width: `${fillPercentage}%`,
            height: '100%',
            backgroundColor: canFire ? '#00FFFF' : '#00BFFF',
            transition: 'width 0.2s, background-color 0.3s',
            boxShadow: canFire ? 'inset 0 0 10px rgba(255, 255, 255, 0.5)' : 'none',
            borderRadius: '4px'
          }}></div>
        </div>
        {!isMobile ? (
          <div style={{
            fontSize: '12px',
            opacity: canFire ? 1 : 0.8,
            marginTop: '3px',
            textAlign: 'right',
            color: canFire ? '#FFFFFF' : '#AAAAAA',
            fontWeight: canFire ? 'bold' : 'normal'
          }}>
            {canFire ? '✓ Ready to Fire! (Right-click)' : 'Right-click to fire when ready'}
          </div>
        ) : (
          canFire && (
            <div style={{
              fontSize: '12px',
              marginTop: '3px',
              textAlign: 'right',
              color: '#FFFFFF',
              fontWeight: 'bold'
            }}>
              ✓ Ready!
            </div>
          )
        )}
      </div>
      <style jsx global>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        
        @keyframes waterGlow {
          0% { box-shadow: 0 0 5px #00BFFF; }
          100% { box-shadow: 0 0 15px #00FFFF; }
        }
      `}</style>
    </div>
  );
};

export default WaterMeter; 