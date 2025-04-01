'use client';

import { useEffect, useRef, useState } from 'react';
import ActionButton from './ActionButton';

interface MobileControlsProps {
  onJoystickMove: (x: number, y: number) => void;
  onJoystickEnd: () => void;
  onJump: () => void;
  onShoot?: () => void;
  onAttack?: () => void;
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
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Add a small delay to ensure the DOM is fully ready
    const timer = setTimeout(() => {
      const setupJoystick = async () => {
        // Dynamically import nipplejs for the joystick
        try {
          const nipplejs = (await import('nipplejs')).default;
  
          if (!joystickZoneRef.current) {
            console.error('Joystick zone ref not available');
            return;
          }
  
          // First destroy any existing joystick to prevent duplication
          if (nippleInstanceRef.current) {
            const nippleInstance = nippleInstanceRef.current as { destroy?: () => void };
            if (nippleInstance.destroy) {
              nippleInstance.destroy();
              nippleInstanceRef.current = null;
            }
          }
  
          // Create the joystick with dynamic positioning based on orientation
          const nippleManager = nipplejs.create({
            zone: joystickZoneRef.current,
            mode: 'static',
            position: {
              left: '50%',
              bottom: isPortrait ? '120px' : '100px' // Lower position
            },
            color: 'rgba(255, 255, 255, 0.5)',
            size: 120
          });
  
          nippleInstanceRef.current = nippleManager;
          setIsInitialized(true);
  
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
                nippleInstanceRef.current = null;
              }
            }
          };
        } catch (error) {
          console.error('Error initializing joystick:', error);
        }
      };
  
      const setup = setupJoystick();
      return () => {
        setup.then(cleanupFn => {
          if (cleanupFn) cleanupFn();
        }).catch(err => console.error('Error in joystick cleanup:', err));
      };
    }, 300); // Small delay to ensure DOM is ready
    
    return () => clearTimeout(timer);
  }, [onMove, onEnd, isPortrait]);

  // Calculate position based on orientation
  const joystickStyle = {
    position: 'absolute' as const,
    bottom: isPortrait ? '120px' : '100px', // Match the position in nipplejs create
    left: '50%',
    transform: 'translateX(-50%)', // Center horizontally
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

// Water collection overlay - for press and hold anywhere 
function WaterCollectionOverlay({
  onWaterBendStart,
  onWaterBendEnd
}: {
  onWaterBendStart?: () => void;
  onWaterBendEnd?: () => void;
}) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  
  // Initialize hint visibility based on localStorage and only once
  useEffect(() => {
    // Check if we've shown the hint before
    const hintShown = localStorage.getItem('waterBendHintShown');
    if (!hintShown) {
      setShowHint(true);
      
      // Hide hint after 10 seconds and mark as shown in localStorage
      const timer = setTimeout(() => {
        setShowHint(false);
        localStorage.setItem('waterBendHintShown', 'true');
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, []); // Empty dependency array - only run once
  
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
  isPortrait
}: { 
  isPortrait: boolean;
}) {
  const cameraControlStyle = {
    position: 'absolute',
    top: '0',
    right: '0',
    width: '50%',
    height: '100%',
    zIndex: 900, // Lower than buttons but still interactive
    touchAction: 'none', // Prevent default touch actions like scrolling
  } as const;

  return (
    <div 
      id="camera-control-area" 
      style={cameraControlStyle} 
      className="hide-when-paused"
    />
  );
}

export default function MobileControls({
  onJoystickMove,
  onJoystickEnd,
  onJump,
  onShoot = () => {}, // For water projectile (right click)
  onAttack = () => {}, // For attack animation (any click with enough water)
  onWaterBendStart = () => {}, // For water bending anim (left click hold)
  onWaterBendEnd = () => {} // For ending bending animation
}: MobileControlsProps) {
  const [isPortrait, setIsPortrait] = useState(true);
  
  // Check if we're in portrait mode
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    
    // Initial check
    checkOrientation();
    
    // Listen for orientation changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);
  
  return (
    <> 
      {/* Water collection overlay - for mobile water bending/collecting */}
      <WaterCollectionOverlay 
        onWaterBendStart={onWaterBendStart} // Bending starts with touch & hold
        onWaterBendEnd={onWaterBendEnd}     // Bending ends when touch released
      />
      
      {/* Camera control area - for right side of screen */}
      <CameraControlArea 
        isPortrait={isPortrait} 
      />

      {/* Joystick for movement - directly in the layout */}
      <Joystick 
        onMove={onJoystickMove} 
        onEnd={onJoystickEnd} 
        isPortrait={isPortrait} 
      />
      
      {/* Jump button */}
      <ActionButton
        id="jump-button"
        onClick={onJump}
        label="JUMP"
        color="rgba(0, 120, 255, 0.8)"
        position="right"
        isPortrait={isPortrait}
      />
      
      {/* Shoot button - for water projectile */}
      <ActionButton
        id="shoot-button"
        onClick={onShoot} // Triggers water projectile (right click)
        label="SHOOT"
        color="rgba(255, 60, 60, 0.8)"
        position="left"
        isPortrait={isPortrait}
        index={0}
      />
      
      {/* Attack button - new button for standalone attack animation */}
      <ActionButton
        id="attack-button"
        onClick={onAttack} // Triggers attack animation if enough water
        label="ATTACK"
        color="rgba(255, 165, 0, 0.8)" // Orange color for attack
        position="left"
        isPortrait={isPortrait}
        index={1} // Position below shoot button
      />
    </>
  );
} 