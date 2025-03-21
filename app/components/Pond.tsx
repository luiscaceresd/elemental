'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WaterParticleManager } from './water/WaterParticleManager';

interface PondProps {
  position: THREE.Vector3;
  size: number;
  depth?: number;
  scene: THREE.Scene | null;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
  createWaterDrop?: any;
}

export default function Pond({ 
  position, 
  size, 
  depth = 1,
  scene, 
  isBendingRef, 
  crosshairPositionRef, 
  registerUpdate,
  createWaterDrop
}: PondProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const pondMeshRef = useRef<THREE.Mesh | null>(null);
  const waterTextureRef = useRef<THREE.Texture | null>(null);
  
  // Register this pond with global pond registry for water particle spawning
  useEffect(() => {
    if (!scene) return;

    // Create a visual representation of the pond - now with texture and better materials
    const pondGeometry = new THREE.CircleGeometry(size / 2, 32);
    
    // Load water normal map for realistic water appearance
    const textureLoader = new THREE.TextureLoader();
    const waterNormal = textureLoader.load('/textures/waternormals.jpg', () => {
      if (pondMeshRef.current && pondMeshRef.current.material instanceof THREE.MeshPhongMaterial) {
        pondMeshRef.current.material.normalMap = waterNormal;
        pondMeshRef.current.material.normalScale.set(3, 3);
      }
    });
    waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
    waterTextureRef.current = waterNormal;

    // Reflective blue water material
    const waterMaterial = new THREE.MeshPhongMaterial({
      color: 0x0066cc,
      specular: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.85,
      reflectivity: 1,
    });

    const pondMesh = new THREE.Mesh(pondGeometry, waterMaterial);
    pondMesh.rotation.x = -Math.PI / 2; // Make it horizontal
    pondMesh.position.copy(position);
    pondMesh.position.y += 0.05; // Just slightly above ground to avoid z-fighting
    pondMesh.receiveShadow = true;
    scene.add(pondMesh);
    pondMeshRef.current = pondMesh;
    setIsLoaded(true);
    
    // Register this pond in the global pond registry
    if (typeof window !== 'undefined') {
      const pondEntry = { position, size };
      if (!(window as any).pondPositions) {
        (window as any).pondPositions = [];
      }
      (window as any).pondPositions.push(pondEntry);
    }
    
    // Spawn initial water blobs instead of particles
    if (typeof window !== 'undefined' && window.createWaterBlob) {
      // Spawn fewer, larger blobs based on pond size
      const blobCount = Math.max(1, Math.floor(size));
      
      for (let i = 0; i < blobCount; i++) {
        // Random position within pond radius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * (size / 2 - 0.5);
        const x = position.x + Math.cos(angle) * distance;
        const z = position.z + Math.sin(angle) * distance;
        const y = position.y + 0.5;
        
        const spawnPos = new THREE.Vector3(x, y, z);
        
        // Size is proportional to pond size but randomized slightly
        const blobSize = (0.5 + Math.random() * 0.5) * (size / 5);
        
        // Each blob represents more water than individual particles
        const waterAmount = Math.ceil(blobSize * 10);
        
        window.createWaterBlob(spawnPos, blobSize, waterAmount);
      }
    }
    
    // Update function for water bending from this pond
    const updatePond = (delta: number) => {
      // Animate water normal map movement for flowing effect
      if (waterTextureRef.current) {
        waterTextureRef.current.offset.x += delta * 0.05;
        waterTextureRef.current.offset.y += delta * 0.03;
      }
      
      // Periodically spawn new water blobs
      if (typeof window !== 'undefined' && window.createWaterBlob) {
        // Spawn a new blob every ~2-3 seconds based on pond size (increased frequency)
        if (Math.random() < 0.02 * delta * size) {
          // Random position within pond radius
          const angle = Math.random() * Math.PI * 2;
          const distance = Math.random() * (size / 2 - 0.5);
          const x = position.x + Math.cos(angle) * distance;
          const z = position.z + Math.sin(angle) * distance;
          const y = position.y + 0.5;
          
          const spawnPos = new THREE.Vector3(x, y, z);
          
          // Size is proportional to pond size but randomized slightly
          const blobSize = (0.4 + Math.random() * 0.3) * (size / 5);
          
          // Each blob represents more water (doubled amount)
          const waterAmount = Math.ceil(blobSize * 20);
          
          window.createWaterBlob(spawnPos, blobSize, waterAmount);
        }
      }
    
      if (!isBendingRef.current || !crosshairPositionRef.current) return;
      
      // Check if player is bending water near this pond
      const distanceToCrosshair = position.distanceTo(crosshairPositionRef.current);
      
      if (distanceToCrosshair < size * 2) {
        // Create water attraction effect when bending near the pond
        // This is handled in WaterParticles.tsx by checking pondPositions
      }
    };
    
    // Register update function
    updatePond._id = `pond-${position.x}-${position.y}-${position.z}`;
    const unregister = registerUpdate(updatePond);
    
    // Cleanup
    return () => {
      if (pondMeshRef.current) {
        scene.remove(pondMeshRef.current);
        pondMeshRef.current.geometry.dispose();
        if (pondMeshRef.current.material instanceof THREE.Material) {
          pondMeshRef.current.material.dispose();
        }
      }
      
      if (waterTextureRef.current) {
        waterTextureRef.current.dispose();
      }
      
      // Remove from global registry
      if (typeof window !== 'undefined' && (window as any).pondPositions) {
        const index = (window as any).pondPositions.findIndex(
          (p: any) => p.position.equals(position) && p.size === size
        );
        if (index !== -1) {
          (window as any).pondPositions.splice(index, 1);
        }
      }
      
      unregister();
    };
  }, [position, size, depth, scene, registerUpdate, isBendingRef, crosshairPositionRef]);

  return null;
}