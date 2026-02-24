import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../translations';
import { apiFetch } from '../api';
import './ChangelogPage.css';

const SPECIAL_LIST_ROUTES: Record<string, string> = {
  'trash-operators': '/trash-operators',
  'free': '/free-operators',
  'global-range': '/global-range-operators',
  'unconventional-niches': '/unconventional-niches-operators',
  'low-rarity': '/low-rarity-operators',
};

interface ChangelogEntry {
  date: string;
  time?: string; // HH:mm; missing = 8 PM for past entries
  operatorId: string;
  operatorName: string;
  niche: string;
  nicheFilename: string;
  oldTier: string | null;
  newTier: string | null;
  oldLevel: string;
  newLevel: string;
  justification: string;
  global?: boolean;
}

const ChangelogPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { t, getNicheName } = useTranslation();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'upgrades' | 'downgrades' | 'additions' | 'removals'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [ownedOperatorIds, setOwnedOperatorIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      apiFetch('/api/auth/user')
        .then(res => res.ok ? res.json() : null)
        .then(data => setOwnedOperatorIds(new Set(data?.ownedOperators || [])))
        .catch(() => setOwnedOperatorIds(new Set()));
    } else {
      setOwnedOperatorIds(new Set());
    }
  }, [user]);

  useEffect(() => {
    apiFetch(`/api/changelog?language=${encodeURIComponent(language)}`)
      .then(res => {
        if (!res.ok) throw new Error(t('changelog.loadError'));
        return res.json();
      })
      .then(data => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [language]);

  const tierOrder: Record<string, number> = { 'SS': 5, 'S': 4, 'A': 3, 'B': 2, 'C': 1 };

  const getChangeType = (entry: ChangelogEntry): 'upgrade' | 'downgrade' | 'addition' | 'removal' => {
    if (!entry.oldTier) return 'addition';
    if (!entry.newTier) return 'removal';
    const oldRank = tierOrder[entry.oldTier] || 0;
    const newRank = tierOrder[entry.newTier] || 0;
    return newRank > oldRank ? 'upgrade' : 'downgrade';
  };

  // Only entries from tier-changelog.json are shown; no extra entries and no date cutoff
  const filteredEntries = entries.filter(entry => {
    if (filter !== 'all') {
      const changeType = getChangeType(entry);
      if (filter === 'upgrades' && changeType !== 'upgrade') return false;
      if (filter === 'downgrades' && changeType !== 'downgrade') return false;
      if (filter === 'additions' && changeType !== 'addition') return false;
      if (filter === 'removals' && changeType !== 'removal') return false;
    }
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        entry.operatorName.toLowerCase().includes(search) ||
        entry.operatorId.toLowerCase().includes(search) ||
        entry.niche.toLowerCase().includes(search) ||
        entry.nicheFilename.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Sort by date desc, then time desc (missing = 20:00), then operator name
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const timeA = a.time || '20:00';
    const timeB = b.time || '20:00';
    const timeCmp = timeB.localeCompare(timeA);
    if (timeCmp !== 0) return timeCmp;
    return a.operatorName.localeCompare(b.operatorName);
  });

  const getTierBadgeClass = (tier: string | null): string => {
    if (!tier) return 'tier-badge tier-none';
    return `tier-badge tier-${tier.toLowerCase()}`;
  };

  const renderChangeCell = (entry: ChangelogEntry) => {
    const changeType = getChangeType(entry);
    const arrowClass = changeType === 'upgrade' ? 'arrow-upgrade' : 
                       changeType === 'downgrade' ? 'arrow-downgrade' : 
                       changeType === 'addition' ? 'arrow-addition' : 'arrow-removal';
    
    if (changeType === 'addition') {
      return (
        <span className="tier-change">
          <span className="change-label addition">{t('changelog.labelNew')}</span>
          <span className={getTierBadgeClass(entry.newTier)}>{entry.newTier}</span>
        </span>
      );
    }
    
    if (changeType === 'removal') {
      return (
        <span className="tier-change">
          <span className={getTierBadgeClass(entry.oldTier)}>{entry.oldTier}</span>
          <span className="change-label removal">{t('changelog.labelRemoved')}</span>
        </span>
      );
    }
    
    return (
      <span className="tier-change">
        <span className={getTierBadgeClass(entry.oldTier)}>{entry.oldTier}</span>
        <span className={`change-arrow ${arrowClass}`} aria-hidden="true">&rarr;</span>
        <span className={getTierBadgeClass(entry.newTier)}>{entry.newTier}</span>
      </span>
    );
  };

  const locale = language === 'cn' ? 'zh-CN' : language === 'tw' ? 'zh-TW' : 'en-US';

  if (loading) {
    return (
      <div className="changelog-page">
        <div className="changelog-header">
          <Link to="/" className="back-button">{t('changelog.backToHome')}</Link>
          <h1>{t('changelog.pageTitle')}</h1>
        </div>
        <div className="loading">{t('changelog.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="changelog-page">
        <div className="changelog-header">
          <Link to="/" className="back-button">{t('changelog.backToHome')}</Link>
          <h1>{t('changelog.pageTitle')}</h1>
        </div>
        <div className="error">{t('changelog.errorPrefix')}: {error}</div>
      </div>
    );
  }

  return (
    <div className="changelog-page">
      <div className="changelog-header">
        <Link to="/" className="back-button">{t('changelog.backToHome')}</Link>
        <h1>{t('changelog.pageTitle')}</h1>
        <p className="changelog-intro">
          {t('changelog.intro')}
        </p>
      </div>

      <div className="changelog-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder={t('changelog.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            {t('changelog.filterAll')}
          </button>
          <button 
            className={filter === 'upgrades' ? 'active upgrade' : ''} 
            onClick={() => setFilter('upgrades')}
          >
            {t('changelog.filterUpgrades')}
          </button>
          <button 
            className={filter === 'downgrades' ? 'active downgrade' : ''} 
            onClick={() => setFilter('downgrades')}
          >
            {t('changelog.filterDowngrades')}
          </button>
          <button 
            className={filter === 'additions' ? 'active addition' : ''} 
            onClick={() => setFilter('additions')}
          >
            {t('changelog.filterAdditions')}
          </button>
          <button 
            className={filter === 'removals' ? 'active removal' : ''} 
            onClick={() => setFilter('removals')}
          >
            {t('changelog.filterRemovals')}
          </button>
        </div>
      </div>

      <div className="changelog-content">
        {sortedEntries.length === 0 ? (
          <div className="no-changes">
            {entries.length === 0 
              ? t('changelog.noChanges') 
              : t('changelog.noMatch')}
          </div>
        ) : (
          <div className="changelog-table-wrap">
            <table className="changelog-table">
              <thead>
                <tr>
                  <th>{t('changelog.colDate')}</th>
                  <th>{t('changelog.colOperator')}</th>
                  <th>{t('changelog.colChange')}</th>
                  <th>{t('changelog.colNiche')}</th>
                  <th>{t('changelog.colLevel')}</th>
                  <th>{t('changelog.colType')}</th>
                  <th>{t('changelog.colJustification')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, idx) => (
                  <tr key={`${entry.operatorId}-${entry.nicheFilename}-${entry.date}-${idx}`} className={`change-row ${getChangeType(entry)} ${entry.global === false && !ownedOperatorIds.has(entry.operatorId) ? 'non-global' : ''}`}>
                    <td className="col-date">{formatEntryDate(entry, locale, t('changelog.dateAt'))}</td>
                    <td className="col-operator">
                      <span className={entry.global === false ? 'changelog-blur' : ''}>
                        <Link to={`/operator/${entry.operatorId}`} className="operator-name">
                          {entry.operatorName}
                        </Link>
                      </span>
                    </td>
                    <td className="col-change">{renderChangeCell(entry)}</td>
                    <td className="col-niche">
                      <Link to={SPECIAL_LIST_ROUTES[entry.nicheFilename] ?? `/niche-list/${encodeURIComponent(entry.nicheFilename)}`} className="niche-link">
                        {getNicheName(entry.nicheFilename, entry.niche)}
                      </Link>
                    </td>
                    <td className="col-level">
                      {(entry.newLevel || entry.oldLevel) ? (
                        <span className="level-badge">{entry.newLevel || entry.oldLevel}</span>
                      ) : (
                        t('changelog.emptyCell')
                      )}
                    </td>
                    <td className="col-type">
                      <span className={`type-pill ${getChangeType(entry)}`}>
                        {t(`changelog.type${getChangeType(entry).charAt(0).toUpperCase() + getChangeType(entry).slice(1)}`)}
                      </span>
                    </td>
                    <td className="col-justification">
                      <span className={entry.global === false ? 'changelog-blur' : ''}>
                        {entry.justification || t('changelog.emptyCell')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/** Past entries without time are shown as 8:00 PM. */
function formatEntryDate(entry: ChangelogEntry, locale: string, dateAt: string): string {
  const time = entry.time || '20:00'; // 8 PM for legacy date-only entries
  const date = new Date(entry.date + 'T' + time + ':00');
  const hour12 = locale.startsWith('en');
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) + dateAt + date.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  });
}

export default ChangelogPage;
