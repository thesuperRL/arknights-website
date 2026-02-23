import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../translations';
import './LanguageSelector.css';

const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  return (
    <div className="language-selector">
      <label htmlFor="language-select">{t('footer.language')}:</label>
      <select
        id="language-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'cn' | 'tw' | 'jp' | 'kr')}
        className="language-select"
      >
        <option value="en">{t('languageOptions.en')}</option>
        <option value="cn">{t('languageOptions.cn')}</option>
        <option value="tw">{t('languageOptions.tw')}</option>
        <option value="jp">{t('languageOptions.jp')}</option>
        <option value="kr">{t('languageOptions.kr')}</option>
      </select>
    </div>
  );
};

export default LanguageSelector;







