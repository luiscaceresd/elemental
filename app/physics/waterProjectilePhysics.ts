import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Global physics world for water projectiles
let physicsWorld: CANNON.World | null = null;

/**
 * Initialize the physics world for water projectiles
 */
export function initWaterPhysics(): CANNON.World {
  // Create a new physics world if it doesn't exist
  if (!physicsWorld) {
    physicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0) // Earth gravity
    });
    
    // Set solver iterations for more stable physics
    physicsWorld.solver.iterations = 10;
    
    // Allow bodies to sleep when at rest (performance optimization)
    physicsWorld.allowSleep = true;
    
    // Use SAPBroadphase for better performance with many objects
    physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  }
  
  return physicsWorld;
}

/**
 * Get the physics world, initializing it if needed
 */
export function getPhysicsWorld(): CANNON.World {
  if (!physicsWorld) {
    return initWaterPhysics();
  }
  return physicsWorld;
}

/**
 * Create a physics body for a water spear
 */
export function createWaterSpearBody(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  length: number = 2.5,
  radius: number = 0.12
): CANNON.Body {
  const world = getPhysicsWorld();
  
  // Create cylinder shape
  const shape = new CANNON.Cylinder(radius, radius, length, 8);
  
  // Create physics material
  const waterMaterial = new CANNON.Material('water');
  
  // Create body
  const body = new CANNON.Body({
    mass: 1, // Mass in kg
    position: new CANNON.Vec3(position.x, position.y, position.z),
    shape: shape,
    material: waterMaterial
  });
  
  // Set initial velocity based on direction
  const speed = 15; // Speed in m/s
  body.velocity.set(
    direction.x * speed,
    direction.y * speed,
    direction.z * speed
  );
  
  // Rotate body to align with direction
  const yAxis = new CANNON.Vec3(0, 1, 0);
  const zAxis = new CANNON.Vec3(0, 0, 1);
  
  // Convert direction to CANNON Vec3
  const dirVec = new CANNON.Vec3(direction.x, direction.y, direction.z);
  
  if (dirVec.length() > 0) {
    const angle = Math.atan2(dirVec.z, dirVec.x);
    const quaternion = new CANNON.Quaternion();
    quaternion.setFromAxisAngle(yAxis, angle - Math.PI / 2);
    body.quaternion = quaternion;
  }
  
  // Add body to world
  world.addBody(body);
  
  return body;
}

/**
 * Create a physics body for a water drop
 */
export function createWaterDropBody(
  position: THREE.Vector3,
  velocity?: THREE.Vector3,
  radius: number = 0.1
): CANNON.Body {
  const world = getPhysicsWorld();
  
  // Create sphere shape
  const shape = new CANNON.Sphere(radius);
  
  // Create physics material
  const waterMaterial = new CANNON.Material('water');
  
  // Create body
  const body = new CANNON.Body({
    mass: 0.5, // Mass in kg
    position: new CANNON.Vec3(position.x, position.y, position.z),
    shape: shape,
    material: waterMaterial
  });
  
  // Set initial velocity if provided
  if (velocity) {
    body.velocity.set(velocity.x, velocity.y, velocity.z);
  }
  
  // Add body to world
  world.addBody(body);
  
  return body;
}

/**
 * Update the physics world
 */
export function updateWaterPhysics(deltaTime: number): void {
  if (physicsWorld) {
    physicsWorld.step(deltaTime);
  }
}

/**
 * Remove a body from the physics world
 */
export function removeBodyFromWorld(body: CANNON.Body): void {
  if (physicsWorld) {
    physicsWorld.removeBody(body);
  }
}

/**
 * Clean up the physics world
 */
export function cleanupWaterPhysics(): void {
  if (physicsWorld) {
    // Remove all bodies
    while (physicsWorld.bodies.length > 0) {
      physicsWorld.removeBody(physicsWorld.bodies[0]);
    }
    
    // Reset world
    physicsWorld = null;
  }
}

/**
 * Check if a body is colliding with terrain
 */
export function checkTerrainCollision(
  body: { position: { x: number, y: number, z: number } },
  terrainHeightFn?: (x: number, z: number) => number
): boolean {
  if (!terrainHeightFn) return false;
  
  const terrainHeight = terrainHeightFn(body.position.x, body.position.z);
  return body.position.y <= terrainHeight;
}

/**
 * Apply an attraction force to a body towards a target position
 */
export function applyAttractionForce(
  body: CANNON.Body,
  targetPosition: THREE.Vector3,
  strength: number = 10,
  maxDistance: number = 10
): void {
  // Calculate distance vector
  const bodyPos = body.position;
  const distanceVector = new CANNON.Vec3(
    targetPosition.x - bodyPos.x,
    targetPosition.y - bodyPos.y,
    targetPosition.z - bodyPos.z
  );
  
  const distance = distanceVector.length();
  
  // Apply force if within range
  if (distance > 0 && distance < maxDistance) {
    // Normalize and scale by strength and inverse distance
    distanceVector.normalize();
    const forceMagnitude = strength * (1 - distance / maxDistance);
    distanceVector.scale(forceMagnitude, distanceVector);
    
    // Apply force to center of body
    body.applyForce(distanceVector, bodyPos);
  }
} 