'use client';

import React from 'react';

// Improved action button component for buttons
export default function ActionButton({
  id,
  onClick,
  label,
  color,
  position,
  isPortrait,
  index = 0 // Add index to handle multiple buttons on same side
}: {
  id: string;
  onClick: () => void;
  label: string;
  color: string;
  position: 'left' | 'right';
  isPortrait: boolean;
  index?: number;
}) {
  // Calculate button position based on orientation, position, and index
  const getPosition = () => {
    if (position === 'right') {
      // JUMP button (right)
      return {
        right: isPortrait ? '30px' : '30px',
        bottom: isPortrait ? '100px' : '80px'
      };
    } else {
      // Multiple buttons on left side - position them vertically
      const baseBottom = isPortrait ? 150 : 130;
      const spacing = isPortrait ? 110 : 90; // Space between buttons
      
      return {
        right: isPortrait ? '240px' : '200px',
        bottom: `${baseBottom + (spacing * index)}px`
      };
    }
  };

  const buttonPos = getPosition();
  
  // Button style with responsive positioning
  const buttonStyle = {
    position: 'absolute',
    bottom: buttonPos.bottom,
    right: buttonPos.right,
    width: isPortrait ? '100px' : '80px',
    height: isPortrait ? '100px' : '80px',
    borderRadius: '50%',
    background: color,
    border: 'none',
    color: 'white',
    fontSize: isPortrait ? '16px' : '14px',
    fontWeight: 'bold',
    zIndex: 1000,
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(0, 0, 0, 0.5)',
    userSelect: 'none' as const,
    touchAction: 'manipulation', // Improve touch handling
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  } as const;

  // Handle touch events with stopPropagation to prevent camera control interference
  const handleButtonTouch = (e: React.TouchEvent) => {
    e.stopPropagation(); // Prevent event from propagating to camera controls
    onClick();
  };

  return (
    <button
      id={id}
      className="hide-when-paused"
      onTouchStart={handleButtonTouch}
      style={buttonStyle}
    >
      {label}
    </button>
  );
} 