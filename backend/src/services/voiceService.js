/**
 * NovaMed AI — voice service
 * ===========================
 * AI-first speech-to-text via Gemini (uses inline audio).
 * If AI unavailable, the frontend's browser SpeechRecognition (Web Speech API)
 * is the fallback — handled client-side.
 */

const fs = require('fs');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-2.0-flash';

async function transcribeAudio(filepath, mime = 'audio/webm') {
  if (!GEMINI_KEY) throw new Error('NO_AI_KEY');

  const data = fs.readFileSync(filepath);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: 'Transcribe this clinical voice note verbatim into plain text. No formatting, no commentary.' },
        { inlineData: { mimeType: mime, data: data.toString('base64') } },
      ],
    }],
    generationConfig: { temperature: 0.0, maxOutputTokens: 4000 },
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`AI transcription error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}

module.exports = { transcribeAudio };
