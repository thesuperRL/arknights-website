import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import './TierListPage.css';

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
}

interface TierListOperator {
  operatorId: string;
  notes?: string;
  operator: Operator | null;
}

interface TierList {
  niche: string;
  description: string;
  tiers: {
    [key: string]: TierListOperator[];
  };
}

const tierRanks = ['EX', 'S', 'A', 'B', 'C', 'D', 'F'] as const;
const tierColors: Record<string, string> = {
  EX: 'ex',
  S: 's',
  A: 'a',
  B: 'b',
  C: 'c',
  D: 'd',
  F: 'f',
};

const TierListPage: React.FC = () => {
  const { niche } = useParams<{ niche: string }>();
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (niche) {
      loadTierList(niche);
    }
  }, [niche]);

  const loadTierList = async (nicheName: string) => {
    try {
      const response = await fetch(`/api/tier-lists/${encodeURIComponent(nicheName)}`);
      if (!response.ok) {
        throw new Error('Failed to load tier list');
      }
      const data = await response.json() as TierList;
      setTierList(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tier list');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading tier list...</div>;
  }

  if (error || !tierList) {
    return <div className="error">{error || 'Tier list not found'}</div>;
  }

  return (
    <div className="tier-list-page">
      <div className="tier-list-header">
        <Link to="/" className="back-button">
          ← Back to Home
        </Link>
        <h1>{tierList.niche}</h1>
        <p>{tierList.description || ''}</p>
      </div>

      <div className="tier-list-container">
        {tierRanks.map((rank) => {
          const operators = tierList.tiers[rank] || [];
          const colorClass = tierColors[rank] || 'f';

          // Skip tiers with no operators
          if (operators.length === 0) {
            return null;
          }

          return (
            <div key={rank} className="tier-section">
              <div className="tier-header">
                <div className={`tier-badge ${colorClass}`}>{rank}</div>
                <div className="tier-name">Tier {rank}</div>
              </div>
              <div className="operators-grid">
                {operators.map((op, index) => (
                  <div key={`${op.operatorId}-${index}`} className="operator-card">
                    {op.operator ? (
                      <>
                        <img
                          src={op.operator.profileImage || `/images/operators/${op.operator.id || op.operatorId}.png`}
                          alt={op.operator.name}
                          className="operator-image"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (target && !target.src.includes('data:image')) {
                              // Show a placeholder SVG if image doesn't exist
                              target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
                              target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                            }
                          }}
                          loading="lazy"
                        />
                        <div className="operator-name">{op.operator.name}</div>
                        <div className="operator-class">
                          {op.operator.class} • {op.operator.rarity}★
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="operator-name">{op.operatorId}</div>
                        <div className="operator-class">Operator not found</div>
                      </>
                    )}
                    {op.notes && <div className="operator-notes">{op.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TierListPage;

