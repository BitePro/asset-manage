import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

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

  return (
    <div className="search-container">
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
      {/* <div className="search-results">
        {resultCount !== null && (
          <span id="searchCount">
            {resultCount > 0 ? `找到 ${resultCount} 个匹配的文件` : '未找到匹配的文件'}
          </span>
        )}
      </div> */}
    </div>
  );
}