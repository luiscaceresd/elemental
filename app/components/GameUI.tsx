'use client';

import React, { CSSProperties } from 'react';
import { CharacterControllerRef } from './CharacterController';
import HealthBar from './HealthBar';
import WaterMeter from './WaterMeter';

// Define WaterLevels type directly in this file
interface WaterLevels {
  current: number;
  max: number;
  required: number;
}

interface GameUIDesktopProps {
  characterControllerRef: React.RefObject<CharacterControllerRef | null>;
  waterLevels: WaterLevels;
  // gameState prop is removed as visibility handled by GameCanvas now
}

// Renamed to GameUIDesktop for clarity
const GameUIDesktop: React.FC<GameUIDesktopProps> = ({
  characterControllerRef,
  waterLevels,
}) => {

  // Style for the bottom-center Health Bar
  const bottomCenterHealthStyle: CSSProperties = {
    position: 'absolute',
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  };

  // Style for WaterMeter position on Desktop (bottom-right)
  const waterMeterDesktopStyle: CSSProperties = {
    position: 'absolute',
    bottom: '60px',
    right: '20px',
    pointerEvents: 'auto',
    zIndex: 160,
  };

  return (
    <>
      {/* Health Bar - positioned bottom center */}
      <div style={bottomCenterHealthStyle}>
        <HealthBar characterControllerRef={characterControllerRef} />
      </div>

      {/* Water Meter - positioned bottom-right */}
      <div style={waterMeterDesktopStyle}>
        <WaterMeter
          currentWater={waterLevels.current}
          maxWater={waterLevels.max}
          requiredWater={waterLevels.required}
          isMobile={false} // Explicitly pass false
        />
      </div>
    </>
  );
};

export default GameUIDesktop; 