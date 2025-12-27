import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getOperatorName } from '../utils/operatorNameUtils';
import { getRarityClass } from '../utils/rarityUtils';
import Stars from '../components/Stars';
import './TeamBuilderPage.css';

interface NicheRange {
  min: number;
  max: number;
}

interface TeamPreferences {
  requiredNiches: Record<string, NicheRange>; // Niche filename -> range of operators
  preferredNiches: Record<string, NicheRange>; // Niche filename -> range of operators
  prioritizeRarity?: boolean;
  allowDuplicates?: boolean;
}

interface TeamMember {
  operatorId: string;
  operator: any;
  niches: string[];
  primaryNiche?: string;
}

interface TeamResult {
  team: TeamMember[];
  coverage: Record<string, number>;
  missingNiches: string[];
  score: number;
}

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

const TeamBuilderPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [preferences, setPreferences] = useState<TeamPreferences | null>(null);
  const [allNiches, setAllNiches] = useState<Array<{filename: string; displayName: string}>>([]);
  const [nicheFilenameMap, setNicheFilenameMap] = useState<Record<string, string>>({});
  const [teamResult, setTeamResult] = useState<TeamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRequiredNiches, setShowRequiredNiches] = useState(false);
  const [showPreferredNiches, setShowPreferredNiches] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);

  useEffect(() => {
    if (user) {
      loadPreferences();
      loadNicheLists();
    }
  }, [user]);

  const migratePreferences = (prefs: any): TeamPreferences => {
    // Create a new object to avoid mutating the original
    const migrated: any = { ...prefs };
    
    // Migrate from old format (arrays or single numbers) to new format (ranges with filenames)
    if (Array.isArray(prefs.requiredNiches)) {
      const requiredNiches: Record<string, NicheRange> = {};
      for (const niche of prefs.requiredNiches) {
        // Convert display name to filename
        const filename = Object.keys(nicheFilenameMap).find(f => nicheFilenameMap[f] === niche) 
          || niche.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
        requiredNiches[filename] = { min: 1, max: 1 }; // Default to 1 operator per niche
      }
      migrated.requiredNiches = requiredNiches;
    } else if (prefs.requiredNiches && typeof prefs.requiredNiches === 'object') {
      // Migrate from display names to filenames and from numbers to ranges
      const requiredNiches: Record<string, NicheRange> = {};
      for (const [key, value] of Object.entries(prefs.requiredNiches)) {
        // Check if key is a display name (contains spaces or slashes) or already a filename
        const filename = Object.keys(nicheFilenameMap).find(f => nicheFilenameMap[f] === key)
          || (key.includes(' ') || key.includes('/') ? key.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_') : key);
        
        // Convert number to range if needed
        if (typeof value === 'number') {
          requiredNiches[filename] = { min: value, max: value };
        } else if (value && typeof value === 'object' && 'min' in value && 'max' in value) {
          requiredNiches[filename] = value as NicheRange;
        } else {
          requiredNiches[filename] = { min: 1, max: 1 };
        }
      }
      migrated.requiredNiches = requiredNiches;
    } else {
      migrated.requiredNiches = prefs.requiredNiches || {};
    }
    
    if (Array.isArray(prefs.preferredNiches)) {
      const preferredNiches: Record<string, NicheRange> = {};
      for (const niche of prefs.preferredNiches) {
        // Convert display name to filename
        const filename = Object.keys(nicheFilenameMap).find(f => nicheFilenameMap[f] === niche)
          || niche.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
        preferredNiches[filename] = { min: 1, max: 1 }; // Default to 1 operator per niche
      }
      migrated.preferredNiches = preferredNiches;
    } else if (prefs.preferredNiches && typeof prefs.preferredNiches === 'object') {
      // Migrate from display names to filenames and from numbers to ranges
      const preferredNiches: Record<string, NicheRange> = {};
      for (const [key, value] of Object.entries(prefs.preferredNiches)) {
        // Check if key is a display name (contains spaces or slashes) or already a filename
        const filename = Object.keys(nicheFilenameMap).find(f => nicheFilenameMap[f] === key)
          || (key.includes(' ') || key.includes('/') ? key.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_') : key);
        
        // Convert number to range if needed
        if (typeof value === 'number') {
          preferredNiches[filename] = { min: value, max: value };
        } else if (value && typeof value === 'object' && 'min' in value && 'max' in value) {
          preferredNiches[filename] = value as NicheRange;
        } else {
          preferredNiches[filename] = { min: 1, max: 1 };
        }
      }
      migrated.preferredNiches = preferredNiches;
    } else {
      migrated.preferredNiches = prefs.preferredNiches || {};
    }
    
    // Ensure prioritizeRarity and allowDuplicates are set
    migrated.prioritizeRarity = prefs.prioritizeRarity !== undefined ? prefs.prioritizeRarity : true;
    migrated.allowDuplicates = true; // Always allow duplicates
    
    // Remove old properties
    delete migrated.minOperatorsPerNiche;
    delete migrated.maxOperatorsPerNiche;
    return migrated as TeamPreferences;
  };

  const loadPreferences = async () => {
    try {
      const response = await fetch('/api/team/preferences', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        // Wait for nicheFilenameMap to be loaded before migrating
        if (Object.keys(nicheFilenameMap).length > 0) {
          const migrated = migratePreferences(data);
          setPreferences(migrated);
        } else {
          // If map not loaded yet, set preferences directly (will be migrated on next render)
          setPreferences(data);
        }
      } else if (response.status === 401) {
        // Not authenticated, can't load preferences
        setError('Please log in to use team preferences');
      } else {
        // Load defaults if no saved preferences (404 or other error)
        const defaultResponse = await fetch('/api/team/preferences/default');
        if (defaultResponse.ok) {
          const defaultData = await defaultResponse.json();
          // Wait for nicheFilenameMap if needed
          if (Object.keys(nicheFilenameMap).length > 0) {
            const migrated = migratePreferences(defaultData);
            setPreferences(migrated);
          } else {
            setPreferences(defaultData);
          }
        }
      }
    } catch (err) {
      console.error('Error loading preferences:', err);
      // Load defaults on error
      try {
        const defaultResponse = await fetch('/api/team/preferences/default');
        if (defaultResponse.ok) {
          const defaultData = await defaultResponse.json();
          // Wait for nicheFilenameMap if needed
          if (Object.keys(nicheFilenameMap).length > 0) {
            const migrated = migratePreferences(defaultData);
            setPreferences(migrated);
          } else {
            setPreferences(defaultData);
          }
        }
      } catch (e) {
        setError('Failed to load preferences');
      }
    }
  };
  
  // Migrate preferences when nicheFilenameMap is loaded
  useEffect(() => {
    if (preferences && Object.keys(nicheFilenameMap).length > 0) {
      // Check if migration is needed (has display names instead of filenames, or numbers instead of ranges)
      const needsMigration = Object.keys(preferences.requiredNiches).some(key => 
        key.includes(' ') || key.includes('/') || typeof preferences.requiredNiches[key] === 'number'
      ) || Object.keys(preferences.preferredNiches).some(key => 
        key.includes(' ') || key.includes('/') || typeof preferences.preferredNiches[key] === 'number'
      );
      
      if (needsMigration) {
        const migrated = migratePreferences({ ...preferences });
        setPreferences(migrated);
      }
    }
  }, [nicheFilenameMap, preferences]);

  const loadNicheLists = async () => {
    try {
      const response = await fetch('/api/niche-lists');
      if (response.ok) {
        const data = await response.json();
        const niches = data.map((n: any) => ({
          filename: n.filename || n.niche?.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_'),
          displayName: n.displayName || n.niche
        }));
        setAllNiches(niches);
        
        // Build filename map
        const map: Record<string, string> = {};
        niches.forEach((n: any) => {
          map[n.filename] = n.displayName;
        });
        setNicheFilenameMap(map);
      }
    } catch (err) {
      console.error('Error loading niche lists:', err);
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;
    
    setSaving(true);
    setError(null);
    try {
      // Ensure preferences are in the correct format before saving
      const prefsToSave = Object.keys(nicheFilenameMap).length > 0 
        ? migratePreferences({ ...preferences })
        : preferences;
      
      const response = await fetch('/api/team/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefsToSave }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to save preferences' }));
        throw new Error(errorData.error || 'Failed to save preferences');
      }
      
      const result = await response.json();
      setPreferences(result.preferences || prefsToSave);
      alert('Preferences saved successfully!');
    } catch (err: any) {
      console.error('Error saving preferences:', err);
      setError(err.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const buildTeam = async () => {
    if (!preferences) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/team/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to build team');
      }
      
      const data = await response.json();
      setTeamResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to build team');
    } finally {
      setLoading(false);
    }
  };

  const updateRequiredNicheRange = (niche: string, min: number, max: number) => {
    if (!preferences) return;
    
    const newRequired = { ...preferences.requiredNiches };
    const newPreferred = { ...preferences.preferredNiches };
    
    // Remove from preferred if adding to required
    if ((min > 0 || max > 0) && newPreferred[niche] !== undefined) {
      delete newPreferred[niche];
    }
    
    if (min > 0 || max > 0) {
      newRequired[niche] = { min: Math.max(0, min), max: Math.max(min, max) };
    } else {
      delete newRequired[niche];
    }
    
    setPreferences({
      ...preferences,
      requiredNiches: newRequired,
      preferredNiches: newPreferred
    });
  };

  const updatePreferredNicheRange = (niche: string, min: number, max: number) => {
    if (!preferences) return;
    
    const newRequired = { ...preferences.requiredNiches };
    const newPreferred = { ...preferences.preferredNiches };
    
    // Remove from required if adding to preferred
    if ((min > 0 || max > 0) && newRequired[niche] !== undefined) {
      delete newRequired[niche];
    }
    
    if (min > 0 || max > 0) {
      newPreferred[niche] = { min: Math.max(0, min), max: Math.max(min, max) };
    } else {
      delete newPreferred[niche];
    }
    
    setPreferences({
      ...preferences,
      requiredNiches: newRequired,
      preferredNiches: newPreferred
    });
  };

  if (!user) {
    return (
      <div className="team-builder-page">
        <div className="error">Please log in to use the team builder</div>
      </div>
    );
  }

  if (!preferences) {
    return <div className="team-builder-page"><div className="loading">Loading preferences...</div></div>;
  }

  return (
    <div className="team-builder-page">
      <h1>Team Builder</h1>
      <p className="subtitle">Build a 12-operator team from your raised operators</p>

      {error && <div className="error">{error}</div>}

      <div className="preferences-section">
        <h2>Team Preferences</h2>
        
        <div className="preference-group">
          <label>
            <input
              type="checkbox"
              checked={preferences.prioritizeRarity || false}
              onChange={(e) => setPreferences({ ...preferences, prioritizeRarity: e.target.checked })}
            />
            Prioritize higher rarity operators
          </label>
        </div>


        {/* Temporarily removed required and preferred niches sections */}
        {/* 
        <div className="niche-selection-collapsible">
          <button 
            className="niche-selection-toggle"
            onClick={() => setShowRequiredNiches(!showRequiredNiches)}
          >
            <span>Required Niches</span>
            <span className="toggle-icon">{showRequiredNiches ? '▼' : '▶'}</span>
          </button>
          {showRequiredNiches && (
            <div className="niche-selection-content">
              <p className="help-text">Specify the range of operators from each niche required in your team (e.g., 1 to 2 healers)</p>
              <div className="niche-list">
                {allNiches.map(niche => {
                  const range = preferences.requiredNiches[niche.filename] || { min: 0, max: 0 };
                  return (
                    <div key={niche.filename} className="niche-input-row">
                      <label className="niche-label">{niche.displayName}</label>
                      <input
                        type="number"
                        min="0"
                        max="12"
                        value={range.min || 0}
                        onChange={(e) => {
                          const newMin = parseInt(e.target.value) || 0;
                          updateRequiredNicheRange(niche.filename, newMin, Math.max(newMin, range.max || 0));
                        }}
                        className="niche-count-input"
                        placeholder="Min"
                      />
                      <span className="niche-range-separator">to</span>
                      <input
                        type="number"
                        min={range.min || 0}
                        max="12"
                        value={range.max || 0}
                        onChange={(e) => {
                          const newMax = parseInt(e.target.value) || 0;
                          updateRequiredNicheRange(niche.filename, range.min || 0, newMax);
                        }}
                        className="niche-count-input"
                        placeholder="Max"
                      />
                      <span className="niche-count-label">operators</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="niche-selection-collapsible">
          <button 
            className="niche-selection-toggle"
            onClick={() => setShowPreferredNiches(!showPreferredNiches)}
          >
            <span>Preferred Niches</span>
            <span className="toggle-icon">{showPreferredNiches ? '▼' : '▶'}</span>
          </button>
          {showPreferredNiches && (
            <div className="niche-selection-content">
              <p className="help-text">Specify the range of operators from each niche preferred (but not required) in your team</p>
              <div className="niche-list">
                {allNiches.map(niche => {
                  const range = preferences.preferredNiches[niche.filename] || { min: 0, max: 0 };
                  return (
                    <div key={niche.filename} className="niche-input-row">
                      <label className="niche-label">{niche.displayName}</label>
                      <input
                        type="number"
                        min="0"
                        max="12"
                        value={range.min || 0}
                        onChange={(e) => {
                          const newMin = parseInt(e.target.value) || 0;
                          updatePreferredNicheRange(niche.filename, newMin, Math.max(newMin, range.max || 0));
                        }}
                        className="niche-count-input"
                        placeholder="Min"
                      />
                      <span className="niche-range-separator">to</span>
                      <input
                        type="number"
                        min={range.min || 0}
                        max="12"
                        value={range.max || 0}
                        onChange={(e) => {
                          const newMax = parseInt(e.target.value) || 0;
                          updatePreferredNicheRange(niche.filename, range.min || 0, newMax);
                        }}
                        className="niche-count-input"
                        placeholder="Max"
                      />
                      <span className="niche-count-label">operators</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        */}

        <div className="action-buttons">
          <button onClick={savePreferences} disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
          <button onClick={buildTeam} disabled={loading} className="primary">
            {loading ? 'Building Team...' : 'Build Team'}
          </button>
        </div>
      </div>

      {teamResult && (
        <div className="team-result">
          <h2>Generated Team ({teamResult.team.length}/12)</h2>
          {teamResult.missingNiches.length > 0 && (
            <div className="team-stats">
              <div className="stat warning">
                <strong>Missing Niches:</strong> {teamResult.missingNiches.map(niche => {
                  // Handle format like "niche (1/2)" or just "niche"
                  const [nicheName] = niche.split(' (');
                  return nicheFilenameMap[nicheName] || niche;
                }).join(', ')}
              </div>
            </div>
          )}

          <div className="team-grid">
            {(() => {
              // Sort team by required niches first (vaguely)
              const requiredNicheSet = new Set(Object.keys(preferences.requiredNiches));
              const sortedTeam = [...teamResult.team].sort((a, b) => {
                // Check if operators fill required niches
                const aFillsRequired = a.primaryNiche && requiredNicheSet.has(a.primaryNiche);
                const bFillsRequired = b.primaryNiche && requiredNicheSet.has(b.primaryNiche);
                
                if (aFillsRequired && !bFillsRequired) return -1;
                if (!aFillsRequired && bFillsRequired) return 1;
                
                // If both fill required or neither, maintain original order
                return 0;
              });
              
              // Sort by class first, then by rarity
              const classOrder: Record<string, number> = {
                'Vanguard': 1,
                'Guard': 2,
                'Defender': 3,
                'Sniper': 4,
                'Caster': 5,
                'Medic': 6,
                'Supporter': 7,
                'Specialist': 8
              };
              
              const classAndRaritySorted = sortedTeam.sort((a, b) => {
                const aClass = a.operator.class || '';
                const bClass = b.operator.class || '';
                const aClassOrder = classOrder[aClass] || 999;
                const bClassOrder = classOrder[bClass] || 999;
                
                // First sort by class order
                if (aClassOrder !== bClassOrder) {
                  return aClassOrder - bClassOrder;
                }
                
                // Then sort by rarity (higher first)
                const aRarity = a.operator.rarity || 0;
                const bRarity = b.operator.rarity || 0;
                return bRarity - aRarity;
              });
              
              return classAndRaritySorted.map((member, index) => {
                // Determine primary niche: prefer required niches, then use the assigned primaryNiche
                const requiredNicheSet = new Set(Object.keys(preferences.requiredNiches));
                const preferredNicheSet = new Set(Object.keys(preferences.preferredNiches));
                
                // Find first required niche this operator fills
                const requiredNiche = member.niches.find(niche => requiredNicheSet.has(niche));
                
                // Primary niche: prefer required, fallback to assigned primaryNiche
                const displayPrimaryNiche = requiredNiche || member.primaryNiche;
                
                // Filter niches to only show preferred ones (excluding the primary niche)
                const displayNiches = member.niches.filter(niche => 
                  preferredNicheSet.has(niche) && niche !== displayPrimaryNiche
                );
                
                return (
                  <div key={member.operatorId} className="team-member-card">
                    <div className={`operator-card rarity-${member.operator.rarity} ${member.isTrash ? 'trash-operator' : ''}`}>
                      <img
                        src={member.operator.profileImage || '/images/operators/placeholder.png'}
                        alt={getOperatorName(member.operator, language)}
                        className="operator-image"
                      />
                      <div className="operator-info">
                        <div className="operator-name">{getOperatorName(member.operator, language)}</div>
                        <div className="stars-wrapper">
                          <Stars rarity={member.operator.rarity} />
                        </div>
                        <div className="operator-class">{member.operator.class}</div>
                        <div className="primary-niche">
                          {displayPrimaryNiche ? (nicheFilenameMap[displayPrimaryNiche] || displayPrimaryNiche) : '\u00A0'}
                        </div>
                        {displayNiches.length > 0 && (
                          <div className="operator-niches">
                            {displayNiches.slice(0, 3).map(niche => (
                              <span key={niche} className="niche-tag">{nicheFilenameMap[niche] || niche}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          <div className="coverage-section-collapsible">
            <button 
              className="coverage-toggle"
              onClick={() => setShowCoverage(!showCoverage)}
            >
              <span>Niche Coverage</span>
              <span className="toggle-icon">{showCoverage ? '▼' : '▶'}</span>
            </button>
            {showCoverage && (
              <div className="coverage-content">
                <div className="coverage-list">
                  {Object.entries(teamResult.coverage).map(([niche, count]) => {
                    const displayName = nicheFilenameMap[niche] || niche;
                    return (
                      <div key={niche} className="coverage-item">
                        <span className="niche-name">{displayName}</span>
                        <span className="coverage-count">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamBuilderPage;

