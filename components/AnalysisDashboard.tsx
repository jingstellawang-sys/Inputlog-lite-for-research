import React, { useState, useMemo } from 'react';
import { WritingSession, LogEvent } from '../types';
import { ArrowLeft, Download, BrainCircuit, Loader2, FileText, Activity, PlayCircle, BarChart2, ChevronDown, ChevronUp, Clock, Eraser, PenLine, MoveRight, ArrowRight } from 'lucide-react';
import { analyzeWritingSession } from '../services/geminiService';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ReplayPlayer } from './ReplayPlayer';

interface AnalysisDashboardProps {
  session: WritingSession;
  onBack: () => void;
}

// Helper types for local analysis
interface PauseInfo {
  id: string;
  duration: number;
  startTime: number;
  context: string;
  locationType: 'Start' | 'Paragraph' | 'Sentence' | 'Word' | 'Mid-word';
}

interface DeletionGroup {
  id: string;
  type: 'Typo' | 'Revision';
  content: string;
  replacement?: string; // Text typed immediately after deletion
  count: number; // Number of raw events
  time: number;
  position: number;
}

interface InsertionGroup {
  id: string;
  content: string;
  time: number;
  count: number; // keystrokes
  level: 'Sentence' | 'Paragraph';
}

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({ session, onBack }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'replay'>('stats');
  const [showPauseList, setShowPauseList] = useState(false);
  const [showDeletionList, setShowDeletionList] = useState(false);
  const [showInsertionList, setShowInsertionList] = useState(false);

  // Advanced Process Analysis (Pauses & Deletions & Insertions)
  const processAnalysis = useMemo(() => {
    const pauses: PauseInfo[] = [];
    const deletionGroups: DeletionGroup[] = [];
    const insertionGroups: InsertionGroup[] = [];
    
    let currentText = "";
    
    // Buffers
    let deletionBuffer: LogEvent[] = [];
    let insertionBuffer: LogEvent[] = [];
    let replacementBuffer: LogEvent[] = []; // To track text typed immediately after a delete

    // State to link delete -> insert (Replacement)
    let lastDeletionGroup: DeletionGroup | null = null;
    let isTrackingReplacement = false;

    // --- Helpers ---

    const flushReplacement = () => {
      if (lastDeletionGroup && replacementBuffer.length > 0) {
        lastDeletionGroup.replacement = replacementBuffer.map(e => e.content).join('');
      }
      // Reset replacement tracking
      lastDeletionGroup = null;
      isTrackingReplacement = false;
      replacementBuffer = [];
    };

    const flushDeletions = () => {
      if (deletionBuffer.length === 0) return;
      
      const totalChars = deletionBuffer.reduce((acc, e) => acc + (e.content?.length || 1), 0);
      const firstEvent = deletionBuffer[0];
      const combinedContent = deletionBuffer.map(e => e.content).join('');
      const startPos = firstEvent.position;

      const isTypo = totalChars < 3; 

      const newGroup: DeletionGroup = {
        id: firstEvent.id,
        type: isTypo ? 'Typo' : 'Revision',
        content: combinedContent,
        count: deletionBuffer.length,
        time: firstEvent.relativeTime,
        position: startPos
      };

      deletionGroups.push(newGroup);
      lastDeletionGroup = newGroup; // Mark this group as potentially having a replacement
      deletionBuffer = [];
    };

    const flushInsertions = () => {
      if (insertionBuffer.length === 0) return;

      const firstEvent = insertionBuffer[0];
      const combinedContent = insertionBuffer.map(e => e.content).join('');
      
      // Determine Level based on context captured in the object? 
      // Simplified: We check if the content contains newlines or if it's large.
      // A better heuristic for "Paragraph Level" vs "Sentence Level" for *non-linear* moves:
      // If it happens at a newline boundary or includes newlines.
      
      let level: 'Sentence' | 'Paragraph' = 'Sentence';
      if (combinedContent.includes('\n') || combinedContent.length > 50) {
          level = 'Paragraph';
      }

      insertionGroups.push({
        id: firstEvent.id,
        content: combinedContent,
        time: firstEvent.relativeTime,
        count: insertionBuffer.length,
        level
      });
      insertionBuffer = [];
    };

    // --- Main Loop ---

    session.events.forEach((event, index) => {
      // 1. Analyze Pauses
      if (event.pauseBefore > 2000) { 
        const lastFewChars = currentText.slice(-20).replace(/\n/g, '↵');
        const lastChar = currentText.slice(-1);
        
        let locType: PauseInfo['locationType'] = 'Mid-word';
        if (currentText.length === 0) locType = 'Start';
        else if (lastChar === '\n') locType = 'Paragraph';
        else if (['.', '?', '!'].includes(lastChar)) locType = 'Sentence';
        else if ([' '].includes(lastChar)) locType = 'Word';

        pauses.push({
          id: event.id,
          duration: event.pauseBefore,
          startTime: event.relativeTime - event.pauseBefore,
          context: lastFewChars || "(Start of doc)",
          locationType: locType
        });
      }

      // 2. Track Events
      if (event.type === 'insert' || event.type === 'paste') {
        flushDeletions(); 

        // Check for Replacement Logic
        // If we just finished a deletion, and this insert is at the same spot, it's a replacement.
        const isReplacementStart = lastDeletionGroup && event.position === lastDeletionGroup.position && (event.timestamp - (lastDeletionGroup.time + lastDeletionGroup.count * 100) < 5000); // loose time check
        
        if (isReplacementStart || (isTrackingReplacement && isSequential(replacementBuffer, event))) {
           isTrackingReplacement = true;
           replacementBuffer.push(event);
           // We do NOT add to insertionBuffer if it's a replacement (it's part of the edit)
        } 
        else {
           // Normal Insertion
           flushReplacement(); 

           const isNonLinear = event.position < currentText.length;
           
           if (isNonLinear) {
              if (isSequential(insertionBuffer, event)) {
                insertionBuffer.push(event);
              } else {
                flushInsertions();
                insertionBuffer.push(event);
              }
           } else {
             flushInsertions(); // Stop tracking non-linear group if we are back to end
           }
        }

        // Update Text
        const left = currentText.slice(0, event.position);
        const right = currentText.slice(event.position);
        currentText = left + (event.content || '') + right;

      } 
      else if (event.type === 'delete') {
        flushInsertions();
        flushReplacement(); // Deletion breaks any replacement sequence

        if (isSequential(deletionBuffer, event)) {
          deletionBuffer.push(event);
        } else {
          flushDeletions();
          deletionBuffer.push(event);
        }

        // Update Text
        const deleteLen = event.content ? event.content.length : 1;
        const left = currentText.slice(0, event.position);
        const right = currentText.slice(event.position + deleteLen);
        currentText = left + right;

      } else {
        // Focus/Blur/Nav
        flushDeletions();
        flushInsertions();
        flushReplacement();
      }
    });

    flushDeletions();
    flushInsertions();
    flushReplacement();

    // Post-process Insertion Groups for Level categorization
    // (Since we can't easily access 'currentText' snapshot inside the flush helper without storing state)
    // We'll rely on the content heuristic for now, but we can improve.
    // Let's refine the 'level' for insertions: 
    // If the insertion was detected as non-linear, we want to know if it was Paragraph or Sentence level.
    // A simple approximation is checking if it *starts* with a capital letter or contains a period? 
    // Or if it contains newlines.
    
    const refinedInsertions = insertionGroups.map(g => {
        let level: 'Sentence' | 'Paragraph' = 'Sentence';
        // Heuristic: If it has newlines or is very long, likely paragraph level structure.
        // If it starts with a newline, definitely paragraph level.
        if (g.content.includes('\n') || g.content.length > 80) {
            level = 'Paragraph';
        }
        return { ...g, level };
    });

    return { pauses, deletionGroups, insertionGroups: refinedInsertions };
  }, [session.events]);

  // Helper for sequential check
  const isSequential = (buffer: LogEvent[], current: LogEvent) => {
    if (buffer.length === 0) return true; // Start of new buffer
    const last = buffer[buffer.length - 1];
    
    // For delete: timestamps close
    if (current.type === 'delete') {
        return (current.timestamp - last.timestamp < 2000);
    }
    // For insert: positions consecutive
    const lastLen = last.content?.length || 1;
    return (current.position === last.position + lastLen);
  };

  // Chart Data
  const timeData = useMemo(() => {
    const buckets: { time: number; chars: number }[] = [];
    const duration = session.endTime! - session.startTime;
    const bucketCount = 40; 
    const bucketSize = duration / bucketCount;

    for (let i = 0; i <= bucketCount; i++) {
      const timeThreshold = i * bucketSize;
      const eventsUpToNow = session.events.filter(e => e.relativeTime <= timeThreshold);
      const insertCount = eventsUpToNow.filter(e => e.type === 'insert' || e.type === 'paste').length;
      const deleteCount = eventsUpToNow.filter(e => e.type === 'delete').length;
      
      buckets.push({
        time: Math.round(timeThreshold / 1000),
        chars: Math.max(0, insertCount - deleteCount)
      });
    }
    return buckets;
  }, [session]);

  const stats = useMemo(() => {
     const words = session.finalText.trim().split(/\s+/).length;
     const durationSec = (session.endTime! - session.startTime) / 1000;
     const wpm = durationSec > 0 ? Math.round((words / durationSec) * 60) : 0;
     
     const typos = processAnalysis.deletionGroups.filter(d => d.type === 'Typo').length;
     const revisions = processAnalysis.deletionGroups.filter(d => d.type === 'Revision').length;
     const insertions = processAnalysis.insertionGroups.length;

     return { words, wpm, typos, revisions, insertions };
  }, [session, processAnalysis]);

  const handleAIAnalysis = async () => {
    setLoading(true);
    const result = await analyzeWritingSession(session);
    setAnalysis(result);
    setLoading(false);
  };

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(session, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `inputlog_lite_${session.studentName}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-6"
        >
          <ArrowLeft size={20} /> Back to Editor
        </button>

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Session Analysis</h1>
            <p className="text-slate-500">Student: <span className="font-semibold text-slate-700">{session.studentName}</span></p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
            >
              <Download size={18} /> Export Log
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl w-fit shadow-sm border border-slate-200 mb-8">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'stats' 
                ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart2 size={18} /> Statistics
          </button>
          <button
            onClick={() => setActiveTab('replay')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'replay' 
                ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <PlayCircle size={18} /> Process Replay
          </button>
        </div>

        {activeTab === 'replay' ? (
          <ReplayPlayer session={session} />
        ) : (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 text-indigo-600 mb-2">
                  <FileText size={20} /> <span className="text-[10px] font-bold uppercase tracking-wider">Words</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.words}</div>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 text-emerald-600 mb-2">
                  <Activity size={20} /> <span className="text-[10px] font-bold uppercase tracking-wider">Speed (wpm)</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.wpm}</div>
              </div>
               <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 text-amber-600 mb-2">
                  <Clock size={20} /> <span className="text-[10px] font-bold uppercase tracking-wider">Pauses (&gt;2s)</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{processAnalysis.pauses.length}</div>
              </div>
               <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 text-rose-600 mb-2">
                  <Eraser size={20} /> <span className="text-[10px] font-bold uppercase tracking-wider">Revisions</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.revisions} <span className="text-sm font-normal text-slate-400">/ {stats.typos} typos</span></div>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 text-blue-600 mb-2">
                  <MoveRight size={20} /> <span className="text-[10px] font-bold uppercase tracking-wider">Insertions</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.insertions}</div>
                <div className="text-xs text-slate-400">Non-linear edits</div>
              </div>
            </div>

            {/* Detailed Dropdowns */}
            <div className="grid md:grid-cols-2 gap-8">
               
               {/* Pause Details */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                 <button 
                  onClick={() => setShowPauseList(!showPauseList)}
                  className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                       <Clock size={20} />
                     </div>
                     <div className="text-left">
                       <h3 className="font-bold text-slate-800">Significant Pauses</h3>
                       <p className="text-xs text-slate-500">Breakdown of pauses over 2 seconds</p>
                     </div>
                   </div>
                   {showPauseList ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
                 </button>
                 
                 {showPauseList && (
                   <div className="px-6 pb-6 max-h-80 overflow-y-auto custom-scrollbar">
                     <table className="w-full text-sm">
                       <thead className="text-xs text-slate-400 font-semibold uppercase text-left sticky top-0 bg-white">
                         <tr>
                           <th className="pb-3">Time</th>
                           <th className="pb-3">Duration</th>
                           <th className="pb-3">Location</th>
                           <th className="pb-3">Context</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                         {processAnalysis.pauses.map((pause) => (
                           <tr key={pause.id} className="group hover:bg-slate-50">
                             <td className="py-3 text-slate-500 font-mono text-xs">{formatTime(pause.startTime)}</td>
                             <td className="py-3 font-semibold text-slate-700">{(pause.duration / 1000).toFixed(1)}s</td>
                             <td className="py-3">
                               <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                 pause.locationType === 'Paragraph' ? 'bg-indigo-100 text-indigo-700' :
                                 pause.locationType === 'Sentence' ? 'bg-emerald-100 text-emerald-700' :
                                 'bg-slate-100 text-slate-600'
                               }`}>
                                 {pause.locationType}
                               </span>
                             </td>
                             <td className="py-3 text-slate-400 italic text-xs max-w-[150px] truncate group-hover:text-slate-600 transition-colors">
                               "...{pause.context}"
                             </td>
                           </tr>
                         ))}
                         {processAnalysis.pauses.length === 0 && (
                            <tr><td colSpan={4} className="py-4 text-center text-slate-400">No significant pauses detected.</td></tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                 )}
               </div>

               {/* Deletion Details */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                 <button 
                  onClick={() => setShowDeletionList(!showDeletionList)}
                  className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                       <PenLine size={20} />
                     </div>
                     <div className="text-left">
                       <h3 className="font-bold text-slate-800">Deletion Analysis</h3>
                       <p className="text-xs text-slate-500">Categorized by Typos vs. Revisions</p>
                     </div>
                   </div>
                   {showDeletionList ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
                 </button>
                 
                 {showDeletionList && (
                   <div className="px-6 pb-6 max-h-80 overflow-y-auto custom-scrollbar">
                     <div className="space-y-3">
                       {processAnalysis.deletionGroups.map((del) => (
                         <div key={del.id} className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                           <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-8 rounded-full ${del.type === 'Typo' ? 'bg-blue-300' : 'bg-rose-500'}`}></div>
                                <div>
                                  <div className="text-xs font-mono text-slate-400 mb-0.5">{formatTime(del.time)}</div>
                                  <div className="text-sm font-semibold text-slate-700">
                                    {del.type === 'Typo' ? 'Typo Correction' : 'Content Revision'}
                                  </div>
                                </div>
                              </div>
                              <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono">
                                -{del.content.length} chars
                              </span>
                           </div>
                           
                           {/* Content Detail */}
                           <div className="ml-4 pl-3 border-l-2 border-slate-100">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-rose-500 bg-rose-50 px-1 rounded line-through decoration-rose-400 decoration-2 decoration-slice">
                                  {del.content}
                                </span>
                                {del.replacement && (
                                  <>
                                    <ArrowRight size={14} className="text-slate-400" />
                                    <span className="text-emerald-600 bg-emerald-50 px-1 rounded">
                                      {del.replacement}
                                    </span>
                                  </>
                                )}
                              </div>
                              {del.replacement && (
                                <div className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider">
                                  Replaced
                                </div>
                              )}
                           </div>
                         </div>
                       ))}
                       {processAnalysis.deletionGroups.length === 0 && (
                         <div className="text-center text-slate-400 py-4">No deletions recorded.</div>
                       )}
                     </div>
                   </div>
                 )}
               </div>

               {/* Insertion Details */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden col-span-1 md:col-span-2">
                 <button 
                  onClick={() => setShowInsertionList(!showInsertionList)}
                  className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                       <MoveRight size={20} />
                     </div>
                     <div className="text-left">
                       <h3 className="font-bold text-slate-800">Non-linear Insertions</h3>
                       <p className="text-xs text-slate-500">Edits made by moving back in the text</p>
                     </div>
                   </div>
                   {showInsertionList ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
                 </button>
                 
                 {showInsertionList && (
                   <div className="px-6 pb-6 max-h-60 overflow-y-auto custom-scrollbar">
                      <div className="space-y-2">
                        {processAnalysis.insertionGroups.map((ins) => (
                          <div key={ins.id} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-mono text-slate-500 w-12">{formatTime(ins.time)}</span>
                              
                              {/* Level Badge */}
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                                ins.level === 'Paragraph' 
                                  ? 'bg-purple-100 text-purple-700 border-purple-200' 
                                  : 'bg-blue-100 text-blue-700 border-blue-200'
                              }`}>
                                {ins.level} Level
                              </span>

                              <span className="text-sm text-slate-800 font-serif-write">
                                "{ins.content.length > 50 ? ins.content.slice(0,50) + '...' : ins.content}"
                              </span>
                            </div>
                            <span className="text-xs bg-white text-slate-500 border px-2 py-0.5 rounded">
                              +{ins.count} keystrokes
                            </span>
                          </div>
                        ))}
                        {processAnalysis.insertionGroups.length === 0 && (
                          <div className="text-center text-slate-400 py-4">No non-linear insertions detected (linear writing).</div>
                        )}
                      </div>
                   </div>
                 )}
               </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Process Visualization</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="time" 
                          stroke="#94a3b8" 
                          tickFormatter={(val) => formatTime(val * 1000)}
                          tick={{fontSize: 12}}
                        />
                        <YAxis 
                          stroke="#94a3b8" 
                          tick={{fontSize: 12}}
                          label={{ value: 'Net Characters', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip 
                          formatter={(value) => [value, 'Net Chars']}
                          labelFormatter={(label) => formatTime(label * 1000)}
                          contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                        />
                        <Line 
                          type="step" 
                          dataKey="chars" 
                          stroke="#4f46e5" 
                          strokeWidth={2} 
                          dot={false} 
                          activeDot={{r: 6}}
                          animationDuration={1500}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* AI Analysis */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                       <BrainCircuit className="text-purple-600" /> 
                       Pedagogical Feedback
                     </h3>
                     {!analysis && (
                       <button 
                        onClick={handleAIAnalysis}
                        disabled={loading}
                        className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
                       >
                         {loading ? 'Analyzing...' : 'Generate Analysis'}
                       </button>
                     )}
                   </div>

                   <div className="flex-1 bg-slate-50 rounded-lg p-4 overflow-y-auto max-h-64">
                      {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                          <Loader2 className="animate-spin" size={32} />
                          <p>Consulting the expert...</p>
                        </div>
                      ) : analysis ? (
                        <div className="prose prose-sm prose-purple">
                           <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                              {analysis}
                           </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-4">
                           <p className="mb-2">Click "Generate Analysis" to get feedback on the writing process using Gemini.</p>
                           <p className="text-xs">Requires API Key</p>
                        </div>
                      )}
                   </div>
                </div>
            </div>

            {/* Final Text Preview */}
            <div className="mt-8 bg-white p-8 rounded-xl shadow-sm border border-slate-100">
               <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Final Composition</h3>
               <div className="font-serif-write text-lg leading-relaxed text-slate-800 whitespace-pre-wrap">
                 {session.finalText}
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};