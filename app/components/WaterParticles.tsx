'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { vertexShader, fragmentShader } from './water/WaterDropShader';
import { activateRandomParticles, deactivateDistantParticles } from '../utils/waterParticleUtils';
import { WaterDrop, WaterParticlesProps, CustomWindow } from './water/WaterParticleTypes';
import { WaterParticleManager } from './water/WaterParticleManager';

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
  const particleManagerRef = useRef<WaterParticleManager>(new WaterParticleManager());
  
  // Camera position update - to activate particles near the player
  const updatePlayerPosition = useCallback((position: THREE.Vector3) => {
    playerPositionRef.current.copy(position);
  }, []);

  // Create the water particles pool
  useEffect(() => {
    if (!scene) return;

    // Create a physics world with reduced step
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0) // Standard Earth gravity
    });
    
    // Optimize physics world
    world.broadphase = new CANNON.NaiveBroadphase();
    world.allowSleep = true; // Allow bodies to sleep when inactive

    // Add a ground plane
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0, // Static body
      shape: groundShape,
      collisionFilterGroup: 2, // Group 2 for ground
      collisionFilterMask: 1 | 4  // Collide with player (Group 1) and drops (Group 4)
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Make it horizontal
    world.addBody(groundBody);
    
    physicsWorldRef.current = world;

    // Create container for particles
    const particlesContainer = new THREE.Group();
    scene.add(particlesContainer);
    particlesContainerRef.current = particlesContainer;

    // Create water drops pool
    const drops: WaterDrop[] = [];
    const totalPoolSize = 2000; // Total pool size remains the same
    const maxActiveParticles = 300; // But we'll only activate a subset
    
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

    // Try to activate initial particles
    activateRandomParticles(
      drops, 
      maxActiveParticles, 
      playerPositionRef.current, 
      activeCountRef.current,
      (newCount) => { activeCountRef.current = newCount; }
    );

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

  // Update function for the animation loop - now optimized
  const updateParticles = useCallback((delta: number) => {
    if (!isLoaded || delta > 0.1) return; // Skip large deltas
    
    const world = physicsWorldRef.current;
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
    
    // Activate new particles if needed
    if (activeCountRef.current < maxActiveParticles) {
      activateRandomParticles(
        drops, 
        maxActiveParticles, 
        playerPositionRef.current, 
        activeCountRef.current,
        (newCount) => { activeCountRef.current = newCount; }
      );
    }
    
    // Process water bending effects
    if (isBendingRef.current && crosshairPositionRef.current) {
      processBendingEffects(drops);
    }
    
    // Update mesh positions from physics bodies
    updateMeshPositions(drops);
    
    // Process particle merging
    particleManagerRef.current.processMergingParticles(drops, activeCountRef);
    
    // Update shader uniforms
    particleManagerRef.current.updateShaderUniforms(drops);
  }, [isLoaded, isBendingRef, crosshairPositionRef]);

  // Process water bending effects on particles
  const processBendingEffects = useCallback((drops: WaterDrop[]) => {
    if (!isBendingRef.current || !crosshairPositionRef.current) return;
    
    const crosshairPos = crosshairPositionRef.current;
    
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      if (!drop.active || !drop.visible) continue;
      
      const dropBody = drop.physicsBody;
      const dropPos = new THREE.Vector3(
        dropBody.position.x,
        dropBody.position.y,
        dropBody.position.z
      );
      
      const direction = crosshairPos.clone().sub(dropPos);
      const distance = direction.length();
      
      if (distance < 30) { // Attraction range
        direction.normalize();
        const pullStrength = 25 * (1 - distance / 30); // Strong pull
        
        // Apply force using CANNON.js
        dropBody.applyForce(
          new CANNON.Vec3(
            direction.x * pullStrength * dropBody.mass,
            direction.y * pullStrength * dropBody.mass,
            direction.z * pullStrength * dropBody.mass
          ),
          dropBody.position // Simplified - use body position directly
        );
        
        // Wake up body if it was sleeping
        dropBody.wakeUp();
      }
    }
  }, [isBendingRef, crosshairPositionRef]);

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
  }, []);

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