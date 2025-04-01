'use client';

import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

interface PortalProps {
  scene: THREE.Scene;
  position: THREE.Vector3;
  isEntrance?: boolean;
  registerUpdate?: (fn: (delta: number) => void) => void;
}

const Portal: React.FC<PortalProps> = ({ 
  scene, 
  position, 
  isEntrance = false,
  registerUpdate
}) => {
  const portalGroupRef = useRef<THREE.Group | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const innerCircleRef = useRef<THREE.Mesh | null>(null);
  
  // Portal colors
  const entranceColor = new THREE.Color(0xff3333); // Red for entrance
  const exitColor = new THREE.Color(0x33ff66);     // Green for exit
  const portalColor = isEntrance ? entranceColor : exitColor;

  useEffect(() => {
    // Create portal group
    const portalGroup = new THREE.Group();
    portalGroup.position.copy(position);
    portalGroupRef.current = portalGroup;

    // Create portal ring (torus) - increased size more
    const torusGeometry = new THREE.TorusGeometry(5, 0.7, 16, 100); // Increased from 4 to 5, thickness from 0.6 to 0.7
    const torusMaterial = new THREE.MeshStandardMaterial({
      color: portalColor,
      emissive: portalColor,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
    });
    const torus = new THREE.Mesh(torusGeometry, torusMaterial);
    portalGroup.add(torus);

    // Create inner portal surface (transparent circle) - increased size more
    const circleGeometry = new THREE.CircleGeometry(4.5, 32); // Increased from 3.6 to 4.5
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: portalColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    circle.position.z = 0.05;
    innerCircleRef.current = circle;
    portalGroup.add(circle);

    // Create particles for portal effect - increased spread
    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 1000; // Increased from 800 to 1000 for more particles
    const particlePositions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      // Create particles in a disc shape
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 5; // Increased from 4 to 5
      
      particlePositions[i * 3] = Math.cos(angle) * radius;     // x - horizontal
      particlePositions[i * 3 + 1] = Math.sin(angle) * radius; // y - vertical
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 0.8; // z - slight depth
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    
    const particlesMaterial = new THREE.PointsMaterial({
      color: portalColor,
      size: 0.05,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    particlesRef.current = particles;
    portalGroup.add(particles);

    // Elevate the portal from the ground to be like a doorway - raised higher
    portalGroup.position.y += 5; // Raised from 3 to 5 to prevent floor clipping

    // Add to scene
    scene.add(portalGroup);

    // Animation update function
    const updatePortal = (delta: number) => {
      if (torus) {
        torus.rotation.z += delta * 0.5; // Rotate the torus
      }
      
      if (particlesRef.current) {
        particlesRef.current.rotation.z -= delta * 0.2; // Rotate particles in opposite direction
      }
      
      if (innerCircleRef.current) {
        const material = innerCircleRef.current.material;
        if (Array.isArray(material)) {
          material.forEach(mat => {
            mat.opacity = 0.3 + Math.sin(Date.now() * 0.002) * 0.2; // Pulsing opacity
          });
        } else {
          material.opacity = 0.3 + Math.sin(Date.now() * 0.002) * 0.2; // Pulsing opacity
        }
      }
    };

    // Register the update function if provided
    if (registerUpdate) {
      registerUpdate(updatePortal);
    }

    // Cleanup
    return () => {
      scene.remove(portalGroup);
      torusGeometry.dispose();
      torusMaterial.dispose();
      circleGeometry.dispose();
      circleMaterial.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();
    };
  }, [scene, position, isEntrance, registerUpdate, portalColor]);

  return null; // Component doesn't render any HTML
};

export default Portal; 