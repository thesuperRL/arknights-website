import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getRarityClass } from '../utils/rarityUtils';
import { getOperatorName } from '../utils/operatorNameUtils';
import { apiFetch, getImageUrl } from '../api';
import { useTranslation } from '../translations';
import '../components/OperatorCardStandard.css';

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

const AllOperatorsPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { t, vocab, translateClass, interpolate } = useTranslation();
  const [operators, setOperators] = useState<Record<string, Operator>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRarity, setFilterRarity] = useState<number | null>(null);
  const [filterClass, setFilterClass] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAllOperators();
    loadOwnedOperators();
  }, []);

  useEffect(() => {
    loadOwnedOperators();
  }, [user]);

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
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('allOperators.loadError'));
      setLoading(false);
    }
  };

  const loadOwnedOperators = async () => {
    if (!user) {
      setOwnedOperators(new Set());
      return;
    }

    try {
      const response = await apiFetch('/api/auth/user');
      if (response.ok) {
        const data = await response.json();
        setOwnedOperators(new Set(data.ownedOperators || []));
      }
    } catch (err) {
      console.error('Error loading owned operators:', err);
    }
  };


  const getFilteredOperators = () => {
    const filtered = Object.values(operators).filter(op => {
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
    });
    // Sort: first by global status (global first), then by rarity (6-star first), then by name
    return filtered.sort((a, b) => {
      // Global operators come before non-global operators
      if (a.global !== b.global) {
        return a.global ? -1 : 1; // Global (true) comes before non-global (false)
      }
      // Within same global status, sort by rarity (higher first)
      if (a.rarity !== b.rarity) {
        return b.rarity - a.rarity; // Higher rarity first
      }
      return a.name.localeCompare(b.name); // Then alphabetically
    });
  };

  const getUniqueClasses = () => {
    const classes = new Set(Object.values(operators).map(op => op.class));
    return Array.from(classes).sort();
  };

  if (loading) {
    return <div className="loading">{t('allOperators.loading')}</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  const filteredOperators = getFilteredOperators();
  const uniqueClasses = getUniqueClasses();

  return (
    <div className="all-operators-page">
      <div className="page-header">
        <h1>{t('allOperators.title')}</h1>
        <p>{interpolate(t('allOperators.browseCount'), { count: Object.keys(operators).length })}</p>
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
              <option key={rarity} value={rarity}>{rarity}★</option>
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
      </div>

      <div className="operators-count">
        {interpolate(t('common.showingCount'), { count: filteredOperators.length, total: Object.keys(operators).length })}
      </div>

      <div className="operators-grid operator-cards-standard">
        {filteredOperators.length === 0 ? (
          <div className="no-results">{t('allOperators.noMatch')}</div>
        ) : (
          filteredOperators.map((operator) => {
            const isOwned = ownedOperators.has(operator.id);
            const rarityClass = getRarityClass(operator.rarity);
            return (
            <div
              key={operator.id}
              className={`operator-card ${!operator.global && !isOwned ? 'non-global' : ''} ${rarityClass} ${!isOwned ? 'unowned' : ''}`}
            >
              <Link to={`/operator/${operator.id}`} className="operator-image-link">
                <div className="operator-image-container">
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
                </div>
              </Link>
              <Link to={`/operator/${operator.id}`} className="operator-name-link">
                <div className="operator-name">{getOperatorName(operator, language)}</div>
              </Link>
              <div className="operator-class">
                {translateClass(operator.class)} • {operator.rarity}{vocab('star')}
              </div>
              {operator.niches && operator.niches.length > 0 && (
                <div className="ranked-badge">{vocab('ranked')}</div>
              )}
              {(!operator.niches || operator.niches.length === 0) && (
                <div className="unranked-badge">{vocab('unranked')}</div>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AllOperatorsPage;

