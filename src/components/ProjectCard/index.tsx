import React from 'react';
import styles from './styles.module.css';

interface ProjectCardProps {
  title: string;
  techStack: string[];
  problem: string;
  solution: string;
  learnings: string;
  duration?: string;
  teamSize?: number;
  status?: 'completed' | 'in-progress' | 'planned';
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  title,
  techStack,
  problem,
  solution,
  learnings,
  duration,
  teamSize,
  status = 'completed'
}) => {
  const getStatusBadge = (status: string) => {
    const statusMap = {
      completed: { text: '已完成', color: 'success' },
      'in-progress': { text: '进行中', color: 'warning' },
      planned: { text: '计划中', color: 'info' }
    };
    return statusMap[status] || statusMap.completed;
  };

  const statusInfo = getStatusBadge(status);

  return (
    <div className={`${styles.projectCard} ${styles[status]}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <span className={`${styles.statusBadge} ${styles[statusInfo.color]}`}>
          {statusInfo.text}
        </span>
      </div>
      
      {(duration || teamSize) && (
        <div className={styles.meta}>
          {duration && <span className={styles.duration}>⏱️ {duration}</span>}
          {teamSize && <span className={styles.teamSize}>👥 {teamSize}人团队</span>}
        </div>
      )}

      <div className={styles.techStack}>
        {techStack.map((tech, index) => (
          <span key={index} className={styles.techTag}>
            {tech}
          </span>
        ))}
      </div>

      <div className={styles.content}>
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>🎯 遇到的问题</h4>
          <p className={styles.sectionContent}>{problem}</p>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>💡 解决方案</h4>
          <p className={styles.sectionContent}>{solution}</p>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>📚 收获总结</h4>
          <p className={styles.sectionContent}>{learnings}</p>
        </section>
      </div>
    </div>
  );
};

export default ProjectCard;