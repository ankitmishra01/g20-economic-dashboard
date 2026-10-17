// AI analyst proxy: keeps provider API keys out of the browser.
// POST /api/agent  { question: string, country?: ISO3, scope?: 'g20' | 'global' | 'region:XXX' | 'income:XXX' }
// POST /api/agent  { mode: 'brief', scope? }   one-paragraph narration of "What changed"
//
// The data context is built here from published files only: the G20 snapshot
// (data-snapshot.json + projections.json), the global shards (data/latest.json and
// data/country/<ISO3>.json), the daily market layer (data/realtime.json) and the
// computed changes (data/what-changed.json). Any numbers a client sends are ignored. Requests must come from an allowed origin (lib/cors.cjs)
// and are rate limited per client (lib/rate-limit.cjs).
//
// Provider order (first key found wins):
//   1. GEMINI_API_KEY    Google AI Studio free tier (default model gemini-flash-latest)
//   2. ANTHROPIC_API_KEY Claude (default model claude-sonnet-4-6)
// Optional: AI_MODEL overrides the model id for whichever provider is used.
// Set keys in Vercel project environment variables, never in code.

const { isAllowedOrigin } = require('../lib/cors.cjs');
const { createRateLimiter, clientKey } = require('../lib/rate-limit.cjs');
const fs = require('fs');
const path = require('path');
const {
  indexSnapshot, buildScopeContext, buildCountryContext,
  buildLatestScopeContext, buildLatestCountryContext, buildRealtimeContext, buildBriefContext, buildAiIndexContext,
} = require('../lib/agent-context.cjs');
const G20 = require('../lib/g20.cjs');
const REGISTRY = require('../public/legacy/countries.json');

const MAX_QUESTION = 500;
const MAX_CONTEXT = 20000;
const limiter = createRateLimiter({ limit: Number(process.env.AGENT_RATE_LIMIT || 10), windowMs: 60_000 });
// Daily caps protect the free AI quota from scripts that spoof the Origin header.
// They are per server instance (Fluid compute reuses instances); the Vercel Firewall
// rate-limit rule documented in README.md is the global backstop.
const DAY_MS = 24 * 60 * 60 * 1000;
const perClientDaily = createRateLimiter({ limit: Number(process.env.AGENT_DAILY_PER_CLIENT || 60), windowMs: DAY_MS });
const instanceDaily = createRateLimiter({ limit: Number(process.env.AGENT_DAILY_CAP || 400), windowMs: DAY_MS });

let cachedIndex = null;
let cachedProjections = null;
function loadData() {
  if (!cachedIndex) {
    cachedIndex = indexSnapshot(require('../public/legacy/data-snapshot.json'));
    try { cachedProjections = require('../public/legacy/projections.json'); } catch (_) { cachedProjections = null; }
  }
  return { index: cachedIndex, projections: cachedProjections };
}

// Literal require() paths so Vercel's file tracer bundles these files with the function.
const attempt = (load) => { try { return load(); } catch (_) { return null; } };
let cachedGlobal = null;
function loadGlobal() {
  if (!cachedGlobal) {
    cachedGlobal = {
      latest: attempt(() => require('../public/legacy/data/latest.json')),
      realtime: attempt(() => require('../public/legacy/data/realtime.json')),
      whatChanged: attempt(() => require('../public/legacy/data/what-changed.json')),
      aiIndex: attempt(() => require('../public/legacy/data/ai-index.json')),
    };
  }
  return cachedGlobal;
}

// Country shards are bundled with the function (vercel.ts includeFiles); a missing
// shard just means the context has no history lines.
function countryShard(iso3) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'legacy', 'data', 'country', `${iso3}.json`), 'utf8'));
  } catch (_) { return null; }
}

const byIso3 = new Map(REGISTRY.countries.map((c) => [c.iso3, c]));
// Members of a dashboard scope id, mirroring public/legacy/scope.js.
function scopeMembers(scope) {
  if (!scope || scope === 'g20') return { label: 'G20', members: null };
  if (scope === 'global' || scope === 'watchlist') return { label: 'Global', members: REGISTRY.countries };
  const [kind, code] = String(scope).split(':');
  const list = kind === 'region' ? REGISTRY.collections.regions : kind === 'income' ? REGISTRY.collections.income : null;
  const group = (list || []).find((g) => g.code === code);
  if (!group) return { label: 'G20', members: null };
  return { label: group.name, members: group.members.map((iso) => byIso3.get(iso)).filter(Boolean) };
}

function serverContext(country, scope) {
  const { index, projections } = loadData();
  const { latest, realtime, aiIndex } = loadGlobal();
  if (country && G20.some((c) => c.iso3 === country)) {
    return [buildCountryContext(index, projections, country, G20), buildRealtimeContext(realtime, country), buildAiIndexContext(aiIndex, country)].filter(Boolean).join('\n\n');
  }
  if (country && byIso3.has(country) && latest) {
    return [buildLatestCountryContext(latest, countryShard(country), byIso3.get(country)), buildRealtimeContext(realtime, country), buildAiIndexContext(aiIndex, country)].filter(Boolean).join('\n\n');
  }
  const { label, members } = scopeMembers(scope);
  const base = members && latest ? buildLatestScopeContext(latest, members, { label }) : buildScopeContext(index, G20, { label: 'G20' });
  // Scope questions also get the scope's policy rates and the computed "What changed" items.
  const isos = members ? members.map((m) => m.iso3) : G20.map((c) => c.iso3);
  const inScope = (iso) => isos.includes(iso);
  const nameOf = (iso) => byIso3.get(iso)?.name || iso;
  const { whatChanged } = loadGlobal();
  return [base, buildRealtimeContext(realtime, null, { members: isos, nameOf }), whatChanged ? buildBriefContext(whatChanged, inScope) : '']
    .filter(Boolean).join('\n\n');
}

