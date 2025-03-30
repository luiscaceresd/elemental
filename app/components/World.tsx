'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
// No longer need noise2D if we are not generating mountains or terrain height variations
// import { createNoise2D } from 'simplex-noise';
import Tree from './Tree';
import Pond from './Pond';
import * as CANNON from 'cannon';

interface WorldProps {
  scene: THREE.Scene;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
  world: CANNON.World;
}

export default function World({ scene, isBendingRef, crosshairPositionRef, registerUpdate, world }: WorldProps) {
  const [treePositions, setTreePositions] = useState<THREE.Vector3[]>([]);
  const [pondPositions, setPondPositions] = useState<{ position: THREE.Vector3, size: number, depth: number }[]>([]);

  useEffect(() => {
    if (world) { /* Using world */ }
  }, [world]);

  useEffect(() => {
    const setupWorld = async () => {
      const THREE = await import('three');
      // const noise2D = createNoise2D(); // Removed: No longer needed for flat world/no mountains

      // --- Terrain Geometry (Flat) ---
      const terrainWidth = 1000;
      const terrainHeight = 1000;
      const terrainSegments = 50; // Segments still needed for the plane geometry itself
      const geometry = new THREE.PlaneGeometry(terrainWidth, terrainHeight, terrainSegments, terrainSegments);
      geometry.rotateX(-Math.PI / 2); // Lay flat

      // Pond definitions (still needed for object placement avoidance and Pond component data)
      const ponds = [
        { center: new THREE.Vector2(20, 20), radius: 15, depth: 3 },
        { center: new THREE.Vector2(-50, 30), radius: 20, depth: 4 },
        { center: new THREE.Vector2(60, -40), radius: 12, depth: 2.5 },
      ];

      // --- Heightmap (Explicitly Flat) ---
      // We still need this array structure if getTerrainHeightAt relies on it,
      // but we ensure all values are 0.
      const heightmap = new Float32Array((terrainSegments + 1) * (terrainSegments + 1));
      // Although PlaneGeometry vertices are already at y=0 when created and rotated,
      // this loop explicitly confirms the data source for getTerrainHeightAt is flat.
      for (let x = 0; x <= terrainSegments; x++) {
        for (let z = 0; z <= terrainSegments; z++) {
          const index = z * (terrainSegments + 1) + x;
          heightmap[index] = 0; // Ensure height data is zero
        }
      }

      // Apply the flat heightmap (redundant for default PlaneGeometry, but consistent)
      const positionAttribute = geometry.attributes.position;
      for (let i = 0; i < positionAttribute.count; i++) {
        // Ensure Y is 0, even if the default geometry is already flat.
        // This guards against potential future changes to PlaneGeometry defaults.
         positionAttribute.setY(i, 0); // Directly set Y to 0
         // Or use the heightmap: positionAttribute.setY(i, heightmap[i]);
      }
      geometry.computeVertexNormals(); // Normals will point straight up (0, 1, 0)

      // --- Physics Ground Plane (Flat) ---
      let groundBody: CANNON.Body | null = null;
      if (world) {
        const groundMaterial = new CANNON.Material('groundMaterial');
        groundMaterial.friction = 0.1;
        const groundShape = new CANNON.Plane(); // Cannon plane is infinitely flat
        groundBody = new CANNON.Body({ mass: 0, material: groundMaterial, shape: groundShape, collisionFilterGroup: 1, collisionFilterMask: 1 });
        groundBody.collisionResponse = true;
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Orient flat along XZ
        groundBody.position.set(0, 0, 0); // Position at Y=0
        world.addBody(groundBody);
        console.log("Added flat physics ground plane to world.");
      }

      // --- Terrain Texture Material ---
      const textureLoader = new THREE.TextureLoader();
      const grassTexture = textureLoader.load('/textures/grass_texture.jpg'); // Load from public/textures/
      grassTexture.wrapS = THREE.RepeatWrapping;
      grassTexture.wrapT = THREE.RepeatWrapping;
      const textureRepeat = 50; // How many times the texture repeats across the plane
      grassTexture.repeat.set(textureRepeat, textureRepeat);

      const terrainMaterial = new THREE.MeshStandardMaterial({
        map: grassTexture,
        roughness: 0.8, // Adjust for desired look
        metalness: 0.2, // Adjust for desired look
      });
      // Removed old ShaderMaterial definition

      const terrain = new THREE.Mesh(geometry, terrainMaterial);
      terrain.name = 'terrain';
      terrain.receiveShadow = true; // Still allow receiving shadows
      scene.add(terrain);
      console.log("Added textured terrain mesh.");

      // --- Distant Mountains REMOVED ---
      // The entire block for mountain generation is deleted.

      // --- Sky --- (Still present)
      const skyGeometry = new THREE.SphereGeometry(600, 32, 16);
      const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color(0x60aCFF) }, // Keep top blue
          bottomColor: { value: new THREE.Color(0xADD8E6) }, // Change bottom to light blue
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          varying vec3 vWorldPosition;
          void main() {
            float h = normalize(vWorldPosition).y;
            float t = clamp((h + 0.2) / 0.8, 0.0, 1.0);
            vec3 color = mix(bottomColor, topColor, t * t);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        side: THREE.BackSide,
      });
      const sky = new THREE.Mesh(skyGeometry, skyMaterial);
      sky.name = "Sky";
      scene.add(sky);
      console.log("Added Sky to scene.");

      // --- Tree and Pond Placement ---
      // getTerrainHeightAt will now always return 0
      const positions: THREE.Vector3[] = [];
       for (let i = 0; i < 30; i++) {
         const x = (Math.random() - 0.5) * terrainWidth * 0.8;
         const z_pos = (Math.random() - 0.5) * terrainHeight * 0.8;
         let isInPond = false;
         for (const pond of ponds) {
           // Check distance in XZ plane only
           const distance = new THREE.Vector2(x, z_pos).distanceTo(pond.center);
           if (distance < pond.radius + 5) { // Add buffer zone
             isInPond = true;
             break;
           }
         }
         if (!isInPond) {
           const y = 0; // Explicitly place on flat ground
           positions.push(new THREE.Vector3(x, y, z_pos));
         }
       }
      setTreePositions(positions);

      const pondsList = ponds.map(pond => ({
        // Position pond components at y=0
        position: new THREE.Vector3(pond.center.x, 0, pond.center.y),
        size: pond.radius * 2,
        depth: pond.depth
      }));
      setPondPositions(pondsList);

      // --- Terrain Height Function (now always returns 0) ---
      function getTerrainHeightAt(x: number, z_pos: number, width: number, height: number, segments: number, heightmapData: Float32Array): number {
        // Optimization: Since the heightmap is guaranteed flat (all 0s),
        // we can just return 0 directly, unless bounds checking is desired.
        const normalizedX = (x + width / 2) / width;
        const normalizedZ = (z_pos + height / 2) / height;
        if (normalizedX < 0 || normalizedX > 1 || normalizedZ < 0 || normalizedZ > 1) {
            console.warn(`getTerrainHeightAt called with out-of-bounds coordinates: (${x}, ${z_pos})`);
            return 0; // Out of bounds, return base height
        }
        // If we didn't optimize, the interpolation would still result in 0
        // based on the flat heightmapData array.
        return 0;
      }
      // @ts-expect-error - Property 'getTerrainHeight' does not exist on Window interface
      window.getTerrainHeight = (x: number, z_pos: number) => { return getTerrainHeightAt(x, z_pos, terrainWidth, terrainHeight, terrainSegments, heightmap); };


      // --- Cleanup ---
      return () => {
        // Remove only the objects we added
        scene.remove(terrain);
        scene.remove(sky);
        // No mountains to remove

        // Dispose geometries and materials
        geometry.dispose();
        terrainMaterial.map?.dispose(); // Dispose texture map
        terrainMaterial.dispose();
        skyGeometry.dispose();
        skyMaterial.dispose();
        // No mountain resources to dispose

        // Remove animation update
        // Removed shader update removal

         // Remove global function
         // @ts-expect-error - Property 'getTerrainHeight' does not exist on Window interface
        delete window.getTerrainHeight;

        // Remove physics body
        if (world && groundBody) {
            world.removeBody(groundBody);
        }
        console.log("World cleanup complete.");
      };
    };

    const cleanupPromise = setupWorld();
    return () => { cleanupPromise.then(cleanupFn => cleanupFn && cleanupFn()); };
  }, [scene, registerUpdate, world]);

  // Render Trees and Ponds separately
  return (
    <>
      {treePositions.map((pos, index) => (
        <Tree key={`tree-${index}`} position={pos} scene={scene} />
      ))}
      {pondPositions.map((pond, index) => (
        <Pond
          key={`pond-${index}`}
          position={pond.position} // Positioned at y=0
          size={pond.size}
          depth={pond.depth}
          scene={scene}
          isBendingRef={isBendingRef}
          crosshairPositionRef={crosshairPositionRef}
          registerUpdate={registerUpdate}
        />
      ))}
    </>
  );
}