import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getOperatorName } from '../utils/operatorNameUtils';
import { getRarityClass } from '../utils/rarityUtils';
import Stars from '../components/Stars';
import './IntegratedStrategiesPage.css';

interface TeamPreferences {
  requiredNiches: Record<string, { min: number; max: number }>;
  preferredNiches: Record<string, { min: number; max: number }>;
  rarityRanking?: number[];
  allowDuplicates?: boolean;
}

// Cache for niche lists to avoid repeated API calls
const nicheListCache: Record<string, any> = {};

// Helper function to get operator tier in a niche
async function getOperatorTierInNiche(operatorId: string, niche: string): Promise<number> {
  // Check cache first
  if (!nicheListCache[niche]) {
    try {
      const response = await fetch(`/api/niche-lists/${encodeURIComponent(niche)}`);
      if (response.ok) {
        const data = await response.json();
        nicheListCache[niche] = data;
      } else {
        return 0; // Niche list not found
      }
    } catch (error) {
      console.error(`Error loading niche list ${niche}:`, error);
      return 0;
    }
  }

  const nicheList = nicheListCache[niche];
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  // Define tier values (higher = better)
  const tierValues: Record<string, number> = {
    'SS': 120,
    'S': 90,
    'A': 75,
    'B': 50,
    'C': 30,
    'D': 15,
    'F': 5
  };

  // Search through operators array to find the operator
  for (const entry of nicheList.operators) {
    if (entry.operatorId === operatorId) {
      return tierValues[entry.rating] || 0;
    }
  }

  return 0; // Operator not found in this niche
}

// Helper to get tier name from tier value
function getTierNameFromValue(tierValue: number): string {
  const tierMap: Record<number, string> = {
    120: 'SS',
    90: 'S',
    75: 'A',
    50: 'B',
    30: 'C',
    15: 'D',
    5: 'F'
  };
  return tierMap[tierValue] || 'Unknown';
}

