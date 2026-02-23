import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { useTranslation } from '../translations';
import './SynergiesPage.css';

interface SynergyInfo {
  filename: string;
  name: string;
  description: string;
}

const SynergiesPage: React.FC = () => {
  const { t, getNicheName, getNicheDescription } = useTranslation();
  const [synergies, setSynergies] = useState<SynergyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSynergies();
  }, []);

  const loadSynergies = async () => {
    try {
      const response = await apiFetch('/api/synergies');
      if (!response.ok) {
        throw new Error(t('synergies.loadError'));
      }
      const data = await response.json() as SynergyInfo[];
      setSynergies(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('synergies.loadError'));
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">{t('synergies.loading')}</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="synergies-page">
      <div className="hero">
        <h1>{t('synergies.title')}</h1>
        <p>{t('synergies.subtitle')}</p>
      </div>

      <div className="synergies-grid">
        {synergies.length === 0 ? (
          <div className="error">{t('synergies.noSynergies')}</div>
        ) : (
          synergies.map((synergy) => (
            <Link
              key={synergy.filename}
              to={`/synergy/${encodeURIComponent(synergy.filename)}`}
              className="synergy-card"
            >
              <h2>{getNicheName(synergy.filename, synergy.name)}</h2>
              <p>{getNicheDescription(synergy.filename, synergy.description || '') || t('common.noDescription')}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default SynergiesPage;
