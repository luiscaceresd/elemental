import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WaterDrop } from './WaterParticleTypes';

/**
 * Class that handles the merging logic for water particles
 */
export class WaterParticleManager {
  private static instance: WaterParticleManager;
  private physicsWorld: CANNON.World | null = null;

  /**
   * Get the singleton instance
   */
  public static getInstance(): WaterParticleManager {
    if (!WaterParticleManager.instance) {
      WaterParticleManager.instance = new WaterParticleManager();
    }
    return WaterParticleManager.instance;
  }

  /**
   * Initialize physics world for water particles
   */
  public initPhysicsWorld(): CANNON.World {
    if (this.physicsWorld) return this.physicsWorld;

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
    
    this.physicsWorld = world;
    return world;
  }

  /**
   * Activate particles in a specific area (e.g., pond)
   */
  public activateParticlesInArea(
    drops: WaterDrop[],
    center: THREE.Vector3,
    radius: number,
    count: number,
    activeCountRef: { current: number }
  ): number {
    // Find inactive drops to activate
    const inactiveDrops = drops.filter(drop => !drop.active);
    const toActivate = Math.min(count, inactiveDrops.length);
    let activated = 0;

    for (let i = 0; i < toActivate; i++) {
      const drop = inactiveDrops[i];
      
      // Random position within the circle
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const x = center.x + Math.cos(angle) * distance;
      const z = center.z + Math.sin(angle) * distance;
      const y = center.y + 0.5; // Slightly above ground
      
      // Position the drop
      drop.physicsBody.position.set(x, y, z);
      drop.physicsBody.velocity.set(
        (Math.random() - 0.5) * 1,
        Math.random() * 1,
        (Math.random() - 0.5) * 1
      );
      
      // Activate the drop
      drop.active = true;
      drop.visible = true;
      drop.mesh.visible = true;
      drop.lastActive = performance.now();
      drop.physicsBody.wakeUp();
      
      activated++;
      activeCountRef.current++;
    }
    
    return activated;
  }

  /**
   * Process merging of water particles that are close to each other
   */
  public processMergingParticles(
    drops: WaterDrop[],
    activeCountRef: { current: number },
    isBending: boolean = false
  ): void {
    // Process merging less frequently (every other frame)
    if (Math.floor(performance.now() / 100) % 2 !== 0) {
      return;
    }

    // Track merged particles in this frame
    const mergedThisFrame = new Set<number>();

    // Modified merge radius factor if bending water
    const mergeRadiusFactor = isBending ? 0.5 : 0.25;

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
        const radiusSq = combinedRadius * combinedRadius * mergeRadiusFactor;
        
        // If drops are close enough, merge them
        if (distanceSq < radiusSq) {
          this.mergeTwoDrops(drops, i, j, mergedThisFrame, activeCountRef);
        }
      }
    }
  }

  /**
   * Merge two water drops together
   */
  private mergeTwoDrops(
    drops: WaterDrop[],
    i: number,
    j: number,
    mergedThisFrame: Set<number>,
    activeCountRef: { current: number }
  ): void {
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
    
    const posI = drops[i].physicsBody.position;
    const posJ = drops[j].physicsBody.position;

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
        this.splitLargeDrop(drops, i, activeCountRef);
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
      
      // Split if too large
      if (newScale > 2.0) {
        this.splitLargeDrop(drops, j, activeCountRef);
      }
    }
  }

  /**
   * Split a large water drop into smaller ones
   */
  private splitLargeDrop(
    drops: WaterDrop[],
    index: number,
    activeCountRef: { current: number }
  ): void {
    // Convert to multiple smaller drops
    drops[index].scale.set(1.2, 1.2, 1.2);
    drops[index].mesh.scale.set(1.2, 1.2, 1.2);
    drops[index].physicsBody.mass = Math.pow(1.2, 3);
    
    const posI = drops[index].physicsBody.position;
    
    // Try to activate another particle for the split
    for (let k = 0; k < drops.length; k++) {
      if (k !== index && !drops[k].active) {
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
          drops[index].physicsBody.velocity.x + (Math.random() - 0.5) * 2,
          drops[index].physicsBody.velocity.y + Math.random() * 2,
          drops[index].physicsBody.velocity.z + (Math.random() - 0.5) * 2
        );
        
        drops[k].physicsBody.wakeUp();
        activeCountRef.current++;
        break;
      }
    }
  }

  /**
   * Update the shader time uniforms for all water drops
   */
  public updateShaderUniforms(drops: WaterDrop[]): void {
    // Update shader time uniforms - only every 3rd frame for better performance
    if (Math.floor(performance.now() / 30) % 3 !== 0) {
      return;
    }

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

  /**
   * Create method to add to the window interface for creating particles at specific locations
   * This is used by projectiles when they impact surfaces
   */
  public createParticlesAtLocation(
    position: THREE.Vector3,
    radius: number,
    count: number
  ): void {
    if (typeof window !== 'undefined' && window.waterBendingSystem?.createWaterDrop) {
      for (let i = 0; i < count; i++) {
        // Random position within specified radius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        const x = position.x + Math.cos(angle) * distance;
        const z = position.z + Math.sin(angle) * distance;
        const y = position.y + 0.5 + Math.random() * 0.5;
        
        // Create position and velocity vectors
        const particlePos = new THREE.Vector3(x, y, z);
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          2 + Math.random() * 3, // Upward velocity for fountain effect
          (Math.random() - 0.5) * 3
        );
        
        // Create water drop
        window.waterBendingSystem.createWaterDrop(particlePos, velocity);
      }
    }
  }
} 