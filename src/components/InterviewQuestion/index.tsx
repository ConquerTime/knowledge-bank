import React, { useState } from 'react';
import styles from './styles.module.css';

interface InterviewQuestionProps {
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  answer: string;
  tags: string[];
  company?: string;
  followUp?: string[];
}

const InterviewQuestion: React.FC<InterviewQuestionProps> = ({
  question,
  difficulty,
  category,
  answer,
  tags,
  company,
  followUp
}) => {
  const [showAnswer, setShowAnswer] = useState(false);

  const getDifficultyInfo = (level: string) => {
    const difficultyMap = {
      easy: { text: '简单', color: 'success' },
      medium: { text: '中等', color: 'warning' },
      hard: { text: '困难', color: 'danger' }
    };
    return difficultyMap[level] || difficultyMap.easy;
  };

  const difficultyInfo = getDifficultyInfo(difficulty);

  const toggleAnswer = () => {
    setShowAnswer(!showAnswer);
  };

  return (
    <div className={`${styles.questionCard} ${styles[difficulty]}`}>
      <div className={styles.header}>
        <div className={styles.meta}>
          <span className={styles.category}>{category}</span>
          <span className={`${styles.difficulty} ${styles[difficultyInfo.color]}`}>
            {difficultyInfo.text}
          </span>
          {company && <span className={styles.company}>📍 {company}</span>}
        </div>
      </div>

      <div className={styles.questionContent}>
        <h4 className={styles.question}>{question}</h4>
        
        <div className={styles.tags}>
          {tags.map((tag, index) => (
            <span key={index} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.answerSection}>
        <button 
          className={styles.toggleButton}
          onClick={toggleAnswer}
          type="button"
        >
          {showAnswer ? '🙈 隐藏答案' : '👁️ 查看答案'}
        </button>
        
        {showAnswer && (
          <div className={styles.answerContent}>
            <div className={styles.answer}>
              <h5>💡 参考答案：</h5>
              <div dangerouslySetInnerHTML={{ __html: answer }} />
            </div>
            
            {followUp && followUp.length > 0 && (
              <div className={styles.followUp}>
                <h5>🔍 延伸问题：</h5>
                <ul>
                  {followUp.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewQuestion;