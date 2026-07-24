import fs from 'fs';
import path from 'path';
import { 
  User, Profile, Reminder, Task, Plan, Exam, 
  StudySession, Event, Memory, Message, Conversation, Notification 
} from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface Schema {
  users: User[];
  profiles: Profile[];
  conversations: Conversation[];
  messages: Message[];
  reminders: Reminder[];
  tasks: Task[];
  plans: Plan[];
  exams: Exam[];
  study_sessions: StudySession[];
  events: Event[];
  memories: Memory[];
  notifications: Notification[];
  notification_history: any[];
  smart_actions: any[];
}

const DEFAULT_DB: Schema = {
  users: [
    {
      id: 'user-1',
      email: 'steevezali@gmail.com',
      full_name: 'Alex T.',
      created_at: '2025-05-01T08:00:00Z'
    }
  ],
  profiles: [
    {
      id: 'profile-1',
      user_id: 'user-1',
      email: 'steevezali@gmail.com',
      full_name: 'Alex T.',
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      premium: true,
      language: 'English',
      theme: 'Dark',
      notifications_enabled: true,
      connected_apps: ['Google Calendar', 'Spotify', 'Notion'],
      created_at: '2025-05-01T08:00:00Z'
    }
  ],
  conversations: [
    {
      id: 'conv-1',
      user_id: 'user-1',
      title: 'Study planning & reminders help',
      created_at: '2025-05-18T10:00:00Z',
      updated_at: '2025-05-20T09:30:00Z'
    }
  ],
  messages: [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender: 'user',
      text: 'Remind me to study tomorrow.',
      created_at: '2025-05-20T09:28:00Z',
      type: 'text'
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-1',
      sender: 'assistant',
      text: "I've added a study reminder for tomorrow (May 21, 2025) at 18:00. I also scheduled 'Study Computer Architecture' in your timeline.",
      created_at: '2025-05-20T09:29:00Z',
      type: 'text'
    }
  ],
  reminders: [
    {
      id: 'rem-1',
      user_id: 'user-1',
      title: 'Buy groceries',
      date: '2025-05-21',
      time: '10:00',
      repeat: 'none',
      priority: 'high',
      voice_notification: true,
      active: true,
      created_at: '2025-05-20T08:00:00Z'
    },
    {
      id: 'rem-2',
      user_id: 'user-1',
      title: 'Project submission',
      date: '2025-05-22',
      time: '23:59',
      repeat: 'none',
      priority: 'medium',
      voice_notification: true,
      active: true,
      created_at: '2025-05-20T08:00:00Z'
    },
    {
      id: 'rem-3',
      user_id: 'user-1',
      title: 'Call Mom',
      date: '2025-05-23',
      time: '18:00',
      repeat: 'weekly',
      priority: 'low',
      voice_notification: false,
      active: true,
      created_at: '2025-05-19T08:00:00Z'
    },
    {
      id: 'rem-4',
      user_id: 'user-1',
      title: 'Doctor Appointment',
      date: '2025-05-24',
      time: '09:00',
      repeat: 'none',
      priority: 'high',
      voice_notification: true,
      active: true,
      created_at: '2025-05-18T08:00:00Z'
    },
    {
      id: 'rem-5',
      user_id: 'user-1',
      title: 'Pay Electricity Bill',
      date: '2025-05-25',
      time: '20:00',
      repeat: 'monthly',
      priority: 'medium',
      voice_notification: false,
      active: true,
      created_at: '2025-05-15T08:00:00Z'
    }
  ],
  tasks: [
    {
      id: 'task-1',
      user_id: 'user-1',
      title: 'Study Computer Architecture',
      date: '2025-05-21',
      time: '08:00',
      duration_hours: 2,
      priority: 'high',
      status: 'pending',
      created_at: '2025-05-20T08:00:00Z'
    },
    {
      id: 'task-2',
      user_id: 'user-1',
      title: 'Project Work',
      date: '2025-05-21',
      time: '10:30',
      duration_hours: 2,
      priority: 'medium',
      status: 'pending',
      created_at: '2025-05-20T08:00:00Z'
    }
  ],
  plans: [
    {
      id: 'plan-1',
      user_id: 'user-1',
      date: '2025-05-21',
      timeline: [
        { id: 'time-1', time: '08:00 - 10:00', title: 'Study Computer Architecture', duration: '2h', color: 'blue' },
        { id: 'time-2', time: '10:30 - 12:30', title: 'Project Work', duration: '2h', color: 'purple' },
        { id: 'time-3', time: '12:30 - 13:30', title: 'Lunch Break', duration: '1h', color: 'slate' },
        { id: 'time-4', time: '14:00 - 16:00', title: 'Data Structures', duration: '2h', color: 'teal' },
        { id: 'time-5', time: '17:00 - 18:00', title: 'Gym', duration: '1h', color: 'green' },
        { id: 'time-6', time: '20:00 - 21:30', title: 'Review & Notes', duration: '1.5h', color: 'orange' }
      ],
      suggestions: 'You have 2 free hours tomorrow morning. Perfect time for deep study.',
      created_at: '2025-05-20T09:30:00Z'
    }
  ],
  exams: [
    {
      id: 'exam-1',
      user_id: 'user-1',
      course: 'Computer Architecture',
      exam_date: '2025-08-20',
      difficulty: 'high',
      study_hours_per_day: 3,
      preferred_study_time: '20:00 - 23:00',
      available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      remaining_chapters: 8,
      progress: 35,
      created_at: '2025-05-01T08:00:00Z'
    }
  ],
  study_sessions: [
    {
      id: 'session-1',
      user_id: 'user-1',
      exam_id: 'exam-1',
      title: 'Memory Hierarchy Revision',
      date: '2025-05-21',
      time: '20:00',
      duration_minutes: 180,
      status: 'scheduled',
      created_at: '2025-05-20T09:30:00Z'
    }
  ],
  events: [
    {
      id: 'event-1',
      user_id: 'user-1',
      title: 'Team Meeting',
      date: '2025-05-22',
      time: '15:00',
      location: 'Tech Hub, Buea',
      description: 'Discuss project progress and next steps.',
      reminder_time: '30 minutes before',
      participants: ['Sarah', 'Michael', 'Kevin', 'Alex'],
      created_at: '2025-05-18T12:00:00Z'
    }
  ],
  memories: [
    {
      id: 'mem-1',
      user_id: 'user-1',
      text: 'I usually study at night.',
      category: 'Preference',
      created_at: '2025-05-10T14:30:00Z'
    },
    {
      id: 'mem-2',
      user_id: 'user-1',
      text: 'My Computer Architecture exam is August 20.',
      category: 'Milestone',
      created_at: '2025-05-08T11:15:00Z'
    },
    {
      id: 'mem-3',
      user_id: 'user-1',
      text: 'I prefer Spotify while studying.',
      category: 'Preference',
      created_at: '2025-05-05T09:00:00Z'
    },
    {
      id: 'mem-4',
      user_id: 'user-1',
      text: 'I like silent reminders during meetings.',
      category: 'Setting',
      created_at: '2025-04-29T16:20:00Z'
    },
    {
      id: 'mem-5',
      user_id: 'user-1',
      text: 'I go to church every Sunday morning.',
      category: 'Schedule',
      created_at: '2025-04-20T10:00:00Z'
    }
  ],
  notifications: [
    {
      id: 'notif-1',
      user_id: 'user-1',
      title: 'Upcoming Exam Prep',
      text: 'Your Computer Architecture exam is in 3 months. Keep up the revision!',
      date: '2025-05-20T09:00:00Z',
      read: false,
      created_at: '2025-05-20T09:00:00Z'
    }
  ],
  notification_history: [
    {
      id: 'act-1',
      user_id: 'user-1',
      type: 'REMINDER',
      title: 'Study CSC301',
      description: 'NEXA reminded you to start your study session.',
      status: 'completed',
      created_at: '2026-07-14T18:00:00-07:00',
      metadata: {}
    },
    {
      id: 'act-2',
      user_id: 'user-1',
      type: 'STUDY',
      title: 'Computer Architecture Revision',
      description: 'NEXA created a revision reminder because your exam is in 14 days.',
      status: 'completed',
      created_at: '2026-07-14T14:30:00-07:00',
      metadata: { countdown_days: 14, progress: 35, action_label: 'Revise Chapters 1-3' }
    },
    {
      id: 'act-3',
      user_id: 'user-1',
      type: 'EVENT',
      title: 'Tech Conference',
      description: 'NEXA reminded you 30 minutes before your event.',
      status: 'completed',
      created_at: '2026-07-14T15:00:00-07:00',
      metadata: { location: 'Tech Hub, Buea', action_label: 'View Location' }
    },
    {
      id: 'act-4',
      user_id: 'user-1',
      type: 'AI_ACTION',
      title: 'NEXA opened your study document',
      description: 'Action executed: OPEN_DOCUMENT',
      status: 'completed',
      created_at: '2026-07-14T20:00:00-07:00',
      metadata: { action_type: 'OPEN_DOCUMENT', document_name: 'CSC301 Notes PDF' }
    },
    {
      id: 'act-5',
      user_id: 'user-1',
      type: 'PLANNING',
      title: 'Review & Notes Schedule Block',
      description: 'NEXA marked planning block as finished on schedule.',
      status: 'completed',
      created_at: '2026-07-14T17:00:00-07:00',
      metadata: { time_slot: '17:00 - 18:00' }
    }
  ],
  smart_actions: []
};

