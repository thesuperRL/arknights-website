import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './SynergiesPage.css';

interface SynergyInfo {
  filename: string;
  name: string;
  description: string;
}

const SynergiesPage: React.FC = () => {
  const [synergies, setSynergies] = useState<SynergyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSynergies();
  }, []);

  const loadSynergies = async () => {
    try {
      const response = await fetch('/api/synergies');
      if (!response.ok) {
        throw new Error('Failed to load synergies');
      }
      const data = await response.json() as SynergyInfo[];
      setSynergies(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load synergies');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading synergies...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="synergies-page">
      <div className="hero">
        <h1>Operator Synergies</h1>
        <p>Discover operator combinations that work well together</p>
      </div>

      <div className="synergies-grid">
        {synergies.length === 0 ? (
          <div className="error">No synergies found</div>
        ) : (
          synergies.map((synergy) => (
            <Link
              key={synergy.filename}
              to={`/synergy/${encodeURIComponent(synergy.filename)}`}
              className="synergy-card"
            >
              <h2>{synergy.name}</h2>
              <p>{synergy.description || 'No description available'}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default SynergiesPage;
