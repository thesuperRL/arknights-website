import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { useAuth } from '../contexts/AuthContext';
import type { ISNicheWeightPools } from './IntegratedStrategiesPage';
import './IsNicheWeightPoolsPage.css';

const AUTOSAVE_DEBOUNCE_MS = 1500;

const ALLOWED_ADMIN_EMAIL = 'ryanli1366@gmail.com';

interface NicheItem {
  filename: string;
  displayName: string;
}

const POOL_KEYS = ['important', 'optional', 'good'] as const;
type PoolKey = typeof POOL_KEYS[number];
const POOL_LABELS: Record<PoolKey, string> = {
  important: 'Important',
  optional: 'Optional',
  good: 'Good'
};

const IsNicheWeightPoolsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [niches, setNiches] = useState<NicheItem[]>([]);
  const [config, setConfig] = useState<ISNicheWeightPools>({
    important: { rawScore: 5, niches: [] },
    optional: { rawScore: 2, niches: [] },
    good: { rawScore: 0.5, niches: [] },
    synergyCoreBonus: 15,
    synergyScaleFactor: 1,
    firstRecruitPotentialMultiplier: 0
  });
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
    if (!isAllowed) return;
  }, [authLoading, user, isAllowed, navigate]);

  useEffect(() => {
    if (!isAllowed || authLoading) return;
    const load = async () => {
      try {
        const [nicheRes, configRes] = await Promise.all([
          apiFetch('/api/niche-lists'),
          apiFetch('/api/config/is-niche-weight-pools')
        ]);
        if (nicheRes.ok) {
          const data = await nicheRes.json();
          setNiches(data.filter((n: NicheItem) => !n.filename.startsWith('synergies/')));
        }
        if (configRes.ok) {
          const data = await configRes.json();
          setConfig({
            important: data.important ?? { rawScore: 5, niches: [] },
            optional: data.optional ?? { rawScore: 2, niches: [] },
            good: data.good ?? { rawScore: 0.5, niches: [] },
            synergyCoreBonus: data.synergyCoreBonus ?? 15,
            synergyScaleFactor: data.synergyScaleFactor ?? 1,
            firstRecruitPotentialMultiplier: data.firstRecruitPotentialMultiplier ?? 0
          });
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
    if (!isAllowed || !initialLoadDone.current || !hasEdited.current) return;
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      setError(null);
      try {
        const res = await apiFetch('/api/config/is-niche-weight-pools', {
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

  const setRawScore = (pool: PoolKey, rawScore: number) => {
    setConfig(prev => ({
      ...prev,
      [pool]: { ...prev[pool], rawScore }
    }));
    setSaved(false);
    hasEdited.current = true;
  };

  const toggleNicheInPool = (pool: PoolKey, filename: string) => {
    setConfig(prev => {
      const current = prev[pool].niches.includes(filename);
      const newNiches = current
        ? prev[pool].niches.filter(n => n !== filename)
        : [...prev[pool].niches, filename];
      return { ...prev, [pool]: { ...prev[pool], niches: newNiches } };
    });
    setSaved(false);
    hasEdited.current = true;
  };

  const moveNicheToPool = (filename: string, toPool: PoolKey) => {
    setConfig(prev => {
      const removeFrom = (p: PoolKey) => ({
        ...prev[p],
        niches: prev[p].niches.filter(n => n !== filename)
      });
      const addTo = (p: PoolKey) => ({
        ...prev[p],
        niches: prev[p].niches.includes(filename) ? prev[p].niches : [...prev[p].niches, filename]
      });
      return {
        ...prev,
        important: toPool === 'important' ? addTo('important') : removeFrom('important'),
        optional: toPool === 'optional' ? addTo('optional') : removeFrom('optional'),
        good: toPool === 'good' ? addTo('good') : removeFrom('good')
      };
    });
    setSaved(false);
    hasEdited.current = true;
  };

  const getNichePool = (filename: string): PoolKey | null => {
    if (config.important.niches.includes(filename)) return 'important';
    if (config.optional.niches.includes(filename)) return 'optional';
    if (config.good.niches.includes(filename)) return 'good';
    return null;
  };

  const setSynergyCoreBonus = (v: number) => {
    setConfig(prev => ({ ...prev, synergyCoreBonus: v }));
    setSaved(false);
    hasEdited.current = true;
  };
  const setSynergyScaleFactor = (v: number) => {
    setConfig(prev => ({ ...prev, synergyScaleFactor: v }));
    setSaved(false);
    hasEdited.current = true;
  };
  const setFirstRecruitPotentialMultiplier = (v: number) => {
    setConfig(prev => ({ ...prev, firstRecruitPotentialMultiplier: v }));
    setSaved(false);
    hasEdited.current = true;
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'is-niche-weight-pools.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setSaved(true);
  };

  if (authLoading || !user) {
    return <div className="is-niche-weight-pools-page"><div className="loading">Loading...</div></div>;
  }
  if (!isAllowed) {
    return (
      <div className="is-niche-weight-pools-page">
        <div className="error">Access denied. This page is restricted to the administrator.</div>
        <p><Link to="/integrated-strategies">← Back to Integrated Strategies</Link></p>
      </div>
    );
  }
  if (loading) {
    return <div className="is-niche-weight-pools-page"><div className="loading">Loading...</div></div>;
  }
  if (error) {
    return <div className="is-niche-weight-pools-page"><div className="error">{error}</div></div>;
  }

  return (
    <div className="is-niche-weight-pools-page">
      <h1>IS Niche Weight Pools (Dev)</h1>
      <p className="intro">
        Assign each niche to one of three pools. The <strong>raw score</strong> of each pool is used in Integrated
        Strategies scoring (tier × rawScore × coverage factor). Changes are autosaved to <code>data/is-niche-weight-pools.json</code> on the server.
      </p>
      <div className="pools-grid">
        {POOL_KEYS.map(pool => (
          <div key={pool} className={`pool-card pool-${pool}`}>
            <h2>{POOL_LABELS[pool]}</h2>
            <label>
              Raw score:{' '}
              <input
                type="number"
                step="0.5"
                min="0"
                value={config[pool].rawScore}
                onChange={e => setRawScore(pool, parseFloat(e.target.value) || 0)}
              />
            </label>
            <div className="pool-niches">
              {config[pool].niches.length === 0 ? (
                <span className="muted">No niches assigned</span>
              ) : (
                config[pool].niches.map(filename => {
                  const item = niches.find(n => n.filename === filename);
                  return (
                    <div key={filename} className="pool-niche-chip">
                      <span>{item?.displayName || filename}</span>
                      <button
                        type="button"
                        className="remove-niche"
                        onClick={() => toggleNicheInPool(pool, filename)}
                        title="Remove from pool"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="synergy-scoring-section">
        <h2>Synergy scoring (IS)</h2>
        <p className="muted">Applied to all IS-only synergies. Core bonus when required operators are present; scale factor multiplies each synergy&apos;s corePointBonus and optionalPointBonus from its JSON.</p>
        <div className="synergy-inputs">
          <label>
            Synergy core bonus:{' '}
            <input
              type="number"
              step="1"
              min="0"
              value={config.synergyCoreBonus ?? 15}
              onChange={e => setSynergyCoreBonus(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label>
            Synergy scale factor:{' '}
            <input
              type="number"
              step="0.1"
              min="0"
              value={config.synergyScaleFactor ?? 1}
              onChange={e => setSynergyScaleFactor(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label>
            First-recruit potential multiplier (0–1):{' '}
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={config.firstRecruitPotentialMultiplier ?? 0}
              onChange={e => setFirstRecruitPotentialMultiplier(parseFloat(e.target.value) || 0)}
            />
            <span className="muted"> — On first recruitment only, adds this fraction of the operator&apos;s E2/module tier score so future potential is considered.</span>
          </label>
        </div>
      </div>
      <div className="all-niches-section">
        <h2>All niches – assign to pool</h2>
        <p className="muted">Niches not in any pool use the &quot;good&quot; raw score.</p>
        <div className="niches-list">
          {niches.map(n => {
            const inPool = getNichePool(n.filename);
            return (
              <div key={n.filename} className="niche-row">
                <span className="niche-name">{n.displayName}</span>
                <span className="niche-filename">{n.filename}</span>
                <div className="pool-buttons">
                  {POOL_KEYS.map(pool => (
                    <button
                      key={pool}
                      type="button"
                      className={inPool === pool ? 'active' : ''}
                      onClick={() => moveNicheToPool(n.filename, pool)}
                    >
                      {POOL_LABELS[pool]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="actions">
        <button type="button" className="download-btn" onClick={downloadJson}>
          Download is-niche-weight-pools.json
        </button>
        {saveStatus === 'saving' && <span className="saved-hint">Saving…</span>}
        {saveStatus === 'saved' && <span className="saved-hint">Saved to server.</span>}
        {saveStatus === 'error' && <span className="saved-hint" style={{ color: 'var(--error, #ef4444)' }}>Save failed.</span>}
      </div>
      <p>
        <Link to="/integrated-strategies">← Integrated Strategies</Link>
      </p>
    </div>
  );
};

export default IsNicheWeightPoolsPage;
