/**
 * Shader code for water drop particles
 */

export const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  
  void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform float time;
  uniform vec3 color;
  uniform float opacity;
  
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  
  void main() {
    // Basic lighting
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diffuse = max(0.0, dot(vNormal, lightDir));
    
    // Simpler shimmer effect
    float shimmer = sin(vPosition.x * 5.0 + time * 2.0) * 
                   sin(vPosition.z * 5.0 + time * 3.0);
    shimmer = shimmer * 0.1 + 0.9; // Scale to 0.9-1.0 range
    
    // Combine effects
    vec3 finalColor = color * shimmer * (diffuse * 0.7 + 0.3);
    
    gl_FragColor = vec4(finalColor, opacity);
  }
`;

// Create a named object for export
const waterDropShaders = { vertexShader, fragmentShader };

export default waterDropShaders; 