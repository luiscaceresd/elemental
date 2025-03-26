'use client';

import { useEffect, useRef, useState } from 'react';

interface MobileControlsProps {
  onJoystickMove: (x: number, y: number) => void;
  onJoystickEnd: () => void;
  onJump: () => void;
  onShoot?: () => void;
  onWaterBendStart?: () => void;
  onWaterBendEnd?: () => void;
}

// Extracted joystick component for SRP
function Joystick({
  onMove,
  onEnd,
  isPortrait
}: {
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
  isPortrait: boolean;
}) {
  const joystickZoneRef = useRef<HTMLDivElement>(null);
  const nippleInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    const setupJoystick = async () => {
      // Dynamically import nipplejs for the joystick
      const nipplejs = (await import('nipplejs')).default;

      if (!joystickZoneRef.current) return;

      // Create the joystick with dynamic positioning based on orientation
      const nippleManager = nipplejs.create({
        zone: joystickZoneRef.current,
        mode: 'static',
        position: {
          left: '120px',
          bottom: isPortrait ? '150px' : '120px' // Higher in portrait mode
        },
        color: 'rgba(255, 255, 255, 0.5)',
        size: 120
      });

      nippleInstanceRef.current = nippleManager;

      // Handle joystick movement
      nippleManager.on('move', (evt, data) => {
        if (data && data.vector) {
          onMove(data.vector.x, data.vector.y);
        }
      });

      // Handle joystick release
      nippleManager.on('end', () => {
        onEnd();
      });

      return () => {
        if (nippleInstanceRef.current) {
          // Check if destroy method exists
          const nippleInstance = nippleInstanceRef.current as { destroy?: () => void };
          if (nippleInstance.destroy) {
            nippleInstance.destroy();
          }
        }
      };
    };

    const cleanup = setupJoystick();
    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [onMove, onEnd, isPortrait]);

  // Calculate position based on orientation
  const joystickStyle = {
    position: 'absolute' as const,
    bottom: isPortrait ? '150px' : '120px',
    left: '120px',
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: 'rgba(50, 50, 50, 0.2)',
    zIndex: 1000
  };

  return (
    <div
      id="joystick-zone"
      ref={joystickZoneRef}
      className="hide-when-paused"
      style={joystickStyle}
    />
  );
}

