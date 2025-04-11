'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import CharacterController, { CharacterControllerRef } from './CharacterController';
import CameraController from './CameraController';
import WaterBending from './WaterBending';
import MobileControls from './MobileControls';
import World from './World';
import Pond from './Pond';
import Crosshair from './Crosshair';
import PortalManager from './PortalManager';
import HealthBar from './HealthBar';
import * as CANNON from 'cannon';

// Add a type for functions with an identifier
type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

// Create a type that extends RefObject to include our custom property
interface ExtendedRefObject<T> extends React.RefObject<T> {
  updateBothRefs?: (newValue: T) => void;
}

// Custom hook to sync a local ref with a parent ref
function useSyncRef<T>(
  localValue: T,
  parentRef?: React.MutableRefObject<T>
): React.MutableRefObject<T> {
  const localRef = useRef<T>(localValue);
  
  // Simple direct assignment when the parent ref changes
  useEffect(() => {
    if (!parentRef) return;
    
    // Set initial value from local to parent
    parentRef.current = localRef.current;
    
    // Instead of using a proxy, which requires type assertions,
    // set up a way to track changes to localRef
    const originalCurrent = localRef.current;
    
    // Create a setter that updates both refs
    const updateBothRefs = (newValue: T) => {
      localRef.current = newValue;
      if (parentRef) {
        parentRef.current = newValue;
      }
    };
    
    // Store the setter for potential use elsewhere
    // (though in practice, direct ref updates are more common)
    (localRef as ExtendedRefObject<T>).updateBothRefs = updateBothRefs;
    
    return () => {
      // Restore original value on cleanup if needed
      localRef.current = originalCurrent;
      // Clean up the setter
      delete (localRef as ExtendedRefObject<T>).updateBothRefs;
    };
  }, [parentRef]);
  
  return localRef;
}

