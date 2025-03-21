import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WaterDrop } from '../components/water/WaterParticleTypes';

/**
 * Activate random particles from the pool
 */
export function activateRandomParticles(
  drops: WaterDrop[], 
  count: number,
  playerPos: THREE.Vector3,
  activeCount: number,
  onActivate: (newCount: number) => void
): void {
  const worldSize = 300; // Smaller active area
  
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
  
  // Update active count
  onActivate(activeCount + activated);
}

/**
 * Deactivate particles that are too far from the player
 */
export function deactivateDistantParticles(
  drops: WaterDrop[], 
  maxDistance: number, 
  playerPos: THREE.Vector3,
  onDeactivate: () => void
): void {
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
      onDeactivate();
    }
  }
} 