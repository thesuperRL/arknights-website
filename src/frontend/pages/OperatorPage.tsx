import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Stars from '../components/Stars';
import './OperatorPage.css';

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  global: boolean;
  profileImage: string;
  niches?: string[];
}

interface Ranking {
  niche: string;
  tier: string;
  notes?: string;
}

interface OperatorData {
  operator: Operator;
  rankings: Ranking[];
}

const tierColors: Record<string, string> = {
  EX: 'var(--tier-ex)',
  S: 'var(--tier-s)',
  A: 'var(--tier-a)',
  B: 'var(--tier-b)',
  C: 'var(--tier-c)',
  D: 'var(--tier-d)',
  F: 'var(--tier-f)',
  'N/A': '#808080',
};

const OperatorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OperatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadOperator(id);
    }
  }, [id]);

  const loadOperator = async (operatorId: string) => {
    try {
      const response = await fetch(`/api/operators/${encodeURIComponent(operatorId)}`);
      if (!response.ok) {
        throw new Error('Failed to load operator');
      }
      const operatorData = await response.json() as OperatorData;
      setData(operatorData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operator');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading operator...</div>;
  }

  if (error || !data) {
    return <div className="error">{error || 'Operator not found'}</div>;
  }

  const { operator, rankings } = data;

  return (
    <div className="operator-page">
      <Link to="/" className="back-button">
        ← Back to Home
      </Link>

      <div className="operator-header">
        <div className="operator-image-container">
          <img
            src={operator.profileImage || `/images/operators/${operator.id}.png`}
            alt={operator.name}
            className="operator-profile-image"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target && !target.src.includes('data:image')) {
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
              }
            }}
          />
        </div>
        <div className="operator-info">
          <h1 className="operator-name">{operator.name}</h1>
          <div className="operator-meta">
            <div className="operator-rarity">
              <Stars rarity={operator.rarity} size="large" />
            </div>
            <div className="operator-class">{operator.class}</div>
            <div className={`operator-global ${operator.global ? 'global-available' : 'global-unavailable'}`}>
              {operator.global ? '✓ Global Available' : '✗ Global Unavailable'}
            </div>
          </div>
        </div>
      </div>

      {rankings.length > 0 ? (
        <div className="rankings-section">
          <h2>Rankings</h2>
          <div className="rankings-grid">
            {rankings.map((ranking, index) => (
              <div key={index} className="ranking-card">
                <div className="ranking-niche">{ranking.niche}</div>
                <div
                  className="ranking-tier"
                  style={{ backgroundColor: tierColors[ranking.tier] || '#808080' }}
                >
                  {ranking.tier}
                </div>
                {ranking.notes && (
                  <div className="ranking-notes">{ranking.notes}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="no-rankings">
          <p>This operator is not ranked in any niche.</p>
        </div>
      )}
    </div>
  );
};

export default OperatorPage;

