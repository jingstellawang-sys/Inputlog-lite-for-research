import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square, Save, Download, Clock, User } from 'lucide-react';
import { useWritingRecorder } from '../hooks/useWritingRecorder';
import { SessionStatus, WritingSession } from '../types';

interface WritingEditorProps {
  onSessionComplete: (session: WritingSession) => void;
}

export const WritingEditor: React.FC<WritingEditorProps> = ({ onSessionComplete }) => {
  const {
    status,
    text,
    setText,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    logEvent,
    studentName,
    setStudentName
  } = useWritingRecorder();

  const [elapsedTime, setElapsedTime] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer logic
  useEffect(() => {
    if (status === SessionStatus.RECORDING) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Keyboard Event Handlers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (status !== SessionStatus.RECORDING) return;
    
    // We log navigation keys and special keys here
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete', 'Enter'].includes(e.key)) {
       // Note: Backspace/Delete will also trigger onChange/onInput, but logging the intent here is useful for InputLog
       // However, to avoid double counting, we might just tag the type in onInput if we can. 
       // For Inputlog specifically, logging KEYSTROKES is the gold standard.
       
       // Let's purely log the key press event as a 'navigation' or 'potential-edit' marker
       // The actual text change is captured in onChange
       if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
         logEvent({
           type: 'navigation',
           position: e.currentTarget.selectionStart,
           actionDetails: e.key
         });
       }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (status !== SessionStatus.RECORDING) {
      // Allow typing if not started? Maybe not. Let's block it or just not log it.
      // If IDLE, just update local state without logging (preview mode)
      setText(e.target.value);
      return;
    }

    const newValue = e.target.value;
    const newLength = newValue.length;
    const oldLength = text.length;
    const diff = newLength - oldLength;
    const pos = e.target.selectionStart;

    let type: 'insert' | 'delete' | 'paste' = 'insert';
    let content = '';

    if (diff > 0) {
      type = 'insert';
      // Approximation of inserted content
      // If diff > 1, likely a paste or autocomplete
      if (diff > 1) {
        type = 'paste';
        content = newValue.slice(pos - diff, pos);
      } else {
        content = newValue.slice(pos - 1, pos);
      }
    } else if (diff < 0) {
      type = 'delete';
      // Content deleted is hard to know exactly from just onChange without keeping full history, 
      // but we log the event.
    }

    logEvent({
      type,
      position: pos,
      content,
      actionDetails: diff === 0 ? 'replace' : undefined
    });

    setText(newValue);
  };

  const handleFinish = () => {
    const session = stopSession();
    if (session) {
      onSessionComplete(session);
    }
  };

  const handleStart = () => {
    if (!studentName.trim()) {
      alert("Please enter your name first.");
      return;
    }
    startSession(studentName);
    // Focus textarea
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  if (status === SessionStatus.IDLE) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200">
          <div className="mb-6 flex justify-center">
             <div className="p-4 bg-indigo-100 rounded-full text-indigo-600">
               <User size={48} />
             </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Inputlog Lite</h1>
          <p className="text-slate-500 mb-6">Enter your name to begin a new writing session.</p>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your Name / ID"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              autoFocus
            />
            <button
              onClick={handleStart}
              disabled={!studentName.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play size={20} />
              Start Writing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Top Bar */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="text-slate-900 font-semibold flex items-center gap-2">
            <User size={18} className="text-slate-400" />
            {studentName}
          </div>
          <div className="h-4 w-px bg-slate-300"></div>
          <div className="flex items-center gap-2 text-indigo-600 font-mono text-lg bg-indigo-50 px-3 py-1 rounded-md">
            <Clock size={16} />
            {formatTime(elapsedTime)}
          </div>
          <div className="text-sm text-slate-400 font-medium">
             {text.trim().split(/\s+/).filter(w => w.length > 0).length} words
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === SessionStatus.RECORDING ? (
            <button 
              onClick={pauseSession}
              className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors font-medium text-sm"
            >
              <Pause size={16} /> Pause
            </button>
          ) : (
             <button 
              onClick={resumeSession}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors font-medium text-sm"
            >
              <Play size={16} /> Resume
            </button>
          )}

          <button 
            onClick={handleFinish}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors font-medium text-sm"
          >
            <Square size={16} fill="currentColor" /> Finish
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-auto bg-slate-50 flex justify-center cursor-text" onClick={() => textareaRef.current?.focus()}>
        <div className="w-full max-w-3xl py-12 px-8 h-min min-h-full bg-white shadow-sm my-4 md:my-8 rounded-xl border border-slate-100">
           <textarea
             ref={textareaRef}
             value={text}
             onChange={handleChange}
             onKeyDown={handleKeyDown}
             placeholder="Start writing here..."
             className="w-full h-full min-h-[60vh] resize-none outline-none text-lg leading-relaxed font-serif-write text-slate-800 placeholder:text-slate-300"
             spellCheck={false}
           />
        </div>
      </div>
      
      {/* Status Overlay if Paused */}
      {status === SessionStatus.PAUSED && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Session Paused</h2>
            <button 
              onClick={resumeSession}
              className="px-8 py-3 bg-indigo-600 text-white rounded-full text-lg font-medium shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all flex items-center gap-2 mx-auto"
            >
              <Play size={20} fill="currentColor" /> Resume Writing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}