import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

interface NicheListInfo {
  niche: string;
  description: string;
  lastUpdated: string;
}

const HomePage: React.FC = () => {
  const [nicheLists, setNicheLists] = useState<NicheListInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNicheLists();
  }, []);

  const loadNicheLists = async () => {
    try {
      const response = await fetch('/api/niche-lists');
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
    <div className="home-page">
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
              key={nicheList.niche}
              to={`/niche-list/${encodeURIComponent(nicheList.niche)}`}
              className="niche-list-card"
            >
              <h2>{nicheList.niche}</h2>
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
      </div>
    </div>
  );
};

export default HomePage;

