import { useState, useEffect } from 'react';

export default function PreviewOverlay() {
  const [bgValue, setBgValue] = useState(90);

  const updatePreviewBg = (value: number) => {
    const num = Math.min(100, Math.max(0, value));
    const gray = Math.round(255 * (1 - num / 100));
    const color = `rgba(${gray}, ${gray}, ${gray}, 0.9)`;
    
    document.documentElement.style.setProperty('--preview-bg', color);
    setBgValue(num);
  };

  useEffect(() => {
    updatePreviewBg(90);
  }, []);

  const getBgText = () => {
    if (bgValue >= 70) return '偏暗';
    if (bgValue <= 30) return '偏亮';
    return '中性';
  };

  return (
    <div className="preview-controls" onClick={(e) => e.stopPropagation()}>
      <span className="preview-control-label">背景</span>
      <input
        type="range"
        min="0"
        max="100"
        value={bgValue}
        aria-label="调整大图预览背景"
        onChange={(e) => updatePreviewBg(parseInt(e.target.value))}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <span className="preview-control-value">{getBgText()}</span>
    </div>
  );
}