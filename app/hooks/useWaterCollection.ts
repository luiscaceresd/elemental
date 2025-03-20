import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { 
  createWaterDropBody, 
  updateWaterPhysics, 
  removeBodyFromWorld,
  applyAttractionForce
} from '../physics/waterProjectilePhysics';
import { 
  ObjectPool, 
  PhysicsObject,
  createWaterDropMeshPool
} from '../utils/objectPool';

interface WaterCollectionOptions {
  maxActive?: number;
  lifespan?: number;
  attractionDistance?: number;
  attractionStrength?: number;
  collectionDistance?: number;
  maxWaterCapacity?: number;
}

/**
 * Hook for managing water collection with physics
 */
export function useWaterCollection(
  scene: THREE.Scene,
  options: WaterCollectionOptions = {}
) {
  // Extract options with defaults
  const {
    maxActive = 100,
    lifespan = 15000,
    attractionDistance = 10,
    attractionStrength = 20,
    collectionDistance = 1.5,
    maxWaterCapacity = 100
  } = options;
  
  // State for water amount
  const [waterAmount, setWaterAmount] = useState(0);
  
  // Reference to the water drop pool
  const dropPoolRef = useRef<ObjectPool<PhysicsObject>>(null!);
  
  // Reference to active drops for updating
  const activeDropsRef = useRef<PhysicsObject[]>([]);
  
  // Initialize physics and pool on mount
  useEffect(() => {
    // Create water drop mesh pool
    const dropMeshPool = createWaterDropMeshPool(maxActive);
    
    // Create combined physics object pool
    dropPoolRef.current = new ObjectPool<PhysicsObject>(
      // Create function
      () => ({
        mesh: dropMeshPool.get(),
        body: createWaterDropBody(
          new THREE.Vector3(0, 0, 0), 
          new THREE.Vector3(0, -1, 0)
        ),
        createdAt: Date.now()
      }),
      // Reset function
      (obj) => {
        obj.mesh.visible = false;
        scene.remove(obj.mesh);
        removeBodyFromWorld(obj.body);
        obj.createdAt = Date.now();
      },
      // Dispose function
      (obj) => {
        scene.remove(obj.mesh);
        removeBodyFromWorld(obj.body);
        if (obj.mesh.geometry) {
          obj.mesh.geometry.dispose();
        }
        if (obj.mesh.material && !Array.isArray(obj.mesh.material)) {
          obj.mesh.material.dispose();
        }
      },
      // Initial size
      0,
      // Max size
      maxActive
    );
    
    // Cleanup on unmount
    return () => {
      if (dropPoolRef.current) {
        dropPoolRef.current.clear();
      }
    };
  }, [scene, maxActive]);
  
  /**
   * Create a new water drop
   */
  const createWaterDrop = useCallback((
    position: THREE.Vector3,
    velocity?: THREE.Vector3
  ) => {
    if (!dropPoolRef.current) return;
    
    // Get a water drop from the pool
    const waterDrop = dropPoolRef.current.get();
    
    // Add mesh to scene
    waterDrop.mesh.visible = true;
    scene.add(waterDrop.mesh);
    
    // Create a new physics body
    removeBodyFromWorld(waterDrop.body);
    waterDrop.body = createWaterDropBody(position, velocity);
    
    // Set mesh position
    waterDrop.mesh.position.copy(position);
    
    // Reset creation timestamp
    waterDrop.createdAt = Date.now();
    
    // Add to active drops
    activeDropsRef.current.push(waterDrop);
    
    return waterDrop;
  }, [scene]);
  
  /**
   * Update all active water drops and handle collection
   * @returns The number of drops collected in this update
   */
  const update = useCallback((
    delta: number, 
    attractionPoint: THREE.Vector3 | null
  ): number => {
    if (!dropPoolRef.current) return 0;
    
    const now = Date.now();
    const expired: PhysicsObject[] = [];
    let collected = 0;
    
    // Update each active water drop
    for (const waterDrop of activeDropsRef.current) {
      // Check if drop has expired by time
      if (now - waterDrop.createdAt > lifespan) {
        expired.push(waterDrop);
        continue;
      }
      
      // Apply attraction force if there's an attraction point
      if (attractionPoint) {
        applyAttractionForce(
          waterDrop.body,
          attractionPoint,
          attractionStrength,
          attractionDistance
        );
        
        // Check if water drop is collected (close enough to attraction point)
        const distance = new THREE.Vector3(
          waterDrop.body.position.x,
          waterDrop.body.position.y,
          waterDrop.body.position.z
        ).distanceTo(attractionPoint);
        
        if (distance < collectionDistance) {
          expired.push(waterDrop);
          collected++;
          continue;
        }
      }
      
      // Update mesh position based on physics body
      const { position, quaternion } = waterDrop.body;
      waterDrop.mesh.position.set(position.x, position.y, position.z);
      waterDrop.mesh.quaternion.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      );
    }
    
    // Release expired drops
    for (const waterDrop of expired) {
      removeWaterDrop(waterDrop);
    }
    
    // Update water amount
    if (collected > 0) {
      setWaterAmount(prev => Math.min(prev + collected, maxWaterCapacity));
    }
    
    return collected;
  }, [lifespan, attractionDistance, attractionStrength, collectionDistance, maxWaterCapacity]);
  
  /**
   * Remove a specific water drop
   */
  const removeWaterDrop = useCallback((waterDrop: PhysicsObject) => {
    if (!dropPoolRef.current) return;
    
    // Find and remove from active list
    const index = activeDropsRef.current.indexOf(waterDrop);
    if (index !== -1) {
      activeDropsRef.current.splice(index, 1);
    }
    
    // Return to pool
    dropPoolRef.current.release(waterDrop);
  }, []);
  
  /**
   * Clear all water drops
   */
  const clear = useCallback(() => {
    if (!dropPoolRef.current) return;
    
    // Release all active drops
    for (const waterDrop of [...activeDropsRef.current]) {
      removeWaterDrop(waterDrop);
    }
    
    activeDropsRef.current = [];
  }, [removeWaterDrop]);
  
  /**
   * Set water amount explicitly
   */
  const setWaterAmountExplicit = useCallback((amount: number) => {
    setWaterAmount(Math.min(Math.max(amount, 0), maxWaterCapacity));
  }, [maxWaterCapacity]);
  
  return {
    createWaterDrop,
    update,
    clear,
    getWaterAmount: () => waterAmount,
    setWaterAmount: setWaterAmountExplicit
  };
} 