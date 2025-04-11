'use client';

import React, { CSSProperties } from 'react';
import { CharacterControllerRef } from './CharacterController';
import HealthBar from './HealthBar';
import WaterMeter from './WaterMeter';

// Define WaterLevels type here
interface WaterLevels {
  current: number;
  max: number;
  required: number;
}

interface GameUIMobileProps {
  characterControllerRef: React.RefObject<CharacterControllerRef | null>;
  waterLevels: WaterLevels;
  // gameState might be needed if elements need to hide when paused
  // gameState: 'playing' | 'paused';
}

const GameUIMobile: React.FC<GameUIMobileProps> = ({
  characterControllerRef,
  waterLevels,
}) => {

  // Style for the bottom-center cluster (Health + Water)
  const bottomCenterClusterStyle: CSSProperties = {
    position: 'absolute',
    bottom: '80px', // Position higher on mobile above controls
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px', // Add gap between water and health
    pointerEvents: 'none', // Cluster itself isn't interactive
  };

  // Style for WaterMeter position (top-left)
  const waterMeterStyle: CSSProperties = {
    position: 'absolute',
    top: '20px', // Position from top
    left: '20px', // Position from left
    pointerEvents: 'auto',
    zIndex: 160,
  };

  return (
    <>
      {/* Water Meter - positioned top-left */}
      <div style={waterMeterStyle}>
        <WaterMeter
          currentWater={waterLevels.current}
          maxWater={waterLevels.max}
          requiredWater={waterLevels.required}
          isMobile={true} // Explicitly pass true
        />
      </div>

      {/* Health Bar - positioned bottom center */}
      {/* Note: HealthBar doesn't need absolute positioning itself 
          if parent container handles it, but keep wrapper for consistency */}
      <div style={bottomCenterClusterStyle}>
          {/* Render HealthBar within the bottom cluster */}
         {/* We removed water meter from here <WaterMeter ... /> */}
         <HealthBar characterControllerRef={characterControllerRef} />
      </div>

    </>
  );
};

export default GameUIMobile; 