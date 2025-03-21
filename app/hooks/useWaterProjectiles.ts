import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { 
  initWaterPhysics, 
  updateWaterPhysics, 
  createWaterSpearBody,
  createWaterDropBody,
  removeBodyFromWorld,
  cleanupWaterPhysics,
  checkTerrainCollision
} from '../physics/waterProjectilePhysics';
import { 
  ObjectPool, 
  PhysicsObject,
  createWaterSpearMeshPool
} from '../utils/objectPool';

// Extend window interface to include waterParticleManagerInstance and createWaterBlob
declare global {
  interface Window {
    waterParticleManagerInstance?: {
      createParticlesAtLocation: (position: THREE.Vector3, radius: number, count: number) => void;
    };
    createWaterBlob?: (position: THREE.Vector3, size: number, waterAmount: number) => void;
  }
}

interface ProjectileOptions {
  maxActive?: number;
  lifespan?: number;
  terrainHeightFn?: (x: number, z: number) => number;
  waterCostPerProjectile?: number;
}

/**
 * Hook for managing water projectiles with physics
 */
export function useWaterProjectiles(
  scene: THREE.Scene,
  options: ProjectileOptions = {}
) {
  // Extract options with defaults
  const {
    maxActive = 50,
    lifespan = 6000,
    terrainHeightFn,
    waterCostPerProjectile = 10 // Reduced water cost (from 45 to 10)
  } = options;
  
  // Reference to the projectile pool
  const projectilePoolRef = useRef<ObjectPool<PhysicsObject>>(null!);
  
  // Reference to active projectiles for updating
  const activeProjectilesRef = useRef<PhysicsObject[]>([]);
  
  // Initialize physics and pool on mount
  useEffect(() => {
    // Initialize physics
    initWaterPhysics();
    
    // Create projectile mesh pool
    const spearMeshPool = createWaterSpearMeshPool(maxActive);
    
    // Create combined physics object pool
    projectilePoolRef.current = new ObjectPool<PhysicsObject>(
      // Create function
      () => ({
        mesh: spearMeshPool.get(),
        body: createWaterSpearBody(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)),
        createdAt: Date.now()
      }),
      // Reset function
      (obj) => {
        // Release particles on impact
        if (obj.mesh.visible) {
          // Get impact position
          const impactPosition = obj.mesh.position.clone();
          
          // Restore water on impact - create water blob at impact point
          if (typeof window !== 'undefined' && window.createWaterBlob) {
            // Create a large water blob with the same amount of water that was consumed
            window.createWaterBlob(
              impactPosition,
              1.5,  // Larger size for better visibility
              waterCostPerProjectile  // Same amount of water that was consumed
            );
          } else if (window.waterParticleManagerInstance) {
            // Fallback to particle system if blobs not available
            window.waterParticleManagerInstance.createParticlesAtLocation(
              impactPosition,
              2, // Splash radius
              waterCostPerProjectile
            );
          }
        }
        
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
    
    // Register our particle manager instance on the window for reuse
    if (typeof window !== 'undefined') {
      // Define the window interface
      window.waterParticleManagerInstance = window.waterParticleManagerInstance || {
        createParticlesAtLocation: (position: THREE.Vector3, radius: number, count: number) => {
          if (window.waterBendingSystem?.createWaterDrop) {
            // Fallback method if particle manager not available - create individual drops
            for (let i = 0; i < count; i++) {
              const offsetPosition = position.clone().add(
                new THREE.Vector3(
                  (Math.random() - 0.5) * radius * 2,
                  0.5 + Math.random() * 0.5,
                  (Math.random() - 0.5) * radius * 2
                )
              );
              
              const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                3 + Math.random() * 2, // Upward velocity for fountain effect
                (Math.random() - 0.5) * 2
              );
              
              window.waterBendingSystem.createWaterDrop(offsetPosition, velocity);
            }
          }
        }
      };
    }
    
    // Cleanup on unmount
    return () => {
      if (projectilePoolRef.current) {
        projectilePoolRef.current.clear();
      }
      cleanupWaterPhysics();
      
      // Cleanup window references
      if (typeof window !== 'undefined') {
        window.waterParticleManagerInstance = undefined;
      }
    };
  }, [scene, maxActive, waterCostPerProjectile]);
  
  /**
   * Create a new water projectile
   */
  const createProjectile = useCallback((
    position: THREE.Vector3,
    direction: THREE.Vector3,
    type: 'spear' | 'drop' = 'spear'
  ) => {
    if (!projectilePoolRef.current) return;
    
    // Check if we have enough water to create the projectile
    if (window.waterBendingSystem?.getWaterAmount) {
      const currentWater = window.waterBendingSystem.getWaterAmount();
      if (currentWater < waterCostPerProjectile) {
        // Not enough water
        console.log(`Not enough water to create projectile: ${currentWater} < ${waterCostPerProjectile}`);
        return null;
      }
      
      // Consume water
      window.waterBendingSystem.setWaterAmount(currentWater - waterCostPerProjectile);
    }
    
    // Get a projectile from the pool
    const projectile = projectilePoolRef.current.get();
    
    // Add mesh to scene
    projectile.mesh.visible = true;
    scene.add(projectile.mesh);
    
    // Create a new body based on type
    if (type === 'spear') {
      // Remove old body and create a new one
      removeBodyFromWorld(projectile.body);
      projectile.body = createWaterSpearBody(position, direction);
      
      // Scale and rotate mesh to match projectile direction
      projectile.mesh.position.copy(position);
      
      // Align mesh with direction vector
      const lookAt = position.clone().add(direction);
      projectile.mesh.lookAt(lookAt);
      // Rotate to align cylinder with forward direction
      projectile.mesh.rotateX(Math.PI / 2);
    } else {
      // Water drop
      removeBodyFromWorld(projectile.body);
      projectile.body = createWaterDropBody(position);
      projectile.mesh.position.copy(position);
    }
    
    // Reset creation timestamp
    projectile.createdAt = Date.now();
    
    // Add to active projectiles
    activeProjectilesRef.current.push(projectile);
    
    return projectile;
  }, [scene, waterCostPerProjectile]);
  
  /**
   * Update all active projectiles
   */
  const update = useCallback((delta: number) => {
    // First update physics
    updateWaterPhysics(delta);
    
    if (!projectilePoolRef.current) return;
    
    const now = Date.now();
    const expired: PhysicsObject[] = [];
    
    // Update each active projectile
    for (const projectile of activeProjectilesRef.current) {
      // Check if projectile has expired
      if (now - projectile.createdAt > lifespan) {
        expired.push(projectile);
        continue;
      }
      
      // Check for terrain collision
      if (terrainHeightFn && checkTerrainCollision(projectile.body, terrainHeightFn)) {
        expired.push(projectile);
        continue;
      }
      
      // Update mesh position based on physics body
      const { position, quaternion } = projectile.body;
      projectile.mesh.position.set(position.x, position.y, position.z);
      projectile.mesh.quaternion.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      );
    }
    
    // Release expired projectiles
    for (const projectile of expired) {
      removeProjectile(projectile);
    }
  }, [lifespan, terrainHeightFn]);
  
  /**
   * Remove a specific projectile
   */
  const removeProjectile = useCallback((projectile: PhysicsObject) => {
    if (!projectilePoolRef.current) return;
    
    // Find and remove from active list
    const index = activeProjectilesRef.current.indexOf(projectile);
    if (index !== -1) {
      activeProjectilesRef.current.splice(index, 1);
    }
    
    // Return to pool
    projectilePoolRef.current.release(projectile);
  }, []);
  
  /**
   * Clear all projectiles
   */
  const clear = useCallback(() => {
    if (!projectilePoolRef.current) return;
    
    // Release all active projectiles
    for (const projectile of [...activeProjectilesRef.current]) {
      removeProjectile(projectile);
    }
    
    activeProjectilesRef.current = [];
  }, [removeProjectile]);

  return { 
    createProjectile, 
    removeProjectile, 
    update, 
    clear, 
    getActiveCount: () => activeProjectilesRef.current.length,
    getWaterCost: () => waterCostPerProjectile
  };
} 