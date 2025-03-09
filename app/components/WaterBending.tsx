'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import Hammer from 'hammerjs';

type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

interface WaterBendingProps {
  scene: THREE.Scene;
  domElement: HTMLCanvasElement;
  registerUpdate: (updateFn: IdentifiableFunction) => () => void;
  camera: THREE.Camera;
}

export default function WaterBending({ scene, domElement, registerUpdate, camera }: WaterBendingProps) {
  const waterRef = useRef<THREE.Mesh | null>(null);
  const waterMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const mouseDownRef = useRef(false);
  const crosshairPositionRef = useRef<THREE.Vector3 | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mousePositionRef = useRef<THREE.Vector2>(new THREE.Vector2());

  // This useEffect is necessary for THREE.js integration, Hammer.js setup, and mouse handling
  useEffect(() => {
    // Dynamic import for client-side only libraries
    const setupWaterBending = async () => {
      // Dynamically import THREE and Hammer.js
      const THREE = await import('three');
      const Hammer = (await import('hammerjs')).default;

      // Initialize raycaster for mouse position in 3D space
      raycasterRef.current = new THREE.Raycaster();

      // Create a shader-based water material for the main water body
      const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          waterColor: { value: new THREE.Color(0x1E90FF) }, // Dodger Blue
          waveSpeed: { value: 0.5 },
          waveHeight: { value: 0.2 },
        },
        vertexShader: `
          uniform float time;
          uniform float waveSpeed;
          uniform float waveHeight;
          varying vec2 vUv;
          varying float vElevation;
          
          void main() {
            vUv = uv;
            
            // Create wave patterns
            vec3 pos = position;
            float elevation = sin(pos.x * 0.5 + time * waveSpeed) * waveHeight;
            elevation += cos(pos.z * 0.5 + time * waveSpeed) * waveHeight;
            elevation += sin((pos.x + pos.z) * 0.3 + time * waveSpeed) * waveHeight * 0.5;
            
            pos.y += elevation;
            vElevation = elevation;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 waterColor;
          varying vec2 vUv;
          varying float vElevation;
          
          void main() {
            // Add some depth variation based on elevation
            vec3 color = waterColor;
            color += vElevation * 0.2; // Lighter at wave peaks
            
            // Add edge effect
            float edge = 0.1;
            float alpha = 0.7; // Base transparency
            
            // More transparent at edges
            if (vUv.x < edge) alpha *= vUv.x / edge;
            if (vUv.x > 1.0 - edge) alpha *= (1.0 - vUv.x) / edge;
            if (vUv.y < edge) alpha *= vUv.y / edge;
            if (vUv.y > 1.0 - edge) alpha *= (1.0 - vUv.y) / edge;
            
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
      });
      waterMaterialRef.current = waterMaterial;

      // Create the water mesh with more segments for better wave visualization
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20, 32, 32), // More segments for smoother waves
        waterMaterial
      );
      water.position.set(0, 0.1, 0);
      water.rotation.x = -Math.PI / 2; // Lay flat on the ground
      scene.add(water);
      waterRef.current = water;

      // Animation update function for water waves
      const updateWater: IdentifiableFunction = (delta: number) => {
        if (waterMaterial) {
          waterMaterial.uniforms.time.value += delta * 0.5;
        }
      };
      updateWater._id = 'waterAnimation';

      // Waterbending logic - attract water entities to crosshair position
      const updateWaterbending: IdentifiableFunction = (delta: number) => {
        if (mouseDownRef.current && crosshairPositionRef.current) {
          // Find all water entities in the scene
          const waterEntities = scene.children.filter(child =>
            child.userData && child.userData.isWater === true);

          // For each water entity, check if it's within range and move it
          waterEntities.forEach(waterEntity => {
            const direction = crosshairPositionRef.current!.clone().sub(waterEntity.position);
            const distance = direction.length();

            // Only attract water within 20 units
            if (distance < 20) {
              direction.normalize();
              // Stronger pull when closer
              const pullStrength = 15 * (1 - distance / 20);
              waterEntity.position.add(direction.multiplyScalar(pullStrength * delta));
            }
          });
        }
      };
      updateWaterbending._id = 'waterbendingAttraction';

      // Register both update functions
      const removeWaterAnimation = registerUpdate(updateWater);
      const removeWaterbendingAttraction = registerUpdate(updateWaterbending);

      // Update crosshair position based on mouse position
      const updateCrosshairPosition = (clientX: number, clientY: number) => {
        if (!camera || !raycasterRef.current) return;

        // Convert to normalized device coordinates (-1 to +1)
        const normalizedX = (clientX / window.innerWidth) * 2 - 1;
        const normalizedY = -(clientY / window.innerHeight) * 2 + 1;

        mousePositionRef.current.set(normalizedX, normalizedY);

        // Update the raycaster with normalized mouse coordinates
        raycasterRef.current.setFromCamera(mousePositionRef.current, camera);

        // Calculate the point 15 units along the ray for the crosshair position
        crosshairPositionRef.current = raycasterRef.current.ray.origin.clone()
          .add(raycasterRef.current.ray.direction.clone().multiplyScalar(15));
      };

      // Set up mouse events with window to match the Crosshair component
      const onMouseDown = (event: MouseEvent) => {
        if (event.button === 0) { // Left button
          mouseDownRef.current = true;
          updateCrosshairPosition(event.clientX, event.clientY);
        }
      };

      const onMouseUp = (event: MouseEvent) => {
        if (event.button === 0) { // Left button
          mouseDownRef.current = false;
        }
      };

      const onMouseMove = (event: MouseEvent) => {
        updateCrosshairPosition(event.clientX, event.clientY);
      };

      // Add event listeners to window instead of domElement
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('mousemove', onMouseMove);

      // Set up Hammer.js for touch input for mobile support
      const hammer = new Hammer(domElement);
      const pan = new Hammer.Pan({ threshold: 0, pointers: 1 });
      hammer.add(pan);

      hammer.on('panstart', (event) => {
        mouseDownRef.current = true;
        updateCrosshairPosition(event.center.x, event.center.y);
      });

      hammer.on('panend', () => {
        mouseDownRef.current = false;
      });

      hammer.on('pan', (event) => {
        updateCrosshairPosition(event.center.x, event.center.y);
      });

      // Cleanup
      return () => {
        scene.remove(water);
        hammer.destroy();
        removeWaterAnimation();
        removeWaterbendingAttraction();
        waterMaterial.dispose();
        window.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('mousemove', onMouseMove);
      };
    };

    const cleanup = setupWaterBending();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [scene, domElement, registerUpdate, camera]);

  return null; // No DOM rendering, just Three.js logic
} 