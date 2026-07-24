import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, MapPin, Users, Calendar, Clock, Bell, AlignLeft, CheckCircle, Sparkles } from 'lucide-react';
import { Event as NexaEvent } from '../types.js';

interface AddEventViewProps {
  onBack: () => void;
  onEventSaved: () => void;
}

export default function AddEventView({ onBack, onEventSaved }: AddEventViewProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [title, setTitle] = useState('Team Meeting');
  const [date, setDate] = useState(todayStr);
  const [time, setTime] = useState('15:00');
  const [location, setLocation] = useState('Tech Hub, Buea');
  const [participants, setParticipants] = useState<string[]>(['Sarah', 'Michael', 'Kevin']);
  const [newParticipant, setNewParticipant] = useState('');
  const [reminderTime, setReminderTime] = useState('30 minutes before');
  const [description, setDescription] = useState('Discuss project progress and next steps.');
  const [isSaving, setIsSaving] = useState(false);

  // Event Automation states
  const [autoBeforeNotification, setAutoBeforeNotification] = useState(true);
  const [autoBeforeOpenCalendar, setAutoBeforeOpenCalendar] = useState(true);
  const [autoBeforeOpenMap, setAutoBeforeOpenMap] = useState(true);
  const [autoAtOpenNavApp, setAutoAtOpenNavApp] = useState(true);

  const handleAddParticipant = () => {
    if (newParticipant.trim() && !participants.includes(newParticipant.trim())) {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant('');
    }
  };

  const handleRemoveParticipant = (name: string) => {
    setParticipants(participants.filter(p => p !== name));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          date,
          time,
          location,
          description,
          reminder_time: reminderTime,
          participants
        })
      });

      if (res.ok) {
        onEventSaved();
        onBack();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="add-event-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Navigation Header */}
      <div className="flex items-center space-x-3 mb-5">
        <button 
          onClick={onBack}
          className="p-2 rounded-xl bg-nexa-card border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white font-display">Add Event</h1>
          <p className="text-[10px] text-gray-500">Create conferences, meetings or church events</p>
        </div>
      </div>

      {/* Main Event Form */}
      <form onSubmit={handleSave} className="space-y-4">
        {/* Title Field */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Event Title</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Hackathon Pitch"
            className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue"
            required
          />
        </div>

        {/* Date & Time Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-nexa-blue" />
              <span>Date</span>
            </label>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-2 py-2 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-nexa-blue" />
              <span>Time</span>
            </label>
            <input 
              type="time" 
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-2 py-2 focus:outline-none"
            />
          </div>
        </div>

        {/* Location Field */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <MapPin className="w-3.5 h-3.5 text-teal-400" />
            <span>Location</span>
          </label>
          <input 
            type="text" 
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Conference Room"
            className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue"
          />
        </div>

        {/* Participants Management */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-nexa-purple" />
            <span>Participants</span>
          </label>
          <div className="flex space-x-1.5 mb-2">
            <input 
              type="text" 
              placeholder="Add name..."
              value={newParticipant}
              onChange={(e) => setNewParticipant(e.target.value)}
              className="flex-1 bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none"
            />
            <button 
              type="button"
              onClick={handleAddParticipant}
              className="bg-nexa-border hover:bg-gray-700 text-white text-xs px-3 rounded-xl cursor-pointer font-bold"
            >
              Add
            </button>
          </div>
          {/* Display Participants Badges */}
          <div className="flex flex-wrap gap-1.5">
            {participants.map((p) => (
              <span 
                key={p} 
                className="text-[10px] bg-nexa-border text-gray-300 px-2 py-1 rounded-full flex items-center space-x-1"
              >
                <span>{p}</span>
                <button 
                  type="button" 
                  onClick={() => handleRemoveParticipant(p)} 
                  className="text-red-400 hover:text-white font-bold ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Reminder drop down list */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <span>Reminder Timing</span>
          </label>
          <select 
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-2 py-2"
          >
            <option value="At time of event">At time of event</option>
            <option value="30 minutes before">30 minutes before</option>
            <option value="2 hours before">2 hours before</option>
            <option value="1 day before">1 day before</option>
            <option value="3 days before">3 days before</option>
            <option value="1 week before">1 week before</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <AlignLeft className="w-3.5 h-3.5 text-gray-400" />
            <span>Description</span>
          </label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Event notes..."
            className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl p-3 focus:outline-none focus:border-nexa-blue resize-none"
          />
        </div>

        {/* Save button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={isSaving}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-nexa-blue to-nexa-purple text-white text-xs font-bold tracking-wider uppercase cursor-pointer transition shadow-lg"
        >
          {isSaving ? "Saving..." : "Save Event"}
        </motion.button>
      </form>

      {/* Event Automation Actions Card */}
      <div className="bg-[#121620]/90 border border-nexa-border/80 rounded-2xl p-4.5 mt-6 space-y-4 shadow-[0_4px_25px_rgba(0,229,255,0.03)]">
        <div className="flex items-center justify-between pb-2.5 border-b border-nexa-border/40">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-nexa-glow animate-pulse" />
            <span className="text-xs font-bold text-white uppercase tracking-wider font-display">Event Automation Actions</span>
          </div>
          <span className="text-[9px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">NEXA Core Link</span>
        </div>

        <p className="text-[10px] text-gray-400 leading-normal">
          Configure automated tasks for your event before it starts and exactly at event time.
        </p>

        {/* Automation BEFORE Event */}
        <div className="space-y-3.5 bg-[#151A24]/60 border border-nexa-border/50 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Before Event Actions</span>
            <span className="text-[8px] font-mono text-gray-500 uppercase">30 minutes preceding</span>
          </div>

          {/* Reminder notification */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setAutoBeforeNotification(!autoBeforeNotification)}
                className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                  autoBeforeNotification ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-gray-600 text-transparent'
                }`}
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
              </button>
              <span className="text-xs font-semibold text-gray-300">Reminder notification</span>
            </div>
            <span className="text-[9px] text-gray-500 font-mono uppercase font-bold">Alert</span>
          </div>

          {/* Open Calendar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setAutoBeforeOpenCalendar(!autoBeforeOpenCalendar)}
                className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                  autoBeforeOpenCalendar ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-gray-600 text-transparent'
                }`}
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
              </button>
              <span className="text-xs font-semibold text-gray-300">Open calendar</span>
            </div>
            <span className="text-[9px] text-gray-500 font-mono uppercase font-bold">Calendar App</span>
          </div>

          {/* Open Map */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setAutoBeforeOpenMap(!autoBeforeOpenMap)}
                className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                  autoBeforeOpenMap ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-gray-600 text-transparent'
                }`}
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
              </button>
              <span className="text-xs font-semibold text-gray-300">Open map</span>
            </div>
            <span className="text-[9px] text-gray-500 font-mono uppercase font-bold">Map App</span>
          </div>
        </div>

        {/* Automation AT Event Time */}
        <div className="space-y-3 bg-[#151A24]/60 border border-nexa-border/50 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">At Event Time Actions</span>
            <span className="text-[8px] font-mono text-gray-500 uppercase">Exact scheduled time</span>
          </div>

          {/* Open Navigation application */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setAutoAtOpenNavApp(!autoAtOpenNavApp)}
                className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                  autoAtOpenNavApp ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-gray-600 text-transparent'
                }`}
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
              </button>
              <span className="text-xs font-semibold text-gray-300">Open navigation application</span>
            </div>
            <span className="text-[9px] text-gray-500 font-mono uppercase font-bold">GPS Drive</span>
          </div>
        </div>
      </div>

      {/* Styled Location Map Preview (Screen 6 details) */}
      {location && (
        <div className="mt-6">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Location Map Preview</label>
          <div className="relative h-28 w-full rounded-2xl bg-slate-900 border border-nexa-border overflow-hidden flex flex-col justify-end p-3 group">
            {/* Minimalistic styled grid map placeholder background */}
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#2979FF_1px,transparent_1px)] [background-size:16px_16px]"></div>
            
            {/* Visual map route indicator lines */}
            <div className="absolute top-1/4 left-1/4 right-1/2 h-1 bg-nexa-blue/30 rounded-full"></div>
            <div className="absolute top-1/4 right-1/2 bottom-1/3 w-1 bg-nexa-blue/30 rounded-full"></div>
            
            {/* Styled Pin Marker */}
            <div className="absolute top-1/3 right-1/2 transform translate-x-1/2 -translate-y-1/2 text-red-500 animate-bounce">
              <MapPin className="w-6 h-6 fill-red-500/20" />
            </div>

            <div className="bg-[#151A24]/90 backdrop-blur-md border border-nexa-border rounded-xl p-2 relative z-10 flex items-center justify-between">
              <div>
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">Destination</span>
                <p className="text-xs font-semibold text-white mt-0.5">{location}</p>
              </div>
              <div className="p-1 rounded bg-teal-500/10 text-teal-400">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
