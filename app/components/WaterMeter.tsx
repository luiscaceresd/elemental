'use client';

import React from 'react';

interface WaterMeterProps {
  currentWater: number;
  maxWater: number;
  requiredWater: number;
}

const WaterMeter: React.FC<WaterMeterProps> = ({
  currentWater,
  maxWater,
  requiredWater
}) => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      display: 'flex',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      padding: '10px',
      borderRadius: '8px',
      color: 'white',
      fontFamily: 'Arial, sans-serif',
      zIndex: 100
    }}>
      <div style={{
        width: '25px',
        height: '25px',
        borderRadius: '50% 50% 0 50%',
        transform: 'rotate(-45deg)',
        backgroundColor: '#00BFFF',
        marginRight: '10px',
        boxShadow: '0 0 5px #00BFFF'
      }}></div>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
          {currentWater} / {maxWater}
          <span style={{ fontSize: '14px', opacity: 0.8, marginLeft: '5px' }}>
            ({requiredWater} needed to fire)
          </span>
        </div>
        <div style={{
          width: '160px',
          height: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(100, (currentWater / maxWater) * 100)}%`,
            height: '100%',
            backgroundColor: currentWater >= requiredWater ? '#00FF00' : '#00BFFF',
            transition: 'width 0.2s'
          }}></div>
        </div>
        <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '3px', textAlign: 'right' }}>
          Right-click to fire
        </div>
      </div>
    </div>
  );
};

export default WaterMeter; 