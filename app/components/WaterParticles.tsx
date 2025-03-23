'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { vertexShader, fragmentShader } from './water/WaterDropShader';
import { activateRandomParticles, deactivateDistantParticles } from '../utils/waterParticleUtils';
import { WaterDrop, WaterParticlesProps, CustomWindow } from './water/WaterParticleTypes';
import { WaterParticleManager } from './water/WaterParticleManager';

// Extend the window interface to include waterBendingSystem
declare global {
  interface Window {
    waterBendingSystem?: {
      getWaterAmount: () => number;
      setWaterAmount: (amount: number) => void;
      createWaterDrop: (position: THREE.Vector3, velocity: THREE.Vector3) => void;
    };
    pondPositions?: Array<{position: THREE.Vector3, size: number}>;
    updateWaterParticlesPlayerPos?: (position: THREE.Vector3) => void;
  }
}

export default function WaterParticles({ 
  scene, 
  isBendingRef, 
  crosshairPositionRef, 
  registerUpdate 
}: WaterParticlesProps) {
  // State and refs
  const [isLoaded, setIsLoaded] = useState(false);
  const dropsRef = useRef<WaterDrop[]>([]);
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  const particlesContainerRef = useRef<THREE.Group | null>(null);
  const playerPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const activeCountRef = useRef<number>(0);
  const particleManagerRef = useRef<WaterParticleManager>(WaterParticleManager.getInstance());
  
  // Camera position update - to activate particles near the player
  const updatePlayerPosition = useCallback((position: THREE.Vector3) => {
    playerPositionRef.current.copy(position);
  }, []);

  // Create the water particles pool
  useEffect(() => {
    if (!scene) return;

    // Get singleton instance of particle manager and initialize physics world
    const manager = WaterParticleManager.getInstance();
    const world = manager.initPhysicsWorld();
    physicsWorldRef.current = world;

    // Create container for particles
    const particlesContainer = new THREE.Group();
    scene.add(particlesContainer);
    particlesContainerRef.current = particlesContainer;

    // Create water drops pool
    const drops: WaterDrop[] = [];
    const totalPoolSize = 500; // Reduced from 2000 to 500
    const maxActiveParticles = 50; // Reduced from 300 to 50
    
    // Create reusable geometries and materials
    const dropGeometry = new THREE.SphereGeometry(0.5, 8, 8); // Reduced segments
    const dropMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x00aaff) },
        opacity: { value: 0.7 }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
    });
    
    // Reusable physics shape
    const sphereShape = new CANNON.Sphere(0.5);

    // Create the object pool
    for (let i = 0; i < totalPoolSize; i++) {
      // Create mesh
      const dropMesh = new THREE.Mesh(dropGeometry, dropMaterial.clone());
      dropMesh.visible = false; // Start inactive
      
      // Random scaling (size) for each drop
      const scale = 0.2 + Math.random() * 0.8;
      dropMesh.scale.set(scale, scale, scale);
      
      // Create physics body for this drop
      const dropBody = new CANNON.Body({
        mass: scale * scale * scale, // Mass proportional to volume
        shape: sphereShape,
        position: new CANNON.Vec3(0, -1000, 0), // Start offscreen
        linearDamping: 0.3,
        material: new CANNON.Material({
          friction: 0.2,
          restitution: 0.4
        }),
        collisionFilterGroup: 4, // Group 4 for water drops
        collisionFilterMask: 2    // Collide only with ground (Group 2)
      });
      
      // Allow body to sleep
      dropBody.allowSleep = true;
      dropBody.sleepSpeedLimit = 0.5;
      dropBody.sleepTimeLimit = 1.0;
      
      // Add body to world 
      world.addBody(dropBody);
      
      // Add mesh to scene
      particlesContainer.add(dropMesh);
      
      // Add to object pool
      drops.push({
        mesh: dropMesh,
        physicsBody: dropBody,
        active: false,
        visible: false,
        scale: new THREE.Vector3(scale, scale, scale),
        lastActive: 0
      });
    }

    dropsRef.current = drops;
    setIsLoaded(true);

    // Expose ponds array to window for water particle generation from ponds
    if (typeof window !== 'undefined' && !(window as any).pondPositions) {
      (window as any).pondPositions = [];
    }

    // Update the camera position in our system when the player moves
    if (typeof window !== 'undefined') {
      const customWindow = window as CustomWindow;
      customWindow.updateWaterParticlesPlayerPos = updatePlayerPosition;
    }

    // Cleanup
    return () => {
      if (particlesContainerRef.current) {
        scene.remove(particlesContainerRef.current);
      }
      
      if (typeof window !== 'undefined') {
        const customWindow = window as CustomWindow;
        delete customWindow.updateWaterParticlesPlayerPos;
      }
    };
  }, [scene, updatePlayerPosition]);

  // Process water bending - attract drops to crosshair
  const processBendingEffects = useCallback((drops: WaterDrop[]) => {
    if (!isBendingRef.current || !crosshairPositionRef.current) return;
    
    const crosshairPos = crosshairPositionRef.current;
    const attractionDistance = 50; // Large attraction range
    const attractionStrength = 400; // Even stronger pull
    const collectionDistance = 8.0; // Increased collection distance
    let collectedCount = 0;
    
    for (const drop of drops) {
      if (!drop.active || !drop.visible) continue;
      
      const dropPos = drop.physicsBody.position;
      const dx = crosshairPos.x - dropPos.x;
      const dy = crosshairPos.y - dropPos.y;
      const dz = crosshairPos.z - dropPos.z;
      
      const distanceSquared = dx*dx + dy*dy + dz*dz;
      
      // Collection first - check if drop is very close to crosshair
      if (distanceSquared < collectionDistance * collectionDistance) {
        // Deactivate the collected particle
        drop.active = false;
        drop.visible = false;
        drop.mesh.visible = false;
        drop.physicsBody.position.y = -1000;
        drop.physicsBody.sleep();
        activeCountRef.current--;
        collectedCount++;
        continue;
      }
      
      // Apply attraction force for particles within range
      if (distanceSquared < attractionDistance * attractionDistance) {
        const distance = Math.sqrt(distanceSquared);
        
        // Create directional unit vector
        const direction = new CANNON.Vec3(
          dx / distance,
          dy / distance,
          dz / distance
        );
        
        // Force is stronger when closer (quadratic relationship for stronger close pull)
        const distanceRatio = distance / attractionDistance;
        const forceMagnitude = attractionStrength * Math.pow(1 - distanceRatio, 2) * drop.physicsBody.mass;
        
        // Apply force in the direction of the crosshair
        const force = new CANNON.Vec3(
          direction.x * forceMagnitude,
          direction.y * forceMagnitude,
          direction.z * forceMagnitude
        );
        
        drop.physicsBody.applyForce(force, drop.physicsBody.position);
        
        // Reduce damping when close to allow particles to reach collection point
        if (distance < attractionDistance * 0.4) {
          // Reduce linear damping temporarily
          const originalDamping = drop.physicsBody.linearDamping;
          drop.physicsBody.linearDamping = 0.05; // Almost no damping
          
          // Also add a significant velocity boost toward crosshair
          drop.physicsBody.velocity.x += direction.x * 10;
          drop.physicsBody.velocity.y += direction.y * 10;
          drop.physicsBody.velocity.z += direction.z * 10;
          
          // Restore damping next frame
          setTimeout(() => {
            if (drop.physicsBody) {
              drop.physicsBody.linearDamping = originalDamping;
            }
          }, 100);
        }
        
        drop.physicsBody.wakeUp();
      }
    }
    
    // Add collected water to player's water amount
    if (collectedCount > 0 && window.waterBendingSystem?.getWaterAmount) {
      const currentAmount = window.waterBendingSystem.getWaterAmount();
      const newAmount = currentAmount + collectedCount;
      window.waterBendingSystem.setWaterAmount(newAmount);
      console.log(`Collected ${collectedCount} water drops! New water: ${newAmount}`);
    }
  }, [isBendingRef, crosshairPositionRef, activeCountRef]);

  // Update mesh positions from physics bodies
  const updateMeshPositions = useCallback((drops: WaterDrop[]) => {
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      if (!drop.active || !drop.visible) continue;
      
      const dropMesh = drop.mesh;
      const dropBody = drop.physicsBody;
      
      // Update mesh position from physics body - only if active
      dropMesh.position.set(
        dropBody.position.x,
        dropBody.position.y,
        dropBody.position.z
      );
      
      // Only update quaternion if moving significantly
      if (dropBody.velocity.lengthSquared() > 0.1) {
        dropMesh.quaternion.set(
          dropBody.quaternion.x,
          dropBody.quaternion.y,
          dropBody.quaternion.z,
          dropBody.quaternion.w
        );
      }
      
      // Reset drops that fall too far or go too high
      if (dropBody.position.y < -10 || dropBody.position.y > 100) {
        const worldSize = 200;
        const playerPos = playerPositionRef.current;
        
        // Reposition near the player
        dropBody.position.set(
          playerPos.x + (Math.random() - 0.5) * worldSize,
          Math.random() * 10 + 1,
          playerPos.z + (Math.random() - 0.5) * worldSize
        );
        
        dropBody.velocity.set(
          (Math.random() - 0.5) * 2,
          Math.random() * 2,
          (Math.random() - 0.5) * 2
        );
        
        dropBody.wakeUp();
      }
    }
  }, [playerPositionRef]);

  // Update function for the animation loop - now optimized
  const updateParticles = useCallback((delta: number) => {
    if (!isLoaded || delta > 0.1) return; // Skip large deltas
    
    const world = physicsWorldRef.current;
    const manager = particleManagerRef.current;
    if (!world) return;
    
    const drops = dropsRef.current;
    const maxActiveParticles = 300;
    const maxDistance = 300; // Maximum distance before deactivation
    
    // Step the physics world
    world.step(delta);
    
    // Manage particle pool: deactivate distant particles
    deactivateDistantParticles(
      drops, 
      maxDistance, 
      playerPositionRef.current,
      () => { activeCountRef.current--; }
    );
    
    // Check for ponds to activate particles from
    const ponds = (window as any).pondPositions || [];
    if (ponds.length > 0 && activeCountRef.current < maxActiveParticles) {
      // Find the closest pond to the player
      let closestPond = null;
      let closestDistance = Infinity;
      
      for (const pond of ponds) {
        const distance = playerPositionRef.current.distanceTo(pond.position);
        if (distance < 50 && distance < closestDistance) {
          closestPond = pond;
          closestDistance = distance;
        }
      }
      
      // Activate particles from the closest pond
      if (closestPond) {
        const particlesToActivate = Math.floor(Math.min(maxActiveParticles - activeCountRef.current, 50));
        if (particlesToActivate > 0) {
          manager.activateParticlesInArea(
            drops,
            closestPond.position,
            closestPond.size / 2,
            particlesToActivate,
            activeCountRef
          );
        }
      }
    } else if (activeCountRef.current < maxActiveParticles) {
      // If no ponds are nearby, fall back to random particle activation
      activateRandomParticles(
        drops, 
        maxActiveParticles, 
        playerPositionRef.current, 
        activeCountRef.current,
        (newCount) => { activeCountRef.current = newCount; }
      );
    }
    
    // Process water bending effects - apply attraction and collect particles
    if (isBendingRef.current && crosshairPositionRef.current) {
      processBendingEffects(drops);
    }
    
    // Update mesh positions from physics bodies
    updateMeshPositions(drops);
    
    // Process particle merging
    manager.processMergingParticles(drops, activeCountRef, isBendingRef.current);
    
    // Update shader uniforms
    manager.updateShaderUniforms(drops);
  }, [
    isLoaded,
    isBendingRef,
    crosshairPositionRef,
    processBendingEffects,
    deactivateDistantParticles,
    activateRandomParticles,
    playerPositionRef,
    updateMeshPositions
  ]);

  // Register update function with the animation loop
  useEffect(() => {
    if (registerUpdate && isLoaded) {
      const updateFunc = updateParticles as ((delta: number) => void) & { _id?: string };
      updateFunc._id = 'waterParticlesUpdate';
      const unregister = registerUpdate(updateFunc);
      return unregister;
    }
  }, [registerUpdate, updateParticles, isLoaded]);

  // Update player position from GameCanvas
  useEffect(() => {
    // Get the player position from the character if available
    const updateFromCamera = () => {
      if (typeof window !== 'undefined') {
        const customWindow = window as CustomWindow;
        if (customWindow.characterPosition) {
          updatePlayerPosition(customWindow.characterPosition);
        }
      }
    };
    
    const interval = setInterval(updateFromCamera, 500);
    return () => clearInterval(interval);
  }, [updatePlayerPosition]);

  return null; // This is a pure logic component, no JSX needed
} 