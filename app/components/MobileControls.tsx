'use client';

import { useEffect, useRef } from 'react';

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

  // This useEffect is necessary for nipplejs integration
  useEffect(() => {
    const setupMobileControls = async () => {
      // Dynamically import nipplejs for the joystick
      const nipplejs = (await import('nipplejs')).default;

      if (!joystickZoneRef.current) return;

      // Create the joystick
      const nippleManager = nipplejs.create({
        zone: joystickZoneRef.current,
        mode: 'static',
        position: { left: '120px', bottom: '120px' },
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
  }, [onJoystickMove, onJoystickEnd]);

  return (
    <>
      {/* Joystick container */}
      <div
        ref={joystickZoneRef}
        style={{
          position: 'absolute',
          bottom: '60px',
          left: '60px',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'rgba(100, 100, 100, 0.3)',
          zIndex: 1000
        }}
      />

      {/* Jump button */}
      <button
        onClick={onJump}
        style={{
          position: 'absolute',
          bottom: '60px',
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
          cursor: 'pointer'
        }}
      >
        JUMP
      </button>
    </>
  );
} 