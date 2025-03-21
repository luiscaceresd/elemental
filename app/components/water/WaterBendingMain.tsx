import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import WaterMeter from '../WaterMeter';
import { useWaterProjectiles } from '../../hooks/useWaterProjectiles';
import { useWaterCollection } from '../../hooks/useWaterCollection';
import { useWaterBeltEffect } from '../../hooks/useWaterBeltEffect';
import { useWaterBendingInput } from '../../hooks/useWaterBendingInput';
import { getTerrainHeight } from '../../utils/terrain';
import WaterBlob from '../water/WaterBlob';

interface WaterBendingProps {
  camera: THREE.Camera;
  characterPositionRef: React.RefObject<THREE.Vector3>;
  isBendingRef: React.RefObject<boolean>;
  crosshairPositionRef: React.RefObject<THREE.Vector3>;
  scene: THREE.Scene;
  environmentObjects?: THREE.Object3D[];
  registerUpdate?: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
  domElement?: HTMLCanvasElement;
  debug?: boolean;
}

// Add type definitions for the input state
interface InputState {
  chargeLevel: number;
  isClicking: boolean;
}

// Add type for the ref handle
export interface WaterBendingHandle {
  collectionSystem: {
    createWaterDrop: (position: THREE.Vector3, velocity: THREE.Vector3) => void;
  };
  getWaterAmount: () => number;
  setWaterAmount: (amount: number) => void;
}

/**
 * Main component for water bending functionality
 * This component orchestrates all the water bending features:
 * - Water collection
 * - Water projectiles
 * - Water belt/sphere effect
 * - Input handling
 * - Water meter UI
 */
