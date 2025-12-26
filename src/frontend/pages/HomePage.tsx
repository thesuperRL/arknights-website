import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

interface TierListInfo {
  niche: string;
  description: string;
  lastUpdated: string;
}

const HomePage: React.FC = () => {
  const [tierLists, setTierLists] = useState<TierListInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTierLists();
  }, []);

  const loadTierLists = async () => {
    try {
      const response = await fetch('/api/tier-lists');
      if (!response.ok) {
        throw new Error('Failed to load tier lists');
      }
      const data = await response.json() as TierListInfo[];
      setTierLists(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tier lists');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading tier lists...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="home-page">
      <div className="hero">
        <h1>Arknights Operator Tier Lists</h1>
        <p>Browse tier lists for different operator niches</p>
      </div>

      <div className="special-links">
        <Link to="/trash-operators" className="special-card trash-card">
          <h2>🗑️ Trash Operators</h2>
          <p>Operators with no optimal use</p>
        </Link>
      </div>

      <div className="tier-lists-grid">
        {tierLists.length === 0 ? (
          <div className="error">No tier lists found</div>
        ) : (
          tierLists.map((tierList) => (
            <Link
              key={tierList.niche}
              to={`/tier-list/${encodeURIComponent(tierList.niche)}`}
              className="tier-list-card"
            >
              <h2>{tierList.niche}</h2>
              <p>{tierList.description || 'No description available'}</p>
              <div className="meta">
                {tierList.lastUpdated && `Last updated: ${tierList.lastUpdated}`}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default HomePage;

