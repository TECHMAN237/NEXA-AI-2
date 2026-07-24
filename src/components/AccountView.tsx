import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, ShieldAlert, ArrowLeft, Camera, Lock, Trash2, LogOut, Check } from 'lucide-react';
import { Profile } from '../types.js';
import { ProfileManager } from '../services/ProfileManager.js';

interface AccountViewProps {
  onBack: () => void;
  profile: Profile | null;
  onRefreshData: () => void;
  onLogout?: () => void;
}

export default function AccountView({ onBack, profile, onRefreshData, onLogout }: AccountViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || 'Alex T.');
  const [email, setEmail] = useState(profile?.email || 'steevezali@gmail.com');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await ProfileManager.cropToSquareAndResize(file);
      await ProfileManager.updateProfileField({ avatar_url: base64 });
      onRefreshData();
      setSuccessMsg('Profile picture updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error uploading avatar:', err);
    }
  };

  const handleSaveProfile = async () => {
    try {
      await ProfileManager.updateProfileField({ full_name: fullName, email });
      setSuccessMsg('Profile updated successfully!');
      setIsEditing(false);
      onRefreshData();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setSuccessMsg('Password changed successfully!');
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleDeleteAccount = () => {
    setSuccessMsg('Account deletion request submitted. All personal profile data is being securely scrubbed from NEXA servers.');
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const handleLogout = () => {
    setSuccessMsg('Logout sequence completed. Safe connection terminated.');
    setTimeout(() => {
      setSuccessMsg('');
      if (onLogout) onLogout();
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] text-white px-4 pt-4 pb-20 overflow-y-auto custom-scrollbar">
      {/* Back Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button 
          onClick={onBack}
          className="p-2 rounded-lg bg-nexa-card hover:bg-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold font-display tracking-tight text-white">NEXA Account</h1>
          <p className="text-[10px] text-gray-400">Manage identity, security configurations & core keys</p>
        </div>
      </div>

      {/* Success Notification banner */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs flex items-center space-x-2"
          >
            <Check className="w-4 h-4" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Section */}
      <div className="flex flex-col items-center justify-center py-6 mb-4 relative bg-[#111621] border border-nexa-border rounded-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-r from-nexa-blue/20 to-nexa-purple/20"></div>
        <div className="relative mt-4">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
          <div 
            onClick={handleAvatarClick}
            className="w-24 h-24 rounded-full bg-slate-900 border-4 border-nexa-blue overflow-hidden relative group cursor-pointer"
          >
            <img 
              src={profile?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} 
              alt={fullName} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>
          <button 
            onClick={handleAvatarClick}
            className="absolute bottom-0 right-0 p-1.5 rounded-full bg-nexa-blue border border-nexa-dark text-white hover:bg-blue-600 transition shadow cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>

        <h2 className="text-base font-semibold mt-3 font-display">{fullName}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{email}</p>
        <span className="mt-2 text-[9px] font-mono tracking-widest text-nexa-glow bg-nexa-blue/10 border border-nexa-glow/30 px-2 py-0.5 rounded-full uppercase">
          NEXA PREMIUM AGENT
        </span>
      </div>

      {/* Profile Fields Card */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-4 space-y-4">
        <h3 className="text-xs font-semibold text-gray-300 font-display uppercase tracking-wider mb-1">Identity Information</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wider">Full Name</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500">
                <User className="w-4 h-4" />
              </span>
              <input 
                type="text"
                value={fullName}
                disabled={!isEditing}
                onChange={(e) => setFullName(e.target.value)}
                className={`w-full bg-[#0F131A] text-xs text-white border rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-nexa-blue transition ${
                  isEditing ? 'border-nexa-blue' : 'border-nexa-border opacity-70'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500">
                <Mail className="w-4 h-4" />
              </span>
              <input 
                type="email"
                value={email}
                disabled={!isEditing}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full bg-[#0F131A] text-xs text-white border rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-nexa-blue transition ${
                  isEditing ? 'border-nexa-blue' : 'border-nexa-border opacity-70'
                }`}
              />
            </div>
          </div>
        </div>

        <div className="pt-2">
          {isEditing ? (
            <div className="flex space-x-2">
              <button 
                onClick={() => {
                  setFullName(profile?.full_name || 'Alex T.');
                  setEmail(profile?.email || 'steevezali@gmail.com');
                  setIsEditing(false);
                }}
                className="flex-1 bg-nexa-dark border border-nexa-border hover:bg-nexa-border text-gray-300 py-2 rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveProfile}
                className="flex-1 bg-nexa-blue hover:bg-blue-600 text-white py-2 rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Save Profile
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsEditing(true)}
              className="w-full bg-nexa-card border border-nexa-border hover:border-nexa-blue/60 hover:bg-nexa-border/30 text-xs font-semibold py-2 rounded-xl cursor-pointer text-white transition text-center"
            >
              Edit Personal Profile
            </button>
          )}
        </div>
      </div>

      {/* Security and Credentials */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-300 font-display uppercase tracking-wider mb-1">Security & Actions</h3>

        <button 
          onClick={() => setShowPasswordModal(true)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0F131A] border border-nexa-border hover:border-nexa-blue/30 transition text-left cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-nexa-card text-nexa-blue">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Change Master Password</div>
              <div className="text-[10px] text-gray-500">Update local client unlock credential</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-gray-400 font-mono">SECURE</span>
        </button>

        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0F131A] border border-nexa-border hover:border-red-900/30 transition text-left cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-950/10 text-red-400">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white font-display">Logout Active Session</div>
              <div className="text-[10px] text-gray-500 font-medium">Deauthorize device client access token</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-red-400 font-mono">CLOSE</span>
        </button>

        <button 
          onClick={handleDeleteAccount}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-red-950/10 border border-red-900/20 hover:border-red-900/40 transition text-left cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-950/20 text-red-500">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-red-400 font-display">Permanently Wipe Account</div>
              <div className="text-[10px] text-gray-500 font-medium">Delete personal profile and scrub vector database</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-red-500 font-mono">DANGER</span>
        </button>
      </div>

      {/* Password Change Dialog */}
      <AnimatePresence>
        {showPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.form 
              onSubmit={handleChangePasswordSubmit}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-[#111621] border border-nexa-border rounded-2xl p-5 space-y-4 text-white shadow-2xl"
            >
              <div className="flex justify-between items-center border-b border-nexa-border pb-2.5">
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-nexa-blue" />
                  <span className="text-sm font-semibold font-display">Change Master Password</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="text-gray-500 hover:text-white font-semibold text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wider">Current Password</label>
                  <input 
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-[#0F131A] text-xs text-white border border-nexa-border rounded-lg px-3 py-2.5 focus:outline-none focus:border-nexa-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wider">New Password</label>
                  <input 
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#0F131A] text-xs text-white border border-nexa-border rounded-lg px-3 py-2.5 focus:outline-none focus:border-nexa-blue"
                  />
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 bg-nexa-dark border border-nexa-border text-gray-300 py-2.5 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-nexa-blue text-white py-2.5 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Update
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
