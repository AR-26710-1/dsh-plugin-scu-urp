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

    // ================== 统一镂空简笔画图标组件库 (纯 SVG Feather 规范，极简单色，无彩色 Emoji) ==================
    function createSvgIcon(paths = [], circles = [], lines = [], rects = []) {
      return function SvgIcon(props) {
        const size = typeof props?.size === 'number' ? props.size : 16
        const strokeWidth = typeof props?.strokeWidth === 'number' ? props.strokeWidth : 1.75
        const style = {
          display: 'inline-block',
          verticalAlign: '-0.15em',
          flexShrink: 0,
          ...(props?.style || {}),
        }
        return h('svg', {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style,
        },
          paths.map((d, i) => h('path', { key: `p-${i}`, d })),
          circles.map((c, i) => h('circle', { key: `c-${i}`, cx: c.cx, cy: c.cy, r: c.r })),
          lines.map((l, i) => h('line', { key: `l-${i}`, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })),
          rects.map((r, i) => h('rect', { key: `r-${i}`, x: r.x, y: r.y, width: r.w, height: r.h, rx: r.rx || 1 }))
        )
      }
    }

    const ScuIcon = createSvgIcon(['M22 10v6M2 10l10-5 10 5-10 5z', 'M6 12v5c0 3 6 3 6 3s6 0 6-3v-5'])
    const CalendarIcon = createSvgIcon([], [], [{ x1: 16, y1: 2, x2: 16, y2: 6 }, { x1: 8, y1: 2, x2: 8, y2: 6 }, { x1: 3, y1: 10, x2: 21, y2: 10 }], [{ x: 3, y: 4, w: 18, h: 18, rx: 2 }])
    const ChartIcon = createSvgIcon([], [], [{ x1: 18, y1: 20, x2: 18, y2: 10 }, { x1: 12, y1: 20, x2: 12, y2: 4 }, { x1: 6, y1: 20, x2: 6, y2: 14 }, { x1: 3, y1: 20, x2: 21, y2: 20 }])
    const FileTextIcon = createSvgIcon(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'])
    const SettingsIcon = createSvgIcon(
      ['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'],
      [{ cx: 12, cy: 12, r: 3 }]
    )
    const RefreshIcon = createSvgIcon(['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'])
    const GridIcon = createSvgIcon([], [], [], [{ x: 3, y: 3, w: 7, h: 7, rx: 1.5 }, { x: 14, y: 3, w: 7, h: 7, rx: 1.5 }, { x: 14, y: 14, w: 7, h: 7, rx: 1.5 }, { x: 3, y: 14, w: 7, h: 7, rx: 1.5 }])
    const ListIcon = createSvgIcon([], [], [{ x1: 8, y1: 6, x2: 21, y2: 6 }, { x1: 8, y1: 12, x2: 21, y2: 12 }, { x1: 8, y1: 18, x2: 21, y2: 18 }, { x1: 3, y1: 6, x2: 3.01, y2: 6 }, { x1: 3, y1: 12, x2: 3.01, y2: 12 }, { x1: 3, y1: 18, x2: 3.01, y2: 18 }])
    const MapPinIcon = createSvgIcon(['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'], [{ cx: 12, cy: 10, r: 3 }])
    const UserIcon = createSvgIcon(['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'], [{ cx: 12, cy: 7, r: 4 }])
    const ClockIcon = createSvgIcon([], [{ cx: 12, cy: 12, r: 10 }], [{ x1: 12, y1: 6, x2: 12, y2: 12 }, { x1: 12, y1: 12, x2: 16, y2: 14 }])
    const LaptopIcon = createSvgIcon(['M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55A1 1 0 0 1 20.38 20H3.62a1 1 0 0 1-.9-1.45L4 16'])
    const SmartphoneIcon = createSvgIcon([], [], [{ x1: 12, y1: 18, x2: 12.01, y2: 18 }], [{ x: 5, y: 2, w: 14, h: 20, rx: 2 }])
    const DownloadIcon = createSvgIcon(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'])
    const CheckCircleIcon = createSvgIcon(['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4L12 14.01l-3-3'])
    const LibraryIcon = createSvgIcon(['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'], [], [{ x1: 12, y1: 6, x2: 12, y2: 14 }])
    const UsersIcon = createSvgIcon(['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'], [{ cx: 9, cy: 7, r: 4 }])
    const SnowflakeIcon = createSvgIcon([], [], [{ x1: 12, y1: 2, x2: 12, y2: 22 }, { x1: 2, y1: 12, x2: 22, y2: 12 }, { x1: 4.93, y1: 4.93, x2: 19.07, y2: 19.07 }, { x1: 19.07, y1: 4.93, x2: 4.93, y2: 19.07 }])
    const SearchIcon = createSvgIcon(['M21 21l-4.35-4.35'], [{ cx: 11, cy: 11, r: 8 }])
    const CheckSquareIcon = createSvgIcon(['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'])
    const SquareIcon = createSvgIcon([], [], [], [{ x: 3, y: 3, w: 18, h: 18, rx: 2 }])
    const TrashIcon = createSvgIcon(['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'])
    const PlusIcon = createSvgIcon([], [], [{ x1: 12, y1: 5, x2: 12, y2: 19 }, { x1: 5, y1: 12, x2: 19, y2: 12 }])
    const Edit3Icon = createSvgIcon(['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'])

    // ================== 本地极速秒开缓存管理器 (Stale-While-Revalidate) ==================
    const SCU_CACHE = {
      get(key) {
        try {
          const raw = localStorage.getItem(`scu_cache_${key}`)
          return raw ? JSON.parse(raw) : null
        } catch {
          return null
        }
      },
      set(key, data) {
        try {
          localStorage.setItem(`scu_cache_${key}`, JSON.stringify({
            data,
            timestamp: Date.now(),
            updatedAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          }))
        } catch {}
      },
    }

    // ================== 课程随堂备忘与作业待办数据管理器 ==================
    const SCU_TODO_STORE = {
      async load() {
        try {
          const resp = await fetch(`${SERVICE_URL}/api/todos`)
          if (resp.ok) {
            const d = await resp.json()
            const todos = d.todos || []
            localStorage.setItem('scu_course_todos', JSON.stringify(todos))
            return todos
          }
        } catch {}
        try {
          const local = localStorage.getItem('scu_course_todos')
          return local ? JSON.parse(local) : []
        } catch {
          return []
        }
      },
      async save(todos) {
        try {
          localStorage.setItem('scu_course_todos', JSON.stringify(todos))
          await fetch(`${SERVICE_URL}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ todos }),
          })
        } catch {}
      },
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

    // 四川大学官方本科教学作息时间表 (来源: 四川大学教务处 https://jwc.scu.edu.cn/scdxbkjxzxsj.htm)
    const SCU_OFFICIAL_TIMETABLE_WANGJIANG_HUAXI = [
      { session: 1, time: '08:00', start: '08:00', end: '08:45', period: '上午', label: '第 1 节 (08:00 - 08:45)' },
      { session: 2, time: '08:55', start: '08:55', end: '09:40', period: '上午', label: '第 2 节 (08:55 - 09:40)' },
      { session: 3, time: '10:00', start: '10:00', end: '10:45', period: '上午', label: '第 3 节 (10:00 - 10:45)' },
      { session: 4, time: '10:55', start: '10:55', end: '11:40', period: '上午', label: '第 4 节 (10:55 - 11:40)' },
      { session: 5, time: '14:00', start: '14:00', end: '14:45', period: '下午', label: '第 5 节 (14:00 - 14:45)' },
      { session: 6, time: '14:55', start: '14:55', end: '15:40', period: '下午', label: '第 6 节 (14:55 - 15:40)' },
      { session: 7, time: '15:50', start: '15:50', end: '16:35', period: '下午', label: '第 7 节 (15:50 - 16:35)' },
      { session: 8, time: '16:55', start: '16:55', end: '17:40', period: '下午', label: '第 8 节 (16:55 - 17:40)' },
      { session: 9, time: '17:50', start: '17:50', end: '18:35', period: '下午', label: '第 9 节 (17:50 - 18:35)' },
      { session: 10, time: '19:30', start: '19:30', end: '20:15', period: '晚上', label: '第 10 节 (19:30 - 20:15)' },
      { session: 11, time: '20:25', start: '20:25', end: '21:10', period: '晚上', label: '第 11 节 (20:25 - 21:10)' },
      { session: 12, time: '21:20', start: '21:20', end: '22:05', period: '晚上', label: '第 12 节 (21:20 - 22:05)' },
    ]

    const SCU_OFFICIAL_TIMETABLE_JIANGAN = [
      { session: 1, time: '08:15', start: '08:15', end: '09:00', period: '上午', label: '第 1 节 (08:15 - 09:00)' },
      { session: 2, time: '09:10', start: '09:10', end: '09:55', period: '上午', label: '第 2 节 (09:10 - 09:55)' },
      { session: 3, time: '10:15', start: '10:15', end: '11:00', period: '上午', label: '第 3 节 (10:15 - 11:00)' },
      { session: 4, time: '11:10', start: '11:10', end: '11:55', period: '上午', label: '第 4 节 (11:10 - 11:55)' },
      { session: 5, time: '13:50', start: '13:50', end: '14:35', period: '下午', label: '第 5 节 (13:50 - 14:35)' },
      { session: 6, time: '14:45', start: '14:45', end: '15:30', period: '下午', label: '第 6 节 (14:45 - 15:30)' },
      { session: 7, time: '15:40', start: '15:40', end: '16:25', period: '下午', label: '第 7 节 (15:40 - 16:25)' },
      { session: 8, time: '16:45', start: '16:45', end: '17:30', period: '下午', label: '第 8 节 (16:45 - 17:30)' },
      { session: 9, time: '17:40', start: '17:40', end: '18:25', period: '下午', label: '第 9 节 (17:40 - 18:25)' },
      { session: 10, time: '19:20', start: '19:20', end: '20:05', period: '晚上', label: '第 10 节 (19:20 - 20:05)' },
      { session: 11, time: '20:15', start: '20:15', end: '21:00', period: '晚上', label: '第 11 节 (20:15 - 21:00)' },
      { session: 12, time: '21:10', start: '21:10', end: '21:55', period: '晚上', label: '第 12 节 (21:10 - 21:55)' },
    ]

    function getOfficialScuTimetable(campus) {
      if (campus === '01' || campus === '02' || campus === '望江' || campus === '华西' || (typeof campus === 'string' && (campus.includes('望江') || campus.includes('华西')))) {
        return SCU_OFFICIAL_TIMETABLE_WANGJIANG_HUAXI
      }
      return SCU_OFFICIAL_TIMETABLE_JIANGAN
    }

    const SCU_TIMETABLE = SCU_OFFICIAL_TIMETABLE_JIANGAN

    // ================== 子页面 1：高颜值自适应课表 ==================
    function ScheduleView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [courses, setCourses] = useState([])
      const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
      const [selectedWeek, setSelectedWeek] = useState('ALL') // 'ALL' | 1~20
      const [activeModalItem, setActiveModalItem] = useState(null) // 详情弹窗数据
      const [showExportModal, setShowExportModal] = useState(false) // 导出日历弹窗
      const [exportStartDate, setExportStartDate] = useState('2026-08-31') // 第一周周一日期
      const [exportAlarm, setExportAlarm] = useState(15) // 提醒分钟
      const [exportDownloaded, setExportDownloaded] = useState(false)
      const [cacheNotice, setCacheNotice] = useState('')

      // 方案 D：随堂备忘与作业待办状态
      const [todos, setTodos] = useState([])
      const [showTodoDrawer, setShowTodoDrawer] = useState(false)
      const [modalTodoInput, setModalTodoInput] = useState('')
      const [drawerFilter, setDrawerFilter] = useState('ALL') // 'ALL' | 'UNCOMPLETED' | 'COMPLETED'
      const [drawerCourseSelect, setDrawerCourseSelect] = useState('')
      const [drawerTodoText, setDrawerTodoText] = useState('')

      const todayDay = new Date().getDay() || 7 // 1~7 (周一为1, 周日为7)
      const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

      // 方案 A：秒开快照与异步增量更新
      const fetchSchedule = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
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
          SCU_CACHE.set('schedule', d)
          setCacheNotice('')
        } catch (e) {
          const cached = SCU_CACHE.get('schedule')
          if (cached && cached.data && Array.isArray(cached.data.courses)) {
            setCourses(cached.data.courses)
            setCacheNotice(`离线快照 · ${cached.updatedAt}`)
          } else {
            setError(`网络异常: ${e.message}`)
          }
        } finally {
          setLoading(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        // 优先载入秒开快照
        const cached = SCU_CACHE.get('schedule')
        if (cached && cached.data && Array.isArray(cached.data.courses)) {
          setCourses(cached.data.courses)
          setLoading(false)
          setCacheNotice(`已载入快照 (${cached.updatedAt})`)
          fetchSchedule(true)
        } else {
          fetchSchedule(false)
        }
        // 载入持久化作业待办清单
        SCU_TODO_STORE.load().then(t => setTodos(t))
      }, [fetchSchedule])

      // 方案 D：待办增删改
      const handleAddTodo = async (courseName, text) => {
        if (!text || !text.trim() || !courseName) return
        const item = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          courseName: courseName.trim(),
          title: text.trim(),
          completed: false,
          createdAt: Date.now(),
        }
        const updated = [item, ...todos]
        setTodos(updated)
        await SCU_TODO_STORE.save(updated)
      }

      const handleToggleTodo = async (id) => {
        const updated = todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
        setTodos(updated)
        await SCU_TODO_STORE.save(updated)
      }

      const handleDeleteTodo = async (id) => {
        const updated = todos.filter(t => t.id !== id)
        setTodos(updated)
        await SCU_TODO_STORE.save(updated)
      }

      const uncompletedTotal = todos.filter(t => !t.completed).length

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
            h(CalendarIcon, { size: 20 }),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '13px', fontWeight: 600 } },
                  `今天是 ${dayNames[todayDay]} · 今日共 ${todayCourses.length} 门排课`
                ),
                cacheNotice && h('span', {
                  style: {
                    fontSize: '11px',
                    color: 'var(--dsw-alias-text-sub, #71717a)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.12))',
                  },
                }, cacheNotice)
              ),
              h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' } },
                todayCourses.length > 0
                  ? h(React.Fragment, null,
                      h('span', null, `今日首节课程: 《${todayCourses[0].course.name}》 第 ${todayCourses[0].schedule.startSession} 节 · `),
                      h(MapPinIcon, { size: 12 }),
                      h('span', null, todayCourses[0].schedule.classroom || todayCourses[0].schedule.building || '待定')
                    )
                  : '今日暂无现场面授课程，适合自主研学或预习复习'
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                },
                onClick: () => setViewMode('grid'),
              },
                h(GridIcon, { size: 13 }),
                '周网格'
              ),
              h('button', {
                style: {
                  ...S.btnSecondary,
                  border: 'none',
                  padding: '5px 12px',
                  background: viewMode === 'list' ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
                  fontWeight: viewMode === 'list' ? 600 : 400,
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                },
                onClick: () => setViewMode('list'),
              },
                h(ListIcon, { size: 13 }),
                '日程列表'
              )
            ),
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                position: 'relative',
              },
              onClick: () => setShowTodoDrawer(true),
            },
              h(CheckSquareIcon, { size: 13 }),
              '作业待办',
              uncompletedTotal > 0 && h('span', {
                style: {
                  fontSize: '10px',
                  background: '#ef4444',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  lineHeight: 1,
                  marginLeft: '2px',
                },
              }, uncompletedTotal)
            ),
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              },
              onClick: () => {
                setExportDownloaded(false)
                setShowExportModal(true)
              },
            },
              h(SmartphoneIcon, { size: 13 }),
              '导出日历'
            ),
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              },
              onClick: fetchSchedule,
            },
              h(RefreshIcon, { size: 13 }),
              '刷新'
            )
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
                const uncompletedCourseTodos = todos.filter(t => t.courseName === c.name && !t.completed)

                return h('div', {
                  key: `course-card-${idx}`,
                  onClick: () => setActiveModalItem(item),
                  title: `${c.name} · 点击查看详情与随堂待办`,
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
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '4px',
                        marginBottom: '4px',
                      },
                    },
                      h('div', {
                        style: {
                          fontSize: '12px',
                          fontWeight: 600,
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: s.continuingSessions >= 3 ? 3 : 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          color: 'var(--dsw-alias-text, inherit)',
                        },
                      }, c.name),
                      uncompletedCourseTodos.length > 0 && h('span', {
                        style: {
                          fontSize: '9px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background: 'rgba(239, 68, 68, 0.18)',
                          color: '#ef4444',
                          fontWeight: 700,
                          flexShrink: 0,
                          lineHeight: 1.1,
                        },
                        title: `有 ${uncompletedCourseTodos.length} 条未完成作业`,
                      }, `${uncompletedCourseTodos.length}待办`)
                    ),
                    (s.classroom || s.building) && h('div', {
                      style: {
                        fontSize: '11px',
                        fontWeight: 600,
                        color: palette.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      },
                    },
                      h(MapPinIcon, { size: 10 }),
                      h('span', null, s.classroom || s.building)
                    )
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
                    const uncompletedCourseTodos = todos.filter(t => t.courseName === c.name && !t.completed)
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
                          h('span', { style: S.badge }, `${c.property || '课程'} · ${c.credit}学分`),
                          uncompletedCourseTodos.length > 0 && h('span', {
                            style: {
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#ef4444',
                              fontWeight: 600,
                            },
                          }, `${uncompletedCourseTodos.length} 待办`)
                        ),
                        h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' } },
                          h(UserIcon, { size: 12 }),
                          h('span', null, c.teacher || '待公布'),
                          h('span', { style: { opacity: 0.5 } }, '·'),
                          h(MapPinIcon, { size: 12 }),
                          h('span', null, `${s.building} ${s.classroom}`),
                          h('span', { style: { opacity: 0.5 } }, '·'),
                          h('span', null, `第 ${s.weeks?.length ? `${s.weeks[0]}~${s.weeks[s.weeks.length - 1]}周` : '全学期'}`)
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
            h(LaptopIcon, { size: 15 }),
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

            h('div', { style: { fontSize: '13px', lineHeight: 1.9 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                h(UserIcon, { size: 13 }),
                h('span', null, `授课教师: ${activeModalItem.course.teacher || '待公布'}`)
              ),
              activeModalItem.schedule && h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                h(MapPinIcon, { size: 13 }),
                h('span', null, `上课地点: ${activeModalItem.schedule.campus ? activeModalItem.schedule.campus + '校区 ' : ''}${activeModalItem.schedule.building} ${activeModalItem.schedule.classroom}`)
              ),
              activeModalItem.schedule && (() => {
                const courseTt = getOfficialScuTimetable(activeModalItem.schedule.campus)
                const startS = activeModalItem.schedule.startSession
                const endS = startS + activeModalItem.schedule.continuingSessions - 1
                const startTime = courseTt[startS - 1]?.start || ''
                const endTime = courseTt[endS - 1]?.end || ''
                return h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                  h(ClockIcon, { size: 13 }),
                  h('span', null, `上课时间: ${dayNames[activeModalItem.schedule.day]} 第 ${startS}~${endS} 节 (${startTime} ~ ${endTime})`)
                )
              })(),
              activeModalItem.schedule && h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                h(CalendarIcon, { size: 13 }),
                h('span', null, `教学周次: ${activeModalItem.schedule.weekDescription || (activeModalItem.schedule.weeks?.length ? `${activeModalItem.schedule.weeks[0]}~${activeModalItem.schedule.weeks[activeModalItem.schedule.weeks.length - 1]}周` : '全学期')}`)
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

            // 方案 D：随堂备忘与作业清单 (Course Notes & Homework Todos)
            (() => {
              const modalCourseTodos = todos.filter(t => t.courseName === activeModalItem.course.name)
              return h('div', {
                style: {
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.12))',
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                    h(Edit3Icon, { size: 14 }),
                    h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '随堂备忘与作业待办:'),
                    h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `(${modalCourseTodos.length} 条)`)
                  ),
                  h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '勾选即完成')
                ),
                // 新增待办输入行
                h('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } },
                  h('input', {
                    type: 'text',
                    placeholder: '输入作业或备忘，如：第8周交实验报告...',
                    style: { ...S.input, marginBottom: 0, padding: '5px 10px', fontSize: '12px', flex: 1 },
                    value: modalTodoInput,
                    onChange: (e) => setModalTodoInput(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === 'Enter') {
                        handleAddTodo(activeModalItem.course.name, modalTodoInput)
                        setModalTodoInput('')
                      }
                    },
                  }),
                  h('button', {
                    style: { ...S.btnPrimary, padding: '5px 12px', fontSize: '12px', whiteSpace: 'nowrap' },
                    onClick: () => {
                      handleAddTodo(activeModalItem.course.name, modalTodoInput)
                      setModalTodoInput('')
                    },
                  }, '添加')
                ),
                // 待办事项列表
                modalCourseTodos.length === 0 ? h('div', {
                  style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', padding: '10px', textAlign: 'center', background: 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.03))', borderRadius: '6px' },
                }, '暂无该课程待办，可以在上方添加作业或复习笔记') : h('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' },
                },
                  modalCourseTodos.map(todo =>
                    h('div', {
                      key: todo.id,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: todo.completed ? 'transparent' : 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.05))',
                        border: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.08))',
                      },
                    },
                      h('div', {
                        style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, cursor: 'pointer' },
                        onClick: () => handleToggleTodo(todo.id),
                      },
                        todo.completed ? h(CheckSquareIcon, { size: 14, style: { color: '#10b981' } }) : h(SquareIcon, { size: 14, style: { color: 'var(--dsw-alias-text-sub, #71717a)' } }),
                        h('span', {
                          style: {
                            fontSize: '12px',
                            textDecoration: todo.completed ? 'line-through' : 'none',
                            color: todo.completed ? 'var(--dsw-alias-text-sub, #a1a1aa)' : 'inherit',
                          },
                        }, todo.title)
                      ),
                      h('button', {
                        style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)', padding: '2px', display: 'flex', alignItems: 'center' },
                        onClick: () => handleDeleteTodo(todo.id),
                        title: '删除该条备忘',
                      }, h(TrashIcon, { size: 13 }))
                    )
                  )
                )
              )
            })(),

            h('div', { style: { marginTop: '20px', textAlign: 'right' } },
              h('button', {
                style: { ...S.btnPrimary, padding: '7px 18px', fontSize: '12px' },
                onClick: () => setActiveModalItem(null),
              }, '关闭')
            )
          )
        ),

        // 7. 方案 D：全学期课程随堂备忘与作业待办清单 Modal
        showTodoDrawer && h('div', {
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
          onClick: () => setShowTodoDrawer(false),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))',
              color: 'var(--dsw-alias-text, inherit)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            // 标题栏
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h(CheckSquareIcon, { size: 18 }),
                h('span', { style: { fontSize: '18px', fontWeight: 700 } }, '课程随堂备忘与作业清单'),
                h('span', { style: S.badge }, `待完成 ${uncompletedTotal} 项 / 共 ${todos.length} 项`)
              ),
              h('button', {
                style: { background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' },
                onClick: () => setShowTodoDrawer(false),
              }, '✕')
            ),

            // 快捷添加待办区域
            h('div', {
              style: {
                background: 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.04))',
                border: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.1))',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
              },
            },
              h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '8px' } }, '为课程添加新待办 / 作业:'),
              h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                h('select', {
                  style: { ...S.input, width: '150px', marginBottom: 0, padding: '5px 8px', fontSize: '12px' },
                  value: drawerCourseSelect || (courses[0]?.name || ''),
                  onChange: (e) => setDrawerCourseSelect(e.target.value),
                },
                  courses.map(c => h('option', { key: c.name, value: c.name }, c.name))
                ),
                h('input', {
                  type: 'text',
                  placeholder: '输入作业或随堂笔记（如：周五前交实验报告）...',
                  style: { ...S.input, flex: 1, minWidth: '180px', marginBottom: 0, padding: '5px 10px', fontSize: '12px' },
                  value: drawerTodoText,
                  onChange: (e) => setDrawerTodoText(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      const cName = drawerCourseSelect || courses[0]?.name
                      if (cName && drawerTodoText) {
                        handleAddTodo(cName, drawerTodoText)
                        setDrawerTodoText('')
                      }
                    }
                  },
                }),
                h('button', {
                  style: { ...S.btnPrimary, padding: '5px 14px', fontSize: '12px' },
                  onClick: () => {
                    const cName = drawerCourseSelect || courses[0]?.name
                    if (cName && drawerTodoText) {
                      handleAddTodo(cName, drawerTodoText)
                      setDrawerTodoText('')
                    }
                  },
                }, '添加')
              )
            ),

            // 状态筛选 Tab (全部 / 待完成 / 已完成)
            h('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px' } },
              [
                { key: 'ALL', label: `全部 (${todos.length})` },
                { key: 'UNCOMPLETED', label: `待完成 (${uncompletedTotal})` },
                { key: 'COMPLETED', label: `已完成 (${todos.length - uncompletedTotal})` },
              ].map(f =>
                h('button', {
                  key: f.key,
                  style: {
                    ...S.btnSecondary,
                    padding: '3px 10px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    background: drawerFilter === f.key ? 'var(--dsw-alias-text, #18181b)' : 'transparent',
                    color: drawerFilter === f.key ? 'var(--dsw-alias-bg, #ffffff)' : 'inherit',
                    borderColor: drawerFilter === f.key ? 'transparent' : 'var(--dsw-alias-border, rgba(125,125,125,0.15))',
                    fontWeight: drawerFilter === f.key ? 600 : 400,
                  },
                  onClick: () => setDrawerFilter(f.key),
                }, f.label)
              )
            ),

            // 待办清单滚动区域
            h('div', { style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' } },
              todos
                .filter(t => drawerFilter === 'ALL' || (drawerFilter === 'UNCOMPLETED' ? !t.completed : t.completed))
                .length === 0
                ? h('div', {
                    style: { textAlign: 'center', padding: '36px', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '12px' },
                  }, '暂无对应状态的待办事项')
                : todos
                    .filter(t => drawerFilter === 'ALL' || (drawerFilter === 'UNCOMPLETED' ? !t.completed : t.completed))
                    .map(todo =>
                      h('div', {
                        key: todo.id,
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: todo.completed ? 'transparent' : 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.04))',
                          border: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.1))',
                        },
                      },
                        h('div', {
                          style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' },
                          onClick: () => handleToggleTodo(todo.id),
                        },
                          todo.completed ? h(CheckSquareIcon, { size: 16, style: { color: '#10b981' } }) : h(SquareIcon, { size: 16, style: { color: 'var(--dsw-alias-text-sub, #71717a)' } }),
                          h('div', null,
                            h('div', {
                              style: {
                                fontSize: '13px',
                                textDecoration: todo.completed ? 'line-through' : 'none',
                                color: todo.completed ? 'var(--dsw-alias-text-sub, #a1a1aa)' : 'inherit',
                                fontWeight: todo.completed ? 400 : 500,
                              },
                            }, todo.title),
                            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                              `课程: 《${todo.courseName}》`
                            )
                          )
                        ),
                        h('button', {
                          style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)', padding: '4px' },
                          onClick: () => handleDeleteTodo(todo.id),
                          title: '删除该条作业待办',
                        }, h(TrashIcon, { size: 14 }))
                      )
                    )
            ),

            h('div', { style: { marginTop: '16px', textAlign: 'right' } },
              h('button', {
                style: { ...S.btnPrimary, padding: '7px 20px', fontSize: '12px' },
                onClick: () => setShowTodoDrawer(false),
              }, '完成')
            )
          )
        ),

        // 6. 导出手机日历 Modal
        showExportModal && h('div', {
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
          onClick: () => setShowExportModal(false),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))',
              color: 'var(--dsw-alias-text, inherit)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h(SmartphoneIcon, { size: 18 }),
                h('span', { style: { fontSize: '16px', fontWeight: 700 } }, '导出为系统手机日历 (.ics)')
              ),
              h('button', {
                style: { background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' },
                onClick: () => setShowExportModal(false),
              }, '✕')
            ),

            h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '18px', lineHeight: 1.6 } },
              '将川大全学期真实排课（含具体教室、校区、授课教师及 1~16 周精准时段）生成标准日历文件。导入后可在手机锁屏或桌面日历小组件直接查看，并在上课前弹出提醒。'
            ),

            // 参数设置区
            h('div', {
              style: {
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '18px',
              },
            },
              // 第一周周一日期
              h('div', { style: { marginBottom: '12px' } },
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '第一教学周周一日期:'),
                h('input', {
                  type: 'date',
                  style: {
                    ...S.input,
                    marginBottom: '4px',
                    padding: '7px 10px',
                    fontSize: '13px',
                  },
                  value: exportStartDate,
                  onChange: (e) => setExportStartDate(e.target.value),
                }),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                  '默认按川大 2026-2027 秋季学期开学周一 (2026-08-31) 设定，若校历有变动可点选微调'
                )
              ),

              // 提前提醒分钟
              h('div', null,
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '课前弹窗提醒时间:'),
                h('select', {
                  style: {
                    ...S.input,
                    marginBottom: 0,
                    padding: '7px 10px',
                    fontSize: '13px',
                  },
                  value: exportAlarm,
                  onChange: (e) => setExportAlarm(parseInt(e.target.value)),
                },
                  h('option', { value: 15 }, '课前 15 分钟提醒 (推荐)'),
                  h('option', { value: 30 }, '课前 30 分钟提醒'),
                  h('option', { value: 10 }, '课前 10 分钟提醒'),
                  h('option', { value: 0 }, '不开启弹窗提醒')
                )
              )
            ),

            // 下载按钮
            h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' } },
              h('button', {
                style: { ...S.btnSecondary, padding: '8px 16px' },
                onClick: () => setShowExportModal(false),
              }, '取消'),
              h('button', {
                style: { ...S.btnPrimary, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px' },
                onClick: () => {
                  const url = `${SERVICE_URL}/api/schedule/export-ics?startDate=${exportStartDate}&alarmMinutes=${exportAlarm}&download=true`
                  window.open(url, '_blank')
                  setExportDownloaded(true)
                },
              },
                h(DownloadIcon, { size: 14 }),
                '立即下载 .ics 日历文件'
              )
            ),

            // 下载成功与导入贴士
            exportDownloaded && h('div', {
              style: {
                marginTop: '16px',
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#059669',
                fontSize: '12px',
                lineHeight: 1.6,
              },
            },
              h('div', { style: { fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' } },
                h(CheckCircleIcon, { size: 14 }),
                '日历文件已触发下载！系统导入指引:'
              ),
              h('div', null, '• 苹果系统 (iOS / macOS): 双击打开，或通过隔空投送发给 iPhone 点击“全部添加到日历”；'),
              h('div', null, '• 安卓系统 (小米 / 华为 / OPPO / vivo): 打开手机自带“日历” -> 设置 -> 选择从本地 .ics 导入；'),
              h('div', null, '• 桌面系统 (Windows / Mac / Outlook): 双击下载的文件直接添加并建立同步日历。')
            )
          )
        )
      )
    }

    // ================== 子页面 2：成绩与 GPA (含保研必修切换、走势图与Excel导出) ==================
    function GradesView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [data, setData] = useState({ grades: [], terms: [], termStats: [] })
      const [selectedTerm, setSelectedTerm] = useState('ALL')
      const [scope, setScope] = useState('ALL') // 'ALL' | 'REQUIRED' (保研必修)
      const [cacheNotice, setCacheNotice] = useState('')

      const fetchGrades = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
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
          SCU_CACHE.set('grades', d)
          setCacheNotice('')
        } catch (e) {
          const cached = SCU_CACHE.get('grades')
          if (cached && cached.data) {
            setData(cached.data)
            setCacheNotice(`离线快照 · ${cached.updatedAt}`)
          } else {
            setError(`网络异常: ${e.message}`)
          }
        } finally {
          setLoading(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        const cached = SCU_CACHE.get('grades')
        if (cached && cached.data && Array.isArray(cached.data.grades)) {
          setData(cached.data)
          setLoading(false)
          setCacheNotice(`已载入快照 (${cached.updatedAt})`)
          fetchGrades(true)
        } else {
          fetchGrades(false)
        }
      }, [fetchGrades])

      const allGrades = data.grades || []
      // 根据学期和课程性质双重筛选
      const filtered = allGrades.filter(g => {
        if (scope === 'REQUIRED' && !g.isRequired) return false
        if (selectedTerm !== 'ALL' && g.term !== selectedTerm) return false
        return true
      })

      const isRequiredScope = scope === 'REQUIRED'
      const curGpa = isRequiredScope ? (data.requiredGpa ?? '--') : (data.overallGpa ?? '--')
      const curScore = isRequiredScope ? (data.requiredAvgScore ?? '--') : (data.overallAvgScore ?? '--')
      const curCredit = isRequiredScope ? (data.requiredCredit ?? '--') : (data.totalCredit ?? '--')
      const curCount = isRequiredScope ? (data.requiredCourses ?? '--') : (data.totalCourses ?? '--')

      return h('div', null,
        // 1. 顶部视角切换器 (全部课程 vs 保研/评奖必修课)
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            borderRadius: '10px',
            padding: '10px 16px',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '统计口径:'),
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
                  padding: '5px 14px',
                  background: scope === 'ALL' ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
                  fontWeight: scope === 'ALL' ? 600 : 400,
                  boxShadow: scope === 'ALL' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                },
                onClick: () => setScope('ALL'),
              }, `全部修读 (${allGrades.length})`),
              h('button', {
                style: {
                  ...S.btnSecondary,
                  border: 'none',
                  padding: '5px 14px',
                  background: scope === 'REQUIRED' ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
                  fontWeight: scope === 'REQUIRED' ? 600 : 400,
                  boxShadow: scope === 'REQUIRED' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  color: scope === 'REQUIRED' ? '#2563eb' : 'inherit',
                },
                onClick: () => setScope('REQUIRED'),
              }, `仅必修课 (${data.requiredCourses || 0}门 · 保研/评优)`)
            )
          ),
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            cacheNotice && h('span', {
              style: {
                fontSize: '11px',
                color: 'var(--dsw-alias-text-sub, #71717a)',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.12))',
              },
            }, cacheNotice),
            // 导出 Excel/CSV
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              },
              onClick: () => {
                const url = `${SERVICE_URL}/api/grades/export-csv?onlyRequired=${scope === 'REQUIRED'}&download=true`
                window.open(url, '_blank')
              },
            },
              h(DownloadIcon, { size: 13 }),
              scope === 'REQUIRED' ? '导出必修成绩单 (Excel)' : '导出全部成绩单 (Excel)'
            ),
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              },
              onClick: fetchGrades,
            },
              h(RefreshIcon, { size: 13 }),
              '刷新'
            )
          )
        ),

        // 2. KPI 指标概览
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' } },
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center', position: 'relative' } },
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: isRequiredScope ? '#2563eb' : 'inherit' } }, curGpa),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              isRequiredScope ? '必修课加权 GPA (保研标准)' : '全科综合加权平均绩点 (GPA)'
            ),
            isRequiredScope && data.requiredGpa && data.overallGpa && (
              h('div', {
                style: {
                  fontSize: '11px',
                  color: data.requiredGpa >= data.overallGpa ? '#10b981' : '#ef4444',
                  marginTop: '4px',
                  fontWeight: 500,
                },
              }, `${data.requiredGpa >= data.overallGpa ? '↑' : '↓'} 较综合 GPA ${data.requiredGpa >= data.overallGpa ? '+' : ''}${(data.requiredGpa - data.overallGpa).toFixed(2)}`)
            )
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '26px', fontWeight: 700 } }, curScore),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              isRequiredScope ? '必修课加权平均分' : '全科综合加权平均分'
            )
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '26px', fontWeight: 700 } }, curCredit),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              isRequiredScope ? '必修课累计学分' : '累计修读总学分'
            )
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '26px', fontWeight: 700 } }, curCount),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              isRequiredScope ? '必修已修课程数' : '已获评课程总门数'
            )
          )
        ),

        // 3. 学期 GPA 趋势图卡片 (Term Trend)
        !loading && data.termStats && data.termStats.length > 0 && h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            marginBottom: '18px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
          },
        },
          h('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' } },
            h(ChartIcon, { size: 14 }),
            h('span', null, '历年学期绩点与学分走势')
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${data.termStats.length}, 1fr)`, gap: '12px' } },
            data.termStats.map((t, idx) =>
              h('div', {
                key: idx,
                style: {
                  background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.04))',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                  borderRadius: '8px',
                  padding: '10px',
                  textAlign: 'center',
                },
              },
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '4px' } }, t.term),
                h('div', { style: { fontSize: '18px', fontWeight: 700, color: '#2563eb' } }, t.gpa),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                  `${t.credits}学分 · ${t.avgScore}分`
                )
              )
            )
          )
        ),

        // 4. 学期筛选栏
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '学期筛选:'),
            h('select', {
              style: {
                ...S.btnSecondary,
                padding: '5px 10px',
                outline: 'none',
              },
              value: selectedTerm,
              onChange: (e) => setSelectedTerm(e.target.value),
            },
              h('option', { value: 'ALL' }, `全部学期 (${filtered.length} 门)`),
              (data.terms || []).map(t => h('option', { key: t, value: t }, t))
            )
          ),
          h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
            `当前展示 ${filtered.length} 门课程`
          )
        ),

        // 5. 课程列表渲染
        loading && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在拉取成绩并重新折算绩点...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' } }, error),

        !loading && !error && filtered.map((g, i) => {
          const num = parseFloat(g.score)
          const pass = !isNaN(num) ? num >= 60 : ['A', 'B', 'C', 'D', '优秀', '良好', '中等', '及格', '合格', '通过'].includes(g.gradeLevel)
          return h('div', { key: i, style: S.card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('div', null,
                h('span', { style: { fontSize: '15px', fontWeight: 600 } }, g.name),
                h('span', {
                  style: {
                    ...S.badge,
                    marginLeft: '8px',
                    borderColor: g.isRequired ? 'rgba(37, 99, 235, 0.3)' : 'inherit',
                    color: g.isRequired ? '#2563eb' : 'inherit',
                  },
                }, `${g.property || '课程'} · ${g.credit}学分`)
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
      const [cacheNotice, setCacheNotice] = useState('')

      const fetchExams = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
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
          SCU_CACHE.set('exams', d)
          setCacheNotice('')
        } catch (e) {
          const cached = SCU_CACHE.get('exams')
          if (cached && cached.data && Array.isArray(cached.data.exams)) {
            setExams(cached.data.exams)
            setCacheNotice(`离线快照 · ${cached.updatedAt}`)
          } else {
            setError(`网络异常: ${e.message}`)
          }
        } finally {
          setLoading(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        const cached = SCU_CACHE.get('exams')
        if (cached && cached.data && Array.isArray(cached.data.exams)) {
          setExams(cached.data.exams)
          setLoading(false)
          setCacheNotice(`已载入快照 (${cached.updatedAt})`)
          fetchExams(true)
        } else {
          fetchExams(false)
        }
      }, [fetchExams])

      return h('div', null,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `已排定考试 (${exams.length})`),
            cacheNotice && h('span', {
              style: {
                fontSize: '11px',
                color: 'var(--dsw-alias-text-sub, #71717a)',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.12))',
              },
            }, cacheNotice)
          ),
          h('button', {
            style: {
              ...S.btnSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            },
            onClick: fetchExams,
          },
            h(RefreshIcon, { size: 13 }),
            '刷新考试日程'
          )
        ),

        loading && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在拉取考试日程...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' } }, error),

        !loading && !error && exams.length === 0 && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '14px' } }, '当前暂无已排定的考试安排'),

        !loading && !error && exams.map((ex, i) =>
          h('div', { key: i, style: S.card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
              h('span', { style: { fontSize: '15px', fontWeight: 600 } }, ex.courseName),
              h('span', { style: S.badge }, `座位: ${ex.seatNumber || '现场公布'}`)
            ),
            h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-text, inherit)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' } },
              h(ClockIcon, { size: 13 }),
              h('span', null, `时间: ${ex.examTime}`)
            ),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' } },
              h(MapPinIcon, { size: 13 }),
              h('span', null, `考场地点: ${ex.location || '待公布'}`)
            )
          )
        )
      )
    }

    // ================== 子页面 4：空闲教室 / 考研自习室查询 (含具体节次与时间点筛选、1~12节矩阵、空调配置) ==================
    function ClassroomsView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [campus, setCampus] = useState('03') // 03 江安, 01 望江, 02 华西
      const [building, setBuilding] = useState('301')
      const todayStr = new Date().toISOString().slice(0, 10)
      const [selectedDate, setSelectedDate] = useState(todayStr)
      // 节次与具体时间筛选：0 表示大时段/全天，1~12 为特定小节
      const [selectedSession, setSelectedSession] = useState(0)
      const [selectedTimeSlot, setSelectedTimeSlot] = useState('all') // 'all' | 'morning' | 'afternoon' | 'evening'
      const [filterMode, setFilterMode] = useState('ALL') // 'ALL' | 'TARGET_FREE' | 'FREE_ALL_DAY' | 'HAS_AC'
      const [searchKw, setSearchKw] = useState('')
      const [data, setData] = useState({ classrooms: [], campuses: [], buildings: [], targetSessions: [], timetable: [] })
      const [activeModalRoom, setActiveModalRoom] = useState(null)

      const fetchClassrooms = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const q = new URLSearchParams({
            campus,
            building,
            date: selectedDate,
          })
          if (selectedSession > 0) {
            q.set('session', selectedSession.toString())
          } else if (selectedTimeSlot && selectedTimeSlot !== 'all') {
            q.set('timeSlot', selectedTimeSlot)
          }

          const resp = await fetch(`${SERVICE_URL}/api/classrooms/free?${q.toString()}`)
          if (resp.status === 401) return onRequireLogin()
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            setError(err.detail || '获取自习室数据失败')
            return
          }
          const d = await resp.json()
          setData(d)
        } catch (e) {
          setError(`网络异常: ${e.message}`)
        } finally {
          setLoading(false)
        }
      }, [campus, building, selectedDate, selectedSession, selectedTimeSlot, onRequireLogin])

      useEffect(() => {
        fetchClassrooms()
      }, [fetchClassrooms])

      // 切换校区时自动设定该校区首选自习教学楼
      const handleCampusChange = (newCampus) => {
        setCampus(newCampus)
        if (newCampus === '03') setBuilding('301')
        else if (newCampus === '01') setBuilding('104')
        else setBuilding('201')
      }

      const allRooms = data.classrooms || []
      const filteredRooms = allRooms.filter((r) => {
        if (filterMode === 'TARGET_FREE' && !r.isTargetFree) return false
        if (filterMode === 'FREE_ALL_DAY' && !r.isFreeAllDay) return false
        if (filterMode === 'HAS_AC' && !r.hasAirConditioner) return false
        if (searchKw && !r.name.toLowerCase().includes(searchKw.toLowerCase().trim())) return false
        return true
      })

      const targetFreeCount = allRooms.filter(r => r.isTargetFree).length
      const freeAllDayCount = allRooms.filter(r => r.isFreeAllDay).length
      const hasAcCount = allRooms.filter(r => r.hasAirConditioner).length

      // 计算快捷日期：今天、明天、后天
      const getRelativeDate = (offsetDays) => {
        const d = new Date()
        d.setDate(d.getDate() + offsetDays)
        return d.toISOString().slice(0, 10)
      }
      const tomorrowStr = getRelativeDate(1)
      const afterTomorrowStr = getRelativeDate(2)

      // 四川大学教务处官方作息时间表 (按江安 vs 望江/华西自适应)
      const currentTimetable = (data.timetable && data.timetable.length === 12)
        ? data.timetable
        : getOfficialScuTimetable(campus)

      // 当前目标聚焦小节集合
      const activeTargetSessions = data.targetSessions || (selectedSession > 0 ? [selectedSession] : [])

      return h('div', null,
        // 1. 顶部控制栏 (校区切换、日期选择、教学楼胶囊、具体节次与时间点选择器)
        h('div', {
          style: {
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            borderRadius: '10px',
            padding: '16px 18px',
            marginBottom: '18px',
          },
        },
          // 第一行：校区与日期切换
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' } },
            // 校区 Segmented 按钮
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '所在校区:'),
              h('div', {
                style: {
                  display: 'flex',
                  background: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.1))',
                  borderRadius: '6px',
                  padding: '2px',
                },
              },
                [
                  { code: '03', label: '江安校区' },
                  { code: '01', label: '望江校区' },
                  { code: '02', label: '华西校区' },
                ].map(c =>
                  h('button', {
                    key: c.code,
                    style: {
                      ...S.btnSecondary,
                      border: 'none',
                      padding: '5px 14px',
                      background: campus === c.code ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
                      fontWeight: campus === c.code ? 600 : 400,
                      boxShadow: campus === c.code ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    },
                    onClick: () => handleCampusChange(c.code),
                  }, c.label)
                )
              )
            ),

            // 日期快捷选择
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '自习日期:'),
              h('button', {
                style: {
                  ...S.btnSecondary,
                  padding: '5px 10px',
                  background: selectedDate === todayStr ? 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.15))' : 'transparent',
                  fontWeight: selectedDate === todayStr ? 600 : 400,
                },
                onClick: () => setSelectedDate(todayStr),
              }, '今天'),
              h('button', {
                style: {
                  ...S.btnSecondary,
                  padding: '5px 10px',
                  background: selectedDate === tomorrowStr ? 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.15))' : 'transparent',
                  fontWeight: selectedDate === tomorrowStr ? 600 : 400,
                },
                onClick: () => setSelectedDate(tomorrowStr),
              }, '明天'),
              h('button', {
                style: {
                  ...S.btnSecondary,
                  padding: '5px 10px',
                  background: selectedDate === afterTomorrowStr ? 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.15))' : 'transparent',
                  fontWeight: selectedDate === afterTomorrowStr ? 600 : 400,
                },
                onClick: () => setSelectedDate(afterTomorrowStr),
              }, '后天'),
              h('input', {
                type: 'date',
                style: {
                  ...S.input,
                  width: 'auto',
                  marginBottom: 0,
                  padding: '4px 8px',
                  fontSize: '12px',
                },
                value: selectedDate,
                onChange: (e) => setSelectedDate(e.target.value),
              }),
              h('button', {
                style: { ...S.btnSecondary, display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px' },
                onClick: fetchClassrooms,
              },
                h(RefreshIcon, { size: 12 }),
                '刷新'
              )
            )
          ),

          // 第二行：常用自习教学楼快捷胶囊
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingBottom: '12px', borderBottom: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.08))' } },
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '常用教学楼:'),
            (data.buildings || []).map(b =>
              h('button', {
                key: b.code,
                style: {
                  ...S.btnSecondary,
                  padding: '4px 10px',
                  fontSize: '12px',
                  borderRadius: '12px',
                  background: building === b.code ? 'var(--dsw-alias-text, #18181b)' : 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
                  color: building === b.code ? 'var(--dsw-alias-bg, #ffffff)' : 'inherit',
                  borderColor: building === b.code ? 'transparent' : 'var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                },
                onClick: () => setBuilding(b.code),
              }, b.name)
            )
          ),

          // 第三行：具体时间点与节次图形化筛选区 (4大时段 + 12小节精确双行胶囊)
          h('div', { style: { paddingTop: '12px' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                h(ClockIcon, { size: 14 }),
                h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '自习时间点与节次筛选:'),
                h('span', {
                  style: {
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#2563eb',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(37, 99, 235, 0.08)',
                  },
                },
                  selectedSession > 0
                    ? `已选 ${currentTimetable[selectedSession - 1]?.label}`
                    : (selectedTimeSlot === 'morning' ? `已选 上午全段 (第1~4节 · ${currentTimetable[0]?.start}-${currentTimetable[3]?.end})` : (selectedTimeSlot === 'afternoon' ? `已选 下午全段 (第5~9节 · ${currentTimetable[4]?.start}-${currentTimetable[8]?.end})` : (selectedTimeSlot === 'evening' ? `已选 晚间全段 (第10~12节 · ${currentTimetable[9]?.start}-${currentTimetable[11]?.end})` : `已选 全天时段 (第1~12节 · ${currentTimetable[0]?.start}-${currentTimetable[11]?.end})`)))
                )
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.1))', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                  campus === '03' ? '江安作息 · 08:15起' : '望江/华西作息 · 08:00起'
                ),
                (selectedSession > 0 || selectedTimeSlot !== 'all') && h('button', {
                  style: {
                    ...S.btnSecondary,
                    padding: '2px 8px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    color: 'var(--dsw-alias-text-sub, #71717a)',
                  },
                  onClick: () => {
                    setSelectedSession(0)
                    setSelectedTimeSlot('all')
                  },
                  title: '恢复查看全天 1~12 节教室情况',
                }, '重置为全天')
              )
            ),

            // 大时段分段 Pill 栏
            h('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' } },
              [
                { key: 'all', label: `全天 (1~12节 · ${currentTimetable[0]?.start}-${currentTimetable[11]?.end})` },
                { key: 'morning', label: `上午 (1~4节 · ${currentTimetable[0]?.start}-${currentTimetable[3]?.end})` },
                { key: 'afternoon', label: `下午 (5~9节 · ${currentTimetable[4]?.start}-${currentTimetable[8]?.end})` },
                { key: 'evening', label: `晚间 (10~12节 · ${currentTimetable[9]?.start}-${currentTimetable[11]?.end})` },
              ].map(slot => {
                const isActive = selectedSession === 0 && selectedTimeSlot === slot.key
                return h('button', {
                  key: slot.key,
                  style: {
                    ...S.btnSecondary,
                    padding: '4px 10px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    background: isActive ? 'var(--dsw-alias-text, #18181b)' : 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.08))',
                    color: isActive ? 'var(--dsw-alias-bg, #ffffff)' : 'inherit',
                    borderColor: isActive ? 'transparent' : 'var(--dsw-alias-border, rgba(125,125,125,0.15))',
                    fontWeight: isActive ? 600 : 400,
                  },
                  onClick: () => {
                    setSelectedSession(0)
                    setSelectedTimeSlot(slot.key)
                  },
                }, slot.label)
              })
            ),

            // 精准 12 小节双行微型胶囊网格 (带时间点，既有第几节又有时间点)
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px' } },
              currentTimetable.map(t => {
                const isSelected = selectedSession === t.session
                const isCurrentRealtime = data.isToday && data.currentRealtimeSession === t.session

                return h('button', {
                  key: t.session,
                  title: `${t.label} · ${t.period} (点击锁定筛选)`,
                  style: {
                    ...S.btnSecondary,
                    padding: '5px 2px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: isSelected ? '1px solid #2563eb' : (isCurrentRealtime ? '1px dashed #2563eb' : '1px solid var(--dsw-alias-border, rgba(125,125,125,0.12))'),
                    background: isSelected ? '#2563eb' : (isCurrentRealtime ? 'rgba(37, 99, 235, 0.08)' : 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))'),
                    color: isSelected ? '#ffffff' : 'inherit',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 1px 3px rgba(37, 99, 235, 0.3)' : 'none',
                    transition: 'all 0.12s ease',
                  },
                  onClick: () => {
                    // 若点击已选中的单节则切回全天，否则选中该单节
                    if (selectedSession === t.session) {
                      setSelectedSession(0)
                      setSelectedTimeSlot('all')
                    } else {
                      setSelectedSession(t.session)
                      setSelectedTimeSlot('')
                    }
                  },
                },
                  h('span', { style: { fontSize: '11px', fontWeight: 600, lineHeight: 1.2 } }, `第${t.session}节`),
                  h('span', { style: { fontSize: '9px', opacity: isSelected ? 0.9 : 0.65, lineHeight: 1.2, marginTop: '2px' } }, t.start)
                )
              })
            )
          )
        ),

        // 2. 指标概览卡片 (KPI)
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' } },
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '20px', fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
              data.targetLabel || (selectedSession > 0 ? `第 ${selectedSession} 节` : '全天时段')
            ),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              selectedSession > 0 ? `${currentTimetable[selectedSession - 1]?.start} ~ ${currentTimetable[selectedSession - 1]?.end} 目标时段` : (selectedDate === todayStr ? '今日排期' : `${selectedDate} 目标日期`)
            )
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '24px', fontWeight: 700, color: '#10b981' } }, `${targetFreeCount} 间`),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, '所选时段完全空闲 (可前往自习)')
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '24px', fontWeight: 700 } }, `${freeAllDayCount} 间`),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, '全天空闲 (全天无任何课程)')
          ),
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center' } },
            h('div', { style: { fontSize: '24px', fontWeight: 700 } }, `${allRooms.length} 间`),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } }, `${data.campus || '江安'} · ${data.building || '教学楼'} 总教室`)
          )
        ),

        // 3. 筛选与教室号快速检索条
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          },
        },
          // 快速过滤按钮组
          h('div', { style: { display: 'flex', gap: '6px' } },
            [
              { key: 'ALL', label: `全部教室 (${allRooms.length})` },
              { key: 'TARGET_FREE', label: `所选时段空闲 (${targetFreeCount})` },
              { key: 'FREE_ALL_DAY', label: `全天空闲 (${freeAllDayCount})` },
              { key: 'HAS_AC', label: `空调/研讨 (${hasAcCount})` },
            ].map(f =>
              h('button', {
                key: f.key,
                style: {
                  ...S.btnSecondary,
                  padding: '5px 12px',
                  borderRadius: '16px',
                  background: filterMode === f.key ? 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.18))' : 'transparent',
                  fontWeight: filterMode === f.key ? 600 : 400,
                  color: filterMode === f.key ? '#2563eb' : 'inherit',
                  borderColor: filterMode === f.key ? '#2563eb' : 'var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                },
                onClick: () => setFilterMode(f.key),
              }, f.label)
            )
          ),

          // 快速搜索输入框
          h('div', { style: { position: 'relative', width: '220px' } },
            h('input', {
              type: 'text',
              placeholder: '搜索教室号，如 A208、A101...',
              style: {
                ...S.input,
                marginBottom: 0,
                padding: '6px 10px 6px 30px',
                fontSize: '12px',
              },
              value: searchKw,
              onChange: (e) => setSearchKw(e.target.value),
            }),
            h('span', { style: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' } },
              h(SearchIcon, { size: 13 })
            )
          )
        ),

        // 加载与报错提示
        loading && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在实时同步教务处各教室 1~12 节课占用状态...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' } }, error),

        // 4. 空闲教室卡片网格
        !loading && !error && filteredRooms.length === 0 && h('div', {
          style: {
            textAlign: 'center',
            padding: '50px 20px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            background: 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.03))',
            borderRadius: '10px',
            border: '1px dashed var(--dsw-alias-border, rgba(125,125,125,0.15))',
          },
        }, '未匹配到符合条件的自习教室，可尝试切换所选时段或更换楼栋'),

        !loading && !error && filteredRooms.length > 0 && h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          },
        },
          filteredRooms.map((r, idx) => {
            const isTargetFree = r.isTargetFree
            const consecutive = r.consecutiveFreeSessions

            return h('div', {
              key: idx,
              onClick: () => setActiveModalRoom(r),
              title: '点击查看 1~12 节全天详细排课与自习建议',
              style: {
                ...S.card,
                marginBottom: 0,
                padding: '14px 16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                borderLeft: isTargetFree ? '3px solid #10b981' : '3px solid rgba(125,125,125,0.3)',
              },
            },
              // 卡片顶部：教室名、座位数、标签
              h('div', null,
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                    h('span', { style: { fontSize: '16px', fontWeight: 700 } }, r.name),
                    h('span', {
                      style: {
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.1))',
                        color: 'var(--dsw-alias-text-sub, #71717a)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      },
                    },
                      h(UsersIcon, { size: 10 }),
                      `${r.capacity}座`
                    )
                  ),
                  h('span', {
                    style: {
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: isTargetFree ? 'rgba(16, 185, 129, 0.12)' : 'rgba(125, 125, 125, 0.1)',
                      color: isTargetFree ? '#059669' : 'var(--dsw-alias-text-sub, #71717a)',
                    },
                  },
                    isTargetFree
                      ? (consecutive > 1 ? `空闲 · 连空${consecutive}节` : '所选时段空闲')
                      : '所选时段占用'
                  )
                ),

                // 特性标签 (全天无课、空调)
                h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } },
                  r.isFreeAllDay && h('span', {
                    style: {
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#2563eb',
                      fontWeight: 500,
                    },
                  }, '全天空闲'),
                  r.hasAirConditioner && h('span', {
                    style: {
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      background: 'rgba(14, 165, 233, 0.1)',
                      color: '#0284c7',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                    },
                  },
                    h(SnowflakeIcon, { size: 9 }),
                    '空调研讨'
                  )
                )
              ),

              // 卡片底部：1~12 节微型矩阵条 (Session Matrix)
              h('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.08))' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '5px' } },
                  h('span', null, '1~12节时序状况:'),
                  h('span', null, '点击看详情')
                ),
                h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2px' } },
                  (r.sessions || []).map((isFree, sIdx) => {
                    const sessionNum = sIdx + 1
                    const isTargetFocused = activeTargetSessions.includes(sessionNum)
                    const tInfo = currentTimetable[sIdx]

                    return h('div', {
                      key: sIdx,
                      title: `${tInfo?.label || ('第 ' + sessionNum + ' 节')}: ${isFree ? '空闲可自习' : '课程占用'}`,
                      style: {
                        height: '18px',
                        borderRadius: '3px',
                        background: isFree ? 'rgba(16, 185, 129, 0.22)' : 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.15))',
                        color: isFree ? '#059669' : 'rgba(125, 125, 125, 0.45)',
                        fontSize: '9px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: isTargetFocused ? '2px solid #2563eb' : 'none',
                        outlineOffset: '-1px',
                        zIndex: isTargetFocused ? 1 : 0,
                      },
                    }, sessionNum)
                  })
                )
              )
            )
          })
        ),

        // 5. 教室全天排课详情弹窗 Modal
        activeModalRoom && h('div', {
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
          onClick: () => setActiveModalRoom(null),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))',
              color: 'var(--dsw-alias-text, inherit)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h(LibraryIcon, { size: 18 }),
                h('span', { style: { fontSize: '18px', fontWeight: 700 } }, `${data.building || ''} · ${activeModalRoom.name}`),
                h('span', { style: S.badge }, `${activeModalRoom.capacity} 个座位`)
              ),
              h('button', {
                style: { background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' },
                onClick: () => setActiveModalRoom(null),
              }, '✕')
            ),

            activeModalRoom.remark && h('div', {
              style: {
                fontSize: '12px',
                color: 'var(--dsw-alias-text-sub, #71717a)',
                marginBottom: '14px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.05))',
              },
            }, `教室特性: ${activeModalRoom.remark}`),

            h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '8px' } }, `${selectedDate} 当日 1~12 节全天占用时序:`),

            // 垂直节次清单 (标注具体起止时间点)
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflowY: 'auto' } },
              (activeModalRoom.sessions || []).map((isFree, sIdx) => {
                const sNum = sIdx + 1
                const tInfo = currentTimetable[sIdx]
                const isFocused = activeTargetSessions.includes(sNum)

                return h('div', {
                  key: sIdx,
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: isFocused ? 'rgba(37, 99, 235, 0.08)' : (isFree ? 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.04))' : 'rgba(125,125,125,0.08)'),
                    border: isFocused ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid var(--dsw-alias-border, rgba(125,125,125,0.06))',
                  },
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    h('span', { style: { fontWeight: 600, fontSize: '12px' } }, `第 ${sNum} 节`),
                    h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `${tInfo?.start} ~ ${tInfo?.end} (${tInfo?.period})`),
                    isFocused && h('span', { style: { fontSize: '10px', color: '#2563eb', fontWeight: 600 } }, '(当前关注)')
                  ),
                  h('span', {
                    style: {
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isFree ? '#059669' : 'var(--dsw-alias-text-sub, #71717a)',
                    },
                  }, isFree ? '空闲可自习' : '课程占用')
                )
              })
            ),

            h('div', { style: { marginTop: '18px', textAlign: 'right' } },
              h('button', {
                style: { ...S.btnPrimary, padding: '7px 18px', fontSize: '12px' },
                onClick: () => setActiveModalRoom(null),
              }, '关闭')
            )
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
              h('div', { style: S.subTitle }, '全自动登录 · 课表日程 · 全量成绩与 GPA 统计 · 考试安排 · 空闲自习室')
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
            },
              h(CalendarIcon, { size: 14, style: { marginRight: '6px' } }),
              '课表日程'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'grades'),
              onClick: () => setActiveTab('grades'),
            },
              h(ChartIcon, { size: 14, style: { marginRight: '6px' } }),
              '成绩与绩点'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'exams'),
              onClick: () => setActiveTab('exams'),
            },
              h(FileTextIcon, { size: 14, style: { marginRight: '6px' } }),
              '考试安排'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'classrooms'),
              onClick: () => setActiveTab('classrooms'),
            },
              h(LibraryIcon, { size: 14, style: { marginRight: '6px' } }),
              '空闲自习室'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'settings'),
              onClick: () => setActiveTab('settings'),
            },
              h(SettingsIcon, { size: 14, style: { marginRight: '6px' } }),
              '账号与凭据'
            )
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
                  activeTab === 'exams' && h(ExamsView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'classrooms' && h(ClassroomsView, { onRequireLogin: () => setActiveTab('settings') })
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
