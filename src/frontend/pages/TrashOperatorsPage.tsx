import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './TrashOperatorsPage.css';

interface TrashOperator {
  operatorId: string;
  notes?: string;
}

interface TrashOperatorsData {
  title: string;
  description: string;
  lastUpdated: string;
  operators: TrashOperator[];
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
  const [operatorsData, setOperatorsData] = useState<Record<string, Operator>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrashOperators();
    loadAllOperators();
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

  const loadAllOperators = async () => {
    try {
      const rarities = [1, 2, 3, 4, 5, 6];
      const allOperators: Record<string, Operator> = {};

      for (const rarity of rarities) {
        const response = await fetch(`/api/operators/rarity/${rarity}`);
        if (response.ok) {
          const operators = await response.json() as Record<string, Operator>;
          Object.assign(allOperators, operators);
        }
      }

      setOperatorsData(allOperators);
    } catch (err) {
      console.error('Error loading operators:', err);
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
        <h1>🗑️ {data.title}</h1>
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
            {data.operators.map((op, index) => {
              const operator = operatorsData[op.operatorId];
              return (
                <div key={`${op.operatorId}-${index}`} className="operator-card trash">
                  {operator ? (
                    <>
                      <Link to={`/operator/${operator.id}`} className="operator-image-link">
                        <img
                          src={operator.profileImage || '/images/operators/default.png'}
                          alt={operator.name}
                          className="operator-image"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (target && target.src !== '/images/operators/default.png') {
                              target.src = '/images/operators/default.png';
                            }
                          }}
                          loading="lazy"
                        />
                      </Link>
                      <Link to={`/operator/${operator.id}`} className="operator-name-link">
                        <div className="operator-name">{operator.name}</div>
                      </Link>
                      <div className="operator-class">
                        {operator.class} • {operator.rarity}★
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="operator-name">{op.operatorId}</div>
                      <div className="operator-class">Operator not found</div>
                    </>
                  )}
                  {op.notes && <div className="operator-notes">{op.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrashOperatorsPage;


