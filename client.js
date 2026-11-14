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
        maxWidth: '1160px',
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

    // ================== 课表莫兰迪色系 (遵循 DSH 极简风格，亮暗自适应) ==================
    const COURSE_PALETTES = [
      { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.32)', text: '#2563eb', darkText: '#60a5fa' },
      { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.32)', text: '#059669', darkText: '#34d399' },
      { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.32)', text: '#7c3aed', darkText: '#a78bfa' },
      { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.32)', text: '#d97706', darkText: '#fbbf24' },
      { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.32)', text: '#db2777', darkText: '#f472b6' },
      { bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.32)', text: '#0284c7', darkText: '#38bdf8' },
      { bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.32)', text: '#0d9488', darkText: '#2dd4bf' },
      { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.32)', text: '#4f46e5', darkText: '#818cf8' },
      { bg: 'rgba(234, 88, 12, 0.12)', border: 'rgba(234, 88, 12, 0.32)', text: '#ea580c', darkText: '#fb923c' },
      { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.32)', text: '#9333ea', darkText: '#c084fc' },
    ]

    function getCoursePalette(name) {
      let hash = 0
      for (let i = 0; i < (name || '').length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i)
        hash |= 0
      }
      return COURSE_PALETTES[Math.abs(hash) % COURSE_PALETTES.length]
    }

    // 四川大学标准 12 节次参考时刻表
    const SCU_TIMETABLE = [
      { session: 1, time: '08:15', end: '09:00', period: '上午' },
      { session: 2, time: '09:05', end: '09:50', period: '上午' },
      { session: 3, time: '10:10', end: '10:55', period: '上午' },
      { session: 4, time: '11:00', end: '11:45', period: '上午' },
      { session: 5, time: '13:50', end: '14:35', period: '下午' },
      { session: 6, time: '14:40', end: '15:25', period: '下午' },
      { session: 7, time: '15:45', end: '16:30', period: '下午' },
      { session: 8, time: '16:35', end: '17:20', period: '下午' },
      { session: 9, time: '18:30', end: '19:15', period: '晚间' },
      { session: 10, time: '19:20', end: '20:05', period: '晚间' },
      { session: 11, time: '20:15', end: '21:00', period: '晚间' },
      { session: 12, time: '21:05', end: '21:50', period: '晚间' },
    ]

    // ================== 子页面 1：高颜值自适应课表 ==================
    function ScheduleView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [courses, setCourses] = useState([])
      const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
      const [selectedWeek, setSelectedWeek] = useState('ALL') // 'ALL' | 1~20
      const [activeModalItem, setActiveModalItem] = useState(null) // 详情弹窗数据

      const todayDay = new Date().getDay() || 7 // 1~7 (周一为1, 周日为7)
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

      // 提取有固定排课的时段块与未排课/线上课程
      const scheduledItems = []
      const onlineCourses = []

      courses.forEach(c => {
        if (!c.schedules || c.schedules.length === 0) {
          onlineCourses.push(c)
        } else {
          c.schedules.forEach(s => {
            scheduledItems.push({ course: c, schedule: s })
          })
        }
      })

      // 今日课程统计
      const todayCourses = scheduledItems.filter(item => item.schedule.day === todayDay)

      return h('div', null,
        // 1. 今日状态横幅
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            borderRadius: '10px',
            padding: '12px 18px',
            marginBottom: '16px',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            h('span', { style: { fontSize: '18px' } }, '🗓️'),
            h('div', null,
              h('div', { style: { fontSize: '13px', fontWeight: 600 } },
                `今天是 ${dayNames[todayDay]} · 今日共 ${todayCourses.length} 门排课`
              ),
              h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                todayCourses.length > 0
                  ? `今日首节课程: 《${todayCourses[0].course.name}》 第 ${todayCourses[0].schedule.startSession} 节 · 📍 ${todayCourses[0].schedule.classroom || todayCourses[0].schedule.building || '待定'}`
                  : '今日暂无现场面授课程，适合自主研学或预习复习 ☕️'
              )
            )
          ),
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            // 周次筛选下拉
            h('select', {
              style: {
                ...S.btnSecondary,
                padding: '6px 10px',
                outline: 'none',
              },
              value: selectedWeek,
              onChange: (e) => setSelectedWeek(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value)),
            },
              h('option', { value: 'ALL' }, '全学期课表 (全部周次)'),
              Array.from({ length: 20 }, (_, i) => i + 1).map(w =>
                h('option', { key: w, value: w }, `第 ${w} 教学周`)
              )
            ),
            // 视图切换按钮 (网格 / 清单)
            h('div', {
              style: {
                display: 'flex',
                background: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.1))',
                borderRadius: '6px',
                padding: '2px',
              },
            },
              h('button', {
                style: {
                  ...S.btnSecondary,
                  border: 'none',
                  padding: '5px 12px',
                  background: viewMode === 'grid' ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
                  fontWeight: viewMode === 'grid' ? 600 : 400,
                  boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                },
                onClick: () => setViewMode('grid'),
              }, '📅 周网格'),
              h('button', {
                style: {
                  ...S.btnSecondary,
                  border: 'none',
                  padding: '5px 12px',
                  background: viewMode === 'list' ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
                  fontWeight: viewMode === 'list' ? 600 : 400,
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                },
                onClick: () => setViewMode('list'),
              }, '📋 日程列表')
            ),
            h('button', { style: S.btnSecondary, onClick: fetchSchedule }, '刷新 🔄')
          )
        ),

        // 加载与错误提示
        loading && h('div', { style: { textAlign: 'center', padding: '64px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在从四川大学综合教务处同步最新课表...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px', marginBottom: '16px' } }, error),

        !loading && !error && courses.length === 0 && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '14px' } }, '教务系统未返回本学期排课数据'),

        // 2. 网格视图 (Timetable Grid)
        !loading && !error && courses.length > 0 && viewMode === 'grid' && h('div', null,
          h('div', {
            style: {
              overflowX: 'auto',
              background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.02))',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
            },
          },
            h('div', {
              style: {
                minWidth: '780px',
                display: 'grid',
                gridTemplateColumns: '64px repeat(7, minmax(100px, 1fr))',
                gridTemplateRows: '38px repeat(12, 54px)',
                gap: '6px',
                position: 'relative',
              },
            },
              // 表头：左上角时间标志
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  fontWeight: 500,
                },
              }, '节次 / 星期'),

              // 表头：周一至周日 7 天
              [1, 2, 3, 4, 5, 6, 7].map(day => {
                const isToday = day === todayDay
                return h('div', {
                  key: `header-${day}`,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: isToday ? 700 : 500,
                    background: isToday ? 'var(--dsw-alias-bg-hover, rgba(59, 130, 246, 0.12))' : 'transparent',
                    color: isToday ? '#2563eb' : 'var(--dsw-alias-text, inherit)',
                    border: isToday ? '1px solid rgba(59, 130, 246, 0.25)' : 'none',
                    gap: '4px',
                  },
                },
                  h('span', null, dayNames[day]),
                  isToday && h('span', {
                    style: {
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: '#2563eb',
                      color: '#ffffff',
                    },
                  }, '今天')
                )
              }),

              // 左侧 12 节次行标
              SCU_TIMETABLE.map(t =>
                h('div', {
                  key: `session-${t.session}`,
                  style: {
                    gridColumn: 1,
                    gridRow: t.session + 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    borderRadius: '6px',
                    fontSize: '11px',
                    padding: '2px',
                  },
                },
                  h('span', { style: { fontWeight: 600, fontSize: '12px' } }, t.session),
                  h('span', { style: { fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)', transform: 'scale(0.9)' } }, t.time)
                )
              ),

              // 7 列 x 12 行底网格背景槽 (用于视觉对齐与留白)
              [1, 2, 3, 4, 5, 6, 7].map(day =>
                SCU_TIMETABLE.map(t =>
                  h('div', {
                    key: `slot-${day}-${t.session}`,
                    style: {
                      gridColumn: day + 1,
                      gridRow: t.session + 1,
                      borderRadius: '6px',
                      background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.02))',
                      border: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.07))',
                      boxSizing: 'border-box',
                    },
                  })
                )
              ),

              // 课程卡片定位渲染
              scheduledItems.map((item, idx) => {
                const s = item.schedule
                const c = item.course
                const palette = getCoursePalette(c.name)
                // 检查选中的周次是否包含该课程
                const isSelectedWeekMatch = selectedWeek === 'ALL' || (s.weeks && s.weeks.includes(selectedWeek))

                return h('div', {
                  key: `course-card-${idx}`,
                  onClick: () => setActiveModalItem(item),
                  title: `${c.name} · 点击查看详情`,
                  style: {
                    gridColumn: s.day + 1,
                    gridRow: `${s.startSession + 1} / span ${s.continuingSessions}`,
                    zIndex: 2,
                    borderRadius: '8px',
                    padding: '8px 9px',
                    background: palette.bg,
                    border: `1px solid ${palette.border}`,
                    borderLeft: `3px solid ${palette.text}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    transition: 'all 0.15s ease',
                    opacity: isSelectedWeekMatch ? 1 : 0.28,
                    filter: isSelectedWeekMatch ? 'none' : 'grayscale(0.7)',
                    boxSizing: 'border-box',
                  },
                },
                  h('div', null,
                    h('div', {
                      style: {
                        fontSize: '12px',
                        fontWeight: 600,
                        lineHeight: 1.3,
                        marginBottom: '4px',
                        display: '-webkit-box',
                        WebkitLineClamp: s.continuingSessions >= 3 ? 3 : 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        color: 'var(--dsw-alias-text, inherit)',
                      },
                    }, c.name),
                    (s.classroom || s.building) && h('div', {
                      style: {
                        fontSize: '11px',
                        fontWeight: 600,
                        color: palette.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    }, `📍 ${s.classroom || s.building}`)
                  ),
                  h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '4px',
                    },
                  },
                    h('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' } }, c.teacher || ''),
                    h('span', null, s.weeks?.length ? `${s.weeks[0]}-${s.weeks[s.weeks.length - 1]}周` : '全周')
                  )
                )
              })
            )
          )
        ),

        // 3. 清单列表视图 (List Mode)
        !loading && !error && courses.length > 0 && viewMode === 'list' && h('div', null,
          [1, 2, 3, 4, 5, 6, 7].map(day => {
            const dayItems = scheduledItems.filter(it => it.schedule.day === day)
            dayItems.sort((a, b) => a.schedule.startSession - b.schedule.startSession)
            const isToday = day === todayDay

            return h('div', { key: `day-group-${day}`, style: { marginBottom: '16px' } },
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                },
              },
                h('span', {
                  style: {
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: isToday ? '#2563eb' : 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.12))',
                    color: isToday ? '#ffffff' : 'inherit',
                    fontSize: '12px',
                  },
                }, dayNames[day]),
                h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `(${dayItems.length} 门课程)`)
              ),

              dayItems.length === 0
                ? h('div', {
                    style: {
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.03))',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      fontSize: '12px',
                    },
                  }, '当天无课程安排')
                : dayItems.map((item, iIdx) => {
                    const c = item.course
                    const s = item.schedule
                    const palette = getCoursePalette(c.name)
                    return h('div', {
                      key: iIdx,
                      onClick: () => setActiveModalItem(item),
                      style: {
                        ...S.card,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderLeft: `4px solid ${palette.text}`,
                      },
                    },
                      h('div', null,
                        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          h('span', { style: { fontSize: '14px', fontWeight: 600 } }, c.name),
                          h('span', { style: S.badge }, `${c.property || '课程'} · ${c.credit}学分`)
                        ),
                        h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                          `👨‍🏫 ${c.teacher || '待公布'}  ·  📍 ${s.building} ${s.classroom}  ·  第 ${s.weeks?.length ? `${s.weeks[0]}~${s.weeks[s.weeks.length - 1]}周` : '全学期'}`
                        )
                      ),
                      h('div', { style: { textAlign: 'right' } },
                        h('div', { style: { fontSize: '13px', fontWeight: 600, color: palette.text } },
                          `第 ${s.startSession}~${s.startSession + s.continuingSessions - 1} 节`
                        ),
                        h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                          `${SCU_TIMETABLE[s.startSession - 1]?.time || ''} 开始`
                        )
                      )
                    )
                  })
            )
          })
        ),

        // 4. 线上修读与自主学习课程专区
        !loading && !error && onlineCourses.length > 0 && h('div', {
          style: {
            marginTop: '24px',
            padding: '16px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
            border: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
          },
        },
          h('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' } },
            h('span', null, '💻'),
            h('span', null, `网络自主修读 / 线上考核课程 (${onlineCourses.length} 门)`)
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' } },
            onlineCourses.map((c, i) =>
              h('div', {
                key: i,
                style: {
                  ...S.card,
                  marginBottom: 0,
                  padding: '12px 14px',
                  background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.03))',
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('span', { style: { fontSize: '13px', fontWeight: 600 } }, c.name),
                  h('span', { style: S.badge }, `${c.credit}学分`)
                ),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                  `教师: ${c.teacher || '自主修读'} · 课程性质: ${c.property || '必修'}`
                ),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                  `课程代码: ${c.courseNumber}-${c.unitNumber}`
                )
              )
            )
          )
        ),

        // 5. 课程详情弹窗 Modal (点击卡片触发)
        activeModalItem && h('div', {
          style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            backdropFilter: 'blur(3px)',
          },
          onClick: () => setActiveModalItem(null),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))',
              color: 'var(--dsw-alias-text, inherit)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' } },
              h('div', null,
                h('div', { style: { fontSize: '18px', fontWeight: 700 } }, activeModalItem.course.name),
                h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
                  h('span', { style: S.badge }, `${activeModalItem.course.property || '课程'} · ${activeModalItem.course.credit} 学分`),
                  h('span', { style: S.badge }, `课号: ${activeModalItem.course.courseNumber}-${activeModalItem.course.unitNumber}`)
                )
              ),
              h('button', {
                style: {
                  background: 'transparent',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                },
                onClick: () => setActiveModalItem(null),
              }, '✕')
            ),

            h('div', { style: { fontSize: '13px', lineHeight: 1.8 } },
              h('div', null, `👨‍🏫 授课教师: ${activeModalItem.course.teacher || '待公布'}`),
              activeModalItem.schedule && h('div', null,
                `📍 上课地点: ${activeModalItem.schedule.campus ? activeModalItem.schedule.campus + '校区 ' : ''}${activeModalItem.schedule.building} ${activeModalItem.schedule.classroom}`
              ),
              activeModalItem.schedule && h('div', null,
                `⏰ 上课时间: ${dayNames[activeModalItem.schedule.day]} 第 ${activeModalItem.schedule.startSession}~${activeModalItem.schedule.startSession + activeModalItem.schedule.continuingSessions - 1} 节 (${SCU_TIMETABLE[activeModalItem.schedule.startSession - 1]?.time} ~ ${SCU_TIMETABLE[activeModalItem.schedule.startSession + activeModalItem.schedule.continuingSessions - 2]?.end})`
              ),
              activeModalItem.schedule && h('div', null,
                `📅 教学周次: ${activeModalItem.schedule.weekDescription || (activeModalItem.schedule.weeks?.length ? `${activeModalItem.schedule.weeks[0]}~${activeModalItem.schedule.weeks[activeModalItem.schedule.weeks.length - 1]}周` : '全学期')}`
              )
            ),

            // 活跃周次 20 周小指示点
            activeModalItem.schedule?.weeks && h('div', { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.1))' } },
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '8px' } }, '学期活跃周分布 (1-20周):'),
              h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                Array.from({ length: 20 }, (_, idx) => idx + 1).map(w => {
                  const isActive = activeModalItem.schedule.weeks.includes(w)
                  return h('span', {
                    key: w,
                    title: `第 ${w} 周: ${isActive ? '有课' : '无课'}`,
                    style: {
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isActive ? '#2563eb' : 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.1))',
                      color: isActive ? '#ffffff' : 'var(--dsw-alias-text-sub, #71717a)',
                      fontWeight: isActive ? 600 : 400,
                    },
                  }, w)
                })
              )
            ),

            h('div', { style: { marginTop: '20px', textAlign: 'right' } },
              h('button', {
                style: { ...S.btnPrimary, padding: '7px 18px', fontSize: '12px' },
                onClick: () => setActiveModalItem(null),
              }, '关闭')
            )
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
