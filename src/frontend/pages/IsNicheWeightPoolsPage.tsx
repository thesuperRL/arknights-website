import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import type { ISNicheWeightPools } from './IntegratedStrategiesPage';
import './IsNicheWeightPoolsPage.css';

interface NicheItem {
  filename: string;
  displayName: string;
}

const POOL_KEYS = ['important', 'optional', 'good'] as const;
const POOL_LABELS: Record<string, string> = {
  important: 'Important',
  optional: 'Optional',
  good: 'Good'
};

const IsNicheWeightPoolsPage: React.FC = () => {
  const [niches, setNiches] = useState<NicheItem[]>([]);
  const [config, setConfig] = useState<ISNicheWeightPools>({
    important: { rawScore: 5, niches: [] },
    optional: { rawScore: 2, niches: [] },
    good: { rawScore: 0.5, niches: [] }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
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
            good: data.good ?? { rawScore: 0.5, niches: [] }
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const setRawScore = (pool: keyof ISNicheWeightPools, rawScore: number) => {
    setConfig(prev => ({
      ...prev,
      [pool]: { ...prev[pool], rawScore }
    }));
    setSaved(false);
  };

  const toggleNicheInPool = (pool: keyof ISNicheWeightPools, filename: string) => {
    setConfig(prev => {
      const current = prev[pool].niches.includes(filename);
      const newNiches = current
        ? prev[pool].niches.filter(n => n !== filename)
        : [...prev[pool].niches, filename];
      return { ...prev, [pool]: { ...prev[pool], niches: newNiches } };
    });
    setSaved(false);
  };

  const moveNicheToPool = (filename: string, toPool: keyof ISNicheWeightPools) => {
    setConfig(prev => {
      const removeFrom = (p: keyof ISNicheWeightPools) => ({
        ...prev[p],
        niches: prev[p].niches.filter(n => n !== filename)
      });
      const addTo = (p: keyof ISNicheWeightPools) => ({
        ...prev[p],
        niches: prev[p].niches.includes(filename) ? prev[p].niches : [...prev[p].niches, filename]
      });
      return {
        important: toPool === 'important' ? addTo('important') : removeFrom('important'),
        optional: toPool === 'optional' ? addTo('optional') : removeFrom('optional'),
        good: toPool === 'good' ? addTo('good') : removeFrom('good')
      };
    });
    setSaved(false);
  };

  const getNichePool = (filename: string): keyof ISNicheWeightPools | null => {
    if (config.important.niches.includes(filename)) return 'important';
    if (config.optional.niches.includes(filename)) return 'optional';
    if (config.good.niches.includes(filename)) return 'good';
    return null;
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
        Strategies scoring (tier × rawScore × coverage factor). Save the JSON to <code>data/is-niche-weight-pools.json</code> and commit.
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
        {saved && <span className="saved-hint">Save the file to data/is-niche-weight-pools.json and commit.</span>}
      </div>
      <p>
        <Link to="/integrated-strategies">← Integrated Strategies</Link>
      </p>
    </div>
  );
};

export default IsNicheWeightPoolsPage;
