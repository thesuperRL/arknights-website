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
  rarityRanking?: number[]; // Rarity preference order (e.g., [6, 4, 5, 3, 2, 1])
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
  emptySlots: number;
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
  const [allOperators, setAllOperators] = useState<Record<string, Operator>>({});
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());
  const [selectedEmptySlots, setSelectedEmptySlots] = useState<Record<number, string>>({}); // slot index -> operatorId
  const [modifiedTeam, setModifiedTeam] = useState<TeamMember[] | null>(null); // Modified team with user changes
  const [originalTeam, setOriginalTeam] = useState<TeamMember[] | null>(null); // Original generated team (for revert)
  const [showOperatorSelectModal, setShowOperatorSelectModal] = useState<{ type: 'replace' | 'empty'; operatorId?: string; slotIndex?: number } | null>(null); // Modal state with operator ID or slot index
  const [operatorSelectSearch, setOperatorSelectSearch] = useState('');

  useEffect(() => {
    if (user) {
      loadPreferences();
      loadNicheLists();
      loadAllOperators();
      loadOwnedOperators();
    }
  }, [user]);
  
  const loadAllOperators = async () => {
    try {
      const rarities = [1, 2, 3, 4, 5, 6];
      const allOps: Record<string, Operator> = {};

      for (const rarity of rarities) {
        const response = await fetch(`/api/operators/rarity/${rarity}`);
        if (response.ok) {
          const operators = await response.json() as Record<string, Operator>;
          Object.assign(allOps, operators);
        }
      }

      setAllOperators(allOps);
    } catch (err) {
      console.error('Error loading operators:', err);
    }
  };
  
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
    
    // Migrate prioritizeRarity to rarityRanking
    if (prefs.prioritizeRarity !== undefined) {
      // Convert old boolean to ranking array
      if (prefs.prioritizeRarity) {
        migrated.rarityRanking = [6, 4, 5, 3, 2, 1]; // Default ranking
      } else {
        migrated.rarityRanking = []; // No preference
      }
      delete migrated.prioritizeRarity;
    } else if (!prefs.rarityRanking) {
      // Set default ranking if not present
      migrated.rarityRanking = [6, 4, 5, 3, 2, 1];
    }
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

  // Ensure coverage is always recalculated when team or empty slots change
  useEffect(() => {
    if (!teamResult || !preferences || !allOperators || Object.keys(allOperators).length === 0) return;
    
    const currentTeam = modifiedTeam || teamResult.team;
    const { coverage, missingNiches } = recalculateCoverageWithEmptySlots(currentTeam, selectedEmptySlots);
    
    // Only update if coverage has actually changed to avoid infinite loops
    const currentCoverageStr = JSON.stringify(teamResult.coverage);
    const currentMissingStr = JSON.stringify(teamResult.missingNiches);
    const newCoverageStr = JSON.stringify(coverage);
    const newMissingStr = JSON.stringify(missingNiches);
    
    if (currentCoverageStr !== newCoverageStr || currentMissingStr !== newMissingStr) {
      setTeamResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          coverage: coverage,
          missingNiches: missingNiches
        };
      });
    }
  }, [modifiedTeam, selectedEmptySlots, teamResult?.team, preferences, allOperators]);

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
      setOriginalTeam([...data.team]); // Store original generated team
      setModifiedTeam(null); // Reset modified team when building new team
      // Reset selected empty slots when building a new team
      setSelectedEmptySlots({});
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
  
  // Recalculate niche coverage and missing niches from a team
  const recalculateCoverage = (team: TeamMember[]): { coverage: Record<string, number>; missingNiches: string[] } => {
    return recalculateCoverageWithEmptySlots(team, selectedEmptySlots);
  };

  // Recalculate niche coverage including empty slots
  const recalculateCoverageWithEmptySlots = (team: TeamMember[], emptySlots: Record<number, string>): { coverage: Record<string, number>; missingNiches: string[] } => {
    if (!preferences) return { coverage: {}, missingNiches: [] };
    
    const nicheCounts: Record<string, number> = {};
    
    // Count niches from all team members
    for (const member of team) {
      if (member && member.niches) {
        for (const niche of member.niches) {
          nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
        }
      }
    }
    
    // Also count niches from operators selected in empty slots
    for (const operatorId of Object.values(emptySlots)) {
      const operator = allOperators[operatorId];
      if (operator && operator.niches) {
        for (const niche of operator.niches) {
          nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
        }
      }
    }
    
    // Calculate missing niches
    const missingNiches: string[] = [];
    for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
      const currentCount = nicheCounts[niche] || 0;
      if (currentCount < range.min) {
        missingNiches.push(`${niche} (${currentCount}/${range.min}-${range.max})`);
      }
    }
    
    return { coverage: nicheCounts, missingNiches };
  };
  
  // Handle operator selection/replacement
  const handleOperatorSelect = (operatorId: string) => {
    if (!teamResult || !preferences) return;
    
    const modalState = showOperatorSelectModal;
    if (modalState === null) return;
    
    const operator = allOperators[operatorId];
    if (!operator) return;
    
    // Get niches for this operator from the operator's niches property or fetch from API
    const operatorNiches = operator.niches || [];
    
    // Create new team member
    const newMember: TeamMember = {
      operatorId: operator.id,
      operator: operator,
      niches: operatorNiches,
      isTrash: false // Could check trash operators list if needed
    };
    
    // Get current team (use modified team if available, otherwise use original)
    const currentTeam = modifiedTeam || teamResult.team;
    let newTeam: TeamMember[];
    
    if (modalState.type === 'empty') {
      // Empty slot - add to selectedEmptySlots
      const slotIndex = modalState.slotIndex!;
      const newSelectedSlots = {
        ...selectedEmptySlots,
        [slotIndex]: operatorId
      };
      setSelectedEmptySlots(newSelectedSlots);
      
      // Recalculate coverage including the new empty slot operator
      const currentTeam = modifiedTeam || teamResult.team;
      const { coverage, missingNiches } = recalculateCoverageWithEmptySlots(currentTeam, newSelectedSlots);
      
      // Update team result with new coverage
      setTeamResult({
        ...teamResult,
        coverage: coverage,
        missingNiches: missingNiches
      });
      
      setShowOperatorSelectModal(null);
      setOperatorSelectSearch('');
      return;
    } else {
      // Replace existing team member - find by operator ID
      newTeam = [...currentTeam];
      const operatorToReplaceId = modalState.operatorId;
      const replaceIndex = newTeam.findIndex(member => member.operatorId === operatorToReplaceId);
      
      if (replaceIndex === -1) {
        console.error('Could not find operator to replace:', operatorToReplaceId);
        setShowOperatorSelectModal(null);
        setOperatorSelectSearch('');
        return;
      }
      
      newTeam[replaceIndex] = newMember;
    }
    
    // Recalculate coverage
    const { coverage, missingNiches } = recalculateCoverage(newTeam);
    
    // Update team result
    setModifiedTeam(newTeam);
    setTeamResult({
      ...teamResult,
      team: newTeam,
      coverage: coverage,
      missingNiches: missingNiches
    });
    
    setShowOperatorSelectModal(null);
    setOperatorSelectSearch('');
  };

  // Revert a single operator to its original
  const handleRevertOperator = (operatorId: string) => {
    if (!teamResult || !originalTeam) return;
    
    // Get current team (use modified team if available, otherwise use original)
    const currentTeam = modifiedTeam || teamResult.team;
    
    // Find the operator in the current team
    const currentIndex = currentTeam.findIndex(member => member.operatorId === operatorId);
    if (currentIndex === -1) return;
    
    // Find the original operator at the same position
    const originalMember = originalTeam[currentIndex];
    if (!originalMember) return;
    
    // Check if this operator was actually changed
    if (originalMember.operatorId === operatorId) {
      // Operator is already the original, nothing to revert
      return;
    }
    
    // Create new team with the original operator restored
    const newTeam = [...currentTeam];
    newTeam[currentIndex] = { ...originalMember };
    
    // Recalculate coverage
    const { coverage, missingNiches } = recalculateCoverage(newTeam);
    
    // Update team result
    setModifiedTeam(newTeam);
    setTeamResult({
      ...teamResult,
      team: newTeam,
      coverage: coverage,
      missingNiches: missingNiches
    });
  };

  // Revert an empty slot selection
  const handleRevertEmptySlot = (slotIndex: number) => {
    const newSelected = { ...selectedEmptySlots };
    delete newSelected[slotIndex];
    setSelectedEmptySlots(newSelected);
    
    // Recalculate coverage after removing empty slot operator
    const currentTeam = modifiedTeam || teamResult.team;
    const { coverage, missingNiches } = recalculateCoverageWithEmptySlots(currentTeam, newSelected);
    
    // Update team result with new coverage
    setTeamResult({
      ...teamResult,
      coverage: coverage,
      missingNiches: missingNiches
    });
  };

  // Check if an operator was changed from the original
  const isOperatorChanged = (operatorId: string): boolean => {
    if (!originalTeam || !modifiedTeam) return false;
    
    // Find this operator in the current modified team
    const currentIndex = modifiedTeam.findIndex(m => m.operatorId === operatorId);
    if (currentIndex === -1) return false;
    
    // Compare with the original team at the same position
    if (originalTeam.length <= currentIndex) return false;
    return originalTeam[currentIndex].operatorId !== operatorId;
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
          <label className="preference-label">Rarity Preference Order</label>
          <div className="rarity-ranking-container">
            <div className="rarity-ranking-list">
              {(preferences.rarityRanking || [6, 4, 5, 3, 2, 1]).map((rarity, index) => (
                <div key={rarity} className="rarity-ranking-item">
                  <span className="rarity-rank-number">{index + 1}</span>
                  <span className="rarity-star">{rarity}★</span>
                  <button
                    className="rarity-move-btn"
                    onClick={() => {
                      if (index > 0) {
                        const newRanking = [...(preferences.rarityRanking || [6, 4, 5, 3, 2, 1])];
                        [newRanking[index - 1], newRanking[index]] = [newRanking[index], newRanking[index - 1]];
                        setPreferences({ ...preferences, rarityRanking: newRanking });
                      }
                    }}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="rarity-move-btn"
                    onClick={() => {
                      const ranking = preferences.rarityRanking || [6, 4, 5, 3, 2, 1];
                      if (index < ranking.length - 1) {
                        const newRanking = [...ranking];
                        [newRanking[index], newRanking[index + 1]] = [newRanking[index + 1], newRanking[index]];
                        setPreferences({ ...preferences, rarityRanking: newRanking });
                      }
                    }}
                    disabled={index === (preferences.rarityRanking || [6, 4, 5, 3, 2, 1]).length - 1}
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
            <div className="rarity-ranking-help">
              Higher position = higher priority. Use arrows to reorder.
            </div>
          </div>
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
          <div className="team-result-header">
            <h2>Generated Team ({(modifiedTeam || teamResult.team).length}/12)</h2>
          </div>
          {(() => {
            const currentTeam = modifiedTeam || teamResult.team;
            const { missingNiches } = recalculateCoverage(currentTeam);
            return missingNiches.length > 0 && (
              <div className="team-stats">
                <div className="stat warning">
                  <strong>Missing Niches:</strong> {missingNiches.map(niche => {
                    // Handle format like "niche (1/2)" or just "niche"
                    const [nicheName] = niche.split(' (');
                    return nicheFilenameMap[nicheName] || niche;
                  }).join(', ')}
                </div>
              </div>
            );
          })()}

          <div className="team-grid">
            {(() => {
              // Use modified team if available, otherwise use original
              const currentTeam = modifiedTeam || teamResult.team;
              
              // Sort team by required niches first (vaguely)
              const requiredNicheSet = new Set(Object.keys(preferences.requiredNiches));
              const sortedTeam = [...currentTeam].sort((a, b) => {
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
              
              const teamWithEmptySlots: Array<TeamMember | null> = [...classAndRaritySorted];
              
              // Add empty slots
              for (let i = 0; i < (teamResult.emptySlots || 0); i++) {
                teamWithEmptySlots.push(null);
              }
              
              return teamWithEmptySlots.map((member, index) => {
                // Empty slot
                if (member === null) {
                  const slotIndex = classAndRaritySorted.length + (index - classAndRaritySorted.length);
                  const selectedOperatorId = selectedEmptySlots[slotIndex];
                  const selectedOperator = selectedOperatorId ? allOperators[selectedOperatorId] : null;
                  
                  return (
                    <div key={`empty-${slotIndex}`} className="team-member-card">
                      {selectedOperator ? (
                        <div 
                          className={`operator-card rarity-${selectedOperator.rarity}`}
                          onClick={() => setShowOperatorSelectModal({ type: 'empty', slotIndex })}
                          style={{ cursor: 'pointer' }}
                        >
                          <img
                            src={selectedOperator.profileImage || '/images/operators/placeholder.png'}
                            alt={getOperatorName(selectedOperator, language)}
                            className="operator-image"
                          />
                          <div className="operator-info">
                            <div className="operator-name">{getOperatorName(selectedOperator, language)}</div>
                            <div className="stars-wrapper">
                              <Stars rarity={selectedOperator.rarity} />
                            </div>
                            <div className="operator-class">{selectedOperator.class}</div>
                            <button 
                              className="revert-operator-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevertEmptySlot(slotIndex);
                              }}
                              title="Remove operator from empty slot"
                            >
                              ↶ Revert
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="empty-slot-card"
                          onClick={() => setShowOperatorSelectModal({ type: 'empty', slotIndex })}
                        >
                          <div className="empty-slot-content">
                            <div className="free-choice-badge">Free Choice</div>
                            <span className="empty-slot-icon">+</span>
                            <span className="empty-slot-text">Select Any Operator</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                
                // Regular operator card
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
                
                // Check if this operator was changed from the original
                const wasChanged = modifiedTeam !== null && isOperatorChanged(member.operatorId);
                
                return (
                  <div key={member.operatorId} className="team-member-card">
                    <div 
                      className={`operator-card rarity-${member.operator.rarity} ${member.isTrash ? 'trash-operator' : ''}`}
                      onClick={() => setShowOperatorSelectModal({ type: 'replace', operatorId: member.operatorId })}
                      style={{ cursor: 'pointer' }}
                    >
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
                        {!wasChanged && (
                          <div className="primary-niche">
                            {displayPrimaryNiche ? (nicheFilenameMap[displayPrimaryNiche] || displayPrimaryNiche) : '\u00A0'}
                          </div>
                        )}
                        {displayNiches.length > 0 && (
                          <div className="operator-niches">
                            {displayNiches.slice(0, 3).map(niche => (
                              <span key={niche} className="niche-tag">{nicheFilenameMap[niche] || niche}</span>
                            ))}
                          </div>
                        )}
                        {wasChanged && (
                          <button 
                            className="revert-operator-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevertOperator(member.operatorId);
                            }}
                            title="Revert to original generated operator"
                          >
                            ↶ Revert
                          </button>
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
                  {Object.entries((() => {
                    const currentTeam = modifiedTeam || teamResult.team;
                    const hasChanges = modifiedTeam !== null || Object.keys(selectedEmptySlots).length > 0;
                    return hasChanges ? recalculateCoverage(currentTeam).coverage : teamResult.coverage;
                  })()).map(([niche, count]) => {
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
      
      {/* Operator Selection Modal */}
      {showOperatorSelectModal !== null && (
        <div className="modal-overlay" onClick={() => setShowOperatorSelectModal(null)}>
          <div className="modal-content operator-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select Operator</h2>
              <button className="modal-close" onClick={() => setShowOperatorSelectModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Search operators..."
                value={operatorSelectSearch}
                onChange={(e) => setOperatorSelectSearch(e.target.value)}
                className="operator-search-input"
              />
              <div className="operator-select-grid">
                {(() => {
                  // Get all operator IDs currently in the team
                  const currentTeam = modifiedTeam || teamResult.team || [];
                  const teamOperatorIds = new Set(currentTeam.map(member => member.operatorId));
                  
                  // Get operator IDs from selected empty slots
                  const emptySlotOperatorIds = new Set(Object.values(selectedEmptySlots));
                  
                  // Combine all used operator IDs
                  const usedOperatorIds = new Set([...teamOperatorIds, ...emptySlotOperatorIds]);
                  
                  // If we're replacing an operator, allow selecting the same operator (it will be replaced)
                  const modalState = showOperatorSelectModal;
                  let operatorToReplace: string | null = null;
                  if (modalState !== null && modalState.type === 'replace' && modalState.operatorId) {
                    operatorToReplace = modalState.operatorId;
                  }
                  
                  return Object.values(allOperators)
                    .filter(op => {
                      // Only show owned operators
                      if (!ownedOperators.has(op.id)) {
                        return false;
                      }
                      
                      // Exclude operators already in the team (unless we're replacing that same operator)
                      if (usedOperatorIds.has(op.id) && op.id !== operatorToReplace) {
                        return false;
                      }
                      
                      // Apply search filter
                      if (operatorSelectSearch) {
                        const displayName = getOperatorName(op, language);
                        const allNames = [
                          op.name,
                          op.cnName,
                          op.twName,
                          op.jpName,
                          op.krName
                        ].filter(Boolean).map(n => n!.toLowerCase());
                        const searchLower = operatorSelectSearch.toLowerCase();
                        return displayName.toLowerCase().includes(searchLower) ||
                          allNames.some(name => name.includes(searchLower));
                      }
                      return true;
                    })
                    .sort((a, b) => {
                      // Sort by rarity (higher first), then by name
                      if (a.rarity !== b.rarity) {
                        return b.rarity - a.rarity;
                      }
                      return getOperatorName(a, language).localeCompare(getOperatorName(b, language));
                    })
                    .map(op => (
                      <div
                        key={op.id}
                        className={`operator-select-card rarity-${op.rarity}`}
                        onClick={() => handleOperatorSelect(op.id)}
                      >
                        <img
                          src={op.profileImage || '/images/operators/placeholder.png'}
                          alt={getOperatorName(op, language)}
                          className="operator-select-image"
                        />
                        <div className="operator-select-name">{getOperatorName(op, language)}</div>
                        <Stars rarity={op.rarity} />
                      </div>
                    ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamBuilderPage;

