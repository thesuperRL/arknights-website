import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import Stars from '../components/Stars';
import { getOperatorName } from '../utils/operatorNameUtils';
import { apiFetch } from '../api';
import './OperatorPage.css';

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  global: boolean;
  profileImage: string;
  niches?: string[];
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

interface NicheInstance {
  tier: string;
  level: string;
  notes?: string;
}

interface NicheRanking {
  niche: string;
  nicheFilename?: string;
  instances: NicheInstance[];
}

interface SynergyEntry {
  synergy: string;
  role: string;
  groups?: string[];
  group?: string; // For backward compatibility
  filename: string;
}

interface OperatorData {
  operator: Operator;
  rankings: NicheRanking[];
  synergies?: SynergyEntry[];
}

// No tier colors needed anymore since we removed the tier system

const OperatorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
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
      const response = await apiFetch(`/api/operators/${encodeURIComponent(operatorId)}`);
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

  const { operator, rankings = [], synergies = [] } = data;

  return (
    <div className="operator-page">
      <Link to="/all-operators" className="back-button">
        ← Back to All Operators
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
          <h1 className="operator-name">{getOperatorName(operator, language)}</h1>
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
          <h2>Niches</h2>
          <div className="rankings-grid">
            {rankings.map((nicheRanking, nicheIndex) => {
              // Use nicheFilename if available, otherwise fall back to generated filename
              const nicheFilename = nicheRanking.nicheFilename || nicheRanking.niche.toLowerCase().replace(/\s+/g, '-');
              
              return (
                <div key={nicheIndex} className="niche-group-card">
                  <Link to={`/niche-list/${encodeURIComponent(nicheFilename)}`} className="ranking-niche-link">
                    <div className="ranking-niche">{nicheRanking.niche}</div>
                  </Link>
                  <div className="niche-instances">
                    {(nicheRanking.instances || []).map((instance, instanceIndex) => {
                      // Don't show tier for special lists (Unconventional Niches, Free Operators, etc.)
                      const isSpecialList = ['Unconventional Niches', 'Free Operators', 'Global Range Operators', 'Good Low-Rarity Operators'].includes(nicheRanking.niche);
                      
                      return (
                      <div key={instanceIndex} className="niche-instance">
                        {instance.tier && !isSpecialList && (
                          <div className={`ranking-tier tier-${instance.tier}`}>{instance.tier}</div>
                        )}
                        {instance.level && instance.level.trim() !== '' && (
                          <div className="instance-level-badge">
                            {instance.level === 'E2' ? (
                              <img
                                src="/images/E2.png"
                                alt="E2"
                                className="level-badge-image"
                              />
                            ) : (
                              <img
                                src={`/images/modules/${instance.level}_module.png`}
                                alt={instance.level}
                                className="level-badge-image"
                                onError={(e) => {
                                  // Fallback to text if image doesn't exist
                                  const target = e.target as HTMLImageElement;
                                  if (target && target.parentElement) {
                                    target.parentElement.textContent = `M:${instance.level}`;
                                  }
                                }}
                              />
                            )}
                          </div>
                        )}
                        {instance.notes && (
                          <div className="ranking-notes">{instance.notes}</div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="no-rankings">
          <p>This operator is not listed in any niche.</p>
        </div>
      )}

      {synergies.length > 0 && (
        <div className="synergies-section">
          <h2>Synergies</h2>
          <div className="synergies-grid">
            {synergies.map((synergyEntry, index) => (
              <div key={index} className="synergy-card">
                <Link to={`/synergy/${encodeURIComponent(synergyEntry.filename)}`} className="synergy-name-link">
                  <div className="synergy-name">{synergyEntry.synergy}</div>
                </Link>
                <div className={`synergy-role role-${synergyEntry.role}`}>
                  {synergyEntry.role === 'core' ? 'Core' : 'Optional'}
                </div>
                <div className="synergy-groups">
                  {(() => {
                    // Handle both new format (groups) and old format (group) for backward compatibility
                    const groups = synergyEntry.groups || (synergyEntry.group ? [synergyEntry.group] : []);
                    return groups.map((group, groupIndex) => (
                      <span key={groupIndex} className="synergy-group">
                        {group}
                        {groupIndex < groups.length - 1 && ', '}
                      </span>
                    ));
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorPage;

