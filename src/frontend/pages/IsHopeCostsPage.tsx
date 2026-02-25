import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { useAuth } from '../contexts/AuthContext';
import './IsHopeCostsPage.css';

const AUTOSAVE_DEBOUNCE_MS = 1500;

const ALLOWED_ADMIN_EMAIL = 'ryanli1366@gmail.com';

const IS_IDS = ['IS2', 'IS3', 'IS4', 'IS5', 'IS6'] as const;
const CLASSES = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'] as const;
const RARITIES = ['4', '5', '6'] as const;

const SQUADS_BY_IS: Record<string, string[]> = {
  IS2: ['default', 'TAS', 'TDS', 'TFS', 'TRS'],
  IS3: ['default', 'POS', 'TAS', 'TDS', 'TFS', 'TRS'],
  IS4: ['default', 'STS', 'TAS', 'TDS', 'TFS', 'TRS'],
  IS5: ['default', 'MS', 'TAS', 'TDS', 'TFS', 'TRS'],
  IS6: ['default', 'GBO', 'HGBO', 'TAS', 'TDS', 'TFS', 'TRS']
};

type HopeCostsConfig = Record<string, Record<string, Record<string, unknown>>>;

/** Hope: per rarity, per class only (no "default"). Promotion: per rarity, per class. */
function ensureSquadEntry(config: HopeCostsConfig, isId: string, squadId: string): void {
  if (!config[isId]) config[isId] = {};
  const entry = config[isId][squadId] as Record<string, unknown> | undefined;
  if (!entry) {
    const newEntry: Record<string, unknown> = {
      '4': Object.fromEntries(CLASSES.map(c => [c, 0])),
      '5': Object.fromEntries(CLASSES.map(c => [c, 3])),
      '6': Object.fromEntries(CLASSES.map(c => [c, 6])),
      promotionCost: {
        '4': Object.fromEntries(CLASSES.map(c => [c, 3])),
        '5': Object.fromEntries(CLASSES.map(c => [c, 3])),
        '6': Object.fromEntries(CLASSES.map(c => [c, 3]))
      },
      autoPromoteClasses: []
    };
    config[isId][squadId] = newEntry;
    return;
  }
  for (const r of RARITIES) {
    const hopeByClass = (entry[r] as Record<string, number>) ?? {};
    const defaultHope = r === '6' ? 6 : r === '5' ? 3 : 0;
    for (const c of CLASSES) {
      if (hopeByClass[c] === undefined) hopeByClass[c] = hopeByClass['default'] ?? defaultHope;
    }
    delete hopeByClass['default'];
    entry[r] = hopeByClass;
  }
  let prom = entry.promotionCost as Record<string, unknown> | undefined;
  const isOldPromotionShape = prom && typeof (prom as Record<string, number>)['default'] === 'number';
  if (!prom || isOldPromotionShape) {
    const oldByClass = (prom as Record<string, number>) ?? {};
    const defaultCost = (typeof oldByClass['default'] === 'number' ? oldByClass['default'] : 3) as number;
    prom = {
      '4': Object.fromEntries(CLASSES.map(c => [c, (oldByClass[c] ?? defaultCost) as number])),
      '5': Object.fromEntries(CLASSES.map(c => [c, (oldByClass[c] ?? defaultCost) as number])),
      '6': Object.fromEntries(CLASSES.map(c => [c, (oldByClass[c] ?? defaultCost) as number]))
    };
    entry.promotionCost = prom;
  } else {
    for (const r of RARITIES) {
      const byClass = (prom[r] as Record<string, number>) ?? {};
      const defaultCost = (typeof (prom as Record<string, number>)['default'] === 'number' ? (prom as Record<string, number>)['default'] : 3) as number;
      for (const c of CLASSES) {
        if (byClass[c] === undefined) byClass[c] = byClass['default'] ?? defaultCost;
      }
      delete (byClass as Record<string, number>)['default'];
      prom[r] = byClass;
    }
  }
  if (!Array.isArray(entry.autoPromoteClasses)) entry.autoPromoteClasses = [];
}

const IsHopeCostsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<HopeCostsConfig>({});
  const [selectedIS, setSelectedIS] = useState<string>('IS6');
  const [selectedSquad, setSelectedSquad] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const initialLoadDone = useRef(false);
  const hasEdited = useRef(false);

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isAllowed) {
      navigate('/integrated-strategies', { replace: true });
    }
  }, [authLoading, user, isAllowed, navigate]);

  useEffect(() => {
    if (!isAllowed || authLoading) return;
    const load = async () => {
      try {
        const res = await apiFetch('/api/config/is-hope-costs');
        if (res.ok) {
          const data = await res.json();
          setConfig(typeof data === 'object' && data !== null ? data : {});
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        initialLoadDone.current = true;
      }
    };
    load();
  }, [isAllowed, authLoading]);

  // Autosave to server JSON when config is edited (debounced)
  useEffect(() => {
    if (!isAllowed || !initialLoadDone.current || !hasEdited.current || Object.keys(config).length === 0) return;
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      setError(null);
      try {
        const res = await apiFetch('/api/config/is-hope-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        if (res.ok) {
          setSaveStatus('saved');
          setSaved(true);
          hasEdited.current = false;
        } else {
          const err = await res.json().catch(() => ({}));
          setSaveStatus('error');
          setError(err.error || 'Failed to save');
        }
      } catch (e) {
        setSaveStatus('error');
        setError(e instanceof Error ? e.message : 'Failed to save');
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [config, isAllowed]);

  useEffect(() => {
    if (!config[selectedIS]?.[selectedSquad] && Object.keys(config).length > 0) {
      const next = JSON.parse(JSON.stringify(config));
      ensureSquadEntry(next, selectedIS, selectedSquad);
      setConfig(next);
    }
  }, [config, selectedIS, selectedSquad]);

  const setHope = (rarity: string, className: string, value: number) => {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      ensureSquadEntry(next, selectedIS, selectedSquad);
      if (!next[selectedIS][selectedSquad][rarity]) next[selectedIS][selectedSquad][rarity] = {};
      (next[selectedIS][selectedSquad][rarity] as Record<string, number>)[className] = value;
      return next;
    });
    setSaved(false);
    hasEdited.current = true;
  };

  const setPromotion = (rarity: string, className: string, value: number) => {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      ensureSquadEntry(next, selectedIS, selectedSquad);
      const prom = next[selectedIS][selectedSquad].promotionCost as Record<string, Record<string, number>>;
      if (!prom[rarity]) prom[rarity] = {};
      prom[rarity][className] = value;
      return next;
    });
    setSaved(false);
    hasEdited.current = true;
  };

  const toggleAutoPromoteClass = (className: string) => {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      ensureSquadEntry(next, selectedIS, selectedSquad);
      const entry = next[selectedIS][selectedSquad] as Record<string, unknown>;
      const arr = (entry.autoPromoteClasses as string[]) ?? [];
      entry.autoPromoteClasses = arr.includes(className)
        ? arr.filter(c => c !== className)
        : [...arr, className];
      return next;
    });
    setSaved(false);
    hasEdited.current = true;
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'is-hope-costs.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setSaved(true);
  };

  if (authLoading || !user || !isAllowed) {
    return <div className="is-hope-costs-page"><div className="loading">Loading...</div></div>;
  }
  if (loading) {
    return <div className="is-hope-costs-page"><div className="loading">Loading...</div></div>;
  }
  if (error) {
    return <div className="is-hope-costs-page"><div className="error">{error}</div></div>;
  }

  const currentEntry = config[selectedIS]?.[selectedSquad];
  const squads = SQUADS_BY_IS[selectedIS] ?? ['default'];

  return (
    <div className="is-hope-costs-page">
      <h1>IS Hope &amp; Promotion Costs (Dev)</h1>
      <p className="intro">
        Configure hope costs per rarity and class, and promotion cost per rarity × class, for each IS title and squad.
        Changes are autosaved to <code>data/is-hope-costs.json</code> on the server. Users can override in their account settings.
      </p>
      <div className="is-hope-costs-selectors">
        <label>
          IS:{' '}
          <select value={selectedIS} onChange={e => { setSelectedIS(e.target.value); setSelectedSquad('default'); }}>
            {IS_IDS.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>
          Squad:{' '}
          <select value={selectedSquad} onChange={e => setSelectedSquad(e.target.value)}>
            {squads.map(s => <option key={s} value={s}>{s === 'default' ? '(no squad)' : s}</option>)}
          </select>
        </label>
      </div>
      {currentEntry && (
        <>
          <h2>Hope costs (recruit)</h2>
          <p className="muted">Per rarity and class.</p>
          <div className="hope-costs-grid">
            <table className="hope-costs-table">
              <thead>
                <tr>
                  <th>Rarity</th>
                  {CLASSES.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {RARITIES.map(r => (
                  <tr key={r}>
                    <td>{r}★</td>
                    {CLASSES.map(c => (
                      <td key={c}>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={(currentEntry[r] as Record<string, number>)?.[c] ?? (r === '6' ? 6 : r === '5' ? 3 : 0)}
                          onChange={e => setHope(r, c, parseInt(e.target.value, 10) || 0)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Promotion cost (per rarity and class)</h2>
          <p className="muted">Hope cost to promote an operator; each rarity × class can be set.</p>
          <div className="promotion-costs-grid">
            <table className="hope-costs-table">
              <thead>
                <tr>
                  <th>Rarity</th>
                  {CLASSES.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {RARITIES.map(r => {
                  const promByRarity = (currentEntry.promotionCost as Record<string, Record<string, number>>)?.[r] ?? (currentEntry.promotionCost as Record<string, number>);
                  const getProm = (cls: string) => (typeof promByRarity === 'object' && promByRarity !== null && !Array.isArray(promByRarity)
                    ? (promByRarity as Record<string, number>)[cls] ?? (promByRarity as Record<string, number>)['default'] ?? 3
                    : 3);
                  return (
                    <tr key={r}>
                      <td>{r}★</td>
                      {CLASSES.map(c => (
                        <td key={c}>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={getProm(c)}
                            onChange={e => setPromotion(r, c, parseInt(e.target.value, 10) || 0)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h2>Auto-promote on recruitment</h2>
          <p className="muted">Classes that are automatically promoted when recruited (first pick). They are scored at max potential (E2/module) and added to the team as already promoted.</p>
          <div className="auto-promote-classes">
            {CLASSES.map(c => {
              const arr = (currentEntry as Record<string, unknown>).autoPromoteClasses as string[] | undefined;
              const checked = Array.isArray(arr) && arr.includes(c);
              return (
                <label key={c} className="auto-promote-checkbox">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAutoPromoteClass(c)}
                  />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
      <div className="actions">
        <button type="button" className="download-btn" onClick={downloadJson}>
          Download is-hope-costs.json
        </button>
        {saveStatus === 'saving' && <span className="saved-hint">Saving…</span>}
        {saveStatus === 'saved' && <span className="saved-hint">Saved to server.</span>}
        {saveStatus === 'error' && <span className="saved-hint" style={{ color: 'var(--error, #ef4444)' }}>Save failed.</span>}
      </div>
      <p>
        <Link to="/integrated-strategies">← Integrated Strategies</Link>
        {' · '}
        <Link to="/config/is-niche-weights">IS Niche Weight Pools</Link>
      </p>
    </div>
  );
};

export default IsHopeCostsPage;
