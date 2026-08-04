import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Calendar, HardDrive, Edit3, Music, FileText, Map, Check, AlertCircle, Link, Link2Off, RefreshCw 
} from 'lucide-react';
import { ProfileService } from '../services/ProfileService.js';

interface ConnectedAppsViewProps {
  onBack: () => void;
}

interface AppIntegration {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
  permissionsNeeded: string[];
}

export default function ConnectedAppsView({ onBack }: ConnectedAppsViewProps) {
  const [connections, setConnections] = useState<Record<string, boolean>>({
    googleCalendar: true,
    googleDrive: false,
    notion: true,
    spotify: false,
    pdfReader: true,
    maps: true
  });

  const [configuringApp, setConfiguringApp] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [appPermissions, setAppPermissions] = useState<Record<string, string[]>>({
    googleCalendar: ['read', 'write'],
    notion: ['read', 'write'],
    pdfReader: ['read'],
    maps: ['read']
  });

  const [message, setMessage] = useState('');

  // Load connections state on mount
  useEffect(() => {
    const loadConnections = async () => {
      const saved = await ProfileService.getAppConnections();
      setConnections(saved);
    };
    loadConnections();
  }, []);

  const handleToggleConnection = async (id: string) => {
    const isConnected = connections[id];
    const appName = apps.find(a => a.id === id)?.name || id;
    if (isConnected) {
      if (confirm(`Are you sure you want to disconnect ${appName}? Xena AI will immediately lose orchestrating permissions.`)) {
        await updateConnection(id, false);
        setMessage(`Successfully disconnected and revoked access for ${appName}!`);
        setTimeout(() => setMessage(''), 3000);
      }
    } else {
      setSyncing(id);
      setTimeout(async () => {
        await updateConnection(id, true);
        setSyncing(null);
        setMessage(`Successfully connected and calibrated ${appName}!`);
        setTimeout(() => setMessage(''), 3000);
      }, 1500);
    }
  };

  const updateConnection = async (id: string, state: boolean) => {
    const next = { ...connections, [id]: state };
    setConnections(next);
    await ProfileService.saveAppConnections(next);
  };

  const togglePermission = (appId: string, perm: string) => {
    const current = appPermissions[appId] || [];
    const next = current.includes(perm) 
      ? current.filter(p => p !== perm)
      : [...current, perm];
    
    setAppPermissions(prev => ({
      ...prev,
      [appId]: next
    }));
  };

  const apps: AppIntegration[] = [
    {
      id: 'googleCalendar',
      name: 'Google Calendar',
      category: 'Calendar & Schedules',
      description: 'Allows Xena AI to write events, look up schedule gaps, and sync planned study slots automatically.',
      icon: Calendar,
      color: 'text-blue-400 bg-blue-500/10',
      permissionsNeeded: ['read', 'write']
    },
    {
      id: 'googleDrive',
      name: 'Google Drive',
      category: 'Cloud Storage',
      description: 'Used by Xena AI to query PDFs, scan lecture notes, and backup private user summaries.',
      icon: HardDrive,
      color: 'text-amber-500 bg-amber-500/10',
      permissionsNeeded: ['read', 'write']
    },
    {
      id: 'notion',
      name: 'Notion Workspace',
      category: 'Productivity & Notes',
      description: 'Allows Xena AI to read study track lists, append summaries, and organize user ideas.',
      icon: Edit3,
      color: 'text-gray-200 bg-gray-500/10',
      permissionsNeeded: ['read', 'write']
    },
    {
      id: 'spotify',
      name: 'Spotify Player',
      category: 'Audio & Music',
      description: 'Used to load background focus loops, white noise playlists, and ambient study sounds.',
      icon: Music,
      color: 'text-green-500 bg-green-500/10',
      permissionsNeeded: ['read', 'playback']
    },
    {
      id: 'pdfReader',
      name: 'Xena PDF Reader',
      category: 'Documents',
      description: 'Our built-in intelligent PDF summarizer that parses lecture slides and highlights exam scopes.',
      icon: FileText,
      color: 'text-red-500 bg-red-500/10',
      permissionsNeeded: ['read']
    },
    {
      id: 'maps',
      name: 'Google Maps platform',
      category: 'Location & Routing',
      description: 'Allows Xena AI to calculate travel times, display study venues, and check commute details.',
      icon: Map,
      color: 'text-teal-400 bg-teal-500/10',
      permissionsNeeded: ['read']
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
          <h1 className="text-xl font-bold font-display tracking-tight text-white">Connected Platforms</h1>
          <p className="text-[10px] text-gray-400">Integrate, manage and authorize external workspace services</p>
        </div>
      </div>

      {/* Success Banner */}
      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs flex items-center space-x-2"
          >
            <Check className="w-4 h-4" />
            <span>{message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apps Grid */}
      <div className="space-y-3">
        {apps.map((app) => {
          const Icon = app.icon;
          const isConnected = connections[app.id];
          const isSyncing = syncing === app.id;
          const isConfiguring = configuringApp === app.id;
          const activePerms = appPermissions[app.id] || [];

          return (
            <div 
              key={app.id}
              className={`bg-[#151A24] border rounded-2xl p-4 flex flex-col space-y-3 transition-all duration-300 ${
                isConnected ? 'border-nexa-border' : 'border-nexa-border/40 opacity-80'
              }`}
            >
              {/* Card Header row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl ${app.color}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{app.category}</span>
                    <h3 className="text-xs font-bold text-white font-display mt-0.5">{app.name}</h3>
                  </div>
                </div>

                {/* Connection Action button */}
                <button 
                  onClick={() => handleToggleConnection(app.id)}
                  disabled={isSyncing}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer flex items-center space-x-1 transition duration-300 ${
                    isSyncing 
                      ? 'bg-nexa-border text-gray-400'
                      : isConnected 
                        ? 'bg-red-950/20 text-red-400 border border-red-900/30 hover:bg-red-950/40' 
                        : 'bg-nexa-blue hover:bg-blue-600 text-white shadow-lg shadow-nexa-blue/20'
                  }`}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Syncing</span>
                    </>
                  ) : isConnected ? (
                    <>
                      <Link2Off className="w-3 h-3" />
                      <span>Disconnect</span>
                    </>
                  ) : (
                    <>
                      <Link className="w-3 h-3" />
                      <span>Authorize</span>
                    </>
                  )}
                </button>
              </div>

              {/* Description */}
              <p className="text-[10px] text-gray-400 leading-relaxed">
                {app.description}
              </p>

              {/* Connection Status and Config triggers */}
              {isConnected && (
                <div className="pt-2 border-t border-nexa-border/50 flex justify-between items-center text-[10px]">
                  <div className="flex items-center space-x-1.5 text-nexa-glow font-bold uppercase tracking-wider font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-nexa-glow animate-pulse"></span>
                    <span>Synchronized</span>
                  </div>
                  <button 
                    onClick={() => setConfiguringApp(isConfiguring ? null : app.id)}
                    className="text-gray-400 hover:text-white font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Configure Scope</span>
                    <span>{isConfiguring ? '▲' : '▼'}</span>
                  </button>
                </div>
              )}

              {/* Config Panel Dropdown */}
              <AnimatePresence>
                {isConnected && isConfiguring && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden bg-[#0F131A] border border-nexa-border/80 rounded-xl p-3 text-xs space-y-3 mt-1"
                  >
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Scope Authorizations</div>
                    <div className="space-y-2">
                      {app.permissionsNeeded.map((p) => {
                        const hasPerm = activePerms.includes(p);
                        return (
                          <label key={p} className="flex items-center space-x-2.5 text-gray-300 select-none cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={hasPerm}
                              onChange={() => togglePermission(app.id, p)}
                              className="accent-nexa-blue w-3.5 h-3.5 bg-nexa-dark border border-nexa-border rounded"
                            />
                            <span className="capitalize text-[10.5px]">Allow AI to {p} data</span>
                          </label>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Synchronized apps count indicator */}
      <div className="mt-5 p-3.5 rounded-xl bg-nexa-card/40 border border-nexa-border/50 text-[10px] text-gray-500 flex items-start space-x-2">
        <AlertCircle className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          Google Workspace security scopes require physical confirmation in standard browser cookies. Connect failures will trigger a prompt asking for re-auth.
        </span>
      </div>
    </div>
  );
}
