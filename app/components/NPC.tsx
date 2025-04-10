'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon';

interface NPCProps {
  scene: THREE.Scene;
  position: THREE.Vector3;
  world?: CANNON.World;
  color?: string;
  size?: number;
  characterPositionRef?: React.MutableRefObject<THREE.Vector3>;
  registerUpdate?: (fn: (delta: number) => void) => (() => void) | void;
  gameState?: 'playing' | 'paused';
}

const NPC: React.FC<NPCProps> = ({
  scene,
  position,
  world,
  color = '#3366cc',
  size = 1,
  characterPositionRef,
  registerUpdate,
  gameState = 'playing'
}) => {
  const npcRef = useRef<THREE.Mesh | null>(null);
  const bodyRef = useRef<CANNON.Body | null>(null);
  const indicatorRef = useRef<THREE.Group | null>(null);
  const [isPlayerNearby, setIsPlayerNearby] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      return typeof window !== 'undefined' &&
        (/Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent)
          || window.innerWidth < 768);
    };
    
    setIsMobile(checkMobile());
    
    const handleResize = () => {
      setIsMobile(checkMobile());
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Create NPC mesh
  useEffect(() => {
    // Create the NPC mesh (sphere)
    const geometry = new THREE.SphereGeometry(size, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.2,
    });
    
    const npc = new THREE.Mesh(geometry, material);
    npc.name = 'NPC';
    npc.position.copy(position);
    npc.castShadow = true;
    npc.receiveShadow = true;
    
    // Store reference to the mesh
    npcRef.current = npc;
    
    // Add to scene
    scene.add(npc);
    
    // Create interaction indicator
    const indicatorGroup = new THREE.Group();
    indicatorGroup.position.copy(position);
    indicatorGroup.position.y += size * 2; // Position above the NPC
    
    // Create background circle
    const circleGeometry = new THREE.CircleGeometry(size * 0.6, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xFFFFFF,
      side: THREE.DoubleSide
    });
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    
    // Create custom exclamation mark using basic shapes
    const exclamationGroup = new THREE.Group();
    
    // Main vertical line of the exclamation mark (cylinder)
    const lineGeometry = new THREE.CylinderGeometry(size * 0.1, size * 0.1, size * 0.6, 16);
    const lineMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFF0000,
      emissive: 0x330000,
      metalness: 0.3,
      roughness: 0.4
    });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.position.y = size * 0.15; // Move up a bit
    
    // Bottom dot of the exclamation mark (sphere)
    const dotGeometry = new THREE.SphereGeometry(size * 0.12, 16, 16);
    const dotMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFF0000,
      emissive: 0x330000,
      metalness: 0.3,
      roughness: 0.4
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.y = -size * 0.35; // Position at bottom
    
    // Add parts to the exclamation mark group
    exclamationGroup.add(line);
    exclamationGroup.add(dot);
    
    // Position the indicator components
    circle.position.z = -0.05; // Slightly behind
    exclamationGroup.position.z = 0.05; // Slightly in front
    
    // Add to the main indicator group
    indicatorGroup.add(circle);
    indicatorGroup.add(exclamationGroup);
    
    indicatorGroup.visible = false; // Hide initially
    indicatorRef.current = indicatorGroup;
    scene.add(indicatorGroup);
    
    // Add physics if world is provided
    if (world) {
      const shape = new CANNON.Sphere(size);
      const body = new CANNON.Body({
        mass: 0, // Static body
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: shape,
        material: new CANNON.Material('npcMaterial')
      });
      
      bodyRef.current = body;
      world.addBody(body);
    }
    
    // Cleanup function
    return () => {
      scene.remove(npc);
      scene.remove(indicatorGroup);
      geometry.dispose();
      material.dispose();
      circleGeometry.dispose();
      circleMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      dotGeometry.dispose();
      dotMaterial.dispose();
      
      if (world && bodyRef.current) {
        world.removeBody(bodyRef.current);
      }
    };
  }, [scene, position, world, color, size]);
  
  // Add update function to check player distance and handle input
  useEffect(() => {
    if (!characterPositionRef || !registerUpdate) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'g' && isPlayerNearby) {
        console.log('Interacting with NPC');
        // Add your interaction code here
        alert('Hello traveler! I am an NPC.');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Mobile tap interaction
    const handleTap = (event: MouseEvent | TouchEvent) => {
      if (!isMobile || !isPlayerNearby || !npcRef.current) return;
      
      // Get the tap position
      const mouse = new THREE.Vector2();
      if (event instanceof MouseEvent) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      } else {
        const touch = event.touches[0];
        mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
      }
      
      // Check if the NPC was tapped
      const raycaster = new THREE.Raycaster();
      const camera = scene.getObjectByName('camera') as THREE.Camera;
      if (camera) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(npcRef.current);
        
        if (intersects.length > 0) {
          console.log('Tapped on NPC');
          alert('Hello traveler! I am an NPC.');
        }
      }
    };
    
    window.addEventListener('click', handleTap);
    window.addEventListener('touchend', handleTap);
    
    // Update function to check player distance and animate indicator
    const update = (delta: number) => {
      if (!characterPositionRef?.current || !npcRef.current || !indicatorRef.current) return;
      
      // Check distance to player
      const distanceToPlayer = characterPositionRef.current.distanceTo(npcRef.current.position);
      const playerIsNearby = distanceToPlayer < 5; // 5 units interaction radius
      
      // Update indicator visibility
      indicatorRef.current.visible = playerIsNearby;
      
      // Animate indicator (bounce)
      if (playerIsNearby) {
        indicatorRef.current.position.y = position.y + size * 2 + Math.sin(Date.now() * 0.003) * 0.2;
        
        // Always face camera but maintain vertical orientation of the exclamation mark
        const camera = scene.getObjectByName('camera') as THREE.Camera;
        if (camera) {
          // Get direction to camera (in XZ plane only to keep exclamation mark vertical)
          const direction = new THREE.Vector3();
          direction.subVectors(camera.position, indicatorRef.current.position);
          direction.y = 0; // Keep vertical by zeroing out y component
          
          // Make the indicator look at the camera (only rotating around Y axis)
          if (direction.length() > 0) {
            indicatorRef.current.lookAt(camera.position.x, indicatorRef.current.position.y, camera.position.z);
          }
        }
      }
      
      setIsPlayerNearby(playerIsNearby);
    };
    
    const unregister = registerUpdate(update);
    
    return () => {
      if (typeof unregister === 'function') unregister();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleTap);
      window.removeEventListener('touchend', handleTap);
    };
  }, [scene, position, size, characterPositionRef, registerUpdate, isPlayerNearby, isMobile]);

  // Add interaction hint UI only when game is not paused
  return (
    <>
      {isPlayerNearby && gameState === 'playing' && (
        <div 
          style={{
            position: 'fixed',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '5px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '16px',
            zIndex: 100,
            textAlign: 'center',
            boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
          }}
        >
          {isMobile ? (
            <span>Tap on the NPC to interact</span>
          ) : (
            <span>Press <strong>G</strong> to interact with NPC</span>
          )}
        </div>
      )}
    </>
  );
};

export default NPC; 