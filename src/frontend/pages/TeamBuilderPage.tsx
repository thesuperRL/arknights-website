import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../translations/useTranslation';
import { getOperatorName } from '../utils/operatorNameUtils';
import { getRarityClass } from '../utils/rarityUtils';
import Stars from '../components/Stars';
import { apiFetch, getImageUrl } from '../api';
import './TeamBuilderPage.css';

interface NicheRange {
  min: number;
  max: number;
}

interface TeamPreferences {
  requiredNiches: Record<string, NicheRange>;
  preferredNiches: Record<string, NicheRange>;
  allowDuplicates?: boolean;
}

interface TeamMember {
  operatorId: string;
  operator: any;
  niches: string[];
  primaryNiche?: string;
  isTrash?: boolean;
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
  const { t, getNicheName, translateClass } = useTranslation();
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
  const [showPreferences, setShowPreferences] = useState(true);
  const [allOperators, setAllOperators] = useState<Record<string, Operator>>({});
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());
  const [wantToUseOperatorIds, setWantToUseOperatorIds] = useState<Set<string>>(new Set());
  const [allSynergies, setAllSynergies] = useState<Array<{filename: string; name: string; core: Record<string, string[]>; optional: Record<string, string[]>; isOnly: boolean; corePointBonus: number; optionalPointBonus: number; coreCountSeparately: boolean; optionalCountSeparately: boolean; optionalCountMinimum: number}>>([]);
  const [selectedEmptySlots, setSelectedEmptySlots] = useState<Record<number, string>>({}); // slot index -> operatorId
  const [modifiedTeam, setModifiedTeam] = useState<TeamMember[] | null>(null); // Modified team with user changes
  const [originalTeam, setOriginalTeam] = useState<TeamMember[] | null>(null); // Original generated team (for revert)
  const [showOperatorSelectModal, setShowOperatorSelectModal] = useState<{ type: 'replace' | 'empty' | 'lock'; operatorId?: string; slotIndex?: number } | null>(null);
  const [operatorSelectSearch, setOperatorSelectSearch] = useState('');
  const [lockedOperatorIds, setLockedOperatorIds] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      loadPreferences();
      loadNicheLists();
      loadAllOperators();
      loadOwnedOperators();
      loadSynergies();
    }
  }, [user]);
  
  const loadAllOperators = async () => {
    try {
      const rarities = [1, 2, 3, 4, 5, 6];
      const allOps: Record<string, Operator> = {};

      for (const rarity of rarities) {
        const response = await apiFetch(`/api/operators/rarity/${rarity}`);
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
      const response = await apiFetch('/api/auth/user');
      if (response.ok) {
        const data = await response.json();
        setOwnedOperators(new Set(data.ownedOperators || []));
        setWantToUseOperatorIds(new Set(data.wantToUse || []));
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
    
    if (prefs.prioritizeRarity !== undefined) delete migrated.prioritizeRarity;
    if ((migrated as any).rarityRanking !== undefined) delete (migrated as any).rarityRanking;
    migrated.allowDuplicates = true;
    
    // Remove old properties
    delete migrated.minOperatorsPerNiche;
    delete migrated.maxOperatorsPerNiche;
    return migrated as TeamPreferences;
  };

  const loadPreferences = async () => {
    try {
      const response = await apiFetch('/api/team/preferences', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        // Restore cached locked operators so they persist across page changes
        const cached = data.normalTeambuild?.lockedOperatorIds;
        if (Array.isArray(cached)) {
          setLockedOperatorIds(cached);
        }
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
        setError(t('teamBuilder.pleaseLogIn'));
      } else {
        // Load defaults if no saved preferences (404 or other error)
        const defaultResponse = await apiFetch('/api/team/preferences/default');
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
        const defaultResponse = await apiFetch('/api/team/preferences/default');
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
        setError(t('teamBuilder.failedLoadPreferences'));
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
      const response = await apiFetch('/api/niche-lists');
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

  const loadSynergies = async () => {
    try {
      const response = await apiFetch('/api/synergies');
      if (response.ok) {
        const data = await response.json();
        // Fetch full synergy data for each synergy
        const synergyPromises = data.map(async (synergy: any) => {
          const detailResponse = await apiFetch(`/api/synergies/${encodeURIComponent(synergy.filename)}`);
          if (detailResponse.ok) {
            const fullSynergy = await detailResponse.json();
            // Extract operator IDs from enriched data
            const core: Record<string, string[]> = {};
            for (const [groupName, operators] of Object.entries(fullSynergy.core)) {
              core[groupName] = (operators as Array<{operatorId: string}>).map(op => op.operatorId);
            }
            const optional: Record<string, string[]> = {};
            for (const [groupName, operators] of Object.entries(fullSynergy.optional)) {
              optional[groupName] = (operators as Array<{operatorId: string}>).map(op => op.operatorId);
            }
            return {
              filename: synergy.filename,
              name: fullSynergy.name,
              core,
              optional,
              isOnly: fullSynergy.isOnly || false,
              corePointBonus: fullSynergy.corePointBonus || 0,
              optionalPointBonus: fullSynergy.optionalPointBonus || 0,
              coreCountSeparately: fullSynergy.coreCountSeparately || false,
              optionalCountSeparately: fullSynergy.optionalCountSeparately || false,
              optionalCountMinimum: fullSynergy.optionalCountMinimum || 0
            };
          }
          return null;
        });
        const synergies = await Promise.all(synergyPromises);
        setAllSynergies(synergies.filter((s: any) => s !== null));
      }
    } catch (err) {
      console.error('Error loading synergies:', err);
    }
  };

  const persistLockedOperators = async (lockedIds: string[], lastTeamIds?: string[]) => {
    try {
      const lastTeam = lastTeamIds ?? (modifiedTeam || teamResult?.team)?.map(m => m.operatorId) ?? [];
      await apiFetch('/api/team/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalTeambuild: { lockedOperatorIds: lockedIds, lastTeamOperatorIds: lastTeam }
        }),
        credentials: 'include'
      });
    } catch (err) {
      console.error('Error persisting locked operators:', err);
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
      
      const response = await apiFetch('/api/team/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: prefsToSave,
          normalTeambuild: {
            lockedOperatorIds,
            lastTeamOperatorIds: (modifiedTeam || teamResult?.team)?.map(m => m.operatorId) ?? []
          }
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: t('teamBuilder.failedSavePreferences') }));
        throw new Error(errorData.error || t('teamBuilder.failedSavePreferences'));
      }
      
      const result = await response.json();
      setPreferences(result.preferences || prefsToSave);
      alert(t('teamBuilder.preferencesSaved'));
    } catch (err: any) {
      console.error('Error saving preferences:', err);
      setError(err.message || t('teamBuilder.failedSavePreferences'));
    } finally {
      setSaving(false);
    }
  };

  const buildTeam = async () => {
    if (!preferences) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiFetch('/api/team/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences, lockedOperatorIds }),
      });
      
      if (!response.ok) {
        throw new Error(t('teamBuilder.failedBuildTeam'));
      }
      
      const data = await response.json();
      setTeamResult(data);
      setOriginalTeam([...data.team]); // Store original generated team
      setModifiedTeam(null); // Reset modified team when building new team
      // Reset selected empty slots when building a new team
      setSelectedEmptySlots({});
      // Auto-collapse preferences when team is generated
      setShowPreferences(false);
    } catch (err: any) {
      setError(err.message || t('teamBuilder.failedBuildTeam'));
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

  // Helper to check if a niche key is a group (contains '|')
  const isNicheGroup = (nicheKey: string): boolean => nicheKey.includes('|');
  
  // Helper to parse a niche group into individual niches
  const parseNicheGroup = (nicheKey: string): string[] => nicheKey.split('|').map(n => n.trim());
  
  // Helper to check if an operator fills any niche in a group
  const operatorFillsNicheGroup = (operatorNiches: string[], nicheKey: string): boolean => {
    const groupNiches = parseNicheGroup(nicheKey);
    for (const niche of groupNiches) {
      if (operatorNiches.includes(niche)) return true;
      // Handle AOE variants
      if (niche === 'arts-dps' && operatorNiches.includes('aoe-arts-dps')) return true;
      if (niche === 'physical-dps' && operatorNiches.includes('aoe-physical-dps')) return true;
    }
    return false;
  };

  // Recalculate niche coverage including empty slots
  const recalculateCoverageWithEmptySlots = (team: TeamMember[], emptySlots: Record<number, string>): { coverage: Record<string, number>; missingNiches: string[] } => {
    if (!preferences) return { coverage: {}, missingNiches: [] };
    
    const nicheCounts: Record<string, number> = {};  // Individual niche counts
    const nicheGroupCounts: Record<string, number> = {};  // Group counts
    
    // All niche keys for group counting
    const allNicheKeys = [...Object.keys(preferences.requiredNiches), ...Object.keys(preferences.preferredNiches)];
    
    // Helper to update all counts for an operator
    const updateCounts = (operatorNiches: string[]) => {
      // Update individual niche counts
      for (const niche of operatorNiches) {
        nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
      }
      // Update group counts
      for (const nicheKey of allNicheKeys) {
        if (isNicheGroup(nicheKey) && operatorFillsNicheGroup(operatorNiches, nicheKey)) {
          nicheGroupCounts[nicheKey] = (nicheGroupCounts[nicheKey] || 0) + 1;
        }
      }
    };
    
    // Count niches from all team members
    for (const member of team) {
      if (member && member.niches) {
        updateCounts(member.niches);
      }
    }
    
    // Also count niches from operators selected in empty slots
    for (const operatorId of Object.values(emptySlots)) {
      const operator = allOperators[operatorId];
      if (operator && operator.niches) {
        updateCounts(operator.niches);
      }
    }
    
    // Calculate missing niches (handles groups)
    const missingNiches: string[] = [];
    for (const [nicheKey, range] of Object.entries(preferences.requiredNiches)) {
      const currentCount = isNicheGroup(nicheKey) 
        ? (nicheGroupCounts[nicheKey] || 0)
        : (nicheCounts[nicheKey] || 0);
      if (currentCount < range.min) {
        missingNiches.push(`${nicheKey} (${currentCount}/${range.min}-${range.max})`);
      }
    }
    
    return { coverage: nicheCounts, missingNiches };
  };

  // Calculate active synergies for the current team
  const getActiveSynergies = (team: TeamMember[], emptySlots: Record<number, string>): Array<{name: string; filename: string; satisfiedOptionalGroups: number}> => {
    const teamOperatorIds = new Set<string>();
    
    // Add operators from team members
    for (const member of team) {
      if (member && member.operatorId) {
        teamOperatorIds.add(member.operatorId);
      }
    }
    
    // Add operators from empty slots
    for (const operatorId of Object.values(emptySlots)) {
      teamOperatorIds.add(operatorId);
    }

    const activeSynergies: Array<{name: string; filename: string; satisfiedOptionalGroups: number}> = [];

    for (const synergy of allSynergies) {
      // Skip IS-only synergies for normal teambuilding
      if (synergy.isOnly) continue;

      // Check if core is satisfied (at least one operator from each core group)
      // If core is empty, consider it satisfied
      let coreSatisfied = Object.keys(synergy.core).length === 0;
      if (!coreSatisfied) {
        coreSatisfied = true;
        for (const operatorIds of Object.values(synergy.core)) {
          const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
          if (!hasOperator) {
            coreSatisfied = false;
            break;
          }
        }
      }

      if (coreSatisfied) {
        // Calculate actual bonus being applied
        let actualBonus = 0;

        if (synergy.coreCountSeparately) {
          // Count each operator in core groups separately
          for (const operatorIds of Object.values(synergy.core)) {
            for (const operatorId of operatorIds) {
              if (teamOperatorIds.has(operatorId)) {
                actualBonus += synergy.corePointBonus;
              }
            }
          }
        } else {
          // Core bonus once if all core groups satisfied
          actualBonus += synergy.corePointBonus;
        }

        // Calculate optional bonus
        let totalOptionalCount = 0;
        for (const operatorIds of Object.values(synergy.optional)) {
          for (const operatorId of operatorIds) {
            if (teamOperatorIds.has(operatorId)) {
              totalOptionalCount++;
            }
          }
        }

        const optionalCountMinimum = synergy.optionalCountMinimum || 0;
        if (totalOptionalCount >= optionalCountMinimum) {
          if (synergy.optionalCountSeparately) {
            // Count each operator in optional groups separately
            for (const operatorIds of Object.values(synergy.optional)) {
              for (const operatorId of operatorIds) {
                if (teamOperatorIds.has(operatorId)) {
                  actualBonus += synergy.optionalPointBonus;
                }
              }
            }
          } else {
            // Count satisfied optional groups
            let satisfiedOptionalGroups = 0;
            for (const operatorIds of Object.values(synergy.optional)) {
              const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
              if (hasOperator) {
                satisfiedOptionalGroups++;
              }
            }
            actualBonus += satisfiedOptionalGroups * synergy.optionalPointBonus;
          }
        }

        // Only include synergies that give a point bonus > 0
        if (actualBonus > 0) {
          // Count satisfied optional groups for display
          let satisfiedOptionalGroups = 0;
          for (const operatorIds of Object.values(synergy.optional)) {
            const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
            if (hasOperator) {
              satisfiedOptionalGroups++;
            }
          }
          activeSynergies.push({
            name: synergy.name,
            filename: synergy.filename,
            satisfiedOptionalGroups
          });
        }
      }
    }

    return activeSynergies;
  };
  
  // Handle operator selection/replacement
  const handleOperatorSelect = (operatorId: string) => {
    const modalState = showOperatorSelectModal;
    if (modalState === null) return;

    const operator = allOperators[operatorId];
    if (!operator) return;

    if (modalState.type === 'lock') {
      setLockedOperatorIds(prev => {
        if (prev.includes(operatorId) || prev.length >= 12) return prev;
        const next = [...prev, operatorId];
        const lastTeam = (modifiedTeam || teamResult?.team)?.map(m => m.operatorId) ?? [];
        persistLockedOperators(next, lastTeam);
        return next;
      });
      setShowOperatorSelectModal(null);
      setOperatorSelectSearch('');
      return;
    }

    if (!teamResult || !preferences) return;

    // Get niches for this operator from the operator's niches property or fetch from API
    const operatorNiches = operator.niches || [];

    // Create new team member
    const newMember: TeamMember = {
      operatorId: operator.id,
      operator: operator,
      niches: operatorNiches,
      isTrash: false
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
    if (!teamResult) return;
    
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
        <div className="error">{t('teamBuilder.loginRequired')}</div>
      </div>
    );
  }

  if (!preferences) {
    return <div className="team-builder-page"><div className="loading">{t('teamBuilder.loading')}</div></div>;
  }

  return (
    <div className="team-builder-page">
      <h1>{t('teamBuilder.title')}</h1>
      <p className="subtitle">{t('teamBuilder.subtitle')}</p>

      {error && <div className="error">{error}</div>}

      <div className="preferences-section-collapsible">
        <button 
          className="preferences-section-toggle"
          onClick={() => setShowPreferences(!showPreferences)}
        >
          <span>{t('teamBuilder.teamPreferences')}</span>
          <span className="toggle-icon">{showPreferences ? '▼' : '▶'}</span>
        </button>
        {showPreferences && (
          <div className="preferences-section-content">
            <h2>{t('teamBuilder.teamPreferences')}</h2>

            <div className="preference-group locked-operators-group">
              <label className="preference-label">{t('teamBuilder.lockedOperators')}</label>
              <p className="help-text">{t('teamBuilder.lockedOperatorsHelp')}</p>
              <div className="locked-operators-list">
                {lockedOperatorIds.map(id => {
                  const op = allOperators[id];
                  if (!op) return null;
                  return (
                    <div key={id} className="locked-operator-chip">
                      <img src={getImageUrl(op.profileImage || '/images/operators/placeholder.png')} alt="" className="locked-operator-chip-img" />
                      <span className="locked-operator-chip-name">{getOperatorName(op, language)}</span>
                      <button
                        type="button"
                        className="locked-operator-unlock"
                        onClick={() => {
                          setLockedOperatorIds(prev => {
                            const next = prev.filter(x => x !== id);
                            const lastTeam = (modifiedTeam || teamResult?.team)?.map(m => m.operatorId) ?? [];
                            persistLockedOperators(next, lastTeam);
                            return next;
                          });
                        }}
                        title={t('teamBuilder.unlock')}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              {lockedOperatorIds.length < 12 && (
                <button
                  type="button"
                  className="add-locked-btn"
                  onClick={() => setShowOperatorSelectModal({ type: 'lock' })}
                >
                  {t('teamBuilder.addLockedOperator')}
                </button>
              )}
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
                {saving ? t('teamBuilder.saving') : t('teamBuilder.savePreferences')}
              </button>
              <button onClick={buildTeam} disabled={loading} className="primary">
                {loading ? t('teamBuilder.buildingTeam') : t('teamBuilder.buildTeam')}
              </button>
            </div>
          </div>
        )}
      </div>

      {teamResult && (
        <div className="team-result">
          <div className="team-result-header">
            <h2>{t('teamBuilder.generatedTeam')} ({(modifiedTeam || teamResult.team).length}/12)</h2>
          </div>
          {(() => {
            const currentTeam = modifiedTeam || teamResult.team;
            const { missingNiches } = recalculateCoverage(currentTeam);
            return missingNiches.length > 0 && (
              <div className="team-stats">
                <div className="stat warning">
                  <strong>{t('teamBuilder.missingNiches')}:</strong> {missingNiches.map(niche => {
                    // Handle format like "niche (1/2)" or just "niche"
                    const [nicheName] = niche.split(' (');
                    return getNicheName(nicheName, nicheFilenameMap[nicheName] || nicheName);
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
                            src={getImageUrl(selectedOperator.profileImage || '/images/operators/placeholder.png')}
                            alt={getOperatorName(selectedOperator, language)}
                            className="operator-image"
                          />
                          <div className="operator-info">
                            <div className="operator-name">{getOperatorName(selectedOperator, language)}</div>
                            <div className="stars-wrapper">
                              <Stars rarity={selectedOperator.rarity} />
                            </div>
                            <div className="operator-class">{translateClass(selectedOperator.class)}</div>
                            <button 
                              className="revert-operator-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevertEmptySlot(slotIndex);
                              }}
                              title={t('teamBuilder.removeFromEmptySlot')}
                            >
                              {t('teamBuilder.revert')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="empty-slot-card"
                          onClick={() => setShowOperatorSelectModal({ type: 'empty', slotIndex })}
                        >
                          <div className="empty-slot-content">
                            <div className="free-choice-badge">{t('teamBuilder.freeChoice')}</div>
                            <span className="empty-slot-icon">+</span>
                            <span className="empty-slot-text">{t('teamBuilder.selectAnyOperator')}</span>
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
                        src={getImageUrl(member.operator.profileImage || '/images/operators/placeholder.png')}
                        alt={getOperatorName(member.operator, language)}
                        className="operator-image"
                      />
                      <div className="operator-info">
                        <div className="operator-name">{getOperatorName(member.operator, language)}</div>
                        <div className="stars-wrapper">
                          <Stars rarity={member.operator.rarity} />
                        </div>
                        <div className="operator-class">{translateClass(member.operator.class)}</div>
                        {!wasChanged && (
                          <div className="primary-niche">
                            {displayPrimaryNiche ? getNicheName(displayPrimaryNiche, nicheFilenameMap[displayPrimaryNiche] || displayPrimaryNiche) : '\u00A0'}
                          </div>
                        )}
                        {displayNiches.length > 0 && (
                          <div className="operator-niches">
                            {displayNiches.slice(0, 3).map(niche => (
                              <span key={niche} className="niche-tag">{getNicheName(niche, nicheFilenameMap[niche] || niche)}</span>
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
                            title={t('teamBuilder.revertToOriginal')}
                          >
                            {t('teamBuilder.revert')}
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
              <span>{t('teamBuilder.nicheCoverage')}</span>
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
                    const displayName = getNicheName(niche, nicheFilenameMap[niche] || niche);
                    return (
                      <div key={niche} className="coverage-item">
                        <span className="niche-name">{displayName}</span>
                        <span className="coverage-count">{count}</span>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const currentTeam = modifiedTeam || teamResult.team || [];
                  const activeSynergies = getActiveSynergies(currentTeam, selectedEmptySlots);
                  if (activeSynergies.length > 0) {
                    return (
                      <div className="synergies-section">
                        <h3 className="synergies-header">{t('teamBuilder.activeSynergies')}</h3>
                        <div className="synergies-list">
                          {activeSynergies.map((synergy) => (
                            <Link key={synergy.filename} to={`/synergy/${encodeURIComponent(synergy.filename)}`} className="synergy-item-link">
                              <div className="synergy-item">
                                <span className="synergy-name">{synergy.name}</span>
                                {synergy.satisfiedOptionalGroups > 0 && (
                                  <span className="synergy-optional-badge">+{synergy.satisfiedOptionalGroups} {t('teamBuilder.optional')}</span>
                                )}
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
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
              <h2>{showOperatorSelectModal?.type === 'lock' ? t('teamBuilder.selectOperatorToLock') : t('teamBuilder.selectOperator')}</h2>
              <button className="modal-close" onClick={() => setShowOperatorSelectModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder={t('teamBuilder.searchOperators')}
                value={operatorSelectSearch}
                onChange={(e) => setOperatorSelectSearch(e.target.value)}
                className="operator-search-input"
              />
              <div className="operator-select-grid">
                {(() => {
                  const modalState = showOperatorSelectModal;
                  const isLock = modalState?.type === 'lock';

                  const currentTeam = modifiedTeam || teamResult?.team || [];
                  const teamOperatorIds = new Set(currentTeam.map(member => member.operatorId));
                  const emptySlotOperatorIds = new Set(Object.values(selectedEmptySlots));
                  const usedOperatorIds = new Set([...teamOperatorIds, ...emptySlotOperatorIds]);
                  let operatorToReplace: string | null = null;
                  if (modalState !== null && modalState.type === 'replace' && modalState.operatorId) {
                    operatorToReplace = modalState.operatorId;
                  }
                  const lockedSet = new Set(lockedOperatorIds);

                  return Object.values(allOperators)
                    .filter(op => {
                      if (!ownedOperators.has(op.id)) return false;
                      if (isLock) {
                        if (lockedSet.has(op.id)) return false;
                        if (!wantToUseOperatorIds.has(op.id)) return false; // Backend only accepts locked from want-to-use
                      } else if (usedOperatorIds.has(op.id) && op.id !== operatorToReplace) {
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
                          src={getImageUrl(op.profileImage || '/images/operators/placeholder.png')}
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

