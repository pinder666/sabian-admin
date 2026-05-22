import { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_KEY = process.env.REACT_APP_API_KEY || 'test_key';

const LEVEL_COLOR = {
  CRITICAL: '#cc2200',
  WARNING:  '#cc7700',
  ELEVATED: '#0077cc',
  STABLE:   '#009933'
};

const THEATER_FLAGS = {
  AFRICOM: 'AF', CENTCOM: 'CT', EUCOM: 'EU', INDOPACOM: 'IP', SOUTHCOM: 'SC'
};

async function apiFetch(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function ScoreBadge({ score, level }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 42, textAlign: 'center',
      background: LEVEL_COLOR[level] || '#333',
      color: '#fff', fontWeight: 700, fontSize: 13,
      borderRadius: 4, padding: '2px 8px', letterSpacing: 0.5
    }}>
      {score}
    </span>
  );
}

function LevelTag({ level }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 72, textAlign: 'center',
      border: `1px solid ${LEVEL_COLOR[level] || '#444'}`,
      color: LEVEL_COLOR[level] || '#ccc',
      fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
      borderRadius: 3, padding: '2px 6px', textTransform: 'uppercase'
    }}>
      {level}
    </span>
  );
}

function ScoreBar({ score, level }) {
  return (
    <div style={{ width: '100%', background: '#1a1a24', borderRadius: 3, height: 6, overflow: 'hidden' }}>
      <div style={{ width: `${score}%`, height: '100%', background: LEVEL_COLOR[level] || '#444', transition: 'width 0.4s' }} />
    </div>
  );
}

