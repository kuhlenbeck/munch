const BASE = '/api';

export async function startSession(): Promise<string> {
  const res = await fetch(`${BASE}/session`, { method: 'POST' });
  const data = await res.json() as { sessionId: string };
  return data.sessionId;
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<{ reply: string; saved?: { id: number; food: string; name: string }; sessionEnded?: boolean }> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Server error');
  }
  return res.json() as Promise<{ reply: string; saved?: { id: number; food: string; name: string }; sessionEnded?: boolean }>;
}

export async function resetSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/session/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}
