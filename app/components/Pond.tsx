'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Define a window with terrain height function for type safety
interface WindowWithTerrain extends Window {
  getTerrainHeight?: (x: number, z: number) => number;
}

interface PondProps {
  position: THREE.Vector3;
  size: number;
  depth: number;
  scene: THREE.Scene;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
}

interface WaterDrop {
  mesh: THREE.Mesh;
  physicsBody: CANNON.Body;
  visible: boolean;
  scale: THREE.Vector3;
  collectEffect: boolean; // Flag for particles that are part of the collection effect
  lifeTime: number; // For collection effect particles
}

export default function Pond({ position, size, depth, scene, isBendingRef, crosshairPositionRef, registerUpdate }: PondProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const pondMeshRef = useRef<THREE.Mesh | null>(null);
  const waterTextureRef = useRef<THREE.Texture | null>(null);
  const dropsRef = useRef<WaterDrop[]>([]);
  const lastBendingCheckRef = useRef<number>(0);
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  const pondContainerRef = useRef<THREE.Group | null>(null);

  // Initialize pond and water drops
  useEffect(() => {
    if (!scene) return;

    // Create a physics world with gravity
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0) // Standard Earth gravity
    });
    
    // Optimize physics world
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 5; // Reduced iterations for performance
    world.allowSleep = true;
    
    // Add a ground plane
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0, // Static body
      shape: groundShape,
      collisionFilterGroup: 2, // Group 2 for ground
      collisionFilterMask: 1 | 4  // Collide with player (Group 1) and drops (Group 4)
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Make it horizontal
    world.addBody(groundBody);
    
    physicsWorldRef.current = world;

    // Create pond container
    const pondContainer = new THREE.Group();
    pondContainer.position.copy(position);
    scene.add(pondContainer);
    pondContainerRef.current = pondContainer;

    // Create pond surface (flat circular plane with water material)
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
    pondMesh.rotation.x = -Math.PI / 2; // Lay flat
    pondMesh.position.y = 0.05; // Just slightly above ground to avoid z-fighting
    pondMesh.receiveShadow = true;
    pondContainerRef.current.add(pondMesh);
    pondMeshRef.current = pondMesh;

    // Create water drops for collection effect (initially hidden)
    const drops: WaterDrop[] = [];
    const dropCount = 50; // Number of particles for collection effect
    
    const sphereShape = new CANNON.Sphere(0.5);

    for (let i = 0; i < dropCount; i++) {
      // Create mesh
      const dropGeometry = new THREE.SphereGeometry(0.5, 12, 12);
      const dropMaterial = new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        metalness: 0.1,
        roughness: 0.2,
        transparent: true,
        opacity: 0.7
      });
      
      const dropMesh = new THREE.Mesh(dropGeometry, dropMaterial);
      dropMesh.visible = false; // Start hidden
      
      // Random scaling for varying sizes
      const scale = 0.2 + Math.random() * 0.5;
      dropMesh.scale.set(scale, scale, scale);
      
      // Add to container
      pondContainerRef.current.add(dropMesh);
      
      // Create physics body (initially inactive)
      const dropBody = new CANNON.Body({
        mass: scale * scale * scale,
        shape: sphereShape,
        position: new CANNON.Vec3(0, -100, 0), // Start far away
        linearDamping: 0.2,
        material: new CANNON.Material({
          friction: 0.2,
          restitution: 0.7 // More bouncy for effect
        }),
        collisionFilterGroup: 4, // Group 4 for water drops
        collisionFilterMask: 2    // Collide only with ground (Group 2)
      });
      
      // Allow sleeping for performance
      dropBody.allowSleep = true;
      dropBody.sleepSpeedLimit = 0.5;
      dropBody.sleepTimeLimit = 1.0;
      
      world.addBody(dropBody);
      
      drops.push({
        mesh: dropMesh,
        physicsBody: dropBody,
        visible: false,
        scale: new THREE.Vector3(scale, scale, scale),
        collectEffect: true, // These drops are for the collection effect
        lifeTime: 0
      });
    }
    
    dropsRef.current = drops;
    setIsLoaded(true);

    return () => {
      if (pondContainerRef.current) {
        scene.remove(pondContainerRef.current);
      }
      
      if (waterTextureRef.current) {
        waterTextureRef.current.dispose();
      }
      
      if (pondMeshRef.current) {
        (pondMeshRef.current.geometry as THREE.BufferGeometry).dispose();
        (pondMeshRef.current.material as THREE.Material).dispose();
      }
    };
  }, [scene, position, size, depth]);

  // Update function for the water animation and physics
  useEffect(() => {
    if (!isLoaded || !registerUpdate) return;

      const updatePond = (delta: number) => {
        if (delta > 0.1) return; // Skip large deltas

      // Update physics world
      const world = physicsWorldRef.current;
      if (!world) return;
      
      world.step(delta);
      
      // Animate water normal map movement for flowing effect
      if (waterTextureRef.current) {
        waterTextureRef.current.offset.x += delta * 0.05;
        waterTextureRef.current.offset.y += delta * 0.03;
      }
      
      // Only check for bending every few frames for performance
      const now = performance.now();
      if (now - lastBendingCheckRef.current > 100) {
        // Check if player is actively bending water near this pond
        if (isBendingRef.current && crosshairPositionRef.current) {
          const pondWorldPos = new THREE.Vector3();
          if (pondContainerRef.current) {
            pondWorldPos.copy(pondContainerRef.current.position);
          } else {
            pondWorldPos.copy(position);
          }
          
          const dx = crosshairPositionRef.current.x - pondWorldPos.x;
          const dz = crosshairPositionRef.current.z - pondWorldPos.z;
          const distanceToCrosshair = Math.sqrt(dx * dx + dz * dz);
          
          // If bending near pond, create water collection effect
          if (distanceToCrosshair < size / 2 + 2) {
            console.log("Collecting water from pond!");
            createWaterCollectionEffect();
          }
        }
        
        lastBendingCheckRef.current = now;
      }
      
      // Update collection effect water drops
      const drops = dropsRef.current;
        for (let i = 0; i < drops.length; i++) {
          if (!drops[i].visible) continue;

        const drop = drops[i];
        
        // Update mesh position from physics body
        drop.mesh.position.set(
          drop.physicsBody.position.x,
          drop.physicsBody.position.y,
          drop.physicsBody.position.z
        );
        
        // Update rotation if moving significantly
        if (drop.physicsBody.velocity.lengthSquared() > 0.1) {
          drop.mesh.quaternion.set(
            drop.physicsBody.quaternion.x,
            drop.physicsBody.quaternion.y,
            drop.physicsBody.quaternion.z,
            drop.physicsBody.quaternion.w
          );
        }
        
        // Handle collection effect particles
        if (drop.collectEffect) {
          // Update lifetime and hide if expired
          drop.lifeTime += delta;
          
          // Gradually reduce opacity for fade-out effect
          if (drop.lifeTime > 0.5 && drop.mesh.material instanceof THREE.MeshStandardMaterial) {
            const remainingLife = 1 - Math.min(1, (drop.lifeTime - 0.5) / 1.5);
            drop.mesh.material.opacity = 0.7 * remainingLife;
          }
          
          // Deactivate after 2 seconds
          if (drop.lifeTime > 2) {
            drop.visible = false;
            drop.mesh.visible = false;
            drop.physicsBody.position.y = -100; // Move far away
            drop.physicsBody.sleep();
            drop.lifeTime = 0;
          }
        }
      }
    };

    // Add identifier to the update function
    const update = updatePond as ((delta: number) => void) & { _id?: string };
    update._id = `pond-${position.x}-${position.z}`;
    
    // Register with animation loop
    const unregister = registerUpdate(update);
    return unregister;
  }, [isLoaded, position, isBendingRef, crosshairPositionRef, registerUpdate]);
  
  // Function to create water collection particle effect
  const createWaterCollectionEffect = () => {
    if (!pondContainerRef.current) return;
    
    const drops = dropsRef.current;
    const pondPos = pondContainerRef.current.position;
    const crosshairPos = crosshairPositionRef.current;
    
    // Calculate direction to crosshair
    const direction = new THREE.Vector3(
      crosshairPos.x - pondPos.x,
      crosshairPos.y - pondPos.y + 1, // Aim slightly upward
      crosshairPos.z - pondPos.z
    ).normalize();
    
    // Activate several drops for effect
    let activatedCount = 0;
    const maxToActivate = 5 + Math.floor(Math.random() * 5); // Randomize 5-10 drops
    
    for (let i = 0; i < drops.length && activatedCount < maxToActivate; i++) {
      if (drops[i].visible) continue;
      
      const drop = drops[i];
      
      // Position at random point on pond surface
              const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * (size / 2 - 1);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      // Activate and position
      drop.visible = true;
      drop.mesh.visible = true;
      drop.lifeTime = 0;
      
      // Reset material opacity
      if (drop.mesh.material instanceof THREE.MeshStandardMaterial) {
        drop.mesh.material.opacity = 0.7;
      }
      
      // Position physics body
      drop.physicsBody.position.set(
        x, // Local position
        0.1, // Just above pond
        z
      );
      
      // Apply force in direction of crosshair with some randomness
      const speed = 5 + Math.random() * 10; // Varied speed
      const randomDir = new THREE.Vector3(
        direction.x + (Math.random() - 0.5) * 0.5,
        direction.y + Math.random() * 0.5, // Add upward randomness
        direction.z + (Math.random() - 0.5) * 0.5
      ).normalize();
      
      // Set initial velocity
      drop.physicsBody.velocity.set(
        randomDir.x * speed,
        randomDir.y * speed,
        randomDir.z * speed
      );
      
      // Wake up physics body
      drop.physicsBody.wakeUp();
      
      activatedCount++;
    }
  };

  return null;
}