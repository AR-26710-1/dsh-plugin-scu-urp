import React, { useState } from 'react';

interface LoginFormProps {
  onLoginSuccess: (studentName: string) => void;
  savedUsername?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, savedUsername = '' }) => {
  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMsg('请输入学号和密码');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    try {
      const resp = await fetch('http://127.0.0.1:48080/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setErrorMsg(data.detail || '登录失败，请检查账号密码或校园网状态');
      } else {
        onLoginSuccess(data.studentName || username);
      }
    } catch (err: any) {
      setErrorMsg(`连接本地服务失败: ${err.message}，请确认本地 Python 后端已启动。`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scu-card" style={{ marginTop: '20px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>登录综合教务处</h3>
      <p style={{ fontSize: '12px', color: 'var(--scu-text-sub)', marginBottom: '14px' }}>
        凭据仅在本地安全对称加密存储，用于点开面板自动登录与查询
      </p>

      {errorMsg && (
        <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="scu-form-group">
          <label className="scu-form-label">学号 / 用户名</label>
          <input
            className="scu-input"
            type="text"
            placeholder="例如: 2021xxxxxxx"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="scu-form-group">
          <label className="scu-form-label">教务处密码</label>
          <input
            className="scu-input"
            type="password"
            placeholder="请输入教务系统登录密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <input
            type="checkbox"
            id="rememberMe"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <label htmlFor="rememberMe" style={{ fontSize: '12px', color: 'var(--scu-text-sub)', cursor: 'pointer' }}>
            记住密码（之后点开侧边栏自动登录）
          </label>
        </div>

        <button type="submit" className="scu-primary-btn" disabled={loading}>
          {loading ? '正在验证并登录教务处...' : '立即登录'}
        </button>
      </form>
    </div>
  );
};
