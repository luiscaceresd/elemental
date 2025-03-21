'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

interface WaterParticlesProps {
  scene: THREE.Scene;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
}

interface WaterDrop {
  mesh: THREE.Mesh;
  physicsBody: CANNON.Body;
  active: boolean;
  visible: boolean;
  scale: THREE.Vector3;
  lastActive: number; // Timestamp when last active
}

export default function WaterParticles({ scene, isBendingRef, crosshairPositionRef, registerUpdate }: WaterParticlesProps) {
  // State and refs
  const [isLoaded, setIsLoaded] = useState(false);
  const dropsRef = useRef<WaterDrop[]>([]);
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  const particlesContainerRef = useRef<THREE.Group | null>(null);
  const playerPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const activeCountRef = useRef<number>(0);
  
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
    world.broadphase = new CANNON.NaiveBroadphase();// Reduced from default 10
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
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        
        void main() {
          vUv = uv;
          vPosition = position;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform float opacity;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        
        void main() {
          // Basic lighting
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float diffuse = max(0.0, dot(vNormal, lightDir));
          
          // Simpler shimmer effect
          float shimmer = sin(vPosition.x * 5.0 + time * 2.0) * 
                         sin(vPosition.z * 5.0 + time * 3.0);
          shimmer = shimmer * 0.1 + 0.9; // Scale to 0.9-1.0 range
          
          // Combine effects
          vec3 finalColor = color * shimmer * (diffuse * 0.7 + 0.3);
          
          gl_FragColor = vec4(finalColor, opacity);
        }
      `,
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
    activateRandomParticles(drops, maxActiveParticles);

    // Update the camera position in our system when the player moves
    if (typeof window !== 'undefined') {
      // @ts-expect-error - We'll set up a global hook for the player position
      window.updateWaterParticlesPlayerPos = updatePlayerPosition;
    }

    // Cleanup
    return () => {
      if (particlesContainerRef.current) {
        scene.remove(particlesContainerRef.current);
      }
      
      if (typeof window !== 'undefined') {
        // @ts-expect-error - Clean up the global hook
        delete window.updateWaterParticlesPlayerPos;
      }
    };
  }, [scene, updatePlayerPosition]);

  // Function to activate random particles within the pool
  const activateRandomParticles = useCallback((drops: WaterDrop[], count: number) => {
    const worldSize = 300; // Smaller active area
    const playerPos = playerPositionRef.current;
    
    // First, count how many are already active
    let activeCount = 0;
    for (let i = 0; i < drops.length; i++) {
      if (drops[i].active) activeCount++;
    }
    
    // If we already have enough active particles, don't activate more
    if (activeCount >= count) return;
    
    // Activate more particles up to the desired count
    let activated = 0;
    const maxToActivate = count - activeCount;
    
    // Shuffle the array for random selection
    const inactiveIndices = [];
    for (let i = 0; i < drops.length; i++) {
      if (!drops[i].active) inactiveIndices.push(i);
    }
    
    // Fisher-Yates shuffle
    for (let i = inactiveIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [inactiveIndices[i], inactiveIndices[j]] = [inactiveIndices[j], inactiveIndices[i]];
    }
    
    // Activate particles
    for (let i = 0; i < inactiveIndices.length && activated < maxToActivate; i++) {
      const index = inactiveIndices[i];
      const drop = drops[index];
      
      // Skip if somehow already active
      if (drop.active) continue;
      
      // Position around the player with some randomness
      const distance = 50 + Math.random() * worldSize * 0.5;
      const angle = Math.random() * Math.PI * 2;
      const x = playerPos.x + Math.cos(angle) * distance;
      const z = playerPos.z + Math.sin(angle) * distance;
      const y = Math.random() * 10 + 1;
      
      // Activate the particle
      drop.active = true;
      drop.visible = true;
      drop.mesh.visible = true;
      drop.lastActive = performance.now();
      
      // Position physics body
      drop.physicsBody.position.set(x, y, z);
      drop.physicsBody.velocity.set(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      );
      
      // Wake up the body
      drop.physicsBody.wakeUp();
      
      activated++;
    }
    
    activeCountRef.current = activeCount + activated;
  }, []);

  // Handle deactivation of particles that are too far away
  const deactivateDistantParticles = useCallback((drops: WaterDrop[], maxDistance: number) => {
    const playerPos = playerPositionRef.current;
    const now = performance.now();
    const minActiveTime = 2000; // Minimum time in ms to stay active
    
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      if (!drop.active) continue;
      
      // Don't deactivate particles that were just activated
      if (now - drop.lastActive < minActiveTime) continue;
      
      const dropPos = drop.physicsBody.position;
      const dx = dropPos.x - playerPos.x;
      const dz = dropPos.z - playerPos.z;
      const distanceSq = dx * dx + dz * dz;
      
      // Deactivate if too far away
      if (distanceSq > maxDistance * maxDistance) {
        drop.active = false;
        drop.visible = false;
        drop.mesh.visible = false;
        drop.physicsBody.position.y = -1000; // Move away
        drop.physicsBody.sleep(); // Put the body to sleep
        activeCountRef.current--;
      }
    }
  }, []);

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
    deactivateDistantParticles(drops, maxDistance);
    
    // Activate new particles if needed
    if (activeCountRef.current < maxActiveParticles) {
      activateRandomParticles(drops, maxActiveParticles);
    }
    
    // Process each active drop
    const mergedThisFrame = new Set<number>(); // Track merged particles
    
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      if (!drop.active || !drop.visible || mergedThisFrame.has(i)) continue;
      
      const dropMesh = drop.mesh;
      const dropBody = drop.physicsBody;
      
      // Only handle water bending for active particles
      if (isBendingRef.current && crosshairPositionRef.current) {
        const crosshairPos = crosshairPositionRef.current;
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
    
    // Process merging less frequently (every other frame)
    if (Math.floor(performance.now() / 100) % 2 === 0) {
      // Check for merging using physics positions - only for active particles
      for (let i = 0; i < drops.length; i++) {
        if (!drops[i].active || !drops[i].visible || mergedThisFrame.has(i)) continue;
        
        // Only check nearby particles - use a spatial grid or octree for larger scenes
        for (let j = i + 1; j < drops.length; j++) {
          if (!drops[j].active || !drops[j].visible || mergedThisFrame.has(j)) continue;
          
          const posI = drops[i].physicsBody.position;
          const posJ = drops[j].physicsBody.position;
          
          const dx = posI.x - posJ.x;
          const dy = posI.y - posJ.y;
          const dz = posI.z - posJ.z;
          
          // Fast distance check (avoiding square root)
          const distanceSq = dx*dx + dy*dy + dz*dz;
          const combinedRadius = drops[i].scale.x + drops[j].scale.x;
          const radiusSq = combinedRadius * combinedRadius * 0.25; // * 0.5^2
          
          // If drops are close enough, merge them
          if (distanceSq < radiusSq) {
            // Get the volume (proportional to r³) of each drop
            const volumeI = Math.pow(drops[i].scale.x, 3);
            const volumeJ = Math.pow(drops[j].scale.x, 3);
            const totalVolume = volumeI + volumeJ;
            
            // New radius is proportional to cube root of volume
            const newScale = Math.pow(totalVolume, 1/3);
            
            // Calculate weighted position and velocity 
            const totalMass = drops[i].physicsBody.mass + drops[j].physicsBody.mass;
            const weightI = drops[i].physicsBody.mass / totalMass;
            const weightJ = drops[j].physicsBody.mass / totalMass;
            
            if (volumeI >= volumeJ) {
              // Mark this particle as merged this frame
              mergedThisFrame.add(j);
              
              // Update visual scale
              drops[i].scale.set(newScale, newScale, newScale);
              drops[i].mesh.scale.set(newScale, newScale, newScale);
              
              // Update physics body
              drops[i].physicsBody.mass = totalMass;
              
              // Update position (weighted average)
              drops[i].physicsBody.position.x = posI.x * weightI + posJ.x * weightJ;
              drops[i].physicsBody.position.y = posI.y * weightI + posJ.y * weightJ;
              drops[i].physicsBody.position.z = posI.z * weightI + posJ.z * weightJ;
              
              // Update velocity (weighted average)
              drops[i].physicsBody.velocity.x = drops[i].physicsBody.velocity.x * weightI + 
                                              drops[j].physicsBody.velocity.x * weightJ;
              drops[i].physicsBody.velocity.y = drops[i].physicsBody.velocity.y * weightI + 
                                              drops[j].physicsBody.velocity.y * weightJ;
              drops[i].physicsBody.velocity.z = drops[i].physicsBody.velocity.z * weightI + 
                                              drops[j].physicsBody.velocity.z * weightJ;
              
              // Instead of hiding - return to pool for reuse
              drops[j].active = false;
              drops[j].visible = false;
              drops[j].mesh.visible = false;
              drops[j].physicsBody.position.y = -1000; // Move far away 
              drops[j].physicsBody.sleep();
              activeCountRef.current--;
              
              // If drop gets too large, split it
              if (newScale > 2.0) {
                // Convert to multiple smaller drops
                drops[i].scale.set(1.2, 1.2, 1.2);
                drops[i].mesh.scale.set(1.2, 1.2, 1.2);
                drops[i].physicsBody.mass = Math.pow(1.2, 3);
                
                // Try to activate another particle for the split
                for (let k = 0; k < drops.length; k++) {
                  if (k !== i && !drops[k].active) {
                    // Activate the split particle
                    drops[k].active = true;
                    drops[k].visible = true;
                    drops[k].mesh.visible = true;
                    drops[k].lastActive = performance.now();
                    
                    // Set scale
                    const splitScale = 1.0;
                    drops[k].scale.set(splitScale, splitScale, splitScale);
                    drops[k].mesh.scale.set(splitScale, splitScale, splitScale);
                    drops[k].physicsBody.mass = Math.pow(splitScale, 3);
                    
                    // Position slightly offset
                    drops[k].physicsBody.position.set(
                      posI.x + (Math.random() - 0.5) * 2,
                      posI.y + Math.random() * 1,
                      posI.z + (Math.random() - 0.5) * 2
                    );
                    
                    // Give it some velocity
                    drops[k].physicsBody.velocity.set(
                      drops[i].physicsBody.velocity.x + (Math.random() - 0.5) * 2,
                      drops[i].physicsBody.velocity.y + Math.random() * 2,
                      drops[i].physicsBody.velocity.z + (Math.random() - 0.5) * 2
                    );
                    
                    drops[k].physicsBody.wakeUp();
                    activeCountRef.current++;
                    break;
                  }
                }
              }
            } else {
              // Same process when j is larger than i
              mergedThisFrame.add(i);
              
              // Update j instead of i (similar operations as above)
              drops[j].scale.set(newScale, newScale, newScale);
              drops[j].mesh.scale.set(newScale, newScale, newScale);
              drops[j].physicsBody.mass = totalMass;
              
              // Update position
              drops[j].physicsBody.position.x = posI.x * weightI + posJ.x * weightJ;
              drops[j].physicsBody.position.y = posI.y * weightI + posJ.y * weightJ;
              drops[j].physicsBody.position.z = posI.z * weightI + posJ.z * weightJ;
              
              // Update velocity
              drops[j].physicsBody.velocity.x = drops[i].physicsBody.velocity.x * weightI + 
                                             drops[j].physicsBody.velocity.x * weightJ;
              drops[j].physicsBody.velocity.y = drops[i].physicsBody.velocity.y * weightI + 
                                             drops[j].physicsBody.velocity.y * weightJ;
              drops[j].physicsBody.velocity.z = drops[i].physicsBody.velocity.z * weightI + 
                                             drops[j].physicsBody.velocity.z * weightJ;
              
              // Return i to pool
              drops[i].active = false;
              drops[i].visible = false;
              drops[i].mesh.visible = false;
              drops[i].physicsBody.position.y = -1000;
              drops[i].physicsBody.sleep();
              activeCountRef.current--;
              
              // Split if too large (same logic as above)
              if (newScale > 2.0) {
                drops[j].scale.set(1.2, 1.2, 1.2);
                drops[j].mesh.scale.set(1.2, 1.2, 1.2);
                drops[j].physicsBody.mass = Math.pow(1.2, 3);
                
                // Similar activation logic
              }
            }
          }
        }
      }
    }

    // Update shader time uniforms - only every 3rd frame for better performance
    if (Math.floor(performance.now() / 30) % 3 === 0) {
      const currentTime = performance.now() * 0.001; // Convert to seconds
      
      // Update all materials at once for instanced rendering
      // This would be even more optimized with instanced rendering
      const material = drops[0].mesh.material as THREE.ShaderMaterial;
      if (material.uniforms && material.uniforms.time) {
        material.uniforms.time.value = currentTime;
        
        // Update clones
        for (let i = 0; i < drops.length; i++) {
          if (!drops[i].active) continue;
          
          const dropMaterial = drops[i].mesh.material as THREE.ShaderMaterial;
          if (dropMaterial.uniforms && dropMaterial.uniforms.time) {
            dropMaterial.uniforms.time.value = currentTime;
          }
        }
      }
    }
  }, [isLoaded, isBendingRef, crosshairPositionRef, activateRandomParticles, deactivateDistantParticles]);

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
      // @ts-expect-error - Property cameraPosition for the player camera position
      if (window.characterPosition) {
        // @ts-expect-error - Property cameraPosition
        updatePlayerPosition(window.characterPosition);
      }
    };
    
    const interval = setInterval(updateFromCamera, 500);
    return () => clearInterval(interval);
  }, [updatePlayerPosition]);

  return null; // This is a pure logic component, no JSX needed
} 