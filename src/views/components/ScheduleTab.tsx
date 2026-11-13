import React, { useState, useEffect } from 'react';

interface ScheduleTabProps {
  onSessionExpired: () => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ onSessionExpired }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<any[]>([]);
  const [filterToday, setFilterToday] = useState(false);

  const fetchSchedule = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/schedule');
      if (resp.status === 401) {
        onSessionExpired();
        return;
      }
      if (!resp.ok) {
        const err = await resp.json();
        setError(err.detail || '获取课表失败');
        return;
      }
      const data = await resp.json();
      setCourses(data.courses || []);
    } catch (e: any) {
      setError(`请求失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  const todayDay = new Date().getDay() || 7; // 周一到周日: 1-7
  const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  const displayedCourses = filterToday
    ? courses.filter((c) => c.schedules?.some((s: any) => s.day === todayDay))
    : courses;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`scu-btn-secondary ${!filterToday ? 'active' : ''}`}
            onClick={() => setFilterToday(false)}
          >
            全部周课表 ({courses.length})
          </button>
          <button
            className={`scu-btn-secondary ${filterToday ? 'active' : ''}`}
            onClick={() => setFilterToday(true)}
          >
            今日日程 ({dayNames[todayDay]})
          </button>
        </div>
        <button className="scu-btn-secondary" onClick={fetchSchedule} title="刷新">
          🔄
        </button>
      </div>

      {loading && <div className="scu-empty">正在拉取教务处最新课表...</div>}
      {error && <div className="scu-empty" style={{ color: '#ef4444' }}>{error}</div>}

      {!loading && !error && displayedCourses.length === 0 && (
        <div className="scu-empty">当前没有排定的课程</div>
      )}

      {!loading && !error && displayedCourses.map((c, idx) => (
        <div key={`${c.courseNumber}-${idx}`} className="scu-card">
          <div className="scu-card-header">
            <span className="scu-course-name">{c.name}</span>
            <span className="scu-tag">{c.property || '课程'} · {c.credit}学分</span>
          </div>

          <div className="scu-meta-row">
            <span>👨‍🏫 {c.teacher || '教师未知'}</span>
            <span>🆔 {c.courseNumber}-{c.unitNumber}</span>
          </div>

          {c.schedules?.map((s: any, sIdx: number) => (
            <div
              key={sIdx}
              style={{
                marginTop: '6px',
                padding: '6px 8px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '4px',
                fontSize: '12px',
                borderLeft: s.day === todayDay ? '3px solid var(--scu-red)' : '3px solid var(--scu-border)',
              }}
            >
              <div style={{ fontWeight: 500, color: '#e5e7eb' }}>
                {dayNames[s.day]} 第 {s.startSession}~{s.startSession + s.continuingSessions - 1} 节
              </div>
              <div style={{ color: 'var(--scu-text-sub)', marginTop: '2px' }}>
                📍 {s.building} {s.classroom}
              </div>
              <div style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>
                周次: {s.weeks && s.weeks.length > 0 ? `${s.weeks[0]}~${s.weeks[s.weeks.length - 1]}周` : '全周'}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
