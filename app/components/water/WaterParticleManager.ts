import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WaterDrop } from './WaterParticleTypes';

/**
 * Class that handles the merging logic for water particles
 */
export class WaterParticleManager {
  /**
   * Process merging of water particles that are close to each other
   */
  public processMergingParticles(
    drops: WaterDrop[],
    activeCountRef: { current: number }
  ): void {
    // Process merging less frequently (every other frame)
    if (Math.floor(performance.now() / 100) % 2 !== 0) {
      return;
    }

    // Track merged particles in this frame
    const mergedThisFrame = new Set<number>();

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
} 