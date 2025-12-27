import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './HomePage.css';

const HomePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="home-page">
      <div className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Build Your Perfect Arknights Team</h1>
          <p className="hero-subtitle">
            Create optimized 12-operator teams based on your raised operators and preferences.
            Get intelligent team recommendations that cover all your niche requirements.
          </p>
          {user ? (
            <Link to="/team-builder" className="cta-button primary">
              Go to Team Builder
            </Link>
          ) : (
            <div className="cta-buttons">
              <Link to="/register" className="cta-button primary">
                Get Started
              </Link>
              <Link to="/login" className="cta-button secondary">
                Login
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="features-section">
        <h2 className="section-title">Why Use Our Team Builder?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>Smart Recommendations</h3>
            <p>
              Our algorithm analyzes your raised operators and generates teams that
              optimally cover required niches and roles.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚙️</div>
            <h3>Customizable Preferences</h3>
            <p>
              Set your rarity preferences, required niches, and preferred roles to
              build teams that match your playstyle.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Niche Coverage Tracking</h3>
            <p>
              See exactly which niches your team covers and identify any gaps
              that need to be filled.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔄</div>
            <h3>Easy Customization</h3>
            <p>
              Swap operators, adjust your team, and see real-time coverage updates
              as you make changes.
            </p>
          </div>
        </div>
      </div>

      <div className="quick-links-section">
        <h2 className="section-title">Explore More</h2>
        <div className="quick-links-grid">
          <Link to="/tier-lists" className="quick-link-card">
            <h3>Tier Lists</h3>
            <p>Browse operator niche lists and rankings</p>
          </Link>
          <Link to="/all-operators" className="quick-link-card">
            <h3>All Operators</h3>
            <p>View and search all Arknights operators</p>
          </Link>
          {user && (
            <Link to="/profile" className="quick-link-card">
              <h3>Your Profile</h3>
              <p>Manage your account and operator collection</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
