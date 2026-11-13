import React, { useState, useEffect } from 'react';

interface ExamsTabProps {
  onSessionExpired: () => void;
}

export const ExamsTab: React.FC<ExamsTabProps> = ({ onSessionExpired }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exams, setExams] = useState<any[]>([]);

  const fetchExams = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/exams');
      if (resp.status === 401) {
        onSessionExpired();
        return;
      }
      if (!resp.ok) {
        const err = await resp.json();
        setError(err.detail || '获取考试日程失败');
        return;
      }
      const data = await resp.json();
      setExams(data.exams || []);
    } catch (e: any) {
      setError(`请求失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--scu-text-sub)' }}>
          近 120 天内已排定考试 ({exams.length})
        </span>
        <button className="scu-btn-secondary" onClick={fetchExams} title="刷新">
          🔄
        </button>
      </div>

      {loading && <div className="scu-empty">正在拉取考试日程...</div>}
      {error && <div className="scu-empty" style={{ color: '#ef4444' }}>{error}</div>}

      {!loading && !error && exams.length === 0 && (
        <div className="scu-empty">近期暂无已排定的考试安排 🎉</div>
      )}

      {!loading && !error && exams.map((ex, idx) => (
        <div key={idx} className="scu-card" style={{ borderLeft: '3px solid var(--scu-red)' }}>
          <div className="scu-card-header">
            <span className="scu-course-name">{ex.courseName}</span>
            <span className="scu-tag">座位: {ex.seatNumber || '见考场'}</span>
          </div>

          <div className="scu-meta-row" style={{ marginTop: '8px' }}>
            <span>⏰ {ex.examTime}</span>
          </div>

          <div className="scu-meta-row" style={{ marginTop: '4px' }}>
            <span>📍 {ex.location || '具体考场待公布'}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
