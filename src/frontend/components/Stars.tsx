import React from 'react';
import './Stars.css';

interface StarsProps {
  rarity: number;
  size?: 'small' | 'medium' | 'large';
}

const Stars: React.FC<StarsProps> = ({ rarity, size = 'medium' }) => {
  const stars = Array.from({ length: 6 }, (_, i) => i < rarity);
  
  return (
    <div className={`stars stars-${size}`}>
      {stars.map((filled, index) => (
        <span
          key={index}
          className={`star ${filled ? 'star-filled' : 'star-empty'}`}
        >
          ★
        </span>
      ))}
    </div>
  );
};

export default Stars;

