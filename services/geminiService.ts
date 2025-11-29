import { GoogleGenAI } from "@google/genai";
import { WritingSession, AnalysisResult } from "../types";

const processStats = (session: WritingSession) => {
  const events = session.events;
  const pauses = events.filter(e => e.pauseBefore > 2000); // Pauses > 2s
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
    avgBurstLength: Math.round(avgBurst),
    deletionCount: deletions.length,
    durationSeconds: (session.endTime! - session.startTime) / 1000,
    textSample: session.finalText
  };
};

export const analyzeWritingSession = async (session: WritingSession): Promise<string> => {
  if (!process.env.API_KEY) {
    return "Gemini API Key is missing. Please configure the environment.";
  }

  const stats = processStats(session);

  const prompt = `
    You are an expert writing pedagogue analyzing a student's writing process log (Inputlog data).
    
    Here are the statistics from their session:
    - Total Word Count: ${stats.wordCount}
    - Total Duration: ${stats.durationSeconds.toFixed(1)} seconds
    - Number of Long Pauses (>2s): ${stats.pauseCount}
    - Average Burst Length (chars between pauses): ${stats.avgBurstLength}
    - Total Deletions/Edits: ${stats.deletionCount}
    
    The final text they wrote:
    "${stats.textSample}"

    Please provide a concise, encouraging, and pedagogical analysis (max 200 words) addressing:
    1. **Fluency**: Does the burst length suggest they were writing freely or struggling?
    2. **Planning vs. Revision**: Do the pauses and deletions suggest they planned while writing or edited heavily?
    3. **Actionable Tip**: One specific suggestion to improve their process (e.g., "Try to write longer bursts before correcting typos").
    
    Format the output as simple Markdown.
  `;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || "Could not generate analysis.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Error analyzing session. Please try again later.";
  }
};