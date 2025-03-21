'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface WaterMeterProps {
  requiredWater: number;
  chargeLevel?: number;
  isCharging?: boolean;
  // Remove currentWater and maxWater as we'll get these from the global system
}

/**
 * WaterMeter component displays the current water amount as a filling bar
 * It also shows a pulsing effect when there's enough water for an ability
 */
export default function WaterMeter({ 
  requiredWater,
  chargeLevel = 0,
  isCharging = false
}: WaterMeterProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const [currentWater, setCurrentWater] = useState(0);
  const maxWater = 100; // Match MAX_WATER_CAPACITY from WaterBendingMain.tsx

  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Connect to the global water system
  useEffect(() => {
    const updateWaterAmount = () => {
      if (window.waterBendingSystem?.getWaterAmount) {
        setCurrentWater(window.waterBendingSystem.getWaterAmount());
      }
    };
    
    // Initial update
    updateWaterAmount();
    
    // Set up interval to update water amount regularly
    const intervalId = setInterval(updateWaterAmount, 100);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Show pulse effect when there's enough water for an ability
  useEffect(() => {
    if (currentWater >= requiredWater) {
      setShowPulse(true);
    } else {
      setShowPulse(false);
    }
  }, [currentWater, requiredWater]);

  // Calculate the fill percentage
  const fillPercentage = Math.min(100, (currentWater / maxWater) * 100);
  
  // Calculate the required water level percentage
  const requiredPercentage = (requiredWater / maxWater) * 100;

  return (
    <div 
      className="fixed pointer-events-none flex items-center justify-center"
      style={{
        bottom: isMobile ? '100px' : '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
      }}
    >
      {/* Water Meter Container */}
      <div className="relative h-6 w-64 bg-black bg-opacity-50 rounded-full overflow-hidden">
        {/* Required water level indicator */}
        <div 
          className="absolute h-full w-px bg-white opacity-50"
          style={{ left: `${requiredPercentage}%` }}
        />
        
        {/* Fill */}
        <div 
          className="h-full bg-blue-400"
          style={{ 
            width: `${fillPercentage}%`,
            background: 'linear-gradient(90deg, #00a3ff, #00d2ff)',
            transition: 'width 0.3s ease-out'
          }}
        />
        
        {/* Charge indicator */}
        {isCharging && (
          <div 
            className="absolute top-0 h-full bg-white bg-opacity-30"
            style={{ 
              width: `${chargeLevel * 100}%`,
              transition: 'width 0.1s ease-out'
            }}
          />
        )}
        
        {/* Pulse effect when enough water is collected */}
        {showPulse && (
          <motion.div
            className="absolute inset-0 rounded-full bg-blue-400 bg-opacity-30"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 2,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />
        )}
        
        {/* Ripple effect */}
        {currentWater >= requiredWater && (
          <motion.div
            className="absolute inset-0 rounded-full border border-blue-400"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{
              scale: [1, 1.3],
              opacity: [0.8, 0],
            }}
            transition={{
              duration: 1.5,
              ease: "easeOut",
              repeat: Infinity,
            }}
          />
        )}
      </div>
    </div>
  );
} 