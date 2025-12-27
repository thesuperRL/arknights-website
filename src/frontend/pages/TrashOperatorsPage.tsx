import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './TrashOperatorsPage.css';

interface TrashOperatorEntry {
  operatorId: string;
  note: string;
  operator: Operator | null;
}

interface TrashOperatorsData {
  niche: string;
  description: string;
  lastUpdated: string;
  operators: TrashOperatorEntry[];
}

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
}

const TrashOperatorsPage: React.FC = () => {
  const [data, setData] = useState<TrashOperatorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrashOperators();
  }, []);

  const loadTrashOperators = async () => {
    try {
      const response = await fetch('/api/trash-operators');
      if (!response.ok) {
        throw new Error('Failed to load trash operators');
      }
      const trashData = await response.json() as TrashOperatorsData;
      setData(trashData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trash operators');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading trash operators...</div>;
  }

  if (error || !data) {
    return <div className="error">{error || 'Trash operators data not found'}</div>;
  }

  return (
    <div className="trash-operators-page">
      <div className="trash-operators-header">
        <Link to="/" className="back-button">
          ← Back to Home
        </Link>
        <h1>🗑️ {data.niche}</h1>
        <p>{data.description}</p>
        <div className="meta">
          Last updated: {data.lastUpdated} • {data.operators.length} operators
        </div>
      </div>

      <div className="trash-operators-container">
        {data.operators.length === 0 ? (
          <div className="empty-message">
            No trash operators listed. All operators have at least some use!
          </div>
        ) : (
          <div className="operators-grid">
            {data.operators.map((entry, index) => (
              <div 
                key={`${entry.operatorId}-${index}`} 
                className="operator-card trash"
                title={entry.note || undefined}
              >
                {entry.operator ? (
                  <>
                    <Link to={`/operator/${entry.operator.id}`} className="operator-image-link">
                      <img
                        src={entry.operator.profileImage || `/images/operators/${entry.operator.id || entry.operatorId}.png`}
                        alt={entry.operator.name}
                        className="operator-image"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target && !target.src.includes('data:image')) {
                            target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
                            target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                          }
                        }}
                        loading="lazy"
                      />
                    </Link>
                    <Link to={`/operator/${entry.operator.id}`} className="operator-name-link">
                      <div className="operator-name">{entry.operator.name}</div>
                    </Link>
                    <div className="operator-class">
                      {entry.operator.class} • {entry.operator.rarity}★
                    </div>
                    {entry.note && (
                      <div className="operator-note-tooltip">{entry.note}</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="operator-name">{entry.operatorId}</div>
                    <div className="operator-class">Operator not found</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrashOperatorsPage;


