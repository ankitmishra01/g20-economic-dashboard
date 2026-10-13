// AI analyst proxy: keeps provider API keys out of the browser.
// POST /api/agent  { question: string, context: string }
//
// Provider order (first key found wins):
//   1. GEMINI_API_KEY    Google AI Studio free tier (default model gemini-flash-latest)
//   2. ANTHROPIC_API_KEY Claude (default model claude-sonnet-4-6)
// Optional: AI_MODEL overrides the model id for whichever provider is used.
// Set keys in Vercel project environment variables, never in code.

const MAX_QUESTION = 500;
const MAX_CONTEXT = 20000;
const TIMEOUT_MS = 12000; // per attempt
// Free-tier Gemini models each have their own quota, so try them in order.
const GEMINI_CHAIN = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
// Auth failures will not improve on another model; anything else (quota, overload, a model-specific 400/404) moves to the next model.
const FATAL = new Set([401, 403]);

const SYSTEM_PROMPT =
  `You are a concise economic analyst specialising in G20 macroeconomics. ` +
  `Answer the user's question using the live data context provided. ` +
  `Always cite specific numbers and country names, using only numbers that appear in the data context; if a figure is not in the context, say it is not in the dataset instead of guessing. Keep answers under 200 words. ` +
  `Write in UK English: use organisation, labour, analyse, recognise, behaviour, stabilisation. ` +
  `Use plain paragraphs with no bullet points, no markdown headers and no dashes of any kind. ` +
  `Open each paragraph with a specific data point or number. ` +
  `Use "However" to introduce counter-arguments, not "But" or "Yet". ` +
  `Frame risks as conditionals: "Unless X, Y will occur." ` +
  `Close with a prescriptive observation using "needs to" or "should". ` +
  `Data sourced from World Bank and IMF DataMapper.`;

async function callGemini(key, model, userMessage, signal) {
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        // thinkingBudget 0 stops the main model spending the output budget on hidden reasoning;
        // the lite fallbacks do not accept it (and do not think by default), so it is only sent to the main model.
        generationConfig: { maxOutputTokens: 700, temperature: 0.3, ...(model === GEMINI_CHAIN[0] ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
      }),
    }
  );
  const data = await upstream.json();
  if (!upstream.ok) return { status: upstream.status, error: data.error?.message || 'Upstream error' };
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  return { text };
}

async function callAnthropic(key, model, userMessage, signal) {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok) return { status: upstream.status, error: data.error?.message || 'Upstream error' };
  return { text: data.content?.[0]?.text };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { question, context } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question is required' });
  if (question.length > MAX_QUESTION) return res.status(400).json({ error: `question is limited to ${MAX_QUESTION} characters` });

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) {
    // code: lets the front end show a friendly message without parsing text
    return res.status(503).json({ code: 'NO_AI_KEY', error: 'No AI provider key is configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)' });
  }

  const ctx = typeof context === 'string' ? context.slice(0, MAX_CONTEXT) : '';
  const userMessage = ctx ? `Live data snapshot:\n${ctx}\n\nQuestion: ${question}` : `Question: ${question}`;

  const provider = geminiKey ? 'gemini' : 'anthropic';
  const models = process.env.AI_MODEL
    ? [process.env.AI_MODEL]
    : (geminiKey ? GEMINI_CHAIN : ['claude-sonnet-4-6']);

  let last = { status: 502, code: 'ERROR', error: 'No AI attempt was made' };
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const result = geminiKey
        ? await callGemini(geminiKey, model, userMessage, controller.signal)
        : await callAnthropic(anthropicKey, model, userMessage, controller.signal);
      if (result.text) return res.status(200).json({ text: result.text, provider, model });
      last = result.error
        ? { status: result.status || 502, code: 'UPSTREAM', error: result.error }
        : { status: 502, code: 'EMPTY', error: 'Empty response from AI provider' };
      if (result.error && FATAL.has(result.status)) break; // bad or blocked key: do not retry
    } catch (e) {
      const timedOut = e.name === 'AbortError';
      last = { status: timedOut ? 504 : 500, code: timedOut ? 'TIMEOUT' : 'ERROR', error: timedOut ? 'The AI provider took too long to respond' : e.message };
    } finally {
      clearTimeout(timer);
    }
  }
  return res.status(last.status).json({ code: last.code, error: last.error });
};
