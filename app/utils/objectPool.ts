import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { removeBodyFromWorld } from '../physics/waterProjectilePhysics';

/**
 * A generic object pool for reusing objects to improve performance
 * by reducing garbage collection overhead.
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private active: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private disposeFn?: (obj: T) => void;
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
    disposeFn?: (obj: T) => void,
    initialSize = 0,
    maxSize = 1000
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.disposeFn = disposeFn;
    this.maxSize = maxSize;
    
    // Pre-create initial objects if specified
    for (let i = 0; i < initialSize; i++) {
      this.available.push(this.createFn());
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
    } else if (this.active.length >= this.maxSize) {
      // We've hit max size, reuse the oldest active object
      console.warn('Object pool reached maximum size. Reusing oldest object.');
      object = this.active.shift()!;
      this.resetFn(object);
    } else {
      // Create a new object
      object = this.createFn();
    }
    
    // Reset the object before use
    this.resetFn(object);
    
    // Add to active list
    this.active.push(object);
    return object;
  }
  
  /**
   * Releases an object back to the pool
   * @param object The object to release
   */
  release(object: T): void {
    const index = this.active.indexOf(object);
    if (index !== -1) {
      this.active.splice(index, 1);
      this.resetFn(object);
      this.available.push(object);
    }
  }
  
  /**
   * Clears the pool, optionally disposing all objects
   */
  clear(): void {
    if (this.disposeFn) {
      // Dispose all objects
      [...this.active, ...this.available].forEach(this.disposeFn);
    }
    
    this.active = [];
    this.available = [];
  }
  
  /**
   * Gets the total number of objects in the pool
   */
  size(): number {
    return this.active.length + this.available.length;
  }
  
  /**
   * Gets the number of currently active objects
   */
  activeCount(): number {
    return this.active.length;
  }
}

/**
 * Creates a pool for water spear meshes
 */
export function createWaterSpearMeshPool(maxSize = 50) {
  return new ObjectPool<THREE.Mesh>(
    // Create function
    () => {
      const geometry = new THREE.CylinderGeometry(0.12, 0.08, 2.5, 8);
      const material = new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.8,
        emissive: 0x003366,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(geometry, material);
      return mesh;
    },
    // Reset function
    (mesh) => {
      mesh.visible = false;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
    },
    // Dispose function
    (mesh) => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    },
    // Initial size
    0,
    // Max size
    maxSize
  );
}

/**
 * Creates a pool for water drop meshes
 */
export function createWaterDropMeshPool(maxSize = 100) {
  return new ObjectPool<THREE.Mesh>(
    // Create function
    () => {
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.7,
        emissive: 0x003366,
        emissiveIntensity: 0.3
      });
      const mesh = new THREE.Mesh(geometry, material);
      return mesh;
    },
    // Reset function
    (mesh) => {
      mesh.visible = false;
      mesh.position.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
    },
    // Dispose function
    (mesh) => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    },
    // Initial size
    0,
    // Max size
    maxSize
  );
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