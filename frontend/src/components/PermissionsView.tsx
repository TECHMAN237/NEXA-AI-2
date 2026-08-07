import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Mic, Bell, Calendar, MapPin, Layers, Cpu, Shield, HelpCircle, Check, AlertCircle } from 'lucide-react';
import { ProfileService } from '../services/ProfileService.js';

interface PermissionsViewProps {
  onBack: () => void;
}

interface PermissionItem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
}

export default function PermissionsView({ onBack }: PermissionsViewProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    microphone: true,
    notifications: true,
    calendar: true,
    location: false,
    connectedApps: true,
    deviceAutomation: false,
  });

  const [message, setMessage] = useState('');

  // Load from ProfileService on mount
  useEffect(() => {
    const loadPermissions = async () => {
      const saved = await ProfileService.getPermissions();
      setPermissions(saved);
    };
    loadPermissions();
  }, []);

  const handleToggle = async (id: string) => {
    const nextState = {
      ...permissions,
      [id]: !permissions[id]
    };
    setPermissions(nextState);
    await ProfileService.savePermissions(nextState);
    
    setMessage(`Permission '${id}' ${nextState[id] ? 'enabled' : 'disabled'}!`);
    setTimeout(() => setMessage(''), 2500);
  };

  const permissionList: PermissionItem[] = [
    {
      id: 'microphone',
      name: 'Microphone Access',
      description: 'Used by the Xena Voice Assistant and Orb voice commands to hear and understand instructions.',
      icon: Mic,
      color: 'text-blue-500 bg-blue-500/10'
    },
    {
      id: 'notifications',
      name: 'Push Notifications & Alarms',
      description: 'Allows Xena AI to alert you about system alarms, calendar clashes, and countdown reminders.',
      icon: Bell,
      color: 'text-amber-500 bg-amber-500/10'
    },
    {
      id: 'calendar',
      name: 'Local Calendar Access',
      description: 'Required to automatically sync and write planned study goals and custom reminders.',
      icon: Calendar,
      color: 'text-teal-500 bg-teal-500/10'
    },
    {
      id: 'location',
      name: 'Location Services',
      description: 'Provides weather summaries, regional travel advice, and proximity study alerts.',
      icon: MapPin,
      color: 'text-red-500 bg-red-500/10'
    },
    {
      id: 'connectedApps',
      name: 'Connected Apps Orchestration',
      description: 'Allows Xena AI to write tasks, control media playback and read workspace folders.',
      icon: Layers,
      color: 'text-purple-500 bg-purple-500/10'
    },
    {
      id: 'deviceAutomation',
      name: 'Device & Native Automation',
      description: 'Enables automatic dark mode, quiet ambient noise triggered schedules, and focus locks.',
      icon: Cpu,
      color: 'text-pink-500 bg-pink-500/10'
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
          <h1 className="text-xl font-bold font-display tracking-tight text-white">System Permissions</h1>
          <p className="text-[10px] text-gray-400">Configure Xena AI hardware, media & browser integrations</p>
        </div>
      </div>

      {/* Toast Notification */}
      {message && (
        <div className="mb-4 p-3 rounded-xl bg-nexa-blue/10 border border-nexa-blue/30 text-nexa-glow text-xs flex items-center space-x-2">
          <Check className="w-4 h-4" />
          <span>{message}</span>
        </div>
      )}

      {/* Security Status Panel */}
      <div className="bg-gradient-to-r from-nexa-blue/15 to-nexa-purple/15 border border-nexa-blue/30 rounded-2xl p-4 mb-5 flex items-start space-x-3.5 relative overflow-hidden">
        <div className="p-2 bg-slate-900 border border-nexa-blue/30 rounded-lg text-nexa-glow">
          <Shield className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">Secured Device Sandbox</h2>
          <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
            All toggles below communicate with hardware sandboxes inside this workspace container. Private credentials remain locally stored and cryptographically hashed.
          </p>
        </div>
      </div>

      {/* Permissions List */}
      <div className="space-y-3">
        {permissionList.map((perm) => {
          const Icon = perm.icon;
          const isEnabled = permissions[perm.id];

          return (
            <div 
              key={perm.id}
              className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 flex flex-col space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl ${perm.color}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-display">{perm.name}</h3>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-nexa-glow' : 'bg-gray-600'}`}></span>
                      <span className={`text-[9px] font-bold tracking-wider uppercase font-mono ${
                        isEnabled ? 'text-nexa-glow' : 'text-gray-500'
                      }`}>
                        {isEnabled ? 'Granted' : 'Blocked / Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Styled IOS Toggle Switch */}
                <button 
                  onClick={() => handleToggle(perm.id)}
                  className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none cursor-pointer ${
                    isEnabled ? 'bg-nexa-blue' : 'bg-[#0E131C] border border-nexa-border'
                  }`}
                >
                  <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                    isEnabled ? 'translate-x-4.5' : 'translate-x-0'
                  }`}></div>
                </button>
              </div>

              <p className="text-[10px] text-gray-400 leading-relaxed pl-1">
                {perm.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer warning */}
      <div className="mt-5 p-3 rounded-xl bg-nexa-card/30 border border-nexa-border/40 text-[10px] text-gray-500 flex items-start space-x-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 text-gray-600 mt-0.5" />
        <span className="leading-relaxed">
          Certain background triggers might require physical focus verification. Tap individual prompts or speak to Xena AI if alarms fail to complete.
        </span>
      </div>
    </div>
  );
}
