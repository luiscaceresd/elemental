import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Interface for a single water drop in the particle system
 */
export interface WaterDrop {
  mesh: THREE.Mesh;
  physicsBody: CANNON.Body;
  active: boolean;
  visible: boolean;
  scale: THREE.Vector3;
  lastActive: number; // Timestamp when last active
}

/**
 * Interface for props passed to the WaterParticles component
 */
export interface WaterParticlesProps {
  scene: THREE.Scene;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
}

/**
 * Interface for custom window properties
 */
export interface CustomWindow extends Window {
  updateWaterParticlesPlayerPos?: (position: THREE.Vector3) => void;
  characterPosition?: THREE.Vector3;
} 