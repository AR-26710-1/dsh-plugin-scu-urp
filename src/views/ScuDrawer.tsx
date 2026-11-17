import React, { useState, useEffect } from 'react';
import { ScheduleTab } from './components/ScheduleTab.js';
import { GradesTab } from './components/GradesTab.js';
import { ExamsTab } from './components/ExamsTab.js';
import { CourseGrabTab } from './components/CourseGrabTab.js';
import { LoginForm } from './components/LoginForm.js';

type TabType = 'schedule' | 'grades' | 'exams' | 'grab' | 'settings';

export const ScuDrawer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [statusLoading, setStatusLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);

  const checkStatus = async () => {
    setStatusLoading(true);
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/status');
      if (resp.ok) {
        const data = await resp.json();
        setHasCredentials(data.hasCredentials);
        setIsLoggedIn(data.isLoggedIn);
        setStudentName(data.studentName || data.username || '');
        if (!data.hasCredentials && !data.isLoggedIn) {
          setActiveTab('settings');
        }
      }
    } catch (e) {
      console.warn('教务处本地服务未响应');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('http://127.0.0.1:48080/api/logout', { method: 'POST' });
      setIsLoggedIn(false);
      setHasCredentials(false);
      setStudentName('');
      setActiveTab('settings');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="scu-drawer-container">
      {/* 头部标题与在线状态 */}
      <div className="scu-header">
        <div className="scu-title-group">
          <span className="scu-badge">SCU</span>
          <span className="scu-title">川大教务助手</span>
        </div>
        <div className="scu-status-indicator">
          <div className={`scu-dot ${isLoggedIn ? 'online' : ''}`} />
          <span>{isLoggedIn ? studentName || '已连接' : '未登录'}</span>
          {hasCredentials && (
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '11px',
                marginLeft: '6px',
              }}
              title="切换账号/登出"
            >
              退出
            </button>
          )}
        </div>
      </div>

      {/* 选项卡导航 */}
      <div className="scu-nav-tabs">
        <button
          className={`scu-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          课表
        </button>
        <button
          className={`scu-tab-btn ${activeTab === 'grades' ? 'active' : ''}`}
          onClick={() => setActiveTab('grades')}
        >
          成绩
        </button>
        <button
          className={`scu-tab-btn ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          考试
        </button>
        <button
          className={`scu-tab-btn ${activeTab === 'grab' ? 'active' : ''}`}
          onClick={() => setActiveTab('grab')}
        >
          选课
        </button>
        <button
          className={`scu-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          账号
        </button>
      </div>

      {/* 滚动内容区 */}
      <div className="scu-content-scroll">
        {statusLoading ? (
          <div className="scu-empty">正在连接本地服务...</div>
        ) : activeTab === 'settings' || (!hasCredentials && !isLoggedIn) ? (
          <LoginForm
            onLoginSuccess={(name) => {
              setIsLoggedIn(true);
              setHasCredentials(true);
              setStudentName(name);
              setActiveTab('schedule');
            }}
          />
        ) : (
          <>
            {activeTab === 'schedule' && (
              <ScheduleTab onSessionExpired={() => setActiveTab('settings')} />
            )}
            {activeTab === 'grades' && (
              <GradesTab onSessionExpired={() => setActiveTab('settings')} />
            )}
            {activeTab === 'exams' && (
              <ExamsTab onSessionExpired={() => setActiveTab('settings')} />
            )}
            {activeTab === 'grab' && (
              <CourseGrabTab onSessionExpired={() => setActiveTab('settings')} />
            )}
          </>
        )}
      </div>
    </div>
  );
};
