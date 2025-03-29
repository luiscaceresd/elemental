'use client';

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import Pond from './Pond';
import * as CANNON from 'cannon';
import { useGLTFModel } from '../hooks/useGLTFModel';

interface WorldProps {
  scene: THREE.Scene;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
  world: CANNON.World;
}

export default function World({ scene, isBendingRef, crosshairPositionRef, registerUpdate, world }: WorldProps) {
  const worldRef = useRef<THREE.Group>(null);
  const lastUpdateTime = useRef(0);
  const [pondPositions, setPondPositions] = React.useState<{ position: THREE.Vector3, size: number, depth: number }[]>([]);

  // Register periodic updates instead of using useFrame
  useEffect(() => {
    // Create an update function that runs every frame
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const update = (_delta: number) => {
      const currentTime = Date.now() / 1000; // Convert to seconds
      
      // Only run expensive updates every second
      if (currentTime - lastUpdateTime.current < 1.0) return;
      lastUpdateTime.current = currentTime;
      
      // Additional periodic updates could go here
    };
    
    // Add identifier to update function
    const identifiableUpdate = update as ((delta: number) => void) & { _id?: string };
    identifiableUpdate._id = 'worldPeriodicUpdate';
    
    // Register the update function with parent component
    const unregister = registerUpdate(identifiableUpdate);
    
    return () => {
      // Unregister the update function when component unmounts
      unregister();
    };
  }, [registerUpdate]);

  // Load the scene.gltf model using our custom hook
  useGLTFModel({
    scene,
    modelPath: '/models/arena.glb',
    position: new THREE.Vector3(0, -1, 0), // Adjust height to ensure the ground is at y=0
    scale: new THREE.Vector3(30, 30, 30), // Increased scale from 10 to 30 to make arena much larger
    name: 'worldModel',
    onLoaded: (loadedModel) => {
      console.log('World model loaded successfully', loadedModel);
      
      // Optimization: Only traverse children once on load 
      const meshes: THREE.Mesh[] = [];
      loadedModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
          
          // Optimize meshes
          child.frustumCulled = true; // Enable frustum culling
          
          // Only cast shadows for larger objects
          if (child.geometry.boundingSphere && child.geometry.boundingSphere.radius > 5) {
            child.castShadow = true;
          } else {
            child.castShadow = false; // Smaller objects don't cast shadows
          }
          
          // Most objects should receive shadows
          child.receiveShadow = true;
        }
      });
      
      console.log(`Optimized ${meshes.length} meshes in world model`);
      setupPhysics(loadedModel);
    }
  });

  // Setup physics for the world
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setupPhysics = (_model: THREE.Group) => {
    // We're not using the model parameter, but we keep it for consistency
    if (!world) return;

    // Create a material for the ground with better friction
    const groundMaterial = new CANNON.Material('groundMaterial');
    groundMaterial.friction = 0.2; // Slightly higher friction for better walking
    
    // Create a flat ground plane for physics
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0, // mass = 0 means static object
      material: groundMaterial,
      shape: groundShape,
      collisionFilterGroup: 1, // Same group as character
      collisionFilterMask: 1 // Collides with group 1 (which includes the character)
    });
    
    // Make sure the ground has full collision response
    groundBody.collisionResponse = true;
    
    // Rotate the ground plane to match the terrain orientation
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    
    // Raise the ground slightly to ensure character is above it
    groundBody.position.set(0, 5, 0);
    
    // Add the ground body to the physics world
    world.addBody(groundBody);
    
    // Create a debug visualization of the physics ground plane if needed
    if (process.env.NODE_ENV === 'development') {
      const planeGeometry = new THREE.PlaneGeometry(1500, 1500);
      const planeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x119911, 
        transparent: true, 
        opacity: 0.1,
        wireframe: true,
        side: THREE.DoubleSide
      });
      const debugPlane = new THREE.Mesh(planeGeometry, planeMaterial);
      debugPlane.rotation.x = Math.PI / 2; // Match physics plane rotation
      debugPlane.position.y = 5.01; // Match the physics plane position but slightly above
      debugPlane.name = 'debug_physics_plane';
      scene.add(debugPlane);
    }
    
    console.log("Added physics ground plane to world at Y=5");
  };

  // Initialize pond positions
  useEffect(() => {
    // Define pond locations - scaled up for the larger arena
    const ponds = [
      { position: new THREE.Vector3(60, 0, 60), size: 45, depth: 5 },
      { position: new THREE.Vector3(-150, 0, 90), size: 60, depth: 6 },
      { position: new THREE.Vector3(180, 0, -120), size: 36, depth: 4 },
    ];
    
    setPondPositions(ponds);
    
    // Create a Group for the world
    const group = new THREE.Group();
    group.name = 'worldGroup';
    scene.add(group);
    worldRef.current = group;
    
    return () => {
      if (group.parent) {
        group.parent.remove(group);
      }
    };
  }, [scene]);

  // Setup sky
  useEffect(() => {
    // Sky setup
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x87CEFA) }, // Light blue
        bottomColor: { value: new THREE.Color(0xFFDAB9) }, // Peach
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vPosition;
        void main() {
          float t = (vPosition.y + 500.0) / 1000.0;
          vec3 color = mix(bottomColor, topColor, t);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
    });

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);

    // Cleanup
    return () => {
      scene.remove(sky);
      skyGeometry.dispose();
      skyMaterial.dispose();
    };
  }, [scene]);

  return (
    <>
      {pondPositions.map((pond, index) => (
        <Pond
          key={`pond-${index}`}
          position={pond.position}
          size={pond.size}
          depth={pond.depth}
          scene={scene}
          isBendingRef={isBendingRef}
          crosshairPositionRef={crosshairPositionRef}
          registerUpdate={registerUpdate}
          world={world}
        />
      ))}
    </>
  );
}