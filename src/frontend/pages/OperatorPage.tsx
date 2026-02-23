import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../translations';
import Stars from '../components/Stars';
import { getOperatorName } from '../utils/operatorNameUtils';
import { apiFetch, getImageUrl } from '../api';
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

// Routes for special tier lists (not under /niche-list/:niche). Keys must match API nicheFilename.
const SPECIAL_LIST_ROUTES: Record<string, string> = {
  'trash-operators': '/trash-operators',
  'free': '/free-operators',
  'global-range': '/global-range-operators',
  'unconventional-niches': '/unconventional-niches-operators',
  'low-rarity': '/low-rarity-operators'
};

const OperatorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { t, getNicheName, translateClass } = useTranslation();
  const [data, setData] = useState<OperatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLevelOverlays, setShowLevelOverlays] = useState(false);

  useEffect(() => {
    if (id) {
      loadOperator(id, showLevelOverlays);
    }
  }, [id, showLevelOverlays]);

  const loadOperator = async (operatorId: string, allLevels: boolean = false) => {
    const isInitialLoad = !data || data.operator?.id !== operatorId;
    if (isInitialLoad) setLoading(true);
    try {
      const url = allLevels
        ? `/api/operators/${encodeURIComponent(operatorId)}?allLevels=1`
        : `/api/operators/${encodeURIComponent(operatorId)}`;
      const response = await apiFetch(url);
      if (!response.ok) {
        throw new Error(t('operatorPage.notFound'));
      }
      const operatorData = await response.json() as OperatorData;
      setData(operatorData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('operatorPage.notFound'));
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">{t('operatorPage.loading')}</div>;
  }

  if (error || !data) {
    return <div className="error">{error || t('operatorPage.notFound')}</div>;
  }

  const { operator, rankings = [], synergies = [] } = data;

  return (
    <div className="operator-page">
      <Link to="/all-operators" className="back-button">
        {t('operatorPage.backToAllOperators')}
      </Link>

      <div className="operator-header">
        <div className="operator-image-container">
          <img
            src={getImageUrl(operator.profileImage || `/images/operators/${operator.id}.png`)}
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
            <div className="operator-class">{translateClass(operator.class)}</div>
            <div className={`operator-global ${operator.global ? 'global-available' : 'global-unavailable'}`}>
              {operator.global ? t('operatorPage.globalAvailable') : t('operatorPage.globalUnavailable')}
            </div>
          </div>
        </div>
      </div>

      {rankings.length > 0 ? (
        <div className="rankings-section">
          <div className="rankings-section-header">
            <h2>{t('operatorPage.niches')}</h2>
            <label className="operator-page-toggle">
              <input
                type="checkbox"
                checked={showLevelOverlays}
                onChange={(e) => setShowLevelOverlays(e.target.checked)}
              />
              <span>{t('nicheList.showLevelBadges')}</span>
            </label>
          </div>
          <div className="rankings-grid">
            {rankings.map((nicheRanking, nicheIndex) => {
              // Use nicheFilename if available, otherwise fall back to generated filename
              const nicheFilename = nicheRanking.nicheFilename || nicheRanking.niche.toLowerCase().replace(/\s+/g, '-');
              // Special lists use their own routes; normal niches use /niche-list/:niche
              const linkTo = SPECIAL_LIST_ROUTES[nicheFilename] ?? `/niche-list/${encodeURIComponent(nicheFilename)}`;
              // API returns all instances when fetched with allLevels=1 (toggle on), peak-only otherwise.
              const instances = nicheRanking.instances || [];

              return (
                <div key={nicheIndex} className="niche-group-card">
                  <Link to={linkTo} className="ranking-niche-link">
                    <div className="ranking-niche">{getNicheName(nicheFilename, nicheRanking.niche)}</div>
                  </Link>
                  <div className="niche-instances">
                    {instances.map((instance, instanceIndex) => {
                      // Don't show tier for special lists (Unconventional Niches, Free Operators, etc.)
                      const isSpecialList = ['unconventional-niches', 'free', 'global-range', 'low-rarity', 'trash-operators'].includes(nicheFilename);
                      
                      return (
                      <div key={instanceIndex} className="niche-instance">
                        {instance.tier && !isSpecialList && (
                          <div className={`ranking-tier tier-${instance.tier}`}>{instance.tier}</div>
                        )}
                        {showLevelOverlays && instance.level && instance.level.trim() !== '' && (
                          <div className="instance-level-badge">
                            {instance.level === 'E2' ? (
                              <img
                                src={getImageUrl('/images/E2.png')}
                                alt="E2"
                                className="level-badge-image"
                              />
                            ) : (
                              <img
                                src={getImageUrl(`/images/modules/${instance.level}_module.png`)}
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
          <p>{t('operatorPage.noRankings')}</p>
        </div>
      )}

      {synergies.length > 0 && (
        <div className="synergies-section">
          <h2>{t('operatorPage.synergies')}</h2>
          <div className="synergies-grid">
            {synergies.map((synergyEntry, index) => (
              <div key={index} className="synergy-card">
                <Link to={`/synergy/${encodeURIComponent(synergyEntry.filename)}`} className="synergy-name-link">
                  <div className="synergy-name">{getNicheName(synergyEntry.filename, synergyEntry.synergy)}</div>
                </Link>
                <div className={`synergy-role role-${synergyEntry.role}`}>
                  {synergyEntry.role === 'core' ? t('operatorPage.coreRole') : t('operatorPage.optionalRole')}
                </div>
                <div className="synergy-groups">
                  {(() => {
                    // Handle both new format (groups) and old format (group) for backward compatibility
                    const groups = synergyEntry.groups || (synergyEntry.group ? [synergyEntry.group] : []);
                    return groups.map((group, groupIndex) => {
                      const label = translateClass(group).startsWith('class_') ? group : translateClass(group);
                      return (
                        <span key={groupIndex} className="synergy-group">
                          {label}
                          {groupIndex < groups.length - 1 && ', '}
                        </span>
                      );
                    });
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

