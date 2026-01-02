import { Stats } from '../types';
interface TabBarProps {
  activeTab: 'images' | 'media' | 'fonts' | 'office' | 'others';
  onTabChange: (tab: 'images' | 'media' | 'fonts' | 'office' | 'others') => void;
  stats: Stats;
}

export default function TabBar({ activeTab, onTabChange, stats }: TabBarProps) {
  const tabs = [
    { id: 'images' as const, label: '图片' },
    { id: 'media' as const, label: '音视频' },
    { id: 'fonts' as const, label: '字体' },
    { id: 'office' as const, label: '办公' },
    { id: 'others' as const, label: '其他' },
  ];

  return (
    <div className="tabbar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label} {stats?.[tab.id as keyof Stats] || 0}
        </button>
      ))}
    </div>
  );
}