export default function GameCanvas({ 
  gameState, 
  chatStateRef 
}: { 
  gameState: 'playing' | 'paused'; 
  chatStateRef?: React.MutableRefObject<boolean>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sceneReady, setSceneReady] = useState(false);

  // Use a callback for device detection instead of useEffect
  const checkMobile = useCallback(() => {
    return typeof window !== 'undefined' &&
      (/AndrodBlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
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
  
  // Use a stable reference for character position to avoid re-renders
  const characterPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 5));
  const updateFunctionsRef = useRef<IdentifiableFunction[]>([]);

  // New refs for waterbending
  const isBendingRef = useRef<boolean>(false);
  const crosshairPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  
  // Use local isChattingRef
  const isChattingRef = useRef<boolean>(false);
  
  // Set up chatting state sync with parent
  useEffect(() => {
    if (!chatStateRef) return;
    
    // Function to update the parent ref when local ref changes
    const updateParentRef = () => {
      chatStateRef.current = isChattingRef.current;
    };
    
    // Set initial state
    updateParentRef();
    
    // Set up a MutationObserver to watch for DOM changes related to chat interface
    // This is a heuristic approach that avoids the need for a polling interval
    const chatObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'attributes') {
          // Check if any chat interfaces are visible
          const chatInterfaces = document.querySelectorAll('.npc-chat-input');
          // Update the parent ref
          updateParentRef();
        }
      }
    });
    
    // Start observing the document body for chat-related changes
    chatObserver.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    return () => {
      chatObserver.disconnect();
    };
  }, [chatStateRef]);

  // Reference for character controller
  const characterControllerRef = useRef<CharacterControllerRef>(null);

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

      // Set initial cursor state (will be updated based on chatting state)
      renderer.domElement.style.cursor = 'none';

      // Function to update cursor based on chatting state
      const updateCursorVisibility = () => {
        if (isChattingRef.current) {
          renderer.domElement.style.cursor = 'auto'; // Show cursor when chatting
        } else {
          renderer.domElement.style.cursor = 'none'; // Hide cursor when not chatting
        }
      };

      // Initial update
      updateCursorVisibility();

      // Set up an observer on the chatting state to update cursor
      const chatStateInterval = setInterval(() => {
        updateCursorVisibility();
      }, 100);

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

      // Handle keyboard inputs for PC controls
      const onKeyDown = (event: KeyboardEvent) => {
        // Don't process movement keys if chatting
        if (isChattingRef.current) {
          return;
        }
        
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
        // Still handle key up events even when chatting to prevent keys getting stuck
        const key = event.key.toLowerCase();
        if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === ' ') {
          keysRef.current[key as keyof typeof keysRef.current] = false;
        }
      };

      // Add global event listeners for keyboard controls
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // Prevent mouse actions from moving camera when chatting
      const preventMouseWhenChatting = (event: MouseEvent) => {
        if (isChattingRef.current) {
          // Only prevent default for right clicks and wheel events
          // Don't prevent left clicks as they're needed for UI interaction
          if (event.button === 2 || event.type === 'wheel') {
            event.preventDefault();
            event.stopPropagation();
          }
        }
      };

      // Add event listeners for mouse prevention
      renderer.domElement.addEventListener('mousedown', preventMouseWhenChatting);
      renderer.domElement.addEventListener('wheel', preventMouseWhenChatting, { passive: false });

      // Handle window resize
      const handleResize = () => {
        if (!camera || !renderer) return;
        
        const camera3D = camera as THREE.PerspectiveCamera;
        camera3D.aspect = window.innerWidth / window.innerHeight;
        camera3D.updateProjectionMatrix();
        
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', handleResize);

      // Animation loop with clock for delta time
      const clock = new THREE.Clock();
      let animationFrameId: number;
      
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);

        // Only update physics, game logic, and get delta if playing AND NOT chatting
        if (gameState === 'playing' && !isChattingRef.current) {
          // Get delta ONLY when playing and not chatting
          const delta = clock.getDelta(); 
          // Clamp delta to avoid huge jumps after resuming or frame drops
          const clampedDelta = Math.min(delta, 0.1); // Max delta of 0.1s (adjust as needed)

          // Step the physics world forward
          if (worldRef.current) {
            const maxSubSteps = 5; 
            const fixedTimeStep = 1/120; 
            // Use clampedDelta for physics step
            worldRef.current.step(fixedTimeStep, clampedDelta, maxSubSteps);
          }
          
          // Run all registered update functions
          // Use clampedDelta for updates
          updateFunctionsRef.current.forEach(update => update(clampedDelta));
        }

        // Always render the scene
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };
      
      // Start the animation loop immediately
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
        renderer.domElement.removeEventListener('mousedown', preventMouseWhenChatting);
        renderer.domElement.removeEventListener('wheel', preventMouseWhenChatting);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        clearInterval(chatStateInterval);
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

  // Make the handleCharacterPositionUpdate more efficient
  const handleCharacterPositionUpdate = useCallback((position: THREE.Vector3) => {
    // Directly update the reference without creating a new Vector3
    if (characterPositionRef.current) {
      characterPositionRef.current.copy(position);
    }
  }, []);

  // Handle mobile controls
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

  // Handle attack action for mobile
  const handleAttack = useCallback(() => {
    console.log("Mobile: Attack button pressed");
    
    // First directly simulate a right-click for attack animation
    const rightClickEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 2 // Right-click
    });
    window.dispatchEvent(rightClickEvent);
    
    // Follow up with direct access to shoot functionality if available
    if (characterControllerRef.current) {
      console.log("Mobile: Notifying character controller of attack intent");
    }
  }, []);

  // Handle shoot button press (for water spear)
  const handleShoot = useCallback(() => {
    console.log("Mobile: Shoot button pressed");
    
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
    console.log("Mobile: Water bend start");
    
    // Set waterBending flag to true
    isBendingRef.current = true;
    
    // Simulate left-click press for bending
    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0 // Left-click
    });
    window.dispatchEvent(mouseDownEvent);
  }, [isBendingRef]);

  // Handle water bending end
  const handleWaterBendEnd = useCallback(() => {
    // Set waterBending flag to false
    isBendingRef.current = false;
    
    // Simulate left-click release
    const mouseUpEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0 // Left-click
    });
    window.dispatchEvent(mouseUpEvent);
  }, [isBendingRef]);

  // Function to update water status from WaterBending to CharacterController
  const handleUpdateWaterStatus = useCallback((hasEnoughWater: boolean) => {
    if (characterControllerRef.current) {
      characterControllerRef.current.updateWaterStatus(hasEnoughWater);
    }
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Only show crosshair when not chatting */}
      {!isChattingRef.current && <Crosshair />}

      {sceneReady && sceneRef.current && rendererRef.current && cameraRef.current && characterPositionRef.current && worldRef.current && (
        <>
          {/* Add the World component for Ghibli-style environment */}
          <World
            scene={sceneRef.current}
            isBendingRef={isBendingRef}
            crosshairPositionRef={crosshairPositionRef}
            registerUpdate={registerUpdate}
            world={worldRef.current}
            characterPositionRef={characterPositionRef}
            gameState={gameState}
            isChattingRef={isChattingRef}
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
            ref={characterControllerRef}
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
            isChattingRef={isChattingRef}
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
            updateWaterStatus={handleUpdateWaterStatus}
            characterControllerRef={characterControllerRef}
          />

          {/* Add PortalManager component */}
          <PortalManager 
            scene={sceneRef.current}
            characterPositionRef={characterPositionRef}
            registerUpdate={registerUpdate}
          />

          {/* Show mobile controls only on mobile devices when game is playing */}
          {isMobile && gameState === 'playing' && (
            <MobileControls
              onJoystickMove={handleJoystickMove}
              onJoystickEnd={handleJoystickEnd}
              onJump={handleJump}
              onShoot={handleShoot}
              onAttack={handleAttack}
              onWaterBendStart={handleWaterBendStart}
              onWaterBendEnd={handleWaterBendEnd}
            />
          )}

          {/* Add HealthBar component */}
          <HealthBar characterControllerRef={characterControllerRef} gameState={gameState} />
        </>
      )}
    </div>
  );
} 