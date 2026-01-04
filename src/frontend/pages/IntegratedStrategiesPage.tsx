import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getOperatorName } from '../utils/operatorNameUtils';
import { getRarityClass } from '../utils/rarityUtils';
import Stars from '../components/Stars';
import './IntegratedStrategiesPage.css';

// Local recommendation algorithm - ONLY considers raised/deployable operators
function getIntegratedStrategiesRecommendation(
  allOperators: Record<string, Operator>,
  raisedOperatorIds: string[], // ONLY raised operators that user can deploy
  currentTeamOperatorIds: string[],
  requiredClasses: string[],
  temporaryRecruitment?: string,
  currentHope?: number,
  hopeCosts?: Record<number, number>,
  trashOperators?: Set<string>
): { recommendedOperator: Operator | null; reasoning: string; score: number } {
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

  // Default team preferences for Integrated Strategies
  const defaultPreferences = {
    requiredNiches: {
      'dp-generation': { min: 1, max: 2 },
      'early-laneholder': { min: 1, max: 2 },
      'late-laneholder': { min: 1, max: 2 },
      'healing-operators': { min: 2, max: 3 },
      'arts-dps': { min: 1, max: 2 },
      'physical-dps': { min: 1, max: 2 },
    },
    preferredNiches: {
      'anti-air-operators': { min: 1, max: 1 },
      'tanking-blocking-operators': { min: 1, max: 2 },
      'stalling': { min: 0, max: 1 },
      'fast-redeploy-operators': { min: 0, max: 1 }
    },
    rarityRanking: [6, 4, 5, 3, 2, 1],
    allowDuplicates: true
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

    // Bonus for filling important niches that are missing or under-covered
    for (const niche of operator.niches) {
      const currentCount = nicheCounts[niche] || 0;

      if (importantNiches.has(niche)) {
        const requiredRange = defaultPreferences.requiredNiches[niche];
        const preferredRange = defaultPreferences.preferredNiches[niche];

        if (requiredRange) {
          // Required niche
          if (currentCount < requiredRange.min) {
            // Filling a missing required niche
            score += 100;
            reasoning.push(`🎯 Fills missing required niche: ${niche} (+100)`);
          } else if (currentCount < requiredRange.max) {
            // Filling an under-covered required niche
            score += 50;
            reasoning.push(`➕ Strengthens required niche: ${niche} (+50)`);
          } else {
            // Over-covered required niche (still some value)
            score += 10;
            reasoning.push(`✅ Supports required niche: ${niche} (+10)`);
          }
        } else if (preferredRange) {
          // Preferred niche
          if (currentCount < preferredRange.min) {
            // Filling a missing preferred niche
            score += 75;
            reasoning.push(`🎯 Fills missing preferred niche: ${niche} (+75)`);
          } else if (currentCount < preferredRange.max) {
            // Filling an under-covered preferred niche
            score += 30;
            reasoning.push(`➕ Strengthens preferred niche: ${niche} (+30)`);
          } else {
            // Over-covered preferred niche (minimal value)
            score += 5;
            reasoning.push(`✅ Supports preferred niche: ${niche} (+5)`);
          }
        }
      } else {
        // Non-standard niche (some value for variety)
        score += 15;
        reasoning.push(`🌟 Provides niche variety: ${niche} (+15)`);
      }
    }

    // Penalty for duplicate niches (discourage over-specialization)
    // Skip penalty for low-rarity operators
    if (!operator.niches.includes('low-rarity')) {
      const duplicateNiches = operator.niches.filter((niche: string) =>
        !isExcludedNiches.has(niche) && (nicheCounts[niche] || 0) >= 3
      );
      if (duplicateNiches.length > 0) {
        const penalty = duplicateNiches.length * 20;
        score -= penalty;
        reasoning.push(`⚠️ Over-specializes in: ${duplicateNiches.join(', ')} (-${penalty})`);
      }
    }

    // Apply large negative penalty for trash operators - makes them almost impossible to recommend
    if (trashOperators.has(operatorId)) {
      const trashPenalty = 10000; // Large penalty that makes trash operators virtually unrecommendable
      score -= trashPenalty;
      reasoning.push(`🚫 Trash operator (-${trashPenalty})`);
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
    const hopePenalty = hopeCost * 20; // Large multiplier to make hope cost very significant
    score -= hopePenalty;
    reasoning.push(`💎 Hope cost penalty: ${hopeCost} hope (-${hopePenalty})`);

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

  // Helper function to get hope cost for an operator
  const getHopeCost = (rarity: number): number => {
    return hopeCosts[rarity] ?? 0;
  };


  useEffect(() => {
    if (user) {
      loadAllOperators();
      loadOwnedOperators();
      loadTrashOperators();
    }
  }, [user]);

  const loadTrashOperators = async () => {
    try {
      const response = await fetch('/api/trash-operators');
      if (response.ok) {
        const data = await response.json();
        const trashIds = new Set(data.operators?.map((op: any) => op.id) || []);
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

    // Note: Hope checking removed - users can add operators to team regardless of hope availability

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

    setLoading(true);
    setError(null);

    try {
      const operatorIds = selectedOperators.map(selected => selected.operatorId);
      const raisedOpsArray = Array.from(raisedOperators); // raisedOperators are the deployable operators

      const result = getIntegratedStrategiesRecommendation(
        allOperators,
        raisedOpsArray, // ONLY raised operators
        operatorIds,
        Array.from(requiredClasses),
        temporaryRecruitment || undefined,
        currentHope,
        hopeCosts,
        trashOperators
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
      <h1>Integrated Strategies Team Builder</h1>
      <p className="subtitle">Select your current operators and get recommendations for the next operator to add</p>

      {error && <div className="error">{error}</div>}

      <div className="team-selection-section">
        <h2>Your Current Team</h2>
        <p>Select operators you already own and plan to use in your Integrated Strategies team</p>

        <div className="selected-operators">
          {selectedOperators.map(selected => (
            <div key={selected.operatorId} className="selected-operator-card">
              <img
                src={selected.operator.profileImage || '/images/operators/placeholder.png'}
                alt={getOperatorName(selected.operator, language)}
                className="operator-image"
              />
              <div className="operator-info">
                <div className="operator-name">{getOperatorName(selected.operator, language)}</div>
                <Stars rarity={selected.operator.rarity} />
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
                    // Only show owned operators
                    if (!ownedOperators.has(op.id)) {
                      return false;
                    }

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
                      className={`operator-select-card rarity-${op.rarity}`}
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