// Claude AI proxy — keeps ANTHROPIC_API_KEY out of the browser.
// POST /api/agent  { question: string, context: string }
// Set ANTHROPIC_API_KEY in Vercel project environment variables.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { question, context } = req.body || {};
  if (!question) return res.status(400).json({ error: 'question is required' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' });

  const systemPrompt =
    `You are a concise economic analyst specialising in G20 macroeconomics. ` +
    `Answer the user's question using the live data context provided. ` +
    `Always cite specific numbers and country names. Keep answers under 200 words. ` +
    `Write in UK English: use organisation, labour, analyse, recognise, behaviour, stabilisation. ` +
    `Use plain paragraphs with no bullet points, no markdown headers and no dashes of any kind. ` +
    `Open each paragraph with a specific data point or number. ` +
    `Use "However" to introduce counter-arguments, not "But" or "Yet". ` +
    `Frame risks as conditionals: "Unless X, Y will occur." ` +
    `Close with a prescriptive observation using "needs to" or "should". ` +
    `Data sourced from World Bank and IMF DataMapper.`;

  const userMessage = context
    ? `Live data snapshot:\n${context}\n\nQuestion: ${question}`
    : `Question: ${question}`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || 'Upstream error' });
    }

    const text = data.content?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Empty response from AI provider' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
