import React, { useState, useEffect } from 'react';
import { WritingSession } from '../types';
import { ArrowLeft, Download, BrainCircuit, Loader2, FileText, Activity } from 'lucide-react';
import { analyzeWritingSession } from '../services/geminiService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';

interface AnalysisDashboardProps {
  session: WritingSession;
  onBack: () => void;
}

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({ session, onBack }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Prepare chart data: Cumulative word count over time
  const timeData = React.useMemo(() => {
    const buckets: { time: number; chars: number }[] = [];
    const duration = session.endTime! - session.startTime;
    const bucketCount = 20;
    const bucketSize = duration / bucketCount;

    let currentWordCount = 0;
    let eventIndex = 0;

    for (let i = 0; i <= bucketCount; i++) {
      const timeThreshold = i * bucketSize;
      
      // Process events up to this time
      while (eventIndex < session.events.length && session.events[eventIndex].relativeTime <= timeThreshold) {
        const evt = session.events[eventIndex];
        if (evt.type === 'insert' && evt.content && evt.content.length > 0) {
            // Rough estimation: if space, word count up. 
            // Better: just count length of text? 
            // Let's count characters for the graph, easier.
        }
        eventIndex++;
      }
      
      // For simplicity in this graph, we'll just check text length at this timestamp if we reconstructed it.
      // But we don't have full reconstruction logic here. 
      // Simplified approach: Count 'insert' events - 'delete' events up to this point
      const eventsUpToNow = session.events.filter(e => e.relativeTime <= timeThreshold);
      const insertCount = eventsUpToNow.filter(e => e.type === 'insert').length;
      const deleteCount = eventsUpToNow.filter(e => e.type === 'delete').length;
      
      buckets.push({
        time: Math.round(timeThreshold / 1000),
        chars: Math.max(0, insertCount - deleteCount)
      });
    }
    return buckets;
  }, [session]);

  const stats = React.useMemo(() => {
     const words = session.finalText.trim().split(/\s+/).length;
     const durationSec = (session.endTime! - session.startTime) / 1000;
     const wpm = Math.round((words / durationSec) * 60);
     const pauses = session.events.filter(e => e.pauseBefore > 2000).length;
     const edits = session.events.filter(e => e.type === 'delete' || e.type === 'navigation').length;
     return { words, wpm, pauses, edits };
  }, [session]);

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
          <button 
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
          >
            <Download size={18} /> Export Log JSON
          </button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <FileText size={20} /> <span className="text-sm font-semibold uppercase tracking-wider">Words</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.words}</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <Activity size={20} /> <span className="text-sm font-semibold uppercase tracking-wider">Speed</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.wpm} <span className="text-sm font-normal text-slate-400">wpm</span></div>
          </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <span className="text-sm font-semibold uppercase tracking-wider">Pauses (>2s)</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.pauses}</div>
          </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-rose-600 mb-2">
              <span className="text-sm font-semibold uppercase tracking-wider">Edits</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.edits}</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            {/* Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Production Process</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#94a3b8" 
                      tick={{fontSize: 12}}
                      label={{ value: 'Seconds', position: 'insideBottomRight', offset: -5 }} 
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      tick={{fontSize: 12}}
                      label={{ value: 'Characters', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="chars" 
                      stroke="#4f46e5" 
                      strokeWidth={3} 
                      dot={false} 
                      activeDot={{r: 6}}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-center text-slate-400 mt-2">Character accumulation over time</p>
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

               <div className="flex-1 bg-slate-50 rounded-lg p-4 overflow-y-auto">
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
    </div>
  );
};