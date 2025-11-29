import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LogEvent, SessionStatus, WritingSession } from '../types';
import { v4 as uuidv4 } from 'uuid'; // Note: In a real app we'd install uuid, here we'll mock it or use a simple random string

// Simple ID generator since we can't easily npm install new packages in this prompt format
const generateId = () => Math.random().toString(36).substring(2, 15);

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
      // Adjust lastEventTime so we don't count the pause duration as a huge "writing pause"
      // Or we can leave it to track the break. Let's track the break but maybe mark it.
      // For simplicity in InputLog Lite, we just update state. 
      // Ideally, we'd log a 'resume' event.
      lastEventTimeRef.current = Date.now();
      setStatus(SessionStatus.RECORDING);
    }
  };

  const stopSession = (): WritingSession | null => {
    if (status === SessionStatus.IDLE) return null;

    const endTime = Date.now();
    setStatus(SessionStatus.FINISHED);

    const session: WritingSession = {
      id: generateId(),
      studentName,
      startTime: startTimeRef.current,
      endTime,
      events: eventsRef.current,
      finalText: text,
      totalActiveTime: endTime - startTimeRef.current, // Simplified
      totalPauseTime: 0 // Would need complex calc based on thresholds
    };

    sessionRef.current = session;
    return session;
  };

  const logEvent = (partialEvent: Omit<LogEvent, 'id' | 'timestamp' | 'relativeTime' | 'pauseBefore'>) => {
    if (status !== SessionStatus.RECORDING) return;

    const now = Date.now();
    const pauseBefore = now - lastEventTimeRef.current;

    const event: LogEvent = {
      id: generateId(),
      timestamp: now,
      relativeTime: now - startTimeRef.current,
      pauseBefore,
      ...partialEvent
    };

    eventsRef.current.push(event);
    lastEventTimeRef.current = now;
  };

  const handleTextChange = (newText: string, changeType: 'insert' | 'delete' | 'paste', position: number, detail?: string) => {
     // This is called by the component
     logEvent({
       type: changeType,
       position,
       content: detail || (changeType === 'insert' ? newText.slice(position - 1, position) : ''), // Rough approximation for insert char
       actionDetails: detail
     });
     setText(newText);
  };
  
  // Specific handler for input events to be more precise
  const processInputEvent = (
    e: React.FormEvent<HTMLTextAreaElement> | React.KeyboardEvent<HTMLTextAreaElement>,
    currentText: string,
    selectionStart: number
  ) => {
     // The component will handle the heavy lifting of diffing
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
    eventCount: eventsRef.current.length
  };
};