import OpenAI from 'openai';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function textToSpeech(text: string): Promise<Buffer> {
  const response = await getOpenAI().audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'ballad',   // nova = friendly & warm, great for kids
    input: text,
    speed: 1.0,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
