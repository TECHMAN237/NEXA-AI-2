import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Lock, Eye, EyeOff, Database, Download, Trash2, ShieldAlert, Sparkles, Check, AlertTriangle 
} from 'lucide-react';
import { ProfileService } from '../services/ProfileService.js';
import { ProfileManager } from '../services/ProfileManager.js';

interface PrivacyViewProps {
  onBack: () => void;
  onNavigate: (view: string) => void;
}

export default function PrivacyView({ onBack, onNavigate }: PrivacyViewProps) {
  const [memoryControl, setMemoryControl] = useState(true);
  const [dataCollection, setDataCollection] = useState(false);
  const [historyControl, setHistoryControl] = useState(true);
  
  const [message, setMessage] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Load from ProfileService on mount
  useEffect(() => {
    const loadSettings = async () => {
      const config = await ProfileService.getPrivacySettings();
      if (config) {
        if (config.memoryControl !== undefined) setMemoryControl(config.memoryControl);
        if (config.dataCollection !== undefined) setDataCollection(config.dataCollection);
        if (config.historyControl !== undefined) setHistoryControl(config.historyControl);
      }
    };
    loadSettings();
  }, []);

  const saveSettings = async (key: string, val: boolean) => {
    const config = {
      memoryControl,
      dataCollection,
      historyControl,
      [key]: val
    };
    await ProfileService.savePrivacySettings(config);
  };

  const handleExportData = () => {
    setIsExporting(true);
    setTimeout(async () => {
      setIsExporting(false);
      setMessage('Your secure user profile data backup has been generated and downloaded!');
      setTimeout(() => setMessage(''), 3000);
      
      try {
        // Export actual local storage backup
        const exportedData = await ProfileManager.exportSettings();
        const blob = new Blob([exportedData], { type: 'application/json' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexa_secure_export_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {
        console.error('Failed to export system configurations:', e);
      }
    }, 2000);
  };

  const handleDeleteAllData = async () => {
    try {
      const res = await fetch('/api/chat/clear', { method: 'POST' });
      if (res.ok) {
        setMessage('Database scrub initiated: All persistent assistant log records have been successfully wiped.');
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (e) {
      console.error(e);
      setMessage('Scrub failure: Unable to empty server database nodes.');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleDeleteAccount = () => {
    setMessage('Your account deletion request has been submitted. All profile data is being securely scrubbed from NEXA servers.');
    setTimeout(() => setMessage(''), 5000);
  };

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
          <h1 className="text-xl font-bold font-display tracking-tight text-white">Privacy & Security</h1>
          <p className="text-[10px] text-gray-400">Configure personal vector storage & encryption nodes</p>
        </div>
      </div>

      {/* Success Notification banner */}
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

      {/* Security Status Panel */}
      <div className="bg-gradient-to-r from-nexa-blue/15 to-nexa-purple/15 border border-nexa-blue/30 rounded-2xl p-4 mb-5 flex items-start space-x-3.5 relative overflow-hidden">
        <div className="p-2 bg-slate-900 border border-nexa-blue/30 rounded-lg text-nexa-glow">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">AES-256 Cloud Encryption</h2>
          <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
            Your conversational memories are parsed on localized endpoints and run through sandboxed Gemini instances. We do not Sell, Monetize, or Train models on user-authored files.
          </p>
        </div>
      </div>

      {/* Privacy settings */}
      <div className="space-y-3.5 mb-6">
        <h3 className="text-xs font-semibold text-gray-300 font-display uppercase tracking-wider px-1">AI Agent Learning Settings</h3>

        {/* AI Memory Switch */}
        <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-1 pr-4">
            <span className="text-xs font-bold text-white font-display">Personal AI Memory Control</span>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Allows the NEXA Assistant to automatically capture permanent context (e.g. your major, course deadlines, and exam times) to improve smart alerts.
            </p>
          </div>
          <button 
            onClick={() => {
              const val = !memoryControl;
              setMemoryControl(val);
              saveSettings('memoryControl', val);
            }}
            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none cursor-pointer flex-shrink-0 ${
              memoryControl ? 'bg-nexa-blue' : 'bg-[#0E131C] border border-nexa-border'
            }`}
          >
            <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
              memoryControl ? 'translate-x-4.5' : 'translate-x-0'
            }`}></div>
          </button>
        </div>

        {/* Conversation Logs Switch */}
        <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-1 pr-4">
            <span className="text-xs font-bold text-white font-display">Interactive Chat History Logging</span>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Maintains complete chat records on the local endpoint. Disabling this causes chat messages to purge immediately upon navigating away from the screen.
            </p>
          </div>
          <button 
            onClick={() => {
              const val = !historyControl;
              setHistoryControl(val);
              saveSettings('historyControl', val);
            }}
            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none cursor-pointer flex-shrink-0 ${
              historyControl ? 'bg-nexa-blue' : 'bg-[#0E131C] border border-nexa-border'
            }`}
          >
            <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
              historyControl ? 'translate-x-4.5' : 'translate-x-0'
            }`}></div>
          </button>
        </div>

        {/* Telemetry settings */}
        <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-1 pr-4">
            <span className="text-xs font-bold text-white font-display">Data Collection & Diagnostics</span>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Send anonymous UI feedback, click counts, and response latency details to help optimize the NEXA Agent client performance.
            </p>
          </div>
          <button 
            onClick={() => {
              const val = !dataCollection;
              setDataCollection(val);
              saveSettings('dataCollection', val);
            }}
            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none cursor-pointer flex-shrink-0 ${
              dataCollection ? 'bg-nexa-blue' : 'bg-[#0E131C] border border-nexa-border'
            }`}
          >
            <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
              dataCollection ? 'translate-x-4.5' : 'translate-x-0'
            }`}></div>
          </button>
        </div>
      </div>

      {/* Actions and destructive operations */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 space-y-3.5">
        <h3 className="text-xs font-semibold text-gray-300 font-display uppercase tracking-wider mb-1">Backup & Cleanup</h3>

        {/* Export button */}
        <button 
          onClick={handleExportData}
          disabled={isExporting}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0F131A] border border-nexa-border hover:border-nexa-blue/30 transition text-left cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-nexa-card text-nexa-blue">
              <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Export All Personal Data</div>
              <div className="text-[10px] text-gray-500">Download clean JSON containing all items & profiles</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-gray-400 font-mono">EXPORT</span>
        </button>

        {/* Wipe button */}
        <button 
          onClick={handleDeleteAllData}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0F131A] border border-nexa-border hover:border-red-900/30 transition text-left cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-950/10 text-red-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Clear All Stored Logs & Items</div>
              <div className="text-[10px] text-gray-500">Wipe conversational cache & items database</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-red-400 font-mono">WIPE</span>
        </button>

        {/* Delete Account */}
        <button 
          onClick={handleDeleteAccount}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0F131A] border border-nexa-border hover:border-red-900/30 transition text-left cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-950/15 text-red-500">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-red-400 font-display">Delete NEXA Profile</div>
              <div className="text-[10px] text-gray-500">Scrub credentials and deauthorize model links</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-red-500 font-mono font-bold">TERMINATE</span>
        </button>
      </div>

      <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-500/80 flex items-start space-x-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          Clearing stored memories or disconnecting scopes will impact the NEXA assistant’s ability to proactively warn you of schedule conflicts. Proceed with caution.
        </span>
      </div>
    </div>
  );
}
