import { GoogleGenAI } from "@google/genai";
import { WritingSession, AnalysisResult } from "../types";

const processStats = (session: WritingSession) => {
  const events = session.events;
  const pauses = events.filter(e => e.pauseBefore > 2000); // Pauses > 2s
  const longPauses = events.filter(e => e.pauseBefore > 5000); // Pauses > 5s
  const deletions = events.filter(e => e.type === 'delete');
  const wordCount = session.finalText.trim().split(/\s+/).length;
  
  // Calculate bursts (text written between pauses > 2s)
  let burstLengths: number[] = [];
  let currentBurst = 0;
  events.forEach(e => {
    if (e.type === 'insert') {
      if (e.pauseBefore > 2000) {
        if (currentBurst > 0) burstLengths.push(currentBurst);
        currentBurst = 1; // Start new burst
      } else {
        currentBurst++;
      }
    }
  });
  if (currentBurst > 0) burstLengths.push(currentBurst);
  const avgBurst = burstLengths.length > 0 ? burstLengths.reduce((a, b) => a + b, 0) / burstLengths.length : 0;

  return {
    wordCount,
    pauseCount: pauses.length,
    longPauseCount: longPauses.length,
    avgBurstLength: Math.round(avgBurst),
    deletionCount: deletions.length,
    durationSeconds: (session.endTime! - session.startTime) / 1000,
    textSample: session.finalText
  };
};

export const analyzeWritingSession = async (session: WritingSession): Promise<string> => {
  // Safety check: ensure process.env.API_KEY is available and is a string
  const apiKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : null;

  if (!apiKey) {
    return "⚠️ API Key missing. Please add 'API_KEY' to your Vercel Environment Variables to enable AI feedback.";
  }

  const stats = processStats(session);

  const prompt = `
    You are an expert writing pedagogue analyzing a student's writing process log (similar to Inputlog data).
    
    Here are the process statistics from their session:
    - Total Duration: ${stats.durationSeconds.toFixed(1)} seconds
    - Total Word Count: ${stats.wordCount}
    - WPM: ${Math.round(stats.wordCount / (stats.durationSeconds / 60))}
    - Production Burst Length (avg chars between 2s pauses): ${stats.avgBurstLength}
    - Total Deletions: ${stats.deletionCount}
    - Significant Pauses (>2s): ${stats.pauseCount} (of which ${stats.longPauseCount} were >5s)
    
    The final product:
    "${stats.textSample}"

    Please provide a concise, encouraging, and pedagogical analysis (max 200 words) addressing:
    1. **Fluency & Flow**: Does the burst length and pause frequency suggest they were writing freely or struggling to find words?
    2. **Editing Behavior**: Based on the deletion count relative to the final length, did they edit recursively (frequently) or write first, edit later?
    3. **Actionable Tip**: One specific suggestion to improve their process (e.g., "Try to ignore typos in the first draft" or "Take more time to plan before starting").
    
    Format the output as simple Markdown.
  `;

  try {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || "Could not generate analysis.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Error analyzing session. Please check your API key and quota.";
  }
};