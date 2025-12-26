import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          🎯 Arknights Tier Lists
        </Link>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/all-operators">All Operators</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

