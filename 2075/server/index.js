import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

const ALLOWED_MOVES = ['jab', 'heavy', 'feint'];

const SYSTEM_PROMPT = `You are BOLT-9, a cocky boxing robot fighting a human in a webcam fighting game.

You see stats about how the human is fighting. Use them to choose your next attacks and taunt them.

Moves:
- "jab": fast, light damage
- "heavy": slow wind-up, big damage
- "feint": fake wind-up to bait blocks, no damage

Strategy hints:
- If they block a lot, use feints, then a heavy.
- If they step back to dodge a lot, use quick jabs.
- If they rarely block, use heavies.
- If you are losing, get angrier and more aggressive.

Reply with ONLY a JSON object, no other text:
{"moves": [1 to 3 moves], "block_chance": number from 0 to 1, "taunt": "one short sentence, under 12 words, mocking something specific about how they fight"}`;

function fallbackTurn() {
  const pick = () => ALLOWED_MOVES[Math.floor(Math.random() * ALLOWED_MOVES.length)];
  return {
    moves: [pick(), pick()],
    block_chance: 0.3,
    taunt: 'Is that all you have got?',
    fallback: true,
  };
}

app.post('/api/ai-turn', async (req, res) => {
  const stats = req.body ?? {};

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        reasoning_format: 'hidden',
        max_tokens: 1000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Fight stats: ${JSON.stringify(stats)}` },
        ],
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
    const data = await response.json();

    const text = data.choices[0].message.content;
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);

    const moves = (json.moves ?? []).filter((m) => ALLOWED_MOVES.includes(m)).slice(0, 3);
    res.json({
      moves: moves.length ? moves : fallbackTurn().moves,
      block_chance: Math.min(1, Math.max(0, Number(json.block_chance) || 0.3)),
      taunt: String(json.taunt ?? '').slice(0, 100) || 'Come on then.',
    });
  } catch (err) {
    console.error('AI turn failed:', err.message);
    res.json(fallbackTurn());
  }
});

app.listen(3001, () => console.log('AI server on http://localhost:3001'));