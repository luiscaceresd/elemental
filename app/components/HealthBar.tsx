'use client';

import React, { useEffect, useState, CSSProperties } from 'react';
import { CharacterControllerRef } from './CharacterController';

interface HealthBarProps {
  characterControllerRef: React.RefObject<CharacterControllerRef | null>;
  // Removed gameState prop as visibility is handled by parent GameUI
}

const HealthBar: React.FC<HealthBarProps> = ({ characterControllerRef }) => {
  // Max health is defined here, matching the visual style
  const MAX_HEALTH = 275;
  // Initialize health to max health
  const [currentHealth, setCurrentHealth] = useState(MAX_HEALTH);

  useEffect(() => {
    if (!characterControllerRef.current) return;

    // Function to fetch health
    const fetchHealth = () => {
      if (characterControllerRef.current) {
        const fetchedHealth = characterControllerRef.current.getCurrentHealth();
        setCurrentHealth(Math.max(0, Math.min(fetchedHealth, MAX_HEALTH)));
      }
    };

    fetchHealth(); // Fetch immediately on mount/ref availability
    const intervalId = setInterval(fetchHealth, 500);

    return () => clearInterval(intervalId);
  }, [characterControllerRef]);

  const healthPercentage = Math.min(100, (currentHealth / MAX_HEALTH) * 100);

  // Styles specific to the health bar section
  const healthTextContainerStyle: CSSProperties = {
    marginBottom: '5px', // Space between text and bar
  };

  const healthTextStyle: CSSProperties = {
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600',
    textShadow: '1px 1px 3px rgba(0, 0, 0, 0.7)',
    whiteSpace: 'nowrap',
  };

  const healthBarWrapperStyle: CSSProperties = {
    width: '350px',
    height: '16px',
    position: 'relative',
    padding: '2px',
    background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3) 0%, rgba(50, 50, 50, 0.3) 100%)',
    borderRadius: '3px',
    boxShadow: '0 1px 5px rgba(0, 0, 0, 0.4)',
  };

  const healthBarStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative',
  };

  const healthFillStyle: CSSProperties = {
    width: `${healthPercentage}%`,
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: '1px',
    transition: 'width 0.3s ease-out',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
  };

  const segmentsStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    paddingLeft: '5%',
    paddingRight: '5%',
    boxSizing: 'border-box',
    zIndex: 0,
  };

  const segmentStyle: CSSProperties = {
    width: '1px',
    height: '70%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignSelf: 'center',
  };

  const segments = Array.from({ length: 9 }).map((_, index) => (
    <div key={index} style={segmentStyle}></div>
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Health Text */}
      <div style={healthTextContainerStyle}>
        <span style={healthTextStyle}>{currentHealth} / {MAX_HEALTH}</span>
      </div>
      {/* Health Bar Wrapper */}
      <div style={healthBarWrapperStyle}>
        {/* Health Bar Background & Segments */}
        <div style={healthBarStyle}>
          {/* Segments Container */}
          <div style={segmentsStyle}>
            {segments}
          </div>
          {/* Health Fill */}
          <div style={healthFillStyle}></div>
        </div>
      </div>
    </div>
  );
};

export default HealthBar; 