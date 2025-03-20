import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

interface WaterBeltOptions {
  radius?: number;
  particleCount?: number;
  particleSize?: number;
  color?: THREE.Color;
  opacity?: number;
  minOpacity?: number;
  rotationSpeed?: number;
  wobbleSpeed?: number;
  wobbleAmount?: number;
}

export interface WaterBeltSystem {
  update: (delta: number, position: THREE.Vector3, waterLevel: number) => void;
  setVisibility: (visible: boolean) => void;
  setWaterLevel: (level: number) => void;
  getIsActive: () => boolean;
}

/**
 * Hook to create and manage a water belt effect around the character
 */
export function useWaterBeltEffect(
  scene: THREE.Scene | null,
  options: WaterBeltOptions = {}
): WaterBeltSystem {
  const {
    radius = 2.5,
    particleCount = 200,
    particleSize = 0.1,
    color = new THREE.Color(0x00aaff),
    opacity = 0.7,
    minOpacity = 0.2,
    rotationSpeed = 0.5,
    wobbleSpeed = 1.5,
    wobbleAmount = 0.2
  } = options;
  
  // Reference to belt object
  const beltObject = useRef<THREE.Object3D | null>(null);
  const particles = useRef<THREE.Points | null>(null);
  const particlePositions = useRef<Float32Array | null>(null);
  const [visible, setVisible] = useState(false);
  const [waterLevel, setWaterLevel] = useState(0);
  const time = useRef(0);
  
  // Create the water belt effect
  useEffect(() => {
    if (!scene) return;
    
    // Create container object
    const container = new THREE.Object3D();
    container.visible = visible;
    scene.add(container);
    beltObject.current = container;
    
    // Create particles geometry
    const geometry = new THREE.BufferGeometry();
    
    // Generate random positions on a sphere
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);
    
    particlePositions.current = positions;
    
    // Create positions on a sphere
    for (let i = 0; i < particleCount; i++) {
      // Random position on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      
      // Random sizes for particles
      sizes[i] = particleSize * (0.8 + Math.random() * 0.4);
      
      // Colors with slight variations
      colors[i * 3] = color.r * (0.9 + Math.random() * 0.2);
      colors[i * 3 + 1] = color.g * (0.9 + Math.random() * 0.2);
      colors[i * 3 + 2] = color.b * (0.9 + Math.random() * 0.2);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Create shader material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waterLevel: { value: 0 },
        opacity: { value: opacity },
        minOpacity: { value: minOpacity },
        pointTexture: { value: createWaterParticleTexture() }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vWaterLevel;
        uniform float time;
        uniform float waterLevel;
        
        void main() {
          vColor = color;
          vWaterLevel = waterLevel;
          
          // Apply slight wobble effect
          vec3 pos = position;
          float wobble = sin(time * ${wobbleSpeed.toFixed(1)} + position.x + position.y) * ${wobbleAmount.toFixed(2)};
          pos.y += wobble;
          
          // Apply rotation
          float angle = time * ${rotationSpeed.toFixed(1)};
          float cosA = cos(angle);
          float sinA = sin(angle);
          float x = pos.x * cosA - pos.z * sinA;
          float z = pos.x * sinA + pos.z * cosA;
          pos.x = x;
          pos.z = z;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        uniform float opacity;
        uniform float minOpacity;
        varying vec3 vColor;
        varying float vWaterLevel;
        
        void main() {
          // Sample the texture
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          
          // Calculate opacity based on water level
          float particleOpacity = mix(minOpacity, opacity, vWaterLevel);
          
          // Final color with applied opacity
          gl_FragColor = vec4(vColor, texColor.a * particleOpacity);
          
          // Discard fully transparent fragments
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    });
    
    // Create the points object
    const points = new THREE.Points(geometry, material);
    container.add(points);
    particles.current = points;
    
    // Cleanup when unmounting
    return () => {
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      if (container) scene.remove(container);
    };
  }, [scene, radius, particleCount, particleSize, color, opacity, minOpacity, rotationSpeed, wobbleSpeed, wobbleAmount]);
  
  // Effect to update visibility
  useEffect(() => {
    if (beltObject.current) {
      beltObject.current.visible = visible;
    }
  }, [visible]);
  
  // Update water level in shader
  useEffect(() => {
    if (particles.current) {
      const material = particles.current.material as THREE.ShaderMaterial;
      if (material.uniforms && material.uniforms.waterLevel) {
        material.uniforms.waterLevel.value = waterLevel;
      }
    }
  }, [waterLevel]);
  
  /**
   * Update the belt effect
   */
  const update = useCallback((delta: number, position: THREE.Vector3, currentWaterLevel: number) => {
    if (!beltObject.current || !particles.current) return;
    
    // Update position to follow the character
    beltObject.current.position.copy(position);
    
    // Update time for animation
    time.current += delta;
    
    // Update time in shader
    const material = particles.current.material as THREE.ShaderMaterial;
    if (material.uniforms && material.uniforms.time) {
      material.uniforms.time.value = time.current;
    }
    
    // Update water level
    setWaterLevel(currentWaterLevel);
  }, []);
  
  /**
   * Set the visibility of the belt effect
   */
  const setVisibility = useCallback((isVisible: boolean) => {
    setVisible(isVisible);
  }, []);
  
  /**
   * Set water level explicitly
   */
  const setWaterLevelExplicit = useCallback((level: number) => {
    setWaterLevel(Math.max(0, Math.min(1, level)));
  }, []);
  
  /**
   * Check if the belt is currently active/visible
   */
  const getIsActive = useCallback(() => {
    return visible;
  }, [visible]);
  
  return {
    update,
    setVisibility,
    setWaterLevel: setWaterLevelExplicit,
    getIsActive
  };
}

/**
 * Create a texture for water particles
 */
function createWaterParticleTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot get 2D context');
  
  // Create gradient
  const gradient = context.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width / 2
  );
  
  // Set gradient colors
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(200, 230, 255, 0.8)');
  gradient.addColorStop(0.5, 'rgba(150, 200, 240, 0.5)');
  gradient.addColorStop(1, 'rgba(0, 100, 200, 0)');
  
  // Draw gradient
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Create texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  return texture;
} 