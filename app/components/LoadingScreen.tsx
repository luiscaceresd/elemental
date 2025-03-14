'use client';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col justify-center items-center bg-black z-50">
      <div className="w-[50px] h-[50px] border-4 border-white/10 border-t-blue-700 rounded-full animate-spin mb-5"></div>
      <p className="text-white text-xl font-sans">Loading game assets...</p>
    </div>
  );
} 