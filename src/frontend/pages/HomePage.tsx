import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { animate, stagger } from 'animejs';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../translations';
import { usePageAnimate } from '../hooks/usePageAnimate';
import './HomePage.css';

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const pageRef = usePageAnimate();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const title = hero.querySelector('.hero-title');
    const subtitle = hero.querySelector('.hero-subtitle');
    const cta = hero.querySelector('.cta-button, .cta-buttons');
    if (title) {
      animate(title, { opacity: [0, 1], y: [16, 0], duration: 580, ease: 'outCubic' });
    }
    if (subtitle) {
      animate(subtitle, { opacity: [0, 1], y: [12, 0], duration: 500, delay: 120, ease: 'outCubic' });
    }
    if (cta) {
      animate(cta, { opacity: [0, 1], y: [12, 0], duration: 480, delay: 220, ease: 'outCubic' });
    }
  }, []);

  useEffect(() => {
    const section = pageRef.current?.querySelector('.features-section');
    if (!section) return;
    const cards = section.querySelectorAll('.feature-card');
    if (cards.length) {
      animate(cards, {
        opacity: [0, 1],
        y: [20, 0],
        duration: 420,
        delay: stagger(80, { from: 'first' }),
        ease: 'outCubic',
      });
    }
  }, []);

  useEffect(() => {
    const section = pageRef.current?.querySelector('.quick-links-section');
    if (!section) return;
    const cards = section.querySelectorAll('.quick-link-card');
    if (cards.length) {
      animate(cards, {
        opacity: [0, 1],
        y: [18, 0],
        duration: 400,
        delay: stagger(70, { from: 'first' }),
        ease: 'outCubic',
      });
    }
  }, []);

  return (
    <div className="home-page" ref={pageRef}>
      <div className="hero-section">
        <div className="hero-content" ref={heroRef}>
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
            <div className="feature-icon" aria-hidden="true">1</div>
            <h3>{t('home.smartRecs')}</h3>
            <p>{t('home.smartRecsDesc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" aria-hidden="true">2</div>
            <h3>{t('home.customPrefs')}</h3>
            <p>{t('home.customPrefsDesc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" aria-hidden="true">3</div>
            <h3>{t('home.nicheCoverage')}</h3>
            <p>{t('home.nicheCoverageDesc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" aria-hidden="true">4</div>
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
