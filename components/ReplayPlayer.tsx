import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward } from 'lucide-react';
import { WritingSession, LogEvent } from '../types';

interface ReplayPlayerProps {
  session: WritingSession;
}

export const ReplayPlayer: React.FC<ReplayPlayerProps> = ({ session }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [reconstructedText, setReconstructedText] = useState('');
  
  const animationFrameRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const duration = session.totalActiveTime; // ms

  // Filter relevant text-changing events
  const relevantEvents = React.useMemo(() => {
    return session.events.filter(e => 
      e.type === 'insert' || e.type === 'delete' || e.type === 'paste'
    );
  }, [session.events]);

  const reconstructTextAtTime = (targetTime: number) => {
    let currentText = '';
    
    for (const event of relevantEvents) {
      if (event.relativeTime > targetTime) break;

      if (event.type === 'insert' || event.type === 'paste') {
        const insertContent = event.content || '';
        const left = currentText.slice(0, event.position);
        const right = currentText.slice(event.position);
        currentText = left + insertContent + right;
      } else if (event.type === 'delete') {
        const deleteLen = event.content ? event.content.length : 1;
        const left = currentText.slice(0, event.position);
        const right = currentText.slice(event.position + deleteLen);
        currentText = left + right;
      }
    }
    return currentText;
  };

  useEffect(() => {
    setReconstructedText(reconstructTextAtTime(currentTime));
  }, [currentTime, relevantEvents]);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentTime >= duration) {
        setCurrentTime(0);
      }
      setIsPlaying(true);
      lastFrameTimeRef.current = performance.now();
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  useEffect(() => {
    if (isPlaying) {
      const loop = (now: number) => {
        const delta = now - lastFrameTimeRef.current;
        lastFrameTimeRef.current = now;

        setCurrentTime(prev => {
          const nextTime = prev + (delta * playbackSpeed);
          if (nextTime >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return nextTime;
        });
        
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      animationFrameRef.current = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying, playbackSpeed, duration]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          Session Replay
        </h3>
        <div className="text-xs font-mono text-slate-400">
           {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <div className="flex-1 bg-slate-100 p-8 overflow-auto flex justify-center">
        <div className="w-full max-w-3xl bg-white shadow-sm border border-slate-200 min-h-full p-8 font-serif-write text-lg leading-relaxed whitespace-pre-wrap text-slate-800">
          {reconstructedText}
          <span className="inline-block w-0.5 h-5 bg-indigo-500 animate-pulse ml-0.5 align-middle"></span>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border-t border-slate-200 p-4">
        <input 
          type="range" 
          min="0" 
          max={duration} 
          value={currentTime} 
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentTime(Number(e.target.value));
          }}
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-4 accent-indigo-600"
        />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
             <button 
               onClick={handlePlayPause}
               className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
             >
               {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
             </button>
             <button 
               onClick={handleReset}
               className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
             >
               <RotateCcw size={20} />
             </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
            {[1, 2, 5, 10].map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  playbackSpeed === speed 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};