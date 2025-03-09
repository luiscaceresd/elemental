'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import CharacterController from './CharacterController';
import CameraController from './CameraController';
import WaterBending from './WaterBending';
import MobileControls from './MobileControls';
import World from './World';
import Water from './Water';
import Crosshair from './Crosshair';

// Add a type for functions with an identifier
type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sceneReady, setSceneReady] = useState(false);

  // Use a callback for device detection instead of useEffect
  const checkMobile = useCallback(() => {
    return typeof window !== 'undefined' &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth < 768);
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const keysRef = useRef<{
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    ' ': boolean; // Space key
  }>({
    w: false,
    a: false,
    s: false,
    d: false,
    ' ': false
  });
  const characterPositionRef = useRef<THREE.Vector3 | null>(null);
  const updateFunctionsRef = useRef<IdentifiableFunction[]>([]);
  const waterEntitiesRef = useRef<THREE.Vector3[]>([]);

  // Detect if we're on a mobile device - this effect is necessary as it involves window APIs
  useEffect(() => {
    // Initialize mobile detection
    setIsMobile(checkMobile());

    // Setup resize handler for responsive design
    const handleResize = () => {
      setIsMobile(checkMobile());
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [checkMobile]);

  // Three.js setup and scene initialization - 
  // This effect is necessary as it involves DOM manipulation and event subscriptions
  useEffect(() => {
    if (!containerRef.current) return;

    const initScene = async () => {
      // Dynamically import Three.js
      const THREE = await import('three');

      // Create scene, camera, and renderer
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        75, // Field of view
        window.innerWidth / window.innerHeight, // Aspect ratio
        0.1, // Near clipping plane
        1000 // Far clipping plane
      );
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      rendererRef.current = renderer;

      renderer.setSize(window.innerWidth, window.innerHeight);
      if (!containerRef.current) return;
      containerRef.current.appendChild(renderer.domElement);

      // Studio Ghibli inspired lighting
      // Soft ambient light
      const ambientLight = new THREE.AmbientLight(0x404040, 1);
      scene.add(ambientLight);

      // Warm golden directional light for the "golden hour" feel
      const directionalLight = new THREE.DirectionalLight(0xffd700, 0.8);
      directionalLight.position.set(10, 20, 10);
      scene.add(directionalLight);

      // Add fog for atmospheric depth
      scene.fog = new THREE.Fog(0x87CEFA, 50, 200);

      // Create water entities around the scene
      const waterPositions = [
        new THREE.Vector3(5, 1, 5),
        new THREE.Vector3(-5, 1, 5),
        new THREE.Vector3(10, 1, -5),
        new THREE.Vector3(-10, 1, -10),
        new THREE.Vector3(0, 1, -15),
        new THREE.Vector3(15, 1, 0),
        new THREE.Vector3(-15, 1, 0),
        new THREE.Vector3(7, 1, 12),
        new THREE.Vector3(-7, 1, -12),
      ];

      waterEntitiesRef.current = waterPositions;

      // Initialize character position reference
      characterPositionRef.current = new THREE.Vector3(0, 1, 5);

      // Handle keyboard inputs for PC controls
      const onKeyDown = (event: KeyboardEvent) => {
        // Convert key to lowercase to handle both cases
        const key = event.key.toLowerCase();

        // Map WASD and Space to our controls
        if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === ' ') {
          keysRef.current[key as keyof typeof keysRef.current] = true;
        }
      };

      const onKeyUp = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();

        if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === ' ') {
          keysRef.current[key as keyof typeof keysRef.current] = false;
        }
      };

      // Add event listeners for keyboard controls
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // Handle window resize
      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', handleResize);

      // Animation loop with clock for delta time
      const clock = new THREE.Clock();

      const animate = () => {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();

        // Run all registered update functions
        updateFunctionsRef.current.forEach(update => update(delta));

        renderer.render(scene, camera);
      };
      animate();

      // Signal that the scene is ready
      setSceneReady(true);

      // Cleanup
      return () => {
        if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    };

    // Initialize the scene
    const cleanup = initScene();

    // Cleanup on unmount
    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, []);

  // Function to register update functions from child components - this is memoized
  const registerUpdate = useCallback((updateFn: IdentifiableFunction) => {
    updateFunctionsRef.current.push(updateFn);

    // Return a function to unregister the update function
    return () => {
      updateFunctionsRef.current = updateFunctionsRef.current.filter(fn => fn !== updateFn);
    };
  }, []);

  // Handle character position updates
  const handleCharacterPositionUpdate = useCallback((position: THREE.Vector3) => {
    if (characterPositionRef.current) {
      characterPositionRef.current.copy(position);
    }
  }, []);

  // Handle joystick movement for mobile
  const handleJoystickMove = useCallback((x: number, y: number) => {
    // Map joystick values to WASD keys
    keysRef.current.w = y > 0.3;
    keysRef.current.s = y < -0.3;
    keysRef.current.a = x < -0.3;
    keysRef.current.d = x > 0.3;
  }, []);

  // Handle joystick end
  const handleJoystickEnd = useCallback(() => {
    keysRef.current.w = false;
    keysRef.current.s = false;
    keysRef.current.a = false;
    keysRef.current.d = false;
  }, []);

  // Handle jump button press
  const handleJump = useCallback(() => {
    keysRef.current[' '] = true;

    // Reset jump key after a short delay (simulating key up)
    setTimeout(() => {
      keysRef.current[' '] = false;
    }, 100);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Replace static crosshair with dynamic component */}
      <Crosshair />

      {sceneReady && sceneRef.current && rendererRef.current && cameraRef.current && characterPositionRef.current && (
        <>
          {/* Add the World component for Ghibli-style environment */}
          <World scene={sceneRef.current} />

          {/* Add water entities */}
          {waterEntitiesRef.current.map((position, index) => (
            <Water key={index} position={position} scene={sceneRef.current!} />
          ))}

          <CharacterController
            scene={sceneRef.current}
            keysRef={keysRef}
            registerUpdate={registerUpdate}
            camera={cameraRef.current}
            onPositionUpdate={handleCharacterPositionUpdate}
          />

          <CameraController
            camera={cameraRef.current}
            targetRef={characterPositionRef}
            domElement={rendererRef.current.domElement}
            registerUpdate={registerUpdate}
          />

          <WaterBending
            scene={sceneRef.current}
            domElement={rendererRef.current.domElement}
            registerUpdate={registerUpdate}
            camera={cameraRef.current}
          />

          {/* Show mobile controls only on mobile devices */}
          {isMobile && (
            <MobileControls
              onJoystickMove={handleJoystickMove}
              onJoystickEnd={handleJoystickEnd}
              onJump={handleJump}
            />
          )}
        </>
      )}
    </div>
  );
} 