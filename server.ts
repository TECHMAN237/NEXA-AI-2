import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { dbService } from "./server/db.js";
import { routeUserIntent, checkAndMemorize, chatWithNexa, generateAILinePlanning, reformulateReminder } from "./server/gemini.js";
import {
  reminderController,
  planningController,
  studyController,
  eventController,
  actionController,
  notificationController
} from "./utils/container.js";

// Global user session state (default to user-1 for instant friction-free UX)
let currentUserId = "user-1";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable JSON request body parsing
  app.use(express.json());

  // ==================== AUTHENTICATION API ====================
  app.get("/api/auth/session", (req, res) => {
    const user = dbService.getUserById(currentUserId);
    if (!user) {
      return res.json({ session: null });
    }
    const profile = dbService.getProfile(user.id);
    res.json({ session: { user, profile } });
  });

  app.post("/api/auth/login", (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    // Simple sign in / auto sign up
    let user = dbService.getUserByEmail(email);
    if (!user) {
      user = dbService.createUser(email, "Guest User");
    }
    currentUserId = user.id;
    const profile = dbService.getProfile(user.id);
    res.json({ user, profile });
  });

  app.post("/api/auth/logout", (req, res) => {
    currentUserId = "";
    res.json({ success: true });
  });

  // ==================== PROFILE API ====================
  app.get("/api/profile", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const profile = dbService.getProfile(currentUserId);
    res.json(profile || { error: "Profile not found" });
  });

  app.put("/api/profile", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const updated = dbService.updateProfile(currentUserId, req.body);
    res.json(updated);
  });

  // ==================== REMINDERS API ====================
  app.get("/api/reminders", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    reminderController.list(req, res, currentUserId);
  });

  app.post("/api/reminders", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    reminderController.create(req, res, currentUserId);
  });

  app.put("/api/reminders/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    reminderController.update(req, res, currentUserId);
  });

  app.put("/api/reminders/:id/trigger", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    reminderController.trigger(req, res, currentUserId);
  });

  app.put("/api/reminders/:id/complete", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    reminderController.complete(req, res, currentUserId);
  });

  app.put("/api/reminders/:id/cancel", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    reminderController.cancelState(req, res, currentUserId);
  });

  app.delete("/api/reminders/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    reminderController.delete(req, res, currentUserId);
  });

  app.post("/api/reminders/reformulate", async (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const { title, description } = req.body;
    try {
      const profile = dbService.getProfile(currentUserId);
      const userName = profile?.full_name ? profile.full_name.trim().split(' ')[0] : undefined;
      const speechText = await reformulateReminder(title, description, userName);
      res.json({ speechText });
    } catch (err) {
      console.error("Reformulation API error:", err);
      res.status(500).json({ error: "Failed to reformulate reminder text" });
    }
  });

  // ==================== TASKS & PLANNING API ====================
  app.get("/api/tasks", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.listTasks(req, res, currentUserId);
  });

  app.post("/api/tasks", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.createTask(req, res, currentUserId);
  });

  app.put("/api/tasks/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.updateTask(req, res, currentUserId);
  });

  app.delete("/api/tasks/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.deleteTask(req, res, currentUserId);
  });

  app.get("/api/plans", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.listPlans(req, res, currentUserId);
  });

  app.post("/api/plans", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.createPlan(req, res, currentUserId);
  });

  app.put("/api/plans/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.updatePlan(req, res, currentUserId);
  });

  app.post("/api/plans/generate", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    planningController.generatePlan(req, res, currentUserId);
  });

  // ==================== EXAMS & STUDY API ====================
  app.get("/api/exams", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    studyController.listExams(req, res, currentUserId);
  });

  app.post("/api/exams", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    studyController.createExam(req, res, currentUserId);
  });

  app.put("/api/exams/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    studyController.updateExam(req, res, currentUserId);
  });

  app.delete("/api/exams/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    studyController.deleteExam(req, res, currentUserId);
  });

  app.get("/api/study-sessions", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    studyController.listSessions(req, res, currentUserId);
  });

  app.post("/api/study-sessions/generate", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    studyController.generateSessions(req, res, currentUserId);
  });

  app.put("/api/study-sessions/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    studyController.updateSession(req, res, currentUserId);
  });

  // ==================== EVENTS API ====================
  app.get("/api/events", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    eventController.list(req, res, currentUserId);
  });

  app.post("/api/events", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    eventController.create(req, res, currentUserId);
  });

  app.put("/api/events/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    eventController.update(req, res, currentUserId);
  });

  app.delete("/api/events/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    eventController.delete(req, res, currentUserId);
  });

  // ==================== MEMORIES API ====================
  app.get("/api/memories", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    res.json(dbService.getMemories(currentUserId));
  });

  app.post("/api/memories", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const { text, category } = req.body;
    const newMemory = dbService.createMemory(currentUserId, {
      text,
      category: category || 'Preference'
    });
    res.status(201).json(newMemory);
  });

  app.put("/api/memories/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const updated = dbService.updateMemory(currentUserId, req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/memories/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const deleted = dbService.deleteMemory(currentUserId, req.params.id);
    res.json({ success: deleted });
  });

  // ==================== NOTIFICATIONS API ====================
  app.get("/api/notifications", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    notificationController.list(req, res, currentUserId);
  });

  app.post("/api/notifications/read", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    notificationController.markRead(req, res, currentUserId);
  });

  // ==================== NOTIFICATION HISTORY / ACTIVITIES API ====================
  app.get("/api/notification-history", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    notificationController.listHistory(req, res, currentUserId);
  });

  app.post("/api/notification-history", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    notificationController.createHistory(req, res, currentUserId);
  });

  app.delete("/api/notification-history", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const db = dbService.getDb();
    db.notification_history = (db.notification_history || []).filter((item: any) => item.user_id !== currentUserId);
    dbService.writeDb(db);
    res.json({ success: true });
  });

  app.delete("/api/notification-history/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    notificationController.deleteHistory(req, res, currentUserId);
  });

  // ==================== SMART ACTIONS API ====================
  app.get("/api/smart-actions", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    actionController.list(req, res, currentUserId);
  });

  app.post("/api/smart-actions", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    actionController.create(req, res, currentUserId);
  });

  app.put("/api/smart-actions/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    actionController.update(req, res, currentUserId);
  });

  app.delete("/api/smart-actions/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    actionController.delete(req, res, currentUserId);
  });

  app.post("/api/smart-actions/:id/execute", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    actionController.execute(req, res, currentUserId);
  });

  // ==================== INTELLIGENT AI CHAT & ASSISTANT ACTION ENGINE ====================
  app.get("/api/chat/messages", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const conversation = dbService.getOrCreateConversation(currentUserId);
    res.json(dbService.getMessages(conversation.id));
  });

  app.post("/api/chat/clear", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const conversation = dbService.getOrCreateConversation(currentUserId);
    dbService.clearMessages(conversation.id);
    res.json({ success: true });
  });

  app.post("/api/chat/message", async (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const { text, type } = req.body;
    if (!text) return res.status(400).json({ error: "Message text is required" });

    const conversation = dbService.getOrCreateConversation(currentUserId);

    // 1. Save user's message in local DB
    const userMsg = dbService.createMessage(conversation.id, {
      sender: 'user',
      text,
      type: type || 'text'
    });

    // 2. Proactive AI Intent Router - Run Gemini classifier
    const intentClassification = await routeUserIntent(text);
    console.log(`[NEXA Intent Classifier] Determined Intent: ${intentClassification.intent}`);

    // Perform real actions based on classified intent
    if (intentClassification.intent === 'reminder' && intentClassification.extractedData) {
      const data = intentClassification.extractedData;
      if (data.title) {
        dbService.createReminder(currentUserId, {
          title: data.title,
          date: data.date || new Date().toISOString().split('T')[0],
          time: data.time || "12:00",
          repeat: 'none',
          priority: data.priority || 'medium',
          voice_notification: true,
          active: true
        });
      }
    } else if (intentClassification.intent === 'study' && intentClassification.extractedData) {
      const data = intentClassification.extractedData;
      if (data.course) {
        dbService.createExam(currentUserId, {
          course: data.course,
          exam_date: data.date || "2025-08-20",
          difficulty: (data.difficulty === 'low' || data.difficulty === 'high' ? data.difficulty : 'medium') as 'low' | 'medium' | 'high',
          study_hours_per_day: 3,
          preferred_study_time: "20:00 - 23:00",
          available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          remaining_chapters: 10,
          progress: 0
        });
      }
    } else if (intentClassification.intent === 'event' && intentClassification.extractedData) {
      const data = intentClassification.extractedData;
      if (data.title) {
        dbService.createEvent(currentUserId, {
          title: data.title,
          date: data.date || new Date().toISOString().split('T')[0],
          time: data.time || "12:00",
          location: data.location || "Tech Hub, Buea",
          description: data.description || "Created automatically by NEXA AI",
          reminder_time: "30 minutes before",
          participants: ['Alex']
        });
      }
    } else if (intentClassification.intent === 'planning') {
      // Auto trigger plan creation or advice
    }

    // 3. Proactive AI Memory Check - Analyze if we should remember facts
    const memorizedText = await checkAndMemorize(currentUserId, text);
    if (memorizedText) {
      console.log(`[NEXA Memory] Logged new fact: "${memorizedText}"`);
    }

    // 4. Generate AI response contextually grounded
    const assistantReply = await chatWithNexa(currentUserId, conversation.id, text);

    // 5. Save AI's response in DB
    const assistantMsg = dbService.createMessage(conversation.id, {
      sender: 'assistant',
      text: assistantReply,
      type: 'text'
    });

    res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      intent: intentClassification,
      memorized: memorizedText
    });
  });

  // ==================== ASSET/VITE STATIC DELIVERY ====================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NEXA AI full-stack backend running on port ${PORT}`);
  });
}

startServer();
