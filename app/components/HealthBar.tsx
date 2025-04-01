'use client';

import React from 'react';
import { CharacterControllerRef } from './CharacterController';

interface HealthBarProps {
  characterControllerRef: React.RefObject<CharacterControllerRef | null>;
  gameState: 'playing' | 'paused';
}

const HealthBar: React.FC<HealthBarProps> = ({ characterControllerRef, gameState }) => {
  const [health, setHealth] = React.useState<number>(250);
  const MAX_HEALTH = 250;
  
  // Update health from the character controller
  React.useEffect(() => {
    const updateHealth = () => {
      if (characterControllerRef.current) {
        const currentHealth = characterControllerRef.current.getCurrentHealth();
        setHealth(currentHealth);
      }
      
      // Only continue updating when game is in playing state
      if (gameState === 'playing') {
        requestAnimationFrame(updateHealth);
      }
    };
    
    let frameId: number | null = null;
    if (gameState === 'playing') {
      frameId = requestAnimationFrame(updateHealth);
    }
    
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [characterControllerRef, gameState]);
  
  // Don't render anything if game is paused
  if (gameState !== 'playing') {
    return null;
  }
  
  // Calculate health percentage
  const healthPercentage = Math.max(0, Math.min(100, (health / MAX_HEALTH) * 100));
  
  // Determine health bar color based on percentage
  const getHealthColor = () => {
    if (healthPercentage > 60) return '#2ecc71'; // Green for high health
    if (healthPercentage > 30) return '#f39c12'; // Orange for medium health
    return '#e74c3c'; // Red for low health
  };
  
  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: '200px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: '5px',
        padding: '3px',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: `${healthPercentage}%`,
          height: '15px',
          backgroundColor: getHealthColor(),
          borderRadius: '3px',
          transition: 'width 0.3s ease, background-color 0.3s ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '3px',
          left: 0,
          width: '100%',
          textAlign: 'center',
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold',
          textShadow: '1px 1px 1px black',
        }}
      >
        {Math.floor(health)}/{MAX_HEALTH} HP
      </div>
    </div>
  );
};

export default HealthBar; 