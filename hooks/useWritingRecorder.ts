import { useState, useRef } from 'react';
import { LogEvent, SessionStatus, WritingSession } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const useWritingRecorder = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [text, setText] = useState('');
  const [studentName, setStudentName] = useState('');
  
  // Refs for mutable data that shouldn't trigger re-renders on every keystroke
  const eventsRef = useRef<LogEvent[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastEventTimeRef = useRef<number>(0);
  const sessionRef = useRef<WritingSession | null>(null);

  const startSession = (name: string) => {
    setStudentName(name);
    setText('');
    eventsRef.current = [];
    startTimeRef.current = Date.now();
    lastEventTimeRef.current = startTimeRef.current;
    setStatus(SessionStatus.RECORDING);
    
    // Initial focus event
    logEvent({
      type: 'focus',
      position: 0,
      content: ''
    });
  };

  const pauseSession = () => {
    if (status === SessionStatus.RECORDING) {
      setStatus(SessionStatus.PAUSED);
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
    return session;
  };

  const logEvent = (partialEvent: Omit<LogEvent, 'id' | 'timestamp' | 'relativeTime' | 'pauseBefore'>) => {
    if (status !== SessionStatus.RECORDING && status !== SessionStatus.PAUSED) return;
    
    // Allow logging focus events even if paused (sometimes) but generally stick to recording status
    // For this implementation, we mostly log during RECORDING.
    if (status === SessionStatus.PAUSED && partialEvent.type !== 'focus' && partialEvent.type !== 'blur') return;

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
  
  // Track window focus/blur
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
    eventCount: eventsRef.current.length
  };
};