'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import Tree from './Tree';
import Pond from './Pond';

interface WorldProps {
  scene: THREE.Scene;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
}

export default function World({ scene, isBendingRef, crosshairPositionRef, registerUpdate }: WorldProps) {
  const [treePositions, setTreePositions] = useState<THREE.Vector3[]>([]);
  const [pondPositions, setPondPositions] = useState<{ position: THREE.Vector3, size: number, depth: number }[]>([]);

  useEffect(() => {
    const setupWorld = async () => {
      const THREE = await import('three');
      const noise2D = createNoise2D(); // Initialize Simplex noise

      // --- Terrain with enhanced noise for natural hills and valleys ---
      const terrainWidth = 1000; // Size of the playable area
      const terrainHeight = 1000;
      const terrainSegments = 150; // Increased for more detail
      const geometry = new THREE.PlaneGeometry(terrainWidth, terrainHeight, terrainSegments, terrainSegments);
      geometry.rotateX(-Math.PI / 2); // Lay flat on the ground

      // Define pond locations
      const ponds = [
        { center: new THREE.Vector2(20, 20), radius: 15, depth: 3 },
        { center: new THREE.Vector2(-50, 30), radius: 20, depth: 4 },
        { center: new THREE.Vector2(60, -40), radius: 12, depth: 2.5 },
      ];

      // Create heightmap with natural terrain using multiple Simplex noise octaves
      const heightmap = new Float32Array((terrainSegments + 1) * (terrainSegments + 1));

      for (let x = 0; x <= terrainSegments; x++) {
        for (let z = 0; z <= terrainSegments; z++) {
          const posX = (x / terrainSegments) * terrainWidth - terrainWidth / 2;
          const posZ = (z / terrainSegments) * terrainHeight - terrainHeight / 2;

          // Set base terrain to flat (height 0)
          let heightValue = 0;

          // Create depressions for ponds
          for (const pond of ponds) {
            const distance = new THREE.Vector2(posX, posZ).distanceTo(pond.center);
            if (distance < pond.radius) {
              // Smooth depression using cosine function
              const normalizedDist = distance / pond.radius;
              const depression = (1 - Math.cos(normalizedDist * Math.PI)) / 2 * pond.depth;
              heightValue -= pond.depth - depression;
            }
          }

          const index = z * (terrainSegments + 1) + x;
          heightmap[index] = heightValue;
        }
      }

      // Apply heightmap to terrain vertices
      const positionAttribute = geometry.attributes.position;
      for (let i = 0; i < positionAttribute.count; i++) {
        positionAttribute.setY(i, heightmap[i]);
      }
      geometry.computeVertexNormals();

      // Procedural grass and terrain shader material
      const uniforms = {
        time: { value: 0 },
      };

      const terrainMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vPosition;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vPosition = position;
            vNormal = normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          varying vec3 vPosition;
          varying vec3 vNormal;
          uniform float time;

          // Simplex noise implementation
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
          
          float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
            vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod289(i);
            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m * m;
            m = m * m;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
            vec3 g;
            g.x = a0.x * x0.x + h.x * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
          }
          
          void main() {
            // Base colors
            vec3 grassColor = vec3(0.1, 0.5, 0.1); // Green
            vec3 dirtColor = vec3(0.4, 0.3, 0.1);  // Brown
            vec3 darkGrassColor = vec3(0.05, 0.35, 0.05); // Dark green
            vec3 rockColor = vec3(0.5, 0.5, 0.5);  // Gray
            vec3 sandColor = vec3(0.76, 0.7, 0.5); // Tan for shore
            
            // Use noise at different scales for natural variation
            float largeNoise = snoise(vUv * 10.0);
            float mediumNoise = snoise(vUv * 30.0);
            float smallNoise = snoise(vUv * 100.0);
            float detailNoise = smallNoise * 0.2 + mediumNoise * 0.3 + largeNoise * 0.5;
            
            // Height-based coloring with noise variation
            float heightFactor = clamp((vPosition.y + 3.0) / 8.0, 0.0, 1.0);
            
            // Slope-based coloring
            float slope = 1.0 - dot(vNormal, vec3(0.0, 1.0, 0.0));
            
            // Depression coloring (for ponds)
            float isDepression = vPosition.y < -1.0 ? 1.0 : 0.0;
            
            // Blend colors based on terrain features
            vec3 color;
            
            if (isDepression > 0.0) {
              // Pond depression (darker, muddy)
              float depthFactor = clamp(abs(vPosition.y) / 5.0, 0.0, 1.0);
              float shoreFactor = 1.0 - depthFactor;
              color = mix(sandColor, dirtColor, depthFactor);
            } else if (slope > 0.4) {
              // Rocky slopes
              color = mix(dirtColor, rockColor, smoothstep(0.4, 0.7, slope));
            } else {
              // Grass with noise-based variation
              float grassMix = smoothstep(0.3, 0.7, snoise(vUv * 20.0) * 0.5 + 0.5);
              color = mix(grassColor, darkGrassColor, grassMix);
              
              // Add small grass tufts
              if (slope < 0.2 && smallNoise > 0.6) {
                color += vec3(0.02, 0.07, 0.02) * (smallNoise - 0.6) * 2.5;
              }
              
              // Mix in dirt in some areas
              float dirtAmount = smoothstep(0.4, 0.6, detailNoise);
              color = mix(color, dirtColor, dirtAmount * 0.3);
            }
            
            // Apply height and slope variations
            color = mix(color, rockColor, slope * slope);
            color = mix(color, darkGrassColor, heightFactor * 0.5);
            
            // Apply some noise-based lighting variation
            float lightVar = smallNoise * 0.05 + 0.95;
            color *= lightVar;
            
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      });

      const terrain = new THREE.Mesh(geometry, terrainMaterial);
      terrain.name = 'terrain';
      terrain.receiveShadow = true;
      scene.add(terrain);

      // --- Distant Mountains (unchanged) ---
      const mountainWidth = 2000; // Larger than playable area for horizon effect
      const mountainDepth = 200;  // Depth of the mountain range
      const mountainSegments = 64; // Higher segmentation for detail
      const mountainGeometry = new THREE.PlaneGeometry(mountainWidth, mountainDepth, mountainSegments, mountainSegments);
      mountainGeometry.rotateX(-Math.PI / 2);

      // Apply heightmap to mountain vertices
      const mountainHeightmap = new Float32Array((mountainSegments + 1) * (mountainSegments + 1));
      for (let x = 0; x <= mountainSegments; x++) {
        for (let z = 0; z <= mountainSegments; z++) {
          const nx = x / mountainSegments - 0.5;
          const nz = z / mountainSegments - 0.5;
          const largeScale = noise2D(nx * 2, nz * 2) * 50; // Tall, dramatic peaks
          const smallScale = noise2D(nx * 10, nz * 10) * 5; // Fine details
          mountainHeightmap[z * (mountainSegments + 1) + x] = Math.max(0, largeScale + smallScale); // No negative heights
        }
      }

      const mountainPositionAttribute = mountainGeometry.attributes.position;
      for (let i = 0; i < mountainPositionAttribute.count; i++) {
        const y = mountainHeightmap[i];
        mountainPositionAttribute.setY(i, y);
      }
      mountainGeometry.computeVertexNormals();

      const mountainMaterial = new THREE.ShaderMaterial({
        uniforms: {
          baseColor: { value: new THREE.Color(0x2F4F4F) }, // Dark slate gray for distant mountains
          heightFactor: { value: 0.5 },
        },
        vertexShader: `
          varying vec3 vPosition;
          varying vec3 vNormal;
          void main() {
            vPosition = position;
            vNormal = normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 baseColor;
          uniform float heightFactor;
          varying vec3 vPosition;
          varying vec3 vNormal;
          
          void main() {
            vec3 color = baseColor;
            // Height-based shading: higher areas are lighter
            float height = clamp(vPosition.y / 50.0, 0.0, 1.0);
            color = mix(color, vec3(0.5, 0.6, 0.6), height * heightFactor);
            // Lighting based on normal for depth
            float lighting = dot(vNormal, normalize(vec3(10.0, 20.0, 10.0)));
            color *= (0.5 + 0.5 * lighting);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      });

      const mountains = new THREE.Mesh(mountainGeometry, mountainMaterial);
      mountains.position.set(0, 0, -(terrainHeight / 2 + mountainDepth / 2 + 50)); // Beyond playable area
      scene.add(mountains);

      // --- Sky (unchanged) ---
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

      // --- Tree Positions (avoiding ponds) ---
      const positions: THREE.Vector3[] = [];
      for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * terrainWidth * 0.8; // Keep within bounds
        const z = (Math.random() - 0.5) * terrainHeight * 0.8;

        // Check if the position is inside a pond
        let isInPond = false;
        for (const pond of ponds) {
          const distance = new THREE.Vector2(x, z).distanceTo(pond.center);
          if (distance < pond.radius + 5) { // Add a buffer zone around ponds
            isInPond = true;
            break;
          }
        }

        if (!isInPond) {
          // Get terrain height at this position
          const y = getTerrainHeightAt(x, z, terrainWidth, terrainHeight, terrainSegments, heightmap);
          positions.push(new THREE.Vector3(x, y, z));
        }
      }
      setTreePositions(positions);

      // Save pond positions for rendering pond components
      const pondsList = ponds.map(pond => ({
        position: new THREE.Vector3(pond.center.x, 0, pond.center.y),
        size: pond.radius * 2,
        depth: pond.depth
      }));
      setPondPositions(pondsList);

      // Animation update for time uniform (grass movement)
      const updateTerrainShader = (delta: number) => {
        if (uniforms.time) {
          uniforms.time.value += delta * 0.5;
        }
      };
      const update = updateTerrainShader as ((delta: number) => void) & { _id?: string };
      update._id = 'terrainShaderUpdate';
      const removeUpdate = registerUpdate(update);

      // Export terrain height function for other components
      // @ts-expect-error - Property 'getTerrainHeight' does not exist on Window interface
      window.getTerrainHeight = (x: number, z: number) => {
        return getTerrainHeightAt(x, z, terrainWidth, terrainHeight, terrainSegments, heightmap);
      };

      // Helper function to get terrain height at a specific position
      function getTerrainHeightAt(
        x: number,
        z: number,
        width: number,
        height: number,
        segments: number,
        heightmapData: Float32Array
      ): number {
        // Convert world coordinates to heightmap indices
        const normalizedX = (x + width / 2) / width;
        const normalizedZ = (z + height / 2) / height;

        if (normalizedX < 0 || normalizedX > 1 || normalizedZ < 0 || normalizedZ > 1) {
          return 0; // Out of bounds
        }

        const xIndex = Math.floor(normalizedX * segments);
        const zIndex = Math.floor(normalizedZ * segments);

        // Bilinear interpolation for smooth height
        const x1 = Math.min(xIndex, segments - 1);
        const x2 = Math.min(x1 + 1, segments);
        const z1 = Math.min(zIndex, segments - 1);
        const z2 = Math.min(z1 + 1, segments);

        const xFrac = normalizedX * segments - x1;
        const zFrac = normalizedZ * segments - z1;

        const h00 = heightmapData[z1 * (segments + 1) + x1] || 0;
        const h10 = heightmapData[z1 * (segments + 1) + x2] || 0;
        const h01 = heightmapData[z2 * (segments + 1) + x1] || 0;
        const h11 = heightmapData[z2 * (segments + 1) + x2] || 0;

        // Interpolate
        const h0 = h00 * (1 - xFrac) + h10 * xFrac;
        const h1 = h01 * (1 - xFrac) + h11 * xFrac;

        return h0 * (1 - zFrac) + h1 * zFrac;
      }

      // Cleanup
      return () => {
        scene.remove(terrain);
        scene.remove(mountains);
        scene.remove(sky);
        geometry.dispose();
        terrainMaterial.dispose();
        mountainGeometry.dispose();
        mountainMaterial.dispose();
        skyGeometry.dispose();
        skyMaterial.dispose();
        removeUpdate();
        // @ts-expect-error - Property 'getTerrainHeight' does not exist on Window interface
        delete window.getTerrainHeight;
      };
    };

    const cleanup = setupWorld();

    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [scene, registerUpdate]);

  return (
    <>
      {treePositions.map((pos, index) => (
        <Tree key={`tree-${index}`} position={pos} scene={scene} />
      ))}
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
        />
      ))}
    </>
  );
}