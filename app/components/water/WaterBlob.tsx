import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

interface WaterBlobProps {
  scene: THREE.Scene;
  maxBlobs: number;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
}

// Blob object type
interface WaterBlob {
  mesh: THREE.Mesh;
  physicsBody: CANNON.Body;
  active: boolean;
  waterAmount: number;
  creationTime: number;
}

/**
 * WaterBlob component - uses larger water entities instead of many tiny particles
 * for better performance
 */
export default function WaterBlob({ scene, maxBlobs = 20, registerUpdate }: WaterBlobProps) {
  const blobsRef = useRef<WaterBlob[]>([]);
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  
  // Initialize the physics world and blobs
  useEffect(() => {
    // Create physics world
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.allowSleep = true;
    
    // Add ground
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      collisionFilterGroup: 2,
      collisionFilterMask: 1 | 4
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
    
    physicsWorldRef.current = world;
    
    // Create shared geometry and material for performance
    const blobGeometry = new THREE.SphereGeometry(1, 16, 12);
    const blobMaterial = new THREE.MeshPhongMaterial({
      color: 0x0099ff,
      transparent: true,
      opacity: 0.8,
      specular: 0xffffff,
      shininess: 100
    });
    
    // Create blob pool
    const blobs: WaterBlob[] = [];
    for (let i = 0; i < maxBlobs; i++) {
      // Create mesh
      const mesh = new THREE.Mesh(blobGeometry, blobMaterial.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      
      // Create physics body
      const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(0, -1000, 0),
        linearDamping: 0.4,
        material: new CANNON.Material({
          friction: 0.1,
          restitution: 0.6
        }),
        collisionFilterGroup: 4,
        collisionFilterMask: 2
      });
      
      world.addBody(body);
      
      // Add to pool
      blobs.push({
        mesh,
        physicsBody: body,
        active: false,
        waterAmount: 0,
        creationTime: 0
      });
    }
    
    blobsRef.current = blobs;
    
    // Expose createBlob method to the window
    if (typeof window !== 'undefined') {
      window.createWaterBlob = (position: THREE.Vector3, size: number, waterAmount: number) => {
        createBlob(position, size, waterAmount);
      };
    }
    
    // Cleanup
    return () => {
      if (typeof window !== 'undefined') {
        window.createWaterBlob = undefined;
      }
      
      blobsRef.current.forEach(blob => {
        if (blob.mesh.parent) {
          scene.remove(blob.mesh);
        }
      });
    };
  }, [scene, maxBlobs]);
  
  /**
   * Create a new water blob at the specified position
   */
  const createBlob = useCallback((position: THREE.Vector3, size: number, waterAmount: number) => {
    const blobs = blobsRef.current;
    
    // Find an inactive blob
    const blob = blobs.find(b => !b.active);
    if (!blob) return null;
    
    // Activate blob
    blob.active = true;
    blob.waterAmount = waterAmount;
    blob.creationTime = Date.now();
    
    // Position and size
    blob.mesh.position.copy(position);
    blob.mesh.scale.set(size, size, size);
    blob.mesh.visible = true;
    scene.add(blob.mesh);
    
    // Update physics body
    blob.physicsBody.position.set(position.x, position.y, position.z);
    blob.physicsBody.velocity.set(
      (Math.random() - 0.5) * 2,
      1 + Math.random() * 2,
      (Math.random() - 0.5) * 2
    );
    
    // Update radius based on size
    const shapes = blob.physicsBody.shapes;
    if (shapes.length > 0 && shapes[0] instanceof CANNON.Sphere) {
      shapes[0].radius = size;
    }
    
    // Update mass based on size (volume)
    blob.physicsBody.mass = size * size * size;
    blob.physicsBody.updateMassProperties();
    blob.physicsBody.wakeUp();
    
    return blob;
  }, [scene]);
  
  /**
   * Update blob system
   */
  const updateBlobs = useCallback((delta: number) => {
    const world = physicsWorldRef.current;
    if (!world) return;
    
    // Step physics
    world.step(delta);
    
    // Update meshes
    const blobs = blobsRef.current;
    for (const blob of blobs) {
      if (!blob.active) continue;
      
      // Update position
      blob.mesh.position.set(
        blob.physicsBody.position.x,
        blob.physicsBody.position.y,
        blob.physicsBody.position.z
      );
      
      // Update rotation
      blob.mesh.quaternion.set(
        blob.physicsBody.quaternion.x,
        blob.physicsBody.quaternion.y,
        blob.physicsBody.quaternion.z,
        blob.physicsBody.quaternion.w
      );
      
      // Check for collection (if near player)
      if (typeof window !== 'undefined' && window.characterPosition) {
        const playerPos = window.characterPosition;
        const blobPos = blob.mesh.position;
        const distSq = 
          (playerPos.x - blobPos.x) ** 2 + 
          (playerPos.y - blobPos.y) ** 2 + 
          (playerPos.z - blobPos.z) ** 2;
        
        // When not bending - collect by proximity
        if (distSq < 9 && !window.isWaterBending) { // 3 units proximity collection when not bending
          // Collect water
          if (window.waterBendingSystem) {
            const currentWater = window.waterBendingSystem.getWaterAmount();
            window.waterBendingSystem.setWaterAmount(currentWater + blob.waterAmount);
            console.log(`Collected water blob by proximity, amount: ${blob.waterAmount}`);
          }
          
          // Deactivate blob
          blob.active = false;
          blob.mesh.visible = false;
          scene.remove(blob.mesh);
          blob.physicsBody.position.y = -1000;
          blob.physicsBody.sleep();
          continue;
        }
        
        // When bending - only apply attraction to crosshair
        // Ensure both isWaterBending is true AND crosshairPosition exists
        if (window.isWaterBending === true && window.crosshairPosition) {
          const crosshairPos = window.crosshairPosition;
          // Make sure crosshair position is valid
          if (isNaN(crosshairPos.x) || isNaN(crosshairPos.y) || isNaN(crosshairPos.z)) {
            continue; // Skip this blob if crosshair position is not valid
          }
          
          const crosshairDistSq = 
            (crosshairPos.x - blobPos.x) ** 2 + 
            (crosshairPos.y - blobPos.y) ** 2 + 
            (crosshairPos.z - blobPos.z) ** 2;
          
          // Apply attraction toward crosshair - INCREASED ATTRACTION RANGE AND STRENGTH
          if (crosshairDistSq < 2500) { // 50 units attraction range
            const distance = Math.sqrt(crosshairDistSq);
            const direction = new CANNON.Vec3(
              (crosshairPos.x - blobPos.x) / distance,
              (crosshairPos.y - blobPos.y) / distance,
              (crosshairPos.z - blobPos.z) / distance
            );
            
            // Much stronger pull force based on size and distance
            const forceMagnitude = 1000 * blob.physicsBody.mass * (1 - distance / 50);
            const force = new CANNON.Vec3(
              direction.x * forceMagnitude,
              direction.y * forceMagnitude, 
              direction.z * forceMagnitude
            );
            
            // Apply force to body
            blob.physicsBody.applyForce(force, blob.physicsBody.position);
            
            // Reduce damping significantly for more responsive movement
            blob.physicsBody.linearDamping = 0.01;
            
            // Complete override of velocity for very close blobs to ensure they reach target
            if (distance < 15) {
              const velocityBoost = Math.min(25, 50 * (1 - distance / 50));
              blob.physicsBody.velocity.x = direction.x * velocityBoost;
              blob.physicsBody.velocity.y = direction.y * velocityBoost;
              blob.physicsBody.velocity.z = direction.z * velocityBoost;
            } else {
              // Add to velocity for more distant blobs
              const velocityBoost = Math.min(15, 30 * (1 - distance / 50));
              blob.physicsBody.velocity.x += direction.x * velocityBoost * delta * 60;
              blob.physicsBody.velocity.y += direction.y * velocityBoost * delta * 60;
              blob.physicsBody.velocity.z += direction.z * velocityBoost * delta * 60;
            }
            
            // Ensure physics body is awake
            blob.physicsBody.wakeUp();
            
            // Collect if very close to crosshair - INCREASED COLLECTION RADIUS
            if (crosshairDistSq < 64) { // 8 units collection radius
              // Collect water
              if (window.waterBendingSystem) {
                const currentWater = window.waterBendingSystem.getWaterAmount();
                window.waterBendingSystem.setWaterAmount(currentWater + blob.waterAmount);
                console.log(`Collected water blob at crosshair, amount: ${blob.waterAmount}`);
              }
              
              // Deactivate blob
              blob.active = false;
              blob.mesh.visible = false;
              scene.remove(blob.mesh);
              blob.physicsBody.position.y = -1000;
              blob.physicsBody.sleep();
              continue;
            }
          } else {
            // Reset damping when not in attraction range
            blob.physicsBody.linearDamping = 0.4;
          }
        }
      }
      
      // Reset if too far down or up
      if (blob.physicsBody.position.y < -10 || blob.physicsBody.position.y > 100) {
        blob.active = false;
        blob.mesh.visible = false;
        scene.remove(blob.mesh);
        blob.physicsBody.position.y = -1000;
        blob.physicsBody.sleep();
      }
    }
  }, [scene]);
  
  // Register update function
  useEffect(() => {
    if (registerUpdate) {
      const updateFunc = updateBlobs as ((delta: number) => void) & { _id?: string };
      updateFunc._id = 'waterBlobsUpdate';
      return registerUpdate(updateFunc);
    }
  }, [registerUpdate, updateBlobs]);
  
  return null;
}

// Extend window interface
declare global {
  interface Window {
    createWaterBlob?: (position: THREE.Vector3, size: number, waterAmount: number) => void;
    characterPosition?: THREE.Vector3;
    isWaterBending?: boolean;
    crosshairPosition?: THREE.Vector3;
    waterBendingSystem?: {
      getWaterAmount: () => number;
      setWaterAmount: (amount: number) => void;
      createWaterDrop: (position: THREE.Vector3, velocity: THREE.Vector3) => void;
    };
  }
} 