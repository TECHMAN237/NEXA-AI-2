import React from 'react';
import { motion } from 'motion/react';

interface PrimaryButtonProps {
  children: React.ReactNode;
  isLoading?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'submit' | 'button' | 'reset';
  disabled?: boolean;
}

export default function PrimaryButton({ 
  children, 
  isLoading, 
  className = '', 
  onClick, 
  type = 'button', 
  disabled 
}: PrimaryButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      type={type}
      disabled={isLoading || disabled}
      className={`w-full bg-gradient-to-tr from-nexa-blue/90 via-cyan-500/80 to-nexa-purple/90 hover:from-nexa-blue hover:to-nexa-purple border border-cyan-400/40 text-white font-display text-xs font-extrabold uppercase tracking-widest py-3 px-6 rounded-xl transition-all duration-300 cursor-pointer shadow-[0_0_20px_rgba(0,229,255,0.25)] hover:shadow-[0_0_30px_rgba(0,229,255,0.45)] flex items-center justify-center space-x-2 relative overflow-hidden ${
        isLoading ? 'opacity-80 cursor-wait' : ''
      } ${className}`}
    >
      {/* Glare effect inside button */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>

      {isLoading ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span>Synchronizing...</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  );
}
