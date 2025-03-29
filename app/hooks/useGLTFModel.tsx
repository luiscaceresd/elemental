import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { AnimationMixer, AnimationAction, AnimationClip } from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

interface UseGLTFModelOptions {
  scene: THREE.Scene;
  modelPath: string;
  position?: THREE.Vector3;
  scale?: THREE.Vector3;
  rotation?: THREE.Euler;
  name?: string;
  onLoaded?: (model: THREE.Group) => void;
}

interface ModelData {
  model: THREE.Group | null;
  mixer: AnimationMixer | null;
  actions: { [key: string]: AnimationAction };
  animations: AnimationClip[];
  gltf: GLTF | null;
}

export function useGLTFModel({
  scene,
  modelPath,
  position = new THREE.Vector3(0, 0, 0),
  scale = new THREE.Vector3(1, 1, 1),
  rotation = new THREE.Euler(0, 0, 0),
  name = 'gltfModel',
  onLoaded
}: UseGLTFModelOptions): ModelData {
  const [modelData, setModelData] = useState<ModelData>({
    model: null,
    mixer: null,
    actions: {},
    animations: [],
    gltf: null
  });

  useEffect(() => {
    let isActive = true; // Flag to handle component unmounting
    
    const loadModel = async () => {
      try {
        // Create DRACOLoader for compression
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        dracoLoader.setDecoderConfig({ type: 'js' });

        // Create GLTFLoader and attach DRACOLoader
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        
        // Extract the base path for textures
        const basePath = modelPath.substring(0, modelPath.lastIndexOf('/') + 1);
        
        // Set the resource path to help locate textures
        loader.setResourcePath(basePath);

        // Load the model
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(
            modelPath,
            (gltf) => resolve(gltf),
            (progress) => {
              // Log progress for large models
              if (progress.lengthComputable) {
                const percentComplete = (progress.loaded / progress.total) * 100;
                console.log(`Loading model: ${Math.round(percentComplete)}% complete`);
              }
            },
            (error) => {
              console.error(`Error loading model ${modelPath}:`, error);
              reject(error);
            }
          );
        });

        // If component unmounted during loading, stop processing
        if (!isActive) return;

        // Set up the model
        const model = gltf.scene;
        
        // Set model name for identification
        model.name = name;
        
        // Apply transformations
        model.position.copy(position);
        model.scale.copy(scale);
        model.rotation.copy(rotation);

        // Enable frustum culling for performance
        model.frustumCulled = true;

        // Enable shadows selectively for performance
        model.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            // Determine if this mesh should cast shadows 
            // (smaller/detail meshes don't need to cast shadows)
            const shouldCastShadow = node.geometry.boundingSphere && 
                                    node.geometry.boundingSphere.radius > 1.0;
            
            node.castShadow = shouldCastShadow;
            node.receiveShadow = true; // Most objects should receive shadows
            
            // Optimize materials
            if (node.material) {
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              materials.forEach(material => {
                // Set transparency only when needed
                material.transparent = material.opacity < 1.0;
                
                // Optimize textures if present
                if (material.map) {
                  material.map.anisotropy = 4; // Lower anisotropy for performance
                  material.map.minFilter = THREE.LinearMipmapLinearFilter;
                  material.map.magFilter = THREE.LinearFilter;
                  material.map.needsUpdate = true;
                }
                
                material.needsUpdate = true;
              });
            }
            
            // Apply frustum culling to individual meshes
            node.frustumCulled = true;
          }
        });

        // Add the model to the scene
        scene.add(model);

        // Set up animations if they exist
        let mixer: THREE.AnimationMixer | null = null;
        const actions: { [key: string]: AnimationAction } = {};
        
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          
          // Create animation actions
          gltf.animations.forEach((clip: AnimationClip) => {
            if (mixer) {
              const action = mixer.clipAction(clip);
              actions[clip.name] = action;
            }
          });
        }

        // Call onLoaded callback if provided
        if (onLoaded) {
          onLoaded(model);
        }

        // Update state with the model data
        setModelData({
          model,
          mixer,
          actions,
          animations: gltf.animations || [],
          gltf
        });
      } catch (error) {
        console.error(`Failed to load model ${modelPath}:`, error);
      }
    };

    loadModel();

    // Cleanup function
    return () => {
      isActive = false; // Prevent state updates after unmount
      
      if (modelData.model) {
        scene.remove(modelData.model);
        modelData.model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              const materials = Array.isArray(child.material) 
                ? child.material 
                : [child.material];
              
              materials.forEach(material => {
                Object.keys(material).forEach(prop => {
                  if (material[prop] && material[prop].dispose instanceof Function) {
                    material[prop].dispose();
                  }
                });
                material.dispose();
              });
            }
          }
        });
      }
      
      // Dispose of the DRACO loader
      const dracoLoader = new DRACOLoader();
      dracoLoader.dispose();
    };
  }, [scene, modelPath, position, scale, rotation, name, onLoaded]);

  // Call the onLoaded callback when the model is ready
  useEffect(() => {
    if (!modelData.model || !scene) return;
    
    // If we have a model and a scene, call the onLoaded callback
    if (onLoaded) {
      onLoaded(modelData.model);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, onLoaded]);

  return modelData;
} 