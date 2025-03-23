import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as THREE from 'three';
import { useWaterCollection } from '../useWaterCollection';

// Mock the physics module
vi.mock('../../physics/waterProjectilePhysics', () => {
  return {
    createWaterDropBody: vi.fn(),
    updateWaterPhysics: vi.fn(),
    removeBodyFromWorld: vi.fn(),
    applyAttractionForce: vi.fn()
  };
});

// Import the mocked module
import * as physicsModule from '../../physics/waterProjectilePhysics';

// Mock the object pool
vi.mock('../../utils/objectPool', () => {
  return {
    ObjectPool: class MockObjectPool {
      constructor(
        createFn: () => any,
        resetFn: (obj: any) => void,
        disposeFn: (obj: any) => void,
        initialSize = 0,
        maxSize = Infinity
      ) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.disposeFn = disposeFn;
        this.maxSize = maxSize;
        this.objects = Array(initialSize).fill(null).map(() => createFn());
        this.activeCount = 0;
      }
      
      createFn: () => any;
      resetFn: (obj: any) => void;
      disposeFn: (obj: any) => void;
      maxSize: number;
      objects: any[] = [];
      activeCount = 0;
      
      get() {
        if (this.objects.length > 0) {
          this.activeCount++;
          return this.objects.pop();
        }
        
        const obj = this.createFn();
        this.activeCount++;
        return obj;
      }
      
      release(obj: any) {
        this.resetFn(obj);
        this.objects.push(obj);
        this.activeCount--;
      }
      
      clear() {
        this.objects.forEach(this.disposeFn);
        this.objects = [];
        this.activeCount = 0;
      }
    },
    createWaterDropMeshPool: vi.fn(() => ({
      get: vi.fn(() => new THREE.Mesh(
        new THREE.SphereGeometry(0.1),
        new THREE.MeshBasicMaterial({ color: 0x0000ff })
      ))
    }))
  };
});

// Create a mock scene
const createMockScene = () => {
  const scene = new THREE.Scene();
  // Spy on scene methods
  scene.add = vi.fn(scene.add);
  scene.remove = vi.fn(scene.remove);
  return scene;
};

// Mock for physics body
const createMockBody = (position = { x: 0, y: 0, z: 0 }) => ({
  position: { ...position },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  velocity: { set: vi.fn() },
  applyForce: vi.fn()
});

