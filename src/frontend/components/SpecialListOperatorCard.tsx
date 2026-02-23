import { Link } from 'react-router-dom';
import { getImageUrl } from '../api';
import { getRarityClass } from '../utils/rarityUtils';
import { getOperatorName } from '../utils/operatorNameUtils';
import { useTranslation } from '../translations';
import type { Language } from '../utils/operatorNameUtils';

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';

export interface SpecialListOperator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
  global?: boolean;
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

export interface SpecialListEntry {
  operatorId: string;
  note: string;
  operator: SpecialListOperator | null;
}

interface SpecialListOperatorCardProps {
  entry: SpecialListEntry;
  language: Language;
  isOwned: boolean;
}

/** Standard operator card (same structure as niche/synergy lists) for the 5 special lists */
export function SpecialListOperatorCard({ entry, language, isOwned }: SpecialListOperatorCardProps) {
  const { translateClass, vocab } = useTranslation();
  const rarityClass = entry.operator ? getRarityClass(entry.operator.rarity) : '';
  const nonGlobal = entry.operator && !entry.operator.global;
  const unowned = !isOwned;

  return (
    <div
      className={`operator-card ${rarityClass} ${nonGlobal ? 'non-global' : ''} ${unowned ? 'unowned' : ''}`}
      title={entry.note || undefined}
    >
      {entry.operator ? (
        <>
          <Link to={`/operator/${entry.operator.id}`} className="operator-image-link">
            <div className="operator-image-container">
              <img
                src={getImageUrl(entry.operator.profileImage || `/images/operators/${entry.operator.id || entry.operatorId}.png`)}
                alt={entry.operator.name}
                className="operator-image"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target && !target.src.includes('data:image')) {
                    target.src = PLACEHOLDER_IMG;
                    target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                loading="lazy"
              />
            </div>
          </Link>
          <Link to={`/operator/${entry.operator.id}`} className="operator-name-link">
            <div className="operator-name">{getOperatorName(entry.operator, language)}</div>
          </Link>
          <div className="operator-class">
            {translateClass(entry.operator.class)} • {entry.operator.rarity}{vocab('star')}
          </div>
          {entry.note && (
            <div className="operator-note-tooltip">{entry.note}</div>
          )}
        </>
      ) : (
        <>
          <div className="operator-name">{entry.operatorId}</div>
          <div className="operator-class">{vocab('operator_not_found')}</div>
        </>
      )}
    </div>
  );
}
