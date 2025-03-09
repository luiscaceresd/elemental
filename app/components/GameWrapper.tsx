'use client';

import dynamic from 'next/dynamic';

// Use dynamic import with no SSR for the game component
const GameCanvas = dynamic(() => import('./GameCanvas'), { ssr: false });

export default function GameWrapper() {
  return <GameCanvas />;
} 