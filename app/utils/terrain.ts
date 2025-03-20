import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// Create noise generator with a random seed
const noise2D = createNoise2D();

// Terrain configuration
const TERRAIN_SCALE = 100; // Scale of the overall terrain
const TERRAIN_HEIGHT = 10; // Maximum height of terrain
const TERRAIN_DETAIL = 0.01; // Level of detail (frequency)
const TERRAIN_OCTAVES = 4; // Number of noise layers

/**
 * Get terrain height at a given position
 * @param x X coordinate
 * @param z Z coordinate
 * @returns Height value at the given position
 */
export function getTerrainHeight(x: number, z: number): number {
  // Base y-level
  let baseY = 0;
  
  // Scale factors for different noise frequencies
  const scale1 = 0.02; // Large scale features
  const scale2 = 0.1;  // Medium scale features
  const scale3 = 0.3;  // Small scale features
  
  // Track maximum possible amplitude
  let maxAmplitude = 0;
  let height = 0;
  
  // Apply multiple octaves of noise for natural looking terrain
  const amplitude1 = 10.0;
  maxAmplitude += amplitude1;
  height += noise2D(x * scale1, z * scale1) * amplitude1;
  
  const amplitude2 = 3.0;
  maxAmplitude += amplitude2;
  height += noise2D(x * scale2, z * scale2) * amplitude2;
  
  const amplitude3 = 1.0;
  maxAmplitude += amplitude3;
  height += noise2D(x * scale3, z * scale3) * amplitude3;
  
  // Normalize height to [0, 1] range
  const normalizedHeight = (height + maxAmplitude) / (maxAmplitude * 2);
  
  // Apply scaling for final terrain height
  const finalHeight = baseY + normalizedHeight * 20 - 10;
  
  // Create a depression for pond at position 20,20
  const pondX = 20;
  const pondZ = 20;
  const pondRadius = 15;
  const pondDepth = 3;
  
  const distanceToPond = Math.sqrt((x - pondX) ** 2 + (z - pondZ) ** 2);
  if (distanceToPond < pondRadius) {
    // Apply a smooth depression for the pond
    const pondFactor = 1 - Math.pow(distanceToPond / pondRadius, 2);
    const depression = pondDepth * pondFactor;
    return finalHeight - depression;
  }
  
  // Expose function on window for other components to use
  if (typeof window !== 'undefined') {
    (window as any).getTerrainHeight = getTerrainHeight;
  }
  
  return finalHeight;
}

/**
 * Get terrain normal at a given position
 * This is useful for aligning objects to the terrain
 * 
 * @param x - X coordinate
 * @param z - Z coordinate
 * @returns The normal vector at the specified position
 */
export function getTerrainNormal(x: number, z: number): THREE.Vector3 {
  // Sample points around the position to calculate normal
  const sampleDistance = 0.1;
  
  const heightCenter = getTerrainHeight(x, z);
  const heightX1 = getTerrainHeight(x + sampleDistance, z);
  const heightX2 = getTerrainHeight(x - sampleDistance, z);
  const heightZ1 = getTerrainHeight(x, z + sampleDistance);
  const heightZ2 = getTerrainHeight(x, z - sampleDistance);
  
  // Calculate normal using cross product of two tangent vectors
  const tangentX = new THREE.Vector3(2 * sampleDistance, heightX1 - heightX2, 0).normalize();
  const tangentZ = new THREE.Vector3(0, heightZ1 - heightZ2, 2 * sampleDistance).normalize();
  
  // Cross product gives us the normal
  const normal = new THREE.Vector3();
  normal.crossVectors(tangentZ, tangentX).normalize();
  
  return normal;
}

/**
 * Check if a position is underwater
 * 
 * @param position - The position to check
 * @param waterLevel - The water level (default: 0)
 * @returns True if the position is underwater
 */
export function isUnderwater(position: THREE.Vector3, waterLevel = 0): boolean {
  const terrainHeight = getTerrainHeight(position.x, position.z);
  return position.y < waterLevel && position.y > terrainHeight;
}

/**
 * Generate terrain geometry
 * 
 * @param width - Width of the terrain
 * @param depth - Depth of the terrain
 * @param widthSegments - Number of width segments
 * @param depthSegments - Number of depth segments
 * @returns PlaneGeometry with height data
 */
export function generateTerrainGeometry(
  width = TERRAIN_SCALE,
  depth = TERRAIN_SCALE,
  widthSegments = 100,
  depthSegments = 100
): THREE.PlaneGeometry {
  // Create base plane geometry
  const geometry = new THREE.PlaneGeometry(
    width,
    depth,
    widthSegments,
    depthSegments
  );
  
  // Rotate to be horizontal (XZ plane)
  geometry.rotateX(-Math.PI / 2);
  
  // Get vertex positions
  const position = geometry.attributes.position;
  
  // Update y position of each vertex based on noise
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    
    // Set y value to terrain height
    position.setY(i, getTerrainHeight(x, z));
  }
  
  // Update geometry
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  
  return geometry;
} 