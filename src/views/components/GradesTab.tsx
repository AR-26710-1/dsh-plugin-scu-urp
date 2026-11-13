import React, { useState, useEffect } from 'react';

interface GradesTabProps {
  onSessionExpired: () => void;
}

export const GradesTab: React.FC<GradesTabProps> = ({ onSessionExpired }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>({ grades: [], terms: [] });
  const [selectedTerm, setSelectedTerm] = useState('ALL');

  const fetchGrades = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/grades');
      if (resp.status === 401) {
        onSessionExpired();
        return;
      }
      if (!resp.ok) {
        const err = await resp.json();
        setError(err.detail || '获取成绩失败');
        return;
      }
      const res = await resp.json();
      setData(res);
    } catch (e: any) {
      setError(`请求失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrades();
  }, []);

  const gradesList = data.grades || [];
  const filteredGrades = selectedTerm === 'ALL'
    ? gradesList
    : gradesList.filter((g: any) => g.term === selectedTerm);

  return (
    <div>
      {/* 顶部总体指标 */}
      <div className="scu-stats-grid">
        <div className="scu-stat-box">
          <div className="scu-stat-val">{data.overallGpa ?? '--'}</div>
          <div className="scu-stat-label">总体平均学分绩点 (GPA)</div>
        </div>
        <div className="scu-stat-box">
          <div className="scu-stat-val">{data.totalCredit ?? '--'}</div>
          <div className="scu-stat-label">已修读总学分</div>
        </div>
      </div>

      {/* 学期筛选器 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <select
          className="scu-input"
          style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
          value={selectedTerm}
          onChange={(e) => setSelectedTerm(e.target.value)}
        >
          <option value="ALL">全部学期 ({gradesList.length}门)</option>
          {(data.terms || []).map((term: string) => (
            <option key={term} value={term}>
              {term}
            </option>
          ))}
        </select>
        <button className="scu-btn-secondary" onClick={fetchGrades} title="刷新">
          🔄
        </button>
      </div>

      {loading && <div className="scu-empty">正在拉取成绩并计算 GPA...</div>}
      {error && <div className="scu-empty" style={{ color: '#ef4444' }}>{error}</div>}

      {!loading && !error && filteredGrades.length === 0 && (
        <div className="scu-empty">该学期无成绩记录</div>
      )}

      {!loading && !error && filteredGrades.map((g: any, idx: number) => {
        const isPass = parseFloat(g.score) >= 60 || ['A', 'B', 'C', 'D', '优秀', '良好', '中等', '及格'].includes(g.gradeLevel);
        return (
          <div key={`${g.code}-${idx}`} className="scu-card">
            <div className="scu-card-header">
              <span className="scu-course-name">{g.name}</span>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: isPass ? 'var(--scu-green)' : '#ef4444',
                }}
              >
                {g.score}
              </span>
            </div>

            <div className="scu-meta-row" style={{ justifyContent: 'space-between' }}>
              <span>
                {g.property} · {g.credit} 学分 · 绩点: {g.gpa}
              </span>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>{g.term}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
