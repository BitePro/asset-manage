import { Stats } from '../types';
import { useI18n } from '../contexts/I18nContext';

interface TabBarProps {
  activeTab: 'images' | 'media' | 'fonts' | 'office' | 'others';
  onTabChange: (tab: 'images' | 'media' | 'fonts' | 'office' | 'others') => void;
  stats: Stats;
}

export default function TabBar({ activeTab, onTabChange, stats }: TabBarProps) {
  const { t } = useI18n();
  const tabs = [
    { id: 'images' as const, labelKey: 'tabImages' as const },
    { id: 'media' as const, labelKey: 'tabMedia' as const },
    { id: 'fonts' as const, labelKey: 'tabFonts' as const },
    { id: 'office' as const, labelKey: 'tabOffice' as const },
    { id: 'others' as const, labelKey: 'tabOthers' as const },
  ];

  return (
    <div className="tabbar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {t(tab.labelKey)} {stats?.[tab.id as keyof Stats] || 0}
        </button>
      ))}
    </div>
  );
}