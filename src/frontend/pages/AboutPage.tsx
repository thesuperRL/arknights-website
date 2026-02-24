import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../translations';
import './AboutPage.css';

const GITHUB_USER = 'thesuperRL';
const GITHUB_URL = `https://github.com/${GITHUB_USER}`;
const GITHUB_AVATAR_URL = `https://github.com/${GITHUB_USER}.png`;
const GITHUB_API_URL = `https://api.github.com/users/${GITHUB_USER}`;

interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [githubError, setGithubError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(GITHUB_API_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Not ok'))))
      .then((data: GitHubUser) => {
        if (!cancelled) setGithubUser(data);
      })
      .catch(() => {
        if (!cancelled) setGithubError(true);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="about-page">
      <div className="about-header">
        <Link to="/" className="about-back-link">{t('about.backToHome')}</Link>
        <h1>{t('about.title')}</h1>
        <p className="about-intro">{t('about.intro')}</p>
      </div>

      <div className="about-content">
        <section className="about-section about-creator">
          <h2>{t('about.creator')}</h2>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="about-github-embed"
            aria-label={`${t('about.viewProfileOnGitHub')} ${GITHUB_USER}`}
          >
            <div className="about-github-avatar-wrap">
              <img
                src={githubUser?.avatar_url ?? GITHUB_AVATAR_URL}
                alt=""
                className="about-github-avatar"
              />
            </div>
            <div className="about-github-body">
              <span className="about-github-username">@{GITHUB_USER}</span>
              {githubUser?.name && (
                <span className="about-github-name">{githubUser.name}</span>
              )}
              {githubUser?.bio && (
                <p className="about-github-bio">{githubUser.bio}</p>
              )}
              {!githubError && githubUser && (
                <div className="about-github-stats">
                  <span title={t('about.repos')}>{githubUser.public_repos} repos</span>
                  <span title={t('about.followers')}>{githubUser.followers} followers</span>
                  <span title={t('about.following')}>{githubUser.following} following</span>
                </div>
              )}
              <span className="about-github-link-text">{t('about.viewOnGitHub')}</span>
            </div>
          </a>

          <div className="about-discord">
            <span className="about-discord-label">{t('about.discord')}</span>
            <code className="about-discord-username">thesuperRL</code>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AboutPage;
