import { Request, Response } from 'express';
import { StudyTrackingEngine } from '../engines/StudyTrackingEngine.js';

export class StudyController {
  constructor(private studyEngine: StudyTrackingEngine) {}

  async listExams(req: Request, res: Response, userId: string) {
    try {
      const list = await this.studyEngine['studyRepo'].listExams(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async createExam(req: Request, res: Response, userId: string) {
    try {
      const exam = await this.studyEngine.createExam(userId, req.body);
      res.status(201).json(exam);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async updateExam(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const updated = await this.studyEngine.updateExam(userId, id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async deleteExam(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const success = await this.studyEngine.deleteExam(userId, id);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async listSessions(req: Request, res: Response, userId: string) {
    try {
      const list = await this.studyEngine['studyRepo'].listStudySessions(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async generateSessions(req: Request, res: Response, userId: string) {
    try {
      const { exam_id } = req.body;
      if (!exam_id) {
        return res.status(400).json({ error: 'exam_id is required' });
      }
      const list = await this.studyEngine.generateStudyPlan(userId, exam_id);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async updateSession(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const updated = await this.studyEngine['studyRepo'].updateStudySession(userId, id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
}
