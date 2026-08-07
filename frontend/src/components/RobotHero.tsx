import React from 'react';
import { motion } from 'motion/react';

export default function RobotHero() {
  return (
    <div className="relative flex flex-col items-center justify-center py-6 select-none">
      {/* Cinematic Ambient Core Lights Behind */}
      <div className="absolute w-72 h-72 bg-gradient-to-tr from-nexa-blue/20 via-cyan-500/10 to-nexa-purple/20 rounded-full blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute w-44 h-44 bg-cyan-400/15 rounded-full blur-2xl -z-10 animate-[ping_4s_infinite]"></div>

      {/* Futuristic Planet/AI Energy Core Ring Overlay */}
      <div className="absolute w-60 h-60 rounded-full border border-cyan-400/20 -z-5 animate-spin duration-10000"></div>
      <div className="absolute w-48 h-48 rounded-full border border-nexa-purple/15 -z-5 animate-spin duration-7000"></div>

      {/* Rounded Glass Core Frame for the Portrait */}
      <div className="relative w-40 h-40 rounded-full p-1 bg-gradient-to-tr from-nexa-blue/60 via-cyan-400/40 to-nexa-purple/60 shadow-[0_0_35px_rgba(0,229,255,0.45)] backdrop-blur-md overflow-hidden flex items-center justify-center">
        {/* Transparent glass reflection overlay */}
        <div className="absolute inset-0.5 rounded-full bg-gradient-to-b from-white/20 to-transparent backdrop-blur-[1px] z-10 pointer-events-none"></div>

        {/* The actual premium generated Xena AI Robot avatar */}
        <img 
          src="/src/assets/images/nexa_robot_avatar_1784050933373.jpg" 
          alt="Xena AI Companion" 
          className="w-full h-full object-cover rounded-full select-none"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Pulse Status Glow */}
      <div className="mt-4 flex items-center space-x-1.5 bg-nexa-blue/10 border border-nexa-blue/20 rounded-full px-3.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-nexa-glow animate-pulse"></span>
        <span className="text-[9px] font-bold text-nexa-glow uppercase tracking-widest font-mono">Xena Companion Core Online</span>
      </div>
    </div>
  );
}
