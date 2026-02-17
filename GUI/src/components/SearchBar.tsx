import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  sortBy: 'name' | 'size-asc' | 'size-desc';
  onSortChange: (sort: 'name' | 'size-asc' | 'size-desc') => void;
}

export default function SearchBar({ value, onChange, sortBy, onSortChange }: SearchBarProps) {
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
      onChange(localValue);
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  const toggleSortMenu = () => setShowSortMenu(!showSortMenu);

  const getSortLabel = () => {
    switch (sortBy) {
      case 'name': return '按名字排序';
      case 'size-asc': return '体积 小-大';
      case 'size-desc': return '体积 大-小';
      default: return '排序方式';
    }
  };

  return (
    <div className="search-container">
      <div className="sort-container" ref={menuRef}>
        <button 
          className={`sort-btn-wide ${showSortMenu ? 'active' : ''}`}
          onClick={toggleSortMenu}
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
              按名字排序
            </div>
            <div 
              className={`sort-item ${sortBy === 'size-asc' ? 'active' : ''}`} 
              onClick={() => { onSortChange('size-asc'); setShowSortMenu(false); }}
            >
              体积 小-大
            </div>
            <div 
              className={`sort-item ${sortBy === 'size-desc' ? 'active' : ''}`} 
              onClick={() => { onSortChange('size-desc'); setShowSortMenu(false); }}
            >
              体积 大-小
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
          placeholder="搜索文件路径或文件名..."
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
            title="清除搜索"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}