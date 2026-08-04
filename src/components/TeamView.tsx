import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Users, Shield, Cpu, Code, Sparkles, Star, Rocket, HelpCircle } from 'lucide-react';

interface TeamViewProps {
  onBack: () => void;
}

export default function TeamView({ onBack }: TeamViewProps) {
  const founder = {
    name: 'Yoba Stephane',
    role: 'Project Founder & Lead Architect',
    desc: 'Formulated the initial core vision, system architectures, and dark slate visual layouts.',
    avatar: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?auto=format&fit=crop&w=150&q=80', // Premium studio portrait of Black male professional
  };

  const devTeam = [
    {
      name: 'Elena Rostova',
      role: 'Core AI Engineer',
      desc: 'Formulates structured output schemas, agent parsing trees, and Google GenAI telemetry.',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80', // Professional Black female
    },
    {
      name: 'Lucas Dupont',
      role: 'Backend Systems Engineer',
      desc: 'Manages pgSQL cloud database migrations, container infrastructure, and server security.',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80', // Professional Black male
    },
    {
      name: 'Niko Tanaka',
      role: 'Lead UI/UX Architect',
      desc: 'Designed the Xena AI interactive glass core visual identity, typography, and motion paths.',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80', // Professional Black male
    },
    {
      name: 'Chloe Laurent',
      role: 'Mobile Software Developer',
      desc: 'Bridges cross-platform web client features, media capture handlers, and local caching.',
      avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=150&q=80', // Professional Black female
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] text-white px-4 pt-4 pb-20 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button 
          onClick={onBack}
          className="p-2 rounded-lg bg-nexa-card hover:bg-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold font-display tracking-tight text-white">Xena AI Team</h1>
          <p className="text-[10px] text-gray-400">The startup founders, engineers, and designers crafting Xena AI</p>
        </div>
      </div>

      {/* Intro Banner */}
      <div className="bg-gradient-to-r from-nexa-blue/15 to-nexa-purple/15 border border-nexa-blue/30 rounded-2xl p-4.5 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-nexa-blue/10 rounded-full blur-2xl"></div>
        <div className="flex items-start space-x-3.5 relative z-10">
          <div className="p-2.5 bg-slate-900/80 border border-nexa-blue/30 rounded-xl text-nexa-glow flex-shrink-0">
            <Users className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">Elite Digital Craft</h2>
            <p className="text-[10.5px] text-gray-400 mt-1 leading-relaxed">
              We operate as a high-velocity product division. Our design and system specifications center on privacy, responsiveness, and zero-compromise security.
            </p>
          </div>
        </div>
      </div>

      {/* FOUNDER SECTION */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center space-x-2 pl-1">
          <Star className="w-3.5 h-3.5 text-nexa-glow" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Founder</span>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-tr from-[#111621] to-[#161D2B] border-2 border-nexa-blue/40 rounded-2xl p-4 flex items-start space-x-4 relative overflow-hidden group hover:border-nexa-glow transition duration-300"
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-nexa-glow/5 rounded-full blur-xl group-hover:bg-nexa-glow/10 transition"></div>
          
          <div className="w-14 h-14 rounded-full border-2 border-nexa-glow/50 overflow-hidden flex-shrink-0 shadow-lg shadow-nexa-blue/10">
            <img 
              src={founder.avatar} 
              alt={founder.name} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="space-y-1">
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-white font-display">{founder.name}</span>
              <span className="text-[10px] text-nexa-glow font-mono font-medium tracking-wide uppercase">{founder.role}</span>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed pr-2">
              {founder.desc}
            </p>
          </div>
        </motion.div>
      </div>

      {/* DEVELOPMENT TEAM SECTION */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center space-x-2 pl-1">
          <Code className="w-3.5 h-3.5 text-nexa-purple" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Development Division</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {devTeam.map((member, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#111621]/90 border border-nexa-border rounded-xl p-3.5 flex items-start space-x-3.5 hover:border-nexa-purple/40 transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-full border border-nexa-border overflow-hidden flex-shrink-0">
                <img 
                  src={member.avatar} 
                  alt={member.name} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="leading-tight">
                  <div className="text-xs font-bold text-white truncate font-display">{member.name}</div>
                  <div className="text-[9px] text-nexa-purple font-semibold font-mono tracking-wide uppercase truncate mt-0.5">{member.role}</div>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal line-clamp-2">
                  {member.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* FUTURE CONTRIBUTORS SECTION */}
      <div className="bg-[#111621]/90 border border-nexa-border rounded-2xl p-4.5 space-y-3 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-nexa-purple/10 rounded-full blur-2xl"></div>
        
        <div className="flex items-center space-x-2 pb-2 border-b border-nexa-border/50">
          <Rocket className="w-4 h-4 text-nexa-glow animate-pulse" />
          <h3 className="text-xs font-bold text-white font-display uppercase tracking-wider">Future Contributors</h3>
        </div>

        <p className="text-[11px] text-gray-300 leading-relaxed">
          Xena AI is built to evolve with a community of innovators. Our long-term mission focuses on collaborative integrations, community-built workflow blocks, and highly granular localization presets.
        </p>

        <div className="pt-1.5">
          <span className="inline-flex items-center space-x-1.5 bg-nexa-blue/10 border border-nexa-blue/20 rounded-full px-3 py-1 text-[9px] font-mono text-nexa-glow uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-nexa-glow animate-pulse"></span>
            <span>Open Source Telemetry Hub Coming Soon</span>
          </span>
        </div>
      </div>

      <p className="text-[9px] text-gray-600 text-center mt-6 font-mono uppercase">
        STEVEZALI INC • SECURE INTELLIGENCE NETWORKS
      </p>
    </div>
  );
}
