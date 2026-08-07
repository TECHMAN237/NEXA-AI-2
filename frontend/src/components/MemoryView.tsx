import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Brain, Search, Trash2, Edit2, Plus, Sparkles, AlertCircle } from 'lucide-react';
import { Memory } from '../types.js';
import { MemoryService } from '../services/MemoryService.js';

interface MemoryViewProps {
  onBack: () => void;
  memories: Memory[];
  onMemorySaved: () => void;
}

export default function MemoryView({ onBack, memories, onMemorySaved }: MemoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState('Preference');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;

    try {
      await MemoryService.addMemory(newMemoryText, newMemoryCategory);
      setNewMemoryText('');
      setShowAddForm(false);
      onMemorySaved();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateMemory = async (id: string) => {
    if (!editingText.trim()) return;

    try {
      await MemoryService.updateMemory(id, editingText);
      setEditingMemoryId(null);
      onMemorySaved();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this memory? This removes the context from future AI generations.')) return;

    try {
      await MemoryService.deleteMemory(id);
      onMemorySaved();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter memories based on search query
  const filteredMemories = memories.filter(m => 
    m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryStyle = (category: string) => {
    switch (category) {
      case 'Milestone': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Preference': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Schedule': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  };

  return (
    <div id="memory-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Navigation Header */}
      <div className="flex items-center space-x-3 mb-5">
        <button 
          onClick={onBack}
          className="p-2 rounded-xl bg-nexa-card border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white font-display">AI Memory</h1>
          <p className="text-[10px] text-gray-500">View & refine what Xena AI knows about you</p>
        </div>
      </div>

      {/* Info Warning banner explaining how AI memory works */}
      <div className="mb-4 bg-nexa-card/40 border border-nexa-border rounded-2xl p-3.5 flex items-start space-x-2.5">
        <Brain className="w-5 h-5 text-nexa-glow flex-shrink-0" />
        <div>
          <h4 className="text-[10px] font-bold text-nexa-glow uppercase tracking-wider">Dynamic Memory Synapse</h4>
          <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
            Facts are added automatically when you chat. (e.g. telling Xena AI <em>"I prefer coffee in the morning"</em> logs it as a Preference for future planning).
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4 flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-nexa-card text-xs text-white border border-nexa-border rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-nexa-blue"
          />
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="p-2.5 bg-nexa-blue hover:bg-blue-600 text-white rounded-xl transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Inline Create Memory Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSaveMemory}
            className="bg-nexa-card border border-nexa-border rounded-2xl p-4 mb-4 space-y-3 overflow-hidden"
          >
            <h3 className="text-xs font-semibold text-white">Log Custom Fact</h3>
            <div>
              <input 
                type="text" 
                placeholder="e.g. I study best with lo-fi beats."
                value={newMemoryText}
                onChange={e => setNewMemoryText(e.target.value)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl p-2.5 focus:outline-none"
                required
              />
            </div>
            <div className="flex justify-between items-center">
              <div className="flex space-x-1.5">
                {['Preference', 'Milestone', 'Schedule', 'Setting'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewMemoryCategory(cat)}
                    className={`px-2 py-1 rounded text-[8px] font-bold border transition ${
                      newMemoryCategory === cat 
                        ? 'bg-nexa-blue border-nexa-blue text-white' 
                        : 'bg-[#0B0E14] border-nexa-border text-gray-500'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <button 
                type="submit" 
                className="bg-nexa-purple hover:bg-purple-600 text-white text-[10px] font-bold px-3.5 py-1.5 rounded-lg transition"
              >
                Log Memory
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Memories list */}
      <div className="space-y-3">
        {filteredMemories.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-xs">No memories found. Chat with Xena AI to auto-generate memories.</div>
        ) : (
          filteredMemories.map((m) => (
            <div key={m.id} className="bg-nexa-card border border-nexa-border rounded-xl p-4 flex flex-col justify-between">
              {editingMemoryId === m.id ? (
                <div className="space-y-2">
                  <input 
                    type="text" 
                    value={editingText} 
                    onChange={e => setEditingText(e.target.value)} 
                    className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded p-2 focus:outline-none" 
                  />
                  <div className="flex justify-end space-x-2">
                    <button onClick={() => setEditingMemoryId(null)} className="text-[10px] text-gray-400">Cancel</button>
                    <button onClick={() => handleUpdateMemory(m.id)} className="text-[10px] bg-nexa-blue text-white px-3 py-1 rounded">Update</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${getCategoryStyle(m.category)}`}>
                        {m.category}
                      </span>
                      <span className="text-[8px] text-gray-500 font-mono">Synced May 2025</span>
                    </div>
                    <p className="text-xs font-semibold text-white leading-relaxed">
                      "{m.text}"
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-1.5">
                    <button 
                      onClick={() => {
                        setEditingMemoryId(m.id);
                        setEditingText(m.text);
                      }}
                      className="p-1 text-gray-500 hover:text-white transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteMemory(m.id)}
                      className="p-1 text-gray-500 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

    </div>
  );
}
