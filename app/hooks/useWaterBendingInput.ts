import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

interface InputOptions {
  camera?: THREE.Camera;
  cameraDistance?: number;
  damping?: number;
  canvas?: HTMLCanvasElement;
}

export interface InputState {
  isClicking: boolean;
  isCharging: boolean;
  clickPosition: THREE.Vector2;
  chargeStartTime: number | null;
  chargePosition: THREE.Vector2 | null;
  chargeLevel: number;
}

export interface InputActions {
  onStartCharging: () => void;
  onCancelCharging: () => void;
  onShoot: (direction: THREE.Vector3) => void;
  onMove: (position: THREE.Vector3) => void;
}

export interface InputSystem {
  update: (delta: number) => void;
  getInputState: () => InputState;
  getRaycastDirection: () => THREE.Vector3 | null;
  cleanup: () => void;
}

/**
 * Hook to handle mouse and touch input for water bending
 */
export function useWaterBendingInput(
  actions: InputActions,
  options: InputOptions = {}
): InputSystem {
  const {
    camera,
    cameraDistance = 5,
    damping = 0.1,
    canvas
  } = options;
  
  // Input state
  const [inputState, setInputState] = useState<InputState>({
    isClicking: false,
    isCharging: false,
    clickPosition: new THREE.Vector2(),
    chargeStartTime: null,
    chargePosition: null,
    chargeLevel: 0
  });
  
  // Raycaster for 3D position calculation
  const raycaster = useRef(new THREE.Raycaster());
  const rayDirection = useRef<THREE.Vector3 | null>(null);
  const targetElement = useRef<HTMLElement | null>(null);
  
  // Initialize event handlers
  useEffect(() => {
    // Determine target element for events
    targetElement.current = canvas || document.body;
    
    // Add event listeners
    const element = targetElement.current;
    
    const handleMouseDown = (e: MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      setInputState(prev => ({
        ...prev,
        isClicking: true,
        clickPosition: new THREE.Vector2(x, y)
      }));
      
      // Start charging
      actions.onStartCharging();
      
      setInputState(prev => ({
        ...prev,
        isCharging: true,
        chargeStartTime: Date.now(),
        chargePosition: new THREE.Vector2(x, y)
      }));
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!inputState.isClicking) return;
      
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      setInputState(prev => ({
        ...prev,
        clickPosition: new THREE.Vector2(x, y)
      }));
      
      // Calculate world ray and perform move action
      updateRayDirection(x, y);
      if (rayDirection.current) {
        const playerPosition = getPlayerPosition();
        actions.onMove(playerPosition);
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      if (!inputState.isClicking) return;
      
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Reset clicking state
      setInputState(prev => ({
        ...prev,
        isClicking: false,
        clickPosition: new THREE.Vector2(x, y)
      }));
      
      // If we were charging, shoot
      if (inputState.isCharging) {
        // Calculate direction and shoot
        updateRayDirection(x, y);
        
        if (rayDirection.current) {
          actions.onShoot(rayDirection.current);
        }
        
        // Reset charging state
        setInputState(prev => ({
          ...prev,
          isCharging: false,
          chargeStartTime: null,
          chargePosition: null,
          chargeLevel: 0
        }));
      }
    };
    
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      
      const touch = e.touches[0];
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      
      setInputState(prev => ({
        ...prev,
        isClicking: true,
        clickPosition: new THREE.Vector2(x, y)
      }));
      
      // Start charging
      actions.onStartCharging();
      
      setInputState(prev => ({
        ...prev,
        isCharging: true,
        chargeStartTime: Date.now(),
        chargePosition: new THREE.Vector2(x, y)
      }));
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0 || !inputState.isClicking) return;
      
      const touch = e.touches[0];
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      
      setInputState(prev => ({
        ...prev,
        clickPosition: new THREE.Vector2(x, y)
      }));
      
      // Calculate world ray and perform move action
      updateRayDirection(x, y);
      if (rayDirection.current) {
        const playerPosition = getPlayerPosition();
        actions.onMove(playerPosition);
      }
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      if (!inputState.isClicking) return;
      
      // Use last known position
      const x = inputState.clickPosition.x;
      const y = inputState.clickPosition.y;
      
      // Reset clicking state
      setInputState(prev => ({
        ...prev,
        isClicking: false
      }));
      
      // If we were charging, shoot
      if (inputState.isCharging) {
        // Calculate direction and shoot
        updateRayDirection(x, y);
        
        if (rayDirection.current) {
          actions.onShoot(rayDirection.current);
        }
        
        // Reset charging state
        setInputState(prev => ({
          ...prev,
          isCharging: false,
          chargeStartTime: null,
          chargePosition: null,
          chargeLevel: 0
        }));
      }
    };
    
    const handleCancel = () => {
      // Cancel charging
      if (inputState.isCharging) {
        actions.onCancelCharging();
        
        setInputState(prev => ({
          ...prev,
          isClicking: false,
          isCharging: false,
          chargeStartTime: null,
          chargePosition: null,
          chargeLevel: 0
        }));
      }
    };
    
    // Add event listeners
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleCancel);
    
    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchmove', handleTouchMove);
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleCancel);
    
    // Cleanup
    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleCancel);
      
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleCancel);
    };
  }, [actions, canvas, inputState.isCharging, inputState.isClicking, inputState.clickPosition]);
  
  /**
   * Update the ray direction based on cursor position
   */
  const updateRayDirection = useCallback((x: number, y: number) => {
    if (!camera) {
      rayDirection.current = null;
      return;
    }
    
    // Update raycaster
    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
    
    // Get ray direction
    rayDirection.current = raycaster.current.ray.direction.clone();
  }, [camera]);
  
  /**
   * Get player position (estimated from camera)
   */
  const getPlayerPosition = useCallback(() => {
    if (!camera) {
      return new THREE.Vector3(0, 0, 0);
    }
    
    // Calculate player position based on camera
    const position = camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    
    // Player is in front of the camera
    position.add(direction.multiplyScalar(cameraDistance));
    
    return position;
  }, [camera, cameraDistance]);
  
  /**
   * Update input state (called in animation frame)
   */
  const update = useCallback((delta: number) => {
    // Update charge level if charging
    if (inputState.isCharging && inputState.chargeStartTime) {
      const chargeTime = Date.now() - inputState.chargeStartTime;
      const maxChargeTime = 2000; // 2 seconds to full charge
      
      const newChargeLevel = Math.min(chargeTime / maxChargeTime, 1);
      
      setInputState(prev => ({
        ...prev,
        chargeLevel: newChargeLevel
      }));
    }
  }, [inputState.isCharging, inputState.chargeStartTime]);
  
  /**
   * Get current input state
   */
  const getInputState = useCallback(() => {
    return inputState;
  }, [inputState]);
  
  /**
   * Get current ray direction
   */
  const getRaycastDirection = useCallback(() => {
    return rayDirection.current;
  }, []);
  
  /**
   * Cleanup resources
   */
  const cleanup = useCallback(() => {
    // Nothing special to clean up here
  }, []);
  
  return {
    update,
    getInputState,
    getRaycastDirection,
    cleanup
  };
} 