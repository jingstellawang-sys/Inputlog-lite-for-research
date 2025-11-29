import React, { useState, Component, ErrorInfo } from 'react';
import { WritingEditor } from './components/WritingEditor';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { SessionStatus, WritingSession } from './types';
import { Layout, PenTool, BarChart2, AlertTriangle, Download } from 'lucide-react';

// --- Error Boundary Component ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
  session: WritingSession | null;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DashboardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Dashboard Analysis Error:", error, errorInfo);
  }

  handleEmergencyDownload = () => {
    if (!this.props.session) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.props.session, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `EMERGENCY_LOG_${this.props.session.studentName}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-red-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg border border-red-200">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-red-100 text-red-600 rounded-full">
                <AlertTriangle size={48} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Display Error</h2>
            <p className="text-slate-600 mb-6">
              The analysis dashboard encountered an issue processing this session (likely due to the session length).
              <br/><br/>
              <b>Don't worry, the data is safe.</b> Use the button below to download the log file.
            </p>
            <button
              onClick={this.handleEmergencyDownload}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg"
            >
              <Download size={20} />
              Download Emergency Log
            </button>
            <p className="mt-4 text-xs text-slate-400">Error: {this.state.error?.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
          completedSession && (
            <DashboardErrorBoundary session={completedSession}>
              <AnalysisDashboard session={completedSession} onBack={() => setCurrentView('write')} />
            </DashboardErrorBoundary>
          )
        )}
      </main>
    </div>
  );
};

export default App;