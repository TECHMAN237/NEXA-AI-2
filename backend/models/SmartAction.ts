export interface SmartAction {
  id: string;
  user_id: string;
  type: 'OPEN_APP' | 'OPEN_DOCUMENT';
  app: string;
  document: string;
  enabled: boolean;
  created_at: string;
}
