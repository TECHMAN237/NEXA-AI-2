import React from 'react';
import { motion } from 'motion/react';
import { 
  Bell, Volume2, AppWindow, FileText, Calendar, Chrome, 
  Play, Check, Settings, Trash, Edit, RefreshCw 
} from 'lucide-react';
import { SmartAction } from '../types.js';

interface SmartActionCardProps {
  action: SmartAction;
  onToggleStatus?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function SmartActionCard({ 
  action, 
  onToggleStatus, 
  onEdit, 
  onDelete 
}: SmartActionCardProps) {
  
  // Choose icon based on type / app
  const getActionIcon = () => {
    switch (action.type) {
      case 'SEND_NOTIFICATION':
        return <Bell className="w-4 h-4 text-cyan-400" />;
      case 'VOICE_ALERT':
        return <Volume2 className="w-4 h-4 text-purple-400" />;
      case 'OPEN_APP':
        return <AppWindow className="w-4 h-4 text-blue-400" />;
      case 'OPEN_DOCUMENT':
        return <FileText className="w-4 h-4 text-amber-400" />;
      default:
        return <Settings className="w-4 h-4 text-gray-400" />;
    }
  };

  const getAppLogo = (app: string) => {
    const cleanApp = app.toLowerCase();
    if (cleanApp.includes('browser') || cleanApp.includes('chrome')) {
      return <Chrome className="w-3.5 h-3.5 text-blue-400" />;
    }
    if (cleanApp.includes('calendar')) {
      return <Calendar className="w-3.5 h-3.5 text-red-400" />;
    }
    if (cleanApp.includes('pdf') || cleanApp.includes('doc')) {
      return <FileText className="w-3.5 h-3.5 text-orange-400" />;
    }
    return <AppWindow className="w-3.5 h-3.5 text-cyan-400" />;
  };

  const isSelectedActive = action.status === 'active';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`relative p-3.5 rounded-xl border transition-all duration-300 bg-[#121620]/90 backdrop-blur-md ${
        isSelectedActive 
          ? 'border-nexa-blue/40 shadow-[0_4px_15px_rgba(0,229,255,0.08)]' 
          : 'border-nexa-border/60 opacity-60'
      }`}
    >
      {/* Glow highlight for active actions */}
      {isSelectedActive && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-nexa-glow animate-pulse"></span>
      )}

      <div className="flex items-start justify-between space-x-3">
        {/* Left Icon Block */}
        <div className={`p-2 rounded-lg flex-shrink-0 flex items-center justify-center ${
          isSelectedActive 
            ? 'bg-nexa-blue/10 border border-nexa-blue/20' 
            : 'bg-gray-900 border border-nexa-border'
        }`}>
          {getActionIcon()}
        </div>

        {/* Action Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
              {action.type.replace('_', ' ')}
            </span>
            {action.targetApp && (
              <span className="flex items-center space-x-1 bg-[#1A2130] px-1.5 py-0.5 rounded text-[8.5px] font-semibold text-gray-300 border border-nexa-border">
                {getAppLogo(action.targetApp)}
                <span>{action.targetApp}</span>
              </span>
            )}
          </div>

          <h4 className="text-xs font-bold text-white mt-1 truncate">
            {action.payload?.title || action.payload?.documentName || 'Device Action'}
          </h4>

          {/* Metadata */}
          <div className="flex items-center space-x-2 mt-1.5 text-[10px] text-gray-500 font-mono">
            <span>Time: {action.executionTime}</span>
            {action.payload?.triggerOffset && (
              <>
                <span className="text-gray-700">•</span>
                <span>{action.payload.triggerOffset}</span>
              </>
            )}
          </div>
        </div>

        {/* Right Toggle and Controls */}
        <div className="flex flex-col items-end space-y-2.5">
          {/* Animated Toggle Switch */}
          {onToggleStatus && (
            <button
              type="button"
              onClick={onToggleStatus}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none cursor-pointer flex items-center ${
                isSelectedActive ? 'bg-nexa-blue' : 'bg-gray-800'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 transform ${
                isSelectedActive ? 'translate-x-4' : 'translate-x-0'
              }`}></div>
            </button>
          )}

          {/* Edit/Delete mini actions */}
          <div className="flex items-center space-x-1">
            {onEdit && (
              <button 
                onClick={onEdit} 
                className="p-1 rounded bg-[#161C26] hover:bg-[#202938] border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
                title="Edit action"
              >
                <Edit className="w-2.5 h-2.5" />
              </button>
            )}
            {onDelete && (
              <button 
                onClick={onDelete} 
                className="p-1 rounded bg-[#161C26] hover:bg-red-950/40 border border-nexa-border hover:border-red-900/40 text-gray-400 hover:text-red-400 transition cursor-pointer"
                title="Remove action"
              >
                <Trash className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
