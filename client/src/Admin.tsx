import { useState, useEffect } from 'react';

interface Entry {
  id: number;
  name: string;
  food: string;
  meal: string;
  time_of_day: string;
  notes?: string;
  created_at: string;
}

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍿',
};

export default function Admin() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [filterName, setFilterName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/names')
      .then(r => r.json())
      .then((n: string[]) => setNames(n))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = filterName ? `/api/entries?name=${encodeURIComponent(filterName)}` : '/api/entries';
    fetch(url)
      .then(r => r.json())
      .then((e: Entry[]) => { setEntries(e); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filterName]);

  const grouped = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    const date = e.created_at.split(' ')[0] || e.created_at.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(e);
    return acc;
  }, {});

  return (
    <div style={s.page}>
      <div style={s.header}>
        <a href="/" style={s.back}>← Back</a>
        <h1 style={s.title}>📊 Food Journal</h1>
        <a href="/api/entries/export" style={s.exportBtn} download>
          ⬇️ CSV
        </a>
      </div>

      {/* Filter by person */}
      {names.length > 1 && (
        <div style={s.filterRow}>
          <button
            style={{ ...s.chip, ...(filterName === '' ? s.chipActive : {}) }}
            onClick={() => setFilterName('')}
          >
            Everyone
          </button>
          {names.map(n => (
            <button
              key={n}
              style={{ ...s.chip, ...(filterName === n ? s.chipActive : {}) }}
              onClick={() => setFilterName(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div style={s.summary}>
        <div style={s.stat}>
          <span style={s.statNum}>{entries.length}</span>
          <span style={s.statLabel}>entries</span>
        </div>
        <div style={s.stat}>
          <span style={s.statNum}>{names.length}</span>
          <span style={s.statLabel}>people</span>
        </div>
        <div style={s.stat}>
          <span style={s.statNum}>{Object.keys(grouped).length}</span>
          <span style={s.statLabel}>days</span>
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div style={s.loading}>Loading...</div>
      ) : entries.length === 0 ? (
        <div style={s.empty}>No entries yet. Go log some food! 🍽️</div>
      ) : (
        <div style={s.list}>
          {Object.entries(grouped).map(([date, dayEntries]) => (
            <div key={date}>
              <div style={s.dateHeader}>{formatDate(date)}</div>
              {dayEntries.map(e => (
                <div key={e.id} style={s.card}>
                  <div style={s.cardTop}>
                    <span style={s.mealBadge}>
                      {MEAL_EMOJI[e.meal] || '🍽️'} {e.meal}
                    </span>
                    <span style={s.personBadge}>{e.name}</span>
                    <span style={s.time}>{e.time_of_day}</span>
                  </div>
                  <p style={s.food}>{e.food}</p>
                  {e.notes && <p style={s.notes}>{e.notes}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #1e1030 0%, #0f0a1a 100%)',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '0 0 40px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'sticky',
    top: 0,
    background: 'rgba(15,10,26,0.9)',
    backdropFilter: 'blur(10px)',
    zIndex: 10,
  },
  back: {
    color: '#a78bfa',
    textDecoration: 'none',
    fontSize: 16,
    fontWeight: 600,
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
  },
  exportBtn: {
    background: 'rgba(124,58,237,0.3)',
    border: '1px solid rgba(124,58,237,0.5)',
    borderRadius: 8,
    padding: '6px 12px',
    color: '#c4b5fd',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    overflowX: 'auto',
    flexWrap: 'nowrap',
  },
  chip: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: '6px 14px',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
  },
  chipActive: {
    background: 'rgba(124,58,237,0.4)',
    border: '1px solid #7c3aed',
    color: '#fff',
  },
  summary: {
    display: 'flex',
    gap: 12,
    padding: '16px 20px',
  },
  stat: {
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 80,
    flex: 1,
  },
  statNum: {
    fontSize: 28,
    fontWeight: 800,
    color: '#c4b5fd',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  list: {
    padding: '0 16px',
  },
  dateHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    padding: '20px 4px 8px',
  },
  card: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '14px 16px',
    marginBottom: 8,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  mealBadge: {
    background: 'rgba(124,58,237,0.3)',
    borderRadius: 8,
    padding: '2px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: '#c4b5fd',
    textTransform: 'capitalize',
  },
  personBadge: {
    background: 'rgba(5,150,105,0.3)',
    borderRadius: 8,
    padding: '2px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: '#6ee7b7',
  },
  time: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginLeft: 'auto',
  },
  food: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    lineHeight: 1.4,
  },
  notes: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
    fontStyle: 'italic',
  },
  loading: {
    textAlign: 'center',
    padding: 40,
    color: 'rgba(255,255,255,0.4)',
  },
  empty: {
    textAlign: 'center',
    padding: 60,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 18,
  },
};
