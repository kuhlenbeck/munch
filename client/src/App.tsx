import { useState, useEffect, useRef } from 'react';
import { startSession, sendMessage, resetSession } from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

type AppState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  saved?: boolean;
}

// ─── Speech Recognition helper ───────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return SR ? new SR() as any : null;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [hasVoice, setHasVoice] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [entriesCount, setEntriesCount] = useState(0);
  const [tapCount, setTapCount] = useState(0);

  // Refs — always current, safe to use inside any callback
  const sessionIdRef = useRef<string | null>(null);
  const stateRef = useRef<AppState>('idle');
  const greetedRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep stateRef in sync
  const setAppState = (s: AppState) => {
    stateRef.current = s;
    setState(s);
  };

  // ── Init session ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!getSpeechRecognition()) {
      setHasVoice(false);
      setShowTextFallback(true);
    }
    startSession().then(id => {
      sessionIdRef.current = id;
    });
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Stop audio ───────────────────────────────────────────────────────────────
  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }

  // ── Speak via OpenAI TTS ─────────────────────────────────────────────────────
  async function speak(text: string, onEnd?: () => void) {
    stopAudio();
    setAppState('speaking');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setAppState('idle');
        onEnd?.();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setAppState('idle');
        onEnd?.();
      };
      await audio.play();
    } catch {
      setAppState('idle');
      onEnd?.();
    }
  }

  // ── Send message to server ───────────────────────────────────────────────────
  async function handleSend(userText: string) {
    const sid = sessionIdRef.current;
    if (!sid || !userText.trim()) return;

    setAppState('thinking');
    setInterimText('');

    if (userText !== 'hello') {
      setMessages(prev => [...prev, { role: 'user', text: userText }]);
    }

    try {
      const result = await sendMessage(sid, userText);

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: result.reply,
        saved: !!result.saved,
      }]);

      if (result.saved) setEntriesCount(c => c + 1);

      speak(result.reply);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setAppState('error');
    }
  }

  // ── Start listening ──────────────────────────────────────────────────────────
  async function startListening() {
    if (!sessionIdRef.current) return;
    if (stateRef.current === 'thinking' || stateRef.current === 'speaking') return;

    stopAudio();

    // Explicitly request mic permission — Safari ends SR silently if permission is missing
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Microphone requires a secure connection. Use localhost or deploy to Railway for HTTPS.');
      setAppState('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // release immediately, SR will open its own
    } catch (e) {
      setErrorMsg('Microphone blocked: ' + (e instanceof Error ? e.message : String(e)));
      setAppState('error');
      return;
    }

    const sr = getSpeechRecognition();
    if (!sr) { setShowTextFallback(true); return; }

    sr.continuous = false;
    sr.interimResults = true;
    sr.lang = 'en-US';

    sr.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim || final);
      if (final) {
        recognitionRef.current?.stop();
        handleSend(final.trim());
      }
    };

    sr.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setErrorMsg('Microphone access denied. Please allow microphone and try again.');
        setShowTextFallback(true);
      } else {
        setErrorMsg('Mic error: ' + event.error);
      }
      setAppState('error');
      setInterimText('');
    };

    sr.onend = () => {
      if (stateRef.current === 'listening') setAppState('idle');
      setInterimText('');
    };

    recognitionRef.current = sr;
    try {
      sr.start();
      setAppState('listening');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start microphone';
      setErrorMsg(msg);
      setAppState('error');
    }
  }

  // ── Handle tap on main button ────────────────────────────────────────────────
  function handleButtonPress() {
    setTapCount(c => c + 1);
    const current = stateRef.current;

    if (current === 'listening') {
      recognitionRef.current?.stop();
      setAppState('idle');
      setInterimText('');
    } else if (current === 'thinking') {
      // do nothing while waiting for AI
    } else {
      // idle, speaking, or error — always try to start listening
      stopAudio();
      setErrorMsg('');
      if (!greetedRef.current && sessionIdRef.current) {
        greetedRef.current = true;
        handleSend('hello');
      } else if (showTextFallback) {
        setAppState('idle');
        document.getElementById('text-input')?.focus();
      } else {
        startListening();
      }
    }
  }

  // ── Handle text input fallback ───────────────────────────────────────────────
  function handleTextSubmit() {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput('');
    handleSend(text);
  }

  // ── Start over ───────────────────────────────────────────────────────────────
  async function handleReset() {
    stopAudio();
    recognitionRef.current?.stop();
    greetedRef.current = false;
    const oldId = sessionIdRef.current;
    if (oldId) await resetSession(oldId);
    setMessages([]);
    setInterimText('');
    setErrorMsg('');
    const newId = await startSession();
    sessionIdRef.current = newId;
    setAppState('idle');
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const buttonConfig = {
    idle: { emoji: '🎙️', label: 'Tap to Talk', color: '#7c3aed', pulse: false },
    listening: { emoji: '🔴', label: 'Listening...', color: '#dc2626', pulse: true },
    thinking: { emoji: '🤔', label: 'Thinking...', color: '#d97706', pulse: true },
    speaking: { emoji: '🔊', label: 'Tap to skip', color: '#059669', pulse: false },
    error: { emoji: '⚠️', label: 'Try Again', color: '#dc2626', pulse: false },
  }[state];

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>🍎 Munch</span>
        {entriesCount > 0 && (
          <span style={styles.badge}>{entriesCount} logged today</span>
        )}
        <a href="/admin" style={styles.adminLink}>📊</a>
      </div>

      {/* Chat messages */}
      <div style={styles.chatArea}>
        {messages.length === 0 && state === 'thinking' && (
          <div style={styles.loadingDots}>
            <span>•</span><span>•</span><span>•</span>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.bubble,
              ...(msg.role === 'user' ? styles.userBubble : styles.assistantBubble),
            }}
          >
            {msg.saved && <div style={styles.savedBadge}>✅ Saved!</div>}
            <span style={styles.bubbleText}>{msg.text}</span>
          </div>
        ))}

        {interimText && (
          <div style={{ ...styles.bubble, ...styles.interimBubble }}>
            <span style={styles.bubbleText}>{interimText}</span>
          </div>
        )}

        {state === 'thinking' && messages.length > 0 && (
          <div style={{ ...styles.bubble, ...styles.assistantBubble, ...styles.thinkingBubble }}>
            <span>•••</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {state === 'error' && errorMsg && (
        <div style={styles.errorBanner}>{errorMsg}</div>
      )}

      {/* Main voice button */}
      <div style={styles.controls}>
        <button
          style={{
            ...styles.mainButton,
            background: buttonConfig.color,
            animation: buttonConfig.pulse ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
          onClick={handleButtonPress}
          aria-label={buttonConfig.label}
        >
          <span style={styles.buttonEmoji}>{buttonConfig.emoji}</span>
          <span style={styles.buttonLabel}>{buttonConfig.label}</span>
        </button>

        {showTextFallback && (
          <div style={styles.textInputRow}>
            <input
              id="text-input"
              style={styles.textInput}
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
              placeholder="Type what you ate..."
              disabled={state === 'thinking'}
            />
            <button
              style={styles.sendButton}
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || state === 'thinking'}
            >
              ➤
            </button>
          </div>
        )}

        <div style={{color:'rgba(255,255,255,0.4)', fontSize:12, marginTop:-4}}>
          state: {state} | taps: {tapCount}
        </div>

        {hasVoice && (
          <button
            style={styles.toggleButton}
            onClick={() => setShowTextFallback(v => !v)}
          >
            {showTextFallback ? '🎙️ Use voice' : '⌨️ Type instead'}
          </button>
        )}

        {messages.length > 0 && (
          <button style={styles.resetButton} onClick={handleReset}>
            Start over
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(255,255,255,0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 0 env(safe-area-inset-bottom)',
    background: 'linear-gradient(180deg, #1e1030 0%, #0f0a1a 100%)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  logo: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: -0.5,
    color: '#fff',
  },
  badge: {
    background: 'rgba(124,58,237,0.3)',
    border: '1px solid rgba(124,58,237,0.5)',
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: 12,
    color: '#c4b5fd',
    fontWeight: 600,
  },
  adminLink: {
    fontSize: 20,
    textDecoration: 'none',
    opacity: 0.6,
    padding: 4,
  },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 16px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    WebkitOverflowScrolling: 'touch',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 18,
    padding: '12px 16px',
    animation: 'fadeIn 0.2s ease-out',
    lineHeight: 1.5,
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderBottomLeftRadius: 4,
  },
  interimBubble: {
    alignSelf: 'flex-end',
    background: 'rgba(124,58,237,0.3)',
    border: '1px dashed rgba(124,58,237,0.6)',
    borderBottomRightRadius: 4,
    opacity: 0.8,
  },
  thinkingBubble: {
    fontSize: 24,
    letterSpacing: 4,
    padding: '10px 20px',
  },
  bubbleText: {
    fontSize: 17,
    color: '#fff',
    display: 'block',
  },
  savedBadge: {
    fontSize: 12,
    color: '#86efac',
    fontWeight: 700,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingDots: {
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 32,
    letterSpacing: 8,
    marginTop: 40,
  },
  errorBanner: {
    background: 'rgba(220,38,38,0.2)',
    border: '1px solid rgba(220,38,38,0.4)',
    borderRadius: 12,
    padding: '10px 16px',
    margin: '0 16px 8px',
    fontSize: 14,
    color: '#fca5a5',
    textAlign: 'center',
  },
  controls: {
    padding: '16px 20px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  mainButton: {
    width: 160,
    height: 160,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    transition: 'background 0.2s, transform 0.1s',
    WebkitTapHighlightColor: 'transparent',
  },
  buttonEmoji: {
    fontSize: 48,
    lineHeight: 1,
    display: 'block',
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: 0.3,
  },
  textInputRow: {
    display: 'flex',
    width: '100%',
    gap: 8,
  },
  textInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#fff',
    fontSize: 16,
    outline: 'none',
  },
  sendButton: {
    background: '#7c3aed',
    border: 'none',
    borderRadius: 12,
    padding: '12px 18px',
    color: '#fff',
    fontSize: 18,
    cursor: 'pointer',
  },
  toggleButton: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: '6px 16px',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    cursor: 'pointer',
  },
  resetButton: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '4px 8px',
  },
};
