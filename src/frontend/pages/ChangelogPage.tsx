import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import './ChangelogPage.css';

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
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'upgrades' | 'downgrades' | 'additions' | 'removals'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    apiFetch('/api/changelog')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load changelog');
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
  }, []);

  const tierOrder: Record<string, number> = { 'SS': 5, 'S': 4, 'A': 3, 'B': 2, 'C': 1 };

  const getChangeType = (entry: ChangelogEntry): 'upgrade' | 'downgrade' | 'addition' | 'removal' => {
    if (!entry.oldTier) return 'addition';
    if (!entry.newTier) return 'removal';
    const oldRank = tierOrder[entry.oldTier] || 0;
    const newRank = tierOrder[entry.newTier] || 0;
    return newRank > oldRank ? 'upgrade' : 'downgrade';
  };

  const CHANGELOG_CUTOFF = new Date('2026-02-22T01:30:00').getTime();

  const filteredEntries = entries.filter(entry => {
    const time = entry.time || '20:00';
    const entryMs = new Date(entry.date + 'T' + time + ':00').getTime();
    if (entryMs <= CHANGELOG_CUTOFF) return false;

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
          <span className="change-label addition">NEW</span>
          <span className={getTierBadgeClass(entry.newTier)}>{entry.newTier}</span>
        </span>
      );
    }
    
    if (changeType === 'removal') {
      return (
        <span className="tier-change">
          <span className={getTierBadgeClass(entry.oldTier)}>{entry.oldTier}</span>
          <span className="change-label removal">REMOVED</span>
        </span>
      );
    }
    
    return (
      <span className="tier-change">
        <span className={getTierBadgeClass(entry.oldTier)}>{entry.oldTier}</span>
        <span className={`change-arrow ${arrowClass}`}>→</span>
        <span className={getTierBadgeClass(entry.newTier)}>{entry.newTier}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <div className="changelog-page">
        <div className="changelog-header">
          <Link to="/" className="back-button">← Back to Home</Link>
          <h1>Tier Changelog</h1>
        </div>
        <div className="loading">Loading changelog...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="changelog-page">
        <div className="changelog-header">
          <Link to="/" className="back-button">← Back to Home</Link>
          <h1>Tier Changelog</h1>
        </div>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="changelog-page">
      <div className="changelog-header">
        <Link to="/" className="back-button">← Back to Home</Link>
        <h1>Tier Changelog</h1>
        <p className="changelog-intro">
          History of operator tier changes from <code>data/tier-changelog.json</code>. Entries are
          recorded when niche lists change (run <code>npm run update:ranked</code> or commit). Add
          justifications in the JSON file before committing.
        </p>
      </div>

      <div className="changelog-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search operator or niche..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={filter === 'upgrades' ? 'active upgrade' : ''} 
            onClick={() => setFilter('upgrades')}
          >
            Upgrades
          </button>
          <button 
            className={filter === 'downgrades' ? 'active downgrade' : ''} 
            onClick={() => setFilter('downgrades')}
          >
            Downgrades
          </button>
          <button 
            className={filter === 'additions' ? 'active addition' : ''} 
            onClick={() => setFilter('additions')}
          >
            Additions
          </button>
          <button 
            className={filter === 'removals' ? 'active removal' : ''} 
            onClick={() => setFilter('removals')}
          >
            Removals
          </button>
        </div>
      </div>

      <div className="changelog-content">
        {sortedEntries.length === 0 ? (
          <div className="no-changes">
            {entries.length === 0 
              ? 'No tier changes recorded yet.' 
              : 'No changes match your filter.'}
          </div>
        ) : (
          <div className="changelog-table-wrap">
            <table className="changelog-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Operator</th>
                  <th>Change</th>
                  <th>Niche</th>
                  <th>Level</th>
                  <th>Type</th>
                  <th>Justification</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, idx) => (
                  <tr key={`${entry.operatorId}-${entry.nicheFilename}-${entry.date}-${idx}`} className={`change-row ${getChangeType(entry)} ${entry.global === false ? 'non-global' : ''}`}>
                    <td className="col-date">{formatEntryDate(entry)}</td>
                    <td className="col-operator">
                      <span className={entry.global === false ? 'changelog-blur' : ''}>
                        <Link to={`/operator/${entry.operatorId}`} className="operator-name">
                          {entry.operatorName}
                        </Link>
                      </span>
                    </td>
                    <td className="col-change">{renderChangeCell(entry)}</td>
                    <td className="col-niche">
                      <Link to={`/niche-list/${entry.nicheFilename}`} className="niche-link">
                        {entry.niche}
                      </Link>
                    </td>
                    <td className="col-level">
                      {(entry.newLevel || entry.oldLevel) ? (
                        <span className="level-badge">{entry.newLevel || entry.oldLevel}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="col-type">
                      <span className={`type-pill ${getChangeType(entry)}`}>
                        {getChangeType(entry)}
                      </span>
                    </td>
                    <td className="col-justification">
                      <span className={entry.global === false ? 'changelog-blur' : ''}>
                        {entry.justification || '—'}
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
function formatEntryDate(entry: ChangelogEntry): string {
  const time = entry.time || '20:00'; // 8 PM for legacy date-only entries
  const date = new Date(entry.date + 'T' + time + ':00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) + ' at ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default ChangelogPage;
