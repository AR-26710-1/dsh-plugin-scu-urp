/**
 * DeepSeek Harness - 四川大学教务系统 (URP) Web UI 客户端
 * 遵循 dsh-plugin-guide.md 规范
 * 注册到 sidebar.panellist (全局面板) 与 main 插槽 (主工作区页面)
 * 彻底消除悬浮窗，自适应原生主题与深浅色模式，修复退出会话逻辑
 */

window.__ModuleLoader__.load({
  id: '@local/scu-urp',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const SERVICE_URL = 'http://127.0.0.1:48080'

    // ================== 原生自适应样式定义 (无大红、完全跟随 DSH 主题 Token) ==================
    const S = {
      page: {
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        background: 'var(--dsw-alias-bg, inherit)',
        color: 'var(--dsw-alias-text, var(--dsw-alias-label-primary, inherit))',
        padding: '32px 40px',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      },
      container: {
        maxWidth: '960px',
        margin: '0 auto',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '20px',
        borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
        marginBottom: '24px',
      },
      title: {
        fontSize: '22px',
        fontWeight: 600,
        margin: 0,
        color: 'var(--dsw-alias-text, var(--dsw-alias-label-primary, inherit))',
      },
      subTitle: {
        fontSize: '13px',
        color: 'var(--dsw-alias-text-sub, var(--dsw-alias-label-secondary, #71717a))',
        marginTop: '4px',
      },
      badge: {
        display: 'inline-block',
        fontSize: '11px',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.1))',
        color: 'var(--dsw-alias-text, var(--dsw-alias-label-primary, inherit))',
        border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
        marginRight: '8px',
      },
      statusDot: (online) => ({
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: online ? '#10b981' : '#a1a1aa',
        display: 'inline-block',
        marginRight: '6px',
      }),
      tabBar: {
        display: 'flex',
        gap: '6px',
        background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
        padding: '4px',
        borderRadius: '8px',
        marginBottom: '24px',
        border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
      },
      tabBtn: (active) => ({
        padding: '8px 16px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        border: 'none',
        background: active ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
        color: active
          ? 'var(--dsw-alias-text, var(--dsw-alias-label-primary, inherit))'
          : 'var(--dsw-alias-text-sub, var(--dsw-alias-label-secondary, #71717a))',
        boxShadow: active ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
        transition: 'all 0.15s ease',
      }),
      card: {
        background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.04))',
        border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '14px',
        transition: 'border-color 0.15s ease',
      },
      btnSecondary: {
        padding: '6px 14px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
        border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
        color: 'var(--dsw-alias-text, var(--dsw-alias-label-primary, inherit))',
        transition: 'background 0.15s ease',
      },
      btnPrimary: {
        padding: '9px 18px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        background: 'var(--dsw-alias-text, var(--dsw-alias-label-primary, #18181b))',
        color: 'var(--dsw-alias-bg, #ffffff)',
        border: 'none',
        transition: 'opacity 0.15s ease',
      },
      input: {
        width: '100%',
        background: 'var(--dsw-alias-bg-input, var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05)))',
        border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.18))',
        color: 'var(--dsw-alias-text, var(--dsw-alias-label-primary, inherit))',
        padding: '9px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        outline: 'none',
        boxSizing: 'border-box',
        marginBottom: '14px',
      },
    }

    // ================== 图标组件 (侧边栏 18px 线性 Feather 图标) ==================
    function ScuIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M22 10v6M2 10l10-5 10 5-10 5z' }),
        h('path', { d: 'M6 12v5c0 3 6 3 6 3s6 0 6-3v-5' })
      )
    }

    // ================== 子页面 1：课表 ==================
    function ScheduleView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [courses, setCourses] = useState([])
      const [filterToday, setFilterToday] = useState(false)
      const todayDay = new Date().getDay() || 7
      const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

      const fetchSchedule = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/schedule`)
          if (resp.status === 401) return onRequireLogin()
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            setError(err.detail || '获取课表失败')
            return
          }
          const d = await resp.json()
          setCourses(d.courses || [])
        } catch (e) {
          setError(`网络异常: ${e.message}`)
        } finally {
          setLoading(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        fetchSchedule()
      }, [fetchSchedule])

      const list = filterToday
        ? courses.filter(c => c.schedules?.some(s => s.day === todayDay))
        : courses

      return h('div', null,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                background: !filterToday ? 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.15))' : 'transparent',
                fontWeight: !filterToday ? 600 : 500,
              },
              onClick: () => setFilterToday(false),
            }, `本学期全部课程 (${courses.length})`),
            h('button', {
              style: {
                ...S.btnSecondary,
                background: filterToday ? 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.15))' : 'transparent',
                fontWeight: filterToday ? 600 : 500,
              },
              onClick: () => setFilterToday(true),
            }, `今日日程 (${dayNames[todayDay]})`)
          ),
          h('button', { style: S.btnSecondary, onClick: fetchSchedule }, '刷新课表 🔄')
        ),

        loading && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在从四川大学综合教务处同步最新课表...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' } }, error),

        !loading && !error && list.length === 0 && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '14px' } }, '当前没有排定的课程'),

        !loading && !error && list.map((c, i) =>
          h('div', { key: i, style: S.card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '15px', fontWeight: 600 } }, c.name),
                h('span', { style: S.badge }, `${c.property || '课程'} · ${c.credit}学分`)
              ),
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `${c.courseNumber}-${c.unitNumber}`)
            ),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '10px' } },
              `👨‍🏫 授课教师: ${c.teacher || '待公布'}`
            ),
            c.schedules && c.schedules.length > 0
              ? c.schedules.map((s, sIdx) =>
                  h('div', {
                    key: sIdx,
                    style: {
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
                      border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      marginTop: '6px',
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    },
                  },
                    h('span', { style: { fontWeight: 500 } }, `${dayNames[s.day]} 第 ${s.startSession}~${s.startSession + s.continuingSessions - 1} 节`),
                    h('span', { style: { color: 'var(--dsw-alias-text-sub, #71717a)' } }, `📍 ${s.building} ${s.classroom}`),
                    h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, s.weeks?.length ? `${s.weeks[0]}~${s.weeks[s.weeks.length - 1]}周` : '全周')
                  )
                )
              : h('div', {
                  style: {
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
                    border: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                    marginTop: '6px',
                    fontSize: '12px',
                    color: 'var(--dsw-alias-text-sub, #71717a)',
                  },
                }, '💻 暂无固定排课地点或自主修读')
          )
        )
      )
    }

    // ================== 子页面 2：成绩与 GPA ==================
    function GradesView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [data, setData] = useState({ grades: [], terms: [] })
      const [selectedTerm, setSelectedTerm] = useState('ALL')

      const fetchGrades = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/grades`)
          if (resp.status === 401) return onRequireLogin()
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            setError(err.detail || '获取成绩失败')
            return
          }
          const d = await resp.json()
          setData(d)
        } catch (e) {
          setError(`网络异常: ${e.message}`)
        } finally {
          setLoading(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        fetchGrades()
      }, [fetchGrades])

      const gradesList = data.grades || []
      const filtered = selectedTerm === 'ALL'
        ? gradesList
        : gradesList.filter(g => g.term === selectedTerm)

      return h('div', null,
        // KPI 指标概览
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' } },
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '24px', fontWeight: 700 } }, data.overallGpa ?? '--'),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, '总平均学分绩点 (GPA)')
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '24px', fontWeight: 700 } }, data.overallAvgScore ?? '--'),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, '综合加权平均分')
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '24px', fontWeight: 700 } }, data.totalCredit ?? '--'),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, '累计修读总学分')
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '24px', fontWeight: 700 } }, data.totalCourses ?? '--'),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, '已获评课程总门数')
          )
        ),

        // 筛选栏
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '学期筛选:'),
            h('select', {
              style: {
                ...S.btnSecondary,
                padding: '6px 10px',
                outline: 'none',
              },
              value: selectedTerm,
              onChange: (e) => setSelectedTerm(e.target.value),
            },
              h('option', { value: 'ALL' }, `全部学期 (${gradesList.length})`),
              (data.terms || []).map(t => h('option', { key: t, value: t }, t))
            )
          ),
          h('button', { style: S.btnSecondary, onClick: fetchGrades }, '刷新成绩 🔄')
        ),

        loading && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在拉取成绩并重新折算绩点...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' } }, error),

        !loading && !error && filtered.map((g, i) => {
          const num = parseFloat(g.score)
          const pass = !isNaN(num) ? num >= 60 : ['A', 'B', 'C', 'D', '优秀', '良好', '中等', '及格', '合格', '通过'].includes(g.gradeLevel)
          return h('div', { key: i, style: S.card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('div', null,
                h('span', { style: { fontSize: '15px', fontWeight: 600 } }, g.name),
                h('span', { style: { ...S.badge, marginLeft: '8px' } }, `${g.property || '课程'} · ${g.credit}学分`)
              ),
              h('span', {
                style: {
                  fontSize: '18px',
                  fontWeight: 700,
                  color: pass ? 'var(--dsw-alias-text, inherit)' : '#ef4444',
                },
              }, g.score)
            ),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '8px' } },
              h('span', null, `绩点: ${g.gpa} · 等级: ${g.gradeLevel || '--'}`),
              h('span', null, g.term)
            )
          )
        })
      )
    }

    // ================== 子页面 3：考试日程 ==================
    function ExamsView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [exams, setExams] = useState([])

      const fetchExams = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/exams`)
          if (resp.status === 401) return onRequireLogin()
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            setError(err.detail || '获取考试安排失败')
            return
          }
          const d = await resp.json()
          setExams(d.exams || [])
        } catch (e) {
          setError(`网络异常: ${e.message}`)
        } finally {
          setLoading(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        fetchExams()
      }, [fetchExams])

      return h('div', null,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
          h('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `已排定考试 (${exams.length})`),
          h('button', { style: S.btnSecondary, onClick: fetchExams }, '刷新考试日程 🔄')
        ),

        loading && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在拉取考试日程...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' } }, error),

        !loading && !error && exams.length === 0 && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '14px' } }, '近期暂无已排定的考试安排 🎉'),

        !loading && !error && exams.map((ex, i) =>
          h('div', { key: i, style: S.card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
              h('span', { style: { fontSize: '15px', fontWeight: 600 } }, ex.courseName),
              h('span', { style: S.badge }, `座位: ${ex.seatNumber || '现场公布'}`)
            ),
            h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-text, inherit)', marginTop: '6px' } }, `⏰ 时间: ${ex.examTime}`),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, `📍 考场地点: ${ex.location || '待公布'}`)
          )
        )
      )
    }

    // ================== 子页面 4：凭据与设置（含稳定退出） ==================
    function SettingsView({ onLoginSuccess, onLogoutSuccess, isLoggedIn, studentName, hasCreds }) {
      const [username, setUsername] = useState('')
      const [password, setPassword] = useState('')
      const [remember, setRemember] = useState(true)
      const [submitting, setSubmitting] = useState(false)
      const [msg, setMsg] = useState({ text: '', isError: false })

      const handleLogin = async (e) => {
        e.preventDefault()
        if (!username || !password) return setMsg({ text: '请填写学号和教务密码', isError: true })
        setSubmitting(true)
        setMsg({ text: '', isError: false })
        try {
          const resp = await fetch(`${SERVICE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, remember }),
          })
          const d = await resp.json()
          if (!resp.ok) {
            setMsg({ text: d.detail || '登录失败，请检查账号密码', isError: true })
          } else {
            setMsg({ text: '登录成功并已更新本地凭据！', isError: false })
            onLoginSuccess(d.studentName || username)
          }
        } catch (err) {
          setMsg({ text: `连接后端服务失败: ${err.message}`, isError: true })
        } finally {
          setSubmitting(false)
        }
      }

      const handleLogout = async () => {
        try {
          await fetch(`${SERVICE_URL}/api/logout`, { method: 'POST' }).catch(() => {})
        } finally {
          // 彻底清空本地所有状态，确保退出必然成功
          setUsername('')
          setPassword('')
          setMsg({ text: '已成功退出登录并清除本地凭据缓存。', isError: false })
          onLogoutSuccess()
        }
      }

      return h('div', { style: { maxWidth: '520px', margin: '0 auto' } },
        h('div', { style: S.card },
          h('h3', { style: { margin: '0 0 10px 0', fontSize: '16px' } }, '教务处账号与凭据管理'),
          h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '18px', lineHeight: 1.5 } },
            '凭据在本地基于主机密钥进行对称加密安全存储，用于自动无感登录与会话保活。'
          ),

          isLoggedIn && h('div', {
            style: {
              padding: '12px 14px',
              borderRadius: '6px',
              background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
              marginBottom: '18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
          },
            h('div', null,
              h('div', { style: { fontSize: '13px', fontWeight: 600 } }, `当前已登录: ${studentName || '川大学生'}`),
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } }, '本地凭据有效且会话已在线')
            ),
            h('button', {
              style: {
                ...S.btnSecondary,
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              },
              onClick: handleLogout,
            }, '退出当前登录')
          ),

          msg.text && h('div', {
            style: {
              padding: '10px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '14px',
              background: msg.isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              color: msg.isError ? '#ef4444' : '#10b981',
            },
          }, msg.text),

          h('form', { onSubmit: handleLogin },
            h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 } }, '川大学号'),
            h('input', {
              style: S.input,
              type: 'text',
              placeholder: '例如 2021xxxxxxx',
              value: username,
              onChange: (e) => setUsername(e.target.value),
            }),
            h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 } }, '教务系统登录密码'),
            h('input', {
              style: S.input,
              type: 'password',
              placeholder: '综合教务系统密码',
              value: password,
              onChange: (e) => setPassword(e.target.value),
            }),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '20px', cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: remember,
                onChange: (e) => setRemember(e.target.checked),
              }),
              '记住凭据（打开 Harness 即可自动静默登录）'
            ),
            h('div', { style: { display: 'flex', gap: '10px' } },
              h('button', {
                type: 'submit',
                style: S.btnPrimary,
                disabled: submitting,
              }, submitting ? '正在验证并登录...' : (isLoggedIn ? '更新账号凭据' : '立即登录教务处')),
              isLoggedIn && h('button', {
                type: 'button',
                style: S.btnSecondary,
                onClick: handleLogout,
              }, '退出登录')
            )
          )
        )
      )
    }

    // ================== 全屏主工作区组件 (对应 main 插槽) ==================
    function ScuMainView() {
      const [activeTab, setActiveTab] = useState('schedule')
      const [statusChecked, setStatusChecked] = useState(false)
      const [isLoggedIn, setIsLoggedIn] = useState(false)
      const [hasCreds, setHasCreds] = useState(false)
      const [studentName, setStudentName] = useState('')

      const checkStatus = useCallback(async () => {
        try {
          const resp = await fetch(`${SERVICE_URL}/api/status`)
          if (resp.ok) {
            const d = await resp.json()
            setIsLoggedIn(d.isLoggedIn)
            setHasCreds(d.hasCredentials)
            setStudentName(d.studentName || d.username || '')
            if (!d.hasCredentials && !d.isLoggedIn) {
              setActiveTab('settings')
            }
          }
        } catch (_) {}
        setStatusChecked(true)
      }, [])

      useEffect(() => {
        checkStatus()
      }, [checkStatus])

      const handleLogoutSuccess = () => {
        setIsLoggedIn(false)
        setHasCreds(false)
        setStudentName('')
        setActiveTab('settings')
      }

      return h('div', { style: S.page },
        h('div', { style: S.container },
          // 顶部标题与状态栏
          h('div', { style: S.header },
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                h(ScuIcon, { size: 24 }),
                h('h1', { style: S.title }, '四川大学教务系统 (URP)')
              ),
              h('div', { style: S.subTitle }, '全自动登录 · 课表日程 · 全量成绩与 GPA 统计 · 考试安排')
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', fontSize: '13px' } },
                h('span', { style: S.statusDot(isLoggedIn) }),
                h('span', { style: { color: 'var(--dsw-alias-text-sub, #71717a)' } },
                  isLoggedIn ? `${studentName || '已连接'}` : '未连接教务处'
                )
              ),
              isLoggedIn && h('button', {
                style: { ...S.btnSecondary, color: '#ef4444' },
                onClick: async () => {
                  await fetch(`${SERVICE_URL}/api/logout`, { method: 'POST' }).catch(() => {})
                  handleLogoutSuccess()
                },
              }, '退出登录')
            )
          ),

          // Segmented 选项卡切换栏
          h('div', { style: S.tabBar },
            h('button', {
              style: S.tabBtn(activeTab === 'schedule'),
              onClick: () => setActiveTab('schedule'),
            }, '📅 课表日程'),
            h('button', {
              style: S.tabBtn(activeTab === 'grades'),
              onClick: () => setActiveTab('grades'),
            }, '📊 成绩与绩点'),
            h('button', {
              style: S.tabBtn(activeTab === 'exams'),
              onClick: () => setActiveTab('exams'),
            }, '📝 考试安排'),
            h('button', {
              style: S.tabBtn(activeTab === 'settings'),
              onClick: () => setActiveTab('settings'),
            }, '⚙️ 账号与凭据')
          ),

          // 主视图渲染
          !statusChecked && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在连接本地服务...'),

          statusChecked && (
            activeTab === 'settings' || (!hasCreds && !isLoggedIn)
              ? h(SettingsView, {
                  isLoggedIn,
                  studentName,
                  hasCreds,
                  onLoginSuccess: (name) => {
                    setIsLoggedIn(true)
                    setHasCreds(true)
                    setStudentName(name)
                    setActiveTab('schedule')
                  },
                  onLogoutSuccess: handleLogoutSuccess,
                })
              : h(React.Fragment, null,
                  activeTab === 'schedule' && h(ScheduleView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'grades' && h(GradesView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'exams' && h(ExamsView, { onRequireLogin: () => setActiveTab('settings') })
                )
          )
        )
      )
    }

    // ================== Cordis 插件注册逻辑 ==================
    return {
      inject: ['slots'],
      apply(ctx) {
        // 1. 注册主工作区视图 (用户点击侧栏项目后主区域整屏切换展示)
        ctx.slots.inject('main', () =>
          ctx.slots.register({
            name: 'main',
            key: 'scu-urp',
          }, ScuMainView)
        )

        // 2. 注册左侧边栏全局面板列表 (与“插件”、“上下文洞察”并列展示)
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'scu-urp',
            order: 25,
            label: () => '川大教务处',
          }, ScuIcon)
        )
      },
    }
  },
})
