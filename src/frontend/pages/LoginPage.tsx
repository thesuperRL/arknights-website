import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [server, setServer] = useState<('en' | 'jp' | 'kr' | 'cn')>('en');
  const [step, setStep] = useState<'email' | 'code' | 'skland'>('email');
  const [cred, setCred] = useState('');
  const [uid, setUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading: authLoading, checkAuth } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/profile');
    }
  }, [user, authLoading, navigate]);

  // Reset form when server changes
  useEffect(() => {
    setStep(server === 'cn' ? 'skland' : 'email');
    setEmail('');
    setCode('');
    setCred('');
    setUid('');
    setError(null);
    setMessage(null);
  }, [server]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (server === 'cn') {
      setStep('skland');
      return;
    }
    
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/sendcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, server }),
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send code');
      }

      setMessage('Login code sent to your email! Please check your inbox.');
      setStep('code');
    } catch (err: any) {
      setError(err.message || 'Failed to send login code');
    } finally {
      setLoading(false);
    }
  };

  const handleGetBindings = async () => {
    if (!cred) {
      setError('Please enter your Skland cred token');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/skland/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cred }),
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get game bindings');
      }

      // Extract UID from bindings
      const bindings = data.bindings?.list?.[0]?.bindingList?.[0];
      if (bindings) {
        setUid(bindings.uid);
        setMessage(`Found account: ${bindings.nickName || bindings.uid}`);
      } else {
        setError('No Arknights account found. Please check your cred token.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get game bindings');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      let response;
      if (server === 'cn') {
        if (!cred || !uid) {
          throw new Error('Cred token and UID are required');
        }
        response = await fetch('/api/auth/skland/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cred, uid }),
          credentials: 'include'
        });
      } else {
        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, server }),
          credentials: 'include'
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Refresh auth state
      await checkAuth();
      
      // Redirect to profile page
      navigate('/profile');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Login to Arknights</h1>
        <p className="login-description">
          Connect your Arknights account to view your operators and track your collection.
        </p>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        {step === 'email' ? (
          <form onSubmit={handleSendCode} className="login-form">
            <div className="form-group">
              <label htmlFor="server">Server:</label>
              <select
                id="server"
                value={server}
                onChange={(e) => setServer(e.target.value as 'en' | 'jp' | 'kr' | 'cn')}
                className="form-input"
              >
                <option value="en">Global (EN)</option>
                <option value="jp">Japan (JP)</option>
                <option value="kr">Korea (KR)</option>
                <option value="cn">China (CN)</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="email">Email:</label>
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
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Sending...' : 'Send Login Code'}
            </button>
          </form>
        ) : step === 'skland' ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="cred">Skland Cred Token:</label>
              <input
                id="cred"
                type="text"
                value={cred}
                onChange={(e) => setCred(e.target.value)}
                placeholder="Enter your Skland cred token"
                className="form-input"
                required
              />
              <p className="form-hint">
                Get your cred token from the Skland app or website. 
                Check the Skland API documentation for instructions.
              </p>
            </div>
            <div className="form-group">
              <label htmlFor="uid">UID (optional - will be fetched if not provided):</label>
              <input
                id="uid"
                type="text"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="Enter UID or click 'Get Bindings'"
                className="form-input"
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                onClick={handleGetBindings}
                className="secondary-button"
                disabled={loading || !cred}
              >
                {loading ? 'Loading...' : 'Get Bindings'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCred('');
                  setUid('');
                  setError(null);
                  setMessage(null);
                }}
                className="secondary-button"
              >
                Back
              </button>
              <button type="submit" className="login-button" disabled={loading || !cred || !uid}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="code">Login Code:</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter 6-digit code"
                className="form-input"
                required
                maxLength={6}
              />
              <p className="form-hint">Check your email for the login code</p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                  setMessage(null);
                }}
                className="secondary-button"
              >
                Back
              </button>
              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </form>
        )}

        <p className="login-info">
          {server === 'cn' 
            ? 'CN server uses the Skland API. You need to provide your Skland cred token to authenticate.'
            : 'This uses the ArkPRTS API to securely authenticate with your Arknights account. Your credentials are never stored on our servers.'}
        </p>
        <p className="login-info" style={{ marginTop: '1rem' }}>
          <Link to="/local-login" style={{ color: '#5aee90' }}>Login with local account</Link> or <Link to="/register" style={{ color: '#5aee90' }}>create one</Link> if you don't have an Arknights account.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;

