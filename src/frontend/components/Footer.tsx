import React from 'react';
import { Link } from 'react-router-dom';
import LanguageSelector from './LanguageSelector';
import { useTranslation } from '../translations';
import './Footer.css';

// Replace this URL with your feedback form link
const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdYjDkbWio21WKQUTztoxWKF3yd_qCKBOuBMEHjJfMztFCS8g/viewform';

const Footer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <div className="footer-content">
        <Link to="/user-guide" className="footer-guide-link">{t('footer.userGuide')}</Link>
        <Link to="/changelog" className="footer-guide-link">{t('footer.changelog')}</Link>
        <LanguageSelector />
        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-feedback-btn"
        >
          {t('footer.feedback')}
        </a>
      </div>
    </footer>
  );
};

export default Footer;
