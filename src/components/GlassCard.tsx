import React from 'react';
import { motion } from 'motion/react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export default function GlassCard({ children, className = '', delay = 0 }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay }}
      className={`bg-[#0F131A]/85 border border-nexa-border/80 rounded-2xl p-6 backdrop-blur-xl shadow-[0_15px_35px_rgba(0,0,0,0.6)] relative overflow-hidden ${className}`}
    >
      {/* Top ambient glare reflection */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"></div>
      
      {/* Dynamic contents */}
      {children}
    </motion.div>
  );
}
