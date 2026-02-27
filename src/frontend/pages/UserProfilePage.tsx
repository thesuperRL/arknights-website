import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Stars from '../components/Stars';
import { getRarityClass } from '../utils/rarityUtils';
import { getOperatorName } from '../utils/operatorNameUtils';
import { apiFetch, getImageUrl } from '../api';
import { useTranslation } from '../translations';
import '../components/OperatorCardCollection.css';
import './UserProfilePage.css';

interface UserData {
  email: string;
  nickname: string;
  ownedOperators: string[];
  wantToUse?: string[];
}

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
  global: boolean;
  niches?: string[];
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

const UserProfilePage: React.FC = () => {
  const { logout: authLogout } = useAuth();
  const { language } = useLanguage();
  const { t, translateClass, vocab, interpolate } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [operators, setOperators] = useState<Record<string, Operator>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRarity, setFilterRarity] = useState<number | null>(null);
  const [filterClass, setFilterClass] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState('');
  const [addFilterRarity, setAddFilterRarity] = useState<number | null>(null);
  const [addFilterClass, setAddFilterClass] = useState<string | null>(null);
  const [raiseRecommendation, setRaiseRecommendation] = useState<{
    recommendedOperatorId: string;
    score: number;
    operator: { id: string; name: string; class: string; rarity: number; profileImage: string };
  } | null>(null);

  useEffect(() => {
    loadUserData();
    loadAllOperators();
  }, []);

  useEffect(() => {
    if (!user) {
      setRaiseRecommendation(null);
      return;
    }
    let cancelled = false;
    apiFetch('/api/profile/raise-recommendation')
      .then((res) => (res.ok ? res.json() : { recommendedOperatorId: null, operator: null }))
      .then((data) => {
        if (!cancelled && data?.operator) {
          setRaiseRecommendation({
            recommendedOperatorId: data.recommendedOperatorId,
            score: data.score ?? 0,
            operator: data.operator
          });
        } else if (!cancelled) {
          setRaiseRecommendation(null);
        }
      })
      .catch(() => {
        if (!cancelled) setRaiseRecommendation(null);
      });
    return () => { cancelled = true; };
  }, [user?.email, user?.ownedOperators?.length, user?.wantToUse?.length]);

  const loadUserData = async () => {
    try {
      const response = await apiFetch('/api/auth/user');
      if (response.status === 401) {
        navigate('/login');
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to load user data');
      }
      const data = await response.json();
      setUser(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const loadAllOperators = async () => {
    try {
      const rarities = [1, 2, 3, 4, 5, 6];
      const allOperators: Record<string, Operator> = {};

      for (const rarity of rarities) {
        const response = await apiFetch(`/api/operators/rarity/${rarity}`);
        if (response.ok) {
          const operators = await response.json() as Record<string, Operator>;
          Object.assign(allOperators, operators);
        }
      }

      setOperators(allOperators);
    } catch (err) {
      console.error('Error loading operators:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await authLogout();
      navigate('/');
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  const getFilteredOperators = () => {
    if (!user) return [];

    const owned = user.ownedOperators
      .map(id => operators[id])
      .filter(op => op !== undefined);

    return owned.filter(op => {
      if (filterRarity !== null && op.rarity !== filterRarity) return false;
      if (filterClass !== null && op.class !== filterClass) return false;
      if (searchTerm) {
        const displayName = getOperatorName(op, language);
        // Also search in all available name fields for better results
        const allNames = [
          op.name,
          op.cnName,
          op.twName,
          op.jpName,
          op.krName
        ].filter(Boolean).map(n => n!.toLowerCase());
        const searchLower = searchTerm.toLowerCase();
        const matchesDisplayName = displayName.toLowerCase().includes(searchLower);
        const matchesAnyName = allNames.some(name => name.includes(searchLower));
        if (!matchesDisplayName && !matchesAnyName) return false;
      }
      return true;
    }).sort((a, b) => {
      // Sort by raised status first (raised operators at the top)
      const aRaised = user.wantToUse?.includes(a.id) || false;
      const bRaised = user.wantToUse?.includes(b.id) || false;
      if (aRaised !== bRaised) {
        return aRaised ? -1 : 1; // raised (true) comes before not raised (false)
      }
      // Then sort by rarity (higher first), then by name
      if (a.rarity !== b.rarity) {
        return b.rarity - a.rarity;
      }
      return a.name.localeCompare(b.name);
    });
  };

  const getUniqueClasses = () => {
    if (!user) return [];
    const classes = new Set(
      user.ownedOperators
        .map(id => operators[id])
        .filter(op => op !== undefined)
        .map(op => op.class)
    );
    return Array.from(classes).sort();
  };

  const getAllUniqueClasses = () => {
    const classes = new Set(Object.values(operators).map(op => op.class));
    return Array.from(classes).sort();
  };

  const handleAddOperator = async (operatorId: string) => {
    try {
      const response = await apiFetch('/api/auth/add-operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add operator');
      }

      // Reload user data to get updated owned operators
      await loadUserData();
    } catch (err: any) {
      console.error('Error adding operator:', err);
      alert(err.message || 'Failed to add operator');
    }
  };

  const handleRemoveOperator = async (operatorId: string) => {
    try {
      const response = await apiFetch('/api/auth/remove-operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove operator');
      }

      // Reload user data to get updated owned operators
      await loadUserData();
    } catch (err: any) {
      console.error('Error removing operator:', err);
      alert(err.message || 'Failed to remove operator');
    }
  };

  const handleToggleWantToUse = async (operatorId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    try {
      console.log('Calling toggle-want-to-use API for:', operatorId);
      const response = await apiFetch('/api/auth/toggle-want-to-use', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ operatorId }),
      });

      console.log('Response status:', response.status);
      const contentType = response.headers.get('content-type');
      console.log('Response content-type:', contentType);

      // Check if response is actually JSON
      if (!contentType || !contentType.includes('application/json')) {
        // Clone the response to read it as text without consuming the original
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        console.error('Non-JSON response received:', text.substring(0, 500));
        throw new Error('Server returned non-JSON response. Make sure the backend is running and the route is correct.');
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to toggle want to use');
      }

      // Reload user data to get updated wantToUse
      await loadUserData();
    } catch (err: any) {
      console.error('Error toggling want to use:', err);
      alert(err.message || 'Failed to toggle want to use');
    }
  };

  const getAvailableOperators = () => {
    if (!user) return [];
    
    const ownedSet = new Set(user.ownedOperators);
    return Object.values(operators).filter(op => {
      if (ownedSet.has(op.id)) return false;
      if (addFilterRarity !== null && op.rarity !== addFilterRarity) return false;
      if (addFilterClass !== null && op.class !== addFilterClass) return false;
      if (addSearchTerm) {
        const displayName = getOperatorName(op, language);
        // Also search in all available name fields for better results
        const allNames = [
          op.name,
          op.cnName,
          op.twName,
          op.jpName,
          op.krName
        ].filter(Boolean).map(n => n!.toLowerCase());
        const searchLower = addSearchTerm.toLowerCase();
        const matchesDisplayName = displayName.toLowerCase().includes(searchLower);
        const matchesAnyName = allNames.some(name => name.includes(searchLower));
        if (!matchesDisplayName && !matchesAnyName) return false;
      }
      return true;
    }).sort((a, b) => {
      // Global operators come before non-global operators
      const aGlobal = a.global ?? false;
      const bGlobal = b.global ?? false;
      if (aGlobal !== bGlobal) {
        return aGlobal ? -1 : 1;
      }
      // Then sort by rarity (higher first)
      if (a.rarity !== b.rarity) {
        return b.rarity - a.rarity;
      }
      // Finally sort by name
      return a.name.localeCompare(b.name);
    });
  };

  if (loading) {
    return <div className="loading">{t('profile.loading')}</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!user) {
    return null;
  }

  const filteredOperators = getFilteredOperators();
  const uniqueClasses = getUniqueClasses();

  return (
    <div className="user-profile-page">
      <div className="profile-header">
        <div className="profile-info">
          <h1>{user.nickname}</h1>
          <div className="profile-details">
            <span className="profile-detail">
              <strong>{t('profile.operatorsLabel')}:</strong> {user.ownedOperators.length}
            </span>
            <Link to="/team-builder" className="team-builder-link">
              {t('profile.teamBuilder')}
            </Link>
          </div>
        </div>
        <div className="profile-header-center">
          {raiseRecommendation && (
            <Link
              to={`/operator/${raiseRecommendation.operator.id}`}
              className="raise-recommendation-card"
              title={t('profile.raiseRecommendationTitle')}
            >
              <span className="raise-recommendation-label">{t('profile.raiseRecommendation')}</span>
              <img
                src={getImageUrl(raiseRecommendation.operator.profileImage || `/images/operators/${raiseRecommendation.operator.id}.png`)}
                alt={getOperatorName((operators[raiseRecommendation.operator.id] ?? raiseRecommendation.operator) as Operator, language)}
                className="raise-recommendation-image"
              />
              <span className="raise-recommendation-name">{getOperatorName((operators[raiseRecommendation.operator.id] ?? raiseRecommendation.operator) as Operator, language)}</span>
              <span className="raise-recommendation-class">{translateClass(raiseRecommendation.operator.class)}</span>
              <Stars rarity={raiseRecommendation.operator.rarity} />
            </Link>
          )}
        </div>
        <button onClick={handleLogout} className="logout-button">
          {t('profile.logout')}
        </button>
      </div>

      <div className="filters">
        <div className="search-box">
          <input
            type="text"
            placeholder={t('common.searchOperators')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label>{t('common.rarity')}:</label>
          <select
            value={filterRarity || ''}
            onChange={(e) => setFilterRarity(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">{t('common.all')}</option>
            {[6, 5, 4, 3, 2, 1].map(rarity => (
              <option key={rarity} value={rarity}>{rarity}{vocab('star')}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>{t('common.class')}:</label>
          <select
            value={filterClass || ''}
            onChange={(e) => setFilterClass(e.target.value || null)}
            className="filter-select"
          >
            <option value="">{t('common.all')}</option>
            {uniqueClasses.map(className => (
              <option key={className} value={className}>{translateClass(className)}</option>
            ))}
          </select>
        </div>
        {(filterRarity !== null || filterClass !== null || searchTerm) && (
          <button
            onClick={() => {
              setFilterRarity(null);
              setFilterClass(null);
              setSearchTerm('');
            }}
            className="clear-filters"
          >
            {t('common.clearFilters')}
          </button>
        )}
        <button
          onClick={() => setShowAddModal(true)}
          className="add-operator-button"
          style={{
            padding: '0.75rem 1.5rem',
            background: 'rgba(90, 238, 144, 0.2)',
            border: '2px solid rgba(90, 238, 144, 0.4)',
            borderRadius: '8px',
            color: '#5aee90',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          {t('profile.addOperators')}
        </button>
      </div>

      {user.ownedOperators.length > 0 ? (
        <>
          <div className="operators-count">
            {interpolate(t('common.showingCount'), { count: filteredOperators.length, total: user.ownedOperators.length })}
          </div>

          <div className="operators-grid operator-cards-collection">
            {filteredOperators.length === 0 ? (
              <div className="no-results">{t('profile.noMatch')}</div>
            ) : (
              filteredOperators.map((operator) => {
                const rarityClass = getRarityClass(operator.rarity);
                return (
                <div key={operator.id} className={`operator-card ${rarityClass}`} style={{ position: 'relative' }}>
                  <Link
                    to={`/operator/${operator.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <img
                      src={getImageUrl(operator.profileImage || `/images/operators/${operator.id}.png`)}
                      alt={operator.name}
                      className="operator-image"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target && !target.src.includes('data:image')) {
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
                        }
                      }}
                      loading="lazy"
                    />
                    <div className="operator-info">
                      <div className="operator-name">{getOperatorName(operator, language)}</div>
                      <div className="operator-meta">
                        <Stars rarity={operator.rarity} size="small" />
                        <span className="operator-class">{translateClass(operator.class)}</span>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemoveOperator(operator.id);
                    }}
                    className="remove-operator-button"
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      background: 'rgba(255, 107, 107, 0.8)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10
                    }}
                    title="Remove operator"
                  >
                    ×
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleToggleWantToUse(operator.id, e);
                    }}
                    style={{
                      position: 'absolute',
                      bottom: '0.5rem',
                      right: '0.5rem',
                      background: user.wantToUse?.includes(operator.id) 
                        ? 'rgba(90, 238, 144, 0.8)' 
                        : 'rgba(255, 255, 255, 0.2)',
                      border: `2px solid ${user.wantToUse?.includes(operator.id) 
                        ? 'rgba(90, 238, 144, 1)' 
                        : 'rgba(255, 255, 255, 0.4)'}`,
                      borderRadius: '4px',
                      padding: '0.44rem 0.81rem',
                      fontSize: '16px',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.38rem',
                      boxShadow: user.wantToUse?.includes(operator.id) 
                        ? '0 2px 8px rgba(90, 238, 144, 0.4)' 
                        : 'none',
                      transform: user.wantToUse?.includes(operator.id) 
                        ? 'translateY(-2px)' 
                        : 'none'
                    }}
                    title={user.wantToUse?.includes(operator.id) ? t('profile.operatorIsRaisedTitle') : t('profile.markAsRaisedTitle')}
                  >
                    {user.wantToUse?.includes(operator.id) ? t('profile.raisedLabel') : t('profile.markRaisedShort')}
                  </button>
                </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="no-results" style={{ padding: '3rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>No Operators Yet</h2>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
            Start building your collection by adding operators!
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '0.75rem 2rem',
              background: 'rgba(90, 238, 144, 0.2)',
              border: '2px solid rgba(90, 238, 144, 0.4)',
              borderRadius: '8px',
              color: '#5aee90',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            Add Your First Operator
          </button>
        </div>
      )}

      {showAddModal && (
        <div 
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className="modal-content add-operators-modal"
            style={{
              background: 'rgba(22, 33, 62, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: '15px',
              padding: '2rem',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: 'var(--text-light)', margin: 0 }}>{t('profile.addOperatorsModalTitle')}</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-light)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0',
                  width: '30px',
                  height: '30px'
                }}
              >
                ×
              </button>
            </div>

            <div className="filters" style={{ marginBottom: '1.5rem' }}>
              <div className="search-box">
                <input
                  type="text"
                  placeholder={t('common.searchOperators')}
                  value={addSearchTerm}
                  onChange={(e) => setAddSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="filter-group">
                <label>{t('common.rarity')}:</label>
                <select
                  value={addFilterRarity || ''}
                  onChange={(e) => setAddFilterRarity(e.target.value ? parseInt(e.target.value) : null)}
                  className="filter-select"
                >
                  <option value="">{t('common.all')}</option>
                  {[6, 5, 4, 3, 2, 1].map(rarity => (
                    <option key={rarity} value={rarity}>{rarity}{vocab('star')}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>{t('common.class')}:</label>
                <select
                  value={addFilterClass || ''}
                  onChange={(e) => setAddFilterClass(e.target.value || null)}
                  className="filter-select"
                >
                  <option value="">{t('common.all')}</option>
                  {getAllUniqueClasses().map(className => (
                    <option key={className} value={className}>{translateClass(className)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="operators-grid operator-cards-collection add-operators-modal-grid" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {getAvailableOperators().length === 0 ? (
                <div className="no-results">{t('profile.addModalNoResults')}</div>
              ) : (
                getAvailableOperators().map((operator) => {
                  const rarityClass = getRarityClass(operator.rarity);
                  return (
                  <div
                    key={operator.id}
                    className={`operator-card ${!operator.global ? 'non-global' : ''} ${rarityClass}`}
                    style={{ position: 'relative', cursor: 'pointer' }}
                    onClick={() => handleAddOperator(operator.id)}
                  >
                    <img
                      src={getImageUrl(operator.profileImage || `/images/operators/${operator.id}.png`)}
                      alt={operator.name}
                      className="operator-image"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target && !target.src.includes('data:image')) {
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
                        }
                      }}
                      loading="lazy"
                    />
                    <div className="operator-info">
                      <div className="operator-name">{getOperatorName(operator, language)}</div>
                      <div className="operator-meta">
                        <Stars rarity={operator.rarity} size="small" />
                        <span className="operator-class">{translateClass(operator.class)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="add-operator-button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddOperator(operator.id);
                      }}
                      title={t('integratedStrategies.addOperator')}
                      aria-label={t('integratedStrategies.addOperator')}
                    >
                      +
                    </button>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfilePage;

