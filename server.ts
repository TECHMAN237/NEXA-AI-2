import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { dbService } from "./server/db.js";
import { routeUserIntent, checkAndMemorize, chatWithNexa, chatWithXenaStream, generateAILinePlanning, reformulateReminder } from "./server/gemini.js";
import { ServerActionEngine } from "./server/ServerActionEngine.js";
import { normalizeTimeString, extractTimeFromText } from "./src/utils/timeUtils.js";
import { parseFollowUpUpdate, parseEventFollowUpUpdate } from "./src/utils/reminderParser.js";
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

  // ==================== MEMORY VAULT API ====================
  app.get("/api/memory-vault", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    res.json(dbService.getMemoryVaultItems(currentUserId));
  });

  app.post("/api/memory-vault", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const { title, content, category, tags } = req.body;
    const newItem = dbService.createMemoryVaultItem(currentUserId, {
      title: title || 'Saved Vault Note',
      content: content || title || '',
      category: category || 'General',
      tags: tags || []
    });

    dbService.createNotificationHistory(currentUserId, {
      type: 'MEMORY_VAULT',
      title: `Saved Vault Note: "${newItem.title}"`,
      description: `Information saved in Memory Vault: ${newItem.content.slice(0, 60)}...`,
      source_id: newItem.id,
      status: 'completed',
      metadata: { category: newItem.category }
    });

    res.status(201).json(newItem);
  });

  app.put("/api/memory-vault/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const updated = dbService.updateMemoryVaultItem(currentUserId, req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/memory-vault/:id", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const deleted = dbService.deleteMemoryVaultItem(currentUserId, req.params.id);
    res.json({ success: deleted });
  });

  // Convert Memory Vault Note to Reminder, Event, Planning Task, or Study Exam
  app.post("/api/memory-vault/:id/convert", (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const { targetModule, date, time, priority } = req.body;
    const vaultItems = dbService.getMemoryVaultItems(currentUserId);
    const item = vaultItems.find(v => v.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: "Memory Vault item not found" });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const defaultTime = time || '09:00';
    const defaultDate = date || todayStr;

    let convertedResult: any = null;

    if (targetModule === 'REMINDER' || targetModule === 'reminders') {
      convertedResult = dbService.createReminder(currentUserId, {
        title: item.title,
        description: item.content,
        date: defaultDate,
        time: defaultTime,
        repeat: 'none',
        priority: priority || 'medium',
        voice_notification: true,
        active: true,
        category: 'Vault Converted'
      });
    } else if (targetModule === 'EVENT' || targetModule === 'events') {
      convertedResult = dbService.createEvent(currentUserId, {
        title: item.title,
        description: item.content,
        date: defaultDate,
        time: defaultTime,
        location: item.category === 'Location' ? item.content : 'TBD',
        reminder_time: '30 minutes before',
        participants: []
      });
    } else if (targetModule === 'PLANNING' || targetModule === 'planning') {
      convertedResult = dbService.createTask(currentUserId, {
        title: item.title,
        date: defaultDate,
        time: defaultTime,
        duration_hours: 1,
        priority: priority || 'medium',
        status: 'pending'
      });
    } else if (targetModule === 'STUDY_TRACKING' || targetModule === 'study') {
      convertedResult = dbService.createExam(currentUserId, {
        course: item.title,
        exam_date: defaultDate,
        difficulty: 'medium',
        study_hours_per_day: 2,
        preferred_study_time: '18:00 - 20:00',
        available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        remaining_chapters: 5,
        progress: 0,
        auto_reminders: true
      });
    }

    dbService.createNotificationHistory(currentUserId, {
      type: 'MEMORY_VAULT',
      title: `Converted Vault Note to ${targetModule}`,
      description: `"${item.title}" converted into ${targetModule}.`,
      status: 'completed'
    });

    res.json({ success: true, targetModule, item: convertedResult });
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

    console.log('[CHAT_INPUT]', { userMessage: text });

    // 1. Save user's message in local DB
    const userMsg = dbService.createMessage(conversation.id, {
      sender: 'user',
      text,
      type: type || 'text'
    });

    // 2. Proactive AI Intent Router with Follow-Up Protection
    const reminders = dbService.getReminders(currentUserId);
    const lastReminder = reminders.length > 0 ? reminders[reminders.length - 1] : null;
    const followUp = parseFollowUpUpdate(text, lastReminder);

    let intentClassification: any = null;
    let actionsToRun: any[] = [];

    if (followUp && followUp.isFollowUp && lastReminder) {
      console.log(`[Xena Follow-Up] Directing update to existing reminder ID ${lastReminder.id}:`, followUp.updates);
      actionsToRun = [{
        intent: 'REMINDER',
        action: 'UPDATE',
        payload: { ...followUp.updates, id: lastReminder.id }
      }];
      intentClassification = {
        intent: 'REMINDER',
        intents: ['REMINDER'],
        actions: actionsToRun,
        explanation: `Updating existing reminder "${lastReminder.title}" (${lastReminder.id})`
      };
    } else {
      intentClassification = await routeUserIntent(text);
      console.log('[AI_INTENT]', { intent: intentClassification.intent, classification: intentClassification });

      if (intentClassification.actions && intentClassification.actions.length > 0) {
        actionsToRun = intentClassification.actions;
      } else if (intentClassification.intent && intentClassification.intent !== 'NORMAL_CHAT') {
        actionsToRun = [{
          intent: intentClassification.intent,
          action: 'CREATE',
          payload: intentClassification.extractedData || {}
        }];
      }
    }

    console.log('[ACTION_DISPATCH]', { actions: actionsToRun });

    const actionResults = await ServerActionEngine.executeActions(currentUserId, actionsToRun, text);

    // 4. Proactive AI Memory Check
    const memorizedText = await checkAndMemorize(currentUserId, text);

    // 5. Generate AI response contextually grounded
    let assistantReply = await chatWithNexa(currentUserId, conversation.id, text, actionResults);
    if (!assistantReply || !assistantReply.trim()) {
      assistantReply = "Done — Action completed. Would you like to add anything else?";
    }

    console.log('[CHAT_RESPONSE]', { response: assistantReply });

    // 6. Save AI's response in DB only if non-empty
    const assistantMsg = dbService.createMessage(conversation.id, {
      sender: 'assistant',
      text: assistantReply.trim(),
      type: 'text'
    });

    res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      intent: intentClassification,
      actionResults,
      memorized: memorizedText
    });
  });

  // Streaming SSE endpoint for real-time token streaming
  app.post("/api/chat/stream", async (req, res) => {
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    const { text, type } = req.body;
    if (!text) return res.status(400).json({ error: "Message text is required" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const conversation = dbService.getOrCreateConversation(currentUserId);

    console.log('[CHAT_INPUT]', { userMessage: text });

    dbService.createMessage(conversation.id, {
      sender: 'user',
      text,
      type: type || 'text'
    });

    let actionResults: any[] = [];
    try {
      const reminders = dbService.getReminders(currentUserId);
      const lastReminder = reminders.length > 0 ? reminders[reminders.length - 1] : null;
      const followUp = parseFollowUpUpdate(text, lastReminder);

      const events = dbService.getEvents(currentUserId);
      const lastIncompleteEvent = events.slice().reverse().find(e => e.date === 'Not specified' || e.time === 'Not specified' || e.location === 'Not specified');
      const eventFollowUp = parseEventFollowUpUpdate(text, lastIncompleteEvent);

      let actionsToRun: any[] = [];

      if (followUp && followUp.isFollowUp && lastReminder) {
        console.log(`[Xena Stream Follow-Up] Updating reminder ID ${lastReminder.id}:`, followUp.updates);
        actionsToRun = [{
          intent: 'REMINDER',
          action: 'UPDATE',
          payload: { ...followUp.updates, id: lastReminder.id }
        }];
      } else if (eventFollowUp && eventFollowUp.isFollowUp && lastIncompleteEvent) {
        console.log(`[Xena Stream Event Follow-Up] Updating event ID ${lastIncompleteEvent.id}:`, eventFollowUp.updates);
        actionsToRun = [{
          intent: 'EVENT',
          action: 'UPDATE',
          payload: { ...eventFollowUp.updates, id: lastIncompleteEvent.id }
        }];
      } else {
        const intentClassification = await routeUserIntent(text);
        console.log('[AI_INTENT]', { intent: intentClassification.intent, classification: intentClassification });

        if (intentClassification.actions && intentClassification.actions.length > 0) {
          actionsToRun = intentClassification.actions;
        } else if (intentClassification.intent && intentClassification.intent !== 'NORMAL_CHAT') {
          actionsToRun = [{
            intent: intentClassification.intent,
            action: 'CREATE',
            payload: intentClassification.extractedData || {}
          }];
        }
      }

      console.log('[ACTION_DISPATCH]', { actions: actionsToRun });

      actionResults = await ServerActionEngine.executeActions(currentUserId, actionsToRun, text);
      await checkAndMemorize(currentUserId, text);
    } catch (e) {
      console.warn('[Xena Chat Stream] Intent execution error:', e);
    }

    let accumulatedText = '';

    try {
      await chatWithXenaStream(
        currentUserId, 
        conversation.id, 
        text, 
        (chunk: string) => {
          accumulatedText += chunk;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        },
        actionResults
      );

      console.log('[CHAT_RESPONSE]', { response: accumulatedText });

      if (accumulatedText && accumulatedText.trim().length > 0) {
        dbService.createMessage(conversation.id, {
          sender: 'assistant',
          text: accumulatedText.trim(),
          type: 'text'
        });
      }

      res.write(`data: ${JSON.stringify({ done: true, fullText: accumulatedText, actionResults })}\n\n`);
      res.end();
    } catch (err: any) {
      console.error("[Xena Stream Error]", err);
      res.write(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`);
      res.end();
    }
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
    console.log(`Xena AI full-stack backend running on port ${PORT}`);
  });
}

startServer();
