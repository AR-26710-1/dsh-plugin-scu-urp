import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CourseGrabTabProps {
  onSessionExpired: () => void;
}

interface GrabCourse {
  course_id: string;
  seq_no: string;
  name: string;
  teacher?: string;
  seats_free: number;
  classroom?: string;
  plan_id?: string;
  schedule?: string;
  raw?: any;
}

interface GrabTask {
  course: GrabCourse;
  status: 'WAITING' | 'GRABBING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  attempts: number;
  last_message: string;
  group_id: number;
}

interface LogEntry {
  id: number;
  time: string;
  level: string;
  message: string;
}

const SERVICE_URL = 'http://127.0.0.1:48080';

export const CourseGrabTab: React.FC<CourseGrabTabProps> = ({ onSessionExpired }) => {
  // 选课阶段与搜索
  const [phases, setPhases] = useState<{ id: string; label: string; deal_type: number }[]>([
    { id: 'PLAN', label: '培养方案选课', deal_type: 2 },
    { id: 'SCHOOL', label: '校级公选课', deal_type: 3 },
    { id: 'DEPART', label: '院系课程', deal_type: 4 },
    { id: 'FREE', label: '自由选课(补退选)', deal_type: 5 },
  ]);
  const [selectedPhase, setSelectedPhase] = useState('FREE');
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GrabCourse[]>([]);
  const [searchMsg, setSearchMsg] = useState('');

  // 快速直添
  const [directCourseId, setDirectCourseId] = useState('');
  const [directSeqNo, setDirectSeqNo] = useState('');

  // 抢课任务队列
  const [tasks, setTasks] = useState<GrabTask[]>([]);
  const [taskMsg, setTaskMsg] = useState('');

  // 运行控制与统计
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({
    duration: '--:--:--',
    total_attempts: 0,
    success_count: 0,
    failed_count: 0,
    waiting_count: 0,
  });
  const [actionLoading, setActionLoading] = useState(false);

  // 参数设置
  const [sleepTime, setSleepTime] = useState(1.0);
  const [sleepJitter, setSleepJitter] = useState(0.2);
  const [showSettings, setShowSettings] = useState(false);

  // 终端日志
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');
  const lastLogIdRef = useRef<number>(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 1. 初始化拉取阶段、已存任务、设置与状态
  const initData = useCallback(async () => {
    try {
      // 阶段
      const phaseResp = await fetch(`${SERVICE_URL}/api/grab/phases`).catch(() => null);
      if (phaseResp && phaseResp.ok) {
        const d = await phaseResp.json();
        if (d.phases && d.phases.length > 0) setPhases(d.phases);
        if (d.current_phase) setSelectedPhase(d.current_phase);
      }

      // 任务
      const tasksResp = await fetch(`${SERVICE_URL}/api/grab/tasks`).catch(() => null);
      if (tasksResp && tasksResp.ok) {
        const d = await tasksResp.json();
        if (Array.isArray(d.tasks)) setTasks(d.tasks);
      }

      // 配置
      const cfgResp = await fetch(`${SERVICE_URL}/api/grab/config`).catch(() => null);
      if (cfgResp && cfgResp.ok) {
        const d = await cfgResp.json();
        if (d.sleep_time !== undefined) setSleepTime(d.sleep_time);
        if (d.sleep_jitter !== undefined) setSleepJitter(d.sleep_jitter);
      }

      // 状态
      const statusResp = await fetch(`${SERVICE_URL}/api/grab/status`).catch(() => null);
      if (statusResp && statusResp.ok) {
        const d = await statusResp.json();
        setIsRunning(d.is_running || false);
        setStats({
          duration: d.duration || '--:--:--',
          total_attempts: d.total_attempts || 0,
          success_count: d.success_count || 0,
          failed_count: d.failed_count || 0,
          waiting_count: d.waiting_count || 0,
        });
        if (Array.isArray(d.tasks) && d.tasks.length > 0) {
          setTasks(d.tasks);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    initData();
  }, [initData]);

  // 2. 轮询状态与增量日志
  useEffect(() => {
    let timer: any = null;

    const poll = async () => {
      try {
        const statusResp = await fetch(`${SERVICE_URL}/api/grab/status`).catch(() => null);
        if (statusResp && statusResp.ok) {
          const d = await statusResp.json();
          setIsRunning(d.is_running || false);
          setStats({
            duration: d.duration || '--:--:--',
            total_attempts: d.total_attempts || 0,
            success_count: d.success_count || 0,
            failed_count: d.failed_count || 0,
            waiting_count: d.waiting_count || 0,
          });
          if (Array.isArray(d.tasks)) {
            setTasks(d.tasks);
          }
        } else if (statusResp && statusResp.status === 401) {
          onSessionExpired();
          return;
        }

        // 拉取日志
        const logsResp = await fetch(`${SERVICE_URL}/api/grab/logs?since_id=${lastLogIdRef.current}`).catch(() => null);
        if (logsResp && logsResp.ok) {
          const ld = await logsResp.json();
          if (Array.isArray(ld.logs) && ld.logs.length > 0) {
            setLogs((prev) => {
              const combined = [...prev, ...ld.logs];
              return combined.slice(-250); // 保留最新 250 条
            });
            lastLogIdRef.current = ld.last_id || lastLogIdRef.current;
          }
        }
      } catch (_) {}
    };

    const intervalMs = isRunning ? 1200 : 5000;
    timer = setInterval(poll, intervalMs);
    poll();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, onSessionExpired]);

  // 日志自动滚动到底部
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 3. 搜索课程
  const handleSearch = async () => {
    const kw = keyword.trim();
    if (!kw) {
      setSearchMsg('请输入课程名或课程号关键词');
      return;
    }
    setSearching(true);
    setSearchMsg('');
    try {
      const resp = await fetch(
        `${SERVICE_URL}/api/grab/search?keyword=${encodeURIComponent(kw)}&phase=${selectedPhase}`
      );
      if (resp.status === 401) {
        onSessionExpired();
        return;
      }
      const data = await resp.json();
      if (!resp.ok) {
        setSearchMsg(data.detail || '搜索失败');
        return;
      }
      setSearchResults(data.courses || []);
      if (!data.courses || data.courses.length === 0) {
        setSearchMsg('未找到匹配的课程，请尝试更换关键词或选课阶段');
      }
    } catch (e: any) {
      setSearchMsg(`请求异常: ${e.message}`);
    } finally {
      setSearching(false);
    }
  };

  // 4. 保存队列到后端
  const syncTasksToBackend = async (newTasks: GrabTask[]) => {
    setTasks(newTasks);
    try {
      await fetch(`${SERVICE_URL}/api/grab/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: newTasks }),
      });
    } catch (_) {}
  };

  // 5. 加入队列
  const handleAddTask = (course: GrabCourse) => {
    const kcId = `${course.course_id}_${course.seq_no}`;
    if (tasks.some((t) => `${t.course.course_id}_${t.course.seq_no}` === kcId)) {
      setTaskMsg(`《${course.name}》已在抢课队列中`);
      setTimeout(() => setTaskMsg(''), 2500);
      return;
    }

    const newTask: GrabTask = {
      course,
      status: 'WAITING',
      attempts: 0,
      last_message: '已加入队列',
      group_id: 0,
    };
    const next = [...tasks, newTask];
    syncTasksToBackend(next);
    setTaskMsg(`已添加《${course.name}》`);
    setTimeout(() => setTaskMsg(''), 2000);
  };

  // 6. 手动直添
  const handleDirectAdd = () => {
    const cId = directCourseId.trim();
    const seq = directSeqNo.trim();
    if (!cId || !seq) {
      setTaskMsg('请完整填写课程号与课序号');
      setTimeout(() => setTaskMsg(''), 2500);
      return;
    }
    const c: GrabCourse = {
      course_id: cId,
      seq_no: seq,
      name: `直添课程_${cId}_${seq}`,
      seats_free: -1,
      classroom: '手动直添',
      schedule: '待抢到后确认',
    };
    handleAddTask(c);
    setDirectCourseId('');
    setDirectSeqNo('');
  };

  // 7. 调整队列
  const handleRemoveTask = (idx: number) => {
    const next = tasks.filter((_, i) => i !== idx);
    syncTasksToBackend(next);
  };

  const handleMoveTask = (idx: number, delta: number) => {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= tasks.length) return;
    const next = [...tasks];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    syncTasksToBackend(next);
  };

  const handleSetGroup = (idx: number, gid: number) => {
    const next = [...tasks];
    next[idx] = { ...next[idx], group_id: gid };
    syncTasksToBackend(next);
  };

  // 8. 启动与停止
  const handleStart = async () => {
    if (tasks.length === 0) {
      setTaskMsg('请先添加至少一门待抢课程');
      setTimeout(() => setTaskMsg(''), 3000);
      return;
    }
    setActionLoading(true);
    try {
      const resp = await fetch(`${SERVICE_URL}/api/grab/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks,
          sleep_time: sleepTime,
          sleep_jitter: sleepJitter,
          phase: selectedPhase,
        }),
      });
      if (resp.status === 401) {
        onSessionExpired();
        return;
      }
      const data = await resp.json();
      if (!resp.ok) {
        setTaskMsg(data.detail || '启动失败');
      } else {
        setIsRunning(true);
        setTaskMsg('抢课后台任务已启动');
      }
    } catch (e: any) {
      setTaskMsg(`启动异常: ${e.message}`);
    } finally {
      setActionLoading(false);
      setTimeout(() => setTaskMsg(''), 3000);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      const resp = await fetch(`${SERVICE_URL}/api/grab/stop`, { method: 'POST' });
      if (resp.ok) {
        setIsRunning(false);
        setTaskMsg('已发送停止请求');
      }
    } catch (_) {
    } finally {
      setActionLoading(false);
      setTimeout(() => setTaskMsg(''), 3000);
    }
  };

  // 保存设置
  const handleSaveSettings = async () => {
    try {
      await fetch(`${SERVICE_URL}/api/grab/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sleep_time: sleepTime, sleep_jitter: sleepJitter }),
      });
      setShowSettings(false);
    } catch (_) {}
  };

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'SUCCESS') return l.level === 'SUCCESS';
    if (logFilter === 'ERROR') return l.level === 'ERROR';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 顶部运行状态与控制卡片 */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--scu-border)',
          borderRadius: '8px',
          padding: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isRunning ? '#10b981' : '#a1a1aa',
                boxShadow: isRunning ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--scu-text-main)' }}>
              {isRunning ? '抢课进行中' : '空闲待命'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--scu-text-sub)' }}>
              (间隔 {sleepTime}s ±{sleepJitter}s)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="scu-btn-secondary"
              onClick={() => setShowSettings(!showSettings)}
              title="设置轮询参数"
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              ⚙️ 参数
            </button>
            {isRunning ? (
              <button
                className="scu-btn-secondary"
                onClick={handleStop}
                disabled={actionLoading}
                style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444', padding: '4px 12px' }}
              >
                ■ 停止抢课
              </button>
            ) : (
              <button
                className="scu-primary-btn"
                onClick={handleStart}
                disabled={actionLoading || tasks.length === 0}
                style={{ padding: '4px 14px', width: 'auto', fontSize: '12px' }}
              >
                ▶ 开始抢课 ({tasks.length})
              </button>
            )}
          </div>
        </div>

        {/* 4 项指标胶囊 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--scu-text-sub)' }}>运行时长</div>
            <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>{stats.duration}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--scu-text-sub)' }}>总尝试</div>
            <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px', color: '#38bdf8' }}>
              {stats.total_attempts}
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--scu-text-sub)' }}>已抢到</div>
            <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px', color: '#10b981' }}>
              {stats.success_count}
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--scu-text-sub)' }}>队列中</div>
            <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px', color: '#fbbf24' }}>
              {stats.waiting_count || tasks.length}
            </div>
          </div>
        </div>

        {taskMsg && (
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '6px', textAlign: 'center' }}>
            {taskMsg}
          </div>
        )}

        {/* 参数设置展开区 */}
        {showSettings && (
          <div
            style={{
              marginTop: '10px',
              padding: '10px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '6px',
              border: '1px solid var(--scu-border)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>抢课参数设置</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--scu-text-sub)' }}>刷新间隔(秒):</span>
              <input
                type="number"
                min="0.5"
                max="60"
                step="0.5"
                value={sleepTime}
                onChange={(e) => setSleepTime(parseFloat(e.target.value) || 1.0)}
                style={{ width: '60px', padding: '3px 6px', fontSize: '12px', background: '#111', color: '#fff', border: '1px solid var(--scu-border)', borderRadius: '4px' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--scu-text-sub)' }}>抖动(±秒):</span>
              <input
                type="number"
                min="0.0"
                max="10"
                step="0.1"
                value={sleepJitter}
                onChange={(e) => setSleepJitter(parseFloat(e.target.value) || 0.2)}
                style={{ width: '55px', padding: '3px 6px', fontSize: '12px', background: '#111', color: '#fff', border: '1px solid var(--scu-border)', borderRadius: '4px' }}
              />
              <button
                className="scu-primary-btn"
                onClick={handleSaveSettings}
                style={{ padding: '3px 10px', fontSize: '11px', width: 'auto' }}
              >
                保存
              </button>
            </div>
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
              💡 提示：抖动机制会在间隔上浮动随机数，有效避免被教务系统识别为机械化请求。
            </div>
          </div>
        )}
      </div>

      {/* 搜索与直添栏 */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--scu-border)',
          borderRadius: '8px',
          padding: '10px',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <select
            value={selectedPhase}
            onChange={(e) => setSelectedPhase(e.target.value)}
            style={{
              background: '#18181b',
              color: 'var(--scu-text-main)',
              border: '1px solid var(--scu-border)',
              borderRadius: '4px',
              padding: '4px 6px',
              fontSize: '12px',
            }}
          >
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="课程名或课号关键词..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1,
              background: '#18181b',
              color: 'var(--scu-text-main)',
              border: '1px solid var(--scu-border)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
            }}
          />
          <button
            className="scu-primary-btn"
            onClick={handleSearch}
            disabled={searching}
            style={{ width: 'auto', padding: '4px 12px', fontSize: '12px' }}
          >
            {searching ? '搜索中' : '搜索'}
          </button>
        </div>

        {/* 快速直添行 */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', paddingTop: '6px', borderTop: '1px dashed var(--scu-border)' }}>
          <span style={{ fontSize: '11px', color: 'var(--scu-text-sub)', whiteSpace: 'nowrap' }}>直接添加:</span>
          <input
            type="text"
            placeholder="课程号"
            value={directCourseId}
            onChange={(e) => setDirectCourseId(e.target.value)}
            style={{ width: '90px', background: '#18181b', color: '#fff', border: '1px solid var(--scu-border)', borderRadius: '4px', padding: '3px 6px', fontSize: '11px' }}
          />
          <input
            type="text"
            placeholder="序号"
            value={directSeqNo}
            onChange={(e) => setDirectSeqNo(e.target.value)}
            style={{ width: '50px', background: '#18181b', color: '#fff', border: '1px solid var(--scu-border)', borderRadius: '4px', padding: '3px 6px', fontSize: '11px' }}
          />
          <button
            className="scu-btn-secondary"
            onClick={handleDirectAdd}
            style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
          >
            + 加入队列
          </button>
        </div>

        {searchMsg && (
          <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px' }}>{searchMsg}</div>
        )}
      </div>

      {/* 搜索结果列表 */}
      {searchResults.length > 0 && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--scu-border)',
            borderRadius: '8px',
            padding: '10px',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
            <span>搜索结果 ({searchResults.length}门)</span>
            <button
              onClick={() => setSearchResults([])}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '11px', cursor: 'pointer' }}
            >
              清空
            </button>
          </div>
          {searchResults.map((c, i) => (
            <div
              key={`${c.course_id}-${c.seq_no}-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: '12px',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--scu-text-sub)', marginTop: '2px' }}>
                  <span>{c.course_id}-{c.seq_no}</span>
                  {c.teacher && <span> · {c.teacher}</span>}
                  {c.schedule && <span> · {c.schedule}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: c.seats_free > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: c.seats_free > 0 ? '#10b981' : '#ef4444',
                    fontWeight: 600,
                  }}
                >
                  余: {c.seats_free}
                </span>
                <button
                  className="scu-btn-secondary"
                  onClick={() => handleAddTask(c)}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                >
                  + 抢课
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 抢课队列管理 */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--scu-border)',
          borderRadius: '8px',
          padding: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>
            抢课目标队列 ({tasks.length} 门)
          </span>
          <span style={{ fontSize: '11px', color: 'var(--scu-text-sub)' }}>
            组号相同自动互斥抢课
          </span>
        </div>

        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--scu-text-sub)', fontSize: '12px' }}>
            暂无抢课任务，请在上方搜索或直添课程加入
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tasks.map((task, idx) => {
              const statusColor =
                task.status === 'SUCCESS'
                  ? '#10b981'
                  : task.status === 'FAILED'
                  ? '#ef4444'
                  : task.status === 'GRABBING'
                  ? '#38bdf8'
                  : '#a1a1aa';

              return (
                <div
                  key={`${task.course.course_id}-${task.course.seq_no}-${idx}`}
                  style={{
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--scu-border)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af' }}>#{idx + 1}</span>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{task.course.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--scu-text-sub)' }}>
                        ({task.course.course_id}-{task.course.seq_no})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: `${statusColor}22`,
                          color: statusColor,
                          fontWeight: 600,
                        }}
                      >
                        {task.status === 'SUCCESS'
                          ? '已抢到'
                          : task.status === 'FAILED'
                          ? '失败'
                          : task.status === 'GRABBING'
                          ? '抢课中'
                          : task.status === 'CANCELLED'
                          ? '已取消'
                          : '等待中'}
                      </span>
                      <button
                        onClick={() => handleMoveTask(idx, -1)}
                        disabled={idx === 0}
                        style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '11px' }}
                        title="上移优先级"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveTask(idx, 1)}
                        disabled={idx === tasks.length - 1}
                        style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '11px' }}
                        title="下移优先级"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => handleRemoveTask(idx)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                        title="移除任务"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--scu-text-sub)' }}>
                    <div>
                      {task.course.teacher && <span>教师: {task.course.teacher} · </span>}
                      <span>尝试: {task.attempts}次</span>
                      {task.last_message && <span style={{ marginLeft: '4px' }}>({task.last_message})</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>备选:</span>
                      <select
                        value={task.group_id}
                        onChange={(e) => handleSetGroup(idx, parseInt(e.target.value) || 0)}
                        style={{ background: '#111', color: '#fff', border: '1px solid var(--scu-border)', borderRadius: '3px', padding: '1px 4px', fontSize: '10px' }}
                      >
                        <option value={0}>0 (独立)</option>
                        <option value={1}>组1 (备选)</option>
                        <option value={2}>组2 (备选)</option>
                        <option value={3}>组3 (备选)</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 实时终端日志控制台 */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.45)',
          border: '1px solid var(--scu-border)',
          borderRadius: '8px',
          padding: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>终端日志</span>
            <span style={{ fontSize: '10px', color: 'var(--scu-text-sub)' }}>({filteredLogs.length}条)</span>
          </div>

          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {(['ALL', 'SUCCESS', 'ERROR'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setLogFilter(filter)}
                style={{
                  background: logFilter === filter ? '#3f3f46' : 'transparent',
                  border: '1px solid var(--scu-border)',
                  color: logFilter === filter ? '#fff' : '#9ca3af',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                {filter === 'ALL' ? '全部' : filter === 'SUCCESS' ? '成功' : '警报'}
              </button>
            ))}
            <button
              onClick={() => setLogs([])}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '11px', cursor: 'pointer', marginLeft: '4px' }}
              title="清屏"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* 滚动日志视窗 */}
        <div
          ref={logContainerRef}
          style={{
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '11px',
            lineHeight: 1.5,
            height: '140px',
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '4px',
            padding: '6px 8px',
            color: '#e5e7eb',
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ color: '#6b7280' }}>暂无日志输出，启动抢课后将在此打印实时过程...</div>
          ) : (
            filteredLogs.map((l, idx) => {
              const color =
                l.level === 'SUCCESS'
                  ? '#10b981'
                  : l.level === 'ERROR'
                  ? '#ef4444'
                  : l.level === 'DEBUG'
                  ? '#6366f1'
                  : '#9ca3af';
              return (
                <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <span style={{ color: '#6b7280' }}>[{l.time}]</span>{' '}
                  <span style={{ color, fontWeight: 600 }}>[{l.level}]</span>{' '}
                  <span>{l.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
