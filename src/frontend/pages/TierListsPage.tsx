import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import './TierListsPage.css';

interface NicheListInfo {
  niche?: string;
  filename?: string;
  displayName: string;
  description: string;
  lastUpdated: string;
}

const TierListsPage: React.FC = () => {
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
        throw new Error('Failed to load niche lists');
      }
      const data = await response.json() as NicheListInfo[];
      setNicheLists(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load niche lists');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading niche lists...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="tier-lists-page">
      <div className="hero">
        <h1>Arknights Operator Niche Lists</h1>
        <p>Browse niche lists for different operator roles</p>
      </div>

      <div className="niche-lists-grid">
        {nicheLists.length === 0 ? (
          <div className="error">No niche lists found</div>
        ) : (
          nicheLists.map((nicheList) => (
            <Link
              key={nicheList.filename || nicheList.niche}
              to={`/niche-list/${encodeURIComponent(nicheList.filename || nicheList.displayName || nicheList.niche || '')}`}
              className="niche-list-card"
            >
              <h2>{nicheList.displayName || nicheList.niche}</h2>
              <p>{nicheList.description || 'No description available'}</p>
              <div className="meta">
                {nicheList.lastUpdated && `Last updated: ${nicheList.lastUpdated}`}
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="special-links">
        <Link to="/trash-operators" className="special-card trash-card">
          <h2>Trash Operators</h2>
          <p>Operators with no optimal use</p>
        </Link>
        <Link to="/free-operators" className="special-card free-card">
          <h2>Free Operators</h2>
          <p>Operators that are free to obtain</p>
        </Link>
        <Link to="/global-range-operators" className="special-card global-range-card">
          <h2>Global Range Operators</h2>
          <p>Operators that can hit anywhere on the map</p>
        </Link>
        <Link to="/unconventional-niches-operators" className="special-card unconventional-niches-card">
          <h2>Unconventional Niches</h2>
          <p>Truly unique niches not covered by other tier lists</p>
        </Link>
        <Link to="/low-rarity-operators" className="special-card low-rarity-card">
          <h2>Good Low-Rarity Operators</h2>
          <p>Low-Rarity operators worth raising for early game strategies</p>
        </Link>
      </div>
    </div>
  );
};

export default TierListsPage;

