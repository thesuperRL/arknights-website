import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { getRarityClass } from '../utils/rarityUtils';
import { getOperatorName } from '../utils/operatorNameUtils';

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
  rating: string;
  note: string;
  level: string; // "" (always), "E2" (elite 2), or module code
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
  const { language } = useLanguage();
  const { user } = useAuth();
  const [operatorList, setOperatorList] = useState<OperatorList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (niche) {
      loadOperatorList(niche);
    }
    loadOwnedOperators();
  }, [niche]);

  const loadOwnedOperators = async () => {
    if (!user) {
      setOwnedOperators(new Set());
      return;
    }

    try {
      const response = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setOwnedOperators(new Set(data.ownedOperators || []));
      }
    } catch (err) {
      console.error('Error loading owned operators:', err);
    }
  };

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

  // Rating order: SS > S > A > B > C > D > F
  const ratingOrder: Record<string, number> = { 'SS': 0, 'S': 1, 'A': 2, 'B': 3, 'C': 4, 'D': 5, 'F': 6 };
  
  // Sort operators: by rating (SS first), then by rarity (higher first), then by global status, then by name
  const sortedOperators = [...operatorList.operators].sort((a, b) => {
    // Sort by rating first
    const aRating = ratingOrder[a.rating] ?? 999;
    const bRating = ratingOrder[b.rating] ?? 999;
    if (aRating !== bRating) {
      return aRating - bRating;
    }
    // Then by rarity (higher first)
    const aRarity = a.operator?.rarity ?? 0;
    const bRarity = b.operator?.rarity ?? 0;
    if (aRarity !== bRarity) {
      return bRarity - aRarity;
    }
    // Then by global status (global operators first)
    const aGlobal = a.operator?.global ?? false;
    const bGlobal = b.operator?.global ?? false;
    if (aGlobal !== bGlobal) {
      return aGlobal ? -1 : 1;
    }
    // Finally by name
    const aName = a.operator?.name ?? a.operatorId;
    const bName = b.operator?.name ?? b.operatorId;
    return aName.localeCompare(bName);
  });

  return (
    <div className="niche-list-page">
      <div className="niche-list-header">
        <Link to="/tier-lists" className="back-button">
          ← Back to Tier Lists
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
          {sortedOperators.map((entry, index) => {
            const rarityClass = entry.operator ? getRarityClass(entry.operator.rarity) : '';
            const isOwned = entry.operator ? ownedOperators.has(entry.operator.id) : false;
            // Create unique key that includes rating and level to handle duplicate operator IDs
            const uniqueKey = `${entry.operatorId}-${entry.rating}-${entry.level || 'base'}-${index}`;
            return (
            <div 
              key={uniqueKey} 
              className={`operator-card ${rarityClass} ${!entry.operator?.global ? 'non-global' : ''} ${!isOwned ? 'unowned' : ''}`}
              title={entry.note || undefined}
            >
              {entry.operator ? (
                <>
                  <div className={`operator-rating rating-${entry.rating}`}>{entry.rating}</div>
                  <Link to={`/operator/${entry.operator.id}`} className="operator-image-link">
                    <div className="operator-image-container">
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
                      {entry.level && entry.level.trim() !== '' && (
                        <div className="operator-level-badge-overlay">
                          {entry.level === 'E2' ? (
                            <div className="operator-e2-badge">E2</div>
                          ) : (
                            <img
                              src={`/images/modules/${entry.level}_module.png`}
                              alt={entry.level}
                              className="operator-module-badge"
                              onError={(e) => {
                                // Hide badge if image doesn't exist
                                const target = e.target as HTMLImageElement;
                                if (target && target.parentElement) {
                                  target.parentElement.style.display = 'none';
                                }
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                  <Link to={`/operator/${entry.operator.id}`} className="operator-name-link">
                    <div className="operator-name">{getOperatorName(entry.operator, language)}</div>
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
                  <div className={`operator-rating rating-${entry.rating}`}>{entry.rating}</div>
                  <div className="operator-name">{entry.operatorId}</div>
                  <div className="operator-class">Operator not found</div>
                </>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default NicheListPage;

