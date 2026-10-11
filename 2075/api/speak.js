export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const text = String(req.body?.text ?? '').slice(0, 200);

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (err) {
    console.error('Speak failed:', err.message);
    res.status(502).end();
  }
}