describe('useWaterCollection', () => {
  let scene: THREE.Scene;
  
  beforeEach(() => {
    scene = createMockScene();
    vi.clearAllMocks();
    
    // Setup createWaterDropBody to return a mock body
    const mockCreateWaterDropBody = physicsModule.createWaterDropBody as jest.Mock;
    mockCreateWaterDropBody.mockImplementation((position) => createMockBody(
      position ? { x: position.x, y: position.y, z: position.z } : undefined
    ));
  });
  
  it('should initialize with default options', () => {
    const { result } = renderHook(() => useWaterCollection(scene));
    
    expect(result.current).toHaveProperty('createWaterDrop');
    expect(result.current).toHaveProperty('update');
    expect(result.current).toHaveProperty('clear');
    expect(result.current).toHaveProperty('getWaterAmount');
    expect(result.current).toHaveProperty('setWaterAmount');
  });
  
  it('should create a water drop', () => {
    const { result } = renderHook(() => useWaterCollection(scene));
    
    const position = new THREE.Vector3(1, 2, 3);
    const velocity = new THREE.Vector3(0.1, -0.5, 0.2);
    
    const drop = result.current.createWaterDrop(position, velocity);
    
    // Should add the mesh to the scene
    expect(scene.add).toHaveBeenCalled();
    
    // Should create a body with the specified position and velocity
    expect(physicsModule.createWaterDropBody).toHaveBeenCalledWith(position, velocity);
    
    // Should return a valid water drop object
    expect(drop).toBeDefined();
    if (drop) {
      expect(drop.mesh).toBeInstanceOf(THREE.Mesh);
      expect(drop.createdAt).toBeGreaterThan(0);
    }
  });
  
  it('should collect water drops near attraction point', () => {
    const { result } = renderHook(() => useWaterCollection(scene, {
      collectionDistance: 2,
      attractionDistance: 10,
      attractionStrength: 5
    }));
    
    // Create a water drop
    const dropPosition = new THREE.Vector3(5, 2, 5);
    const drop = result.current.createWaterDrop(dropPosition);
    
    if (drop) {
      // Reset mocks after creating the drop
      vi.clearAllMocks();
      
      // Set drop position to be within collection range
      drop.body.position = { x: 1, y: 0, z: 1 };
      
      // Update with attraction point nearby
      const attractionPoint = new THREE.Vector3(0, 0, 0);
      let collected;
      
      act(() => {
        collected = result.current.update(0.16, attractionPoint);
      });
      
      // Should have applied attraction force
      expect(physicsModule.applyAttractionForce).toHaveBeenCalledWith(
        drop.body, 
        attractionPoint,
        expect.any(Number), // Don't test exact strength value as it's calculated dynamically
        10  // Distance
      );
      
      // Should have collected the drop (distance < 2)
      expect(collected).toBe(1);
      
      // Water amount should increase
      expect(result.current.getWaterAmount()).toBe(1);
    }
  });
  
  it('should not collect drops too far from attraction point', () => {
    const { result } = renderHook(() => useWaterCollection(scene, {
      collectionDistance: 2,
      attractionDistance: 10,
      attractionStrength: 5
    }));
    
    // Create a water drop
    const dropPosition = new THREE.Vector3(20, 2, 20);
    const drop = result.current.createWaterDrop(dropPosition);
    
    if (drop) {
      // Reset mocks after creating the drop
      vi.clearAllMocks();
      
      // Set drop position to be outside collection range but within attraction
      drop.body.position = { x: 5, y: 0, z: 5 };
      
      // Update with attraction point
      const attractionPoint = new THREE.Vector3(0, 0, 0);
      let collected;
      
      act(() => {
        collected = result.current.update(0.16, attractionPoint);
      });
      
      // Should have applied attraction force
      expect(physicsModule.applyAttractionForce).toHaveBeenCalled();
      
      // Should not have collected the drop (distance > 2)
      expect(collected).toBe(0);
      
      // Water amount should not increase
      expect(result.current.getWaterAmount()).toBe(0);
    }
  });
  
  it('should respect max water capacity', () => {
    const { result } = renderHook(() => useWaterCollection(scene, {
      maxWaterCapacity: 5,
      collectionDistance: 2
    }));
    
    // Set initial water amount to near max
    act(() => {
      result.current.setWaterAmount(4);
    });
    
    // Create a water drop and position it for collection
    const drop = result.current.createWaterDrop(new THREE.Vector3(0, 0, 0));
    if (drop) {
      drop.body.position = { x: 0, y: 0, z: 0 };
      
      // Update with attraction point at same location
      let collected;
      act(() => {
        collected = result.current.update(0.16, new THREE.Vector3(0, 0, 0));
      });
      
      // Should have collected the drop
      expect(collected).toBe(1);
      
      // Water amount should be capped at max
      expect(result.current.getWaterAmount()).toBe(5);
      
      // Collect another drop
      const drop2 = result.current.createWaterDrop(new THREE.Vector3(0, 0, 0));
      if (drop2) {
        drop2.body.position = { x: 0, y: 0, z: 0 };
        
        act(() => {
          const collected2 = result.current.update(0.16, new THREE.Vector3(0, 0, 0));
        });
        
        // Should still be capped at max
        expect(result.current.getWaterAmount()).toBe(5);
      }
    }
  });
  
  it('should expire water drops after lifespan', () => {
    vi.useFakeTimers();
    
    const { result } = renderHook(() => useWaterCollection(scene, {
      lifespan: 1000 // 1 second lifespan
    }));
    
    // Create a water drop
    const drop = result.current.createWaterDrop(new THREE.Vector3(0, 0, 0));
    
    // Should be in the scene
    expect(scene.add).toHaveBeenCalled();
    
    // Reset mocks after creating the drop
    vi.clearAllMocks();
    
    // Fast forward time
    vi.advanceTimersByTime(1100);
    
    // Update without attraction point
    act(() => {
      result.current.update(0.16, null);
    });
    
    // Should have removed the expired drop
    expect(physicsModule.removeBodyFromWorld).toHaveBeenCalled();
    
    vi.useRealTimers();
  });
  
  it('should clear all water drops', () => {
    const { result } = renderHook(() => useWaterCollection(scene));
    
    // Create multiple drops
    result.current.createWaterDrop(new THREE.Vector3(0, 0, 0));
    result.current.createWaterDrop(new THREE.Vector3(1, 1, 1));
    result.current.createWaterDrop(new THREE.Vector3(2, 2, 2));
    
    // Reset mocks after creating the drops
    vi.clearAllMocks();
    
    // Clear all drops
    result.current.clear();
    
    // Should have removed all drops
    expect(physicsModule.removeBodyFromWorld).toHaveBeenCalledTimes(3);
  });
  
  it('should update drop positions based on physics', () => {
    const { result } = renderHook(() => useWaterCollection(scene));
    
    // Create a drop with a physics body
    const drop = result.current.createWaterDrop(new THREE.Vector3(0, 0, 0));
    
    if (drop) {
      // Set physics body position
      drop.body.position = { x: 5, y: 2, z: 3 };
      drop.body.quaternion = { x: 0, y: 0, z: 0, w: 1 };
      
      // Update without attraction
      result.current.update(0.16, null);
      
      // Mesh position should be updated to match physics body
      expect(drop.mesh.position.x).toBe(5);
      expect(drop.mesh.position.y).toBe(2);
      expect(drop.mesh.position.z).toBe(3);
    }
  });
}); 