// Local recommendation algorithm - ONLY considers raised/deployable operators
async function getIntegratedStrategiesRecommendation(
  allOperators: Record<string, Operator>,
  raisedOperatorIds: string[], // ONLY raised operators that user can deploy
  currentTeamOperatorIds: string[],
  requiredClasses: string[],
  preferences: TeamPreferences,
  temporaryRecruitment?: string,
  currentHope?: number,
  hopeCosts?: Record<number, number>,
  trashOperators?: Set<string>,
  teamSize?: number
): Promise<{ recommendedOperator: Operator | null; reasoning: string; score: number }> {
  // Helper functions for hope costs
  const getHopeCost = (rarity: number): number => {
    return hopeCosts?.[rarity] ?? 0;
  };

  const getActualHopeCost = (rarity: number): number => {
    return hopeCosts?.[rarity] ?? 0;
  };

  // Temporarily add the recruitment operator to raised operators (considered owned & raised)
  let effectiveRaisedOperators = [...raisedOperatorIds];
  if (temporaryRecruitment && allOperators[temporaryRecruitment]) {
    if (!effectiveRaisedOperators.includes(temporaryRecruitment)) {
      effectiveRaisedOperators.push(temporaryRecruitment);
    }
  }

  // ONLY use raised operators (user's deployable collection)
  let availableOperatorIds = effectiveRaisedOperators.filter(id => allOperators[id]);

  // Filter to only operators of the required classes
  let availableOperators = availableOperatorIds
    .filter(id => requiredClasses.includes(allOperators[id].class))
    .filter(id => !currentTeamOperatorIds.includes(id)); // Exclude operators already in team

  // Filter based on hope requirements
  if (currentHope !== undefined) {
    availableOperators = availableOperators.filter(id => {
      const operator = allOperators[id];
      // Temporary recruitment costs 0 hope
      if (temporaryRecruitment === id) {
        return true;
      }
      const hopeCost = getHopeCost(operator.rarity || 1);
      return currentHope >= hopeCost;
    });
  }

  if (availableOperators.length === 0) {
    const classText = requiredClasses.length === 1
      ? requiredClasses[0]
      : `${requiredClasses.join(' or ')}`;
    const teamCondition = currentTeamOperatorIds.length > 0 ? ' and aren\'t already in your team' : '';
    return {
      recommendedOperator: null,
      reasoning: `No ${classText} raised operators available${teamCondition}.`,
      score: 0
    };
  }

  // Load current team operators and their niches
  const currentTeamOperators = currentTeamOperatorIds.map(id => allOperators[id]).filter(Boolean);
  const currentTeamNiches: string[] = [];

  for (const operator of currentTeamOperators) {
    if (operator && operator.niches) {
      currentTeamNiches.push(...operator.niches);
    }
  }

  // Count current niche coverage
  const nicheCounts: Record<string, number> = {};
  for (const niche of currentTeamNiches) {
    nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
  }

  // Adjust niche requirements based on team size if provided
  // Scale down requirements proportionally to team size (assuming default team size is 12)
  const defaultTeamSize = 12;
  const effectiveTeamSize = teamSize || defaultTeamSize;
  const sizeMultiplier = effectiveTeamSize / defaultTeamSize;

  // Use preferences passed as parameter (loaded from team-preferences.json via API)
  // Scale niche requirements based on team size
  const defaultPreferences = {
    ...preferences,
    requiredNiches: Object.fromEntries(
      Object.entries(preferences.requiredNiches).map(([niche, range]) => [
        niche,
        {
          min: Math.ceil(range.min * sizeMultiplier),
          max: Math.ceil(range.max * sizeMultiplier)
        }
      ])
    ),
    preferredNiches: Object.fromEntries(
      Object.entries(preferences.preferredNiches).map(([niche, range]) => [
        niche,
        {
          min: Math.ceil(range.min * sizeMultiplier),
          max: Math.ceil(range.max * sizeMultiplier)
        }
      ])
    )
  };

  // Niches that should not contribute to scoring in IS team building (using filenames)
  const isExcludedNiches = new Set([
    'free',
    'unconventional-niches',
    'fragile',
    'enmity-healing',
    'sleep',
    'global-range',
    'synergies/enmity-healing',
    'synergies/sleep'
  ]);

  const importantNiches = new Set([
    ...Object.keys(defaultPreferences.requiredNiches),
    ...Object.keys(defaultPreferences.preferredNiches),
    'low-rarity' // Include low-rarity even though it's not in the niches folder
  ].filter(niche => !isExcludedNiches.has(niche)));

  // Score each available operator
  const operatorScores: Array<{ operatorId: string; score: number; reasoning: string[] }> = [];

  for (const operatorId of availableOperators) {
    const operator = allOperators[operatorId];
    if (!operator || !operator.niches) continue;

    let score = 0;
    const reasoning: string[] = [];

    // Tier-based scoring - VERY significant, should outweigh hope penalties
    // Calculate tier scores across all niches the operator has
    // Skip "low-rarity" as it's not a tier list
    const excludedFromTierScoring = new Set(['low-rarity']);

    // Bonus for filling important niches that are missing or under-covered
    for (const niche of operator.niches) {
      if (excludedFromTierScoring.has(niche)) {
        continue;
      }

      const currentCount = nicheCounts[niche] || 0;

      const tier = await getOperatorTierInNiche(operatorId, niche);
      if (tier == 0) {
        continue;
      }

      const tierPoints = tier;
      const tierName = getTierNameFromValue(tier);

      if (importantNiches.has(niche)) {
        const requiredRange = defaultPreferences.requiredNiches[niche];
        const preferredRange = defaultPreferences.preferredNiches[niche];

        if (requiredRange) {
          // Required niche
          if (currentCount < requiredRange.min) {
            // Filling a missing required niche
            const bonus = tierPoints * 5;
            score +=  bonus;
            reasoning.push(`🎯 Fills missing required niche: ${niche} at ${tierName} tier (+${bonus})`);
          } else if (currentCount < requiredRange.max) {
            // Filling an under-covered required niche
            const bonus = tierPoints * 2.5;
            score += bonus;
            reasoning.push(`➕ Strengthens required niche: ${niche} at ${tierName} tier (+${bonus})`);
          } else {
            // Over-covered required niche (negativevalue)
            const bonus = tierPoints * (1.25);
            score += bonus;
            reasoning.push(`⚠️ Over-specializes in: ${niche} at ${tierName} tier (+${bonus})`);
          }
        } else if (preferredRange) {
          // Preferred niche
          if (currentCount < preferredRange.min) {
            // Filling a missing preferred niche
            const bonus = tierPoints * 3.5;
            score += bonus;
            reasoning.push(`🎯 Fills missing preferred niche: ${niche} at ${tierName} tier (+${bonus})`);
          } else if (currentCount < preferredRange.max) {
            // Filling an under-covered preferred niche
            const bonus = tierPoints * 1.5;
            score += bonus;
            reasoning.push(`➕ Strengthens preferred niche: ${niche} at ${tierName} tier (+${bonus})`);
          } else {
            // Over-covered preferred niche (negative value)
            const bonus = tierPoints * (0.75);
            score += bonus;
            reasoning.push(`⚠️ Over-specializes in: ${niche} at ${tierName} tier (+${bonus})`);
          }
        }
      } else if (niche == "trash-operators") {
        const trashPenalty = 1000; // Large penalty that makes trash operators virtually unrecommendable
        score -= trashPenalty;
        reasoning.push(`🚫 Trash operator (-${trashPenalty})`);
      } else {
        // Non-standard niche (some value for variety)
            const bonus = tierPoints * 0.5;
            score += bonus;
        reasoning.push(`🌟 Provides niche variety: ${niche} at ${tierName} tier (+${bonus})`);
      }
    }

    // Apply hope cost penalty - higher hope cost operators are penalized when their niches are already well-covered
    const hopeCost = getActualHopeCost(operator.rarity || 1);
    // Calculate how much the operator's niches are needed (0 = not needed, higher = more needed)
    let nicheNeedFactor = 0;

    for (const niche of operator.niches) {
      if (!importantNiches.has(niche)) continue;

      const currentCount = nicheCounts[niche] || 0;
      const requiredRange = defaultPreferences.requiredNiches[niche];
      const preferredRange = defaultPreferences.preferredNiches[niche];

      if (requiredRange) {
        if (currentCount < requiredRange.min) {
          // High need - niches are under-covered
          nicheNeedFactor += 2;
        } else if (currentCount < requiredRange.max) {
          // Moderate need - niches could use more coverage
          nicheNeedFactor += 1;
        }
      } else if (preferredRange) {
        if (currentCount < preferredRange.min) {
          // Moderate need for preferred niches
          nicheNeedFactor += 1;
        }
      }
    }

    // Apply large hope cost penalty - always present, discourages expensive operators
    const hopePenalty = hopeCost * 42; // Large multiplier to make hope cost very significant
    score -= hopePenalty;
    reasoning.push(`💎 Hope cost penalty: ${hopeCost} hope (-${hopePenalty})`);

    // Log each evaluated character and their scoring criteria
    console.log(`\n=== Integrated Strategies Evaluation: ${operator.name || operatorId} ===`);
    console.log(`Class: ${operator.class}, Rarity: ${operator.rarity}★`);
    console.log(`Niches: ${operator.niches?.join(', ') || 'None'}`);
    console.log(`Final Score: ${score}`);
    console.log('Scoring Breakdown:');
    reasoning.forEach(reason => console.log(`  ${reason}`));

    operatorScores.push({
      operatorId,
      score,
      reasoning
    });
  }

  // Sort by score (highest first)
  operatorScores.sort((a, b) => b.score - a.score);

  if (operatorScores.length === 0) {
    const classText = requiredClasses.length === 1
      ? requiredClasses[0]
      : `${requiredClasses.join(' or ')}`;

    // Count valid operators (raised, correct class, sufficient hope)
    const validOperatorsCount = raisedOperatorIds.filter(id => {
      const operator = allOperators[id];
      if (!operator) return false;

      // Check class constraint
      if (!requiredClasses.includes(operator.class)) return false;

      // Check hope constraint (if hope tracking is enabled)
      if (currentHope !== undefined) {
        const hopeCost = getHopeCost(operator.rarity || 1);
        if (currentHope < hopeCost) return false;
      }

      return true;
    }).length;

    return {
      recommendedOperator: null,
      reasoning: `No suitable ${classText} operators found for your team composition. You have ${validOperatorsCount} valid ${classText} operators available.`,
      score: 0
    };
  }

  const bestOperator = operatorScores[0];
  const operator = allOperators[bestOperator.operatorId];

  // Create detailed reasoning with better formatting
  const classText = requiredClasses.length === 1
    ? requiredClasses[0]
    : `${requiredClasses.slice(0, -1).join(', ')} or ${requiredClasses[requiredClasses.length - 1]}`;

  const reasoningParts = [
    `🏆 **Recommended ${classText} Operator**`,
    '',
    ...(temporaryRecruitment ? [
      `💫 **Temporary recruitment: ${allOperators[temporaryRecruitment]?.name || 'Unknown Operator'} (considered owned & raised)**`,
      ''
    ] : []),
    '**Scoring Breakdown:**',
    ...bestOperator.reasoning.map(line => `• ${line}`),
    '',
    `**Final Score: ${bestOperator.score}**`,
    '',
    '*This operator was selected because it best complements your current team composition and fills important gaps.*'
  ];

  return {
    recommendedOperator: operator,
    reasoning: reasoningParts.join('\n'),
    score: bestOperator.score
  };
}

