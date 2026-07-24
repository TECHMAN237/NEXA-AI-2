import React from 'react';
import { motion } from 'motion/react';

interface SocialButtonProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

export default function SocialButton({ 
  children, 
  icon, 
  className = '', 
  onClick, 
  disabled 
}: SocialButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`w-full bg-[#111621] border border-nexa-border hover:border-gray-600 rounded-xl py-3 px-6 text-xs font-bold text-gray-200 hover:text-white flex items-center justify-center space-x-2.5 transition duration-250 cursor-pointer ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </motion.button>
  );
}
