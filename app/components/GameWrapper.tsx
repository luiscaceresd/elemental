'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import StartScreen from './StartScreen';
import LoadingScreen from './LoadingScreen';

// Use dynamic import with no SSR for the game component
// Add loading indicator while the game is loading
const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <LoadingScreen />
});

export default function GameWrapper() {
  const [gameStarted, setGameStarted] = useState(false);

  // Handler for starting the game
  const handleStartGame = useCallback(() => {
    setGameStarted(true);
    // Request pointer lock when game starts (will be used by game controls)
    // but do it with a small delay to allow for smooth transition
    setTimeout(() => {
      try {
        // The pointer lock might not work immediately if user hasn't interacted with the page
        const canvas = document.querySelector('canvas');
        if (canvas) {
          canvas.focus();
          // This is just an attempt - the CameraController will handle pointer lock properly
        }
      } catch (error) {
        console.warn('Could not automatically request pointer lock:', error);
      }
    }, 100);
  }, []);

  return (
    <>
      {!gameStarted && <StartScreen onStart={handleStartGame} />}
      {gameStarted && <GameCanvas />}
    </>
  );
} 