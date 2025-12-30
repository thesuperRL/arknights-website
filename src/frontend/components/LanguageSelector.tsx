import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './LanguageSelector.css';

const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-selector">
      <label htmlFor="language-select">Operator Name Language:</label>
      <select
        id="language-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value as any)}
        className="language-select"
      >
        <option value="en">English</option>
        <option value="cn">简体中文 (Simplified Chinese)</option>
        <option value="tw">繁體中文 (Traditional Chinese)</option>
        <option value="jp">日本語 (Japanese)</option>
        <option value="kr">한국어 (Korean)</option>
      </select>
    </div>
  );
};

export default LanguageSelector;





