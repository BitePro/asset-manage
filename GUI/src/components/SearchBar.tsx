import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../contexts/I18nContext';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  mode: 'filename' | 'semantic';
  onModeChange: (mode: 'filename' | 'semantic') => void;
  onSemanticSearch: (value: string) => void;
  onBuildIndex: () => void;
  isSemanticBusy: boolean;
  showSemanticControls: boolean;
  sortBy: 'name' | 'size-asc' | 'size-desc';
  onSortChange: (sort: 'name' | 'size-asc' | 'size-desc') => void;
}

export default function SearchBar({
  value,
  onChange,
  mode,
  onModeChange,
  onSemanticSearch,
  onBuildIndex,
  isSemanticBusy,
  showSemanticControls,
  sortBy,
  onSortChange,
}: SearchBarProps) {
  const { t } = useI18n();
  const [localValue, setLocalValue] = useState(value);
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    if (showSemanticControls && mode === 'semantic') {
      onChange(newValue);
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    // 防抖处理
    timer.current = setTimeout(() => {
      onChange(newValue);
    }, 300);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (showSemanticControls && mode === 'semantic') {
        onSemanticSearch(localValue);
      } else {
        onChange(localValue);
      }
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  const toggleSortMenu = () => setShowSortMenu(!showSortMenu);

  const getSortLabel = () => {
    switch (sortBy) {
      case 'name': return t('sortByName');
      case 'size-asc': return t('sortBySizeAsc');
      case 'size-desc': return t('sortBySizeDesc');
      default: return t('sortLabel');
    }
  };

  return (
    <div className="search-container">
      {showSemanticControls && (
      <div className="search-toolbar">
        <div className="search-mode-toggle" role="group" aria-label={t('searchMode')}>
          <button
            className={`mode-btn ${mode === 'filename' ? 'active' : ''}`}
            onClick={() => onModeChange('filename')}
            type="button"
          >
            {t('fileSearchMode')}
          </button>
          <button
            className={`mode-btn ${mode === 'semantic' ? 'active' : ''}`}
            onClick={() => onModeChange('semantic')}
            type="button"
          >
            {t('semanticSearchMode')}
          </button>
        </div>
      </div>
      )}

      <div className="sort-container" ref={menuRef}>
        <button 
          className={`sort-btn-wide ${showSortMenu ? 'active' : ''}`}
          onClick={toggleSortMenu}
          disabled={showSemanticControls && mode === 'semantic'}
        >
          {getSortLabel()}
          <span className="dropdown-arrow">▼</span>
        </button>
        
        {showSortMenu && (
          <div className="sort-menu">
            <div 
              className={`sort-item ${sortBy === 'name' ? 'active' : ''}`} 
              onClick={() => { onSortChange('name'); setShowSortMenu(false); }}
            >
              {t('sortByName')}
            </div>
            <div 
              className={`sort-item ${sortBy === 'size-asc' ? 'active' : ''}`} 
              onClick={() => { onSortChange('size-asc'); setShowSortMenu(false); }}
            >
              {t('sortBySizeAsc')}
            </div>
            <div 
              className={`sort-item ${sortBy === 'size-desc' ? 'active' : ''}`} 
              onClick={() => { onSortChange('size-desc'); setShowSortMenu(false); }}
            >
              {t('sortBySizeDesc')}
            </div>
          </div>
        )}
      </div>

      <div className="search-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          id="searchInput"
          className="search-input"
          placeholder={showSemanticControls && mode === 'semantic' ? t('semanticSearchPlaceholder') : t('searchPlaceholder')}
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {localValue && (
          <button 
            className="clear-btn visible" 
            onClick={handleClear}
            title={t('clearSearch')}
          >
            ✕
          </button>
        )}
      </div>

      {showSemanticControls && mode === 'semantic' && (
        <div className="semantic-actions">
          <button
            className={`btn ${isSemanticBusy ? 'loading' : ''}`}
            onClick={() => onSemanticSearch(localValue)}
            disabled={isSemanticBusy || !localValue.trim()}
            type="button"
          >
            {isSemanticBusy ? t('semanticSearching') : t('semanticSearch')}
          </button>
          <button
            className="btn secondary"
            onClick={onBuildIndex}
            disabled={isSemanticBusy}
            type="button"
          >
            {t('buildImageIndex')}
          </button>
        </div>
      )}
    </div>
  );
}
