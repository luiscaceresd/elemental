'use client';

import { useEffect, useRef, useState } from 'react';

interface MobileControlsProps {
  onJoystickMove: (x: number, y: number) => void;
  onJoystickEnd: () => void;
  onJump: () => void;
}

export default function MobileControls({
  onJoystickMove,
  onJoystickEnd,
  onJump
}: MobileControlsProps) {
  const joystickZoneRef = useRef<HTMLDivElement>(null);
  const nippleInstanceRef = useRef<unknown>(null);
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

  // This useEffect is necessary for nipplejs integration
  useEffect(() => {
    const setupMobileControls = async () => {
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
          onJoystickMove(data.vector.x, data.vector.y);
        }
      });

      // Handle joystick release
      nippleManager.on('end', () => {
        onJoystickEnd();
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

    const cleanup = setupMobileControls();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [onJoystickMove, onJoystickEnd, isPortrait]);

  // Calculate position based on orientation
  const joystickStyle = {
    position: 'absolute',
    bottom: isPortrait ? '150px' : '60px', // Higher in portrait mode
    left: '60px',
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: 'rgba(100, 100, 100, 0.3)',
    zIndex: 1000
  } as const;

  // Jump button style with responsive positioning
  const jumpButtonStyle = {
    position: 'absolute',
    bottom: isPortrait ? '150px' : '60px', // Higher in portrait mode
    right: '60px',
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'rgba(0, 120, 255, 0.6)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    fontWeight: 'bold',
    zIndex: 1000,
    cursor: 'pointer',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)' // Add shadow for better visibility
  } as const;

  return (
    <>
      {/* Joystick container */}
      <div
        id="joystick-zone"
        ref={joystickZoneRef}
        className="hide-when-paused"
        style={joystickStyle}
      />

      {/* Jump button */}
      <button
        id="jump-button"
        className="hide-when-paused"
        onClick={onJump}
        style={jumpButtonStyle}
      >
        JUMP
      </button>
    </>
  );
} 