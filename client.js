/**
 * DeepSeek Harness - 四川大学教务系统 (URP) Web UI 客户端
 * 遵循 dsh-plugin-guide.md 第 8 节 Web UI 规范
 */

window.__ModuleLoader__.load({
  id: '@local/scu-urp',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect } = React

    const SERVICE_URL = 'http://127.0.0.1:48080'

    // ================== 样式定义 (采用宿主主题变量 --dsw-alias-*) ==================
    const styles = {
      drawer: {
        position: 'fixed',
        top: 0,
        left: '56px', // 紧贴侧边栏 Rail
        bottom: 0,
        width: '380px',
        maxWidth: '85vw',
        background: 'var(--dsw-alias-bg-panel, #18181b)',
        color: 'var(--dsw-alias-text, #ffffff)',
        borderRight: '1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.12))',
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.1))',
        background: 'var(--dsw-alias-bg-header, #1f1f23)',
      },
      tabBar: {
        display: 'flex',
        borderBottom: '1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.1))',
        background: 'var(--dsw-alias-bg-sub, #141417)',
      },
      tabBtn: (active) => ({
        flex: 1,
        padding: '10px 0',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #c01920' : '2px solid transparent',
        color: active ? '#ef4444' : 'var(--dsw-alias-text-sub, #9ca3af)',
        fontWeight: active ? 600 : 500,
        fontSize: '13px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }),
      content: {
        flex: 1,
        overflowY: 'auto',
        padding: '14px',
        boxSizing: 'border-box',
      },
      card: {
        background: 'var(--dsw-alias-bg-card, rgba(255, 255, 255, 0.04))',
        border: '1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.08))',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '10px',
      },
      badge: {
        background: '#c01920',
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '4px',
      },
      input: {
        width: '100%',
        background: 'var(--dsw-alias-bg-input, #141417)',
        border: '1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.15))',
        color: 'var(--dsw-alias-text, #ffffff)',
        padding: '8px 10px',
        borderRadius: '6px',
        boxSizing: 'border-box',
        fontSize: '13px',
        outline: 'none',
        marginBottom: '10px',
      },
      primaryBtn: {
        width: '100%',
        background: '#c01920',
        color: '#ffffff',
        border: 'none',
        padding: '9px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
      },
      iconBtn: {
        background: 'transparent',
        border: 'none',
        color: 'var(--dsw-alias-text-sub, #9ca3af)',
        cursor: 'pointer',
        fontSize: '16px',
        padding: '4px',
      },
    }

    // ================== 子组件：登录表单 ==================
    function LoginForm({ onLoginSuccess, savedUsername }) {
      const [username, setUsername] = useState(savedUsername || '')
      const [password, setPassword] = useState('')
      const [remember, setRemember] = useState(true)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')

      const doLogin = async (e) => {
        e.preventDefault()
        if (!username || !password) return setError('请输入学号和密码')
        setLoading(true)
        setError('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, remember }),
          })
          const d = await resp.json()
          if (!resp.ok) {
            setError(d.detail || '登录失败')
          } else {
            onLoginSuccess(d.studentName || username)
          }
        } catch (err) {
          setError(`连接本地服务失败: ${err.message}`)
        } finally {
          setLoading(false)
        }
      }

      return h('div', { style: styles.card },
        h('h3', { style: { margin: '0 0 10px 0', fontSize: '14px' } }, '登录四川大学教务处'),
        h('p', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #9ca3af)', marginBottom: '14px' } },
          '凭据保存在本地安全加密存储中，点开面板可实现自动登录与保活'
        ),
        error && h('div', { style: { color: '#ef4444', fontSize: '12px', marginBottom: '10px' } }, error),
        h('form', { onSubmit: doLogin },
          h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '4px' } }, '学号'),
          h('input', {
            style: styles.input,
            placeholder: '例如 2021xxxxxxx',
            value: username,
            onChange: (e) => setUsername(e.target.value),
          }),
          h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '4px' } }, '教务密码'),
          h('input', {
            style: styles.input,
            type: 'password',
            placeholder: '教务系统登录密码',
            value: password,
            onChange: (e) => setPassword(e.target.value),
          }),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '14px', cursor: 'pointer' } },
            h('input', {
              type: 'checkbox',
              checked: remember,
              onChange: (e) => setRemember(e.target.checked),
            }),
            '记住凭据（下次自动登录）'
          ),
          h('button', {
            type: 'submit',
            style: styles.primaryBtn,
            disabled: loading,
          }, loading ? '正在识别验证码并登录...' : '立即登录')
        )
      )
    }

    // ================== 子组件：课表视图 ==================
    function ScheduleView() {
      const [loading, setLoading] = useState(true)
      const [courses, setCourses] = useState([])
      const [filterToday, setFilterToday] = useState(false)
      const todayDay = new Date().getDay() || 7
      const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

      useEffect(() => {
        fetch(`${SERVICE_URL}/api/schedule`)
          .then((res) => res.json())
          .then((data) => {
            setCourses(data.courses || [])
            setLoading(false)
          })
          .catch(() => setLoading(false))
      }, [])

      if (loading) return h('div', { style: { textAlign: 'center', padding: '30px', color: '#9ca3af' } }, '正在拉取课表...')

      const list = filterToday
        ? courses.filter(c => c.schedules?.some(s => s.day === todayDay))
        : courses

      return h('div', null,
        h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
          h('button', {
            style: { padding: '5px 10px', fontSize: '12px', cursor: 'pointer', background: !filterToday ? '#c01920' : 'rgba(255,255,255,0.06)', color: '#fff', border: 'none', borderRadius: '4px' },
            onClick: () => setFilterToday(false),
          }, `全部 (${courses.length})`),
          h('button', {
            style: { padding: '5px 10px', fontSize: '12px', cursor: 'pointer', background: filterToday ? '#c01920' : 'rgba(255,255,255,0.06)', color: '#fff', border: 'none', borderRadius: '4px' },
            onClick: () => setFilterToday(true),
          }, `今天 (${dayNames[todayDay]})`)
        ),
        list.length === 0 && h('div', { style: { textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' } }, '没有排定的课程'),
        list.map((c, i) =>
          h('div', { key: i, style: styles.card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
              h('span', { style: { fontWeight: 600, fontSize: '14px' } }, c.name),
              h('span', { style: { fontSize: '12px', color: '#f87171' } }, `${c.credit}学分`)
            ),
            h('div', { style: { fontSize: '12px', color: '#9ca3af', marginBottom: '6px' } },
              `👨‍🏫 ${c.teacher || '教师未知'} · ${c.property || '课程'}`
            ),
            c.schedules?.map((s, sIdx) =>
              h('div', {
                key: sIdx,
                style: {
                  fontSize: '11px',
                  padding: '4px 8px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '4px',
                  marginTop: '4px',
                  borderLeft: s.day === todayDay ? '3px solid #c01920' : '3px solid rgba(255,255,255,0.1)',
                },
              },
                `${dayNames[s.day]} 第${s.startSession}~${s.startSession + s.continuingSessions - 1}节 | 📍 ${s.building} ${s.classroom}`
              )
            )
          )
        )
      )
    }

    // ================== 子组件：成绩视图 ==================
    function GradesView() {
      const [loading, setLoading] = useState(true)
      const [data, setData] = useState({ grades: [] })

      useEffect(() => {
        fetch(`${SERVICE_URL}/api/grades`)
          .then((res) => res.json())
          .then((d) => {
            setData(d)
            setLoading(false)
          })
          .catch(() => setLoading(false))
      }, [])

      if (loading) return h('div', { style: { textAlign: 'center', padding: '30px', color: '#9ca3af' } }, '正在计算 GPA...')

      return h('div', null,
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' } },
          h('div', { style: { ...styles.card, textAlign: 'center', marginBottom: 0 } },
            h('div', { style: { fontSize: '20px', fontWeight: 700, color: '#ef4444' } }, data.overallGpa ?? '--'),
            h('div', { style: { fontSize: '11px', color: '#9ca3af', marginTop: '2px' } }, '总体 GPA')
          ),
          h('div', { style: { ...styles.card, textAlign: 'center', marginBottom: 0 } },
            h('div', { style: { fontSize: '20px', fontWeight: 700, color: '#ef4444' } }, data.totalCredit ?? '--'),
            h('div', { style: { fontSize: '11px', color: '#9ca3af', marginTop: '2px' } }, '已获总学分')
          )
        ),
        (data.grades || []).map((g, i) =>
          h('div', { key: i, style: styles.card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
              h('span', { style: { fontWeight: 600, fontSize: '13px' } }, g.name),
              h('span', { style: { fontWeight: 700, color: parseFloat(g.score) >= 60 ? '#10b981' : '#ef4444' } }, g.score)
            ),
            h('div', { style: { fontSize: '11px', color: '#9ca3af', marginTop: '4px', display: 'flex', justifyContent: 'space-between' } },
              h('span', null, `${g.property} · ${g.credit}学分 · 绩点:${g.gpa}`),
              h('span', null, g.term)
            )
          )
        )
      )
    }

    // ================== 子组件：考试视图 ==================
    function ExamsView() {
      const [loading, setLoading] = useState(true)
      const [exams, setExams] = useState([])

      useEffect(() => {
        fetch(`${SERVICE_URL}/api/exams`)
          .then((res) => res.json())
          .then((d) => {
            setExams(d.exams || [])
            setLoading(false)
          })
          .catch(() => setLoading(false))
      }, [])

      if (loading) return h('div', { style: { textAlign: 'center', padding: '30px', color: '#9ca3af' } }, '正在拉取考试安排...')
      if (exams.length === 0) return h('div', { style: { textAlign: 'center', padding: '30px', color: '#9ca3af', fontSize: '13px' } }, '近期暂无考试安排 🎉')

      return h('div', null,
        exams.map((ex, i) =>
          h('div', { key: i, style: { ...styles.card, borderLeft: '3px solid #c01920' } },
            h('div', { style: { fontWeight: 600, fontSize: '14px', marginBottom: '6px' } }, ex.courseName),
            h('div', { style: { fontSize: '12px', color: '#9ca3af', marginBottom: '2px' } }, `⏰ ${ex.examTime}`),
            h('div', { style: { fontSize: '12px', color: '#9ca3af' } }, `📍 ${ex.location || '考场待定'} (座位: ${ex.seatNumber || '现场查看'})`)
          )
        )
      )
    }

    // ================== 主侧边栏二级抽屉组件 ==================
    function ScuDrawer({ onClose }) {
      const [tab, setTab] = useState('schedule')
      const [isLoggedIn, setIsLoggedIn] = useState(false)
      const [studentName, setStudentName] = useState('')
      const [hasCreds, setHasCreds] = useState(false)

      useEffect(() => {
        fetch(`${SERVICE_URL}/api/status`)
          .then((res) => res.json())
          .then((d) => {
            setHasCreds(d.hasCredentials)
            setIsLoggedIn(d.isLoggedIn)
            setStudentName(d.studentName || d.username || '')
            if (!d.hasCredentials && !d.isLoggedIn) setTab('settings')
          })
          .catch(() => setTab('settings'))
      }, [])

      const handleLogout = async () => {
        await fetch(`${SERVICE_URL}/api/logout`, { method: 'POST' }).catch(() => {})
        setIsLoggedIn(false)
        setHasCreds(false)
        setTab('settings')
      }

      return h('div', { style: styles.drawer },
        // 顶栏
        h('div', { style: styles.header },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { style: styles.badge }, 'SCU'),
            h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '川大教务处')
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { style: { fontSize: '12px', color: isLoggedIn ? '#10b981' : '#ef4444' } },
              isLoggedIn ? `● ${studentName || '在线'}` : '○ 未连接'
            ),
            h('button', { style: styles.iconBtn, onClick: onClose, title: '收起' }, '✕')
          )
        ),
        // Tab 栏
        h('div', { style: styles.tabBar },
          h('button', { style: styles.tabBtn(tab === 'schedule'), onClick: () => setTab('schedule') }, '📅 课表'),
          h('button', { style: styles.tabBtn(tab === 'grades'), onClick: () => setTab('grades') }, '📊 成绩'),
          h('button', { style: styles.tabBtn(tab === 'exams'), onClick: () => setTab('exams') }, '📝 考试'),
          h('button', { style: styles.tabBtn(tab === 'settings'), onClick: () => setTab('settings') }, '⚙️ 凭据')
        ),
        // 内容滚动区
        h('div', { style: styles.content },
          tab === 'settings' || (!hasCreds && !isLoggedIn)
            ? h(LoginForm, {
                onLoginSuccess: (name) => {
                  setIsLoggedIn(true)
                  setHasCreds(true)
                  setStudentName(name)
                  setTab('schedule')
                },
              })
            : h(React.Fragment, null,
                tab === 'schedule' && h(ScheduleView),
                tab === 'grades' && h(GradesView),
                tab === 'exams' && h(ExamsView),
                h('div', { style: { marginTop: '16px', textAlign: 'center' } },
                  h('button', {
                    style: { background: 'transparent', border: 'none', color: '#6b7280', fontSize: '11px', cursor: 'pointer' },
                    onClick: handleLogout,
                  }, '切换账号或退出登录')
                )
              )
        )
      )
    }

    // ================== 侧边栏按钮入口组件 ==================
    function ScuSidebarButton() {
      const [open, setOpen] = useState(false)

      return h(React.Fragment, null,
        h('button', {
          type: 'button',
          title: '四川大学教务处',
          onClick: () => setOpen(!open),
          style: {
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: 'none',
            background: open ? '#c01920' : 'transparent',
            color: open ? '#ffffff' : 'var(--dsw-alias-text-sub, #9ca3af)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            transition: 'background 0.2s',
          },
        }, '🎓'),
        open && h(ScuDrawer, { onClose: () => setOpen(false) })
      )
    }

    // ================== Cordis 客户端入口 ==================
    return {
      inject: ['slots'],
      apply(ctx) {
        // 在侧边栏操作插槽 (sidebar.footer.action) 中挂载 SCU 入口按钮
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'scu-urp-btn',
            order: 20,
          }, ScuSidebarButton)
        )
      },
    }
  },
})
