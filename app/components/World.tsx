'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import Tree from './Tree';

interface WorldProps {
  scene: THREE.Scene;
}

export default function World({ scene }: WorldProps) {
  const [treePositions, setTreePositions] = useState<THREE.Vector3[]>([]);

  useEffect(() => {
    const setupWorld = async () => {
      const THREE = await import('three');

      // --- Flat Terrain ---
      const terrainWidth = 1000; // Size of the flat playable area
      const terrainHeight = 1000;
      const geometry = new THREE.PlaneGeometry(terrainWidth, terrainHeight, 1, 1); // Low segmentation for flatness
      geometry.rotateX(-Math.PI / 2); // Lay flat on the ground

      const terrainMaterial = new THREE.ShaderMaterial({
        uniforms: {
          baseColor: { value: new THREE.Color(0x228B22) }, // Forest green
          noiseScale: { value: 0.1 },
        },
        vertexShader: `
          varying vec3 vPosition;
          void main() {
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 baseColor;
          uniform float noiseScale;
          varying vec3 vPosition;
          
          float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
          }
          
          void main() {
            vec2 st = vPosition.xz * noiseScale;
            float noise = random(st);
            vec3 color = baseColor * (0.8 + 0.2 * noise); // Slight texture variation
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      });

      const terrain = new THREE.Mesh(geometry, terrainMaterial);
      terrain.name = 'terrain';
      scene.add(terrain);

      // --- Distant Mountains ---
      const noise2D = createNoise2D();
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

      // --- Tree Positions (on flat terrain) ---
      const positions: THREE.Vector3[] = [];
      for (let i = 0; i < 20; i++) {
        const x = (Math.random() - 0.5) * terrainWidth * 0.8; // Keep within bounds
        const z = (Math.random() - 0.5) * terrainHeight * 0.8;
        const y = 0; // Flat terrain, no height variation
        positions.push(new THREE.Vector3(x, y, z));
      }
      setTreePositions(positions);

      // Export flat terrain height for character controller
      // @ts-ignore
      window.getTerrainHeight = (x: number, z: number) => {
        // Return 0 for flat terrain within playable area
        if (Math.abs(x) < terrainWidth / 2 && Math.abs(z) < terrainHeight / 2) {
          return 0;
        }
        // Fallback for outside bounds (though unreachable)
        return 0;
      };

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
        // @ts-ignore
        delete window.getTerrainHeight;
      };
    };

    const cleanup = setupWorld();

    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [scene]);

  return (
    <>
      {treePositions.map((pos, index) => (
        <Tree key={index} position={pos} scene={scene} />
      ))}
    </>
  );
}