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
  debug?: boolean;
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
    attractionDistance = 15, // Increased attraction distance
    attractionStrength = 30, // Increased attraction strength
    collectionDistance = 2.5, // Increased collection distance
    maxWaterCapacity = 100,
    debug = false
  } = options;
  
  // State for water amount
  const [waterAmount, setWaterAmount] = useState(0);
  
  // Reference to the water drop pool
  const dropPoolRef = useRef<ObjectPool<PhysicsObject>>(null!);
  
  // Reference to active drops for updating
  const activeDropsRef = useRef<PhysicsObject[]>([]);
  
  // Reference to water specific objects in the scene for processing
  const waterObjectsRef = useRef<THREE.Object3D[]>([]);
  
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
    
    // Find water objects in the scene
    findWaterObjects(scene);
    
    // Cleanup on unmount
    return () => {
      if (dropPoolRef.current) {
        dropPoolRef.current.clear();
      }
    };
  }, [scene, maxActive]);
  
  /**
   * Find water objects in the scene by checking userData.isWater
   */
  const findWaterObjects = useCallback((sceneToSearch: THREE.Object3D) => {
    // Reset array
    waterObjectsRef.current = [];
    
    // Recursive function to find water objects
    const traverse = (object: THREE.Object3D) => {
      if (object.userData && object.userData.isWater) {
        waterObjectsRef.current.push(object);
      }
      
      object.children.forEach(traverse);
    };
    
    // Start traversal
    traverse(sceneToSearch);
    
    if (debug) {
      console.log(`[WaterCollection] Found ${waterObjectsRef.current.length} water objects in scene`);
    }
  }, [debug]);
  
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
    
    if (debug) {
      console.log(`[WaterCollection] Created water drop at ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);
    }
    
    return waterDrop;
  }, [scene, debug]);
  
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
        // Get current drop position
        const dropPosition = new THREE.Vector3(
          waterDrop.body.position.x,
          waterDrop.body.position.y,
          waterDrop.body.position.z
        );
        
        // Calculate distance
        const distance = dropPosition.distanceTo(attractionPoint);
        
        // Apply stronger attraction within range
        if (distance < attractionDistance) {
          // Apply attraction with stronger force for closer drops
          const strengthMultiplier = 1.0 + (1.0 - distance / attractionDistance) * 2.0;
          applyAttractionForce(
            waterDrop.body,
            attractionPoint,
            attractionStrength * strengthMultiplier,
            attractionDistance
          );
          
          // Check if water drop is collected (close enough to attraction point)
          if (distance < collectionDistance) {
            expired.push(waterDrop);
            collected++;
            
            if (debug) {
              console.log(`[WaterCollection] Collected water drop at distance ${distance.toFixed(2)} (limit: ${collectionDistance})`);
            }
            
            continue;
          }
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
      setWaterAmount(prev => {
        const newAmount = Math.min(prev + collected, maxWaterCapacity);
        if (debug) {
          console.log(`[WaterCollection] Water amount: ${prev} -> ${newAmount} (collected: ${collected})`);
        }
        return newAmount;
      });
    }
    
    // Auto-replenish drops from water objects in scene
    if (Math.random() < 0.05 * delta && waterObjectsRef.current.length > 0) {
      createDropsFromWaterObjects();
    }
    
    return collected;
  }, [lifespan, attractionDistance, attractionStrength, collectionDistance, maxWaterCapacity, createWaterDrop, debug]);
  
  /**
   * Create water drops from water objects in the scene
   */
  const createDropsFromWaterObjects = useCallback(() => {
    if (waterObjectsRef.current.length === 0) return;
    
    // Select a random water object
    const waterObject = waterObjectsRef.current[
      Math.floor(Math.random() * waterObjectsRef.current.length)
    ];
    
    // Create a drop at a random point on its surface
    const position = waterObject.position.clone();
    
    // If it's a mesh with geometry, try to get a random point on surface
    if (waterObject instanceof THREE.Mesh && waterObject.geometry) {
      // Add a small random offset
      position.x += (Math.random() - 0.5) * 2;
      position.z += (Math.random() - 0.5) * 2;
      
      // Adjust Y position to be slightly above the water object
      position.y += 0.5;
    }
    
    // Create the drop with a small upward velocity
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      1 + Math.random() * 0.5,
      (Math.random() - 0.5) * 0.5
    );
    
    createWaterDrop(position, velocity);
  }, [createWaterDrop]);
  
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
  
  /**
   * Get current water amount
   */
  const getWaterAmount = useCallback(() => {
    return waterAmount;
  }, [waterAmount]);
  
  return {
    createWaterDrop,
    update,
    clear,
    getWaterAmount,
    setWaterAmount: setWaterAmountExplicit
  };
} 