// Improved action button component for both Jump and Shoot buttons
function ActionButton({
  id,
  onClick,
  label,
  color,
  position,
  isPortrait
}: {
  id: string;
  onClick: () => void;
  label: string;
  color: string;
  position: 'left' | 'right';
  isPortrait: boolean;
}) {
  // Calculate button position based on orientation and position
  const getPosition = () => {
    if (position === 'right') {
      // JUMP button (right)
      return {
        right: isPortrait ? '30px' : '30px',
        bottom: isPortrait ? '100px' : '80px'
      };
    } else {
      // SHOOT button (left)
      return {
        right: isPortrait ? '140px' : '120px',
        bottom: isPortrait ? '30px' : '30px'
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

// Water collection overlay - for press and hold anywhere 
function WaterCollectionOverlay({
  onWaterBendStart,
  onWaterBendEnd
}: {
  onWaterBendStart?: () => void;
  onWaterBendEnd?: () => void;
}) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [showHint, setShowHint] = useState(true);
  
  // Hide hint after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);
  
  const handleTouchStart = () => {
    setIsCollecting(true);
    if (onWaterBendStart) onWaterBendStart();
  };
  
  const handleTouchEnd = () => {
    setIsCollecting(false);
    if (onWaterBendEnd) onWaterBendEnd();
  };
  
  const overlayStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 800, // Lower than buttons but higher than camera area
    pointerEvents: 'none' as const, // Initially doesn't block other interactions
  } as const;
  
  const hintStyle = {
    position: 'absolute',
    top: '10%',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 20px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    borderRadius: '8px',
    fontSize: '14px',
    opacity: showHint ? 0.9 : 0,
    transition: 'opacity 0.5s ease',
    pointerEvents: 'none' as const,
    textAlign: 'center' as const,
    maxWidth: '80%',
    zIndex: 1500
  } as const;
  
  const collectIndicatorStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    border: '3px solid rgba(0, 191, 255, 0.7)',
    opacity: isCollecting ? 0.8 : 0,
    transition: 'opacity 0.2s ease',
    pointerEvents: 'none' as const,
    zIndex: 850,
    boxShadow: '0 0 20px rgba(0, 191, 255, 0.8)',
    background: 'radial-gradient(circle, rgba(0,191,255,0.3) 0%, rgba(0,191,255,0) 70%)'
  } as const;
  
  return (
    <>
      <div 
        id="water-collection-overlay" 
        style={{...overlayStyle, pointerEvents: 'auto'}}
        className="hide-when-paused"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />
      
      {showHint && (
        <div style={hintStyle} className="hide-when-paused">
          <span style={{ fontWeight: 'bold' }}>Tap & hold anywhere</span> to collect water
        </div>
      )}
      
      <div style={collectIndicatorStyle} className="hide-when-paused" />
    </>
  );
}

// New camera control area component
function CameraControlArea({ 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isPortrait,
  onWaterBendStart,
  onWaterBendEnd
}: { 
  isPortrait: boolean;
  onWaterBendStart?: () => void;
  onWaterBendEnd?: () => void;
}) {
  const [isCollectingWater, setIsCollectingWater] = useState(false);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const cameraControlStyle = {
    position: 'absolute',
    top: '0',
    right: '0',
    width: '50%',
    height: '100%',
    zIndex: 900, // Lower than buttons but still interactive
    touchAction: 'none', // Prevent default touch actions like scrolling
  } as const;

  // Handle both camera and water collection events
  const handleTouchStart = () => {
    // Start water collection after holding for a short period
    longPressTimeoutRef.current = setTimeout(() => {
      setIsCollectingWater(true);
      if (onWaterBendStart) onWaterBendStart();
    }, 200); // Short delay to differentiate between camera movement and water collection
  };
  
  const handleTouchEnd = () => {
    // Clear the timeout if touch ends before water collection starts
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    
    // Stop water collection if it was active
    if (isCollectingWater) {
      setIsCollectingWater(false);
      if (onWaterBendEnd) onWaterBendEnd();
    }
  };
  
  // Clean up timeouts if component unmounts
  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      id="camera-control-area" 
      style={cameraControlStyle} 
      className="hide-when-paused"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    />
  );
}

export default function MobileControls({
  onJoystickMove,
  onJoystickEnd,
  onJump,
  onShoot = () => {}, // Default empty function
  onWaterBendStart = () => {}, // Default empty function
  onWaterBendEnd = () => {} // Default empty function
}: MobileControlsProps) {
  const [isPortrait, setIsPortrait] = useState(false);

  // Check if we're in portrait mode for responsive positioning
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  return (
    <>
      {/* Water collection overlay (lowest z-index) */}
      <WaterCollectionOverlay 
        onWaterBendStart={onWaterBendStart}
        onWaterBendEnd={onWaterBendEnd}
      />
      
      {/* Camera control area - for right side of screen */}
      <CameraControlArea 
        isPortrait={isPortrait} 
        onWaterBendStart={onWaterBendStart}
        onWaterBendEnd={onWaterBendEnd}
      />

      {/* Joystick for movement - directly in the layout */}
      <Joystick 
        onMove={onJoystickMove} 
        onEnd={onJoystickEnd} 
        isPortrait={isPortrait} 
      />

      {/* Jump button - direct placement without container */}
      <ActionButton 
        id="jump-button"
        onClick={onJump}
        label="JUMP"
        color="rgba(0, 120, 255, 0.8)"
        position="right"
        isPortrait={isPortrait}
      />
      
      {/* Shoot button - direct placement without container */}
      <ActionButton 
        id="shoot-button"
        onClick={onShoot}
        label="SHOOT"
        color="rgba(255, 60, 60, 0.8)"
        position="left"
        isPortrait={isPortrait}
      />
    </>
  );
} 