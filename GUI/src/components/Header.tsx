import { useState, useRef, useEffect } from 'react';
import { Stats } from '../types';
import { useI18n } from '../contexts/I18nContext';

interface HeaderProps {
  stats: Stats;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function Header({ isRefreshing, onRefresh }: HeaderProps) {
  const { t, locale, setLocale } = useI18n();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const langLabel = locale === 'zh' ? '中文' : 'English';

  return (
    <div className="header">
      <div>
        <div className="title">{t('title')}</div>
      </div>
      <div className="header-actions">
        <div className="lang-selector" ref={menuRef}>
          <button
            className={`lang-btn ${showLangMenu ? 'active' : ''}`}
            onClick={() => setShowLangMenu(!showLangMenu)}
            title={t('language')}
          >
            🌐 {langLabel} ▼
          </button>
          {showLangMenu && (
            <div className="lang-menu">
              <div
                className={`lang-item ${locale === 'zh' ? 'active' : ''}`}
                onClick={() => { setLocale('zh'); setShowLangMenu(false); }}
              >
                中文
              </div>
              <div
                className={`lang-item ${locale === 'en' ? 'active' : ''}`}
                onClick={() => { setLocale('en'); setShowLangMenu(false); }}
              >
                English
              </div>
            </div>
          )}
        </div>
        <button 
          className={`btn ${isRefreshing ? 'loading' : ''}`}
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? t('refreshing') : t('refresh')}
        </button>
      </div>
    </div>
  );
}