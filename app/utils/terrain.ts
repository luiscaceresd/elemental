import * as THREE from 'three';
import SimplexNoise from 'simplex-noise';

// Initialize simplex noise
const simplex = new SimplexNoise();

// Terrain configuration
const TERRAIN_SCALE = 100; // Scale of the overall terrain
const TERRAIN_HEIGHT = 10; // Maximum height of terrain
const TERRAIN_DETAIL = 0.01; // Level of detail (frequency)
const TERRAIN_OCTAVES = 4; // Number of noise layers

/**
 * Get the height of the terrain at a given x,z position
 * 
 * @param x - X coordinate
 * @param z - Z coordinate 
 * @returns The height (y value) at the specified position
 */
export function getTerrainHeight(x: number, z: number): number {
  let height = 0;
  let amplitude = 1;
  let frequency = TERRAIN_DETAIL;
  
  // Sum multiple octaves of noise for more natural terrain
  for (let i = 0; i < TERRAIN_OCTAVES; i++) {
    // Get noise value at this position and frequency
    const noiseValue = simplex.noise2D(x * frequency, z * frequency);
    
    // Add to total height
    height += noiseValue * amplitude;
    
    // Adjust for next octave
    amplitude *= 0.5;
    frequency *= 2;
  }
  
  // Scale to desired height range and normalize to 0-1 range first
  height = (height + 1) * 0.5 * TERRAIN_HEIGHT;
  
  return height;
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