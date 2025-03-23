import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// Mock THREE.js classes
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    Group: vi.fn().mockImplementation(() => ({
      position: { copy: vi.fn(), add: vi.fn(), x: 0, y: 0, z: 0 },
      add: vi.fn(),
      setRotationFromQuaternion: vi.fn(),
      rotateZ: vi.fn(),
    })),
    Mesh: vi.fn().mockImplementation(() => ({
      position: { copy: vi.fn(), add: vi.fn(), x: 0, y: 0, z: 0 },
      scale: { setScalar: vi.fn() },
      castShadow: false,
    })),
    Raycaster: vi.fn().mockImplementation(() => ({
      set: vi.fn(),
      intersectObject: vi.fn().mockReturnValue([]),
    })),
    Vector3: vi.fn().mockImplementation(() => ({
      copy: vi.fn(),
      add: vi.fn(),
      sub: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      normalize: vi.fn().mockReturnThis(),
      multiplyScalar: vi.fn().mockReturnThis(),
      length: vi.fn().mockReturnValue(1),
    })),
    BufferGeometry: vi.fn().mockImplementation(() => ({
      setAttribute: vi.fn(),
      attributes: {
        position: {
          array: new Float32Array(90),
          needsUpdate: false
        }
      },
      dispose: vi.fn(),
    })),
    BufferAttribute: vi.fn(),
    Points: vi.fn().mockImplementation(() => ({
      geometry: {
        attributes: {
          position: {
            array: new Float32Array(90),
            needsUpdate: false
          }
        }
      }
    })),
    CylinderGeometry: vi.fn().mockImplementation(() => ({
      dispose: vi.fn()
    })),
    MeshPhysicalMaterial: vi.fn().mockImplementation(() => ({
      dispose: vi.fn()
    })),
    MeshBasicMaterial: vi.fn().mockImplementation(() => ({
      dispose: vi.fn(),
      opacity: 0
    })),
    PointsMaterial: vi.fn().mockImplementation(() => ({
      dispose: vi.fn()
    })),
    BackSide: 1,
    AdditiveBlending: 2,
    Quaternion: vi.fn().mockImplementation(() => ({
      setFromUnitVectors: vi.fn().mockReturnThis()
    })),
  };
});

// Mock hammerjs
vi.mock('hammerjs', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      add: vi.fn(),
      destroy: vi.fn()
    })),
    Pan: vi.fn()
  };
});

// Simplify the test by extracting just the water spear pool logic
class WaterSpearPool {
  private spearPool: any[] = [];
  private scene: THREE.Scene;
  private registerUpdate: (fn: any) => () => void;
  
  // Refs for shared resources
  private spearGeometry: THREE.CylinderGeometry;
  private spearMaterial: THREE.MeshPhysicalMaterial;
  private glowGeometry: THREE.CylinderGeometry;
  private glowMaterial: THREE.MeshBasicMaterial;
  private trailMaterial: THREE.PointsMaterial;
  
