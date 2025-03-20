import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { removeBodyFromWorld } from '../physics/waterProjectilePhysics';

/**
 * A generic object pool for reusing objects to improve performance
 * by reducing garbage collection overhead.
 */
export class ObjectPool<T> {
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private disposeFn: ((obj: T) => void) | null;
  private objects: T[] = [];
  private active: Set<T> = new Set();
  private available: T[] = [];
  private maxSize: number;
  
  /**
   * Creates a new object pool
   * 
   * @param createFn Function to create a new object
   * @param resetFn Function to reset an object before reuse
   * @param disposeFn Optional function to dispose objects
   * @param initialSize Number of objects to pre-create
   * @param maxSize Maximum size of the pool
   */
  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    disposeFn: ((obj: T) => void) | null = null,
    initialSize = 0,
    maxSize = Infinity
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.disposeFn = disposeFn;
    this.maxSize = maxSize;
    
    // Create initial objects
    for (let i = 0; i < initialSize; i++) {
      const obj = this.createFn();
      this.objects.push(obj);
      this.available.push(obj);
    }
  }
  
  /**
   * Gets an object from the pool or creates a new one
   * @returns A new or recycled object
   */
  get(): T {
    let object: T;
    
    if (this.available.length > 0) {
      // Reuse an available object
      object = this.available.pop()!;
    } else if (this.objects.length < this.maxSize) {
      // Create new object if under limit
      object = this.createFn();
      this.objects.push(object);
    } else {
      // Pool is at max capacity, reuse the oldest active object
      console.warn('ObjectPool: Maximum size reached, reusing oldest object');
      
      if (this.active.size > 0) {
        // Find and release the first active object
        object = this.active.values().next().value;
        this.release(object);
        object = this.available.pop()!; // Get the object we just released
      } else {
        // Fallback: create new object (should not happen)
        object = this.createFn();
        this.objects.push(object);
      }
    }
    
    // Reset the object before use
    this.resetFn(object);
    this.active.add(object);
    return object;
  }
  
  /**
   * Releases an object back to the pool
   * @param object The object to release
   */
  release(object: T): void {
    if (this.active.has(object)) {
      this.active.delete(object);
      this.resetFn(object); // Reset on release
      this.available.push(object);
    }
  }
  
  /**
   * Clears the pool, optionally disposing all objects
   */
  clear(): void {
    // Dispose all objects if a dispose function was provided
    if (this.disposeFn) {
      for (const obj of this.objects) {
        this.disposeFn(obj);
      }
    }
    
    this.objects = [];
    this.active.clear();
    this.available = [];
  }
  
  /**
   * Gets the total number of objects in the pool
   */
  size(): number {
    return this.objects.length;
  }
  
  /**
   * Gets the number of currently active objects
   */
  activeCount(): number {
    return this.active.size;
  }
}

/**
 * Creates a pool for water spear meshes
 */
export function createWaterSpearMeshPool(maxSize = 50): {
  get: () => THREE.Mesh,
  release: (mesh: THREE.Mesh) => void,
  clear: () => void
} {
  // Create shared geometry and material
  const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1
  });

  // Array of meshes
  const meshes: THREE.Mesh[] = [];
  const activeMeshes = new Set<THREE.Mesh>();

  return {
    get: () => {
      let mesh: THREE.Mesh;

      if (meshes.length < maxSize) {
        // Create a new mesh
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes.push(mesh);
      } else {
        // Reuse an existing mesh
        mesh = meshes[Math.floor(Math.random() * meshes.length)];
      }

      activeMeshes.add(mesh);
      return mesh;
    },
    release: (mesh: THREE.Mesh) => {
      activeMeshes.delete(mesh);
    },
    clear: () => {
      // Dispose resources
      geometry.dispose();
      material.dispose();
      meshes.length = 0;
      activeMeshes.clear();
    }
  };
}

/**
 * Creates a pool for water drop meshes
 */
export function createWaterDropMeshPool(maxSize = 100): {
  get: () => THREE.Mesh,
  release: (mesh: THREE.Mesh) => void,
  clear: () => void
} {
  // Create shared geometry and material for better performance
  const geometry = new THREE.SphereGeometry(0.1, 8, 8);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1
  });

  // Array of meshes
  const meshes: THREE.Mesh[] = [];
  const activeMeshes = new Set<THREE.Mesh>();

  return {
    get: () => {
      let mesh: THREE.Mesh;

      if (meshes.length < maxSize) {
        // Create a new mesh
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes.push(mesh);
      } else {
        // Reuse an existing mesh
        mesh = meshes[Math.floor(Math.random() * meshes.length)];
      }

      activeMeshes.add(mesh);
      return mesh;
    },
    release: (mesh: THREE.Mesh) => {
      activeMeshes.delete(mesh);
    },
    clear: () => {
      // Dispose resources
      geometry.dispose();
      material.dispose();
      meshes.length = 0;
      activeMeshes.clear();
    }
  };
}

/**
 * Type for a physics object containing both mesh and body
 */
export type PhysicsObject = {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  createdAt: number;
};

/**
 * Creates a pool for physics objects (mesh + body pairs)
 */
export function createPhysicsObjectPool(
  meshCreateFn: () => THREE.Mesh,
  bodyCreateFn: () => CANNON.Body,
  maxSize = 50
) {
  return new ObjectPool<PhysicsObject>(
    // Create function
    () => ({
      mesh: meshCreateFn(),
      body: bodyCreateFn(),
      createdAt: Date.now()
    }),
    // Reset function
    (obj) => {
      obj.mesh.visible = false;
      obj.createdAt = Date.now();
    },
    // Dispose function
    (obj) => {
      obj.mesh.geometry.dispose();
      if (Array.isArray(obj.mesh.material)) {
        obj.mesh.material.forEach(m => m.dispose());
      } else {
        obj.mesh.material.dispose();
      }
    },
    // Initial size
    0,
    // Max size
    maxSize
  );
} 