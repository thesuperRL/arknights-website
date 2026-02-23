import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../translations';
import './Navbar.css';

const Navbar: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          🎯 {t('nav.title')}
        </Link>
        <div className="nav-links">
          <Link to="/">{t('nav.home')}</Link>
          <Link to="/tier-lists">{t('nav.tierLists')}</Link>
          <Link to="/synergies">{t('nav.synergies')}</Link>
          <Link to="/all-operators">{t('nav.allOperators')}</Link>
          {!loading && (
            <>
              {user ? (
                <>
                  <Link to="/team-builder">{t('nav.teamBuilder')}</Link>
                  <Link to="/integrated-strategies">{t('nav.integratedStrategies')}</Link>
                  <Link to="/profile">{user.nickname}</Link>
                  <button onClick={handleLogout} className="nav-logout">
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                  <>
                    <Link to="/login">{t('nav.login')}</Link>
                    <Link to="/register">{t('nav.register')}</Link>
                  </>
                )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

