import React, { useState } from 'react';
import { WritingEditor } from './components/WritingEditor';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { SessionStatus, WritingSession } from './types';
import { Layout, PenTool, BarChart2 } from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'write' | 'analyze'>('write');
  const [completedSession, setCompletedSession] = useState<WritingSession | null>(null);

  const handleSessionComplete = (session: WritingSession) => {
    setCompletedSession(session);
    setCurrentView('analyze');
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-20 bg-slate-900 text-slate-300 flex md:flex-col items-center py-4 z-20 flex-shrink-0 shadow-lg">
        <div className="mb-6 hidden md:block">
          <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold">
            IL
          </div>
        </div>
        
        <div className="flex md:flex-col w-full justify-around md:justify-start gap-4 px-2">
          <button
            onClick={() => setCurrentView('write')}
            className={`p-3 rounded-xl transition-all ${
              currentView === 'write' 
                ? 'bg-indigo-600 text-white shadow-indigo-500/30 shadow-lg' 
                : 'hover:bg-slate-800'
            }`}
            title="Write"
          >
            <PenTool size={24} />
          </button>
          
          <button
            onClick={() => setCurrentView('analyze')}
            disabled={!completedSession}
            className={`p-3 rounded-xl transition-all ${
              currentView === 'analyze' 
                ? 'bg-indigo-600 text-white shadow-indigo-500/30 shadow-lg' 
                : 'hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent'
            }`}
            title="Analyze"
          >
            <BarChart2 size={24} />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 bg-slate-50 h-full overflow-hidden relative">
        {currentView === 'write' ? (
          <WritingEditor onSessionComplete={handleSessionComplete} />
        ) : (
          completedSession && <AnalysisDashboard session={completedSession} onBack={() => setCurrentView('write')} />
        )}
      </main>
    </div>
  );
};

export default App;