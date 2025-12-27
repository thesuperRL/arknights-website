import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Stars from '../components/Stars';
import { getRarityClass } from '../utils/rarityUtils';
import './UserProfilePage.css';

interface UserData {
  email: string;
  nickname: string;
  ownedOperators: string[];
}

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
  global: boolean;
  niches?: string[];
}

const UserProfilePage: React.FC = () => {
  const { logout: authLogout } = useAuth();
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

  useEffect(() => {
    loadUserData();
    loadAllOperators();
  }, []);

  const loadUserData = async () => {
    try {
      const response = await fetch('/api/auth/user', {
        credentials: 'include'
      });
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
        const response = await fetch(`/api/operators/rarity/${rarity}`);
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
      if (searchTerm && !op.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      // Sort by rarity (higher first), then by name
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
      const response = await fetch('/api/auth/add-operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId }),
        credentials: 'include'
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
      const response = await fetch('/api/auth/remove-operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId }),
        credentials: 'include'
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

  const getAvailableOperators = () => {
    if (!user) return [];
    
    const ownedSet = new Set(user.ownedOperators);
    return Object.values(operators).filter(op => {
      if (ownedSet.has(op.id)) return false;
      if (addFilterRarity !== null && op.rarity !== addFilterRarity) return false;
      if (addFilterClass !== null && op.class !== addFilterClass) return false;
      if (addSearchTerm && !op.name.toLowerCase().includes(addSearchTerm.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      if (a.rarity !== b.rarity) {
        return b.rarity - a.rarity;
      }
      return a.name.localeCompare(b.name);
    });
  };

  if (loading) {
    return <div className="loading">Loading profile...</div>;
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
              <strong>Operators:</strong> {user.ownedOperators.length}
            </span>
          </div>
        </div>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>

      <div className="filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search operators..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label>Rarity:</label>
          <select
            value={filterRarity || ''}
            onChange={(e) => setFilterRarity(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">All</option>
            {[6, 5, 4, 3, 2, 1].map(rarity => (
              <option key={rarity} value={rarity}>{rarity}★</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Class:</label>
          <select
            value={filterClass || ''}
            onChange={(e) => setFilterClass(e.target.value || null)}
            className="filter-select"
          >
            <option value="">All</option>
            {uniqueClasses.map(className => (
              <option key={className} value={className}>{className}</option>
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
            Clear Filters
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
          + Add Operators
        </button>
      </div>

      {user.ownedOperators.length > 0 ? (
        <>
          <div className="operators-count">
            Showing {filteredOperators.length} of {user.ownedOperators.length} operators
          </div>

          <div className="operators-grid">
            {filteredOperators.length === 0 ? (
              <div className="no-results">No operators found matching your filters.</div>
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
                      src={operator.profileImage || `/images/operators/${operator.id}.png`}
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
                      <div className="operator-name">{operator.name}</div>
                      <div className="operator-meta">
                        <Stars rarity={operator.rarity} size="small" />
                        <span className="operator-class">{operator.class}</span>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
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
            className="modal-content"
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
              <h2 style={{ color: 'var(--text-light)', margin: 0 }}>Add Operators</h2>
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
                  placeholder="Search operators..."
                  value={addSearchTerm}
                  onChange={(e) => setAddSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="filter-group">
                <label>Rarity:</label>
                <select
                  value={addFilterRarity || ''}
                  onChange={(e) => setAddFilterRarity(e.target.value ? parseInt(e.target.value) : null)}
                  className="filter-select"
                >
                  <option value="">All</option>
                  {[6, 5, 4, 3, 2, 1].map(rarity => (
                    <option key={rarity} value={rarity}>{rarity}★</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Class:</label>
                <select
                  value={addFilterClass || ''}
                  onChange={(e) => setAddFilterClass(e.target.value || null)}
                  className="filter-select"
                >
                  <option value="">All</option>
                  {getAllUniqueClasses().map(className => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="operators-grid" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {getAvailableOperators().length === 0 ? (
                <div className="no-results">No operators found.</div>
              ) : (
                getAvailableOperators().map((operator) => {
                  const rarityClass = getRarityClass(operator.rarity);
                  return (
                  <div 
                    key={operator.id} 
                    className={`operator-card ${!operator.global ? 'non-global' : ''} ${rarityClass}`} 
                    style={{ position: 'relative' }}
                  >
                    <img
                      src={operator.profileImage || `/images/operators/${operator.id}.png`}
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
                      <div className="operator-name">{operator.name}</div>
                      <div className="operator-meta">
                        <Stars rarity={operator.rarity} size="small" />
                        <span className="operator-class">{operator.class}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        handleAddOperator(operator.id);
                        setShowAddModal(false);
                      }}
                      style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        background: 'rgba(90, 238, 144, 0.8)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10
                      }}
                      title="Add operator"
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

