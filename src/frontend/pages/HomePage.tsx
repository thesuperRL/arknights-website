import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../translations';
import './HomePage.css';

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="home-page">
      <div className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">{t('home.heroTitle')}</h1>
          <p className="hero-subtitle">{t('home.heroSubtitle')}</p>
          {user ? (
            <Link to="/team-builder" className="cta-button primary">
              {t('home.goToTeamBuilder')}
            </Link>
          ) : (
            <div className="cta-buttons">
              <Link to="/register" className="cta-button primary">
                {t('home.getStarted')}
              </Link>
              <Link to="/login" className="cta-button secondary">
                {t('nav.login')}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="features-section">
        <h2 className="section-title">{t('home.whyUse')}</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>{t('home.smartRecs')}</h3>
            <p>{t('home.smartRecsDesc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚙️</div>
            <h3>{t('home.customPrefs')}</h3>
            <p>{t('home.customPrefsDesc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>{t('home.nicheCoverage')}</h3>
            <p>{t('home.nicheCoverageDesc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔄</div>
            <h3>{t('home.easyCustom')}</h3>
            <p>{t('home.easyCustomDesc')}</p>
          </div>
        </div>
      </div>

      <div className="quick-links-section">
        <h2 className="section-title">{t('home.exploreMore')}</h2>
        <div className="quick-links-grid">
          <Link to="/tier-lists" className="quick-link-card">
            <h3>{t('home.tierLists')}</h3>
            <p>{t('home.tierListsDesc')}</p>
          </Link>
          <Link to="/all-operators" className="quick-link-card">
            <h3>{t('allOperators.title')}</h3>
            <p>{t('home.allOperatorsDesc')}</p>
          </Link>
          {user && (
            <Link to="/profile" className="quick-link-card">
              <h3>{t('home.yourProfile')}</h3>
              <p>{t('home.yourProfileDesc')}</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
