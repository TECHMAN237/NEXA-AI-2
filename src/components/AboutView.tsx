import React from 'react';
import { ArrowLeft, Sparkles, Shield, Cpu, Flame, Code } from 'lucide-react';

interface AboutViewProps {
  onBack: () => void;
}

export default function AboutView({ onBack }: AboutViewProps) {
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
          <h1 className="text-xl font-bold font-display tracking-tight text-white">About NEXA AI</h1>
          <p className="text-[10px] text-gray-400">Our core vision, platform values, technology stack & telemetry</p>
        </div>
      </div>

      {/* Brand card */}
      <div className="relative overflow-hidden rounded-2xl border border-nexa-border bg-[#111621] p-6 mb-5 text-center flex flex-col items-center">
        {/* Decorative backdrop glow */}
        <div className="absolute w-56 h-56 bg-nexa-blue/10 rounded-full blur-3xl -top-10 -right-10"></div>
        <div className="absolute w-40 h-40 bg-nexa-purple/10 rounded-full blur-3xl -bottom-10 -left-10"></div>

        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-nexa-blue to-nexa-purple flex items-center justify-center shadow-lg shadow-nexa-blue/20 mb-4 z-10">
          <span className="text-2xl font-black text-white font-display tracking-widest">N</span>
        </div>

        <h2 className="text-lg font-extrabold font-display text-white z-10">NEXA Intelligent Core</h2>
        <span className="text-[9px] font-mono tracking-widest text-nexa-glow bg-nexa-blue/10 border border-nexa-glow/20 px-2.5 py-0.5 rounded-full uppercase mt-1.5 z-10">
          BUILD v1.0.4 • DEPLOYED
        </span>

        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed max-w-sm z-10">
          NEXA is a highly secure, private-first micro-assistant designed to streamline university workflows, automated study scheduling, and timeline management.
        </p>
      </div>

      {/* Mission block */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-300 font-display uppercase tracking-wider">Our Core Directives</h3>
        
        <div className="space-y-3 pt-1">
          <div className="flex items-start space-x-3">
            <div className="p-1.5 rounded-lg bg-nexa-blue/10 text-nexa-glow mt-0.5">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Cryptographic Isolation</div>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                We believe your schedules and notes belong solely to you. NEXA runs locally-cached sandboxed interactions.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="p-1.5 rounded-lg bg-nexa-purple/10 text-purple-400 mt-0.5">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Gemini Pro Grounding</div>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                Our parsing model uses the latest standard @google/genai SDK to safely analyze unstructured conversational commands.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 mt-0.5">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Absolute Zero Ad-Tracking</div>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                NEXA contains zero tracking pixels, diagnostic cookies or telemetry monitors. All analytics are completely anonymous.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Technology Specifications */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 space-y-2.5">
        <h3 className="text-xs font-semibold text-gray-300 font-display uppercase tracking-wider pb-1.5 border-b border-nexa-border/50">Specifications</h3>
        
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">Front-End Frame</span>
          <span className="font-semibold text-white">React 19 + Tailwind CSS v4</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">Type System</span>
          <span className="font-semibold text-white">TypeScript Strict Mode</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">Database Engine</span>
          <span className="font-semibold text-white">PostgreSQL via Cloud SQL API</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">Hosting Pipeline</span>
          <span className="font-semibold text-white">Google Cloud Run Serverless</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">Security Rule</span>
          <span className="font-semibold text-white">SHA-256 Hashed Handshake</span>
        </div>
      </div>

      <p className="text-[9px] text-gray-600 text-center mt-6 font-mono uppercase">
        © 2026 STEEVEZALI INC. ALL RIGHTS RESERVED WORLDWIDE.
      </p>
    </div>
  );
}
