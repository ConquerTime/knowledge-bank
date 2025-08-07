import React from 'react';
import styles from './styles.module.css';

interface TechTagProps {
  name: string;
  category?: 'frontend' | 'backend' | 'database' | 'tool' | 'language' | 'framework';
  level?: 'basic' | 'intermediate' | 'advanced';
  size?: 'small' | 'medium' | 'large';
  clickable?: boolean;
  onClick?: () => void;
}

const TechTag: React.FC<TechTagProps> = ({
  name,
  category = 'tool',
  level = 'basic',
  size = 'medium',
  clickable = false,
  onClick
}) => {
  const handleClick = () => {
    if (clickable && onClick) {
      onClick();
    }
  };

  return (
    <span 
      className={`${styles.techTag} ${styles[category]} ${styles[level]} ${styles[size]} ${clickable ? styles.clickable : ''}`}
      onClick={handleClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <span className={styles.icon}>{getCategoryIcon(category)}</span>
      <span className={styles.name}>{name}</span>
      {level !== 'basic' && <span className={styles.level}>{getLevelIndicator(level)}</span>}
    </span>
  );
};

const getCategoryIcon = (category: string): string => {
  const iconMap = {
    frontend: '🎨',
    backend: '⚙️',
    database: '🗄️',
    tool: '🔧',
    language: '📝',
    framework: '🏗️'
  };
  return iconMap[category] || '🔧';
};

const getLevelIndicator = (level: string): string => {
  const levelMap = {
    basic: '',
    intermediate: '⭐',
    advanced: '🏆'
  };
  return levelMap[level] || '';
};

export default TechTag;