export const WaterBendingMain = forwardRef<WaterBendingHandle, WaterBendingProps>(({
  camera,
  characterPositionRef,
  isBendingRef,
  crosshairPositionRef,
  scene,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  environmentObjects = [],
  registerUpdate,
  domElement,
  debug = false
}, ref) => {
  // Configuration constants
  const MAX_WATER_CAPACITY = 100;
  const WATER_COST_PER_SPEAR = 10;
  const PROJECTILE_LIFESPAN = 6000;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const COLLECTION_DISTANCE = 1.5;
  const BELT_RADIUS = 2.5;

  // State
  const [waterAmount, setWaterAmount] = useState(0);
  const waterRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isBending, setIsBending] = useState(false);
  const [chargeLevel, setChargeLevel] = useState(0);
  const lastShotTime = useRef(0);

  // Debug sphere to visualize attraction point
  const debugSphereRef = useRef<THREE.Mesh | null>(null);

  // Initialize water projectile system
  const projectileSystem = useWaterProjectiles(scene, {
    maxActive: 50,
    lifespan: PROJECTILE_LIFESPAN,
    terrainHeightFn: getTerrainHeight,
    waterCostPerProjectile: WATER_COST_PER_SPEAR
  });

  // Initialize water collection system
  const collectionSystem = useWaterCollection(scene, {
    maxActive: 200,
    attractionDistance: 40,
    attractionStrength: 250,
    collectionDistance: 6,
    maxWaterCapacity: MAX_WATER_CAPACITY,
    debug: true // Always enable debug mode for collection
  });

  // Initialize water belt effect
  const beltSystem = useWaterBeltEffect(scene, {
    radius: BELT_RADIUS,
    particleCount: 200,
    particleSize: 0.1,
    color: new THREE.Color(0x00aaff),
    opacity: 0.7,
    minOpacity: 0.2
  });

  // Input actions
  const inputActions = {
    onStartCharging: useCallback(() => {
      // Always set bending to true to enable water collection
      setIsBending(true);
      if (isBendingRef.current !== null) {
        isBendingRef.current = true;
      }

      // Always show water belt when bending, regardless of water amount
      beltSystem.setVisibility(true);
    }, [beltSystem, isBendingRef]),

    onCancelCharging: useCallback(() => {
      setIsBending(false);
      if (isBendingRef.current !== null) {
        isBendingRef.current = false;
      }
      beltSystem.setVisibility(false);
      setChargeLevel(0);
    }, [beltSystem, isBendingRef]),

    onShoot: useCallback((direction: THREE.Vector3) => {
      // Only shoot if we have enough water and not recently shot
      if (waterRef.current >= WATER_COST_PER_SPEAR &&
        Date.now() - lastShotTime.current > 200) {

        // Get player position to shoot from
        const characterPosition = characterPositionRef.current || new THREE.Vector3();
        const shootPosition = characterPosition.clone();
        shootPosition.y += 1.5; // Adjust for height

        // Create projectile
        projectileSystem.createProjectile(shootPosition, direction);

        // Decrease water amount
        const newWaterAmount = Math.max(0, waterRef.current - WATER_COST_PER_SPEAR);
        setWaterAmount(newWaterAmount);
        waterRef.current = newWaterAmount;

        // Reset charge level
        setChargeLevel(0);

        // Update last shot time
        lastShotTime.current = Date.now();

        // Hide belt if not enough water left
        if (newWaterAmount < WATER_COST_PER_SPEAR) {
          beltSystem.setVisibility(false);
        }
      }
    }, [characterPositionRef, projectileSystem, beltSystem]),

    onMove: useCallback((position: THREE.Vector3) => {
      // Nothing special for movement in this implementation
    }, [])
  };

  // Initialize input system
  const inputSystem = useWaterBendingInput(inputActions, {
    camera,
    cameraDistance: 5,
    canvas: domElement
  });

  // Keep waterRef in sync with waterAmount and vice versa
  useEffect(() => {
    // Update waterRef when waterAmount changes
    waterRef.current = waterAmount;
    
    // Ensure collection system knows about our water amount
    if (collectionSystem) {
      collectionSystem.setWaterAmount(waterAmount);
      console.log(`Synced water amount with collection system: ${waterAmount}`);
    }
    
    // Add isWaterBending flag to window to use in WaterBlob
    if (typeof window !== 'undefined') {
      window.isWaterBending = isBendingRef.current || false;
    }
  }, [waterAmount, collectionSystem, isBendingRef]);

  // Generate water drops from environment
  const generateEnvironmentWaterDrops = useCallback((delta: number) => {
    if (!characterPositionRef.current) return;

    // Significantly increase spawn rate to ensure plenty of drops are available
    // Spawn much more frequently
    if (Math.random() < 0.5 * delta) {
      // Create a drop at a random position near the player
      const characterPosition = characterPositionRef.current;
      
      // Create drops very close to the player to ensure they can be collected
      for (let i = 0; i < 5; i++) {
        const dropPosition = characterPosition.clone();
        // Create drops much closer to player - within easy collection range
        dropPosition.x += (Math.random() - 0.5) * 5; // Reduce radius from 10 to 5
        dropPosition.z += (Math.random() - 0.5) * 5; // Reduce radius from 10 to 5
        // Position slightly above terrain
        dropPosition.y = Math.max(getTerrainHeight(dropPosition.x, dropPosition.z) + 2, dropPosition.y);

        // Random initial velocity, but more gentle to keep drops nearby
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 1,  // Reduce velocity for easier collection
          -1 - Math.random() * 1,     // Less downward force
          (Math.random() - 0.5) * 1   // Reduce velocity for easier collection
        );

        // Create the water drop
        collectionSystem.createWaterDrop(dropPosition, velocity);
        
        if (debug) {
          console.log("Generated water drop at", dropPosition);
        }
      }
    }
  }, [characterPositionRef, collectionSystem, debug]);

  // Create update function for the animation loop
  const updateFunction = useCallback((delta: number) => {
    // Update projectiles
    projectileSystem.update(delta);

    // Update input system - handle with type assertions to bypass strict checks
    // while maintaining runtime safety
    let currentChargeLevel = 0;
    let currentIsClicking = false;
    
    try {
      // @ts-expect-error - We know inputSystem.update exists at runtime
      const inputState = inputSystem.update(delta) as Partial<InputState>;
      
      if (inputState && typeof inputState.chargeLevel === 'number') {
        currentChargeLevel = inputState.chargeLevel;
      }
      
      if (inputState && typeof inputState.isClicking === 'boolean') {
        currentIsClicking = inputState.isClicking;
        // Update window.isWaterBending for WaterBlob
        if (typeof window !== 'undefined') {
          window.isWaterBending = isBendingRef.current && currentIsClicking;
        }
      }
    } catch (error) {
      console.error("Error updating input system:", error);
    }
    
    // Use the extracted values directly
    setChargeLevel(currentChargeLevel);

    // Update water collection - only use attraction point when actively bending AND clicking
    let attractionPoint = null;

    // Only set an attraction point when both conditions are met
    if (isBendingRef.current && crosshairPositionRef.current && currentIsClicking) {
      // Use the crosshair position as the attraction point but adjust it to match visual crosshair
      attractionPoint = crosshairPositionRef.current.clone();
      
      // Check if we're using the terrain height function to adjust Y position
      if (typeof getTerrainHeight === 'function') {
        // Adjust the attraction point vertically to follow terrain plus offset
        const terrainHeight = getTerrainHeight(attractionPoint.x, attractionPoint.z);
        attractionPoint.y = Math.max(attractionPoint.y, terrainHeight + 1.5);
      }

      // Always show the water belt when bending, regardless of water amount
      beltSystem.setVisibility(true);

      // Always set crosshair position to window for other components
      if (typeof window !== 'undefined') {
        window.crosshairPosition = attractionPoint;
      }

      // Add debug sphere to visualize attraction point
      if (debug || true) { // Always show debug sphere to help diagnose the issue
        if (!debugSphereRef.current) {
          const geometry = new THREE.SphereGeometry(0.5, 16, 16); // Better quality sphere
          const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff, // Cyan color for better visibility
            transparent: true,
            opacity: 0.8,
            wireframe: false // Make it solid for better visibility
          });
          debugSphereRef.current = new THREE.Mesh(geometry, material);
          scene.add(debugSphereRef.current);
        }
        
        if (debugSphereRef.current) {
          debugSphereRef.current.visible = true;
          debugSphereRef.current.position.copy(attractionPoint);
          
          // Add a larger semi-transparent sphere to show attraction range
          if (!debugSphereRef.current.userData.rangeIndicator) {
            const rangeGeometry = new THREE.SphereGeometry(40, 16, 8);
            const rangeMaterial = new THREE.MeshBasicMaterial({
              color: 0x0088ff,
              transparent: true,
              opacity: 0.1, // Slightly more visible
              wireframe: true
            });
            const rangeSphere = new THREE.Mesh(rangeGeometry, rangeMaterial);
            debugSphereRef.current.add(rangeSphere);
            debugSphereRef.current.userData.rangeIndicator = rangeSphere;
          }
          
          // Add debug log
          if (debug) {
            console.log("Attraction point position:", 
              attractionPoint.x.toFixed(2), 
              attractionPoint.y.toFixed(2), 
              attractionPoint.z.toFixed(2)
            );
          }
        }
      }
    } else {
      // Hide belt when not bending
      beltSystem.setVisibility(false);
      
      // Hide debug sphere when not bending
      if (debugSphereRef.current) {
        debugSphereRef.current.visible = false;
      }
      
      // Clear the crosshair position when not bending
      if (typeof window !== 'undefined') {
        window.isWaterBending = false;
      }
    }

    // Update collection system - use crosshair position for attraction when bending
    const collectedAmount = collectionSystem.update(delta, attractionPoint);
    if (collectedAmount > 0 && debug) {
      console.log(`Collected ${collectedAmount} water units at crosshair`);
    }

    // Always update the collection system, but only pass attraction point when bending
    const collected = collectionSystem.update(delta, attractionPoint);

    if (collected > 0) {
      console.log(`Collected ${collected} water drops! Current water: ${waterRef.current}`);
      const newWaterAmount = Math.min(waterRef.current + collected, MAX_WATER_CAPACITY);
      waterRef.current = newWaterAmount; // Update ref immediately

      // Use requestAnimationFrame to batch updates and avoid render loops
      requestAnimationFrame(() => {
        setWaterAmount(newWaterAmount);
        console.log(`Updated water amount to ${newWaterAmount}`);
      });
    }

    // Update water belt
    if (isBendingRef.current && characterPositionRef.current) {
      const characterPosition = characterPositionRef.current;
      const beltPosition = characterPosition.clone();
      beltPosition.y += 1.2; // Position belt at character waist/chest
      beltSystem.update(delta, beltPosition, waterRef.current / MAX_WATER_CAPACITY);
    }

    // Always generate water drops to ensure there's water to collect
    generateEnvironmentWaterDrops(delta);
  }, [projectileSystem, inputSystem, isBendingRef, crosshairPositionRef, characterPositionRef, collectionSystem, beltSystem, generateEnvironmentWaterDrops]);

  // Register the update function if we have the registerUpdate prop
  useEffect(() => {
    if (registerUpdate) {
      // Create a properly typed update function with _id property
      const typedUpdateFunction: ((delta: number) => void) & { _id: string } = 
        Object.assign(updateFunction, { _id: 'waterBending' });
      
      const unregister = registerUpdate(typedUpdateFunction);
      return unregister;
    }
  }, [registerUpdate, updateFunction]);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      projectileSystem.clear();
      collectionSystem.clear();
      inputSystem.cleanup();
      
      // Clean up debug visualization if it exists
      if (debugSphereRef.current) {
        scene.remove(debugSphereRef.current);
        debugSphereRef.current = null;
      }
    };
  }, [projectileSystem, collectionSystem, inputSystem, scene]);

  // Create a crosshair indicator in 3D space
  useEffect(() => {
    // Create a small crosshair visualization
    const createCrosshair = () => {
      const group = new THREE.Group();
      
      // Create crosshair lines
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xffff00, // Bright yellow for better visibility
        transparent: true, 
        opacity: 0.9,
        linewidth: 2, // Try to make lines thicker (though limited by WebGL)
        depthTest: false // Always render on top
      });
      
      // Horizontal line - make it larger
      const horizontalGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.0, 0, 0),
        new THREE.Vector3(1.0, 0, 0)
      ]);
      const horizontalLine = new THREE.Line(horizontalGeometry, lineMaterial);
      
      // Vertical line - make it larger
      const verticalGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -1.0, 0),
        new THREE.Vector3(0, 1.0, 0)
      ]);
      const verticalLine = new THREE.Line(verticalGeometry, lineMaterial);
      
      // Add diagonal lines for better visibility
      const diagonalGeometry1 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.7, -0.7, 0),
        new THREE.Vector3(-0.3, -0.3, 0)
      ]);
      const diagonalLine1 = new THREE.Line(diagonalGeometry1, lineMaterial);
      
      const diagonalGeometry2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.3, 0.3, 0),
        new THREE.Vector3(0.7, 0.7, 0)
      ]);
      const diagonalLine2 = new THREE.Line(diagonalGeometry2, lineMaterial);
      
      const diagonalGeometry3 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.7, 0.7, 0),
        new THREE.Vector3(-0.3, 0.3, 0)
      ]);
      const diagonalLine3 = new THREE.Line(diagonalGeometry3, lineMaterial);
      
      const diagonalGeometry4 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.3, -0.3, 0),
        new THREE.Vector3(0.7, -0.7, 0)
      ]);
      const diagonalLine4 = new THREE.Line(diagonalGeometry4, lineMaterial);
      
      // Add lines to group
      group.add(horizontalLine);
      group.add(verticalLine);
      group.add(diagonalLine1);
      group.add(diagonalLine2);
      group.add(diagonalLine3);
      group.add(diagonalLine4);
      
      // Make it always visible
      group.renderOrder = 1000;
      
      // Add to scene
      scene.add(group);
      
      // Hide initially
      group.visible = false;
      
      return group;
    };
    
    const crosshairObj = createCrosshair();
    
    // Update function to position crosshair
    const updateCrosshair = () => {
      if (crosshairPositionRef.current && isBendingRef.current) {
        crosshairObj.position.copy(crosshairPositionRef.current);
        
        // If using terrain height, adjust y position
        if (typeof getTerrainHeight === 'function') {
          const x = crosshairObj.position.x;
          const z = crosshairObj.position.z;
          const terrainHeight = getTerrainHeight(x, z);
          crosshairObj.position.y = Math.max(crosshairObj.position.y, terrainHeight + 1.5);
        }
        
        crosshairObj.visible = true;
      } else {
        crosshairObj.visible = false;
      }
    };
    
    // Set up interval to update crosshair position
    const interval = setInterval(updateCrosshair, 16); // 60fps
    
    return () => {
      clearInterval(interval);
      scene.remove(crosshairObj);
    };
  }, [crosshairPositionRef, isBendingRef, scene, getTerrainHeight]);

  // Use useImperativeHandle to expose functions to the ref
  useImperativeHandle(ref, () => ({
    collectionSystem,
    getWaterAmount: () => waterRef.current,
    setWaterAmount: (amount: number) => {
      setWaterAmount(amount);
      waterRef.current = amount;
    }
  }), [collectionSystem, waterRef]);

  // Expose water bending functionality to the window for other components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.waterBendingSystem = {
        setWaterAmount: (amount: number) => {
          setWaterAmount(amount);
          waterRef.current = amount;
        },
        getWaterAmount: () => waterRef.current,
        createWaterDrop: collectionSystem.createWaterDrop
      };
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.waterBendingSystem = undefined;
      }
    };
  }, [collectionSystem]);

  // Expose character position to window for WaterBlob
  useEffect(() => {
    if (typeof window !== 'undefined' && characterPositionRef.current) {
      window.characterPosition = characterPositionRef.current;
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.characterPosition = undefined;
        window.isWaterBending = undefined;
      }
    };
  }, [characterPositionRef]);

  // Expose crosshair position to window for water blob attraction
  useEffect(() => {
    // Function to continuously update the crosshair position
    const updateCrosshairPosition = () => {
      if (typeof window !== 'undefined' && crosshairPositionRef.current) {
        // Create a consistent attraction point
        const attraction = crosshairPositionRef.current.clone();
        
        // Apply terrain height adjustment if needed
        if (typeof getTerrainHeight === 'function') {
          const terrainHeight = getTerrainHeight(attraction.x, attraction.z);
          attraction.y = Math.max(attraction.y, terrainHeight + 1.5);
        }
        
        // Make sure we're always using the adjusted crosshair position
        window.crosshairPosition = attraction;
      }
    };
    
    // Update more frequently for smoother tracking
    const interval = setInterval(updateCrosshairPosition, 16); // ~60fps
    
    // Initial update
    updateCrosshairPosition();
    
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.crosshairPosition = undefined;
      }
    };
  }, [crosshairPositionRef, getTerrainHeight]);

  return (
    <>
      {/* Updated props to match the new WaterMeter interface */}
      <WaterMeter
        requiredWater={WATER_COST_PER_SPEAR}
        chargeLevel={chargeLevel}
        isCharging={isBending}
      />
      {/* Add WaterBlob component for better performance */}
      {registerUpdate && (
        <WaterBlob 
          scene={scene}
          maxBlobs={30} 
          registerUpdate={registerUpdate} 
        />
      )}
    </>
  );
}); 