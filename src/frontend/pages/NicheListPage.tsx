import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import './NicheListPage.css';

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
  global: boolean;
}

interface OperatorListEntry {
  operatorId: string;
  note: string;
  operator: Operator | null;
}

interface OperatorList {
  niche: string;
  description: string;
  operators: OperatorListEntry[];
  relatedNiches?: string[];
}

const NicheListPage: React.FC = () => {
  const { niche } = useParams<{ niche: string }>();
  const [operatorList, setOperatorList] = useState<OperatorList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (niche) {
      loadOperatorList(niche);
    }
  }, [niche]);

  const loadOperatorList = async (nicheName: string) => {
    try {
      const response = await fetch(`/api/niche-lists/${encodeURIComponent(nicheName)}`);
      if (!response.ok) {
        throw new Error('Failed to load operator list');
      }
      const data = await response.json() as OperatorList;
      setOperatorList(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operator list');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading operator list...</div>;
  }

  if (error || !operatorList) {
    return <div className="error">{error || 'Operator list not found'}</div>;
  }

  // Sort operators: global operators first, then non-global operators
  const sortedOperators = [...operatorList.operators].sort((a, b) => {
    const aGlobal = a.operator?.global ?? false;
    const bGlobal = b.operator?.global ?? false;
    // Global operators (true) come before non-global (false)
    if (aGlobal !== bGlobal) {
      return aGlobal ? -1 : 1;
    }
    // If both have same global status, maintain original order
    return 0;
  });

  return (
    <div className="niche-list-page">
      <div className="niche-list-header">
        <Link to="/" className="back-button">
          ← Back to Home
        </Link>
        <h1>{operatorList.niche}</h1>
        <p>{operatorList.description || ''}</p>
      </div>

      {operatorList.relatedNiches && operatorList.relatedNiches.length > 0 && (
        <div className="related-niches-section">
          <h2>Related Niches</h2>
          <div className="related-niches-list">
            {operatorList.relatedNiches.map((relatedNiche) => (
              <Link
                key={relatedNiche}
                to={`/niche-list/${encodeURIComponent(relatedNiche)}`}
                className="related-niche-link"
              >
                {relatedNiche}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="niche-list-container">
        <div className="operators-grid">
          {sortedOperators.map((entry, index) => (
            <div 
              key={`${entry.operatorId}-${index}`} 
              className="operator-card"
              title={entry.note || undefined}
            >
              {entry.operator ? (
                <>
                  <Link to={`/operator/${entry.operator.id}`} className="operator-image-link">
                    <img
                      src={entry.operator.profileImage || `/images/operators/${entry.operator.id || entry.operatorId}.png`}
                      alt={entry.operator.name}
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
                  </Link>
                  <Link to={`/operator/${entry.operator.id}`} className="operator-name-link">
                    <div className="operator-name">{entry.operator.name}</div>
                  </Link>
                  <div className="operator-class">
                    {entry.operator.class} • {entry.operator.rarity}★
                  </div>
                  {entry.note && (
                    <div className="operator-note-tooltip">{entry.note}</div>
                  )}
                </>
              ) : (
                <>
                  <div className="operator-name">{entry.operatorId}</div>
                  <div className="operator-class">Operator not found</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NicheListPage;

