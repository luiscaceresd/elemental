'use client';

import { useEffect, useRef } from 'react';

interface PauseButtonProps {
  onPause: () => void;
  isMobile: boolean;
}

export default function PauseButton({ onPause, isMobile }: PauseButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Add a direct touch event handler for mobile devices
  useEffect(() => {
    if (!isMobile || !buttonRef.current) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault(); // Prevent default behavior
      e.stopPropagation(); // Stop event propagation
      onPause();
    };

    const buttonEl = buttonRef.current;
    buttonEl.addEventListener('touchstart', handleTouchStart, { passive: false });

    return () => {
      if (buttonEl) {
        buttonEl.removeEventListener('touchstart', handleTouchStart);
      }
    };
  }, [isMobile, onPause]);

  return (
    <div className="fixed top-4 right-4 z-[1001] flex flex-col items-end pointer-events-auto">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPause();
        }}
        className={`flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm border border-white/50
        hover:bg-black/75 hover:scale-105 active:scale-95 transition-all duration-200 
        focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent
        touch-manipulation pointer-events-auto
        ${isMobile ? 'w-14 h-14' : 'w-12 h-12'}`} // Smaller on mobile
        aria-label="Pause game"
        style={{
          // On mobile, use regular cursor; on desktop, show no cursor (pointer lock)
          cursor: isMobile ? 'pointer' : 'none',
          // Add shadow on mobile for better visibility
          boxShadow: isMobile ? '0 0 15px rgba(0,0,0,0.7)' : 'none',
          // Ensure the button is clickable with higher specificity
          pointerEvents: 'auto',
          // Add tap highlight color for mobile feedback
          WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.3)'
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-white ${isMobile ? 'w-7 h-7' : 'w-6 h-6'}`}
        >
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      </button>

      {/* Show keyboard hint only on desktop */}
      {!isMobile && (
        <div className="mt-2 text-white text-xs bg-black/40 backdrop-blur-sm px-2 py-1 rounded">
          Press Enter to pause
        </div>
      )}
    </div>
  );
} 