'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import StartScreen from './StartScreen';
import LoadingScreen from './LoadingScreen';
import PauseMenu from './PauseMenu';
import PauseButton from './PauseButton';

// Use dynamic import with no SSR for the game component
// Add loading indicator while the game is loading
const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <LoadingScreen />
});

export default function GameWrapper() {
  const [gameState, setGameState] = useState<'start' | 'playing' | 'paused'>('start');
  const [isMobile, setIsMobile] = useState(false);
  const pointerLockRequestedRef = useRef(false);
  const pointerLockTimerRef = useRef<number | null>(null);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      return typeof window !== 'undefined' &&
        (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
          || window.innerWidth < 768);
    };

    setIsMobile(checkMobile());

    // Handle resize for responsive detection
    const handleResize = () => {
      setIsMobile(checkMobile());
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Monitor and handle pointer lock state changes
  useEffect(() => {
    const handlePointerLockChange = () => {
      // Reset the request flag whenever pointer lock state changes
      pointerLockRequestedRef.current = false;

      // If playing and pointer is unlocked, show pause menu
      if (gameState === 'playing' && document.pointerLockElement === null && !isMobile) {
        // Brief delay to avoid immediate state changes
        setTimeout(() => {
          setGameState('paused');
        }, 100);
      }
    };

    // Handle pointer lock errors
    const handlePointerLockError = (e: Event) => {
      pointerLockRequestedRef.current = false;

      // If we tried to enter playing state but pointer lock failed, force pause
      if (gameState === 'playing' && !isMobile) {
        setTimeout(() => {
          setGameState('paused');
        }, 100);
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);

      // Clear any pending timers
      if (pointerLockTimerRef.current) {
        clearTimeout(pointerLockTimerRef.current);
      }
    };
  }, [gameState, isMobile]);

  // Handler for starting the game
  const handleStartGame = useCallback(() => {
    setGameState('playing');

    // We don't request pointer lock here - we'll let CameraController handle it
    // Instead, we're monitoring pointer lock state changes
  }, []);

  // Handler for pausing the game
  const handlePauseGame = useCallback(() => {
    setGameState('paused');

    // Only try to release pointer lock if currently locked
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (error) {
        // Failed to release pointer lock
      }
    }
  }, []);

  // Handler for resuming the game
  const handleResumeGame = useCallback(() => {
    // Mark that we intend to resume
    setGameState('playing');

    // Game's CameraController will handle pointer lock
    // as the user needs to click on the canvas to resume
  }, []);

  // Handler for exiting to start screen
  const handleExitGame = useCallback(() => {
    // Release pointer lock if active
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (error) {
        // Failed to release pointer lock
      }
    }

    setGameState('start');
  }, []);

  // Add keyboard listener for Enter key to pause/resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard when actually playing or paused
      if (gameState !== 'start') {
        // Enter key or Escape toggles pause state
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault(); // Prevent default browser actions for these keys

          if (gameState === 'playing') {
            handlePauseGame();
          } else if (gameState === 'paused') {
            handleResumeGame();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameState, handlePauseGame, handleResumeGame]);

  // Create a custom style for hiding UI elements when paused
  useEffect(() => {
    // Add a style element if it doesn't exist
    if (!document.getElementById('game-pause-styles')) {
      const style = document.createElement('style');
      style.id = 'game-pause-styles';
      style.textContent = `
        .game-paused .hide-when-paused {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      // Leave the style in place for reuse
    };
  }, []);

  return (
    <>
      {gameState === 'start' && <StartScreen onStart={handleStartGame} />}

      {(gameState === 'playing' || gameState === 'paused') && (
        <div className={gameState === 'paused' ? 'game-paused' : ''}>
          <GameCanvas gameState={gameState} />
          {gameState === 'playing' && (
            <PauseButton
              onPause={handlePauseGame}
              isMobile={isMobile}
            />
          )}
          {gameState === 'paused' && (
            <PauseMenu onResume={handleResumeGame} onExit={handleExitGame} />
          )}
        </div>
      )}
    </>
  );
} 