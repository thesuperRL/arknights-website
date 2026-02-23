import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../translations';
import { apiFetch } from '../api';
import { SpecialListOperatorCard, type SpecialListEntry } from '../components/SpecialListOperatorCard';
import '../components/OperatorCardStandard.css';
import './LowRarityPage.css';

interface LowRarityEntry {
  operatorId: string;
  note: string;
  operator: Operator | null;
}

interface LowRarityData {
  niche: string;
  description: string;
  lastUpdated: string;
  operators: LowRarityEntry[];
}

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

const LowRarityPage: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { t, getNicheName, getNicheDescription } = useTranslation();
  const [data, setData] = useState<LowRarityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadLowRarity();
    loadOwnedOperators();
  }, []);

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

  const loadLowRarity = async () => {
    try {
      const response = await apiFetch('/api/low-rarity-operators');
      if (!response.ok) {
        throw new Error('Failed to load low-rarity operators');
      }
      const lowRarityData = await response.json() as LowRarityData;
      setData(lowRarityData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load low-rarity operators');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading low-rarity operators...</div>;
  }

  if (error || !data) {
    return <div className="error">{error || 'Low-rarity operators data not found'}</div>;
  }

  // Sort operators: by rarity (higher first), then by global status, then by name
  const sortedOperators = [...data.operators].sort((a, b) => {
    const aRarity = a.operator?.rarity ?? 0;
    const bRarity = b.operator?.rarity ?? 0;
    // Sort by rarity (higher first)
    if (aRarity !== bRarity) {
      return bRarity - aRarity;
    }
    // Then by global status (global operators first)
    const aGlobal = a.operator?.global ?? false;
    const bGlobal = b.operator?.global ?? false;
    if (aGlobal !== bGlobal) {
      return aGlobal ? -1 : 1;
    }
    // Finally by name
    const aName = a.operator?.name ?? a.operatorId;
    const bName = b.operator?.name ?? b.operatorId;
    return aName.localeCompare(bName);
  });

  return (
    <div className="low-rarity-page">
      <div className="low-rarity-header">
        <Link to="/tier-lists" className="back-button">
          {t('nicheList.backToTierLists')}
        </Link>
        <h1>{getNicheName('low-rarity', data.niche)}</h1>
        <p>{getNicheDescription('low-rarity', data.description)}</p>
        <div className="meta">
          {t('common.lastUpdated')}: {data.lastUpdated} • {data.operators.length} {t('common.operators')}
        </div>
      </div>

      <div className="low-rarity-container">
        {data.operators.length === 0 ? (
          <div className="empty-message">
            No low-rarity operators listed.
          </div>
        ) : (
          <div className="operators-grid operator-cards-standard">
            {sortedOperators.map((entry, index) => (
              <SpecialListOperatorCard
                key={`${entry.operatorId}-${index}`}
                entry={entry as SpecialListEntry}
                language={language}
                isOwned={entry.operator ? ownedOperators.has(entry.operator.id) : false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LowRarityPage;


