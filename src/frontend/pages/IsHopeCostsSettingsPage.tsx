import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ImageDropdown, type ImageDropdownOption } from '../components/ImageDropdown';
import { IS_TITLES, IS_SQUADS_BY_TITLE } from '../is-constants';
import './IsHopeCostsPage.css';

const CLASSES = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'] as const;
const RARITIES = ['4', '5', '6'] as const;

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

function getSquadOptionsForTitle(isId: string): ImageDropdownOption[] {
  const defaultOption: ImageDropdownOption = { id: 'default', label: '(No squad)', image: null };
  const squads = IS_SQUADS_BY_TITLE[isId];
  if (!squads) return [defaultOption];
  return [defaultOption, ...squads];
}

const IsHopeCostsSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<HopeCostsConfig>({});
  const [selectedIS, setSelectedIS] = useState<string>('IS6');
  const [selectedSquad, setSelectedSquad] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [resetStatus, setResetStatus] = useState<'idle' | 'resetting' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
  }, [authLoading, user, navigate]);

  const loadConfig = async () => {
    try {
      let res = await apiFetch('/api/integrated-strategies/config');
      if (!res.ok) {
        const fallback = await apiFetch('/api/config/is-hope-costs');
        if (fallback.ok) {
          const data = await fallback.json();
          setConfig(typeof data === 'object' && data !== null ? data : {});
          setError(null);
        } else {
          setError('Failed to load config');
        }
      } else {
        const data = await res.json();
        setConfig(typeof data === 'object' && data !== null ? data : {});
        setError(null);
      }
    } catch (e) {
      try {
        const fallback = await apiFetch('/api/config/is-hope-costs');
        if (fallback.ok) {
          const data = await fallback.json();
          setConfig(typeof data === 'object' && data !== null ? data : {});
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      } catch {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || authLoading) return;
    loadConfig();
  }, [user, authLoading]);

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
    setSaveStatus('idle');
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
    setSaveStatus('idle');
  };

  /** Add delta to all class hope costs in this rarity row (recruit). Clamped 0–50. */
  const adjustHopeRow = (rarity: string, delta: number) => {
    if (delta === 0) return;
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      ensureSquadEntry(next, selectedIS, selectedSquad);
      const byClass = next[selectedIS][selectedSquad][rarity] as Record<string, number>;
      for (const c of CLASSES) {
        const v = (byClass[c] ?? (rarity === '6' ? 6 : rarity === '5' ? 3 : 0)) + delta;
        byClass[c] = Math.max(0, Math.min(50, v));
      }
      return next;
    });
    setSaveStatus('idle');
  };

  /** Add delta to all class promotion costs in this rarity row. Clamped 0–20. */
  const adjustPromotionRow = (rarity: string, delta: number) => {
    if (delta === 0) return;
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      ensureSquadEntry(next, selectedIS, selectedSquad);
      const prom = next[selectedIS][selectedSquad].promotionCost as Record<string, Record<string, number>>;
      if (!prom[rarity]) prom[rarity] = {};
      for (const c of CLASSES) {
        const current = (prom[rarity][c] ?? 3) + delta;
        prom[rarity][c] = Math.max(0, Math.min(20, current));
      }
      return next;
    });
    setSaveStatus('idle');
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
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const res = await apiFetch('/api/integrated-strategies/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setSaveStatus('saved');
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveStatus('error');
        setError(err.error || 'Failed to save');
      }
    } catch (e) {
      setSaveStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const handleReset = async () => {
    setResetStatus('resetting');
    setError(null);
    try {
      const res = await apiFetch('/api/integrated-strategies/config/reset', { method: 'POST' });
      if (res.ok) {
        setResetStatus('done');
        await loadConfig();
      } else {
        setResetStatus('error');
        setError('Failed to reset');
      }
    } catch (e) {
      setResetStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to reset');
    }
  };

  if (authLoading || !user) {
    return <div className="is-hope-costs-page"><div className="loading">Loading...</div></div>;
  }
  if (loading) {
    return <div className="is-hope-costs-page"><div className="loading">Loading...</div></div>;
  }

  const currentEntry = config[selectedIS]?.[selectedSquad];
  const titleOptions: ImageDropdownOption[] = IS_TITLES.map(t => ({ id: t.id, label: t.label, image: t.image }));
  const squadOptions = getSquadOptionsForTitle(selectedIS);

  return (
    <div className="is-hope-costs-page">
      <h1>Hope &amp; Promotion Settings</h1>
      <p className="intro">
        Customize hope costs (recruit) and promotion costs per IS title and squad. These apply in the Integrated Strategies team builder. Changes are saved to your account. Use Reset to restore developer defaults.
      </p>
      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
      <div className="is-hope-costs-selectors">
        <label className="is-settings-label">
          <span>IS:</span>
          <ImageDropdown
            options={titleOptions}
            value={selectedIS}
            onChange={(id) => { setSelectedIS(id); setSelectedSquad('default'); }}
            ariaLabel="Select IS title"
          />
        </label>
        <label className="is-settings-label">
          <span>Squad:</span>
          <ImageDropdown
            options={squadOptions}
            value={selectedSquad}
            onChange={setSelectedSquad}
            ariaLabel="Select squad"
          />
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
                  <th className="hope-adjust-col">Adjust row</th>
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
                    <td className="hope-adjust-cell">
                      {([-2, -1, 1, 2] as const).map(d => (
                        <button
                          key={d}
                          type="button"
                          className="hope-adjust-btn"
                          onClick={() => adjustHopeRow(r, d)}
                          title={d > 0 ? `Add ${d} to all in row` : `Subtract ${-d} from all in row`}
                          aria-label={d > 0 ? `Add ${d}` : `Subtract ${-d}`}
                        >
                          {d > 0 ? `+${d}` : d}
                          </button>
                        ))}
                    </td>
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
                  <th className="hope-adjust-col">Adjust row</th>
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
                      <td className="hope-adjust-cell">
                        {([-2, -1, 1, 2] as const).map(d => (
                          <button
                            key={d}
                            type="button"
                            className="hope-adjust-btn"
                            onClick={() => adjustPromotionRow(r, d)}
                            title={d > 0 ? `Add ${d} to all in row` : `Subtract ${-d} from all in row`}
                            aria-label={d > 0 ? `Add ${d}` : `Subtract ${-d}`}
                          >
                            {d > 0 ? `+${d}` : d}
                          </button>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h2>Auto-promote on recruitment</h2>
          <p className="muted">Classes that are automatically promoted when recruited (first pick).</p>
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
        <button type="button" className="download-btn" onClick={handleSave} disabled={saveStatus === 'saving'}>
          {saveStatus === 'saving' ? 'Saving…' : 'Save to my account'}
        </button>
        {saveStatus === 'saved' && <span className="saved-hint">Saved.</span>}
        {saveStatus === 'error' && <span className="saved-hint" style={{ color: 'var(--error)' }}>Save failed.</span>}
        <button type="button" className="reset-config-btn" onClick={handleReset} disabled={resetStatus === 'resetting'}>
          {resetStatus === 'resetting' ? 'Resetting…' : 'Reset to defaults'}
        </button>
        {resetStatus === 'done' && <span className="saved-hint">Reset complete.</span>}
      </div>
      <p>
        <Link to="/integrated-strategies">← Integrated Strategies</Link>
      </p>
    </div>
  );
};

export default IsHopeCostsSettingsPage;