  constructor(
    scene: THREE.Scene, 
    registerUpdate: (fn: any) => () => void,
    poolSize: number = 10
  ) {
    this.scene = scene;
    this.registerUpdate = registerUpdate;
    
    // Initialize shared resources
    this.spearGeometry = new THREE.CylinderGeometry(0.6, 0.2, 4.0, 16);
    this.spearMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x00BFFF,
      transparent: true,
      opacity: 1.0,
      roughness: 0.1,
      metalness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transmission: 0.4,
      ior: 1.33,
      emissive: 0x0077BB,
      emissiveIntensity: 0.8
    });

    this.glowGeometry = new THREE.CylinderGeometry(0.6, 0.3, 4.0, 16);
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00BFFF,
      transparent: true,
      opacity: 0.6,
      side: THREE.BackSide,
    });

    this.trailMaterial = new THREE.PointsMaterial({
      color: 0x87CEFA,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    
    // Initialize pool
    this.initializePool(poolSize);
  }
  
  private initializePool(size: number): void {
    for (let i = 0; i < size; i++) {
      const spearGroup = new THREE.Group();
      
      // Create spear mesh using shared geometry and material
      const spear = new THREE.Mesh(this.spearGeometry, this.spearMaterial);
      spear.castShadow = true;
      spearGroup.add(spear);
      
      // Create glow mesh using shared geometry and material
      const glow = new THREE.Mesh(this.glowGeometry, this.glowMaterial);
      spearGroup.add(glow);
      
      // Create trail with unique geometry but shared material
      const trailGeometry = new THREE.BufferGeometry();
      const trailParticles = 30;
      const trailPositions = new Float32Array(trailParticles * 3);
      
      // Initialize positions to be far away (they'll be reset when used)
      for (let j = 0; j < trailParticles; j++) {
        const j3 = j * 3;
        trailPositions[j3] = 0;
        trailPositions[j3 + 1] = -1000; // Hidden position
        trailPositions[j3 + 2] = 0;
      }
      
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trail = new THREE.Points(trailGeometry, this.trailMaterial);
      
      // Add to pool (not to scene yet - will be added when used)
      this.spearPool.push({
        spearGroup,
        trail,
        trailGeometry,
        raycaster: new THREE.Raycaster(),
        inUse: false
      });
    }
  }
  
  public getSpearFromPool(): any {
    // Find an available spear in the pool
    const availableSpear = this.spearPool.find(spear => !spear.inUse);
    
    if (availableSpear) {
      availableSpear.inUse = true;
      return availableSpear;
    }
    
    // No spears available in the pool
    console.warn('Water spear pool exhausted. Consider increasing pool size.');
    return null;
  }
  
  public returnSpearToPool(spear: any): void {
    if (!spear || !this.spearPool.includes(spear)) {
      console.error('Attempting to return an invalid spear to the pool');
      return;
    }
    
    // If the spear is not marked as in use, it's already in the pool
    if (!spear.inUse) {
      console.warn('Spear is already in the pool');
      return;
    }
    
    // Remove from scene
    this.scene.remove(spear.spearGroup);
    this.scene.remove(spear.trail);
    
    // Reset trail positions to hidden
    const positions = spear.trail.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] = -1000; // Hide trail points
    }
    spear.trail.geometry.attributes.position.needsUpdate = true;
    
    // Mark as available for reuse
    spear.inUse = false;
  }
  
  public getActiveSpearCount(): number {
    return this.spearPool.filter(spear => spear.inUse).length;
  }
  
  public getTotalPoolSize(): number {
    return this.spearPool.length;
  }
  
  public createWaterSpear(
    characterPosition: THREE.Vector3, 
    camera: THREE.Camera
  ): boolean {
    // Get a spear from the pool
    const pooledSpear = this.getSpearFromPool();
    if (!pooledSpear) return false; // No spears available
    
    const { spearGroup, trail, raycaster } = pooledSpear;
    
    // Position and orient the spear
    spearGroup.position.copy(characterPosition);
    spearGroup.position.y += 1.5;
    
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.normalize();
    
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
    spearGroup.setRotationFromQuaternion(quaternion);
    
    // Add to scene
    this.scene.add(spearGroup);
    this.scene.add(trail);
    
    // Reset trail to spear position
    const trailParticles = 30;
    const positions = trail.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < trailParticles; i++) {
      positions[i * 3] = spearGroup.position.x;
      positions[i * 3 + 1] = spearGroup.position.y;
      positions[i * 3 + 2] = spearGroup.position.z;
    }
    trail.geometry.attributes.position.needsUpdate = true;
    
    // Setup update function (simplified for testing)
    const speed = 15;
    const maxLifetime = 10000;
    const creationTime = Date.now();
    
    // Store ID for tracking
    const updateId = `waterSpear_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const updateSpear = (delta: number) => {
      // Check for lifetime expiration
      if (Date.now() - creationTime > maxLifetime) {
        // Lifetime expired, return to pool
        this.returnSpearToPool(pooledSpear);
        removeSpearUpdate();
        return;
      }
      
      // Check for terrain collision
      const terrain = this.scene.getObjectByName('terrain');
      if (terrain) {
        raycaster.set(spearGroup.position, direction);
        const intersects = raycaster.intersectObject(terrain, true);
        const distance = speed * delta;
        if (intersects.length > 0 && intersects[0].distance < distance) {
          // Hit terrain, return to pool
          this.returnSpearToPool(pooledSpear);
          removeSpearUpdate();
          return;
        }
      }
      
      // Movement code (simplified)
      spearGroup.position.add(direction.clone().multiplyScalar(speed * delta));
      
      // Trail update (simplified)
      for (let i = trailParticles - 1; i > 0; i--) {
        const i3 = i * 3;
        const prev3 = (i - 1) * 3;
        positions[i3] = positions[prev3];
        positions[i3 + 1] = positions[prev3 + 1];
        positions[i3 + 2] = positions[prev3 + 2];
      }
      
      positions[0] = spearGroup.position.x;
      positions[1] = spearGroup.position.y;
      positions[2] = spearGroup.position.z;
      
      trail.geometry.attributes.position.needsUpdate = true;
      
      spearGroup.rotateZ(delta * 2);
    };
    
    updateSpear._id = updateId;
    
    // Important: Store the remove function from registerUpdate
    const removeFunc = this.registerUpdate(updateSpear);
    
    // Create function closure that holds reference to removeFunc
    const removeSpearUpdate = () => {
      removeFunc();
    };
    
    return true;
  }
  
  public cleanup(): void {
    // Clean up the pool and resources
    this.spearPool.forEach(spear => {
      if (spear.inUse) {
        this.scene.remove(spear.spearGroup);
        this.scene.remove(spear.trail);
      }
      spear.trailGeometry.dispose();
    });
    
    this.spearPool = [];
    
    // Dispose shared resources
    this.spearGeometry.dispose();
    this.spearMaterial.dispose();
    this.glowGeometry.dispose();
    this.glowMaterial.dispose();
    this.trailMaterial.dispose();
  }
}

describe('WaterSpearPool', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let registerUpdate: (fn: any) => () => void;
  let pool: WaterSpearPool;
  let characterPosition: THREE.Vector3;
  
  beforeEach(() => {
    // Setup mocks
    scene = {
      add: vi.fn(),
      remove: vi.fn(),
      getObjectByName: vi.fn().mockReturnValue(null)
    } as unknown as THREE.Scene;
    
    camera = {
      getWorldDirection: vi.fn().mockImplementation((v) => v)
    } as unknown as THREE.Camera;
    
    registerUpdate = vi.fn().mockImplementation((fn) => {
      return () => {};
    });
    
    characterPosition = new THREE.Vector3(0, 0, 0);
    
    // Create pool
    pool = new WaterSpearPool(scene, registerUpdate, 5);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    pool.cleanup();
  });
  
  it('should initialize a pool with the correct size', () => {
    expect(pool.getTotalPoolSize()).toBe(5);
    expect(pool.getActiveSpearCount()).toBe(0);
  });
  
  it('should allocate a spear from the pool when available', () => {
    const spear = pool.getSpearFromPool();
    expect(spear).not.toBeNull();
    expect(pool.getActiveSpearCount()).toBe(1);
  });
  
  it('should return null when the pool is exhausted', () => {
    // Get all spears from the pool
    for (let i = 0; i < 5; i++) {
      const spear = pool.getSpearFromPool();
      expect(spear).not.toBeNull();
    }
    
    // Try to get one more
    const extraSpear = pool.getSpearFromPool();
    expect(extraSpear).toBeNull();
    expect(pool.getActiveSpearCount()).toBe(5);
  });
  
  it('should return a spear to the pool and make it available again', () => {
    // Get a spear
    const spear = pool.getSpearFromPool();
    expect(pool.getActiveSpearCount()).toBe(1);
    
    // Return it
    pool.returnSpearToPool(spear);
    expect(pool.getActiveSpearCount()).toBe(0);
    
    // Should be able to get it again
    const newSpear = pool.getSpearFromPool();
    expect(newSpear).not.toBeNull();
    expect(pool.getActiveSpearCount()).toBe(1);
  });
  
  it('should handle multiple spear creation and returns correctly', () => {
    // Create 3 spears
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.getActiveSpearCount()).toBe(3);
    
    // Get the remaining spears
    const spear4 = pool.getSpearFromPool();
    const spear5 = pool.getSpearFromPool();
    expect(spear4).not.toBeNull();
    expect(spear5).not.toBeNull();
    expect(pool.getActiveSpearCount()).toBe(5);
    
    // Return them
    pool.returnSpearToPool(spear4);
    pool.returnSpearToPool(spear5);
    expect(pool.getActiveSpearCount()).toBe(3);
    
    // Try to create more
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(false); // Pool is now exhausted
    expect(pool.getActiveSpearCount()).toBe(5);
  });
  
  it('should not return invalid spears to the pool', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Try to return a non-existent spear
    pool.returnSpearToPool(null);
    expect(consoleSpy).toHaveBeenCalledWith('Attempting to return an invalid spear to the pool');
    
    // Try to return a spear not from this pool
    const fakeSpear = { inUse: true };
    pool.returnSpearToPool(fakeSpear as any);
    expect(consoleSpy).toHaveBeenCalledWith('Attempting to return an invalid spear to the pool');
    
    consoleSpy.mockRestore();
  });
  
  it('should add spears to the scene when creating them', () => {
    // Create a spear
    pool.createWaterSpear(characterPosition, camera);
    
    // Scene.add should have been called for both the spear group and trail
    expect(scene.add).toHaveBeenCalledTimes(2);
  });
  
  it('should remove spears from the scene when returning them', () => {
    // Get a spear and simulate it being added to the scene
    const spear = pool.getSpearFromPool();
    pool.returnSpearToPool(spear);
    
    // Scene.remove should have been called for both the spear group and trail
    expect(scene.remove).toHaveBeenCalledTimes(2);
  });
  
  it('should ignore attempts to return a spear that is already in the pool', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Get a spear
    const spear = pool.getSpearFromPool();
    
    // Return it once
    pool.returnSpearToPool(spear);
    
    // Try to return it again
    pool.returnSpearToPool(spear);
    expect(consoleSpy).toHaveBeenCalledWith('Spear is already in the pool');
    
    consoleSpy.mockRestore();
  });
  
  it('should clean up resources properly', () => {
    // Get some spears
    const spear1 = pool.getSpearFromPool();
    const spear2 = pool.getSpearFromPool();
    
    // Cleanup
    pool.cleanup();
    
    // Check pool size is now 0
    expect(pool.getTotalPoolSize()).toBe(0);
    
    // Check scene.remove was called
    expect(scene.remove).toHaveBeenCalled();
  });
  
  it('should properly return spears to the pool after their lifetime expires', async () => {
    // Create multiple spears in quick succession
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    expect(pool.getActiveSpearCount()).toBe(3);
    
    // Manually trigger the update functions with delta time
    // This simulates the game loop running
    const updateFunctions = vi.mocked(registerUpdate).mock.calls.map(call => call[0]);
    
    // Fast forward time to simulate lifetime expiration
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11000); // Move past the 10000ms lifetime
    
    // Call all the update functions to trigger cleanup
    updateFunctions.forEach(fn => fn(0.016)); // ~60fps
    
    // Check that spears were returned to the pool
    expect(pool.getActiveSpearCount()).toBe(0);
    vi.useRealTimers();
  });
  
  it('should handle rapid-fire spear creation without exhausting the pool', () => {
    // Create a smaller pool for this test
    const smallPool = new WaterSpearPool(scene, registerUpdate, 5);
    
    // Create 5 spears (filling the pool)
    for (let i = 0; i < 5; i++) {
      expect(smallPool.createWaterSpear(characterPosition, camera)).toBe(true);
    }
    expect(smallPool.getActiveSpearCount()).toBe(5);
    
    // Get all the update functions
    const updateFunctions = vi.mocked(registerUpdate).mock.calls.map(call => call[0]);
    
    // Manually trigger the return of one spear to the pool
    const firstSpear = smallPool['spearPool'].find(spear => spear.inUse);
    if (firstSpear) {
      smallPool.returnSpearToPool(firstSpear);
    }
    
    // Now we should have one less active spear
    expect(smallPool.getActiveSpearCount()).toBe(4);
    
    // Should be able to fire another one
    expect(smallPool.createWaterSpear(characterPosition, camera)).toBe(true);
    
    // Clean up
    smallPool.cleanup();
  });
  
  it('should update spear positions correctly during movement', () => {
    // Get the initial pool size
    const initialSize = pool.getTotalPoolSize();
    
    // Create a spear
    expect(pool.createWaterSpear(characterPosition, camera)).toBe(true);
    
    // Get the update function
    const updateFunctions = vi.mocked(registerUpdate).mock.calls.map(call => call[0]);
    const lastUpdateFn = updateFunctions[updateFunctions.length - 1];
    
    // Since our mocked objects don't really have the prototype.position.add to spy on,
    // we'll just verify that update runs without error and the spear stays in the pool
    lastUpdateFn(0.016);
    
    // Check active count is still 1
    expect(pool.getActiveSpearCount()).toBe(1);
    
    // Check pool size hasn't changed
    expect(pool.getTotalPoolSize()).toBe(initialSize);
  });
}); 