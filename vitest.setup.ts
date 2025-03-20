import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Configure module mocks
vi.mock('./app/physics/waterProjectilePhysics');

// Automatically unmount and cleanup DOM after each test
afterEach(() => {
  cleanup();
}); 