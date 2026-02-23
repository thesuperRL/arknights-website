import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { useTranslation } from '../translations';
import './AuthPage.css';

const LocalLoginPage: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading: authLoading, setUserDirect } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/profile');
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      let data: { error?: string };
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        const message =
          data.error ||
          (response.status === 401 ? t('auth.invalidEmailPassword') : response.status === 503 ? t('auth.serviceUnavailable') : t('auth.loginFailed'));
        throw new Error(message);
      }

      // Update auth state directly with data from login response (avoid redundant API call)
      if (data.user) {
        setUserDirect({
          email: data.user.email,
          nickname: data.user.nickname
        });
      }
      
      // Redirect to profile page
      navigate('/profile');
    } catch (err: any) {
      setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>{t('auth.login')}</h1>
        <p className="login-description">{t('auth.loginDesc')}</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">{t('auth.email')}:</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your-email@example.com"
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}:</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="form-input"
              required
            />
          </div>
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? t('auth.loggingIn') : t('auth.submitLogin')}
          </button>
        </form>

        <p className="login-info" style={{ marginTop: '1.5rem' }}>
          {t('auth.noAccount')} <Link to="/register" style={{ color: '#5aee90' }}>{t('auth.registerHere')}</Link>
        </p>
      </div>
    </div>
  );
};

export default LocalLoginPage;

