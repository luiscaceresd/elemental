import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectPool } from '../objectPool';

describe('ObjectPool', () => {
  // Test objects
  type TestObject = {
    id: number;
    value: string;
    isReset: boolean;
  };
  
  // Setup functions
  let createFn: () => TestObject;
  let resetFn: (obj: TestObject) => void;
  let disposeFn: (obj: TestObject) => void;
  
  // Counter for tracking created objects
  let createCounter = 0;
  
  beforeEach(() => {
    // Reset counter
    createCounter = 0;
    
    // Setup test functions
    createFn = vi.fn(() => ({ 
      id: createCounter++, 
      value: 'new', 
      isReset: false 
    }));
    
    resetFn = vi.fn((obj: TestObject) => {
      obj.value = 'reset';
      obj.isReset = true;
    });
    
    disposeFn = vi.fn();
  });
  
  describe('constructor', () => {
    it('should create an empty pool by default', () => {
      const pool = new ObjectPool<TestObject>(createFn, resetFn);
      
      expect(pool.size()).toBe(0);
      expect(pool.activeCount()).toBe(0);
      expect(createFn).not.toHaveBeenCalled();
    });
    
    it('should pre-create initial objects if initialSize provided', () => {
      const initialSize = 5;
      const pool = new ObjectPool<TestObject>(createFn, resetFn, disposeFn, initialSize);
      
      expect(pool.size()).toBe(initialSize);
      expect(pool.activeCount()).toBe(0);
      expect(createFn).toHaveBeenCalledTimes(initialSize);
    });
  });
  
  describe('get', () => {
    it('should create a new object if pool is empty', () => {
      const pool = new ObjectPool<TestObject>(createFn, resetFn);
      
      const obj = pool.get();
      
      expect(createFn).toHaveBeenCalledOnce();
      expect(resetFn).toHaveBeenCalledOnce();
      expect(resetFn).toHaveBeenCalledWith(obj);
      expect(obj.id).toBe(0);
      expect(obj.isReset).toBe(true);
      expect(pool.activeCount()).toBe(1);
    });
    
    it('should reuse an available object if one exists', () => {
      const pool = new ObjectPool<TestObject>(createFn, resetFn, disposeFn, 1);
      
      // First get will use the pre-created object
      const obj1 = pool.get();
      
      // Release it back to the pool
      pool.release(obj1);
      
      // Second get should reuse the object
      resetFn.mockClear(); // Clear reset function call count
      const obj2 = pool.get();
      
      expect(obj2).toBe(obj1);
      expect(createFn).toHaveBeenCalledTimes(1); // Only the initial creation
      expect(resetFn).toHaveBeenCalledWith(obj2);
      expect(pool.activeCount()).toBe(1);
    });
    
    it('should respect maximum size limit and reuse oldest object', () => {
      const maxSize = 2;
      const pool = new ObjectPool<TestObject>(createFn, resetFn, disposeFn, 0, maxSize);
      
      // Get two objects (up to max)
      const obj1 = pool.get();
      const obj2 = pool.get();
      
      expect(pool.size()).toBe(maxSize);
      expect(pool.activeCount()).toBe(2);
      
      // Get another object, should reuse oldest
      console.warn = vi.fn();
      const obj3 = pool.get();
      
      expect(console.warn).toHaveBeenCalled();
      expect(obj3).toBe(obj1); // Reused the first object
      expect(pool.size()).toBe(maxSize);
      expect(pool.activeCount()).toBe(2);
    });
  });
  
  describe('release', () => {
    it('should return an object to the available pool', () => {
      const pool = new ObjectPool<TestObject>(createFn, resetFn);
      
      const obj = pool.get();
      expect(pool.activeCount()).toBe(1);
      
      pool.release(obj);
      expect(pool.activeCount()).toBe(0);
      expect(pool.size()).toBe(1);
      
      // Check that reset was called on release
      expect(resetFn).toHaveBeenCalledTimes(2); // Once on get, once on release
    });
    
    it('should do nothing if object is not in the active list', () => {
      const pool = new ObjectPool<TestObject>(createFn, resetFn);
      
      const obj = { id: 999, value: 'external', isReset: false };
      pool.release(obj);
      
      expect(pool.size()).toBe(0);
      expect(resetFn).not.toHaveBeenCalled();
    });
  });
  
  describe('clear', () => {
    it('should empty the pool and call dispose on all objects', () => {
      const pool = new ObjectPool<TestObject>(createFn, resetFn, disposeFn, 3);
      
      // Get some objects and release some
      const obj1 = pool.get();
      const obj2 = pool.get();
      pool.release(obj1);
      
      // Clear the pool
      pool.clear();
      
      expect(pool.size()).toBe(0);
      expect(pool.activeCount()).toBe(0);
      expect(disposeFn).toHaveBeenCalledTimes(3); // All objects get disposed
    });
    
    it('should work without a dispose function', () => {
      const pool = new ObjectPool<TestObject>(createFn, resetFn, undefined, 3);
      
      pool.get();
      pool.clear();
      
      expect(pool.size()).toBe(0);
    });
  });
}); 