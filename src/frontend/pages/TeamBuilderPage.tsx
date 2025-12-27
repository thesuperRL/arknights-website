import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getOperatorName } from '../utils/operatorNameUtils';
import { getRarityClass } from '../utils/rarityUtils';
import Stars from '../components/Stars';
import './TeamBuilderPage.css';

interface TeamPreferences {
  requiredNiches: string[];
  preferredNiches: string[];
  minOperatorsPerNiche?: number;
  maxOperatorsPerNiche?: number;
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
  const [allNiches, setAllNiches] = useState<string[]>([]);
  const [teamResult, setTeamResult] = useState<TeamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadPreferences();
      loadNicheLists();
    }
  }, [user]);

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
        setError('Failed to load preferences');
      }
    }
  };

  const loadNicheLists = async () => {
    try {
      const response = await fetch('/api/niche-lists');
      if (response.ok) {
        const data = await response.json();
        setAllNiches(data.map((n: any) => n.niche));
      }
    } catch (err) {
      console.error('Error loading niche lists:', err);
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/team/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }
      
      alert('Preferences saved successfully!');
    } catch (err: any) {
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

  const updateRequiredNiches = (niche: string, add: boolean) => {
    if (!preferences) return;
    
    const newRequired = add
      ? [...preferences.requiredNiches, niche]
      : preferences.requiredNiches.filter(n => n !== niche);
    
    setPreferences({
      ...preferences,
      requiredNiches: newRequired,
      preferredNiches: preferences.preferredNiches.filter(n => n !== niche)
    });
  };

  const updatePreferredNiches = (niche: string, add: boolean) => {
    if (!preferences) return;
    
    const newPreferred = add
      ? [...preferences.preferredNiches, niche]
      : preferences.preferredNiches.filter(n => n !== niche);
    
    setPreferences({
      ...preferences,
      preferredNiches: newPreferred,
      requiredNiches: preferences.requiredNiches.filter(n => n !== niche)
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

        <div className="preference-group">
          <label>
            <input
              type="checkbox"
              checked={preferences.allowDuplicates || false}
              onChange={(e) => setPreferences({ ...preferences, allowDuplicates: e.target.checked })}
            />
            Allow multiple operators from same niche
          </label>
        </div>

        <div className="preference-group">
          <label>
            Min operators per niche:
            <input
              type="number"
              min="1"
              max="5"
              value={preferences.minOperatorsPerNiche || 1}
              onChange={(e) => setPreferences({ ...preferences, minOperatorsPerNiche: parseInt(e.target.value) || 1 })}
            />
          </label>
        </div>

        <div className="preference-group">
          <label>
            Max operators per niche:
            <input
              type="number"
              min="1"
              max="5"
              value={preferences.maxOperatorsPerNiche || 3}
              onChange={(e) => setPreferences({ ...preferences, maxOperatorsPerNiche: parseInt(e.target.value) || 3 })}
            />
          </label>
        </div>

        <div className="niche-selection">
          <h3>Required Niches</h3>
          <p className="help-text">These niches must be filled in the team</p>
          <div className="niche-list">
            {allNiches.map(niche => (
              <label key={niche} className="niche-checkbox">
                <input
                  type="checkbox"
                  checked={preferences.requiredNiches.includes(niche)}
                  onChange={(e) => updateRequiredNiches(niche, e.target.checked)}
                />
                {niche}
              </label>
            ))}
          </div>
        </div>

        <div className="niche-selection">
          <h3>Preferred Niches</h3>
          <p className="help-text">These niches are preferred but not required</p>
          <div className="niche-list">
            {allNiches.map(niche => (
              <label key={niche} className="niche-checkbox">
                <input
                  type="checkbox"
                  checked={preferences.preferredNiches.includes(niche)}
                  onChange={(e) => updatePreferredNiches(niche, e.target.checked)}
                />
                {niche}
              </label>
            ))}
          </div>
        </div>

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
          <div className="team-stats">
            <div className="stat">
              <strong>Score:</strong> {teamResult.score}
            </div>
            {teamResult.missingNiches.length > 0 && (
              <div className="stat warning">
                <strong>Missing Niches:</strong> {teamResult.missingNiches.join(', ')}
              </div>
            )}
          </div>

          <div className="team-grid">
            {teamResult.team.map((member, index) => (
              <div key={member.operatorId} className="team-member-card">
                <div className={`operator-card rarity-${member.operator.rarity}`}>
                  <img
                    src={member.operator.profileImage || '/images/operators/placeholder.png'}
                    alt={getOperatorName(member.operator, language)}
                    className="operator-image"
                  />
                  <div className="operator-info">
                    <div className="operator-name">{getOperatorName(member.operator, language)}</div>
                    <Stars rarity={member.operator.rarity} />
                    <div className="operator-class">{member.operator.class}</div>
                    {member.primaryNiche && (
                      <div className="primary-niche">Primary: {member.primaryNiche}</div>
                    )}
                    <div className="operator-niches">
                      {member.niches.slice(0, 3).map(niche => (
                        <span key={niche} className="niche-tag">{niche}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="coverage-section">
            <h3>Niche Coverage</h3>
            <div className="coverage-list">
              {Object.entries(teamResult.coverage).map(([niche, count]) => (
                <div key={niche} className="coverage-item">
                  <span className="niche-name">{niche}</span>
                  <span className="coverage-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamBuilderPage;

