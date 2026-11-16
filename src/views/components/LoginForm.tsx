import React, { useState, useEffect, useRef } from 'react';

interface LoginFormProps {
  onLoginSuccess: (studentName: string) => void;
  savedUsername?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, savedUsername = '' }) => {
  const [authTab, setAuthTab] = useState<'unified' | 'qrcode' | 'legacy'>('unified');
  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 本地硬件加密记住的凭据与快捷填入
  const [savedCreds, setSavedCreds] = useState<{ username: string; password?: string; authType?: string; studentName?: string } | null>(null);
  const [autoFillTip, setAutoFillTip] = useState('');

  // 挂载时拉取本地已保存的密码凭据
  useEffect(() => {
    async function loadSaved() {
      try {
        const resp = await fetch('http://127.0.0.1:48080/api/auth/saved-credentials');
        if (resp.ok) {
          const d = await resp.json();
          if (d.hasSaved && d.username && d.password) {
            setSavedCreds(d);
            setUsername(d.username);
            setPassword(d.password);
            if (d.authType === 'legacy_urp') {
              setAuthTab('legacy');
            } else {
              setAuthTab('unified');
            }
          }
        }
      } catch (_) {}
    }
    loadSaved();
  }, []);

  const handleAutoFill = () => {
    if (savedCreds) {
      setUsername(savedCreds.username);
      if (savedCreds.password) setPassword(savedCreds.password);
      if (savedCreds.authType === 'legacy_urp') setAuthTab('legacy');
      else setAuthTab('unified');
      setAutoFillTip('已快捷填入已保存的凭据');
      setTimeout(() => setAutoFillTip(''), 3000);
    }
  };

  // 扫码登录专用
  const [qrCodeData, setQrCodeData] = useState<{ code: string; qrcode: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrStatusText, setQrStatusText] = useState('');
  const pollTimerRef = useRef<any>(null);

  const fetchNewQrCode = async () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setQrLoading(true);
    setQrStatusText('正在获取统一认证动态二维码...');
    setErrorMsg('');
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/auth/qrcode/new');
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || '获取二维码失败');
      setQrCodeData(data);
      setQrStatusText('等待微川大或智慧川大 APP 扫码确认...');
      startPolling(data.code);
    } catch (err: any) {
      setQrStatusText(`获取失败: ${err.message}`);
    } finally {
      setQrLoading(false);
    }
  };

  const startPolling = (code: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`http://127.0.0.1:48080/api/auth/qrcode/status?code=${encodeURIComponent(code)}`);
        const data = await resp.json();
        if (data.status === 'SUCCESS') {
          clearInterval(pollTimerRef.current);
          setQrStatusText('统一认证扫码成功！教务与电费系统已无缝打通');
          onLoginSuccess(data.studentName || data.username);
        } else if (data.status === 'EXPIRED') {
          clearInterval(pollTimerRef.current);
          setQrStatusText('二维码已失效，请点击刷新');
        } else {
          setQrStatusText(data.message || '等待微川大或智慧川大 APP 扫码确认...');
        }
      } catch {}
    }, 2000);
  };

  useEffect(() => {
    if (authTab === 'qrcode') {
      fetchNewQrCode();
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [authTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMsg('请输入学号和密码');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    try {
      const authType = authTab === 'unified' ? 'unified_sso' : 'legacy_urp';
      const resp = await fetch('http://127.0.0.1:48080/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, authType, remember }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setErrorMsg(data.detail || '认证失败，请检查账号密码');
      } else {
        if (remember) {
          setSavedCreds({ username, password, authType, studentName: data.studentName || username });
        }
        onLoginSuccess(data.studentName || username);
      }
    } catch (err: any) {
      setErrorMsg(`连接本地服务失败: ${err.message}，请确认本地 Python 后端已启动。`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scu-card" style={{ marginTop: '20px', padding: '20px' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>四川大学统一身份认证接入</h3>
      <p style={{ fontSize: '12px', color: 'var(--scu-text-sub)', marginBottom: '16px', lineHeight: 1.5 }}>
        通过统一认证中枢，一次登录即可全量打通综合教务处与宿舍电费系统，本地硬件加密存储，支持记住密码与快捷自动填入。
      </p>

      {/* 记住密码快捷填入胶囊条 */}
      {savedCreds && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12px'
        }}>
          <div>
            <span>已安全记住本设备凭据: <strong>{savedCreds.username}</strong></span>
            {autoFillTip && <span style={{ color: '#10b981', marginLeft: '6px' }}>✓ {autoFillTip}</span>}
          </div>
          <button
            type="button"
            onClick={handleAutoFill}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'transparent',
              color: '#10b981',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            快捷填入
          </button>
        </div>
      )}

      {errorMsg && (
        <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '14px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {errorMsg}
        </div>
      )}

      {/* 极简切换 Tab */}
      <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.04)', padding: '3px', borderRadius: '8px', marginBottom: '18px' }}>
        <button
          type="button"
          onClick={() => { setAuthTab('unified'); setErrorMsg(''); }}
          style={{ flex: 1, padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: authTab === 'unified' ? '#fff' : 'transparent', fontWeight: authTab === 'unified' ? 600 : 400, boxShadow: authTab === 'unified' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          统一认证账密 (推荐)
        </button>
        <button
          type="button"
          onClick={() => { setAuthTab('qrcode'); setErrorMsg(''); }}
          style={{ flex: 1, padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: authTab === 'qrcode' ? '#fff' : 'transparent', fontWeight: authTab === 'qrcode' ? 600 : 400, boxShadow: authTab === 'qrcode' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          手机动态扫码
        </button>
        <button
          type="button"
          onClick={() => { setAuthTab('legacy'); setErrorMsg(''); }}
          style={{ flex: 1, padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: authTab === 'legacy' ? '#fff' : 'transparent', fontWeight: authTab === 'legacy' ? 600 : 400, boxShadow: authTab === 'legacy' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          教务旧密码
        </button>
      </div>

      {authTab === 'unified' && (
        <form onSubmit={handleSubmit}>
          <div className="scu-form-group">
            <label className="scu-form-label">川大学号</label>
            <input
              className="scu-input"
              type="text"
              placeholder="例如: 2024xxxxxxx"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="scu-form-group">
            <label className="scu-form-label">统一身份认证密码</label>
            <div style={{ position: 'relative' }}>
              <input
                className="scu-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="统一身份认证平台密码 (id.scu.edu.cn)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: 'var(--scu-text-sub)'
                }}
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--scu-text-sub)', marginBottom: '14px', lineHeight: 1.4 }}>
            💡 本地轻量神经网络秒级自动识别图形验证码，免手动输入；采用国密 SM2 非对称加密传输。
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
            <input
              type="checkbox"
              id="rememberMe"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="rememberMe" style={{ fontSize: '12px', color: 'var(--scu-text-sub)', cursor: 'pointer' }}>
              记住密码并在本地硬件安全加密存储（下次自动快捷填入）
            </label>
          </div>

          <button type="submit" className="scu-primary-btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? '正在验证并打通教务与电费...' : '一键登录并打通全部系统'}
          </button>
        </form>
      )}

      {authTab === 'qrcode' && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          {qrLoading ? (
            <div style={{ padding: '30px 0', fontSize: '13px', color: 'var(--scu-text-sub)' }}>
              正在生成统一认证动态二维码...
            </div>
          ) : qrCodeData?.qrcode ? (
            <div>
              <div style={{ display: 'inline-block', padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '12px' }}>
                <img src={qrCodeData.qrcode} alt="统一认证二维码" style={{ width: '160px', height: '160px', display: 'block' }} />
              </div>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
                {qrStatusText}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--scu-text-sub)', marginBottom: '14px' }}>
                请打开手机【微川大】微信公众号或【智慧川大 APP】扫码授权
              </div>
              <button type="button" onClick={fetchNewQrCode} className="scu-secondary-btn" style={{ fontSize: '12px', padding: '4px 12px' }}>
                刷新二维码
              </button>
            </div>
          ) : (
            <div>
              <p style={{ color: '#ef4444', fontSize: '12px' }}>{qrStatusText}</p>
              <button type="button" onClick={fetchNewQrCode} className="scu-secondary-btn">重新生成二维码</button>
            </div>
          )}
        </div>
      )}

      {authTab === 'legacy' && (
        <form onSubmit={handleSubmit}>
          <div className="scu-form-group">
            <label className="scu-form-label">川大学号</label>
            <input
              className="scu-input"
              type="text"
              placeholder="例如: 2024xxxxxxx"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="scu-form-group">
            <label className="scu-form-label">教务系统专属密码</label>
            <div style={{ position: 'relative' }}>
              <input
                className="scu-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="四川大学综合教务系统独立密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: 'var(--scu-text-sub)'
                }}
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--scu-text-sub)', marginBottom: '14px' }}>
            ⚠️ 此通道仅登录教务系统，不自动绑定宿舍电费功能。
          </div>

          <button type="submit" className="scu-primary-btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? '正在验证教务处密码...' : '仅登录教务处'}
          </button>
        </form>
      )}
    </div>
  );
};