// Component to render formatted reasoning text
const FormattedReasoning: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');

  return (
    <div className="formatted-reasoning">
      {lines.map((line, index) => {
        // Handle headers (lines starting with ** and ending with **)
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <h5 key={index} className="reasoning-header">
              {line.replace(/\*\*/g, '')}
            </h5>
          );
        }

        // Handle bullet points (lines starting with •)
        if (line.startsWith('• ')) {
          return (
            <div key={index} className="reasoning-bullet">
              {line.substring(2)}
            </div>
          );
        }

        // Handle italic text (lines starting and ending with *)
        if (line.startsWith('*') && line.endsWith('*')) {
          return (
            <p key={index} className="reasoning-emphasis">
              {line.replace(/\*/g, '')}
            </p>
          );
        }

        // Regular lines
        return line.trim() ? (
          <p key={index} className="reasoning-text">
            {line}
          </p>
        ) : (
          <br key={index} />
        );
      })}
    </div>
  );
};

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

interface SelectedOperator {
  operatorId: string;
  operator: Operator;
}

interface RecommendationResult {
  recommendedOperator: Operator | null;
  reasoning: string;
  score: number;
}

const CLASS_OPTIONS = [
  'Vanguard',
  'Guard',
  'Defender',
  'Sniper',
  'Caster',
  'Medic',
  'Supporter',
  'Specialist'
];

const IntegratedStrategiesPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();

  const [allOperators, setAllOperators] = useState<Record<string, Operator>>({});
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());
  const [raisedOperators, setRaisedOperators] = useState<Set<string>>(new Set());
  const [rawUserData, setRawUserData] = useState<any>(null);
  const [selectedOperators, setSelectedOperators] = useState<SelectedOperator[]>([]);
  const [requiredClasses, setRequiredClasses] = useState<Set<string>>(new Set());
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOperatorSelectModal, setShowOperatorSelectModal] = useState(false);
  const [operatorSelectSearch, setOperatorSelectSearch] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [temporaryRecruitment, setTemporaryRecruitment] = useState<string>('');
  const [showTempRecruitmentModal, setShowTempRecruitmentModal] = useState(false);
  const [tempRecruitmentSearch, setTempRecruitmentSearch] = useState('');
  const [currentHope, setCurrentHope] = useState<number>(0);
  const [hopeCosts, setHopeCosts] = useState<Record<number, number>>({
    6: 6,
    5: 3,
    4: 0
  });
  const [trashOperators, setTrashOperators] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<TeamPreferences | null>(null);
  const [teamSize, setTeamSize] = useState<number>(8);
  const [optimalTeam, setOptimalTeam] = useState<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);

  // Helper function to get hope cost for an operator
  const getHopeCost = (rarity: number): number => {
    return hopeCosts[rarity] ?? 0;
  };


  useEffect(() => {
    if (user) {
      loadAllOperators();
      loadOwnedOperators();
      loadTrashOperators();
      loadPreferences();
      // Load hope and hope costs immediately (don't need to wait for operators)
      loadISTeamState(true);
    }
  }, [user]);

  // Load selected operators after allOperators is loaded
  useEffect(() => {
    if (user && Object.keys(allOperators).length > 0) {
      loadISTeamState(false); // Load everything including operators
    }
  }, [user, allOperators]);

  // Calculate optimal team whenever team or team size changes
  useEffect(() => {
    if (selectedOperators.length > 0 && preferences && teamSize > 0) {
      calculateOptimalTeam();
    } else {
      setOptimalTeam(new Set());
    }
  }, [selectedOperators, teamSize, preferences, allOperators]);

  // Auto-save IS team state when it changes (instant save)
  // Skip saving during initial load to prevent overwriting loaded data
  useEffect(() => {
    if (user && Object.keys(allOperators).length > 0 && !isInitialLoad) {
      saveISTeamState();
    }
  }, [selectedOperators, currentHope, hopeCosts, teamSize, user, allOperators, isInitialLoad]);

  const loadPreferences = async () => {
    try {
      const response = await fetch('/api/team/preferences', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      } else {
        // Load defaults if no saved preferences
        const defaultResponse = await fetch('/api/team/preferences/default');
        if (defaultResponse.ok) {
          const defaultData = await defaultResponse.json();
          setPreferences(defaultData);
        }
      }
    } catch (err) {
      console.error('Error loading preferences:', err);
      // Load defaults on error
      try {
        const defaultResponse = await fetch('/api/team/preferences/default');
        if (defaultResponse.ok) {
          const defaultData = await defaultResponse.json();
          setPreferences(defaultData);
        }
      } catch (e) {
        console.error('Failed to load default preferences:', e);
      }
    }
  };

  const loadISTeamState = async (loadOnlyHope: boolean = false) => {
    try {
      const response = await fetch('/api/integrated-strategies/team', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (data) {
          // Always restore current hope and hope costs immediately (don't need to wait for operators)
          if (loadOnlyHope) {
            if (data.currentHope !== undefined) {
              setCurrentHope(data.currentHope);
            }
            
            if (data.hopeCosts) {
              setHopeCosts(data.hopeCosts);
            }
            return; // Early return if only loading hope
          }
          
          // Restore everything (hope, costs, and operators)
          if (data.currentHope !== undefined) {
            setCurrentHope(data.currentHope);
          }
          
          if (data.hopeCosts) {
            setHopeCosts(data.hopeCosts);
          }
          
          // Restore team size
          if (data.teamSize !== undefined) {
            setTeamSize(data.teamSize);
          }
          
          // Restore selected operators only after allOperators is loaded
          if (Object.keys(allOperators).length > 0) {
            if (data.selectedOperators && Array.isArray(data.selectedOperators)) {
              const operators = data.selectedOperators
                .map((opId: string) => {
                  const op = allOperators[opId];
                  if (op) {
                    return { operatorId: opId, operator: op };
                  }
                  return null;
                })
                .filter((item: any) => item !== null);
              setSelectedOperators(operators);
            }
          }
          
          // Mark initial load as complete after loading all data
          if (!loadOnlyHope && Object.keys(allOperators).length > 0) {
            setIsInitialLoad(false);
          } else if (loadOnlyHope) {
            // For hope-only load, mark complete after a short delay to ensure state is set
            setTimeout(() => setIsInitialLoad(false), 100);
          }
        }
      }
    } catch (err) {
      console.error('Error loading IS team state:', err);
      setIsInitialLoad(false); // Mark as complete even on error
    }
  };

  const calculateOptimalTeam = async () => {
    if (!preferences || selectedOperators.length === 0 || teamSize <= 0) {
      setOptimalTeam(new Set());
      return;
    }

    // If team size is greater than or equal to selected operators, all are optimal
    if (teamSize >= selectedOperators.length) {
      setOptimalTeam(new Set(selectedOperators.map(s => s.operatorId)));
      return;
    }

    // Niches that should not contribute to scoring
    const isExcludedNiches = new Set([
      'free',
      'unconventional-niches',
      'fragile',
      'enmity-healing',
      'sleep',
      'global-range',
      'synergies/enmity-healing',
      'synergies/sleep',
      'low-rarity'
    ]);

    const importantNiches = new Set([
      ...Object.keys(preferences.requiredNiches),
      ...Object.keys(preferences.preferredNiches)
    ].filter(niche => !isExcludedNiches.has(niche)));

    // Generate all possible combinations of teamSize operators
    const combinations: string[][] = [];
    
    function generateCombinations(arr: string[], size: number, start: number, current: string[]) {
      if (current.length === size) {
        combinations.push([...current]);
        return;
      }
      
      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        generateCombinations(arr, size, i + 1, current);
        current.pop();
      }
    }

    const operatorIds = selectedOperators.map(s => s.operatorId);
    generateCombinations(operatorIds, Math.min(teamSize, operatorIds.length), 0, []);

    // Score each combination using tier-based scoring (prioritizing tiers over niche coverage)
    let bestCombination: string[] = [];
    let bestScore = -Infinity;

    for (const combo of combinations) {
      // Calculate niche coverage for this combination
      const nicheCounts: Record<string, number> = {};
      
      for (const opId of combo) {
        const op = allOperators[opId];
        if (op && op.niches) {
          for (const niche of op.niches) {
            nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
          }
        }
      }

      // Score based on tier performance (HIGH EMPHASIS) and niche coverage
      let score = 0;
      
      // Track which niches we've scored to avoid double counting
      const scoredNiches = new Set<string>();

      // FIRST: Score based on tier performance (HIGH PRIORITY)
      let totalTierScore = 0;
      for (const opId of combo) {
        const op = allOperators[opId];
        if (!op || !op.niches) continue;

        // Penalty for trash operators (check both Set and niche list)
        const isTrash = (trashOperators && trashOperators.has(opId)) || 
                        op.niches.includes("trash-operator") || 
                        op.niches.includes("trash-operators");
        if (isTrash) {
          score -= 1000;
          continue;
        }

        // Calculate tier scores for this operator across all niches
        for (const niche of op.niches) {
          if (isExcludedNiches.has(niche)) continue;
          
          const normalizedNiche = niche;
          if (scoredNiches.has(normalizedNiche)) continue;
          scoredNiches.add(normalizedNiche);

          // Get tier for this operator in this niche
          const tier = await getOperatorTierInNiche(opId, niche);
          if (tier === 0) continue;

          // Tier score is weighted heavily (emphasize tiers over coverage)
          totalTierScore += tier * 10; // High multiplier to prioritize tiers
        }
      }

      // Apply tier score (HIGH WEIGHT)
      score += totalTierScore;

      // SECOND: Score based on niche coverage (with tier-weighted bonuses)
      scoredNiches.clear(); // Reset for coverage scoring
      let nicheCoverageScore = 0;

      for (const opId of combo) {
        const op = allOperators[opId];
        if (!op || !op.niches) continue;

        // Skip trash operators in niche coverage scoring (penalty already applied)
        const isTrash = (trashOperators && trashOperators.has(opId)) || 
                        op.niches.includes("trash-operator") || 
                        op.niches.includes("trash-operators");
        if (isTrash) continue;

        for (const niche of op.niches) {
          if (isExcludedNiches.has(niche)) continue;

          const normalizedNiche = niche;
          if (scoredNiches.has(normalizedNiche)) continue;
          scoredNiches.add(normalizedNiche);

          const currentCount = nicheCounts[niche] || 0;

          // Get required/preferred ranges to determine how many top tiers to consider
          const requiredRange = importantNiches.has(niche) ? preferences.requiredNiches[niche] : undefined;
          const preferredRange = importantNiches.has(niche) ? preferences.preferredNiches[niche] : undefined;
          
          // Determine how many top tiers to consider
          let tierCount = 1; // Default to just the best tier
          if (requiredRange) {
            tierCount = Math.max(tierCount, requiredRange.max);
          }
          if (preferredRange) {
            tierCount = Math.max(tierCount, preferredRange.max);
          }

          // Collect all tiers in this niche from operators in the combo (excluding trash operators)
          const tiersInNiche: number[] = [];
          for (const otherOpId of combo) {
            const otherOp = allOperators[otherOpId];
            if (!otherOp || !otherOp.niches) continue;
            
            // Skip trash operators
            const isOtherTrash = (trashOperators && trashOperators.has(otherOpId)) || 
                                otherOp.niches.includes("trash-operator") || 
                                otherOp.niches.includes("trash-operators");
            if (isOtherTrash) continue;
            
            // Only consider operators that have this niche
            if (otherOp.niches.includes(niche)) {
              const tier = await getOperatorTierInNiche(otherOpId, niche);
              if (tier > 0) {
                tiersInNiche.push(tier);
              }
            }
          }

          // Sort tiers in descending order and take the top x
          tiersInNiche.sort((a, b) => b - a);
          const topTiers = tiersInNiche.slice(0, tierCount);
          
          // Sum the top tiers (or use the best tier if none found)
          const totalTierValue = topTiers.length > 0 
            ? topTiers.reduce((sum, tier) => sum + tier, 0)
            : 0;

          if (importantNiches.has(niche)) {
            if (requiredRange) {
              // Required niche - tier-weighted scoring
              if (currentCount < requiredRange.min) {
                // Filling a missing required niche - bonus weighted by tier
                nicheCoverageScore += totalTierValue * 5;
              } else if (currentCount < requiredRange.max) {
                // Filling an under-covered required niche
                nicheCoverageScore += totalTierValue * 2.5;
              } else {
                // Over-covered - minimal bonus
                nicheCoverageScore += totalTierValue * 1.25;
              }
            } else if (preferredRange) {
              // Preferred niche - tier-weighted scoring
              if (currentCount < preferredRange.min) {
                // Filling a missing preferred niche
                nicheCoverageScore += totalTierValue * 3.5;
              } else if (currentCount < preferredRange.max) {
                // Filling an under-covered preferred niche
                nicheCoverageScore += totalTierValue * 1.5;
              } else {
                // Over-covered - minimal bonus
                nicheCoverageScore += totalTierValue * 0.75;
              }
            }
          } else {
            // Non-standard niche - small tier-weighted bonus (use best tier only)
            const bestTier = topTiers.length > 0 ? topTiers[0] : 0;
            nicheCoverageScore += bestTier * 0.5;
          }
        }
      }

      // Apply niche coverage score (LOWER WEIGHT than tier score)
      score += nicheCoverageScore;

      if (score > bestScore) {
        bestScore = score;
        bestCombination = combo;
      }
    }

    setOptimalTeam(new Set(bestCombination));
  };

  const saveISTeamState = async () => {
    if (!user) return;
    
    try {
      const teamState = {
        selectedOperators: selectedOperators.map(s => s.operatorId),
        currentHope,
        hopeCosts,
        teamSize
      };
      
      await fetch('/api/integrated-strategies/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(teamState)
      });
    } catch (err) {
      console.error('Error saving IS team state:', err);
    }
  };

  const resetISTeamState = async () => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to reset all saved data? This will clear your team, hope, and settings.')) {
      return;
    }
    
    try {
      // Clear saved state on server
      await fetch('/api/integrated-strategies/team', {
        method: 'DELETE',
        credentials: 'include'
      });
      
      // Reset local state to defaults
      setSelectedOperators([]);
      setCurrentHope(0);
      setHopeCosts({
        6: 6,
        5: 3,
        4: 0
      });
      setTeamSize(8);
      setOptimalTeam(new Set());
      setRecommendation(null);
      
      setIsInitialLoad(false); // Allow saving after reset
    } catch (err) {
      console.error('Error resetting IS team state:', err);
    }
  };

  const loadTrashOperators = async () => {
    try {
      const response = await fetch('/api/trash-operators');
      if (response.ok) {
        const data = await response.json();
        const trashIds = new Set<string>((data.operators || []).map((op: any) => op.id).filter((id: any): id is string => typeof id === 'string'));
        setTrashOperators(trashIds);
      }
    } catch (err) {
      console.error('Error loading trash operators:', err);
      setTrashOperators(new Set());
    }
  };

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
      setRaisedOperators(new Set());
      setRawUserData(null);
      return;
    }

    try {
      const response = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setRawUserData(data);
        setOwnedOperators(new Set(data.ownedOperators || []));
        setRaisedOperators(new Set(data.raisedOperators || [])); // raisedOperators comes from wantToUse field
      }
    } catch (err) {
      console.error('Error loading owned operators:', err);
    }
  };

  const addOperator = (operatorId: string) => {
    const operator = allOperators[operatorId];
    if (!operator) return;

    // Don't add if already selected
    if (selectedOperators.some(selected => selected.operatorId === operatorId)) {
      return;
    }

    // Calculate hope cost for this operator
    const operatorRarity = operator.rarity || 1;
    const operatorHopeCost = hopeCosts[operatorRarity] || 0;

    // Decrease current hope by the operator's cost (don't go below 0)
    setCurrentHope(prev => Math.max(0, prev - operatorHopeCost));

    setSelectedOperators(prev => [...prev, { operatorId, operator }]);
    setRecommendation(null); // Clear recommendation when team changes
    setError(null); // Clear any previous error
  };

  const removeOperator = (operatorId: string) => {
    setSelectedOperators(prev => prev.filter(selected => selected.operatorId !== operatorId));
    setRecommendation(null); // Clear recommendation when team changes
  };

  const getRecommendation = async () => {
    if (!user) {
      setError('Please log in to get recommendations');
      return;
    }

    if (requiredClasses.size === 0) {
      setError('Please choose at least one required class');
      return;
    }

    if (!preferences) {
      setError('Please wait for preferences to load');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const operatorIds = selectedOperators.map(selected => selected.operatorId);
      const raisedOpsArray = Array.from(raisedOperators); // raisedOperators are the deployable operators

      // Use optimal team for recommendations if team size is set
      const teamForRecommendation = teamSize > 0 && optimalTeam.size > 0 
        ? Array.from(optimalTeam)
        : operatorIds;

      const result = await getIntegratedStrategiesRecommendation(
        allOperators,
        raisedOpsArray, // ONLY raised operators
        teamForRecommendation,
        Array.from(requiredClasses),
        preferences,
        temporaryRecruitment || undefined,
        currentHope,
        hopeCosts,
        trashOperators,
        teamSize
      );

      setRecommendation(result);
    } catch (err: any) {
      console.error('Error getting recommendation:', err);
      setError(err.message || 'Failed to get recommendation');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="integrated-strategies-page">
        <div className="error">Please log in to use the Integrated Strategies team builder</div>
      </div>
    );
  }

  return (
    <div className="integrated-strategies-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Integrated Strategies Team Builder</h1>
        <button
          onClick={resetISTeamState}
          className="reset-team-btn"
          title="Reset all saved data"
        >
          Reset All
        </button>
      </div>
      <p className="subtitle">Select your current operators and get recommendations for the next operator to add</p>

      {error && <div className="error">{error}</div>}

      <div className="team-selection-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Your Current Team</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="team-size-input" style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
              Team Size:
            </label>
            <input
              id="team-size-input"
              type="number"
              min="1"
              max="12"
              value={teamSize}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 8;
                setTeamSize(Math.max(1, Math.min(12, value)));
              }}
              style={{
                width: '60px',
                padding: '0.25rem 0.5rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-light)',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>
        <p>Select operators you already own and plan to use in your Integrated Strategies team. Optimal team members are highlighted.</p>

        <div className="selected-operators">
          {selectedOperators.map(selected => (
            <div 
              key={selected.operatorId} 
              className={`selected-operator-card ${optimalTeam.has(selected.operatorId) ? 'optimal-team-member' : ''}`}
            >
              <img
                src={selected.operator.profileImage || '/images/operators/placeholder.png'}
                alt={getOperatorName(selected.operator, language)}
                className="operator-image"
              />
              <div className="operator-info">
                <div className="operator-name">{getOperatorName(selected.operator, language)}</div>
                <Stars rarity={selected.operator.rarity} size="small" />
                <div className="operator-class">{selected.operator.class}</div>
              </div>
              <button
                className="remove-operator-btn"
                onClick={() => removeOperator(selected.operatorId)}
                title="Remove from team"
              >
                ×
              </button>
            </div>
          ))}

          <div
            className="add-operator-card"
            onClick={() => setShowOperatorSelectModal(true)}
          >
            <div className="add-operator-content">
              <span className="add-icon">+</span>
              <span className="add-text">Add Operator</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hope-section">
        <h2>Hope System</h2>
        <p>Enter your current hope amount. Operators require specific hope amounts to be recommended.</p>

        <div className="hope-input-container">
          <label htmlFor="hope-input" className="hope-label">Current Hope:</label>
          <input
            id="hope-input"
            type="number"
            min="0"
            value={currentHope}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 0;
              setCurrentHope(Math.max(0, value));
              setRecommendation(null); // Clear recommendation when hope changes
            }}
            className="hope-input"
          />
          <div className="hope-requirements">
            <div className="hope-requirement">
              <span className="hope-stars">★★★★★★</span>
              <span className="hope-cost">{hopeCosts[6]} hope</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">★★★★★</span>
              <span className="hope-cost">{hopeCosts[5]} hope</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">★★★★</span>
              <span className="hope-cost">{hopeCosts[4]} hope</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">★★★ and below</span>
              <span className="hope-cost">0 hope</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">💫 Temporary Recruitment</span>
              <span className="hope-cost">0 hope</span>
            </div>
          </div>
        </div>

        <div className="hope-cost-config-section">
          <h3>Hope Cost Configuration</h3>
          <div className="hope-cost-config">
            <div className="hope-cost-input-group">
              <label htmlFor="hope-cost-6star">6★ Cost:</label>
              <input
                id="hope-cost-6star"
                type="number"
                min="0"
                max="50"
                value={hopeCosts[6]}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setHopeCosts(prev => ({ ...prev, 6: value }));
                  setRecommendation(null); // Clear recommendation when costs change
                }}
                className="hope-cost-input"
              />
            </div>
            <div className="hope-cost-input-group">
              <label htmlFor="hope-cost-5star">5★ Cost:</label>
              <input
                id="hope-cost-5star"
                type="number"
                min="0"
                max="30"
                value={hopeCosts[5]}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setHopeCosts(prev => ({ ...prev, 5: value }));
                  setRecommendation(null); // Clear recommendation when costs change
                }}
                className="hope-cost-input"
              />
            </div>
            <div className="hope-cost-input-group">
              <label htmlFor="hope-cost-4star">4★ Cost:</label>
              <input
                id="hope-cost-4star"
                type="number"
                min="0"
                max="20"
                value={hopeCosts[4]}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setHopeCosts(prev => ({ ...prev, 4: value }));
                  setRecommendation(null); // Clear recommendation when costs change
                }}
                className="hope-cost-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="class-constraint-section">
        <h2>Required Classes</h2>
        <p>Select one or more classes for your next operator</p>

        <div className="class-options">
          {CLASS_OPTIONS.map(className => (
            <button
              key={className}
              className={`class-option ${requiredClasses.has(className) ? 'selected' : ''}`}
              onClick={() => {
                const newClasses = new Set(requiredClasses);
                if (newClasses.has(className)) {
                  newClasses.delete(className);
                } else {
                  newClasses.add(className);
                }
                setRequiredClasses(newClasses);
                setRecommendation(null); // Clear recommendation when classes change
              }}
            >
              {className}
            </button>
          ))}
          <div className="select-all-container">
            <button
              className="select-all-btn"
              onClick={() => {
                if (requiredClasses.size === CLASS_OPTIONS.length) {
                  // If all are selected, deselect all
                  setRequiredClasses(new Set());
                } else {
                  // Otherwise, select all
                  setRequiredClasses(new Set(CLASS_OPTIONS));
                }
                setRecommendation(null);
              }}
            >
              {requiredClasses.size === CLASS_OPTIONS.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>
      </div>

      <div className="advanced-options-section-collapsible">
        <button
          className="advanced-options-toggle"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
        >
          <span>Advanced Options</span>
          <span className="toggle-icon">{showAdvancedOptions ? '▼' : '▶'}</span>
        </button>
        {showAdvancedOptions && (
          <div className="advanced-options-content">
            <div className="advanced-option-group">
              <label className="advanced-option-label">Temporary Recruitment</label>
              <div className="temporary-recruitment-selector">
                <div className="temp-recruitment-container">
                  {temporaryRecruitment ? (
                    <div className="selected-temp-operator-card">
                      <img
                        src={allOperators[temporaryRecruitment]?.profileImage || '/images/operators/placeholder.png'}
                        alt={getOperatorName(allOperators[temporaryRecruitment], language)}
                        className="temp-operator-image"
                      />
                      <div className="temp-operator-info">
                        <div className="temp-operator-name">{getOperatorName(allOperators[temporaryRecruitment], language)}</div>
                        <Stars rarity={allOperators[temporaryRecruitment]?.rarity} />
                        <div className="temp-operator-class">{allOperators[temporaryRecruitment]?.class}</div>
                        <div className="temp-recruitment-note">Will be considered owned & raised</div>
                      </div>
                      <button
                        className="remove-temp-operator-btn"
                        onClick={() => {
                          setTemporaryRecruitment('');
                          setRecommendation(null);
                        }}
                        title="Remove temporary recruitment"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      className="add-temp-operator-card"
                      onClick={() => setShowTempRecruitmentModal(true)}
                    >
                      <div className="add-temp-operator-content">
                        <span className="add-icon">💫</span>
                        <span className="add-text">Select Temporary Recruitment</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="recommendation-section">
        <button
          onClick={getRecommendation}
          disabled={loading || !user || requiredClasses.size === 0}
          className="recommend-btn primary"
        >
          {loading ? 'Getting Recommendation...' : 'Get Recommendation'}
        </button>

        {recommendation && (
          <div className="recommendation-result">
            <h3>Recommended Next Operator</h3>

            {recommendation.recommendedOperator ? (
              <>
                <div className="recommended-operator-card">
                  <img
                    src={recommendation.recommendedOperator.profileImage || '/images/operators/placeholder.png'}
                    alt={getOperatorName(recommendation.recommendedOperator, language)}
                    className="operator-image"
                  />
                  <div className="operator-info">
                    <div className="operator-name">{getOperatorName(recommendation.recommendedOperator, language)}</div>
                    <Stars rarity={recommendation.recommendedOperator.rarity} />
                    <div className="operator-class">{recommendation.recommendedOperator.class}</div>
                    <div className="recommendation-score">Score: {recommendation.score.toFixed(1)}</div>
                    <div className="operator-hope-cost">
                      Hope Cost: {getHopeCost(recommendation.recommendedOperator.rarity || 1)}
                    </div>
                  </div>
                </div>

                <div className="recommendation-actions">
                  <button
                    onClick={() => {
                      addOperator(recommendation.recommendedOperator!.id);
                      setRecommendation(null); // Clear recommendation after adding
                    }}
                    className="add-recommended-btn primary"
                  >
                    ➕ Add to Team
                  </button>
                </div>
              </>
            ) : (
              <div className="no-recommendation">
                <p>No suitable operator found for the selected class and team composition.</p>
                {raisedOperators.size === 0 ? (
                  <div className="no-raised-operators-notice">
                    <p><strong>Note:</strong> You haven't marked any operators as raised/deployable.</p>
                    <p>To get recommendations, mark operators as "want to use" in your profile or operator pages.</p>
                  </div>
                ) : (
                  <div className="raised-operators-count">
                    <p>You have {raisedOperators.size} raised operator{raisedOperators.size !== 1 ? 's' : ''} available for recommendations.</p>
                  </div>
                )}
                <button
                  onClick={() => setRecommendation(null)}
                  className="try-again-btn secondary"
                >
                  Try Different Class
                </button>
              </div>
            )}

            {recommendation.recommendedOperator && (
              <div className="recommendation-reasoning">
                <h4>Reasoning</h4>
                <FormattedReasoning text={recommendation.reasoning} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Operator Selection Modal */}
      {showOperatorSelectModal && (
        <div className="modal-overlay" onClick={() => setShowOperatorSelectModal(false)}>
          <div className="modal-content operator-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select Operator to Add</h2>
              <button className="modal-close" onClick={() => setShowOperatorSelectModal(false)}>×</button>
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
                {Object.values(allOperators)
                  .filter(op => {
                    // Exclude operators already in the team
                    if (selectedOperators.some(selected => selected.operatorId === op.id)) {
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
                      className={`operator-select-card rarity-${op.rarity} ${!op.global ? 'non-global' : ''}`}
                      onClick={() => {
                        addOperator(op.id);
                        setShowOperatorSelectModal(false);
                        setOperatorSelectSearch('');
                      }}
                    >
                      <img
                        src={op.profileImage || '/images/operators/placeholder.png'}
                        alt={getOperatorName(op, language)}
                        className="operator-select-image"
                      />
                      <div className="operator-select-name">{getOperatorName(op, language)}</div>
                      <Stars rarity={op.rarity} />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Temporary Recruitment Modal */}
      {showTempRecruitmentModal && (
        <div className="modal-overlay" onClick={() => setShowTempRecruitmentModal(false)}>
          <div className="modal-content operator-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select Temporary Recruitment</h2>
              <button className="modal-close" onClick={() => setShowTempRecruitmentModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Search operators..."
                value={tempRecruitmentSearch}
                onChange={(e) => setTempRecruitmentSearch(e.target.value)}
                className="operator-search-input"
              />
              <div className="operator-select-grid">
                {Object.values(allOperators)
                  .filter(op => {
                    // Apply search filter
                    if (tempRecruitmentSearch) {
                      const displayName = getOperatorName(op, language);
                      const allNames = [
                        op.name,
                        op.cnName,
                        op.twName,
                        op.jpName,
                        op.krName
                      ].filter(Boolean).map(n => n!.toLowerCase());
                      const searchLower = tempRecruitmentSearch.toLowerCase();
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
                      onClick={() => {
                        setTemporaryRecruitment(op.id);
                        setRecommendation(null); // Clear recommendation when temporary recruitment changes
                        setShowTempRecruitmentModal(false);
                        setTempRecruitmentSearch('');
                      }}
                    >
                      <img
                        src={op.profileImage || '/images/operators/placeholder.png'}
                        alt={getOperatorName(op, language)}
                        className="operator-select-image"
                      />
                      <div className="operator-select-name">{getOperatorName(op, language)}</div>
                      <Stars rarity={op.rarity} />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegratedStrategiesPage;