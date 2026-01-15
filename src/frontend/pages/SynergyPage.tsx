import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { getRarityClass } from '../utils/rarityUtils';
import { getOperatorName } from '../utils/operatorNameUtils';
import './SynergyPage.css';

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
  global: boolean;
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

interface OperatorEntry {
  operatorId: string;
  level?: string; // "" (always), "E2" (elite 2), or module code
  operator: Operator | null;
}

interface Synergy {
  name: string;
  description: string;
  core: Record<string, OperatorEntry[]>;
  optional: Record<string, OperatorEntry[]>;
}

const SynergyPage: React.FC = () => {
  const { synergy } = useParams<{ synergy: string }>();
  const { language } = useLanguage();
  const { user } = useAuth();
  const [synergyData, setSynergyData] = useState<Synergy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (synergy) {
      loadSynergy(synergy);
    }
    loadOwnedOperators();
  }, [synergy]);

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

  const loadSynergy = async (synergyName: string) => {
    try {
      const response = await fetch(`/api/synergies/${encodeURIComponent(synergyName)}`);
      if (!response.ok) {
        throw new Error('Failed to load synergy');
      }
      const data = await response.json() as Synergy;
      setSynergyData(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load synergy');
      setLoading(false);
    }
  };

  // Sort operators: by rarity (higher first), then by global status, then by name
  const sortOperators = (operators: OperatorEntry[]): OperatorEntry[] => {
    return [...operators].sort((a, b) => {
      const aRarity = a.operator?.rarity ?? 0;
      const bRarity = b.operator?.rarity ?? 0;
      if (aRarity !== bRarity) {
        return bRarity - aRarity;
      }
      const aGlobal = a.operator?.global ?? false;
      const bGlobal = b.operator?.global ?? false;
      if (aGlobal !== bGlobal) {
        return aGlobal ? -1 : 1;
      }
      const aName = a.operator?.name ?? a.operatorId;
      const bName = b.operator?.name ?? b.operatorId;
      return aName.localeCompare(bName);
    });
  };

  if (loading) {
    return <div className="loading">Loading synergy...</div>;
  }

  if (error || !synergyData) {
    return <div className="error">{error || 'Synergy not found'}</div>;
  }

  const coreGroups = Object.entries(synergyData.core);
  const optionalGroups = Object.entries(synergyData.optional);

  return (
    <div className="synergy-page">
      <div className="synergy-header">
        <Link to="/synergies" className="back-button">
          ← Back to Synergies
        </Link>
        <h1>{synergyData.name}</h1>
        <p>{synergyData.description || ''}</p>
      </div>

      {coreGroups.length > 0 && (
        <div className="synergy-section">
          <h2>Core Operators</h2>
          <p className="section-description">At least one operator from each group is required</p>
          <div className="synergy-groups">
            {coreGroups.map(([groupName, operators]) => (
              <div key={groupName} className="synergy-group">
                <h3 className="group-title">{groupName}</h3>
                <div className="operators-grid">
                  {sortOperators(operators).map((entry, index) => {
                    const rarityClass = entry.operator ? getRarityClass(entry.operator.rarity) : '';
                    const isOwned = entry.operator ? ownedOperators.has(entry.operator.id) : false;
                    return (
                      <div
                        key={`${entry.operatorId}-${index}`}
                        className={`operator-card ${rarityClass} ${!entry.operator?.global ? 'non-global' : ''} ${!isOwned ? 'unowned' : ''}`}
                      >
                        {entry.operator ? (
                          <>
                            <Link to={`/operator/${entry.operator.id}`} className="operator-image-link">
                              <div className="operator-image-container">
                                <img
                                  src={entry.operator.profileImage || `/images/operators/${entry.operator.id || entry.operatorId}.png`}
                                  alt={entry.operator.name}
                                  className="operator-image"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    if (target && !target.src.includes('data:image')) {
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
                          </>
                        ) : (
                          <>
                            <div className="operator-name">{entry.operatorId}</div>
                            <div className="operator-class">Operator not found</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {optionalGroups.length > 0 && (
        <div className="synergy-section">
          <h2>Optional Operators</h2>
          <p className="section-description">Optional operators that complement the synergy</p>
          <div className="synergy-groups">
            {optionalGroups.map(([groupName, operators]) => (
              <div key={groupName} className="synergy-group">
                <h3 className="group-title">{groupName}</h3>
                <div className="operators-grid">
                  {sortOperators(operators).map((entry, index) => {
                    const rarityClass = entry.operator ? getRarityClass(entry.operator.rarity) : '';
                    const isOwned = entry.operator ? ownedOperators.has(entry.operator.id) : false;
                    return (
                      <div
                        key={`${entry.operatorId}-${index}`}
                        className={`operator-card ${rarityClass} ${!entry.operator?.global ? 'non-global' : ''} ${!isOwned ? 'unowned' : ''}`}
                      >
                        {entry.operator ? (
                          <>
                            <Link to={`/operator/${entry.operator.id}`} className="operator-image-link">
                              <div className="operator-image-container">
                                <img
                                  src={entry.operator.profileImage || `/images/operators/${entry.operator.id || entry.operatorId}.png`}
                                  alt={entry.operator.name}
                                  className="operator-image"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    if (target && !target.src.includes('data:image')) {
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
                          </>
                        ) : (
                          <>
                            <div className="operator-name">{entry.operatorId}</div>
                            <div className="operator-class">Operator not found</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SynergyPage;
