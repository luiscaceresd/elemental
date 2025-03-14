'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface StartScreenProps {
  onStart: () => void;
}

export default function StartScreen({ onStart }: StartScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  // Handle start button click
  const handleStart = () => {
    setFadeOut(true);
    // Delay the onStart callback to allow for fade out animation
    setTimeout(() => {
      onStart();
    }, 500);
  };

  // Auto-focus the start button when component mounts
  useEffect(() => {
    const startButton = document.getElementById('start-button');
    if (startButton) startButton.focus();
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
            alt="Elemental Game - A character overlooking a mystical arena"
            priority
            quality={100}
            width={1125}
            height={2436}
            sizes="100vw"
            style={{
              objectFit: 'cover',
              objectPosition: 'center'
            }}
            className="brightness-90"
          />
        </div>

        {/* Desktop Background (hidden on small screens) */}
        <div className="relative w-full h-full hidden md:block">
          <Image
            src="/images/StartScreen.webp"
            alt="Elemental Game - A character overlooking a mystical arena"
            priority
            quality={100}
            width={1920}
            height={1080}
            sizes="100vw"
            style={{
              objectFit: 'contain',
              objectPosition: 'center'
            }}
            className="brightness-90"
          />
        </div>
      </div>

      {/* Minimalistic button container positioned at the bottom */}
      <div className="z-10 w-full flex justify-center mb-16 animate-fadeIn">
        <button
          id="start-button"
          className="px-10 py-4 text-xl bg-black/40 backdrop-blur-sm border border-white/30 text-white font-light uppercase tracking-widest rounded-full 
          hover:bg-black/60 hover:border-white/50 hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]
          focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-transparent
          transition-all duration-300 ease-out"
          onClick={handleStart}
          autoFocus
        >
          Start Game
        </button>
      </div>
    </div>
  );
} 