// Repositories
import { ReminderRepositoryImpl } from '../services/ReminderRepositoryImpl.js';
import { PlanningRepositoryImpl } from '../services/PlanningRepositoryImpl.js';
import { StudyRepositoryImpl } from '../services/StudyRepositoryImpl.js';
import { EventRepositoryImpl } from '../services/EventRepositoryImpl.js';
import { ActionRepositoryImpl } from '../services/ActionRepositoryImpl.js';
import { NotificationRepositoryImpl } from '../services/NotificationRepositoryImpl.js';

// Engines
import { NotificationEngine } from '../engines/NotificationEngine.js';
import { ReminderEngine } from '../engines/ReminderEngine.js';
import { PlanningEngine } from '../engines/PlanningEngine.js';
import { StudyTrackingEngine } from '../engines/StudyTrackingEngine.js';
import { EventEngine } from '../engines/EventEngine.js';
import { SmartActionEngine } from '../engines/SmartActionEngine.js';

// Controllers
import { ReminderController } from '../controllers/ReminderController.js';
import { PlanningController } from '../controllers/PlanningController.js';
import { StudyController } from '../controllers/StudyController.js';
import { EventController } from '../controllers/EventController.js';
import { ActionController } from '../controllers/ActionController.js';
import { NotificationController } from '../controllers/NotificationController.js';

// 1. Instantiate Repositories
const reminderRepo = new ReminderRepositoryImpl();
const planningRepo = new PlanningRepositoryImpl();
const studyRepo = new StudyRepositoryImpl();
const eventRepo = new EventRepositoryImpl();
const actionRepo = new ActionRepositoryImpl();
const notificationRepo = new NotificationRepositoryImpl();

// 2. Instantiate Engines with Injected Repositories
export const notificationEngine = new NotificationEngine(notificationRepo);

export const reminderEngine = new ReminderEngine(reminderRepo, notificationEngine);
export const planningEngine = new PlanningEngine(planningRepo, notificationEngine, reminderEngine);
export const studyEngine = new StudyTrackingEngine(studyRepo, notificationEngine, reminderEngine);
export const eventEngine = new EventEngine(eventRepo, notificationEngine, reminderEngine);
export const actionEngine = new SmartActionEngine(actionRepo, notificationEngine);

// 3. Instantiate Controllers with Injected Engines
export const reminderController = new ReminderController(reminderEngine);
export const planningController = new PlanningController(planningEngine);
export const studyController = new StudyController(studyEngine);
export const eventController = new EventController(eventEngine);
export const actionController = new ActionController(actionEngine);
export const notificationController = new NotificationController(notificationEngine);
