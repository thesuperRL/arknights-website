import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { useTranslation } from '../translations';
import './AuthPage.css';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading: authLoading, checkAuth } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/profile');
    }
  }, [user, authLoading, navigate]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError(t('auth.passwordsNoMatch'));
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = data?.error || '';
        if (msg.toLowerCase().includes('already taken') || msg.toLowerCase().includes('username')) {
          setError(t('auth.usernameTaken'));
        } else if (msg.toLowerCase().includes('character') || msg.toLowerCase().includes('letters')) {
          setError(t('auth.usernameInvalid'));
        } else {
          setError(msg || t('auth.registerFailed'));
        }
        setLoading(false);
        return;
      }

      await checkAuth();
      navigate('/profile');
    } catch (err: any) {
      setError(err.message || t('auth.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>{t('auth.createAccount')}</h1>
        <p className="login-description">{t('auth.registerDesc')}</p>
        <p className="login-notice">{t('auth.passwordHashNotice')}</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleRegister} className="login-form">
          <div className="form-group">
            <label htmlFor="username">{t('auth.username')}:</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.usernamePlaceholder')}
              className="form-input"
              required
              minLength={2}
              maxLength={64}
              autoComplete="username"
            />
            <p className="form-hint">{t('auth.usernameInvalid')}</p>
          </div>
          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}:</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholderRegister')}
              className="form-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="form-hint">{t('auth.passwordTooShort')}</p>
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">{t('auth.confirmPassword')}:</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.confirmPasswordPlaceholder')}
              className="form-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? t('auth.creatingAccount') : t('auth.submitRegister')}
          </button>
        </form>

        <p className="login-info" style={{ marginTop: '1.5rem' }}>
          {t('auth.haveAccount')} <Link to="/login" style={{ color: '#5aee90' }}>{t('auth.loginHere')}</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
