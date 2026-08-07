import { GoogleGenAI } from '@google/genai';
async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview"];
  for (const m of models) {
    try {
      const res = await ai.models.generateContent({ model: m, contents: 'hi' });
      console.log(m, 'SUCCESS');
    } catch(e) {
      console.log(m, 'FAILED', e.message);
    }
  }
}
test();
