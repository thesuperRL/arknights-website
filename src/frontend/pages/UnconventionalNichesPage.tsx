import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../translations';
import { apiFetch } from '../api';
import { SpecialListOperatorCard, type SpecialListEntry } from '../components/SpecialListOperatorCard';
import '../components/OperatorCardStandard.css';
import './UnconventionalNichesPage.css';

interface UnconventionalNicheEntry {
  operatorId: string;
  note: string;
  operator: Operator | null;
}

interface UnconventionalNichesData {
  niche: string;
  description: string;
  lastUpdated: string;
  operators: UnconventionalNicheEntry[];
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

const UnconventionalNichesPage: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { t, getNicheName, getNicheDescription } = useTranslation();
  const [data, setData] = useState<UnconventionalNichesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadUnconventionalNiches();
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

  const loadUnconventionalNiches = async () => {
    try {
      const response = await apiFetch('/api/unconventional-niches-operators');
      if (!response.ok) {
        throw new Error('Failed to load unconventional niches operators');
      }
      const unconventionalData = await response.json() as UnconventionalNichesData;
      setData(unconventionalData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load unconventional niches operators');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading unconventional niches...</div>;
  }

  if (error || !data) {
    return <div className="error">{error || 'Unconventional niches data not found'}</div>;
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
    <div className="unconventional-niches-page">
      <div className="unconventional-niches-header">
        <Link to="/tier-lists" className="back-button">
          {t('nicheList.backToTierLists')}
        </Link>
        <h1>{getNicheName('unconventional-niches', data.niche)}</h1>
        <p>{getNicheDescription('unconventional-niches', data.description)}</p>
        <div className="meta">
          {t('common.lastUpdated')}: {data.lastUpdated} • {data.operators.length} {t('common.operators')}
        </div>
      </div>

      <div className="unconventional-niches-container">
        {data.operators.length === 0 ? (
          <div className="empty-message">
            No unconventional niches listed.
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

export default UnconventionalNichesPage;


