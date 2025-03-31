'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import CharacterController from './CharacterController';
import CameraController from './CameraController';
import WaterBending from './WaterBending';
import MobileControls from './MobileControls';
import World from './World';
import Pond from './Pond';
import Crosshair from './Crosshair';
import * as CANNON from 'cannon';

// Add a type for functions with an identifier
type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

export default function GameCanvas({ gameState }: { gameState: 'playing' | 'paused' }) {
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
  const worldRef = useRef<CANNON.World | null>(null);
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

  // New refs for waterbending
  const isBendingRef = useRef<boolean>(false);
  const crosshairPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());

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

      // Initialize Cannon.js physics world
      const world = new CANNON.World();
      world.gravity.set(0, -9.82, 0); // Earth-like gravity
      world.broadphase = new CANNON.NaiveBroadphase(); // Simple collision detection
      world.solver.iterations = 10; // Improve solver accuracy
      world.defaultContactMaterial.contactEquationStiffness = 1e7; // Increase stiffness to prevent sinking
      world.defaultContactMaterial.contactEquationRelaxation = 3; // Better stability
      worldRef.current = world;

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

      // Hide the cursor over the canvas for FPS immersion
      renderer.domElement.style.cursor = 'none';

      // Prevent context menu (right-click menu) on the canvas
      const preventContextMenu = (event: MouseEvent) => {
        event.preventDefault();
      };
      renderer.domElement.addEventListener('contextmenu', preventContextMenu);

      // Studio Ghibli inspired lighting
      // Remove AmbientLight
      // const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
      // scene.add(ambientLight);

      // Add HemisphereLight for softer ambient lighting
      const hemisphereLight = new THREE.HemisphereLight(0xADD8E6, 0x404040, 1.8); // Increased intensity from 1.5 to 1.8
      scene.add(hemisphereLight);

      // White main light for accurate water color rendering
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1); // Increased intensity from 1.0 to 1.1
      directionalLight.position.set(10, 20, 10);
      directionalLight.castShadow = true; // Enable shadows

      // Configure shadow properties for better quality
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 500;
      directionalLight.shadow.camera.left = -100;
      directionalLight.shadow.camera.right = 100;
      directionalLight.shadow.camera.top = 100;
      directionalLight.shadow.camera.bottom = -100;
      directionalLight.shadow.bias = -0.0001;
      scene.add(directionalLight);

      // Add secondary fill light for more depth
      const fillLight = new THREE.DirectionalLight(0xE6D8AD, 0.4); // Reduced intensity back to 0.4
      fillLight.position.set(-5, 10, -10);
      scene.add(fillLight);

      // Enable shadows in renderer
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Add fog for atmospheric depth
      scene.fog = new THREE.Fog(0x87CEFA, 70, 300); // Increased distance for better visibility

      // Initialize character position reference
      characterPositionRef.current = new THREE.Vector3(0, 1, 5);

      // Handle keyboard inputs for PC controls
      const onKeyDown = (event: KeyboardEvent) => {
        // Convert key to lowercase to handle both cases
        const key = event.key.toLowerCase();

        // Map WASD and Space to our controls
        if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === ' ') {
          keysRef.current[key as keyof typeof keysRef.current] = true;
          
          // Remove debug space key log
          if (key === ' ') {
            // Removed console.log
          }
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
      let animationFrameId: number;
      let isPaused = gameState === 'paused';
      
      // Store last known game state to detect changes
      let lastGameState = gameState;

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const delta = clock.getDelta();

        // Check if game state has changed
        if (lastGameState !== gameState) {
          if (gameState === 'paused') {
            isPaused = true;
            clock.stop(); // Stop the clock when paused
          } else {
            isPaused = false;
            clock.start(); // Restart the clock when resuming
          }
          lastGameState = gameState;
        }

        // Step the physics world forward with substeps for stability
        if (worldRef.current && gameState === 'playing') {
          const maxSubSteps = 5; // More substeps for better stability
          const fixedTimeStep = 1/120; // Smaller timestep for more precision
          worldRef.current.step(fixedTimeStep, delta, maxSubSteps);
        }

        // Run all registered update functions
        updateFunctionsRef.current.forEach(update => update(delta));

        // Always render the scene, even when paused
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
      };
      
      animate();

      // Signal that the scene is ready
      setSceneReady(true);

      // Cleanup
      return () => {
        // Cancel animation frame to stop rendering
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        
        if (containerRef.current && renderer.domElement && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
        renderer.dispose();
        renderer.domElement.removeEventListener('contextmenu', preventContextMenu);
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
  }, [gameState]);

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
      // Make sure to create a clean copy to avoid reference issues
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

  // Handle shoot button press (for water spear)
  const handleShoot = useCallback(() => {
    // Simulate right-click to shoot water spear
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 2 // Right-click
    });
    window.dispatchEvent(event);
  }, []);

  // Handle water bending start
  const handleWaterBendStart = useCallback(() => {
    // Set waterBending flag to true
    isBendingRef.current = true;
  }, [isBendingRef]);

  // Handle water bending end
  const handleWaterBendEnd = useCallback(() => {
    // Set waterBending flag to false
    isBendingRef.current = false;
  }, [isBendingRef]);

  // Add effect to handle gameState changes separately from scene initialization
  useEffect(() => {
    // Update game state in the animation loop when it changes
    if (rendererRef.current) {
      // If we're switching from paused to playing on mobile, make sure the camera looks right
      if (gameState === 'playing' && isMobile && cameraRef.current) {
        // Reset camera rotation flags to let it be automatically positioned
        cameraRef.current.userData.hasBeenRotatedByUser = false;
      }
    }
  }, [gameState, isMobile]);

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Replace static crosshair with dynamic component */}
      <Crosshair />

      {sceneReady && sceneRef.current && rendererRef.current && cameraRef.current && characterPositionRef.current && worldRef.current && (
        <>
          {/* Add the World component for Ghibli-style environment */}
          <World
            scene={sceneRef.current}
            isBendingRef={isBendingRef}
            crosshairPositionRef={crosshairPositionRef}
            registerUpdate={registerUpdate}
            world={worldRef.current}
          />

          {/* Add pond directly (not needed if already added in World) */}
          <Pond
            position={new THREE.Vector3(20, 0, 20)}
            size={15}
            depth={3}
            scene={sceneRef.current}
            isBendingRef={isBendingRef}
            crosshairPositionRef={crosshairPositionRef}
            registerUpdate={registerUpdate}
            world={worldRef.current}
          />

          <CharacterController
            scene={sceneRef.current}
            keysRef={keysRef}
            registerUpdate={registerUpdate}
            camera={cameraRef.current}
            onPositionUpdate={handleCharacterPositionUpdate}
            world={worldRef.current}
          />

          <CameraController
            camera={cameraRef.current}
            targetRef={characterPositionRef}
            domElement={rendererRef.current.domElement}
            registerUpdate={registerUpdate}
            isMobile={isMobile}
            // Add shorter distance and higher height for better visibility
            distance={7}
            height={3}
          />

          <WaterBending
            scene={sceneRef.current}
            domElement={rendererRef.current.domElement}
            registerUpdate={registerUpdate}
            camera={cameraRef.current}
            isBendingRef={isBendingRef}
            crosshairPositionRef={crosshairPositionRef}
            characterPositionRef={characterPositionRef}
            world={worldRef.current}
          />

          {/* Show mobile controls only on mobile devices when game is playing */}
          {isMobile && gameState === 'playing' && (
            <MobileControls
              onJoystickMove={handleJoystickMove}
              onJoystickEnd={handleJoystickEnd}
              onJump={handleJump}
              onShoot={handleShoot}
              onWaterBendStart={handleWaterBendStart}
              onWaterBendEnd={handleWaterBendEnd}
            />
          )}
        </>
      )}
    </div>
  );
} 