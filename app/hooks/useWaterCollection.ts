import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ObjectPool } from '../utils/objectPool';

// Define water drop type to avoid repetition
interface WaterDrop {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  isActive: boolean;
  createdAt: number;
}

interface WaterCollectionOptions {
  maxActive?: number;
  lifespan?: number;
  attractionDistance?: number;
  attractionStrength?: number;
  collectionDistance?: number;
  maxWaterCapacity?: number;
  debug?: boolean;
}

/**
 * Hook for managing water collection with physics
 */
export function useWaterCollection(
  scene: THREE.Scene,
  options: WaterCollectionOptions = {}
) {
  // Configuration with defaults
  const {
    maxActive = 100,
    lifespan = 5000,
    attractionDistance = 5,
    attractionStrength = 10,
    collectionDistance = 1,
    maxWaterCapacity = 100,
    debug = false
  } = options;

  // State
  const [waterAmount, setWaterAmount] = useState(0);

  // References
  const waterObjectsRef = useRef<THREE.Object3D[]>([]);
  const lastScannedTimeRef = useRef<number>(0);
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  const waterPoolRef = useRef<ObjectPool<WaterDrop> | undefined>(undefined);
  const activeDropsRef = useRef<WaterDrop[]>([]);

  // Initialize physics world
  useEffect(() => {
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });

    // Add a ground plane at y=0
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0, // Static body (mass = 0)
      shape: groundShape,
    });
    // Rotate the plane to be horizontal (default is vertical)
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    physicsWorldRef.current = world;

    return () => {
      physicsWorldRef.current = null;
    };
  }, []);

  // Initialize object pool for water drops
  useEffect(() => {
    if (!scene) return;

    // Create a reusable water drop
    const createWaterDrop = () => {
      // Create mesh for water drop
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        metalness: 0.1,
        roughness: 0.2,
        transparent: true,
        opacity: 0.7
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.isWater = true; // Mark as water for identification

      // Create physics body
      const shape = new CANNON.Sphere(0.1);
      const body = new CANNON.Body({
        mass: 0.5,
        shape,
        material: new CANNON.Material({
          friction: 0.1,
          restitution: 0.6
        }),
        // Add proper collision filtering for water drops
        collisionFilterGroup: 8, // Group 8 for collectible water drops
        collisionFilterMask: 2   // Only collide with ground (Group 2)
      });

      return {
        mesh,
        body,
        isActive: false,
        createdAt: 0
      };
    };

    // Create object pool
    const resetObject = (obj: WaterDrop) => {
      obj.isActive = false;
      obj.body.position.set(0, -1000, 0); // Move far away
      obj.body.velocity.set(0, 0, 0);
      obj.body.angularVelocity.set(0, 0, 0);
      obj.mesh.visible = false;
      scene.remove(obj.mesh);
    };

    const activateObject = (obj: WaterDrop) => {
      obj.isActive = true;
      obj.createdAt = Date.now();
      obj.mesh.visible = true;
      scene.add(obj.mesh);
      
      // Add to active drops when activated
      if (!activeDropsRef.current.includes(obj)) {
        activeDropsRef.current.push(obj);
      }
    };

    const pool = new ObjectPool<WaterDrop>(
      createWaterDrop,
      resetObject,
      activateObject,
      maxActive // Important: honor the maxActive parameter
    );

    waterPoolRef.current = pool;

    // Scan for water objects initially
    findWaterObjectsInScene();

    return () => {
      // Clean up on unmount
      // Since we don't have getAll() on ObjectPool, we'll use our active drops reference
      activeDropsRef.current.forEach(obj => {
        resetObject(obj);
        if (obj.mesh.geometry) {
          obj.mesh.geometry.dispose();
        }
        if (obj.mesh.material && !Array.isArray(obj.mesh.material)) {
          obj.mesh.material.dispose();
        }
      });
      activeDropsRef.current = [];
    };
  }, [scene, maxActive]);

  // Function to find water objects in the scene
  const findWaterObjectsInScene = useCallback(() => {
    if (!scene) return;

    // Don't scan too frequently
    const now = Date.now();
    if (now - lastScannedTimeRef.current < 2000) return;
    lastScannedTimeRef.current = now;

    // Find all water objects in the scene
    const waterObjects: THREE.Object3D[] = [];

    // Recursive function to find water objects
    const findWaterObjects = (obj: THREE.Object3D) => {
      // Check if this object is water (has isWater=true in userData)
      if (obj.userData && obj.userData.isWater === true) {
        waterObjects.push(obj);
        if (debug) {
          console.log("Found water object:", obj.name || "unnamed water");
        }
      }

      // Check children recursively
      obj.children.forEach(child => {
        findWaterObjects(child);
      });
    };

    // Start with the scene
    findWaterObjects(scene);

    // Update reference
    waterObjectsRef.current = waterObjects;

    if (debug && waterObjects.length > 0) {
      console.log(`Found ${waterObjects.length} water objects in scene`);
    }

    return waterObjects;
  }, [scene, debug]);

  // Create a new water drop
  const createWaterDrop = useCallback((
    position: THREE.Vector3,
    velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  ) => {
    const world = physicsWorldRef.current;
    const pool = waterPoolRef.current;

    if (!world || !pool) return;

    // Get an object from the pool
    const waterDrop = pool.get();

    if (!waterDrop) {
      if (debug) {
        console.warn("Water drop pool exhausted, cannot create more drops");
      }
      return;
    }

    // Position the water drop
    waterDrop.mesh.position.copy(position);
    waterDrop.body.position.copy(new CANNON.Vec3(
      position.x,
      position.y,
      position.z
    ));

    // Apply velocity
    waterDrop.body.velocity.copy(new CANNON.Vec3(
      velocity.x,
      velocity.y,
      velocity.z
    ));

    // Add body to physics world if not already added
    if (!world.bodies.includes(waterDrop.body)) {
      world.addBody(waterDrop.body);
    }

    // Ensure it's active and tracked
    waterDrop.isActive = true;
    waterDrop.createdAt = Date.now();

    // Make sure it's not already in the active drops array before adding it
    if (!activeDropsRef.current.includes(waterDrop)) {
      activeDropsRef.current.push(waterDrop);

      if (debug) {
        console.log(`Created water drop at ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}. Active drops: ${activeDropsRef.current.length}`);
      }
    }

    return waterDrop;
  }, [debug]);

  // Update water drops
  const update = useCallback((
    delta: number,
    attractionPoint: THREE.Vector3 | null = null
  ) => {
    const world = physicsWorldRef.current;
    const pool = waterPoolRef.current;

    if (!world || !pool) return 0;

    // Step physics world
    world.step(Math.min(delta, 0.1));

    // Debug log to track attraction point
    if (debug && attractionPoint) {
      console.log("Update called with attraction point:",
        attractionPoint.x.toFixed(2),
        attractionPoint.y.toFixed(2),
        attractionPoint.z.toFixed(2),
        "Active drops:", activeDropsRef.current.length
      );
    }

    // Update each active water drop
    let collected = 0;
    let attractedCount = 0;
    const now = Date.now();
    const toRemove: WaterDrop[] = [];

    // Scan for water objects periodically
    if (Math.random() < 0.02) {
      findWaterObjectsInScene();
    }

    // Update all drops in the pool
    activeDropsRef.current.forEach(drop => {
      // Check if the drop has expired
      if (now - drop.createdAt > lifespan) {
        toRemove.push(drop);
        return;
      }

      // Update mesh position from physics body
      drop.mesh.position.copy(new THREE.Vector3(
        drop.body.position.x,
        drop.body.position.y,
        drop.body.position.z
      ));

      drop.mesh.quaternion.copy(new THREE.Quaternion(
        drop.body.quaternion.x,
        drop.body.quaternion.y,
        drop.body.quaternion.z,
        drop.body.quaternion.w
      ));

      // If there's an attraction point, attract drops towards it
      if (attractionPoint) {
        const distanceToAttractionPoint = drop.mesh.position.distanceTo(attractionPoint);

        // Apply attraction force if within attraction distance
        if (distanceToAttractionPoint < attractionDistance) {
          // Create a direction vector pointing from drop to attraction point
          const directionVector = new CANNON.Vec3(
            attractionPoint.x - drop.body.position.x,
            attractionPoint.y - drop.body.position.y,
            attractionPoint.z - drop.body.position.z
          );
          // Normalize it
          directionVector.normalize();

          // Calculate force based on distance - exponential scaling for stronger pull when closer
          const distanceRatio = distanceToAttractionPoint / attractionDistance;
          // Exponential curve: stronger when closer (1-distance)^2
          const forceMagnitude =
            attractionStrength * Math.pow(1 - distanceRatio, 2);

          // Apply force in the direction of attraction
          const force = new CANNON.Vec3(
            directionVector.x * forceMagnitude,
            directionVector.y * forceMagnitude,
            directionVector.z * forceMagnitude
          );

          // Apply a velocity dampening factor when close to make precise collection easier
          if (distanceToAttractionPoint < attractionDistance * 0.4) {
            // Slow down the drop as it gets closer to the attraction point
            const dampingFactor = 0.8;
            drop.body.velocity.x *= dampingFactor;
            drop.body.velocity.z *= dampingFactor;
          }

          drop.body.applyForce(force);
          attractedCount++;

          // Collect water drop if close enough
          if (distanceToAttractionPoint < collectionDistance) {
            collected++;
            toRemove.push(drop);

            if (debug) {
              console.log("Collected water drop - distance:", distanceToAttractionPoint.toFixed(2));
            }
          }
        }
      }
    });

    // Log attracted drops count for debugging
    if (debug && attractionPoint && attractedCount > 0) {
      console.log(`Attracted ${attractedCount} drops, collected ${collected}`);
    }

    // Remove dropped items
    toRemove.forEach(drop => {
      // Remove from active list
      const index = activeDropsRef.current.indexOf(drop);
      if (index !== -1) {
        activeDropsRef.current.splice(index, 1);
      }
      // Return to pool
      pool.release(drop);
    });

    // Update water amount if collected any
    if (collected > 0) {
      if (debug) {
        console.log(`Collected ${collected} water drops, increasing amount from ${waterAmount} to ${Math.min(waterAmount + collected, maxWaterCapacity)}`);
      }
      setWaterAmount(prev => {
        const newAmount = Math.min(prev + collected, maxWaterCapacity);
        if (debug) {
          console.log(`Water amount updated to ${newAmount}`);
        }
        return newAmount;
      });
    }

    return collected;
  }, [
    attractionDistance,
    attractionStrength,
    collectionDistance,
    lifespan,
    findWaterObjectsInScene,
    debug,
    waterAmount,
    maxWaterCapacity
  ]);

  // Set water amount explicitly
  const setExplicitWaterAmount = useCallback((amount: number) => {
    setWaterAmount(amount);
  }, []);

  // Create water drops from a water source
  const createWaterDropsFromSource = useCallback((
    source: THREE.Object3D,
    count: number = 1
  ) => {
    if (!source) return;

    // Get position of the water source
    const position = new THREE.Vector3();
    source.getWorldPosition(position);

    // Create water drops
    for (let i = 0; i < count; i++) {
      // Add some randomness to position
      const dropPosition = position.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random()) * 0.2,
          (Math.random() - 0.5) * 0.5
        )
      );

      // Random velocity, mainly downward
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        -2 - Math.random() * 2,
        (Math.random() - 0.5) * 2
      );

      createWaterDrop(dropPosition, velocity);
    }
  }, [createWaterDrop]);

  // Remove a specific water drop
  const removeWaterDrop = useCallback((drop: WaterDrop) => {
    const pool = waterPoolRef.current;
    if (!pool || !drop) return;

    // Remove from active list
    const index = activeDropsRef.current.indexOf(drop);
    if (index !== -1) {
      activeDropsRef.current.splice(index, 1);
    }

    pool.release(drop);
  }, []);

  // Clear all active water drops
  const clear = useCallback(() => {
    const pool = waterPoolRef.current;
    if (!pool) return;

    // Clear all active drops
    [...activeDropsRef.current].forEach(drop => {
      pool.release(drop);
    });
    activeDropsRef.current = [];
  }, []);

  // Return the hook API
  return {
    createWaterDrop,
    update,
    clear,
    removeWaterDrop,
    createWaterDropsFromSource,
    setWaterAmount: setExplicitWaterAmount,
    getWaterAmount: () => waterAmount,
    getWaterObjects: () => waterObjectsRef.current,
  };
}