import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { WaterMeter } from '../WaterMeter';
import { useWaterProjectiles } from '../../hooks/useWaterProjectiles';
import { useWaterCollection } from '../../hooks/useWaterCollection';
import { useWaterBeltEffect } from '../../hooks/useWaterBeltEffect';
import { useWaterBendingInput } from '../../hooks/useWaterBendingInput';
import { getTerrainHeight } from '../../utils/terrain';

interface WaterBendingProps {
  camera: THREE.Camera;
  player: {
    position: THREE.Vector3;
    rotation: THREE.Euler;
  };
  scene: THREE.Scene;
  environmentObjects?: THREE.Object3D[];
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
export function WaterBendingMain({ camera, player, scene, environmentObjects = [] }: WaterBendingProps) {
  // Configuration constants
  const MAX_WATER_CAPACITY = 100;
  const WATER_COST_PER_SPEAR = 20;
  const PROJECTILE_LIFESPAN = 6000;
  const COLLECTION_DISTANCE = 1.5;
  const BELT_RADIUS = 2.5;
  
  // State
  const [waterAmount, setWaterAmount] = useState(0);
  const waterRef = useRef<number>(0);
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
    attractionDistance: 10,
    attractionStrength: 20,
    collectionDistance: COLLECTION_DISTANCE,
    maxWaterCapacity: MAX_WATER_CAPACITY
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
      // Show water belt if we have enough water
      if (waterRef.current >= WATER_COST_PER_SPEAR) {
        setIsBending(true);
        beltSystem.setVisibility(true);
      }
    }, [beltSystem]),
    
    onCancelCharging: useCallback(() => {
      setIsBending(false);
      beltSystem.setVisibility(false);
      setChargeLevel(0);
    }, [beltSystem]),
    
    onShoot: useCallback((direction: THREE.Vector3) => {
      // Only shoot if we have enough water and not recently shot
      if (waterRef.current >= WATER_COST_PER_SPEAR && 
          Date.now() - lastShotTime.current > 200) {
        
        // Get player position to shoot from
        const shootPosition = player.position.clone();
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
          setIsBending(false);
          beltSystem.setVisibility(false);
        }
      }
    }, [player.position, projectileSystem, beltSystem]),
    
    onMove: useCallback((position: THREE.Vector3) => {
      // Nothing special for movement in this implementation
    }, [])
  };
  
  // Initialize input system
  const inputSystem = useWaterBendingInput(inputActions, {
    camera,
    cameraDistance: 5,
    canvas: document.querySelector('canvas') as HTMLCanvasElement
  });
  
  // Keep waterRef in sync with waterAmount
  useEffect(() => {
    waterRef.current = waterAmount;
    collectionSystem.setWaterAmount(waterAmount);
  }, [waterAmount, collectionSystem]);
  
  // Main update loop
  useFrame((state, delta) => {
    // Update projectiles
    projectileSystem.update(delta);
    
    // Update input
    inputSystem.update(delta);
    const inputState = inputSystem.getInputState();
    setChargeLevel(inputState.chargeLevel);
    
    // Update water collection
    const attractionPoint = isBending ? player.position.clone() : null;
    const collected = collectionSystem.update(delta, attractionPoint);
    
    if (collected > 0) {
      setWaterAmount(prev => Math.min(prev + collected, MAX_WATER_CAPACITY));
    }
    
    // Update water belt
    if (isBending) {
      const beltPosition = player.position.clone();
      beltPosition.y += 1.2; // Position belt at character waist/chest
      beltSystem.update(delta, beltPosition, waterAmount / MAX_WATER_CAPACITY);
    }
    
    // Generate water drops if there's a water source nearby
    // This would be environment-dependent logic for water sources
    generateEnvironmentWaterDrops(delta);
  });
  
  // Generate water drops from environment
  const generateEnvironmentWaterDrops = useCallback((delta: number) => {
    // Example: Generate water drops near water sources or from rain
    // In a real implementation, this would identify water sources from the environment
    
    // Check if it's time to spawn a water drop (random chance)
    if (Math.random() < 0.02 * delta) {
      // Create a drop at a random position near the player
      const dropPosition = player.position.clone();
      dropPosition.x += (Math.random() - 0.5) * 20;
      dropPosition.z += (Math.random() - 0.5) * 20;
      dropPosition.y = Math.max(getTerrainHeight(dropPosition.x, dropPosition.z) + 5, dropPosition.y);
      
      // Random velocity
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        -1 - Math.random() * 2,
        (Math.random() - 0.5) * 2
      );
      
      collectionSystem.createWaterDrop(dropPosition, velocity);
    }
  }, [player.position, collectionSystem]);
  
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
      {/* Water Meter UI */}
      <WaterMeter 
        waterAmount={waterAmount} 
        maxAmount={MAX_WATER_CAPACITY}
        chargeLevel={chargeLevel}
        isCharging={isBending}
        waterCost={WATER_COST_PER_SPEAR}
      />
    </>
  );
} 