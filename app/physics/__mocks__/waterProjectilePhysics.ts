import * as THREE from 'three';
import { vi } from 'vitest';

// Mock physics world
const mockPhysicsWorld = {
  gravity: { x: 0, y: -9.82, z: 0 },
  addBody: vi.fn(),
  removeBody: vi.fn(),
  step: vi.fn()
};

// Mock physics bodies
const mockPhysicsBodies = [];

// Mock body class
export class MockBody {
  position = { x: 0, y: 0, z: 0 };
  quaternion = { x: 0, y: 0, z: 0, w: 1 };
  velocity = { 
    x: 0, y: 0, z: 0,
    set: vi.fn()
  };
  applyForce = vi.fn();
  
  constructor(position?: { x: number, y: number, z: number }) {
    if (position) {
      this.position = { ...position };
    }
  }
}

// Exported functions
export const initWaterPhysics = vi.fn(() => mockPhysicsWorld);
export const cleanupWaterPhysics = vi.fn();
export const updateWaterPhysics = vi.fn();

export const createWaterDropBody = vi.fn((position: THREE.Vector3, velocity?: THREE.Vector3) => {
  const body = new MockBody(
    position ? { x: position.x, y: position.y, z: position.z } : undefined
  );
  
  if (velocity) {
    body.velocity.x = velocity.x;
    body.velocity.y = velocity.y;
    body.velocity.z = velocity.z;
  }
  
  mockPhysicsBodies.push(body);
  return body;
});

export const createWaterSpearBody = vi.fn((
  position: THREE.Vector3,
  direction: THREE.Vector3,
  length = 1,
  radius = 0.1,
  speed = 20
) => {
  const body = new MockBody(
    position ? { x: position.x, y: position.y, z: position.z } : undefined
  );
  
  mockPhysicsBodies.push(body);
  return body;
});

export const applyAttractionForce = vi.fn((
  body: any, 
  attractionPoint: THREE.Vector3,
  strength: number,
  maxDistance: number
) => {
  // Mock implementation
});

export const removeBodyFromWorld = vi.fn((body: any) => {
  const index = mockPhysicsBodies.indexOf(body);
  if (index !== -1) {
    mockPhysicsBodies.splice(index, 1);
  }
});

export const checkTerrainCollision = vi.fn((
  body: any,
  terrainHeightFn?: (x: number, z: number) => number
) => false);

// Reset all mocks
export const __resetMocks = () => {
  mockPhysicsWorld.addBody.mockClear();
  mockPhysicsWorld.removeBody.mockClear();
  mockPhysicsWorld.step.mockClear();
  
  initWaterPhysics.mockClear();
  cleanupWaterPhysics.mockClear();
  updateWaterPhysics.mockClear();
  createWaterDropBody.mockClear();
  createWaterSpearBody.mockClear();
  applyAttractionForce.mockClear();
  removeBodyFromWorld.mockClear();
  checkTerrainCollision.mockClear();
  
  // Clear bodies array
  mockPhysicsBodies.length = 0;
}; 