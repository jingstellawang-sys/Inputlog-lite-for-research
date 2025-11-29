import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square, Clock, User, Activity, Upload, RefreshCw } from 'lucide-react';
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
    handleFocus,
    handleBlur,
    studentName,
    setStudentName,
    eventCount,
    checkSavedSession,
    restoreSession
  } = useWritingRecorder();

  const [elapsedTime, setElapsedTime] = useState(0);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for saved session on mount
  useEffect(() => {
    const saved = checkSavedSession();
    if (saved) setHasSavedSession(true);
  }, []); // eslint-disable-line

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

  // Keyboard Event Handlers for Navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (status !== SessionStatus.RECORDING) return;
    
    // Log navigation keys which don't trigger onChange
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
       logEvent({
         type: 'navigation',
         position: e.currentTarget.selectionStart,
         actionDetails: e.key
       });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (status !== SessionStatus.RECORDING) {
      setText(e.target.value);
      return;
    }

    const newText = e.target.value;
    const oldText = text;
    
    // Improved Diff Logic for Accurate Replay
    let start = 0;
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
      start++;
    }

    let endOld = oldText.length - 1;
    let endNew = newText.length - 1;

    while (endOld >= start && endNew >= start && oldText[endOld] === newText[endNew]) {
      endOld--;
      endNew--;
    }

    const deletedText = oldText.slice(start, endOld + 1);
    const insertedText = newText.slice(start, endNew + 1);

    // If text was replaced (both delete and insert happened), we log them sequentially for the replayer
    // Logic: Delete first, then Insert.
    
    // 1. Log Deletion if exists
    if (deletedText.length > 0) {
      logEvent({
        type: 'delete',
        position: start,
        content: deletedText, // Store what was deleted to help debugging/analysis
        actionDetails: 'Delete/Backspace'
      });
    }

    // 2. Log Insertion if exists
    if (insertedText.length > 0) {
      logEvent({
        type: insertedText.length > 1 ? 'paste' : 'insert',
        position: start,
        content: insertedText,
        actionDetails: insertedText.length > 1 ? 'Paste/Replace' : 'Type'
      });
    }

    setText(newText);
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
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleRestore = () => {
    restoreSession();
    setHasSavedSession(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Basic validation to ensure it's a valid session file
        if (json.id && json.events && Array.isArray(json.events) && json.finalText !== undefined) {
          onSessionComplete(json as WritingSession);
        } else {
          alert("Invalid log file format. Please upload a valid Inputlog JSON export.");
        }
      } catch (err) {
        console.error(err);
        alert("Error reading file. The file might be corrupted.");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
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

            {hasSavedSession && (
              <button
                onClick={handleRestore}
                className="w-full bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw size={20} />
                Restore Unsaved Session
              </button>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-3 uppercase font-bold tracking-wider">For Teachers</p>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden" 
              accept=".json"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Upload size={16} />
              Import Session Log
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
          
          {/* Recording Status */}
          <div className={`flex items-center gap-2 font-mono text-sm px-3 py-1 rounded-full border transition-all ${
            status === SessionStatus.RECORDING 
              ? 'bg-red-50 border-red-100 text-red-600' 
              : 'bg-amber-50 border-amber-100 text-amber-600'
          }`}>
             {status === SessionStatus.RECORDING && (
               <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
               </span>
             )}
             {status === SessionStatus.RECORDING ? 'REC' : 'PAUSED'}
             <span className="ml-1 font-semibold">{formatTime(elapsedTime)}</span>
          </div>
          
          <div className="text-xs text-slate-400 flex items-center gap-1">
             <Activity size={12} />
             {eventCount} events
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
             onFocus={handleFocus}
             onBlur={handleBlur}
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