// Narration of "What changed" for one scope: built only from the computed items.
const briefCache = new Map();
function briefContext(scope) {
  const { whatChanged } = loadGlobal();
  if (!whatChanged) return { key: null, ctx: '' };
  const { members } = scopeMembers(scope);
  const set = members ? new Set(members.map((m) => m.iso3)) : new Set(G20.map((c) => c.iso3));
  const euro = new Set(Object.entries(loadGlobal().realtime?.policyRates?.values || {}).filter(([, v]) => v.euroArea).map(([iso]) => iso));
  const anyEuro = [...set].some((iso) => euro.has(iso));
  const inScope = scope === 'global' ? null : (iso3) => set.has(iso3) || (iso3 === 'EUU' && anyEuro);
  const ctx = buildBriefContext(whatChanged, inScope);
  return { key: `${whatChanged.generatedAt}|${scope || 'g20'}`, ctx };
}
const BRIEF_INSTRUCTION =
  'Write one paragraph of at most 90 words telling a cross-border decision maker what changed and why it matters. ' +
  'Use only the facts and figures in the list above, mention the most material items first, and do not add any figure that is not in the list.';
const TIMEOUT_MS = 12000; // per attempt
// Free-tier Gemini models each have their own quota, so try them in order.
const GEMINI_CHAIN = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
// Auth failures will not improve on another model; anything else (quota, overload, a model-specific 400/404) moves to the next model.
const FATAL = new Set([401, 403]);

const SYSTEM_PROMPT =
  `You are a concise economic analyst covering G20 and global macroeconomics. ` +
  `Answer the user's question using the live data context provided. ` +
  `Always cite specific numbers and country names, using only numbers that appear in the data context; if a figure is not in the context, say it is not in the dataset instead of guessing. Keep answers under 200 words. ` +
  `Write in UK English: use organisation, labour, analyse, recognise, behaviour, stabilisation. ` +
  `Use plain paragraphs with no bullet points, no markdown headers and no dashes of any kind. ` +
  `Open each paragraph with a specific data point or number. ` +
  `Use "However" to introduce counter-arguments, not "But" or "Yet". ` +
  `Frame risks as conditionals: "Unless X, Y will occur." ` +
  `Close with a prescriptive observation using "needs to" or "should". ` +
  `Data sourced from World Bank, IMF DataMapper, BIS, ECB and FRED.`;

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
  const origin = req.headers?.origin;
  res.setHeader('Vary', 'Origin');
  if (!isAllowedOrigin(origin)) return res.status(403).json({ code: 'FORBIDDEN_ORIGIN', error: 'Requests are only accepted from the dashboard' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const key = clientKey(req);
  const gate = limiter(key);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(Math.ceil((gate.retryAfterMs || 60_000) / 1000)));
    return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many questions in a short time. Try again in a minute.' });
  }
  const daily = perClientDaily(key);
  const overall = instanceDaily('all');
  if (!daily.allowed || !overall.allowed) {
    return res.status(429).json({ code: 'DAILY_LIMIT', error: 'Ask AI has reached its daily limit. Please try again tomorrow.' });
  }

  const { question, country, mode, scope } = req.body || {};
  const isBrief = mode === 'brief';
  if (!isBrief && (!question || typeof question !== 'string')) return res.status(400).json({ error: 'question is required' });
  if (!isBrief && question.length > MAX_QUESTION) return res.status(400).json({ error: `question is limited to ${MAX_QUESTION} characters` });
  const iso3 = typeof country === 'string' && /^[A-Z]{3}$/.test(country) ? country : null;
  const scopeId = typeof scope === 'string' && /^(g20|global|watchlist|(region|income):[A-Z]{2,4})$/.test(scope) ? scope : 'g20';

  let brief = null;
  if (isBrief) {
    brief = briefContext(scopeId);
    if (!brief.ctx) return res.status(404).json({ code: 'NO_CHANGES', error: 'No computed changes for this scope' });
    if (briefCache.has(brief.key)) return res.status(200).json({ ...briefCache.get(brief.key), cached: true });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) {
    // code: lets the front end show a friendly message without parsing text
    return res.status(503).json({ code: 'NO_AI_KEY', error: 'No AI provider key is configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)' });
  }

  let userMessage;
  if (isBrief) {
    userMessage = `${brief.ctx.slice(0, MAX_CONTEXT)}\n\n${BRIEF_INSTRUCTION}`;
  } else {
    const ctx = serverContext(iso3, scopeId).slice(0, MAX_CONTEXT);
    userMessage = ctx ? `Live data snapshot:\n${ctx}\n\nQuestion: ${question}` : `Question: ${question}`;
  }

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
      if (result.text) {
        const payload = { text: result.text, provider, model };
        if (isBrief) { if (briefCache.size > 50) briefCache.clear(); briefCache.set(brief.key, payload); }
        return res.status(200).json(payload);
      }
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
