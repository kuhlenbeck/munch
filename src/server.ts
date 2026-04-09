import dotenv from 'dotenv';
dotenv.config({ override: true });
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { chat, resetSession } from './claude';
import { getEntries, getNames, exportCSV } from './database';
import { textToSpeech } from './tts';

const app = express();

app.use(cors());
app.use(express.json());

// ─── Chat API ────────────────────────────────────────────────────────────────

// Start or get session
app.post('/api/session', (req: Request, res: Response) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

// Send a message
app.post('/api/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, message } = req.body as { sessionId: string; message: string };

    if (!sessionId || !message) {
      res.status(400).json({ error: 'sessionId and message are required' });
      return;
    }

    const result = await chat(sessionId, message);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reset session
app.post('/api/session/reset', (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId: string };
  if (sessionId) resetSession(sessionId);
  res.json({ ok: true });
});

// Text-to-speech
app.post('/api/tts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body as { text: string };
    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const audioBuffer = await textToSpeech(text);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (err) {
    next(err);
  }
});

// ─── Entries API ─────────────────────────────────────────────────────────────

app.get('/api/entries', (req: Request, res: Response) => {
  const name = req.query.name as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const entries = getEntries({ name, limit });
  res.json(entries);
});

app.get('/api/names', (_req: Request, res: Response) => {
  res.json(getNames());
});

app.get('/api/entries/export', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const filePath = await exportCSV();
    res.download(filePath, 'food-journal.csv');
  } catch (err) {
    next(err);
  }
});

// ─── Serve React app in production ──────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ─── Error handler ──────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = parseInt(process.env.PORT || '3001');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🍎 Food Journal server running on http://0.0.0.0:${PORT}`);
});

export default app;
