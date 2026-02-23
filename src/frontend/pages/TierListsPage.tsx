import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { useTranslation } from '../translations';
import './TierListsPage.css';

/** Set to true to show the Free Operators card on the Tier Lists page */
const SHOW_FREE_OPERATORS = false;

interface NicheListInfo {
  niche?: string;
  filename?: string;
  displayName: string;
  description: string;
  lastUpdated: string;
}

const TierListsPage: React.FC = () => {
  const { t, getNicheName, getNicheDescription } = useTranslation();
  const [nicheLists, setNicheLists] = useState<NicheListInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNicheLists();
  }, []);

  const loadNicheLists = async () => {
    try {
      const response = await apiFetch('/api/niche-lists');
      if (!response.ok) {
        throw new Error(t('tierLists.loadError'));
      }
      const data = await response.json() as NicheListInfo[];
      setNicheLists(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tierLists.loadError'));
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">{t('tierLists.loading')}</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="tier-lists-page">
      <div className="hero">
        <h1>{t('tierLists.title')}</h1>
        <p>{t('tierLists.subtitle')}</p>
      </div>

      <div className="niche-lists-grid">
        {nicheLists.length === 0 ? (
          <div className="error">{t('tierLists.noLists')}</div>
        ) : (
          nicheLists.map((nicheList) => (
            <Link
              key={nicheList.filename || nicheList.niche}
              to={`/niche-list/${encodeURIComponent(nicheList.filename || nicheList.displayName || nicheList.niche || '')}`}
              className="niche-list-card"
            >
              <h2>{getNicheName(nicheList.filename || '', nicheList.displayName || nicheList.niche || '')}</h2>
              <p>{getNicheDescription(nicheList.filename || '', nicheList.description || '') || t('common.noDescription')}</p>
              <div className="meta">
                {nicheList.lastUpdated && `${t('common.lastUpdated')}: ${nicheList.lastUpdated}`}
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="special-links">
        <Link to="/trash-operators" className="special-card trash-card">
          <h2>{t('tierLists.trashOperators')}</h2>
          <p>{t('tierLists.trashDesc')}</p>
        </Link>
        {SHOW_FREE_OPERATORS && (
          <Link to="/free-operators" className="special-card free-card">
            <h2>{t('tierLists.freeOperators')}</h2>
            <p>{t('tierLists.freeDesc')}</p>
          </Link>
        )}
        <Link to="/global-range-operators" className="special-card global-range-card">
          <h2>{t('tierLists.globalRange')}</h2>
          <p>{t('tierLists.globalRangeDesc')}</p>
        </Link>
        <Link to="/unconventional-niches-operators" className="special-card unconventional-niches-card">
          <h2>{t('tierLists.unconventionalNiches')}</h2>
          <p>{t('tierLists.unconventionalDesc')}</p>
        </Link>
        <Link to="/low-rarity-operators" className="special-card low-rarity-card">
          <h2>{t('tierLists.lowRarity')}</h2>
          <p>{t('tierLists.lowRarityDesc')}</p>
        </Link>
      </div>
    </div>
  );
};

export default TierListsPage;

