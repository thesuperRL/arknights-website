import React from 'react';
import LanguageSelector from './LanguageSelector';
import './Footer.css';

// Replace this URL with your feedback form link
const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdYjDkbWio21WKQUTztoxWKF3yd_qCKBOuBMEHjJfMztFCS8g/viewform';

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <LanguageSelector />
        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-feedback-btn"
        >
          Feedback
        </a>
      </div>
    </footer>
  );
};

export default Footer;
