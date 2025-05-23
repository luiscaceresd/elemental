'use client';

import React, { useEffect, useRef, useState, CSSProperties } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon';
import { AINPCChat } from '@/components/ai-npc-chat';

interface NPCProps {
  scene: THREE.Scene;
  position: THREE.Vector3;
  world?: CANNON.World;
  color?: string;
  size?: number;
  characterPositionRef?: React.MutableRefObject<THREE.Vector3>;
  registerUpdate?: (fn: (delta: number) => void) => (() => void) | void;
  gameState?: 'playing' | 'paused';
  isChattingRef?: React.MutableRefObject<boolean>;
}

// Define the expected message type for initial messages
interface InitialChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt?: string; // Optional createdAt
}

const NPC: React.FC<NPCProps> = ({
  scene,
  position,
  world,
  color = '#3366cc',
  size = 1,
  characterPositionRef,
  registerUpdate,
  gameState = 'playing',
  isChattingRef
}) => {
  const npcRef = useRef<THREE.Mesh | null>(null);
  const bodyRef = useRef<CANNON.Body | null>(null);
  const indicatorRef = useRef<THREE.Group | null>(null);
  const [isPlayerNearby, setIsPlayerNearby] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  
  // Generate a consistent username based on a prefix and a random suffix
  const [username] = useState(() => `player_${Math.floor(Math.random() * 10000)}`);
  
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
      if (event.key.toLowerCase() === 'g' && isPlayerNearby && gameState === 'playing' && !showChat) {
        console.log('Interacting with NPC');
        // Prevent the 'g' key from being entered in the input field
        event.preventDefault();
        // Show chat interface
        setShowChat(true);
        
        // Focus the input field after a short delay to ensure it's rendered
        // Use a slightly longer delay to ensure the key event is fully processed
        setTimeout(() => {
          const chatInput = document.querySelector('.npc-chat-input') as HTMLInputElement;
          if (chatInput) {
            chatInput.focus();
          }
        }, 100);
      }
      
      // Add escape key to close chat
      if (event.key === 'Escape' && showChat) {
        setShowChat(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Mobile tap interaction
    const handleTap = (event: MouseEvent | TouchEvent) => {
      if (!isMobile || !isPlayerNearby || !npcRef.current || gameState !== 'playing') return;
      
      // Don't need the raycaster for mobile anymore - use the button instead
      if (event.target && (event.target as HTMLElement).classList.contains('npc-interact-button')) {
        event.preventDefault();
        event.stopPropagation();
        console.log('Tapped on NPC interact button');
        setShowChat(true);
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
      
      // Update indicator visibility (only when chat is not open)
      indicatorRef.current.visible = playerIsNearby && !showChat && gameState === 'playing';
      
      // Animate indicator (bounce)
      if (playerIsNearby && !showChat && gameState === 'playing') {
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
  }, [scene, position, size, characterPositionRef, registerUpdate, isPlayerNearby, isMobile, gameState, showChat]);

  // Set chatting status when the chat opens or closes
  useEffect(() => {
    if (isChattingRef) {
      isChattingRef.current = showChat;
    }
  }, [showChat, isChattingRef]);

  // Handle escape key to close chat
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showChat) {
        setShowChat(false);
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [showChat]);

  // Dummy messages explicitly typed
  const dummyMessages: InitialChatMessage[] = [
    {
      id: '1',
      content: 'Hello traveler! I am Zephyr, guardian of this spring.',
      role: 'assistant', // Explicit role
      createdAt: new Date().toISOString(),
    },
    // Add example user message if needed for testing
    // {
    //   id: '2',
    //   content: 'Greetings Zephyr!',
    //   role: 'user', // Explicit role
    //   createdAt: new Date().toISOString(),
    // }
  ];

  // State for messages - Use the correctly typed dummy messages
  const [initialMessages] = useState(dummyMessages);

  const buttonStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    bottom: isMobile ? '500px' : '100px', 
    transform: 'translateX(-50%)',
    pointerEvents: 'none', 
    zIndex: 1500, 
    width: 'fit-content',
  };

  const mobileButtonStyle: CSSProperties = {
    backgroundColor: 'rgba(40, 167, 69, 0.85)',
    border: 'none',
    color: 'white',
    padding: '10px 20px',
    textAlign: 'center',
    textDecoration: 'none',
    display: 'inline-block',
    fontSize: '16px',
    margin: '4px 2px',
    cursor: 'pointer',
    borderRadius: '5px',
    fontWeight: 'bold',
    zIndex: 1501,
    position: 'relative',
    pointerEvents: 'auto',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
  };

  // Add interaction hint UI and chat component when appropriate
  return (
    <>
      {/* Interaction hint - only shown when nearby, game is playing, and chat isn't open */}
      {isPlayerNearby && gameState === 'playing' && !showChat && (
        <div 
          style={buttonStyle}
        >
          {isMobile ? (
            <button 
              className="npc-interact-button"
              onClick={() => setShowChat(true)}
              style={mobileButtonStyle} 
            >
              Interact with NPC
            </button>
          ) : (
            <span style={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.7)', 
              color: 'white', 
              padding: '10px 15px', 
              borderRadius: '5px',
              pointerEvents: 'none'
            }}>
              Press <strong>G</strong> to interact with NPC
            </span>
          )}
        </div>
      )}

      {/* Chat component - shown when interaction is started */}
      {showChat && gameState === 'playing' && (
        <div 
          style={{
            position: 'fixed',
            bottom: isMobile ? '60px' : '20px',
            right: isMobile ? '10px' : '20px',
            width: isMobile ? 'calc(100% - 20px)' : '360px',
            height: isMobile ? '40%' : '480px',
            maxHeight: isMobile ? '300px' : '480px',
            zIndex: 20000,
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '10px 16px',
            backgroundColor: '#111',
            color: 'white',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Guide</h3>
            <button 
              onClick={() => setShowChat(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px 8px',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ height: 'calc(100% - 43px)' }}>
            <AINPCChat
              username="Player"
              initialMessages={initialMessages}
              onClose={() => setShowChat(false)}
              npcName="Zephyr"
            />
          </div>

          {/* Overlay a semi-transparent "Chatting" status indicator */}
          <div style={{
            position: 'absolute',
            top: -40,
            right: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '5px',
            fontSize: '14px',
            pointerEvents: 'none',
            display: isMobile ? 'none' : 'block', // Hide the floating indicator on mobile
          }}>
            Chatting with Guide...
          </div>
        </div>
      )}
    </>
  );
};

export default NPC; 