function CountryRow({ country, onClick, selected }) {
  const c = LEVEL_COLOR[country.risk_level] || '#444';
  return (
    <tr
      onClick={() => onClick(country)}
      style={{
        cursor: 'pointer',
        background: selected ? '#1a1a2e' : 'transparent',
        borderLeft: selected ? `3px solid ${c}` : '3px solid transparent',
        transition: 'background 0.15s'
      }}
    >
      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{country.country}</td>
      <td style={{ padding: '8px 12px' }}><ScoreBadge score={country.convergence_score} level={country.risk_level} /></td>
      <td style={{ padding: '8px 12px' }}><LevelTag level={country.risk_level} /></td>
      <td style={{ padding: '8px 4px', color: '#666', fontSize: 11 }}>{THEATER_FLAGS[country.theater] || country.theater || '—'}</td>
      <td style={{ padding: '8px 12px', minWidth: 120 }}>
        <ScoreBar score={country.convergence_score} level={country.risk_level} />
      </td>
      <td style={{ padding: '8px 12px', color: '#666', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {country.top_3_signals?.[0]?.name || '—'}
      </td>
    </tr>
  );
}

function CountryDetail({ country, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/country/${encodeURIComponent(country.country)}?days=90`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [country.country]);

  const signals = detail?.current?.top_3_signals || [];
  const history = detail?.history || [];

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 420, height: '100vh',
      background: '#0e0e18', borderLeft: '1px solid #1a1a2e',
      overflowY: 'auto', zIndex: 100, padding: 24, boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            {country.theater} · {country.scan_date}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{country.country}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
      </div>

      <div style={{ background: '#111118', borderRadius: 6, padding: 16, marginBottom: 16, borderLeft: `4px solid ${LEVEL_COLOR[country.risk_level]}` }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: LEVEL_COLOR[country.risk_level] }}>
          {country.convergence_score}<span style={{ fontSize: 14, color: '#666', fontWeight: 400 }}>/100</span>
        </div>
        <div style={{ color: LEVEL_COLOR[country.risk_level], fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', fontSize: 13 }}>{country.risk_level}</div>
      </div>

      {loading && <div style={{ color: '#444', textAlign: 'center', padding: 20 }}>Loading signals...</div>}

      {!loading && signals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Top Signals</div>
          {signals.map((s, i) => (
            <div key={i} style={{ background: '#111118', borderRadius: 4, padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                <ScoreBadge score={s.score} level={s.score >= 80 ? 'CRITICAL' : s.score >= 60 ? 'WARNING' : s.score >= 40 ? 'ELEVATED' : 'STABLE'} />
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>{s.label}</div>
              <ScoreBar score={s.score} level={s.score >= 80 ? 'CRITICAL' : s.score >= 60 ? 'WARNING' : 'ELEVATED'} />
            </div>
          ))}
        </div>
      )}

      {!loading && history.length > 1 && (
        <div>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            Score History ({history.length} scans)
          </div>
          <div style={{ background: '#111118', borderRadius: 4, padding: 12 }}>
            {history.slice(-12).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#444', width: 80, flexShrink: 0 }}>{h.scan_date}</span>
                <div style={{ flex: 1, background: '#1a1a24', borderRadius: 2, height: 4 }}>
                  <div style={{ width: `${h.convergence_score}%`, height: '100%', background: LEVEL_COLOR[h.risk_level] || '#444' }} />
                </div>
                <span style={{ fontSize: 11, color: LEVEL_COLOR[h.risk_level], width: 28, textAlign: 'right', flexShrink: 0 }}>{h.convergence_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryBar({ summary }) {
  if (!summary) return null;
  const { by_level, total_countries, scan_date } = summary;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 24px', background: '#0a0a12', borderBottom: '1px solid #1a1a24', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: '#444', fontSize: 11, marginRight: 4 }}>{scan_date}</span>
      {Object.entries(by_level || {}).map(([level, data]) => (
        <span key={level} style={{ fontSize: 12, color: LEVEL_COLOR[level] || '#666' }}>
          <strong>{data.count}</strong> <span style={{ color: '#444' }}>{level}</span>
        </span>
      ))}
      <span style={{ color: '#333', fontSize: 11, marginLeft: 'auto' }}>{total_countries} countries monitored</span>
    </div>
  );
}

export default function App() {
  const [threats, setThreats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [theaterFilter, setTheaterFilter] = useState('ALL');
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s] = await Promise.all([
        apiFetch('/api/threats'),
        apiFetch('/api/summary')
      ]);
      setThreats(t.countries || []);
      setSummary(s);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const levels = ['ALL', 'CRITICAL', 'WARNING', 'ELEVATED', 'STABLE'];
  const theaters = ['ALL', 'AFRICOM', 'CENTCOM', 'EUCOM', 'INDOPACOM', 'SOUTHCOM'];

  const filtered = threats.filter(t => {
    if (filter !== 'ALL' && t.risk_level !== filter) return false;
    if (theaterFilter !== 'ALL' && t.theater !== theaterFilter) return false;
    return true;
  });

  return (
    <div style={{ background: '#080810', color: '#e0e0e0', minHeight: '100vh', fontFamily: "'Courier New', monospace" }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #1a1a24', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#444', letterSpacing: 3, textTransform: 'uppercase' }}>Sabian Global</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>Intelligence Convergence Platform</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastRefresh && <span style={{ fontSize: 11, color: '#444' }}>Refreshed {lastRefresh}</span>}
          <button
            onClick={load}
            disabled={loading}
            style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: loading ? '#444' : '#e0e0e0', padding: '6px 14px', borderRadius: 4, cursor: loading ? 'default' : 'pointer', fontSize: 12 }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <SummaryBar summary={summary} />

      <div style={{ padding: '12px 24px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #111' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {levels.map(l => (
            <button key={l} onClick={() => setFilter(l)} style={{
              background: filter === l ? (LEVEL_COLOR[l] || '#2a2a3e') : '#111118',
              border: `1px solid ${filter === l ? (LEVEL_COLOR[l] || '#2a2a3e') : '#1a1a24'}`,
              color: filter === l ? '#fff' : '#666',
              padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: 1
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {theaters.map(t => (
            <button key={t} onClick={() => setTheaterFilter(t)} style={{
              background: theaterFilter === t ? '#2a2a3e' : '#111118',
              border: `1px solid ${theaterFilter === t ? '#3a3a5e' : '#1a1a24'}`,
              color: theaterFilter === t ? '#e0e0e0' : '#666',
              padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 11, letterSpacing: 0.5
            }}>{t}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px 24px', color: '#cc2200', background: '#1a0a0a', borderBottom: '1px solid #2a1010' }}>
          API Error: {error} — Is the Sabian API running? Start with: <code>node sabian_api.cjs</code>
        </div>
      )}

      <div style={{ overflowX: 'auto', paddingRight: selected ? 440 : 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0e0e18', borderBottom: '1px solid #1a1a24' }}>
              {['Country', 'Score', 'Level', 'Theater', 'Risk', 'Lead Signal'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#444', fontWeight: 400, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !threats.length && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#444' }}>Loading intelligence data...</td></tr>
            )}
            {!loading && !filtered.length && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#444' }}>No countries match current filters.</td></tr>
            )}
            {filtered.map(c => (
              <CountryRow key={c.country} country={c} onClick={setSelected} selected={selected?.country === c.country} />
            ))}
          </tbody>
        </table>
      </div>

      {selected && <CountryDetail country={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
