import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          🎯 Arknights Tier Lists
        </Link>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/all-operators">All Operators</Link>
          {!loading && (
            <>
              {user ? (
                <>
                  <Link to="/profile">{user.nickname}</Link>
                  <button onClick={handleLogout} className="nav-logout">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/local-login">Login</Link>
                  <Link to="/register">Register</Link>
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

