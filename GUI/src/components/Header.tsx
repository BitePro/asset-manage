import { Stats } from '../types';

interface HeaderProps {
  stats: Stats;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function Header({ isRefreshing, onRefresh }: HeaderProps) {
  return (
    <div className="header">
      <div>
        <div className="title">📦 静态资源</div>
      </div>
      <div className="header-actions">
        <button 
          className={`btn ${isRefreshing ? 'loading' : ''}`}
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? '⏳ 刷新中' : '🔄 刷新'}
        </button>
      </div>
    </div>
  );
}