// Ensure data folder and file exists
function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  } else {
    // Merge potential schema updates
    try {
      const current = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      const updated = { ...DEFAULT_DB, ...current };
      fs.writeFileSync(DB_FILE, JSON.stringify(updated, null, 2));
    } catch (e) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    }
  }
}

initDb();

function readDb(): Schema {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_DB;
  }
}

function writeDb(db: Schema) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export const dbService = {
  // Base Getter
  getDb: readDb,
  writeDb: writeDb,

  // User & Auth
  getUserByEmail: (email: string): User | undefined => {
    const db = readDb();
    return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  getUserById: (id: string): User | undefined => {
    const db = readDb();
    return db.users.find(u => u.id === id);
  },

  createUser: (email: string, full_name: string): User => {
    const db = readDb();
    const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) return existing;

    const newUser: User = {
      id: `user-${Date.now()}`,
      email,
      full_name,
      created_at: new Date().toISOString()
    };

    db.users.push(newUser);

    // Create profile
    const newProfile: Profile = {
      id: `profile-${Date.now()}`,
      user_id: newUser.id,
      email: newUser.email,
      full_name: newUser.full_name,
      premium: true,
      language: 'English',
      theme: 'Dark',
      notifications_enabled: true,
      connected_apps: ['Google Calendar'],
      created_at: new Date().toISOString()
    };
    db.profiles.push(newProfile);

    writeDb(db);
    return newUser;
  },

  getProfile: (userId: string): Profile | undefined => {
    const db = readDb();
    return db.profiles.find(p => p.user_id === userId);
  },

  updateProfile: (userId: string, updates: Partial<Profile>): Profile | undefined => {
    const db = readDb();
    const idx = db.profiles.findIndex(p => p.user_id === userId);
    if (idx === -1) return undefined;

    db.profiles[idx] = { ...db.profiles[idx], ...updates };
    writeDb(db);
    return db.profiles[idx];
  },

  // Reminders
  getReminders: (userId: string): Reminder[] => {
    const db = readDb();
    return db.reminders.filter(r => r.user_id === userId);
  },

  createReminder: (userId: string, r: Omit<Reminder, 'id' | 'user_id' | 'created_at'>): Reminder => {
    const db = readDb();
    const newReminder: Reminder = {
      ...r,
      id: `rem-${Date.now()}`,
      user_id: userId,
      created_at: new Date().toISOString()
    };
    db.reminders.push(newReminder);
    writeDb(db);
    return newReminder;
  },

  updateReminder: (userId: string, id: string, updates: Partial<Reminder>): Reminder | undefined => {
    const db = readDb();
    const idx = db.reminders.findIndex(r => r.id === id && r.user_id === userId);
    if (idx === -1) return undefined;

    db.reminders[idx] = { ...db.reminders[idx], ...updates };
    writeDb(db);
    return db.reminders[idx];
  },

  deleteReminder: (userId: string, id: string): boolean => {
    const db = readDb();
    const initialLen = db.reminders.length;
    db.reminders = db.reminders.filter(r => !(r.id === id && r.user_id === userId));
    if (db.reminders.length !== initialLen) {
      writeDb(db);
      return true;
    }
    return false;
  },

  // Tasks
  getTasks: (userId: string): Task[] => {
    const db = readDb();
    return db.tasks.filter(t => t.user_id === userId);
  },

  createTask: (userId: string, t: Omit<Task, 'id' | 'user_id' | 'created_at'>): Task => {
    const db = readDb();
    const newTask: Task = {
      ...t,
      id: `task-${Date.now()}`,
      user_id: userId,
      created_at: new Date().toISOString()
    };
    db.tasks.push(newTask);
    writeDb(db);
    return newTask;
  },

  updateTask: (userId: string, id: string, updates: Partial<Task>): Task | undefined => {
    const db = readDb();
    const idx = db.tasks.findIndex(t => t.id === id && t.user_id === userId);
    if (idx === -1) return undefined;

    db.tasks[idx] = { ...db.tasks[idx], ...updates };
    writeDb(db);
    return db.tasks[idx];
  },

  deleteTask: (userId: string, id: string): boolean => {
    const db = readDb();
    const initialLen = db.tasks.length;
    db.tasks = db.tasks.filter(t => !(t.id === id && t.user_id === userId));
    if (db.tasks.length !== initialLen) {
      writeDb(db);
      return true;
    }
    return false;
  },

  // Plans
  getPlans: (userId: string): Plan[] => {
    const db = readDb();
    return db.plans.filter(p => p.user_id === userId);
  },

  createPlan: (userId: string, p: Omit<Plan, 'id' | 'user_id' | 'created_at'>): Plan => {
    const db = readDb();
    const newPlan: Plan = {
      ...p,
      id: `plan-${Date.now()}`,
      user_id: userId,
      created_at: new Date().toISOString()
    };
    db.plans.push(newPlan);
    writeDb(db);
    return newPlan;
  },

  // Exams
  getExams: (userId: string): Exam[] => {
    const db = readDb();
    return db.exams.filter(e => e.user_id === userId);
  },

  createExam: (userId: string, ex: Omit<Exam, 'id' | 'user_id' | 'created_at'>): Exam => {
    const db = readDb();
    const newExam: Exam = {
      ...ex,
      id: `exam-${Date.now()}`,
      user_id: userId,
      created_at: new Date().toISOString()
    };
    db.exams.push(newExam);
    writeDb(db);
    return newExam;
  },

  updateExam: (userId: string, id: string, updates: Partial<Exam>): Exam | undefined => {
    const db = readDb();
    const idx = db.exams.findIndex(e => e.id === id && e.user_id === userId);
    if (idx === -1) return undefined;

    db.exams[idx] = { ...db.exams[idx], ...updates };
    writeDb(db);
    return db.exams[idx];
  },

  deleteExam: (userId: string, id: string): boolean => {
    const db = readDb();
    const initialLen = db.exams.length;
    db.exams = db.exams.filter(e => !(e.id === id && e.user_id === userId));
    db.study_sessions = db.study_sessions.filter(s => s.exam_id !== id);
    if (db.exams.length !== initialLen) {
      writeDb(db);
      return true;
    }
    return false;
  },

  // Study Sessions
  getStudySessions: (userId: string): StudySession[] => {
    const db = readDb();
    return db.study_sessions.filter(s => s.user_id === userId);
  },

  createStudySession: (userId: string, s: Omit<StudySession, 'id' | 'user_id' | 'created_at'>): StudySession => {
    const db = readDb();
    const newSession: StudySession = {
      ...s,
      id: `session-${Date.now()}`,
      user_id: userId,
      created_at: new Date().toISOString()
    };
    db.study_sessions.push(newSession);
    writeDb(db);
    return newSession;
  },

  // Events
  getEvents: (userId: string): Event[] => {
    const db = readDb();
    return db.events.filter(e => e.user_id === userId);
  },

  createEvent: (userId: string, ev: Omit<Event, 'id' | 'user_id' | 'created_at'>): Event => {
    const db = readDb();
    const newEvent: Event = {
      ...ev,
      id: `event-${Date.now()}`,
      user_id: userId,
      created_at: new Date().toISOString()
    };
    db.events.push(newEvent);
    writeDb(db);
    return newEvent;
  },

  updateEvent: (userId: string, id: string, updates: Partial<Event>): Event | undefined => {
    const db = readDb();
    const idx = db.events.findIndex(e => e.id === id && e.user_id === userId);
    if (idx === -1) return undefined;

    db.events[idx] = { ...db.events[idx], ...updates };
    writeDb(db);
    return db.events[idx];
  },

  deleteEvent: (userId: string, id: string): boolean => {
    const db = readDb();
    const initialLen = db.events.length;
    db.events = db.events.filter(e => !(e.id === id && e.user_id === userId));
    if (db.events.length !== initialLen) {
      writeDb(db);
      return true;
    }
    return false;
  },

  // Memories
  getMemories: (userId: string): Memory[] => {
    const db = readDb();
    return db.memories.filter(m => m.user_id === userId);
  },

  createMemory: (userId: string, m: Omit<Memory, 'id' | 'user_id' | 'created_at'>): Memory => {
    const db = readDb();
    const newMemory: Memory = {
      ...m,
      id: `mem-${Date.now()}`,
      user_id: userId,
      created_at: new Date().toISOString()
    };
    db.memories.push(newMemory);
    writeDb(db);
    return newMemory;
  },

  updateMemory: (userId: string, id: string, updates: Partial<Memory>): Memory | undefined => {
    const db = readDb();
    const idx = db.memories.findIndex(m => m.id === id && m.user_id === userId);
    if (idx === -1) return undefined;

    db.memories[idx] = { ...db.memories[idx], ...updates };
    writeDb(db);
    return db.memories[idx];
  },

  deleteMemory: (userId: string, id: string): boolean => {
    const db = readDb();
    const initialLen = db.memories.length;
    db.memories = db.memories.filter(m => !(m.id === id && m.user_id === userId));
    if (db.memories.length !== initialLen) {
      writeDb(db);
      return true;
    }
    return false;
  },

  // Conversations & Messages
  getConversations: (userId: string): Conversation[] => {
    const db = readDb();
    return db.conversations.filter(c => c.user_id === userId);
  },

  getOrCreateConversation: (userId: string): Conversation => {
    const db = readDb();
    const existing = db.conversations.find(c => c.user_id === userId);
    if (existing) return existing;

    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      user_id: userId,
      title: 'Main Chat Assistant',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.conversations.push(newConv);
    writeDb(db);
    return newConv;
  },

  getMessages: (conversationId: string): Message[] => {
    const db = readDb();
    return db.messages.filter(m => m.conversation_id === conversationId);
  },

  createMessage: (conversationId: string, m: Omit<Message, 'id' | 'conversation_id' | 'created_at'>): Message => {
    const db = readDb();
    const newMessage: Message = {
      ...m,
      id: `msg-${Date.now()}`,
      conversation_id: conversationId,
      created_at: new Date().toISOString()
    };
    db.messages.push(newMessage);

    // Update conversation updated_at
    const convIdx = db.conversations.findIndex(c => c.id === conversationId);
    if (convIdx !== -1) {
      db.conversations[convIdx].updated_at = new Date().toISOString();
    }

    writeDb(db);
    return newMessage;
  },

  clearMessages: (conversationId: string): void => {
    const db = readDb();
    db.messages = db.messages.filter(m => m.conversation_id !== conversationId);
    writeDb(db);
  },

  // Notifications
  getNotifications: (userId: string): Notification[] => {
    const db = readDb();
    return db.notifications.filter(n => n.user_id === userId);
  },

  createNotification: (userId: string, title: string, text: string): Notification => {
    const db = readDb();
    const newNotif: Notification = {
      id: `notif-${Date.now()}`,
      user_id: userId,
      title,
      text,
      date: new Date().toISOString(),
      read: false,
      created_at: new Date().toISOString()
    };
    db.notifications.push(newNotif);
    writeDb(db);
    return newNotif;
  },

  markNotificationsRead: (userId: string): void => {
    const db = readDb();
    db.notifications.forEach(n => {
      if (n.user_id === userId) {
        n.read = true;
      }
    });
    writeDb(db);
  },

  // Notification History / Activities
  getNotificationHistory: (userId: string): any[] => {
    const db = readDb();
    // Return or default to empty if not existing in old DB files
    return db.notification_history || [];
  },

  createNotificationHistory: (userId: string, item: { type: string; title: string; description: string; source_id?: string; status: string; metadata?: any }): any => {
    const db = readDb();
    if (!db.notification_history) db.notification_history = [];
    const newItem = {
      id: `act-${Date.now()}`,
      user_id: userId,
      type: item.type,
      title: item.title,
      description: item.description,
      source_id: item.source_id,
      status: item.status || 'completed',
      metadata: item.metadata || {},
      created_at: new Date().toISOString()
    };
    db.notification_history.push(newItem);
    writeDb(db);
    return newItem;
  },

  deleteNotificationHistory: (userId: string, id: string): boolean => {
    const db = readDb();
    if (!db.notification_history) return false;
    const initialLen = db.notification_history.length;
    db.notification_history = db.notification_history.filter(item => !(item.id === id && item.user_id === userId));
    if (db.notification_history.length !== initialLen) {
      writeDb(db);
      return true;
    }
    return false;
  }
};
