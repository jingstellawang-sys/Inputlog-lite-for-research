import { useState, useRef, useEffect, useCallback } from 'react';
import { LogEvent, SessionStatus, WritingSession } from '../types';
import { v4 as uuidv4 } from 'uuid';

const AUTOSAVE_KEY = 'inputlog_autosave_v1';

export const useWritingRecorder = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [text, setText] = useState('');
  const [studentName, setStudentName] = useState('');
  
  // Refs for mutable data
  const eventsRef = useRef<LogEvent[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastEventTimeRef = useRef<number>(0);
  const sessionRef = useRef<WritingSession | null>(null);

  // --- Auto-Save Logic ---
  const saveToStorage = useCallback(() => {
    if (status === SessionStatus.RECORDING || status === SessionStatus.PAUSED) {
      const currentData = {
        studentName,
        text,
        status,
        startTime: startTimeRef.current,
        events: eventsRef.current,
        lastEventTime: lastEventTimeRef.current,
        timestamp: Date.now()
      };
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(currentData));
      } catch (e) {
        console.warn("Autosave failed (quota exceeded?)", e);
      }
    }
  }, [status, text, studentName]);

  // Auto-save interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === SessionStatus.RECORDING) {
      interval = setInterval(saveToStorage, 2000); // Save every 2 seconds
    }
    return () => clearInterval(interval);
  }, [status, saveToStorage]);

  // Restore logic
  const checkSavedSession = () => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if it's recent (e.g., within 48 hours)
        if (Date.now() - parsed.timestamp < 48 * 60 * 60 * 1000) {
          return parsed;
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  const restoreSession = () => {
    const saved = checkSavedSession();
    if (saved) {
      setStudentName(saved.studentName);
      setText(saved.text);
      eventsRef.current = saved.events;
      startTimeRef.current = saved.startTime;
      lastEventTimeRef.current = saved.lastEventTime;
      setStatus(SessionStatus.PAUSED); // Restore in paused state
      logEvent({ type: 'insert', position: 0, content: '', actionDetails: 'Session Restored' });
    }
  };

  const downloadRawBackup = () => {
     const saved = checkSavedSession();
     if(saved) {
        const backupSession: WritingSession = {
            id: 'BACKUP-' + Date.now(),
            studentName: saved.studentName || 'Unknown',
            startTime: saved.startTime,
            endTime: Date.now(),
            events: saved.events,
            finalText: saved.text,
            totalActiveTime: Date.now() - saved.startTime,
            totalPauseTime: 0
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupSession, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `BACKUP_RECOVERY_${saved.studentName || 'student'}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
     }
  };

  const clearSavedSession = () => {
    localStorage.removeItem(AUTOSAVE_KEY);
  };
  // -----------------------

  const startSession = (name: string) => {
    // CRITICAL: Only clear the old save when we explicitly start a NEW session
    clearSavedSession(); 
    
    setStudentName(name);
    setText('');
    eventsRef.current = [];
    startTimeRef.current = Date.now();
    lastEventTimeRef.current = startTimeRef.current;
    setStatus(SessionStatus.RECORDING);
    
    logEvent({
      type: 'focus',
      position: 0,
      content: ''
    });
  };

  const pauseSession = () => {
    if (status === SessionStatus.RECORDING) {
      setStatus(SessionStatus.PAUSED);
      saveToStorage();
    }
  };

  const resumeSession = () => {
    if (status === SessionStatus.PAUSED) {
      lastEventTimeRef.current = Date.now();
      setStatus(SessionStatus.RECORDING);
    }
  };

  const stopSession = (): WritingSession | null => {
    if (status === SessionStatus.IDLE) return null;

    const endTime = Date.now();
    setStatus(SessionStatus.FINISHED);

    // Force one last save before finishing, just in case
    saveToStorage();

    const session: WritingSession = {
      id: uuidv4(),
      studentName,
      startTime: startTimeRef.current,
      endTime,
      events: eventsRef.current,
      finalText: text,
      totalActiveTime: endTime - startTimeRef.current,
      totalPauseTime: 0 
    };

    sessionRef.current = session;
    // REMOVED: clearSavedSession(); -> Do NOT clear this here. 
    // We keep it until the user successfully starts a NEW session.
    return session;
  };

  const logEvent = (partialEvent: Omit<LogEvent, 'id' | 'timestamp' | 'relativeTime' | 'pauseBefore'>) => {
    // Modified: Allow logging during PAUSED only for specific system events (like restore)
    if (status !== SessionStatus.RECORDING && status !== SessionStatus.PAUSED) return;
    
    if (status === SessionStatus.PAUSED && 
        partialEvent.type !== 'focus' && 
        partialEvent.type !== 'blur' && 
        partialEvent.actionDetails !== 'Session Restored') return;

    const now = Date.now();
    const pauseBefore = now - lastEventTimeRef.current;

    const event: LogEvent = {
      id: uuidv4(),
      timestamp: now,
      relativeTime: now - startTimeRef.current,
      pauseBefore,
      ...partialEvent
    };

    eventsRef.current.push(event);
    lastEventTimeRef.current = now;
  };

  const handleTextChange = (newText: string, changeType: 'insert' | 'delete' | 'paste', position: number, detail?: string) => {
     logEvent({
       type: changeType,
       position,
       content: detail || (changeType === 'insert' ? newText.slice(position - 1, position) : ''),
       actionDetails: detail
     });
     setText(newText);
  };
  
  const handleFocus = () => {
    if (status === SessionStatus.RECORDING) {
      logEvent({ type: 'focus', position: -1, content: 'Window Focused' });
    }
  };

  const handleBlur = () => {
    if (status === SessionStatus.RECORDING) {
      logEvent({ type: 'blur', position: -1, content: 'Window Blurred' });
    }
  };

  return {
    status,
    text,
    setText,
    studentName,
    setStudentName,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    logEvent,
    handleTextChange,
    handleFocus,
    handleBlur,
    eventCount: eventsRef.current.length,
    checkSavedSession,
    restoreSession,
    downloadRawBackup
  };
};