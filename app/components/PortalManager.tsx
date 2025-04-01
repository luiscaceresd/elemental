'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import Portal from './Portal';

interface PortalManagerProps {
  scene: THREE.Scene;
  characterPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (fn: (delta: number) => void) => void;
}

const PortalManager: React.FC<PortalManagerProps> = ({
  scene,
  characterPositionRef,
  registerUpdate
}) => {
  // Refs for tracking state
  const playerBoxRef = useRef<THREE.Box3>(new THREE.Box3());
  const exitPortalBoxRef = useRef<THREE.Box3>(new THREE.Box3());
  const entrancePortalBoxRef = useRef<THREE.Box3>(new THREE.Box3());
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isNearExitPortalRef = useRef<boolean>(false);
  const isNearEntrancePortalRef = useRef<boolean>(false);
  const isExitingRef = useRef<boolean>(false);
  const isEnteringRef = useRef<boolean>(false);

  // Define portal positions
  const exitPortalPosition = new THREE.Vector3(30, 0, 30); // Far corner of the map
  const entrancePortalPosition = new THREE.Vector3(-30, 0, -30); // Opposite corner
  
  // Create hidden iframe for preloading the destination
  useEffect(() => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframeRef.current = iframe;
    
    return () => {
      document.body.removeChild(iframe);
    };
  }, []);

  // Function to update portal box references
  const updatePortalBoxes = () => {
    // Update player box
    const playerSize = new THREE.Vector3(1, 2, 1); // Approximate player size
    playerBoxRef.current.setFromCenterAndSize(
      characterPositionRef.current,
      playerSize
    );

    // Update exit portal box - adjusted for larger size and higher position
    exitPortalBoxRef.current.setFromCenterAndSize(
      new THREE.Vector3(exitPortalPosition.x, exitPortalPosition.y + 5, exitPortalPosition.z), // Adjusted center point for higher portal
      new THREE.Vector3(10, 11, 3) // Portal collision size - increased for bigger portal
    );

    // Update entrance portal box - adjusted for larger size and higher position
    entrancePortalBoxRef.current.setFromCenterAndSize(
      new THREE.Vector3(entrancePortalPosition.x, entrancePortalPosition.y + 5, entrancePortalPosition.z), // Adjusted center point for higher portal
      new THREE.Vector3(10, 11, 3) // Portal collision size - increased for bigger portal
    );
  };

  // Check for portal collisions
  const checkPortalCollisions = (delta: number) => {
    updatePortalBoxes();

    const playerPosition = characterPositionRef.current;
    
    // Check if player is near exit portal - increased detection range
    const distanceToExitPortal = playerPosition.distanceTo(exitPortalPosition);
    const isNearExitPortal = distanceToExitPortal < 15; // Increased from 10 to 15
    
    // If player just got near the exit portal, preload the destination
    if (isNearExitPortal && !isNearExitPortalRef.current && iframeRef.current) {
      iframeRef.current.src = 'https://portal.pieter.com/loading';
    }
    
    isNearExitPortalRef.current = isNearExitPortal;
    
    // Check if player is near entrance portal - increased detection range
    const distanceToEntrancePortal = playerPosition.distanceTo(entrancePortalPosition);
    isNearEntrancePortalRef.current = distanceToEntrancePortal < 15; // Increased from 10 to 15
    
    // Check if player has entered exit portal
    if (playerBoxRef.current.intersectsBox(exitPortalBoxRef.current) && !isExitingRef.current) {
      isExitingRef.current = true;
      
      // Get player stats or other data to pass to next game
      const playerData = {
        health: 100, // Example value
        water: 50, // Example value
        position: {
          x: playerPosition.x,
          y: playerPosition.y,
          z: playerPosition.z
        }
      };
      
      // Construct the URL with query parameters
      const queryParams = new URLSearchParams();
      queryParams.set('playerData', JSON.stringify(playerData));
      queryParams.set('fromGame', window.location.href);
      queryParams.set('fromPortal', 'true');
      
      // Redirect to the portal destination
      setTimeout(() => {
        window.location.href = `https://portal.pieter.com?${queryParams.toString()}`;
      }, 1000); // Short delay for visual effect
    }
    
    // Check if player has entered entrance portal (coming back from somewhere)
    const urlParams = new URLSearchParams(window.location.search);
    const hasReturnedFromPortal = urlParams.has('fromPortal');
    
    if (hasReturnedFromPortal && 
        playerBoxRef.current.intersectsBox(entrancePortalBoxRef.current) && 
        !isEnteringRef.current) {
      isEnteringRef.current = true;
      
      // Get the URL to return to
      const returnUrl = urlParams.get('returnUrl') || '/';
      
      // Build return URL with fromPortal parameter to skip start screen
      let finalUrl = returnUrl;
      // Add query parameter separator if needed
      if (finalUrl.indexOf('?') === -1) {
        finalUrl += '?fromPortal=true';
      } else {
        finalUrl += '&fromPortal=true';
      }
      
      // Redirect back to the origin game
      setTimeout(() => {
        window.location.href = finalUrl;
      }, 1000); // Short delay for visual effect
    }
  };

  // Register update function
  useEffect(() => {
    const unregister = registerUpdate(checkPortalCollisions);
    
    return () => {
      unregister();
    };
  }, [registerUpdate]);

  return (
    <>
      <Portal 
        scene={scene} 
        position={exitPortalPosition} 
        isEntrance={false} 
        registerUpdate={registerUpdate} 
      />
      
      {/* Only render entrance portal if we're coming from another game */}
      {new URLSearchParams(window.location.search).has('fromPortal') && (
        <Portal 
          scene={scene} 
          position={entrancePortalPosition} 
          isEntrance={true} 
          registerUpdate={registerUpdate} 
        />
      )}
    </>
  );
};

export default PortalManager; 