'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

interface PauseMenuProps {
  onResume: () => void;
  onExit: () => void;
}

export default function PauseMenu({ onResume, onExit }: PauseMenuProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const exitButtonRef = useRef<HTMLButtonElement>(null);

  // Check if device is mobile
  useEffect(() => {
    setIsMobile(
      typeof window !== 'undefined' &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth < 768)
    );
  }, []);

  // Handle resume button click - wrap in useCallback to prevent recreation on each render
  const handleResume = useCallback(() => {
    setFadeOut(true);
    // Delay the onResume callback to allow for fade out animation
    setTimeout(() => {
      onResume();

      // For desktop, add a hint about clicking the canvas
      if (!isMobile) {
        setTimeout(() => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            // Brief flash effect on the canvas to indicate it needs to be clicked
            canvas.classList.add('canvas-highlight');
            setTimeout(() => {
              canvas.classList.remove('canvas-highlight');
            }, 300);
          }
        }, 100);
      }
    }, 500);
  }, [onResume, isMobile]);

  // Handle exit button click - wrap in useCallback to prevent recreation on each render
  const handleExit = useCallback(() => {
    setFadeOut(true);
    // Delay the onExit callback to allow for fade out animation
    setTimeout(() => {
      onExit();
    }, 500);
  }, [onExit]);

  // Add direct touch event handlers for mobile
  useEffect(() => {
    if (!isMobile) return;

    // Store ref values in local variables to use in cleanup
    const resumeButton = resumeButtonRef.current;
    const exitButton = exitButtonRef.current;

    const handleResumeTouch = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleResume();
    };

    const handleExitTouch = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleExit();
    };

    if (resumeButton) {
      resumeButton.addEventListener('touchstart', handleResumeTouch, { passive: false });
    }

    if (exitButton) {
      exitButton.addEventListener('touchstart', handleExitTouch, { passive: false });
    }

    return () => {
      if (resumeButton) {
        resumeButton.removeEventListener('touchstart', handleResumeTouch);
      }
      if (exitButton) {
        exitButton.removeEventListener('touchstart', handleExitTouch);
      }
    };
  }, [isMobile, handleResume, handleExit]);

  // Auto-focus the resume button when component mounts
  useEffect(() => {
    const resumeButton = document.getElementById('resume-button');
    if (resumeButton) resumeButton.focus();
  }, []);

  // Set up some basic styles for canvas highlight
  useEffect(() => {
    // Add a style element if it doesn't exist
    if (!document.getElementById('canvas-highlight-style')) {
      const style = document.createElement('style');
      style.id = 'canvas-highlight-style';
      style.textContent = `
        .canvas-highlight {
          outline: 3px solid rgba(255, 255, 255, 0.5);
          outline-offset: -3px;
          animation: pulse-outline 0.3s ease-in-out;
        }
        @keyframes pulse-outline {
          0% { outline-color: rgba(255, 255, 255, 0); }
          50% { outline-color: rgba(255, 255, 255, 0.8); }
          100% { outline-color: rgba(255, 255, 255, 0.5); }
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      // We'll leave the style in place as it might be needed again
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 flex flex-col justify-end items-center z-50 transition-opacity duration-500 ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
    >
      {/* Background Images - separate desktop and mobile versions */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-black">
        {/* Mobile Background (hidden on md screens and above) */}
        <div className="relative w-full h-full block md:hidden">
          <Image
            src="/images/StartScreenMobile.webp"
            alt="Elemental Game - Paused"
            priority
            quality={100}
            width={1125}
            height={2436}
            sizes="100vw"
            style={{
              objectFit: 'cover',
              objectPosition: 'center'
            }}
            className="brightness-75" // Slightly darker for pause screen
          />
        </div>

        {/* Desktop Background (hidden on small screens) */}
        <div className="relative w-full h-full hidden md:block">
          <Image
            src="/images/StartScreen.webp"
            alt="Elemental Game - Paused"
            priority
            quality={100}
            fill
            sizes="100vw"
            style={{
              objectFit: 'cover',
              objectPosition: 'center'
            }}
            className="brightness-75" // Slightly darker for pause screen
          />
        </div>
      </div>

      {/* Pause text */}
      <div className="z-10 w-full flex justify-center mb-auto mt-56 sm:mt-96 animate-fadeIn">
        <h1 className="text-4xl md:text-6xl text-white font-light uppercase tracking-widest">
          Paused
        </h1>
      </div>

      {/* Menu buttons container positioned at the bottom */}
      <div className="z-[1000] w-full flex flex-col items-center gap-4 mb-16 animate-fadeIn pointer-events-auto">
        <button
          id="resume-button"
          ref={resumeButtonRef}
          className="px-10 py-4 text-xl bg-black/60 backdrop-blur-sm border border-white/50 text-white font-light uppercase tracking-widest rounded-full w-64
          hover:bg-black/75 hover:border-white/70 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]
          focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent
          transition-all duration-300 ease-out pointer-events-auto touch-manipulation"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleResume();
          }}
          style={{
            pointerEvents: 'auto',
            WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.3)'
          }}
          autoFocus
        >
          Resume
        </button>

        <button
          id="exit-button"
          ref={exitButtonRef}
          className="px-10 py-4 text-xl bg-black/60 backdrop-blur-sm border border-white/50 text-white font-light uppercase tracking-widest rounded-full w-64
          hover:bg-black/75 hover:border-white/70 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]
          focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent
          transition-all duration-300 ease-out pointer-events-auto touch-manipulation"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleExit();
          }}
          style={{
            pointerEvents: 'auto',
            WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.3)'
          }}
        >
          Exit
        </button>

        {/* Keyboard shortcuts info - only shown on desktop */}
        {!isMobile && (
          <div className="mt-4 text-white text-sm bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full">
            Press Enter or Escape to resume
          </div>
        )}
      </div>
    </div>
  );
} 