export enum SessionStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED'
}

export interface LogEvent {
  id: string;
  type: 'insert' | 'delete' | 'focus' | 'blur' | 'paste' | 'navigation';
  timestamp: number;
  relativeTime: number; // Time since start
  content?: string; // Character added or full text snapshot for paste
  position: number; // Cursor position
  pauseBefore: number; // Milliseconds since last event
  actionDetails?: string; // e.g., "ArrowLeft", "Backspace"
}

export interface WritingSession {
  id: string;
  studentName: string;
  startTime: number;
  endTime?: number;
  events: LogEvent[];
  finalText: string;
  totalPauseTime: number;
  totalActiveTime: number;
}

export interface AnalysisResult {
  fluencyScore: number; // 0-100
  bursts: { count: number; avgLength: number };
  pauses: { count: number; avgDuration: number };
  aiFeedback: string;
}
