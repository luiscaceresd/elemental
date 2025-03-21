import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Physics world for water simulation
let physicsWorld: CANNON.World | null = null;
const physicsBodies: CANNON.Body[] = [];

// Constants
const GRAVITY = -9.82;
const DEFAULT_MASS = 0.1;
const DEFAULT_RADIUS = 0.1;
const DEFAULT_RESTITUTION = 0.3;
const DEFAULT_FRICTION = 0.1;
const DEFAULT_DAMPING = 0.7;
const PHYSICS_UPDATE_FREQUENCY = 1 / 60; // 60 Hz

/**
 * Initialize physics world with water-specific settings
 */
export function initWaterPhysics(): CANNON.World {
  // Create world if it doesn't exist
  if (!physicsWorld) {
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, GRAVITY, 0);
    
    // Configure solver iterations
    physicsWorld.solver.iterations = 10;
    
    // Set up collision detection
    physicsWorld.broadphase = new CANNON.NaiveBroadphase();
    physicsWorld.allowSleep = true;
    
    // Create ground plane for water drops to collide with
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0, // Static body
      shape: groundShape,
      collisionFilterGroup: 2, // Group 2 for ground
      collisionFilterMask: 1 | 4  // Collide with player (Group 1) and drops (Group 4)
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Make it horizontal
    physicsWorld.addBody(groundBody);
  }
  
  return physicsWorld;
}

/**
 * Clean up physics simulation
 */
export function cleanupWaterPhysics(): void {
  if (!physicsWorld) return;
  
  // Remove all bodies
  while (physicsBodies.length > 0) {
    const body = physicsBodies.pop();
    if (body) {
      physicsWorld.removeBody(body);
    }
  }
  
  physicsWorld = null;
}

/**
 * Update physics world
 */
export function updateWaterPhysics(delta: number): void {
  if (!physicsWorld) return;
  
  // Step the physics simulation with fixed timestep
  const maxSubSteps = 3;
  physicsWorld.step(PHYSICS_UPDATE_FREQUENCY, delta, maxSubSteps);
}

/**
 * Create a physics body for a water drop
 */
export function createWaterDropBody(
  position: THREE.Vector3,
  velocity?: THREE.Vector3
): CANNON.Body {
  // Ensure physics world is initialized
  if (!physicsWorld) {
    initWaterPhysics();
  }
  
  // Create spherical body
  const shape = new CANNON.Sphere(DEFAULT_RADIUS);
  const body = new CANNON.Body({
    mass: DEFAULT_MASS,
    shape,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    linearDamping: DEFAULT_DAMPING,
    angularDamping: DEFAULT_DAMPING,
    collisionFilterGroup: 4, // Group 4 for water drops
    collisionFilterMask: 2    // Collide only with ground (Group 2)
  });
  
  // Set material properties
  body.material = new CANNON.Material('water');
  body.material.friction = DEFAULT_FRICTION;
  body.material.restitution = DEFAULT_RESTITUTION;
  
  // Set initial velocity if provided
  if (velocity) {
    body.velocity.set(velocity.x, velocity.y, velocity.z);
  }
  
  // Add body to world
  if (physicsWorld) {
    physicsWorld.addBody(body);
    physicsBodies.push(body);
  }
  
  return body;
}

/**
 * Create a physics body for a water spear
 */
export function createWaterSpearBody(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  length = 1,
  radius = 0.1,
  speed = 20
): CANNON.Body {
  // Ensure physics world is initialized
  if (!physicsWorld) {
    initWaterPhysics();
  }
  
  // Create cylindrical body
  const shape = new CANNON.Cylinder(radius, radius, length, 8);
  const body = new CANNON.Body({
    mass: DEFAULT_MASS * 2, // Heavier than drops
    shape,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    linearDamping: DEFAULT_DAMPING * 0.5 // Less dampened than drops
  });
  
  // Rotate cylinder to align with direction
  const quat = new CANNON.Quaternion();
  const upVector = new CANNON.Vec3(0, 1, 0);
  const directionVec = new CANNON.Vec3(direction.x, direction.y, direction.z);
  
  // First normalize the direction
  directionVec.normalize();
  
  // Calculate rotation from up vector to direction
  if (Math.abs(directionVec.dot(upVector) - 1) > 0.001) {
    // If not parallel to up vector, compute rotation
    const crossProduct = new CANNON.Vec3();
    crossProduct.copy(upVector);
    crossProduct.cross(directionVec);
    
    if (crossProduct.length() > 0.001) {
      crossProduct.normalize();
      const angle = Math.acos(upVector.dot(directionVec));
      quat.setFromAxisAngle(crossProduct, angle);
      body.quaternion.copy(quat);
    }
  }
  
  // Set velocity along direction
  const velocity = new CANNON.Vec3(
    direction.x * speed,
    direction.y * speed,
    direction.z * speed
  );
  body.velocity.copy(velocity);
  
  // Set material properties
  body.material = new CANNON.Material('water');
  body.material.friction = DEFAULT_FRICTION;
  body.material.restitution = DEFAULT_RESTITUTION;
  
  // Add body to world
  if (physicsWorld) {
    physicsWorld.addBody(body);
    physicsBodies.push(body);
  }
  
  return body;
}

/**
 * Apply attraction force to a body
 */
export function applyAttractionForce(
  body: CANNON.Body,
  attractionPoint: THREE.Vector3,
  strength: number,
  maxDistance: number
): void {
  // Calculate direction to attraction point
  const direction = new CANNON.Vec3(
    attractionPoint.x - body.position.x,
    attractionPoint.y - body.position.y,
    attractionPoint.z - body.position.z
  );
  
  const distance = direction.length();
  
  // Only apply force if within range
  if (distance <= maxDistance && distance > 0) {
    // Normalize direction vector
    direction.normalize();
    
    // Calculate force strength (stronger when closer)
    const forceMagnitude = strength * (1 - distance / maxDistance);
    
    // Create force vector
    direction.scale(forceMagnitude, direction);
    
    // Apply force at center of mass
    body.applyForce(direction, body.position);
  }
}

/**
 * Remove a body from the physics world
 */
export function removeBodyFromWorld(body: CANNON.Body): void {
  if (!physicsWorld) return;
  
  // Remove from world
  physicsWorld.removeBody(body);
  
  // Remove from tracked bodies
  const index = physicsBodies.indexOf(body);
  if (index !== -1) {
    physicsBodies.splice(index, 1);
  }
}

/**
 * Check collision with terrain
 */
export function checkTerrainCollision(
  body: CANNON.Body,
  terrainHeightFn?: (x: number, z: number) => number
): boolean {
  if (!terrainHeightFn) return false;
  
  // Get terrain height at body position
  const terrainHeight = terrainHeightFn(body.position.x, body.position.z);
  
  // Check if body is below terrain
  if (body.position.y - DEFAULT_RADIUS < terrainHeight) {
    // Adjust position to be on terrain
    body.position.y = terrainHeight + DEFAULT_RADIUS;
    
    // Reset vertical velocity with some damping
    body.velocity.y = Math.max(0, body.velocity.y * -DEFAULT_RESTITUTION);
    
    return true;
  }
  
  return false;
} 