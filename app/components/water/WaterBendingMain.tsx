import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import WaterMeter from '../WaterMeter';
import { useWaterProjectiles } from '../../hooks/useWaterProjectiles';
import { useWaterCollection } from '../../hooks/useWaterCollection';
import { useWaterBeltEffect } from '../../hooks/useWaterBeltEffect';
import { useWaterBendingInput } from '../../hooks/useWaterBendingInput';
import { getTerrainHeight } from '../../utils/terrain';

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

/**
 * Main component for water bending functionality
 * This component orchestrates all the water bending features:
 * - Water collection
 * - Water projectiles
 * - Water belt/sphere effect
 * - Input handling
 * - Water meter UI
 */
export function WaterBendingMain({
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
}: WaterBendingProps) {
  // Configuration constants
  const MAX_WATER_CAPACITY = 100;
  const WATER_COST_PER_SPEAR = 20;
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

  // Initialize water projectile system
  const projectileSystem = useWaterProjectiles(scene, {
    maxActive: 50,
    lifespan: PROJECTILE_LIFESPAN,
    terrainHeightFn: getTerrainHeight
  });

  // Initialize water collection system
  const collectionSystem = useWaterCollection(scene, {
    maxActive: 100,
    attractionDistance: 15,
    attractionStrength: 50,
    collectionDistance: 0.8,
    maxWaterCapacity: MAX_WATER_CAPACITY,
    debug: true // Add debug mode to see what's happening
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

      // Only show water belt if we have enough water
      if (waterRef.current >= WATER_COST_PER_SPEAR) {
        beltSystem.setVisibility(true);
      }
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

  // Keep waterRef in sync with waterAmount
  useEffect(() => {
    waterRef.current = waterAmount;
    collectionSystem.setWaterAmount(waterAmount);
  }, [waterAmount, collectionSystem]);

  // Generate water drops from environment
  const generateEnvironmentWaterDrops = useCallback((delta: number) => {
    if (!characterPositionRef.current) return;

    // Example: Generate water drops near water sources or from rain
    // In a real implementation, this would identify water sources from the environment

    // Create water drops more frequently to ensure there are plenty of drops to collect
    // Increase the spawn rate significantly
    if (Math.random() < 0.1 * delta) {
      // Create a drop at a random position near the player
      const characterPosition = characterPositionRef.current;
      const dropPosition = characterPosition.clone();
      // Create drops closer to the player
      dropPosition.x += (Math.random() - 0.5) * 10;
      dropPosition.z += (Math.random() - 0.5) * 10;
      dropPosition.y = Math.max(getTerrainHeight(dropPosition.x, dropPosition.z) + 5, dropPosition.y);

      // Random initial velocity using CANNON.js physics
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,  // Random X velocity
        -2 - Math.random() * 2,     // Downward Y velocity
        (Math.random() - 0.5) * 2   // Random Z velocity
      );

      // Create multiple drops at once for better visibility
      for (let i = 0; i < 3; i++) {
        const offsetPos = dropPosition.clone();
        offsetPos.x += (Math.random() - 0.5) * 2;
        offsetPos.z += (Math.random() - 0.5) * 2;
        // Slight velocity variation for each drop
        const dropVelocity = velocity.clone();
        dropVelocity.x += (Math.random() - 0.5) * 0.5;
        dropVelocity.z += (Math.random() - 0.5) * 0.5;
        collectionSystem.createWaterDrop(offsetPos, dropVelocity);
      }

      if (debug) {
        console.log("Generated water drops at", dropPosition);
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
      // Use the crosshair position as the attraction point
      attractionPoint = crosshairPositionRef.current.clone();

      // Debug log to confirm we have a valid attraction point
      if (debug) {
        console.log("Water bending active at crosshair:",
          attractionPoint.x.toFixed(2),
          attractionPoint.y.toFixed(2),
          attractionPoint.z.toFixed(2)
        );
      }
    }

    // Always update the collection system, but only pass attraction point when bending
    const collected = collectionSystem.update(delta, attractionPoint);

    if (collected > 0) {
      console.log(`Collected ${collected} water drops!`);
      const newWaterAmount = Math.min(waterRef.current + collected, MAX_WATER_CAPACITY);
      waterRef.current = newWaterAmount; // Update ref immediately

      // Use requestAnimationFrame to batch updates and avoid render loops
      requestAnimationFrame(() => {
        setWaterAmount(newWaterAmount);
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
    };
  }, [projectileSystem, collectionSystem, inputSystem]);

  return (
    <>
      {/* Make sure to use correctly named props to match WaterMeter's expected interface */}
      <WaterMeter
        currentWater={waterAmount}
        maxWater={MAX_WATER_CAPACITY}
        requiredWater={WATER_COST_PER_SPEAR}
      />
    </>
  );
} 