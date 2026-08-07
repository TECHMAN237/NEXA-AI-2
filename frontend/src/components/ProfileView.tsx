import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, Shield, Link2, Brain, Bell, Lock, Globe, Eye, Info, LogOut, ChevronRight, ToggleLeft, ToggleRight, Sparkles, Users, Volume2, Camera 
} from 'lucide-react';
import { Profile } from '../types.js';
import { ReminderService } from '../services/ReminderService.js';
import { ProfileManager } from '../services/ProfileManager.js';
import { getApiUrl } from '../config/api.js';

interface ProfileViewProps {
  profile: Profile | null;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onRefreshData?: () => void;
}

export default function ProfileView({ profile, onNavigate, onLogout, onRefreshData }: ProfileViewProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile?.notifications_enabled ?? true);
  const [autoVoiceReminder, setAutoVoiceReminder] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const voiceEnabled = await ReminderService.isAutoVoiceReminderEnabled();
      setAutoVoiceReminder(voiceEnabled);
    };
    loadSettings();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const handleLogoutClick = () => {
    showToast('Secure sign-out initiated via Google OAuth.');
    setTimeout(() => {
      onLogout();
    }, 1200);
  };

  const handleToggleNotifications = async () => {
    const nextVal = !notificationsEnabled;
    setNotificationsEnabled(nextVal);
    try {
      await fetch(getApiUrl('/api/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications_enabled: nextVal })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleVoiceReminders = async () => {
    const nextVal = !autoVoiceReminder;
    setAutoVoiceReminder(nextVal);
    await ReminderService.setAutoVoiceReminderEnabled(nextVal);
    showToast(nextVal ? 'Auto Voice Reminders enabled.' : 'Auto Voice Reminders disabled. Only standard notifications will appear.');
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await ProfileManager.cropToSquareAndResize(file);
      await ProfileManager.updateProfileField({ avatar_url: base64 });
      if (onRefreshData) onRefreshData();
      showToast('Profile picture updated successfully!');
    } catch (err) {
      console.error('Error uploading avatar:', err);
    }
  };

  const menuItems = [
    { id: 'account', label: 'Account', icon: User, extra: profile?.full_name || 'Alex T.', action: () => onNavigate('account') },
    { id: 'permissions', label: 'Permissions', icon: Shield, extra: 'Granted', action: () => onNavigate('permissions') },
    { id: 'connected-apps', label: 'Connected Apps', icon: Link2, extra: `${profile?.connected_apps?.length ?? 4} Connected`, action: () => onNavigate('connected-apps') },
    { id: 'ai-memory', label: 'AI Memory', icon: Brain, extra: 'Manage Brain', action: () => onNavigate('memory'), highlight: true },
    { id: 'privacy', label: 'Privacy', icon: Lock, extra: 'Encrypted', action: () => onNavigate('privacy') },
    { id: 'language', label: 'Language', icon: Globe, extra: profile?.language ?? 'English', action: () => onNavigate('language') },
    {id: 'theme', label: 'Theme', icon: Eye, extra: profile?.theme ?? 'Dark', action: () => showToast('Theme selections are automatically optimized for Dark/Partly Cloudy conditions.') },
    { id: 'about', label: 'About Xena AI', icon: Info, extra: 'v1.0.0', action: () => onNavigate('about') },
    { id: 'team', label: 'Xena Core Team', icon: Users, extra: 'View Team', action: () => onNavigate('team') },
  ];

  return (
    <div id="profile-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Profile</h1>
        <p className="text-xs text-gray-400 mt-1">Configure settings & personal assistant memory</p>
      </div>

      {/* User Card */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-5 mb-5 flex items-center space-x-4 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-tr from-nexa-blue/10 to-nexa-purple/10 rounded-full blur-xl"></div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          className="hidden" 
        />

        {/* Avatar */}
        <div 
          onClick={handleAvatarClick}
          className="w-14 h-14 rounded-full bg-slate-900 border-2 border-nexa-blue/60 overflow-hidden flex-shrink-0 relative cursor-pointer group/avatar"
          title="Click to change profile picture"
        >
          <img 
            src={profile?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} 
            alt={profile?.full_name || 'Alex T.'} 
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover/avatar:scale-105 transition"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition">
            <Camera className="w-4 h-4 text-white" />
          </div>
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold text-white font-display">{profile?.full_name || 'Alex T.'}</h2>
            <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center space-x-0.5">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Premium User</span>
            </span>
          </div>
          <p className="text-xs text-gray-400 font-medium mt-0.5">{profile?.email || 'steevezali@gmail.com'}</p>
        </div>
      </div>

      {/* Settings Navigation List */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl overflow-hidden mb-6">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.action}
              className={`w-full px-4 py-3.5 flex items-center justify-between border-b border-nexa-border/50 last:border-0 hover:bg-nexa-border/30 transition text-left cursor-pointer ${
                item.highlight ? 'bg-nexa-purple/5' : ''
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${
                  item.highlight ? 'bg-nexa-purple/10 text-nexa-purple' : 'bg-nexa-dark text-gray-400'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-white">{item.label}</span>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className={`text-[10px] font-semibold ${
                  item.highlight ? 'text-nexa-purple font-bold' : 'text-gray-500'
                }`}>
                  {item.extra}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Notifications Switch Row */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-nexa-dark text-amber-500">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-semibold text-white">System Alarms</span>
            <p className="text-[9px] text-gray-500 mt-0.5">Show notifications and countdown reminders</p>
          </div>
        </div>
        <button 
          onClick={handleToggleNotifications}
          className="cursor-pointer"
        >
          {notificationsEnabled ? (
            <ToggleRight className="w-8 h-8 text-nexa-blue" />
          ) : (
            <ToggleLeft className="w-8 h-8 text-gray-600" />
          )}
        </button>
      </div>

      {/* Auto Voice Reminder Switch Row */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-nexa-dark text-nexa-purple">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-semibold text-white">Auto Voice Reminder</span>
            <p className="text-[9px] text-gray-500 mt-0.5">ON / OFF. Narrate active reminders upon reaching scheduled time</p>
          </div>
        </div>
        <button 
          onClick={handleToggleVoiceReminders}
          className="cursor-pointer"
        >
          {autoVoiceReminder ? (
            <ToggleRight className="w-8 h-8 text-nexa-purple" />
          ) : (
            <ToggleLeft className="w-8 h-8 text-gray-600" />
          )}
        </button>
      </div>

      {/* Logout Action */}
      <button 
        onClick={handleLogoutClick}
        className="w-full bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 hover:border-red-900 text-red-400 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 cursor-pointer transition duration-300"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Log Out Account</span>
      </button>

      {/* Floating Modern Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 left-4 right-4 z-50 bg-[#161B24] border-2 border-nexa-blue/50 text-white p-3 rounded-xl text-[11px] font-semibold flex items-center space-x-2.5 shadow-[0_4px_20px_rgba(0,229,255,0.25)]"
          >
            <span className="w-2 h-2 rounded-full bg-nexa-glow animate-ping flex-shrink-0"></span>
            <span className="flex-1 leading-normal">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
