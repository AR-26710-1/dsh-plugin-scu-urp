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
    const { useState, useEffect, useCallback, useMemo, useRef } = React

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
        transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.18s ease',
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

    // 注入灵动微动效与卡片悬停微阴影全局样式
    if (typeof document !== 'undefined' && !document.getElementById('scu-smart-ui-styles')) {
      const styleEl = document.createElement('style')
      styleEl.id = 'scu-smart-ui-styles'
      styleEl.textContent = `
        @keyframes scuFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scu-tab-content {
          animation: scuFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .scu-hover-card {
          transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.18s ease !important;
        }
        .scu-hover-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
        }
      `
      document.head.appendChild(styleEl)
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

    // 通用高校学术/教务图标（原创黑白简笔学位帽，暗黑/亮色主题自适应）
    function ScuIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16
      const style = props?.style || {}
      return h('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 48 48',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0, ...style },
        ...props,
      }, [
        h('path', { d: 'M24 10L42 20L24 30L6 20Z' }),
        h('path', { d: 'M14 24.5V34C14 38.5 34 38.5 34 34V24.5' }),
        h('path', { d: 'M38 22V32', strokeWidth: 2.5 }),
        h('circle', { cx: 38, cy: 34, r: 1.5, fill: 'currentColor' })
      ])
    }
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
    const ExternalLinkIcon = createSvgIcon(['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6'], [], [{ x1: 10, y1: 14, x2: 21, y2: 3 }])
    const ShieldIcon = createSvgIcon(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'])
    const QrCodeIcon = createSvgIcon(['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2'], [], [], [{ x: 7, y: 7, w: 10, h: 10, rx: 1 }])
    const SearchIcon = createSvgIcon(['M21 21l-4.35-4.35'], [{ cx: 11, cy: 11, r: 8 }])
    const CheckSquareIcon = createSvgIcon(['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'])
    const SquareIcon = createSvgIcon([], [], [], [{ x: 3, y: 3, w: 18, h: 18, rx: 2 }])
    const TrashIcon = createSvgIcon(['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'])
    const PlusIcon = createSvgIcon([], [], [{ x1: 12, y1: 5, x2: 12, y2: 19 }, { x1: 5, y1: 12, x2: 19, y2: 12 }])
    const Edit3Icon = createSvgIcon(['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'])
    const CompassIcon = createSvgIcon(['M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.24 6.76l-1.48 4.24a1 1 0 0 1-.52.52l-4.24 1.48a.25.25 0 0 1-.32-.32l1.48-4.24a1 1 0 0 1 .52-.52l4.24-1.48a.25.25 0 0 1 .32.32z'])
    const SlidersIcon = createSvgIcon([], [], [{ x1: 4, y1: 21, x2: 4, y2: 14 }, { x1: 4, y1: 10, x2: 4, y2: 3 }, { x1: 12, y1: 21, x2: 12, y2: 12 }, { x1: 12, y1: 8, x2: 12, y2: 3 }, { x1: 20, y1: 21, x2: 20, y2: 16 }, { x1: 20, y1: 12, x2: 20, y2: 3 }, { x1: 1, y1: 14, x2: 7, y2: 14 }, { x1: 9, y1: 8, x2: 15, y2: 8 }, { x1: 17, y1: 16, x2: 23, y2: 16 }])
    const TrendingUpIcon = createSvgIcon(['M23 6l-9.5 9.5-5-5L1 18'], [], [{ x1: 17, y1: 6, x2: 23, y2: 6 }, { x1: 23, y1: 6, x2: 23, y2: 12 }])
    const AwardIcon = createSvgIcon(['M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M8.21 13.89L7 23l5-3 5 3-1.21-9.12'])
    const BookOpenIcon = createSvgIcon(['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'])
    const ZapIcon = createSvgIcon(['M13 2L3 14h9l-1 8 10-12h-9l1-8z'])
    const KeyIcon = createSvgIcon(['M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5a6 6 0 1 0-2.5 7.5L2 23l4-1 1-4 3-1 2 2 8-8z'])
    const EyeIcon = createSvgIcon(['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'], [{ cx: 12, cy: 12, r: 3 }])
    const EyeOffIcon = createSvgIcon(['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'], [], [{ x1: 1, y1: 1, x2: 23, y2: 23 }])
    const ArrowLeftIcon = createSvgIcon(['M19 12H5', 'M12 19l-7-7 7-7'])
    const ChevronRightIcon = createSvgIcon(['M9 18l6-6-6-6'])
    const CreditCardIcon = createSvgIcon(['M1 10h22'], [], [], [{ x: 1, y: 4, w: 22, h: 16, rx: 2 }])
    const WifiIcon = createSvgIcon(['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0'], [{ cx: 12, cy: 20, r: 1 }])
    const ActivityIcon = createSvgIcon(['M22 12h-4l-3 9L9 3l-3 9H2'])
    const TruckIcon = createSvgIcon(['M1 3h15v13H1z', 'M16 8h4l3 3v5h-7V8z'], [{ cx: 5.5, cy: 18.5, r: 2.5 }, { cx: 18.5, cy: 18.5, r: 2.5 }])
    const WrenchIcon = createSvgIcon(['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'])
    const XIcon = createSvgIcon([], [], [{ x1: 18, y1: 6, x2: 6, y2: 18 }, { x1: 6, y1: 6, x2: 18, y2: 18 }])
    const TagIcon = createSvgIcon(['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'], [{ cx: 7, cy: 7, r: 1.5 }])
    const CoffeeIcon = createSvgIcon(['M18 8h1a4 4 0 0 1 0 8h-1', 'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z'], [], [{ x1: 6, y1: 1, x2: 6, y2: 4 }, { x1: 10, y1: 1, x2: 10, y2: 4 }, { x1: 14, y1: 1, x2: 14, y2: 4 }])
    const ShoppingCartIcon = createSvgIcon(['M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'], [{ cx: 9, cy: 21, r: 1 }, { cx: 20, cy: 21, r: 1 }])
    const DropletIcon = createSvgIcon(['M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'])
    const CrosshairIcon = createSvgIcon(['M12 2v4', 'M12 18v4', 'M2 12h4', 'M18 12h4'], [{ cx: 12, cy: 12, r: 10 }, { cx: 12, cy: 12, r: 3 }])
    const PlayIcon = createSvgIcon(['M5 3l14 9-14 9V3z'])
    const SquareStopIcon = createSvgIcon([], [], [], [{ x: 4, y: 4, w: 16, h: 16, rx: 2 }])
    const ChevronUpIcon = createSvgIcon([], [], [{ x1: 18, y1: 15, x2: 12, y2: 9 }, { x1: 12, y1: 9, x2: 6, y2: 15 }])
    const ChevronDownIcon = createSvgIcon([], [], [{ x1: 6, y1: 9, x2: 12, y2: 15 }, { x1: 12, y1: 15, x2: 18, y2: 9 }])
    const AlertTriangleIcon = createSvgIcon(['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'], [], [{ x1: 12, y1: 9, x2: 12, y2: 13 }, { x1: 12, y1: 17, x2: 12.01, y2: 17 }])
    const TerminalIcon = createSvgIcon(['M4 17l6-6-6-6'], [], [{ x1: 12, y1: 19, x2: 20, y2: 19 }])

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

    // ================== 用户自定义排课与个性化日程持久化管理器 ==================
    const SCU_CUSTOM_SCHEDULE_STORE = {
      KEY: 'scu_custom_schedule_v2',
      load() {
        try {
          const raw = localStorage.getItem(this.KEY)
          if (!raw) return { overrides: {}, customCourses: [] }
          const parsed = JSON.parse(raw)
          return {
            overrides: parsed.overrides || {},
            customCourses: Array.isArray(parsed.customCourses) ? parsed.customCourses : [],
          }
        } catch (e) {
          console.warn('Failed to parse custom schedules:', e)
          return { overrides: {}, customCourses: [] }
        }
      },
      save(data) {
        try {
          localStorage.setItem(this.KEY, JSON.stringify(data))
        } catch (e) {
          console.error('Failed to save custom schedule:', e)
        }
      },
    }

    // 辅助函数：根据课程对象生成唯一标识键
    function getCourseUniqueKey(c) {
      if (!c) return 'unknown'
      if (c.id) return String(c.id)
      const num = c.courseNumber || ''
      const seq = c.unitNumber || ''
      if (num && seq) return `${num}_${seq}`
      return c.name || 'unnamed'
    }

    // 辅助函数：解析周次描述字符串为数组 (例如 "1-16周", "1-8, 10-16周", "单周", "双周")
    function parseWeekDescription(desc) {
      if (!desc || typeof desc !== 'string') return Array.from({ length: 16 }, (_, i) => i + 1)
      const weeks = new Set()
      const str = desc.trim()
      const rangeMatches = str.matchAll(/(\d+)\s*[-~至到]\s*(\d+)/g)
      let found = false
      for (const m of rangeMatches) {
        found = true
        const start = parseInt(m[1], 10)
        const end = parseInt(m[2], 10)
        for (let i = Math.min(start, end); i <= Math.max(start, end) && i <= 30; i++) {
          if (str.includes('单周') && i % 2 === 0) continue
          if (str.includes('双周') && i % 2 !== 0) continue
          weeks.add(i)
        }
      }
      if (!found) {
        const singleMatches = str.matchAll(/\b(\d+)\b/g)
        for (const m of singleMatches) {
          const w = parseInt(m[1], 10)
          if (w >= 1 && w <= 30) {
            found = true
            weeks.add(w)
          }
        }
      }
      if (weeks.size === 0) {
        return Array.from({ length: 16 }, (_, i) => i + 1)
      }
      return Array.from(weeks).sort((a, b) => a - b)
    }

    // 辅助函数：根据开学第一教学周周一的公历日期，计算当前真实教学周次 (以教务处首页 span_bbzx 官方记录为基准并自演进)
    function calculateCurrentAcademicWeek(firstMondayStr) {
      if (!firstMondayStr || typeof firstMondayStr !== 'string') return 12
      const parts = firstMondayStr.split('-').map(Number)
      if (parts.length !== 3) return 12
      const firstMonday = new Date(parts[0], parts[1] - 1, parts[2])
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const diffMs = today.getTime() - firstMonday.getTime()
      const diffDays = Math.floor(diffMs / (24 * 3600 * 1000))
      if (diffDays < 0) return 1
      const currentWeek = Math.floor(diffDays / 7) + 1
      return Math.min(25, Math.max(1, currentWeek))
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
      const [rawCourses, setRawCourses] = useState([])
      const [customStore, setCustomStore] = useState(() => SCU_CUSTOM_SCHEDULE_STORE.load())
      const [scheduleMeta, setScheduleMeta] = useState(() => {
        const cached = SCU_CACHE.get('schedule')
        return cached?.data ? {
          semesterName: cached.data.semesterName || '2026-2027 秋季学期',
          firstMondayDate: cached.data.firstMondayDate || '2026-08-31',
          currentWeek: cached.data.currentWeek || 12,
          schoolCalendarText: cached.data.schoolCalendarText || '2026-2027 秋  第12周   星期三',
        } : {
          semesterName: '2026-2027 秋季学期',
          firstMondayDate: '2026-08-31',
          currentWeek: 12,
          schoolCalendarText: '2026-2027 秋  第12周   星期三',
        }
      })
      const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
      const [selectedWeek, setSelectedWeek] = useState('ALL') // 'ALL' | 1~20
      const [activeModalItem, setActiveModalItem] = useState(null) // 详情弹窗数据
      const [showExportModal, setShowExportModal] = useState(false) // 导出日历弹窗
      const [exportStartDate, setExportStartDate] = useState('2026-08-31') // 第一周周一日期
      const [exportAlarm, setExportAlarm] = useState(15) // 提醒分钟
      const [exportDownloaded, setExportDownloaded] = useState(false)
      const [cacheNotice, setCacheNotice] = useState('')

      // 随堂备忘与作业待办状态
      const [todos, setTodos] = useState([])
      const [showTodoDrawer, setShowTodoDrawer] = useState(false)
      const [modalTodoInput, setModalTodoInput] = useState('')
      const [drawerFilter, setDrawerFilter] = useState('ALL') // 'ALL' | 'UNCOMPLETED' | 'COMPLETED'
      const [drawerCourseSelect, setDrawerCourseSelect] = useState('')
      const [drawerTodoText, setDrawerTodoText] = useState('')

      // 修改课程时间地点弹窗状态
      const [editScheduleModal, setEditScheduleModal] = useState(null)

      // 添加自定义课程/日程弹窗状态
      const [showAddCourseModal, setShowAddCourseModal] = useState(false)
      const [addForm, setAddForm] = useState({
        name: '',
        teacher: '',
        credit: '0',
        property: '自定义日程',
        hasSchedule: true,
        day: 1,
        startSession: 1,
        continuingSessions: 2,
        campus: '江安',
        classroom: '',
        weekDescription: '1-16周',
        note: '',
      })

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
          setRawCourses(d.courses || [])
          if (d.semesterName || d.firstMondayDate || d.schoolCalendarText) {
            setScheduleMeta({
              semesterName: d.semesterName || '2026-2027 秋季学期',
              firstMondayDate: d.firstMondayDate || '2026-08-31',
              currentWeek: d.currentWeek || 12,
              schoolCalendarText: d.schoolCalendarText || '',
            })
            if (d.firstMondayDate) {
              setExportStartDate(d.firstMondayDate)
            }
          }
          SCU_CACHE.set('schedule', d)
          setCacheNotice('')
        } catch (e) {
          const cached = SCU_CACHE.get('schedule')
          if (cached && cached.data && Array.isArray(cached.data.courses)) {
            setRawCourses(cached.data.courses)
            if (cached.data.semesterName || cached.data.firstMondayDate) {
              setScheduleMeta({
                semesterName: cached.data.semesterName || '2026-2027 秋季学期',
                firstMondayDate: cached.data.firstMondayDate || '2026-08-31',
                currentWeek: cached.data.currentWeek || 12,
                schoolCalendarText: cached.data.schoolCalendarText || '',
              })
              if (cached.data.firstMondayDate) {
                setExportStartDate(cached.data.firstMondayDate)
              }
            }
            setCacheNotice(`离线快照 · ${cached.updatedAt}`)
          } else {
            setError(`网络异常: ${e.message}`)
          }
        } finally {
          setLoading(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        const cached = SCU_CACHE.get('schedule')
        if (cached && cached.data && Array.isArray(cached.data.courses)) {
          setRawCourses(cached.data.courses)
          if (cached.data.semesterName || cached.data.firstMondayDate) {
            setScheduleMeta({
              semesterName: cached.data.semesterName || '2026-2027 秋季学期',
              firstMondayDate: cached.data.firstMondayDate || '2026-08-31',
              currentWeek: cached.data.currentWeek || 12,
              schoolCalendarText: cached.data.schoolCalendarText || '',
            })
            if (cached.data.firstMondayDate) {
              setExportStartDate(cached.data.firstMondayDate)
            }
          }
          setLoading(false)
          setCacheNotice(`已载入快照 (${cached.updatedAt})`)
          fetchSchedule(true)
        } else {
          fetchSchedule(false)
        }
        SCU_TODO_STORE.load().then(t => setTodos(t))
        setCustomStore(SCU_CUSTOM_SCHEDULE_STORE.load())
      }, [fetchSchedule])

      // 待办增删改
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

      // 1. 合并教务处课程与自定义覆盖/新增课程
      const mergedCourses = useMemo(() => {
        const list = rawCourses.map(c => {
          const cKey = getCourseUniqueKey(c)
          const override = customStore.overrides?.[cKey]
          if (override) {
            return {
              ...c,
              ...override,
              _isOverridden: true,
              _rawSchedules: c.schedules,
            }
          }
          return c
        })

        const customList = (customStore.customCourses || []).map(cc => ({
          ...cc,
          isCustom: true,
        }))

        return [...list, ...customList]
      }, [rawCourses, customStore])

      // 2. 严格排课有效性判断：只有同时具有星期 1~7 以及节次 1~12 的排课才进入周历网格
      const isArrangedSchedule = (s) => {
        return s && typeof s.day === 'number' && s.day >= 1 && s.day <= 7 &&
               typeof s.startSession === 'number' && s.startSession >= 1 && s.startSession <= 12
      }

      // 3. 提取排课块与待安排时间地点课程
      const scheduledItems = []
      const unarrangedCourses = []

      mergedCourses.forEach(c => {
        const validSchedules = (c.schedules || []).filter(isArrangedSchedule)
        if (validSchedules.length > 0) {
          validSchedules.forEach(s => {
            scheduledItems.push({ course: c, schedule: s })
          })
        } else {
          unarrangedCourses.push(c)
        }
      })

      // 今日课程统计与总学分
      const todayCourses = scheduledItems.filter(item => item.schedule.day === todayDay)
      const totalCredits = mergedCourses.reduce((acc, c) => acc + (parseFloat(c.credit) || 0), 0).toFixed(1)

      // 动态计算当前真实教学周次 (基于教务处首页 span_bbzx 官方记录并支持随时间自演进)
      const computedCurrentWeek = useMemo(() => {
        return calculateCurrentAcademicWeek(scheduleMeta.firstMondayDate)
      }, [scheduleMeta.firstMondayDate])

      // 排课修改与添加操作
      const openEditModal = (course) => {
        const validS = (course.schedules || []).find(isArrangedSchedule) || (course.schedules && course.schedules[0]) || null
        const hasValid = validS && isArrangedSchedule(validS)

        setEditScheduleModal({
          course,
          hasSchedule: hasValid ? true : (course.isCustom ? true : false),
          day: hasValid ? validS.day : 1,
          startSession: hasValid ? validS.startSession : 1,
          continuingSessions: hasValid ? Math.min(4, Math.max(1, validS.continuingSessions || 2)) : 2,
          campus: (hasValid ? validS.campus : '') || '江安',
          building: hasValid ? (validS.building || '') : '',
          classroom: hasValid ? (validS.classroom || '') : '',
          weekDescription: (validS?.weekDescription) || '1-16周',
          note: course.userNote || course.note || '',
        })
      }

      const handleSaveScheduleEdit = () => {
        if (!editScheduleModal) return
        const { course, hasSchedule, day, startSession, continuingSessions, campus, building, classroom, weekDescription, note } = editScheduleModal
        const store = SCU_CUSTOM_SCHEDULE_STORE.load()

        const newSchedules = hasSchedule ? [{
          day: parseInt(day),
          startSession: parseInt(startSession),
          continuingSessions: parseInt(continuingSessions),
          campus: campus || '江安',
          building: building ? building.trim() : '',
          classroom: classroom ? classroom.trim() : '自定地点',
          weekDescription: weekDescription ? weekDescription.trim() : '1-16周',
          weeks: parseWeekDescription(weekDescription),
        }] : []

        if (course.isCustom) {
          store.customCourses = (store.customCourses || []).map(cc => {
            if (cc.id === course.id) {
              return {
                ...cc,
                classroom: classroom ? classroom.trim() : cc.classroom,
                campus: campus || cc.campus,
                userNote: note ? note.trim() : '',
                schedules: newSchedules,
              }
            }
            return cc
          })
        } else {
          const cKey = getCourseUniqueKey(course)
          store.overrides[cKey] = {
            classroom: classroom ? classroom.trim() : '',
            campus: campus || '江安',
            userNote: note ? note.trim() : '',
            schedules: newSchedules,
          }
        }

        SCU_CUSTOM_SCHEDULE_STORE.save(store)
        setCustomStore(store)
        setEditScheduleModal(null)
      }

      const handleResetScheduleEdit = (course) => {
        const store = SCU_CUSTOM_SCHEDULE_STORE.load()
        const cKey = getCourseUniqueKey(course)
        delete store.overrides[cKey]
        SCU_CUSTOM_SCHEDULE_STORE.save(store)
        setCustomStore(store)
        setEditScheduleModal(null)
      }

      const handleDeleteCustomCourse = (courseId) => {
        if (!window.confirm('确定要删除该自定义课程/日程吗？')) return
        const store = SCU_CUSTOM_SCHEDULE_STORE.load()
        store.customCourses = (store.customCourses || []).filter(cc => cc.id !== courseId)
        SCU_CUSTOM_SCHEDULE_STORE.save(store)
        setCustomStore(store)
      }

      const handleCreateCustomCourse = () => {
        if (!addForm.name || !addForm.name.trim()) {
          alert('请输入课程或日程名称')
          return
        }
        const store = SCU_CUSTOM_SCHEDULE_STORE.load()
        const newCourse = {
          id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: addForm.name.trim(),
          teacher: addForm.teacher.trim() || '自主安排',
          credit: parseFloat(addForm.credit) || 0,
          property: addForm.property || '自定义日程',
          courseNumber: 'CUSTOM',
          unitNumber: '01',
          examType: '考查/自评',
          isCustom: true,
          note: addForm.note.trim(),
          userNote: addForm.note.trim(),
          classroom: addForm.classroom.trim() || '自定地点',
          schedules: addForm.hasSchedule ? [{
            day: parseInt(addForm.day),
            startSession: parseInt(addForm.startSession),
            continuingSessions: parseInt(addForm.continuingSessions),
            campus: addForm.campus || '江安',
            building: '',
            classroom: addForm.classroom.trim() || '自定地点',
            weekDescription: addForm.weekDescription.trim() || '1-16周',
            weeks: parseWeekDescription(addForm.weekDescription),
          }] : [],
        }

        store.customCourses = [newCourse, ...(store.customCourses || [])]
        SCU_CUSTOM_SCHEDULE_STORE.save(store)
        setCustomStore(store)
        setShowAddCourseModal(false)
        setAddForm({
          name: '',
          teacher: '',
          credit: '0',
          property: '自定义日程',
          hasSchedule: true,
          day: 1,
          startSession: 1,
          continuingSessions: 2,
          campus: '江安',
          classroom: '',
          weekDescription: '1-16周',
          note: '',
        })
      }

      return h('div', null,
        // 1. 今日状态与控制工具栏
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
            flexWrap: 'wrap',
            gap: '12px',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            h(CalendarIcon, { size: 20 }),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                h('span', { style: { fontSize: '13px', fontWeight: 600 } },
                  `今天是 ${dayNames[todayDay]} · 第 ${computedCurrentWeek} 教学周 · 今日共 ${todayCourses.length} 门排课`
                ),
                (scheduleMeta.schoolCalendarText || scheduleMeta.semesterName) && h('span', {
                  style: {
                    fontSize: '11px',
                    color: 'var(--dsw-alias-text-sub, #71717a)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.12))',
                    fontWeight: 500,
                  },
                  title: '参考自川大综合教务系统官方首页校历 (span_bbzx)',
                }, scheduleMeta.schoolCalendarText || scheduleMeta.semesterName),
                cacheNotice && h('span', {
                  style: {
                    fontSize: '11px',
                    color: 'var(--dsw-alias-text-sub, #71717a)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.12))',
                  },
                }, cacheNotice)
              )
            )
          ),
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
            // 周次筛选下拉 (自动标注本周)
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
                h('option', { key: w, value: w }, `第 ${w} 教学周${w === computedCurrentWeek ? ' (本周)' : ''}`)
              )
            ),
            // 若当前未选本周，显示一键切换回本周微按钮
            selectedWeek !== computedCurrentWeek && h('button', {
              style: {
                ...S.btnSecondary,
                padding: '5px 8px',
                fontSize: '11px',
                color: '#2563eb',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                borderRadius: '6px',
              },
              title: `一键切换至当前第 ${computedCurrentWeek} 教学周`,
              onClick: () => setSelectedWeek(computedCurrentWeek),
            }, `本周 (第${computedCurrentWeek}周)`),
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
            // 添加自定义课程/日程按钮
            h('button', {
              style: {
                ...S.btnPrimary,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
              },
              onClick: () => setShowAddCourseModal(true),
              title: '添加非学校要求课、个人自修、社团或考研日程',
            },
              h(PlusIcon, { size: 13 }),
              '添加课程/日程'
            ),
            // 作业待办
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
            // 导出日历
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
            // 刷新
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              },
              onClick: () => fetchSchedule(false),
            },
              h(RefreshIcon, { size: 13 }),
              '刷新'
            )
          )
        ),

        // 加载与错误提示
        loading && h('div', { style: { textAlign: 'center', padding: '64px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在从四川大学综合教务处同步最新课表...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px', marginBottom: '16px' } }, error),

        !loading && !error && mergedCourses.length === 0 && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '14px' } }, '教务系统未返回本学期排课数据，您可以点击上方“添加课程/日程”手动录入'),

        // 2. 网格视图 (Timetable Grid) - 严谨 CSS Grid 定位，周一至周日完全精准对齐，绝不位移
        !loading && !error && mergedCourses.length > 0 && viewMode === 'grid' && h('div', null,
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
              // 表头：左上角时间标志 (硬编码 gridColumn: 1, gridRow: 1)
              h('div', {
                style: {
                  gridColumn: 1,
                  gridRow: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  fontWeight: 500,
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                  borderRadius: '6px',
                },
              }, '节次 / 星期'),

              // 表头：周一至周日 7 天 (严格硬编码 gridColumn: day + 1, gridRow: 1)
              [1, 2, 3, 4, 5, 6, 7].map(day => {
                const isToday = day === todayDay
                return h('div', {
                  key: `header-${day}`,
                  style: {
                    gridColumn: day + 1,
                    gridRow: 1,
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

              // 左侧 12 节次行标 (严格硬编码 gridColumn: 1, gridRow: t.session + 1)
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

              // 7 列 x 12 行底网格背景槽 (严格硬编码坐标)
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

              // 课程卡片定位渲染 (仅渲染有效周历排课，绝对安全)
              scheduledItems.map((item, idx) => {
                const s = item.schedule
                const c = item.course
                const palette = getCoursePalette(c.name)
                const isSelectedWeekMatch = selectedWeek === 'ALL' || (s.weeks && s.weeks.includes(selectedWeek))
                const uncompletedCourseTodos = todos.filter(t => t.courseName === c.name && !t.completed)
                const spanCount = Math.min(4, Math.max(1, s.continuingSessions || 2))

                return h('div', {
                  key: `course-card-${idx}`,
                  onClick: () => setActiveModalItem(item),
                  title: `${c.name} · 点击查看详情与随堂待办`,
                  style: {
                    gridColumn: s.day + 1,
                    gridRow: `${s.startSession + 1} / span ${spanCount}`,
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
                          WebkitLineClamp: spanCount >= 3 ? 3 : 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          color: 'var(--dsw-alias-text, inherit)',
                        },
                      },
                        c.name,
                        c.isCustom && h('span', {
                          style: {
                            marginLeft: '4px',
                            fontSize: '9px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#059669',
                            fontWeight: 600,
                          },
                        }, '日程'),
                        c._isOverridden && h('span', {
                          style: {
                            marginLeft: '4px',
                            fontSize: '9px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            background: 'rgba(139, 92, 246, 0.15)',
                            color: '#7c3aed',
                            fontWeight: 600,
                          },
                        }, '自定义')
                      ),
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
                    h('span', null, s.weeks?.length ? `${s.weeks[0]}-${s.weeks[s.weeks.length - 1]}周` : (s.weekDescription || '全周'))
                  )
                )
              })
            )
          )
        ),

        // 3. 清单列表视图 (List Mode)
        !loading && !error && mergedCourses.length > 0 && viewMode === 'list' && h('div', null,
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
                          c.isCustom && h('span', { style: { ...S.badge, background: 'rgba(16, 185, 129, 0.15)', color: '#059669' } }, '个人日程'),
                          c._isOverridden && h('span', { style: { ...S.badge, background: 'rgba(139, 92, 246, 0.15)', color: '#7c3aed' } }, '已自定义排课'),
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
                          h('span', null, `${s.building ? s.building + ' ' : ''}${s.classroom}`),
                          h('span', { style: { opacity: 0.5 } }, '·'),
                          h('span', null, `第 ${s.weeks?.length ? `${s.weeks[0]}~${s.weeks[s.weeks.length - 1]}周` : (s.weekDescription || '全学期')}`)
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

        // 4. 待安排时间地点课程专区 (例如《形势与政策》等集中授课或待排课课程，统一置于网格下方)
        !loading && !error && unarrangedCourses.length > 0 && h('div', {
          style: {
            marginTop: '20px',
            padding: '16px 18px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
            border: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
          },
        },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(ClockIcon, { size: 16 }),
              h('span', { style: { fontSize: '13px', fontWeight: 700 } },
                `待安排时间地点课程 (${unarrangedCourses.length} 门) · 暂未进入周历网格`
              ),
              h('span', {
                style: {
                  fontSize: '11px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.12))',
                  padding: '1px 6px',
                  borderRadius: '4px',
                },
              }, '如形势与政策、阶段集中授课等')
            ),
            h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
              '点击卡片右侧【指定时间地点】可手动排入上方周网格'
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px' } },
            unarrangedCourses.map((c, i) =>
              h('div', {
                key: i,
                style: {
                  ...S.card,
                  marginBottom: 0,
                  padding: '12px 14px',
                  background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.03))',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px',
                },
              },
                h('div', null,
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                    h('span', { style: { fontSize: '13px', fontWeight: 700 } }, c.name),
                    h('span', { style: S.badge }, `${c.credit}学分`)
                  ),
                  h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                    `教师: ${c.teacher || '待安排'} · 课程性质: ${c.property || '必修'}`
                  ),
                  h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                    `状态: ${c.classroom || (c.schedules?.[0]?.classroom) || '见任课教师通知 / 待安排'} · 代码: ${c.courseNumber || 'CUSTOM'}-${c.unitNumber || '01'}`
                  )
                ),
                h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' } },
                  h('button', {
                    style: {
                      ...S.btnPrimary,
                      padding: '4px 10px',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    },
                    onClick: () => openEditModal(c),
                  },
                    h(Edit3Icon, { size: 11 }),
                    '指定时间地点'
                  )
                )
              )
            )
          )
        ),

        // 5. 全量课程清单与教务原始信息看板 (包含全部课程与教务爬取完整属性，支持修改排课与删除)
        !loading && !error && mergedCourses.length > 0 && h('div', {
          style: {
            marginTop: '24px',
            background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.02))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            borderRadius: '12px',
            padding: '18px 20px',
          },
        },
          // 标题与统计行
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
              flexWrap: 'wrap',
              gap: '10px',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(BookOpenIcon, { size: 17 }),
              h('span', { style: { fontSize: '15px', fontWeight: 700 } }, '全量课程清单与教务原始信息'),
              h('span', { style: S.badge }, `共 ${mergedCourses.length} 门 · ${totalCredits} 学分`),
              unarrangedCourses.length > 0 && h('span', {
                style: {
                  ...S.badge,
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#d97706',
                  fontWeight: 600,
                },
              }, `${unarrangedCourses.length} 门待安排时间`)
            ),
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('button', {
                style: {
                  ...S.btnPrimary,
                  padding: '5px 12px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                },
                onClick: () => setShowAddCourseModal(true),
              },
                h(PlusIcon, { size: 12 }),
                '添加课程/日程'
              )
            )
          ),

          // 课程列表卡片条目
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
            mergedCourses.map((c, idx) => {
              const cKey = getCourseUniqueKey(c)
              const palette = getCoursePalette(c.name)
              const arrangedSchedules = (c.schedules || []).filter(isArrangedSchedule)
              const hasValidArranged = arrangedSchedules.length > 0
              const courseTodos = todos.filter(t => t.courseName === c.name && !t.completed)

              return h('div', {
                key: `master-course-${cKey}-${idx}`,
                style: {
                  ...S.card,
                  marginBottom: 0,
                  padding: '14px 16px',
                  borderLeft: `4px solid ${palette.text}`,
                  background: 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px',
                  flexWrap: 'wrap',
                },
              },
                // 左侧主体信息
                h('div', { style: { flex: 1, minWidth: '280px' } },
                  // 第一行：课程标题与徽章
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                    h('span', { style: { fontSize: '15px', fontWeight: 700 } }, c.name),
                    h('span', { style: S.badge }, `${c.property || '课程'} · ${c.credit}学分`),
                    c.examType && h('span', { style: S.badge }, c.examType),
                    c.courseNumber && h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                      `课号: ${c.courseNumber}-${c.unitNumber || '01'}`
                    ),
                    c.isCustom && h('span', {
                      style: {
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#059669',
                        fontWeight: 600,
                      },
                    }, '个人日程'),
                    c._isOverridden && h('span', {
                      style: {
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(139, 92, 246, 0.15)',
                        color: '#7c3aed',
                        fontWeight: 600,
                      },
                    }, '已自定义时间地点'),
                    courseTodos.length > 0 && h('span', {
                      style: {
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        fontWeight: 600,
                      },
                    }, `${courseTodos.length} 条待办`)
                  ),

                  // 第二行：授课教师与排课时段地点
                  h('div', {
                    style: {
                      fontSize: '12px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                    },
                  },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                      h(UserIcon, { size: 12 }),
                      h('span', null, `授课教师: ${c.teacher || '待公布'}`)
                    ),
                    hasValidArranged
                      ? arrangedSchedules.map((s, sIdx) =>
                          h('div', {
                            key: sIdx,
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.08))',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              color: 'var(--dsw-alias-text, inherit)',
                              fontWeight: 500,
                            },
                          },
                            h(ClockIcon, { size: 11 }),
                            h('span', null, `${dayNames[s.day]} 第${s.startSession}~${s.startSession + s.continuingSessions - 1}节`),
                            h(MapPinIcon, { size: 11, style: { marginLeft: '4px' } },),
                            h('span', null, `${s.classroom || s.building || '自定地点'}`),
                            s.weekDescription && h('span', { style: { fontSize: '10px', opacity: 0.8 } }, `(${s.weekDescription})`)
                          )
                        )
                      : h('div', {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(245, 158, 11, 0.12)',
                            color: '#d97706',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                          },
                        },
                          h(ClockIcon, { size: 11 }),
                          h('span', null, `待安排时间地点 (${c.classroom || (c.schedules?.[0]?.classroom) || '见任课教师通知'})`)
                        )
                  ),

                  // 第三行：教务原始备注字段 (pkbz / skzcs / note)
                  (c.note || c.pkbz || c.skzcs || c.userNote) && h('div', {
                    style: {
                      fontSize: '11px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      background: 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.03))',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--dsw-alias-border, rgba(125,125,125,0.08))',
                      display: 'inline-block',
                    },
                  },
                    `教务/自定备注: ${c.userNote || c.note || c.pkbz || c.skzcs}`
                  )
                ),

                // 右侧操作按钮组
                h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                  h('button', {
                    style: {
                      ...S.btnSecondary,
                      padding: '5px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    },
                    onClick: () => openEditModal(c),
                  },
                    h(Edit3Icon, { size: 12 }),
                    hasValidArranged ? '修改时间地点' : '设置时间地点'
                  ),

                  // 若被用户修改过，支持恢复教务处排课
                  c._isOverridden && h('button', {
                    style: {
                      ...S.btnSecondary,
                      padding: '5px 10px',
                      fontSize: '11px',
                      color: '#7c3aed',
                      borderColor: 'rgba(139, 92, 246, 0.3)',
                    },
                    title: '撤销手动修改，恢复教务系统爬取到的原始排课',
                    onClick: () => handleResetScheduleEdit(c),
                  }, '恢复默认'),

                  // 若是用户自定义添加的课程，支持删除
                  c.isCustom && h('button', {
                    style: {
                      ...S.btnSecondary,
                      padding: '5px 8px',
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.25)',
                    },
                    title: '删除该自定义课程/日程',
                    onClick: () => handleDeleteCustomCourse(c.id),
                  },
                    h(TrashIcon, { size: 12 })
                  )
                )
              )
            })
          )
        ),

        // 6. 课程详情弹窗 Modal (点击周网格卡片触发)
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
                  h('span', { style: S.badge }, `课号: ${activeModalItem.course.courseNumber || 'CUSTOM'}-${activeModalItem.course.unitNumber || '01'}`),
                  activeModalItem.course._isOverridden && h('span', { style: { ...S.badge, background: 'rgba(139, 92, 246, 0.15)', color: '#7c3aed' } }, '已自定义修改')
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
                h('span', null, `上课地点: ${activeModalItem.schedule.campus ? activeModalItem.schedule.campus + '校区 ' : ''}${activeModalItem.schedule.building ? activeModalItem.schedule.building + ' ' : ''}${activeModalItem.schedule.classroom}`)
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
              ),
              (activeModalItem.course.note || activeModalItem.course.userNote) && h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                h(BookOpenIcon, { size: 13 }),
                h('span', null, `备注说明: ${activeModalItem.course.userNote || activeModalItem.course.note}`)
              )
            ),

            // 快捷修改该门课时间地点按钮
            h('div', { style: { marginTop: '12px' } },
              h('button', {
                style: {
                  ...S.btnSecondary,
                  padding: '4px 10px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                },
                onClick: () => {
                  const targetCourse = activeModalItem.course
                  setActiveModalItem(null)
                  openEditModal(targetCourse)
                },
              },
                h(Edit3Icon, { size: 11 }),
                '修改此课程时间地点'
              )
            ),

            // 活跃周次 20 周指示点
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

            // 随堂备忘与作业清单
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
                // 待办列表
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

        // 7. 修改课程时间地点 Modal (EditScheduleModal)
        editScheduleModal && h('div', {
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
            zIndex: 10000,
            padding: '20px',
            backdropFilter: 'blur(3px)',
          },
          onClick: () => setEditScheduleModal(null),
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
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            // 头部
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              h('div', null,
                h('div', { style: { fontSize: '17px', fontWeight: 700 } }, '设置课程时间与地点'),
                h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                  `《${editScheduleModal.course.name}》 · ${editScheduleModal.course.credit} 学分`
                )
              ),
              h('button', {
                style: { background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' },
                onClick: () => setEditScheduleModal(null),
              }, '✕')
            ),

            // 是否安排具体时间的勾选开关
            h('div', {
              style: {
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
            },
              h('div', null,
                h('div', { style: { fontSize: '13px', fontWeight: 600 } }, '排入周网格'),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '指定具体的星期与节次，课程将直观呈现于周课表中')
              ),
              h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: editScheduleModal.hasSchedule,
                  onChange: (e) => setEditScheduleModal({ ...editScheduleModal, hasSchedule: e.target.checked }),
                }),
                h('span', { style: { fontSize: '12px' } }, '启用排课')
              )
            ),

            // 具体时间地点配置表单 (在 hasSchedule 为 true 时展示)
            editScheduleModal.hasSchedule && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' } },
              // 星期选择 (胶囊按钮组)
              h('div', null,
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '上课星期:'),
                h('div', { style: { display: 'flex', gap: '6px' } },
                  [1, 2, 3, 4, 5, 6, 7].map(d =>
                    h('button', {
                      key: d,
                      type: 'button',
                      style: {
                        flex: 1,
                        padding: '6px 0',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: editScheduleModal.day === d ? '#2563eb' : 'var(--dsw-alias-border, rgba(125,125,125,0.2))',
                        background: editScheduleModal.day === d ? '#2563eb' : 'transparent',
                        color: editScheduleModal.day === d ? '#ffffff' : 'inherit',
                        fontWeight: editScheduleModal.day === d ? 600 : 400,
                        cursor: 'pointer',
                      },
                      onClick: () => setEditScheduleModal({ ...editScheduleModal, day: d }),
                    }, dayNames[d])
                  )
                )
              ),

              // 节次选择
              h('div', { style: { display: 'flex', gap: '10px' } },
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '起始节次:'),
                  h('select', {
                    style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                    value: editScheduleModal.startSession,
                    onChange: (e) => setEditScheduleModal({ ...editScheduleModal, startSession: parseInt(e.target.value) }),
                  },
                    SCU_TIMETABLE.map(t =>
                      h('option', { key: t.session, value: t.session }, `第 ${t.session} 节 (${t.time})`)
                    )
                  )
                ),
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '持续节数:'),
                  h('select', {
                    style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                    value: editScheduleModal.continuingSessions,
                    onChange: (e) => setEditScheduleModal({ ...editScheduleModal, continuingSessions: parseInt(e.target.value) }),
                  },
                    h('option', { value: 1 }, '1 节课 (45分钟)'),
                    h('option', { value: 2 }, '2 节连上 (标准教学)'),
                    h('option', { value: 3 }, '3 节连上 (实验/专题)'),
                    h('option', { value: 4 }, '4 节大课 (半天实验)')
                  )
                )
              ),

              // 校区与教室
              h('div', { style: { display: 'flex', gap: '10px' } },
                h('div', { style: { width: '120px' } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '校区:'),
                  h('select', {
                    style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                    value: editScheduleModal.campus,
                    onChange: (e) => setEditScheduleModal({ ...editScheduleModal, campus: e.target.value }),
                  },
                    h('option', { value: '江安' }, '江安校区'),
                    h('option', { value: '望江' }, '望江校区'),
                    h('option', { value: '华西' }, '华西校区')
                  )
                ),
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '上课教室/教学楼:'),
                  h('input', {
                    type: 'text',
                    placeholder: '例如：二基楼A305 或 一教B101',
                    style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                    value: editScheduleModal.classroom,
                    onChange: (e) => setEditScheduleModal({ ...editScheduleModal, classroom: e.target.value }),
                  })
                )
              ),

              // 周次说明
              h('div', null,
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '周次安排:'),
                h('input', {
                  type: 'text',
                  placeholder: '例如：1-16周 或 1-8周, 单周',
                  style: { ...S.input, marginBottom: '4px', padding: '7px 10px', fontSize: '12px' },
                  value: editScheduleModal.weekDescription,
                  onChange: (e) => setEditScheduleModal({ ...editScheduleModal, weekDescription: e.target.value }),
                }),
                h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  ['1-16周', '1-8周', '9-16周', '单周', '双周'].map(tag =>
                    h('button', {
                      key: tag,
                      type: 'button',
                      style: {
                        ...S.btnSecondary,
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      },
                      onClick: () => setEditScheduleModal({ ...editScheduleModal, weekDescription: tag }),
                    }, tag)
                  )
                )
              )
            ),

            // 备注字段
            h('div', { style: { marginBottom: '20px' } },
              h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '自定义备注:'),
              h('input', {
                type: 'text',
                placeholder: '选填，如：隔周线上、随堂小测等',
                style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                value: editScheduleModal.note,
                onChange: (e) => setEditScheduleModal({ ...editScheduleModal, note: e.target.value }),
              })
            ),

            // 底部操作按钮
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              editScheduleModal.course._isOverridden ? h('button', {
                style: {
                  ...S.btnSecondary,
                  fontSize: '12px',
                  padding: '7px 14px',
                  color: '#7c3aed',
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                },
                onClick: () => handleResetScheduleEdit(editScheduleModal.course),
              }, '恢复教务处排课') : h('div', null),
              h('div', { style: { display: 'flex', gap: '8px' } },
                h('button', {
                  style: { ...S.btnSecondary, padding: '7px 16px', fontSize: '12px' },
                  onClick: () => setEditScheduleModal(null),
                }, '取消'),
                h('button', {
                  style: { ...S.btnPrimary, padding: '7px 20px', fontSize: '12px' },
                  onClick: handleSaveScheduleEdit,
                }, '保存设置')
              )
            )
          )
        ),

        // 8. 添加自定义课程/个人日程 Modal (AddCourseModal)
        showAddCourseModal && h('div', {
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
            zIndex: 10000,
            padding: '20px',
            backdropFilter: 'blur(3px)',
          },
          onClick: () => setShowAddCourseModal(false),
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
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            // 头部
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              h('div', null,
                h('div', { style: { fontSize: '17px', fontWeight: 700 } }, '添加自定义课程 / 个人日程'),
                h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                  '录入非学校要求课、个人自修、社团活动或考研日程，自动并入全景周历与看板'
                )
              ),
              h('button', {
                style: { background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' },
                onClick: () => setShowAddCourseModal(false),
              }, '✕')
            ),

            // 表单字段
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' } },
              // 课程名称
              h('div', null,
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '课程 / 日程名称 *:'),
                h('input', {
                  type: 'text',
                  placeholder: '例如：雅思口语强化班、考研数学答疑、实验室组会',
                  style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                  value: addForm.name,
                  onChange: (e) => setAddForm({ ...addForm, name: e.target.value }),
                })
              ),

              // 类型与学分
              h('div', { style: { display: 'flex', gap: '10px' } },
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '课程属性/类型:'),
                  h('select', {
                    style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                    value: addForm.property,
                    onChange: (e) => setAddForm({ ...addForm, property: e.target.value }),
                  },
                    h('option', { value: '个人日程' }, '个人日程'),
                    h('option', { value: '考研辅导' }, '考研辅导'),
                    h('option', { value: '辅修双学位' }, '辅修双学位'),
                    h('option', { value: '竞赛社团' }, '竞赛社团'),
                    h('option', { value: '科研实验' }, '科研实验'),
                    h('option', { value: '语言培训' }, '语言培训')
                  )
                ),
                h('div', { style: { width: '110px' } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '学分/权重:'),
                  h('input', {
                    type: 'number',
                    step: '0.5',
                    style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                    value: addForm.credit,
                    onChange: (e) => setAddForm({ ...addForm, credit: e.target.value }),
                  })
                )
              ),

              // 授课人/组织者
              h('div', null,
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '讲师 / 组织者 / 负责人:'),
                h('input', {
                  type: 'text',
                  placeholder: '选填，如：自主学习、李老师、社长',
                  style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                  value: addForm.teacher,
                  onChange: (e) => setAddForm({ ...addForm, teacher: e.target.value }),
                })
              ),

              // 是否安排具体时间的勾选开关
              h('div', {
                style: {
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                },
              },
                h('div', null,
                  h('div', { style: { fontSize: '13px', fontWeight: 600 } }, '指定每周固定时间'),
                  h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '设置星期和节次后将显示在上方周课表网格中')
                ),
                h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' } },
                  h('input', {
                    type: 'checkbox',
                    checked: addForm.hasSchedule,
                    onChange: (e) => setAddForm({ ...addForm, hasSchedule: e.target.checked }),
                  }),
                  h('span', { style: { fontSize: '12px' } }, '排入周网格')
                )
              ),

              // 若指定具体时间
              addForm.hasSchedule && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
                // 星期按钮
                h('div', null,
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '上课星期:'),
                  h('div', { style: { display: 'flex', gap: '6px' } },
                    [1, 2, 3, 4, 5, 6, 7].map(d =>
                      h('button', {
                        key: d,
                        type: 'button',
                        style: {
                          flex: 1,
                          padding: '6px 0',
                          fontSize: '12px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: addForm.day === d ? '#2563eb' : 'var(--dsw-alias-border, rgba(125,125,125,0.2))',
                          background: addForm.day === d ? '#2563eb' : 'transparent',
                          color: addForm.day === d ? '#ffffff' : 'inherit',
                          fontWeight: addForm.day === d ? 600 : 400,
                          cursor: 'pointer',
                        },
                        onClick: () => setAddForm({ ...addForm, day: d }),
                      }, dayNames[d])
                    )
                  )
                ),

                // 节次
                h('div', { style: { display: 'flex', gap: '10px' } },
                  h('div', { style: { flex: 1 } },
                    h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '起始节次:'),
                    h('select', {
                      style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                      value: addForm.startSession,
                      onChange: (e) => setAddForm({ ...addForm, startSession: parseInt(e.target.value) }),
                    },
                      SCU_TIMETABLE.map(t =>
                        h('option', { key: t.session, value: t.session }, `第 ${t.session} 节 (${t.time})`)
                      )
                    )
                  ),
                  h('div', { style: { flex: 1 } },
                    h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '持续节数:'),
                    h('select', {
                      style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                      value: addForm.continuingSessions,
                      onChange: (e) => setAddForm({ ...addForm, continuingSessions: parseInt(e.target.value) }),
                    },
                      h('option', { value: 1 }, '1 节 (45分钟)'),
                      h('option', { value: 2 }, '2 节连上 (标准)'),
                      h('option', { value: 3 }, '3 节连上'),
                      h('option', { value: 4 }, '4 节大课')
                    )
                  )
                ),

                // 地点与周次
                h('div', { style: { display: 'flex', gap: '10px' } },
                  h('div', { style: { flex: 1 } },
                    h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '地点 / 教室:'),
                    h('input', {
                      type: 'text',
                      placeholder: '例如：图书馆二楼研讨室、线上腾讯会议',
                      style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                      value: addForm.classroom,
                      onChange: (e) => setAddForm({ ...addForm, classroom: e.target.value }),
                    })
                  ),
                  h('div', { style: { width: '130px' } },
                    h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '周次:'),
                    h('input', {
                      type: 'text',
                      placeholder: '如 1-16周',
                      style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                      value: addForm.weekDescription,
                      onChange: (e) => setAddForm({ ...addForm, weekDescription: e.target.value }),
                    })
                  )
                )
              ),

              // 备注说明
              h('div', null,
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '日程备注:'),
                h('input', {
                  type: 'text',
                  placeholder: '选填，如：需带笔记本电脑、随堂打卡等',
                  style: { ...S.input, marginBottom: 0, padding: '7px 10px', fontSize: '12px' },
                  value: addForm.note,
                  onChange: (e) => setAddForm({ ...addForm, note: e.target.value }),
                })
              )
            ),

            // 底部操作按钮
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
              h('button', {
                style: { ...S.btnSecondary, padding: '7px 16px', fontSize: '12px' },
                onClick: () => setShowAddCourseModal(false),
              }, '取消'),
              h('button', {
                style: { ...S.btnPrimary, padding: '7px 22px', fontSize: '12px' },
                onClick: handleCreateCustomCourse,
              }, '确认添加')
            )
          )
        ),

        // 9. 全学期课程随堂备忘与作业待办清单 Modal
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
                  value: drawerCourseSelect || (mergedCourses[0]?.name || ''),
                  onChange: (e) => setDrawerCourseSelect(e.target.value),
                },
                  mergedCourses.map(c => h('option', { key: getCourseUniqueKey(c), value: c.name }, c.name))
                ),
                h('input', {
                  type: 'text',
                  placeholder: '输入作业或随堂笔记（如：周五前交实验报告）...',
                  style: { ...S.input, flex: 1, minWidth: '180px', marginBottom: 0, padding: '5px 10px', fontSize: '12px' },
                  value: drawerTodoText,
                  onChange: (e) => setDrawerTodoText(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      const cName = drawerCourseSelect || mergedCourses[0]?.name
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
                    const cName = drawerCourseSelect || mergedCourses[0]?.name
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

        // 10. 导出手机日历 Modal
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

    // ================== 灵动图形化成绩分析看板组件 (纯 SVG 仪表盘、走势图与分布图) ==================
    // 1. GPA / 均分双环形进度仪表盘 (纯 SVG 环形进度仪)
    function GpaScoreRingDashboard({ gpa, score, isRequired, diffGpa }) {
      const gpaNum = typeof gpa === 'number' ? gpa : parseFloat(gpa) || 0
      const scoreNum = typeof score === 'number' ? score : parseFloat(score) || 0

      // GPA 比例 (满分 4.0)
      const gpaPct = Math.min(1, Math.max(0, gpaNum / 4.0))
      // 均分比例 (满分 100)
      const scorePct = Math.min(1, Math.max(0, scoreNum / 100))

      const r = 38
      const circ = 2 * Math.PI * r // ~238.76
      const gpaDash = circ * gpaPct
      const scoreDash = circ * scorePct

      return h('div', {
        style: {
          ...S.card,
          padding: '20px 24px',
          marginBottom: 0,
          background: 'var(--dsw-alias-bg-card, #ffffff)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          flexWrap: 'wrap',
          gap: '20px',
        },
        className: 'scu-hover-card',
      },
        // 左环: GPA
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
          h('div', { style: { position: 'relative', width: '96px', height: '96px' } },
            h('svg', { width: 96, height: 96, viewBox: '0 0 96 96', style: { transform: 'rotate(-90deg)' } },
              h('circle', {
                cx: 48,
                cy: 48,
                r: 38,
                fill: 'none',
                stroke: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.12))',
                strokeWidth: 8,
              }),
              h('circle', {
                cx: 48,
                cy: 48,
                r: 38,
                fill: 'none',
                stroke: isRequired ? '#2563eb' : '#3b82f6',
                strokeWidth: 8,
                strokeDasharray: circ,
                strokeDashoffset: circ - gpaDash,
                strokeLinecap: 'round',
                style: { transition: 'stroke-dashoffset 0.6s ease' },
              })
            ),
            h('div', {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }
            },
              h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, gpaNum ? gpaNum.toFixed(2) : '--'),
              h('span', { style: { fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '/ 4.0')
            )
          ),
          h('div', null,
            h('div', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } },
              isRequired ? '必修课加权 GPA' : '全科综合 GPA'
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
              `满绩 4.0 · 达成率 ${(gpaPct * 100).toFixed(1)}%`
            ),
            diffGpa !== undefined && diffGpa !== null && h('div', {
              style: {
                fontSize: '11px',
                color: diffGpa >= 0 ? '#10b981' : '#ef4444',
                marginTop: '4px',
                fontWeight: 500,
              }
            }, `${diffGpa >= 0 ? '↑' : '↓'} 较综合 ${diffGpa >= 0 ? '+' : ''}${diffGpa.toFixed(2)}`)
          )
        ),

        // 右环: 加权均分
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
          h('div', { style: { position: 'relative', width: '96px', height: '96px' } },
            h('svg', { width: 96, height: 96, viewBox: '0 0 96 96', style: { transform: 'rotate(-90deg)' } },
              h('circle', {
                cx: 48,
                cy: 48,
                r: 38,
                fill: 'none',
                stroke: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.12))',
                strokeWidth: 8,
              }),
              h('circle', {
                cx: 48,
                cy: 48,
                r: 38,
                fill: 'none',
                stroke: '#10b981',
                strokeWidth: 8,
                strokeDasharray: circ,
                strokeDashoffset: circ - scoreDash,
                strokeLinecap: 'round',
                style: { transition: 'stroke-dashoffset 0.6s ease' },
              })
            ),
            h('div', {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }
            },
              h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, scoreNum ? scoreNum.toFixed(1) : '--'),
              h('span', { style: { fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '/ 100')
            )
          ),
          h('div', null,
            h('div', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } },
              isRequired ? '必修课加权均分' : '全科综合加权均分'
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
              `满分 100 · 达成率 ${(scorePct * 100).toFixed(1)}%`
            )
          )
        )
      )
    }

    // 2. 学期历程成绩走势图 (纯 SVG 平滑折线趋势与交互高亮)
    function TermTrendSvgChart({ termStats }) {
      const [hoveredIdx, setHoveredIdx] = useState(null)
      if (!termStats || termStats.length === 0) return null

      const width = 640
      const height = 150
      const padL = 45
      const padR = 30
      const padT = 25
      const padB = 30

      const plotW = width - padL - padR
      const plotH = height - padT - padB

      const gpas = termStats.map(t => parseFloat(t.gpa) || 0)
      const minGpa = Math.max(0, Math.min(...gpas) - 0.2)
      const maxGpa = 4.0

      const getX = (idx) => {
        if (termStats.length <= 1) return padL + plotW / 2
        return padL + (idx / (termStats.length - 1)) * plotW
      }

      const getY = (val) => {
        const ratio = (val - minGpa) / (maxGpa - minGpa || 1)
        return padT + plotH * (1 - Math.min(1, Math.max(0, ratio)))
      }

      const points = termStats.map((t, idx) => ({
        x: getX(idx),
        y: getY(parseFloat(t.gpa) || 0),
        data: t,
      }))

      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      const areaPath = points.length > 0
        ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padT + plotH} L ${points[0].x.toFixed(1)} ${padT + plotH} Z`
        : ''

      const hoveredItem = hoveredIdx !== null ? points[hoveredIdx] : null

      return h('div', {
        style: {
          ...S.card,
          padding: '18px 20px',
          marginBottom: '18px',
          background: 'var(--dsw-alias-bg-card, #ffffff)',
        },
        className: 'scu-hover-card',
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            h(ChartIcon, { size: 14 }),
            h('span', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '历学期绩点平滑走势')
          ),
          hoveredItem && h('span', {
            style: {
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(59, 130, 246, 0.1)',
              color: '#2563eb',
              fontWeight: 500,
            }
          }, `${hoveredItem.data.term}: GPA ${hoveredItem.data.gpa} · ${hoveredItem.data.credits}学分 · ${hoveredItem.data.avgScore}分`)
        ),
        h('svg', {
          viewBox: `0 0 ${width} ${height}`,
          style: { width: '100%', height: 'auto', display: 'block', overflow: 'visible' },
        },
          h('defs', null,
            h('linearGradient', { id: 'gpaAreaGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
              h('stop', { offset: '0%', stopColor: '#3b82f6', stopOpacity: 0.25 }),
              h('stop', { offset: '100%', stopColor: '#3b82f6', stopOpacity: 0.0 })
            )
          ),
          // 刻度水平基准线
          [3.0, 3.5, 4.0].map(val => {
            const y = getY(val)
            return h('g', { key: val },
              h('line', {
                x1: padL,
                y1: y,
                x2: width - padR,
                y2: y,
                stroke: 'var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                strokeDasharray: '3 3',
              }),
              h('text', {
                x: padL - 8,
                y: y + 3,
                textAnchor: 'end',
                fontSize: 9,
                fill: 'var(--dsw-alias-text-sub, #71717a)',
              }, val.toFixed(1))
            )
          }),
          // 渐变填充区域
          h('path', { d: areaPath, fill: 'url(#gpaAreaGrad)' }),
          // 主折线
          h('path', { d: linePath, fill: 'none', stroke: '#3b82f6', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
          // 竖直悬停对齐虚线
          hoveredItem && h('line', {
            x1: hoveredItem.x,
            y1: padT,
            x2: hoveredItem.x,
            y2: padT + plotH,
            stroke: '#3b82f6',
            strokeDasharray: '2 2',
            strokeWidth: 1.5,
          }),
          // 交互节点圆圈与 X 轴学期标签
          points.map((p, idx) =>
            h('g', {
              key: idx,
              style: { cursor: 'pointer' },
              onMouseEnter: () => setHoveredIdx(idx),
              onMouseLeave: () => setHoveredIdx(null),
            },
              h('circle', { cx: p.x, cy: p.y, r: 12, fill: 'transparent' }),
              h('circle', {
                cx: p.x,
                cy: p.y,
                r: hoveredIdx === idx ? 6 : 4,
                fill: hoveredIdx === idx ? '#2563eb' : '#3b82f6',
                stroke: 'var(--dsw-alias-bg-card, #ffffff)',
                strokeWidth: 2,
                style: { transition: 'all 0.15s ease' },
              }),
              h('text', {
                x: p.x,
                y: height - 10,
                textAnchor: 'middle',
                fontSize: 10,
                fontWeight: hoveredIdx === idx ? 600 : 400,
                fill: hoveredIdx === idx ? '#2563eb' : 'var(--dsw-alias-text-sub, #71717a)',
              }, p.data.term.replace(/20(\d{2})-20(\d{2})/, '$1-$2'))
            )
          )
        )
      )
    }

    // 3. 成绩区间分布条形图 (分段堆叠胶囊与区间指标网格)
    function GradeDistributionChart({ grades }) {
      if (!grades || grades.length === 0) return null

      let countA = 0 // 90-100 (优秀)
      let countB = 0 // 80-89  (良好)
      let countC = 0 // 70-79  (中等)
      let countD = 0 // 60-69  (及格)
      let countF = 0 // <60    (待提升)

      grades.forEach(g => {
        const num = parseFloat(g.score)
        if (!isNaN(num)) {
          if (num >= 90) countA++
          else if (num >= 80) countB++
          else if (num >= 70) countC++
          else if (num >= 60) countD++
          else countF++
        } else {
          const lvl = g.gradeLevel || ''
          if (lvl === 'A' || lvl === '优秀') countA++
          else if (lvl === 'B' || lvl === '良好') countB++
          else if (lvl === 'C' || lvl === '中等') countC++
          else if (lvl === 'D' || lvl === '及格' || lvl === '合格' || lvl === '通过') countD++
          else countF++
        }
      })

      const total = grades.length || 1
      const buckets = [
        { label: '优秀 (90+)', count: countA, pct: (countA / total * 100).toFixed(1), color: '#10b981' },
        { label: '良好 (80-89)', count: countB, pct: (countB / total * 100).toFixed(1), color: '#3b82f6' },
        { label: '中等 (70-79)', count: countC, pct: (countC / total * 100).toFixed(1), color: '#f59e0b' },
        { label: '及格 (60-69)', count: countD, pct: (countD / total * 100).toFixed(1), color: '#8b5cf6' },
        { label: '待提升 (<60)', count: countF, pct: (countF / total * 100).toFixed(1), color: '#ef4444' },
      ]

      return h('div', {
        style: {
          ...S.card,
          padding: '16px 20px',
          marginBottom: '18px',
          background: 'var(--dsw-alias-bg-card, #ffffff)',
        },
        className: 'scu-hover-card',
      },
        h('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('span', null, '成绩区间分布比例'),
          h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `共 ${total} 门已获评课程`)
        ),
        // 胶囊分段条
        h('div', {
          style: {
            display: 'flex',
            height: '12px',
            borderRadius: '6px',
            overflow: 'hidden',
            background: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.1))',
            marginBottom: '12px',
          }
        },
          buckets.map((b, i) =>
            b.count > 0 ? h('div', {
              key: i,
              title: `${b.label}: ${b.count}门 (${b.pct}%)`,
              style: {
                width: `${b.pct}%`,
                background: b.color,
                transition: 'width 0.4s ease',
              }
            }) : null
          )
        ),
        // 指标网格
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' } },
          buckets.map((b, i) =>
            h('div', {
              key: i,
              style: {
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
                border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                textAlign: 'center',
              }
            },
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '2px' } }, b.label),
              h('div', { style: { fontSize: '14px', fontWeight: 700, color: b.color } }, `${b.count} 门`),
              h('div', { style: { fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `${b.pct}%`)
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

      return h('div', { className: 'scu-tab-content' },
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

        // 2. GPA / 均分双环形进度仪表盘与核心 KPI
        h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(200px, 0.8fr)', gap: '14px', marginBottom: '18px' } },
          h(GpaScoreRingDashboard, {
            gpa: curGpa,
            score: curScore,
            isRequired: isRequiredScope,
            diffGpa: (isRequiredScope && data.requiredGpa && data.overallGpa) ? (data.requiredGpa - data.overallGpa) : null,
          }),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
            h('div', { style: { ...S.card, marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--dsw-alias-bg-card, #ffffff)' }, className: 'scu-hover-card' },
              h('div', { style: { fontSize: '24px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, curCredit),
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                isRequiredScope ? '必修课累计学分' : '累计修读总学分'
              )
            ),
            h('div', { style: { ...S.card, marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--dsw-alias-bg-card, #ffffff)' }, className: 'scu-hover-card' },
              h('div', { style: { fontSize: '24px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, curCount),
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                isRequiredScope ? '必修已修课程数' : '已获评课程总门数'
              )
            )
          )
        ),

        // 3. 学期 GPA 趋势图 (纯 SVG 平滑折线走势)
        !loading && data.termStats && data.termStats.length > 0 && h(TermTrendSvgChart, { termStats: data.termStats }),

        // 4. 成绩区间分布条形图 (分段胶囊进度与比例网格)
        !loading && filtered.length > 0 && h(GradeDistributionChart, { grades: filtered }),

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

    // ================== 子页面 5：培养方案全景大纲与未来均分/GPA预测模拟器 ==================
    function StudyPlanView({ onRequireLogin }) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [data, setData] = useState(null)
      const [cacheNotice, setCacheNotice] = useState('')

      // 模拟分数字典: { [courseId]: number }
      const [simScores, setSimScores] = useState({})
      // 开启重修刷分模拟的已修课程 ID 列表
      const [retakeCourseIds, setRetakeCourseIds] = useState([])
      // 勾选参与模拟的方案待修读课程 ID 列表
      const [activePendingIds, setActivePendingIds] = useState([])

      // 自定义自选课程追加模拟
      const [customCourses, setCustomCourses] = useState([])
      const [showCustomModal, setShowCustomModal] = useState(false)
      const [newCustomName, setNewCustomName] = useState('')
      const [newCustomCredit, setNewCustomCredit] = useState(3.0)
      const [newCustomIsReq, setNewCustomIsReq] = useState(true)
      const [newCustomScore, setNewCustomScore] = useState(85.0)

      // 筛选条件
      const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'PENDING'
      const [propertyFilter, setPropertyFilter] = useState('ALL') // 'ALL' | 'REQUIRED' | 'ELECTIVE'
      const [searchKw, setSearchKw] = useState('')

      const fetchStudyPlan = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        setError('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/program/scheme`)
          if (resp.status === 401) return onRequireLogin()
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            setError(err.detail || '获取培养方案数据失败')
            return
          }
          const d = await resp.json()
          setData(d)
          SCU_CACHE.set('studyPlan', d)
          setCacheNotice('')

          // 初始化在读课程默认模拟分为 85
          setSimScores(prev => {
            const next = { ...prev }
            ;(d.inProgressCourses || []).forEach(c => {
              if (next[c.id] === undefined) next[c.id] = c.score || 85.0
            })
            ;(d.pendingCourses || []).forEach(c => {
              if (next[c.id] === undefined) next[c.id] = c.score || 85.0
            })
            return next
          })
        } catch (e) {
          const cached = SCU_CACHE.get('studyPlan')
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
        const cached = SCU_CACHE.get('studyPlan')
        if (cached && cached.data) {
          setData(cached.data)
          setLoading(false)
          setCacheNotice(`已载入快照 (${cached.updatedAt})`)
          fetchStudyPlan(true)
        } else {
          fetchStudyPlan(false)
        }
      }, [fetchStudyPlan])

      // 川大官方标准成绩折算 GPA
      const getGpa = (score) => {
        if (score >= 95) return 4.0
        if (score >= 90) return 3.8
        if (score >= 85) return 3.6
        if (score >= 80) return 3.2
        if (score >= 75) return 2.7
        if (score >= 70) return 2.2
        if (score >= 65) return 1.7
        if (score >= 60) return 1.0
        return 0.0
      }

      // 实时计算模拟指标 (What-If Simulation Engine)
      let simTotalCredit = 0.0
      let simTotalWeightedScore = 0.0
      let simTotalWeightedGpa = 0.0

      let simReqCredit = 0.0
      let simReqWeightedScore = 0.0
      let simReqWeightedGpa = 0.0

      if (data) {
        // 1. 已完成历史课程
        ;(data.completedCourses || []).forEach(c => {
          const isRetake = retakeCourseIds.includes(c.id)
          const score = isRetake ? (simScores[c.id] ?? c.score) : c.score
          const gpa = getGpa(score)
          simTotalCredit += c.credit
          simTotalWeightedScore += score * c.credit
          simTotalWeightedGpa += gpa * c.credit
          if (c.isRequired) {
            simReqCredit += c.credit
            simReqWeightedScore += score * c.credit
            simReqWeightedGpa += gpa * c.credit
          }
        });

        // 2. 本学期进行中在读课程 (默认全部参与模拟)
        ;(data.inProgressCourses || []).forEach(c => {
          const score = simScores[c.id] ?? 85.0
          const gpa = getGpa(score)
          simTotalCredit += c.credit
          simTotalWeightedScore += score * c.credit
          simTotalWeightedGpa += gpa * c.credit
          if (c.isRequired) {
            simReqCredit += c.credit
            simReqWeightedScore += score * c.credit
            simReqWeightedGpa += gpa * c.credit
          }
        });

        // 3. 勾选参与模拟的方案待修课程
        ;(data.pendingCourses || []).forEach(c => {
          if (activePendingIds.includes(c.id)) {
            const score = simScores[c.id] ?? 85.0
            const gpa = getGpa(score)
            simTotalCredit += c.credit
            simTotalWeightedScore += score * c.credit
            simTotalWeightedGpa += gpa * c.credit
            if (c.isRequired) {
              simReqCredit += c.credit
              simReqWeightedScore += score * c.credit
              simReqWeightedGpa += gpa * c.credit
            }
          }
        });

        // 4. 自选追加课程
        customCourses.forEach(c => {
          const score = c.score || 85.0
          const gpa = getGpa(score)
          simTotalCredit += c.credit
          simTotalWeightedScore += score * c.credit
          simTotalWeightedGpa += gpa * c.credit
          if (c.isRequired) {
            simReqCredit += c.credit
            simReqWeightedScore += score * c.credit
            simReqWeightedGpa += gpa * c.credit
          }
        })
      }

      const simOverallAvg = simTotalCredit > 0 ? (simTotalWeightedScore / simTotalCredit).toFixed(2) : '0.00'
      const simReqAvg = simReqCredit > 0 ? (simReqWeightedScore / simReqCredit).toFixed(2) : '0.00'
      const simOverallGpa = simTotalCredit > 0 ? (simTotalWeightedGpa / simTotalCredit).toFixed(2) : '0.00'
      const simReqGpa = simReqCredit > 0 ? (simReqWeightedGpa / simReqCredit).toFixed(2) : '0.00'

      const baseStats = data?.baseStats || {}
      const deltaOverallScore = data ? (parseFloat(simOverallAvg) - (baseStats.overallAvgScore || 0)).toFixed(2) : '0.00'
      const deltaReqScore = data ? (parseFloat(simReqAvg) - (baseStats.requiredAvgScore || 0)).toFixed(2) : '0.00'
      const deltaOverallGpa = data ? (parseFloat(simOverallGpa) - (baseStats.overallGpa || 0)).toFixed(2) : '0.00'
      const deltaReqGpa = data ? (parseFloat(simReqGpa) - (baseStats.requiredGpa || 0)).toFixed(2) : '0.00'

      // 批量预设在读与待修课程模拟成绩
      const handleBatchPreset = (presetScore) => {
        setSimScores(prev => {
          const next = { ...prev }
          ;(data?.inProgressCourses || []).forEach(c => {
            next[c.id] = presetScore
          })
          ;(data?.pendingCourses || []).forEach(c => {
            if (activePendingIds.includes(c.id)) next[c.id] = presetScore
          })
          return next
        })
      }

      // 重置模拟器
      const handleResetSim = () => {
        const next = {}
        ;(data?.inProgressCourses || []).forEach(c => {
          next[c.id] = 85.0
        })
        setSimScores(next)
        setRetakeCourseIds([])
        setActivePendingIds([])
        setCustomCourses([])
      }

      // 添加自选课程
      const handleAddCustomCourse = () => {
        if (!newCustomName.trim()) return
        const item = {
          id: `custom-${Date.now()}`,
          name: newCustomName.trim(),
          credit: Number(newCustomCredit) || 2.0,
          isRequired: newCustomIsReq,
          property: newCustomIsReq ? '必修' : '选修',
          score: Number(newCustomScore) || 85.0,
          status: 'CUSTOM_SIM',
        }
        setCustomCourses([...customCourses, item])
        setNewCustomName('')
        setShowCustomModal(false)
      }

      // 聚合所有课程清单并进行筛选
      const allDisplayCourses = []
      if (data) {
        // 进行中课程
        ;(data.inProgressCourses || []).forEach(c => {
          allDisplayCourses.push({ ...c, currentSimScore: simScores[c.id] ?? 85.0 })
        });
        // 方案待修课程
        ;(data.pendingCourses || []).forEach(c => {
          allDisplayCourses.push({
            ...c,
            currentSimScore: simScores[c.id] ?? 85.0,
            isIncludedInSim: activePendingIds.includes(c.id),
          })
        });
        // 自选追加课程
        customCourses.forEach(c => {
          allDisplayCourses.push({
            ...c,
            currentSimScore: c.score,
            isCustom: true,
          })
        });
        // 已完成课程
        ;(data.completedCourses || []).forEach(c => {
          allDisplayCourses.push({
            ...c,
            currentSimScore: simScores[c.id] ?? c.score,
            isRetake: retakeCourseIds.includes(c.id),
          })
        });
      }

      const filteredCourses = allDisplayCourses.filter(c => {
        if (statusFilter === 'IN_PROGRESS' && c.status !== 'IN_PROGRESS') return false
        if (statusFilter === 'COMPLETED' && c.status !== 'COMPLETED') return false
        if (statusFilter === 'PENDING' && c.status !== 'PENDING') return false
        if (propertyFilter === 'REQUIRED' && !c.isRequired) return false
        if (propertyFilter === 'ELECTIVE' && c.isRequired) return false
        if (searchKw && !c.name.toLowerCase().includes(searchKw.toLowerCase().trim())) return false
        return true
      })

      // 学分进度计算
      const completedCreditNum = data?.completedCredits || 0
      const inProgressCreditNum = data?.inProgressCredits || 0
      const reqTotalCreditNum = data?.requiredTotalCredits || 165.0
      const currentSimTotalEarnedCredit = completedCreditNum + inProgressCreditNum + customCourses.reduce((acc, c) => acc + c.credit, 0)
      const creditProgressPct = reqTotalCreditNum > 0 ? Math.min(100, Math.round((currentSimTotalEarnedCredit / reqTotalCreditNum) * 100)) : 0

      if (loading && !data) {
        return h('div', {
          style: {
            textAlign: 'center',
            padding: '70px 20px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
          },
        },
          h('div', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '24px', background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.08))', marginBottom: '16px' } },
            h(CompassIcon, { size: 24 })
          ),
          h('div', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '正在读取培养方案大纲与学业数据...'),
          h('div', { style: { fontSize: '12px', marginTop: '6px' } }, '正在从教务系统同步培养方案节点与已修课程，首次载入约需 1~2 秒')
        )
      }

      if (error && !data) {
        return h('div', {
          style: {
            textAlign: 'center',
            padding: '60px 20px',
            color: '#ef4444',
          },
        },
          h('div', { style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } }, '获取培养方案失败'),
          h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '18px' } }, error),
          h('button', {
            style: { ...S.btnPrimary, padding: '6px 18px' },
            onClick: () => fetchStudyPlan(false),
          }, '重新尝试载入')
        )
      }

      return h('div', null,
        // 1. 顶部方案标题与状态横幅
        h('div', {
          style: {
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            h(CompassIcon, { size: 20 }),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '15px', fontWeight: 700 } }, data?.programName || '四川大学培养方案'),
                data && (data.college || data.grade) && h('span', { style: S.badge }, [data.college, data.grade].filter(Boolean).join(' · ')),
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
              h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '3px' } },
                `毕业要求总学分: ${reqTotalCreditNum} 学分 · 已修完成: ${completedCreditNum} 学分 · 当前在读: ${inProgressCreditNum} 学分`
              )
            )
          ),
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('button', {
              style: { ...S.btnSecondary, display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px' },
              onClick: () => setShowCustomModal(true),
            },
              h(PlusIcon, { size: 12 }),
              '自选课程追加模拟'
            ),
            h('button', {
              style: { ...S.btnSecondary, display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px' },
              onClick: fetchStudyPlan,
            },
              h(RefreshIcon, { size: 12 }),
              '刷新数据'
            )
          )
        ),

        // 2. 模拟器核心 KPI 概览看板 (高频动态联动)
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '18px' } },
          // 卡片 1: 模拟未来总均分
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center', borderTop: '3px solid #2563eb' } },
            h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '6px' } },
              h('span', { style: { fontSize: '26px', fontWeight: 700, color: '#2563eb' } }, simOverallAvg),
              h('span', {
                style: {
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: parseFloat(deltaOverallScore) >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: parseFloat(deltaOverallScore) >= 0 ? '#059669' : '#ef4444',
                },
              }, `${parseFloat(deltaOverallScore) >= 0 ? '+' : ''}${deltaOverallScore}`)
            ),
            h('div', { style: { fontSize: '12px', fontWeight: 600, marginTop: '4px' } }, '未来预期总加权均分'),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
              `已修基准: ${baseStats.overallAvgScore || 0} 分 (GPA: ${simOverallGpa})`
            )
          ),

          // 卡片 2: 模拟保研必修均分
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center', borderTop: '3px solid #10b981' } },
            h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '6px' } },
              h('span', { style: { fontSize: '26px', fontWeight: 700, color: '#059669' } }, simReqAvg),
              h('span', {
                style: {
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: parseFloat(deltaReqScore) >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: parseFloat(deltaReqScore) >= 0 ? '#059669' : '#ef4444',
                },
              }, `${parseFloat(deltaReqScore) >= 0 ? '+' : ''}${deltaReqScore}`)
            ),
            h('div', { style: { fontSize: '12px', fontWeight: 600, marginTop: '4px' } }, '未来保研必修均分'),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
              `已修基准: ${baseStats.requiredAvgScore || 0} 分 (GPA: ${simReqGpa})`
            )
          ),

          // 卡片 3: 模拟对应加权绩点 (GPA)
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center', borderTop: '3px solid #8b5cf6' } },
            h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '6px' } },
              h('span', { style: { fontSize: '26px', fontWeight: 700, color: '#7c3aed' } }, simOverallGpa),
              h('span', {
                style: {
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: parseFloat(deltaOverallGpa) >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: parseFloat(deltaOverallGpa) >= 0 ? '#059669' : '#ef4444',
                },
              }, `${parseFloat(deltaOverallGpa) >= 0 ? '+' : ''}${deltaOverallGpa}`)
            ),
            h('div', { style: { fontSize: '12px', fontWeight: 600, marginTop: '4px' } }, '预期综合加权 GPA'),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
              `必修保研 GPA: ${simReqGpa}`
            )
          ),

          // 卡片 4: 培养方案毕业学分完成进度
          h('div', { style: { ...S.card, marginBottom: 0, textAlign: 'center', borderTop: '3px solid #f59e0b' } },
            h('div', { style: { fontSize: '22px', fontWeight: 700, color: '#d97706' } }, `${currentSimTotalEarnedCredit} / ${reqTotalCreditNum} 分`),
            h('div', { style: { fontSize: '12px', fontWeight: 600, marginTop: '4px' } }, `方案进度: ${creditProgressPct}%`),
            // 细长进度条
            h('div', {
              style: {
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                background: 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.15))',
                overflow: 'hidden',
                marginTop: '6px',
              },
            },
              h('div', {
                style: {
                  width: `${creditProgressPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #f59e0b, #10b981)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease',
                },
              })
            )
          )
        ),

        // 3. 模拟器全局快捷操控与预设栏
        h('div', {
          style: {
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          },
        },
          // 快捷批量预设按钮组
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 } },
              h(SlidersIcon, { size: 13 }),
              h('span', null, '在读课程一键预设:')
            ),
            [80, 85, 90, 95].map(sc =>
              h('button', {
                key: sc,
                style: { ...S.btnSecondary, padding: '3px 10px', fontSize: '11px', borderRadius: '4px' },
                onClick: () => handleBatchPreset(sc),
              }, `全按${sc}分`)
            ),
            h('button', {
              style: { ...S.btnSecondary, padding: '3px 10px', fontSize: '11px', borderRadius: '4px', color: 'var(--dsw-alias-text-sub, #71717a)' },
              onClick: handleResetSim,
            }, '恢复默认')
          ),

          // 快速搜索输入框
          h('div', { style: { position: 'relative', width: '220px' } },
            h('input', {
              type: 'text',
              placeholder: '搜索课程名称，如量子力学、高数...',
              style: { ...S.input, marginBottom: 0, padding: '5px 10px 5px 28px', fontSize: '12px' },
              value: searchKw,
              onChange: (e) => setSearchKw(e.target.value),
            }),
            h('span', { style: { position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' } },
              h(SearchIcon, { size: 12 })
            )
          )
        ),

        // 4. 状态分类 Filter 切换栏
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' } },
          // 状态筛选
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            [
              { key: 'ALL', label: `全部课程 (${allDisplayCourses.length})` },
              { key: 'IN_PROGRESS', label: `在读修读中 (${(data?.inProgressCourses || []).length + customCourses.length})` },
              { key: 'COMPLETED', label: `已修已完成 (${(data?.completedCourses || []).length})` },
              { key: 'PENDING', label: `方案待修读 (${(data?.pendingCourses || []).length})` },
            ].map(f =>
              h('button', {
                key: f.key,
                style: {
                  ...S.btnSecondary,
                  padding: '4px 12px',
                  borderRadius: '16px',
                  background: statusFilter === f.key ? 'var(--dsw-alias-text, #18181b)' : 'transparent',
                  color: statusFilter === f.key ? 'var(--dsw-alias-bg, #ffffff)' : 'inherit',
                  borderColor: statusFilter === f.key ? 'transparent' : 'var(--dsw-alias-border, rgba(125,125,125,0.15))',
                  fontWeight: statusFilter === f.key ? 600 : 400,
                  fontSize: '11px',
                },
                onClick: () => setStatusFilter(f.key),
              }, f.label)
            )
          ),

          // 必修 / 选修性质切换
          h('div', {
            style: {
              display: 'flex',
              background: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.1))',
              borderRadius: '6px',
              padding: '2px',
            },
          },
            [
              { key: 'ALL', label: '全部性质' },
              { key: 'REQUIRED', label: '仅必修 (保研)' },
              { key: 'ELECTIVE', label: '仅选修' },
            ].map(p =>
              h('button', {
                key: p.key,
                style: {
                  ...S.btnSecondary,
                  border: 'none',
                  padding: '3px 10px',
                  fontSize: '11px',
                  background: propertyFilter === p.key ? 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))' : 'transparent',
                  fontWeight: propertyFilter === p.key ? 600 : 400,
                  boxShadow: propertyFilter === p.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                },
                onClick: () => setPropertyFilter(p.key),
              }, p.label)
            )
          )
        ),

        // 加载与错误状态提示
        loading && h('div', { style: { textAlign: 'center', padding: '48px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '正在同步学生培养方案大纲与学业基准数据...'),
        error && h('div', { style: { padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' } }, error),

        // 5. 课程列表与分数滑动调节面板
        !loading && !error && filteredCourses.length === 0 && h('div', {
          style: { textAlign: 'center', padding: '40px', color: 'var(--dsw-alias-text-sub, #71717a)' },
        }, '未匹配到符合条件的课程'),

        !loading && !error && filteredCourses.length > 0 && h('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '8px' },
        },
          filteredCourses.map(c => {
            const isCompleted = c.status === 'COMPLETED'
            const isInProgress = c.status === 'IN_PROGRESS' || c.status === 'CUSTOM_SIM'
            const isPending = c.status === 'PENDING'
            const currentScore = Number(c.currentSimScore) || 85.0
            const currentScoreGpa = getGpa(currentScore)

            return h('div', {
              key: c.id,
              style: {
                ...S.card,
                marginBottom: 0,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                borderLeft: isInProgress ? '4px solid #3b82f6' : (isCompleted ? '4px solid #10b981' : '4px solid rgba(125,125,125,0.3)'),
                background: isInProgress ? 'var(--dsw-alias-bg-hover, rgba(59, 130, 246, 0.03))' : 'inherit',
              },
            },
              // 左侧：课程名、状态徽章、学分与性质
              h('div', { style: { flex: '1 1 260px' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                  h('span', { style: { fontSize: '14px', fontWeight: 600 } }, c.name),
                  h('span', {
                    style: {
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      background: isInProgress ? 'rgba(59, 130, 246, 0.12)' : (isCompleted ? 'rgba(16, 185, 129, 0.12)' : 'rgba(125, 125, 125, 0.12)'),
                      color: isInProgress ? '#2563eb' : (isCompleted ? '#059669' : 'var(--dsw-alias-text-sub, #71717a)'),
                    },
                  },
                    isInProgress ? '在读修读中' : (isCompleted ? '已修已出分' : '方案待修读')
                  ),
                  c.isRequired && h('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 600 },
                  }, '必修 (计入保研)'),
                  !c.isRequired && h('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(125, 125, 125, 0.1)', color: 'var(--dsw-alias-text-sub, #71717a)' },
                  }, '选修')
                ),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                  `课程学分: ${c.credit} 学分 · ${c.category || c.term || '综合培养体系'}`
                )
              ),

              // 右侧：分数控制区 (在读和待修展示数字框与滑块；已完成展示历史成绩与重修勾选)
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 } },
                // 1. 在读课程 / 自选课程：实时滑动条与数字输入
                isInProgress && h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  h('div', { style: { textAlign: 'right' } },
                    h('div', { style: { fontSize: '11px', color: '#2563eb', fontWeight: 600 } },
                      `折算绩点: ${currentScoreGpa}`
                    ),
                    h('div', { style: { fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '拖动或打字模拟')
                  ),
                  // 滑块 Slider
                  h('input', {
                    type: 'range',
                    min: 60,
                    max: 100,
                    step: 1,
                    value: currentScore,
                    style: { width: '100px', cursor: 'pointer' },
                    onChange: (e) => {
                      const v = Number(e.target.value)
                      setSimScores({ ...simScores, [c.id]: v })
                    },
                  }),
                  // 数字输入框 Input
                  h('input', {
                    type: 'number',
                    min: 0,
                    max: 100,
                    value: currentScore,
                    style: {
                      ...S.input,
                      width: '64px',
                      marginBottom: 0,
                      padding: '4px 6px',
                      fontSize: '13px',
                      fontWeight: 700,
                      textAlign: 'center',
                      color: '#2563eb',
                      border: '1px solid #2563eb',
                    },
                    onChange: (e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                      setSimScores({ ...simScores, [c.id]: v })
                    },
                  }),
                  h('span', { style: { fontSize: '12px', fontWeight: 600 } }, '分')
                ),

                // 2. 方案待修读课程：可选“加入均分模拟”
                isPending && h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  h('button', {
                    style: {
                      ...S.btnSecondary,
                      padding: '4px 10px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      background: c.isIncludedInSim ? '#2563eb' : 'transparent',
                      color: c.isIncludedInSim ? '#ffffff' : 'inherit',
                      borderColor: c.isIncludedInSim ? 'transparent' : 'var(--dsw-alias-border, rgba(125,125,125,0.2))',
                    },
                    onClick: () => {
                      if (c.isIncludedInSim) {
                        setActivePendingIds(activePendingIds.filter(id => id !== c.id))
                      } else {
                        setActivePendingIds([...activePendingIds, c.id])
                      }
                    },
                  }, c.isIncludedInSim ? '✓ 正在模拟中' : '+ 加入模拟测算'),

                  c.isIncludedInSim && h('input', {
                    type: 'number',
                    min: 0,
                    max: 100,
                    value: currentScore,
                    style: {
                      ...S.input,
                      width: '60px',
                      marginBottom: 0,
                      padding: '3px 6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textAlign: 'center',
                      borderColor: '#2563eb',
                    },
                    onChange: (e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                      setSimScores({ ...simScores, [c.id]: v })
                    },
                  })
                ),

                // 3. 已完成出分课程：展示历史原分与重修刷分勾选
                isCompleted && h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  h('div', { style: { textAlign: 'right' } },
                    h('div', { style: { fontSize: '14px', fontWeight: 700 } }, `${c.score} 分`),
                    h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `${c.gradeLevel} · GPA ${c.gpa}`)
                  ),
                  // 模拟重修开关
                  h('label', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('input', {
                      type: 'checkbox',
                      checked: c.isRetake,
                      onChange: (e) => {
                        if (e.target.checked) {
                          setRetakeCourseIds([...retakeCourseIds, c.id])
                        } else {
                          setRetakeCourseIds(retakeCourseIds.filter(id => id !== c.id))
                        }
                      },
                    }),
                    '假设刷分'
                  ),
                  c.isRetake && h('input', {
                    type: 'number',
                    min: 0,
                    max: 100,
                    value: currentScore,
                    placeholder: '重修分',
                    style: {
                      ...S.input,
                      width: '60px',
                      marginBottom: 0,
                      padding: '3px 6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textAlign: 'center',
                      borderColor: '#10b981',
                      color: '#059669',
                    },
                    onChange: (e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                      setSimScores({ ...simScores, [c.id]: v })
                    },
                  })
                )
              )
            )
          })
        ),

        // 6. 追加自选模拟课程弹窗 Modal
        showCustomModal && h('div', {
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
          onClick: () => setShowCustomModal(false),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))',
              color: 'var(--dsw-alias-text, inherit)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              h('span', { style: { fontSize: '16px', fontWeight: 700 } }, '追加自选课程模拟测算'),
              h('button', {
                style: { background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' },
                onClick: () => setShowCustomModal(false),
              }, '✕')
            ),

            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
              h('div', null,
                h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '课程名称:'),
                h('input', {
                  type: 'text',
                  placeholder: '如：数据结构与算法、科研实践...',
                  style: S.input,
                  value: newCustomName,
                  onChange: (e) => setNewCustomName(e.target.value),
                })
              ),
              h('div', { style: { display: 'flex', gap: '12px' } },
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '学分数:'),
                  h('input', {
                    type: 'number',
                    step: 0.5,
                    style: S.input,
                    value: newCustomCredit,
                    onChange: (e) => setNewCustomCredit(e.target.value),
                  })
                ),
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '预期模拟分数:'),
                  h('input', {
                    type: 'number',
                    min: 0,
                    max: 100,
                    style: S.input,
                    value: newCustomScore,
                    onChange: (e) => setNewCustomScore(e.target.value),
                  })
                )
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('input', {
                  type: 'checkbox',
                  id: 'customIsReq',
                  checked: newCustomIsReq,
                  onChange: (e) => setNewCustomIsReq(e.target.checked),
                }),
                h('label', { htmlFor: 'customIsReq', style: { fontSize: '12px', cursor: 'pointer' } }, '属于必修课程（计入保研必修均分统计）')
              )
            ),

            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' } },
              h('button', {
                style: { ...S.btnSecondary, padding: '7px 16px' },
                onClick: () => setShowCustomModal(false),
              }, '取消'),
              h('button', {
                style: { ...S.btnPrimary, padding: '7px 18px' },
                onClick: handleAddCustomCourse,
              }, '确认加入模拟')
            )
          )
        )
      )
    }

    // ================== 微服务全景清单与元数据配置 (基于 WFW_API_SPEC 规范) ==================
    const MICRO_SERVICES_CATALOG = [
      {
        id: 'electricity',
        name: '宿舍电费',
        category: 'life',
        categoryLabel: '校园生活',
        icon: ZapIcon,
        status: 'online',
        statusText: '实时在线',
        desc: '空调与照明双回路实时抄表、川大基准电费预估、低电量预警与自由宿舍换绑',
        features: [
          '双模独立抄表：空调动力回路与宿舍照明回路分别计量与单独结算',
          '川大官方基准核算：严格按照四川大学 0.5464 元/度官方基准电价折算',
          '三级宿舍换房向导：支持望江、江安、华西校区任意楼栋与房间一键自由换绑',
          '用电安全预警：剩余电量低于 10 度即时醒目预警，避免夜间或假期断电'
        ],
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
      },
      {
        id: 'card',
        name: '校园一卡通',
        category: 'life',
        categoryLabel: '校园生活',
        icon: CreditCardIcon,
        status: 'online',
        statusText: '实时在线',
        desc: '实体卡实时物理余额、食堂超市消费流水明细、近30天消费走势与官方充值',
        features: [
          '物理卡实时余额：直连川大一卡通中枢，实时读取实体卡物理芯片结余',
          '全场景明细流水：望江、江安、华西各食堂档口、超市消费与充值完整记录',
          '消费统计与对账：今日支出汇总、近 30 天消费笔数与每日支出走势核对',
          '充值与安全服务：聚合微川大、支付宝校园卡官方充值通道与紧急挂失电话'
        ],
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        url: 'https://payapp.scu.edu.cn/rfid/views/index.html',
        apiEndpoint: '/api/wfw/card/status'
      },
      {
        id: 'network',
        name: '校园网服务',
        category: 'network',
        categoryLabel: '网络信息化',
        icon: WifiIcon,
        status: 'online',
        statusText: '实时在线',
        desc: '在线终端设备监控、远程一键强制下线、多设备连接数管理与宽带账号体检',
        features: [
          '在线终端透视：实时监测当前登录 SCU-Wireless 及校园有线网的全部设备',
          '一键强制下线：支持远程踢出指定在线设备，秒级释放并发终端连接数配额',
          '设备类型识别：智能识别 iPhone、Mac、Windows 笔电及移动设备类型',
          '连接配额看板：精确呈现已用连接数与上限，避免多设备因超额被拒认证'
        ],
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        url: 'https://wfw.scu.edu.cn/wap/material?id=560',
        apiEndpoint: '/api/wfw/network/status'
      },
      {
        id: 'bus',
        name: '校园交通车时刻',
        category: 'public',
        categoryLabel: '综合便民',
        icon: TruckIcon,
        status: 'online',
        statusText: '实时在线',
        desc: '望江-江安-华西三校际班车时刻表、当前下一班发车倒计时与官方时刻表原图',
        features: [
          '校车动态班次：区分工作日与节假日班次，自动匹配当前时间最近发车班次',
          '发车倒计时：提供距离下一班校车发车的精准剩余分钟数计算与即时提醒',
          '乘车点全览：望江北门/基教发车点、江安青春广场/一食堂发车点与华西发车点',
          '官方通告图片：一键查看后勤保障部官方发布的交通车时刻高清原图'
        ],
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        url: 'https://wfw.scu.edu.cn/wap/material?id=557',
        apiEndpoint: '/api/wfw/bus/schedule'
      },
      {
        id: 'lostfound',
        name: '校园卡失物招领',
        category: 'public',
        categoryLabel: '综合便民',
        icon: SearchIcon,
        status: 'online',
        statusText: '实时在线',
        desc: '全校一卡通失物招领官方数据拉取、本人卡片安全排查与自定义学号检索',
        features: [
          '学号智能排查：自动比对本人学号是否已被全校拾得登记，出具安全体检报告',
          '全校失物流水：实时展示望江、江安、华西各食堂、球场捡拾登记的卡号与地点',
          '学号快速自查：支持输入任意学号查询其是否已被拾获及存放的保安值班室',
          '认领网点指引：提供青春广场一卡通大厅与基教大厅失物招领窗口指引'
        ],
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        url: 'https://wfw.scu.edu.cn/site/found/index?tabIdx=1',
        apiEndpoint: '/api/wfw/card/lost_found'
      },
      {
        id: 'library',
        name: '我的图书馆',
        category: 'life',
        categoryLabel: '教学科研',
        icon: LibraryIcon,
        status: 'online',
        statusText: '实时在线',
        desc: '读者证服务状态、当前在借册数、借阅上限、累计借阅、借阅欠费与馆藏直通',
        features: [
          '读者证状态体检：实时显示读者证号、证件正常状态与欠费金额统计',
          '借阅额度看板：实时跟踪已借图书册数与最大可借上限（30 册）',
          '馆藏图书直达：一键直通四川大学图书馆馆藏检索与我的借阅历史',
          '借阅规则指引：借期 30 天、续借政策与超期滞纳金防范提示'
        ],
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        url: 'https://wfw.scu.edu.cn/site/library/mine',
        apiEndpoint: '/api/wfw/library/status'
      },
      {
        id: 'apps',
        name: '微应用服务广场',
        category: 'public',
        categoryLabel: '全校聚合',
        icon: GridIcon,
        status: 'online',
        statusText: '全校 62+',
        desc: '汇聚四川大学微服务平台 9 大分类全量 62+ 微应用全景浏览与全局即时搜索',
        features: [
          '9 大板块聚合：常用功能、日常管理、校园生活、校园卡、校园网、教学科研等',
          '毫秒级全局检索：支持按微应用名称与功能即输即搜，快速定位目标服务',
          '官方免密直达：点击任意微应用自动携带统一身份凭证免密跳转对应系统',
          '轻量即用导航：涵盖体育场馆预约、后勤报修、校历公告、第二课堂全景'
        ],
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        url: 'https://wfw.scu.edu.cn/site/applicationSquare/index?sid=0',
        apiEndpoint: '/api/wfw/apps/all'
      }
    ]

    // ================== 微服务子页面：宿舍电费实时查询、在线购电与换房向导 (纯白极简风格) ==================
    function ElectricityDetailView({ onRequireLogin, onBack, eleData, loading, refreshing, lastUpdated, errorMsg, onRefresh }) {
      // 换房弹窗相关状态
      const [showSwitchModal, setShowSwitchModal] = useState(false)
      const [campuses, setCampuses] = useState([])
      const [buildings, setBuildings] = useState([])
      const [units, setUnits] = useState([])
      const [selCampus, setSelCampus] = useState('')
      const [selBuilding, setSelBuilding] = useState('')
      const [selUnit, setSelUnit] = useState('')
      const [inputRoom, setInputRoom] = useState('')
      const [switchLoading, setSwitchLoading] = useState(false)
      const [switchMsg, setSwitchMsg] = useState('')

      // 在线充值弹窗相关状态
      const [showRechargeModal, setShowRechargeModal] = useState(false)
      const [rechargeStep, setRechargeStep] = useState('select') // 'select' | 'paying' | 'success'
      const [rechargeType, setRechargeType] = useState(1) // 1: 宿舍照明电, 2: 空调动力电
      const [rechargeAmt, setRechargeAmt] = useState(50)
      const [isCustomAmt, setIsCustomAmt] = useState(false)
      const [customAmtStr, setCustomAmtStr] = useState('')
      const [rechargeLoading, setRechargeLoading] = useState(false)
      const [rechargeErr, setRechargeErr] = useState('')
      const [orderInfo, setOrderInfo] = useState(null)
      const [pollStatusText, setPollStatusText] = useState('')
      const pollTimerRef = useRef(null)
      const pollCounterRef = useRef(0)

      // 用电趋势折线图与历史抄表状态
      const [trendDays, setTrendDays] = useState(7)
      const [trendData, setTrendData] = useState(null)
      const [trendLoading, setTrendLoading] = useState(false)
      const [showRecordsTable, setShowRecordsTable] = useState(false)
      const [hoveredPoint, setHoveredPoint] = useState(null)

      const fetchTrend = useCallback(async (days = 7) => {
        setTrendLoading(true)
        try {
          const resp = await fetch(`${SERVICE_URL}/api/electricity/history?days=${days}`)
          if (resp.ok) {
            const d = await resp.json()
            setTrendData(d)
          }
        } catch (_) {}
        finally {
          setTrendLoading(false)
        }
      }, [])

      useEffect(() => {
        fetchTrend(trendDays)
      }, [trendDays, fetchTrend])

      // 停止电量侦测轮询
      const stopPolling = () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
        pollCounterRef.current = 0
      }

      // 组件卸载时安全清理定时器，杜绝死循环
      useEffect(() => {
        return () => stopPolling()
      }, [])

      // 关闭充值弹窗
      const handleCloseRechargeModal = () => {
        stopPolling()
        setShowRechargeModal(false)
        setRechargeStep('select')
        setRechargeErr('')
        setOrderInfo(null)
        setPollStatusText('')
      }

      // 打开充值弹窗
      const handleOpenRechargeModal = (type = 1) => {
        setRechargeType(type)
        setRechargeStep('select')
        setRechargeAmt(50)
        setIsCustomAmt(false)
        setCustomAmtStr('')
        setRechargeErr('')
        setOrderInfo(null)
        setShowRechargeModal(true)
      }

      // 打开官方支付网关收银台
      const openOfficialGateway = (gatewayUrl, orderNo) => {
        const targetUrl = gatewayUrl || `${SERVICE_URL}/api/electricity/pay_gateway?orderNo=${encodeURIComponent(orderNo || '')}`
        window.open(targetUrl, '_blank')
      }

      // 启动支付入账轻量轮询检测 (最多12次，每次5s，共60s)
      const startPaymentPolling = (feeType, initialBal) => {
        stopPolling()
        pollCounterRef.current = 0
        setPollStatusText('已在新标签页拉起川大官方聚合支付收银台，正在检测到账...')

        pollTimerRef.current = setInterval(async () => {
          pollCounterRef.current += 1
          if (pollCounterRef.current > 12) {
            stopPolling()
            setPollStatusText('系统后台通常在 1~5 分钟内入账，您可稍后点击“刷新电费”查看最新度数。')
            return
          }

          try {
            const resp = await fetch(`${SERVICE_URL}/api/electricity/status?refresh=true`)
            if (resp.ok) {
              const res = await resp.json()
              const curBal = (feeType === 1 ? res?.light?.balance : res?.air?.balance) ?? null
              if (curBal !== null && initialBal !== null && curBal > initialBal) {
                // 检测到电费已增加，到账成功
                stopPolling()
                setRechargeStep('success')
                if (onRefresh) onRefresh()
              } else {
                setPollStatusText(`已在新标签页拉起川大官方收银台，正在检测到账 (${pollCounterRef.current * 5}s)...`)
              }
            }
          } catch {}
        }, 5000)
      }

      // 提交电费充值订单
      const handleCreateRechargeOrder = async (e) => {
        if (e && e.preventDefault) e.preventDefault()
        const effectiveAmt = isCustomAmt ? parseFloat(customAmtStr) : rechargeAmt
        if (isNaN(effectiveAmt) || effectiveAmt < 1 || effectiveAmt > 500) {
          return setRechargeErr('单次充值金额须在 1 ~ 500 元之间')
        }

        // 1. 同步预打开新标签页，100% 避免浏览器将弹窗拦截或降级为 GET
        let payWindow = null
        try {
          payWindow = window.open('about:blank', '_blank')
          if (payWindow) {
            payWindow.document.write('<div style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#71717a;"><h3>正在连接四川大学官方支付收银台...</h3><p style="font-size:13px;margin-top:8px;">正在安全生成官方防伪订单，请稍候...</p></div>')
          }
        } catch (err) {
          console.warn('预打开新标签页受阻:', err)
        }

        setRechargeLoading(true)
        setRechargeErr('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/electricity/recharge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: rechargeType,
              amount: effectiveAmt
            })
          })
          const d = await resp.json()
          if (!resp.ok || !d.success) {
            if (payWindow && !payWindow.closed) payWindow.close()
            throw new Error(d.message || d.detail || '创建充值订单失败')
          }

          setOrderInfo(d)
          setRechargeStep('paying')

          // 2. 引导新标签页进入官方支付自提交中转页 (同源渲染、原生提交，100% 携带完整 POST body)
          const targetUrl = d.gatewayUrl || `${SERVICE_URL}/api/electricity/pay_gateway?orderNo=${encodeURIComponent(d.orderNo)}`
          if (payWindow && !payWindow.closed) {
            payWindow.location.href = targetUrl
          } else {
            window.open(targetUrl, '_blank')
          }

          // 3. 记录下单前电量并启动轮询
          const initialBalance = (rechargeType === 1 ? eleData?.light?.balance : eleData?.air?.balance) ?? null
          startPaymentPolling(rechargeType, initialBalance)
        } catch (err) {
          if (payWindow && !payWindow.closed) payWindow.close()
          setRechargeErr(err.message || '下单异常')
        } finally {
          setRechargeLoading(false)
        }
      }

      // 打开换房向导并预拉取校区
      const handleOpenSwitchModal = async () => {
        setShowSwitchModal(true)
        setSwitchMsg('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/electricity/campuses`)
          if (resp.ok) {
            const d = await resp.json()
            const camps = d.campuses || []
            setCampuses(camps)
            if (camps.length > 0) {
              setSelCampus(camps[0].code)
              loadBuildings(camps[0].code)
            }
          }
        } catch {}
      }

      // 拉取楼栋
      const loadBuildings = async (schoolCode) => {
        try {
          const resp = await fetch(`${SERVICE_URL}/api/electricity/buildings?schoolCode=${encodeURIComponent(schoolCode)}`)
          if (resp.ok) {
            const d = await resp.json()
            const blds = d.buildings || []
            setBuildings(blds)
            if (blds.length > 0) {
              setSelBuilding(blds[0].code)
              loadUnits(schoolCode, blds[0].code)
            } else {
              setSelBuilding('')
              setUnits([])
              setSelUnit('')
            }
          }
        } catch {}
      }

      // 拉取单元
      const loadUnits = async (schoolCode, regCode) => {
        try {
          const resp = await fetch(`${SERVICE_URL}/api/electricity/units?schoolCode=${encodeURIComponent(schoolCode)}&regCode=${encodeURIComponent(regCode)}`)
          if (resp.ok) {
            const d = await resp.json()
            const unts = d.units || []
            setUnits(unts)
            if (unts.length > 0) {
              setSelUnit(unts[0].code)
            } else {
              setSelUnit('')
            }
          }
        } catch {}
      }

      // 提交换房
      const handleConfirmSwitch = async (e) => {
        e.preventDefault()
        if (!selCampus || !selBuilding || !inputRoom.trim()) {
          return setSwitchMsg('请完整选择校区、楼栋并填写房间号')
        }
        setSwitchLoading(true)
        setSwitchMsg('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/electricity/verify-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolCode: selCampus,
              regCode: selBuilding,
              unitCode: selUnit,
              roomNo: inputRoom.trim()
            })
          })
          const d = await resp.json()
          if (!resp.ok) {
            throw new Error(d.detail || '换房绑定失败，请核对房间信息')
          }
          setShowSwitchModal(false)
          setInputRoom('')
          if (onRefresh) onRefresh()
        } catch (err) {
          setSwitchMsg(err.message || '换房异常')
        } finally {
          setSwitchLoading(false)
        }
      }

      // 渲染电量卡片辅助函数 (支持卡片内直达快捷购电)
      const renderFeeCard = (title, icon, data, typeVal) => {
        const balance = data?.balance !== undefined && data?.balance !== null ? data.balance : null
        const price = data?.price || 0.5464
        const estimatedCost = balance !== null ? (balance * price).toFixed(2) : '--'
        const isLow = balance !== null && balance < 10

        return h('div', {
          style: {
            ...S.card,
            padding: '24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '190px',
          }
        },
          h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                icon,
                h('span', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, title)
              ),
              balance !== null && h('span', {
                style: {
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 500,
                  background: isLow ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                  color: isLow ? '#ef4444' : '#10b981',
                  border: isLow ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
                }
              }, isLow ? '⚠️ 剩余电量偏低' : '● 电量充足')
            ),
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' } },
              h('span', { style: { fontSize: '38px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)', letterSpacing: '-0.5px' } },
                balance !== null ? balance.toFixed(2) : '--'
              ),
              h('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '度 (kWh)')
            ),
            h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              `预估剩余金额: `,
              h('strong', { style: { color: 'var(--dsw-alias-text, inherit)', fontWeight: 600 } }, `¥ ${estimatedCost}`)
            )
          ),
          h('div', {
            style: {
              paddingTop: '14px',
              borderTop: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: 'var(--dsw-alias-text-sub, #71717a)',
            }
          },
            h('span', null, `川大官方基准单价: ${price.toFixed(4)} 元/度`),
            h('button', {
              style: {
                ...S.btnSecondary,
                fontSize: '11px',
                padding: '3px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              },
              onClick: () => handleOpenRechargeModal(typeVal)
            },
              h(ZapIcon, { size: 11 }),
              '在线购电'
            )
          )
        )
      }

      if (loading && !eleData) {
        return h('div', null,
          onBack && h('div', { style: { marginBottom: '16px' } },
            h('button', {
              style: { ...S.btnSecondary, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
              onClick: onBack
            }, h(ArrowLeftIcon, { size: 14 }), '返回微服务大厅')
          ),
          h('div', { style: { textAlign: 'center', padding: '60px 0', color: 'var(--dsw-alias-text-sub, #71717a)' } },
            h('div', { style: { fontSize: '14px', fontWeight: 500 } }, '正在拉取四川大学宿舍电费最新数据...'),
            h('div', { style: { fontSize: '12px', marginTop: '6px' } }, '自动复用统一身份认证会话，无需二次登录')
          )
        )
      }

      if (errorMsg && !eleData) {
        return h('div', null,
          onBack && h('div', { style: { marginBottom: '16px' } },
            h('button', {
              style: { ...S.btnSecondary, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
              onClick: onBack
            }, h(ArrowLeftIcon, { size: 14 }), '返回微服务大厅')
          ),
          h('div', { style: { ...S.card, padding: '32px', textAlign: 'center', maxWidth: '520px', margin: '40px auto' } },
            h('div', { style: { color: '#ef4444', fontSize: '15px', fontWeight: 600, marginBottom: '8px' } }, '拉取电费数据失败'),
            h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '20px' } }, errorMsg),
            h('button', {
              style: S.btnPrimary,
              onClick: () => onRefresh && onRefresh()
            }, '重新拉取')
          )
        )
      }

      return h('div', null,
        // 顶部微服务极简导航返回栏
        onBack && h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            flexWrap: 'wrap',
            gap: '8px',
          }
        },
          h('button', {
            style: {
              ...S.btnSecondary,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 12px',
              cursor: 'pointer',
            },
            onClick: onBack,
          },
            h(ArrowLeftIcon, { size: 14 }),
            '返回微服务大厅'
          ),
          h('div', {
            style: {
              fontSize: '12px',
              color: 'var(--dsw-alias-text-sub, #71717a)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }
          },
            h('span', null, '微服务大厅 / 宿舍用电详情看板'),
            eleData?.cusName ? h('span', {
              style: {
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
                border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                fontSize: '11px',
              }
            }, `${eleData.cusName} (${eleData.cusNo || ''})`) : null
          )
        ),

        // 顶部宿舍房间与快捷操作栏
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '12px',
            marginBottom: '20px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('div', {
              style: {
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }
            }, h(MapPinIcon, { size: 18 })),
            h('div', null,
              h('div', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } },
                eleData?.roomDisplay || '已绑定宿舍房间'
              ),
              h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                `绑定身份: ${eleData?.cusName || ''} (${eleData?.cusNo || ''}) · ${lastUpdated ? `更新于 ${lastUpdated}` : '已同步最新度数'}`
              )
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            // 在线购电主操作按钮
            h('button', {
              style: {
                ...S.btnPrimary,
                fontSize: '12px',
                padding: '6px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              },
              onClick: () => handleOpenRechargeModal(1),
            },
              h(ZapIcon, { size: 13 }),
              '在线购电'
            ),
            h('button', {
              style: {
                ...S.btnSecondary,
                fontSize: '12px',
                padding: '6px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                opacity: refreshing ? 0.7 : 1,
                cursor: refreshing ? 'not-allowed' : 'pointer',
              },
              onClick: () => onRefresh && onRefresh(),
              disabled: refreshing,
            },
              h(RefreshIcon, { size: 13 }),
              refreshing ? '正在刷新...' : '刷新电费'
            ),
            h('button', {
              style: {
                ...S.btnSecondary,
                fontSize: '12px',
                padding: '6px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              },
              onClick: handleOpenSwitchModal,
            },
              h(Edit3Icon, { size: 13 }),
              '切换宿舍'
            )
          )
        ),

        // 双模核心电费卡片栅格 (支持直达充值)
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '18px',
            marginBottom: '20px',
          }
        },
          renderFeeCard('宿舍照明用电', h(ZapIcon, { size: 17 }), eleData?.light, 1),
          renderFeeCard('空调动力用电', h(SnowflakeIcon, { size: 17 }), eleData?.air, 2)
        ),

        // 用电历史与耗电走势分析 (纯白极简 SVG 折线图架构)
        h('div', {
          style: {
            ...S.card,
            padding: '20px 24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '20px',
          }
        },
          // 标题行与周期切换按钮
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '10px',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(TrendingUpIcon, { size: 16 }),
              h('span', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '宿舍用电历史与耗电走势'),
              h('span', {
                style: {
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: '#10b981',
                  fontWeight: 500,
                }
              }, '自动持续打点')
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              [7, 14, 30].map(d => h('button', {
                key: d,
                style: {
                  padding: '3px 10px',
                  borderRadius: '14px',
                  fontSize: '11px',
                  fontWeight: trendDays === d ? 600 : 400,
                  cursor: 'pointer',
                  background: trendDays === d ? 'var(--dsw-alias-text, #18181b)' : 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
                  color: trendDays === d ? 'var(--dsw-alias-bg, #ffffff)' : 'var(--dsw-alias-text, inherit)',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                  transition: 'all 0.15s ease',
                },
                onClick: () => setTrendDays(d),
              }, `近 ${d} 天`)),
              h('button', {
                style: {
                  padding: '3px 10px',
                  borderRadius: '14px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  border: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
                  marginLeft: '4px',
                },
                onClick: () => setShowRecordsTable(!showRecordsTable),
              }, showRecordsTable ? '收起明细表' : '抄表明细表')
            )
          ),

          // 核心指标小三列横幅
          trendData?.summary && h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
            }
          },
            [
              { label: '区间日均消耗', val: `${trendData.summary.avgDailyUsage} 度/天`, sub: `约 ¥ ${(trendData.summary.avgDailyUsage * 0.5464).toFixed(2)}/天` },
              { label: '预计可用天数', val: `约 ${trendData.summary.estimatedDaysLeft} 天`, sub: '以当前日均耗电测算' },
              { label: '峰值单日耗电', val: `${trendData.summary.peakDay?.usedDegrees || '--'} 度`, sub: `${trendData.summary.peakDay?.date || '--'}` },
              { label: '区间累计用电', val: `${trendData.summary.totalPeriodUsage} 度`, sub: `折合 ¥ ${(trendData.summary.totalPeriodUsage * 0.5464).toFixed(2)}` }
            ].map((box, i) => h('div', {
              key: i,
              style: {
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
                border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
              }
            },
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, box.label),
              h('div', { style: { fontSize: '16px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)', margin: '2px 0' } }, box.val),
              h('div', { style: { fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, box.sub)
            ))
          ),

          // 纯白极简折线图 (SVG 渲染：总电量、空调回路、宿舍照明 3 条真实折线)
          (() => {
            const points = trendData?.timeline || []
            const isInsufficient = trendData?.isInsufficient || points.length < 2

            // 真实数据不足 2 条时，不绘制虚假折线，以真实空置/积累卡片呈现
            if (isInsufficient) {
              const single = points[0]
              return h('div', {
                style: {
                  padding: '28px 20px',
                  textAlign: 'center',
                  borderRadius: '10px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
                  border: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.18))',
                  margin: '4px 0 10px 0',
                }
              },
                single ? h('div', null,
                  h('div', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)', marginBottom: '8px' } },
                    `📍 当前已记录 1 次真实抄表快照 (${single.datetime || single.date})`
                  ),
                  h('div', {
                    style: {
                      display: 'inline-flex',
                      gap: '16px',
                      fontSize: '12px',
                      padding: '8px 16px',
                      background: 'var(--dsw-alias-bg-card, #ffffff)',
                      borderRadius: '8px',
                      border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                      marginBottom: '10px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }
                  },
                    h('span', null, '总剩余电量: ', h('strong', { style: { fontSize: '13px' } }, `${single.total} 度`)),
                    h('span', { style: { color: '#06b6d4' } }, '空调回路: ', h('strong', { style: { fontSize: '13px' } }, `${single.air} 度`)),
                    h('span', { style: { color: '#f59e0b' } }, '宿舍照明: ', h('strong', { style: { fontSize: '13px' } }, `${single.light} 度`))
                  ),
                  h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 } },
                    '遵循真实数据原则，历史抄表读数少于 2 次时暂不连接折线。数据已永久记录在本地，随着后续手动刷新或后台自动打点，累积到 2 次及以上将实时连线展示 3 条回路真实用电走势。'
                  )
                ) : h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', padding: '16px 0' } },
                  trendLoading ? '正在分析用电走势...' : '暂无历史抄表数据，点击右上角【刷新电费】即可自动记录第 1 条真实读数。'
                )
              )
            }

            const W = 620
            const H = 190
            const padL = 42
            const padR = 20
            const padT = 20
            const padB = 30
            const plotW = W - padL - padR
            const plotH = H - padT - padB

            const totals = points.map(p => p.total)
            const airs = points.map(p => p.air)
            const lights = points.map(p => p.light)
            const minV = Math.max(0, Math.floor(Math.min(...totals, ...airs, ...lights) * 0.85))
            const maxV = Math.ceil(Math.max(...totals) * 1.15) || 50
            const rangeV = maxV - minV || 1

            const getX = (idx) => padL + (idx / (points.length - 1)) * plotW
            const getY = (val) => padT + (1 - (val - minV) / rangeV) * plotH

            // 构造 3 条折线路径
            const totalPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.total).toFixed(1)}`).join(' ')
            const totalArea = `${totalPath} L ${getX(points.length - 1)} ${H - padB} L ${getX(0)} ${H - padB} Z`

            const airPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.air).toFixed(1)}`).join(' ')
            const lightPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.light).toFixed(1)}`).join(' ')

            // 刻度线
            const gridLines = [0, 0.5, 1].map(ratio => {
              const val = Math.round(minV + (1 - ratio) * rangeV)
              const y = padT + ratio * plotH
              return { val, y }
            })

            return h('div', { style: { position: 'relative', width: '100%', overflow: 'hidden' } },
              // 3 条折线清晰图例
              h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '16px', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '8px', flexWrap: 'wrap' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } },
                  h('span', { style: { display: 'inline-block', width: '14px', height: '3px', background: 'var(--dsw-alias-text, #18181b)', borderRadius: '2px' } }),
                  '总剩余电量 (度)'
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } },
                  h('span', { style: { display: 'inline-block', width: '14px', height: '3px', background: '#06b6d4', borderRadius: '2px' } }),
                  '空调回路 (度)'
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } },
                  h('span', { style: { display: 'inline-block', width: '14px', height: '3px', background: '#f59e0b', borderRadius: '2px' } }),
                  '宿舍照明 (度)'
                )
              ),

              // SVG 折线图本体
              h('svg', {
                viewBox: `0 0 ${W} ${H}`,
                style: { width: '100%', height: 'auto', display: 'block' }
              },
                // 背景参考网格
                gridLines.map((gl, i) => h('g', { key: i },
                  h('line', {
                    x1: padL,
                    y1: gl.y,
                    x2: W - padR,
                    y2: gl.y,
                    stroke: 'var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                    strokeDasharray: '4 3',
                    strokeWidth: 1,
                  }),
                  h('text', {
                    x: padL - 8,
                    y: gl.y + 4,
                    fontSize: 10,
                    textAnchor: 'end',
                    fill: 'var(--dsw-alias-text-sub, #71717a)'
                  }, gl.val)
                )),

                // 总电量背景渐变阴影填充
                h('path', {
                  d: totalArea,
                  fill: 'var(--dsw-alias-text, #18181b)',
                  fillOpacity: 0.04,
                }),

                // 折线 2：空调动力 (青色)
                h('path', {
                  d: airPath,
                  fill: 'none',
                  stroke: '#06b6d4',
                  strokeWidth: 2,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                }),

                // 折线 3：宿舍照明 (金橙色)
                h('path', {
                  d: lightPath,
                  fill: 'none',
                  stroke: '#f59e0b',
                  strokeWidth: 2,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                }),

                // 折线 1：总剩余电量主折线 (深色粗线)
                h('path', {
                  d: totalPath,
                  fill: 'none',
                  stroke: 'var(--dsw-alias-text, #18181b)',
                  strokeWidth: 2.5,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                }),

                // 交互数据节点圆点
                points.map((p, i) => {
                  const x = getX(i)
                  const y = getY(p.total)
                  const yAir = getY(p.air)
                  const yLight = getY(p.light)
                  const isHov = hoveredPoint?.index === i
                  return h('g', {
                    key: i,
                    style: { cursor: 'pointer' },
                    onMouseEnter: () => setHoveredPoint({ ...p, index: i, x, y }),
                    onMouseLeave: () => setHoveredPoint(null),
                  },
                    // 透明大响应区
                    h('circle', { cx: x, cy: y, r: 12, fill: 'transparent' }),
                    // 空调圆点
                    h('circle', { cx: x, cy: yAir, r: 2.5, fill: '#06b6d4' }),
                    // 照明圆点
                    h('circle', { cx: x, cy: yLight, r: 2.5, fill: '#f59e0b' }),
                    // 总电量主圆点
                    h('circle', {
                      cx: x,
                      cy: y,
                      r: isHov ? 5 : 3.5,
                      fill: 'var(--dsw-alias-bg-card, #ffffff)',
                      stroke: 'var(--dsw-alias-text, #18181b)',
                      strokeWidth: 2,
                    }),
                    // X 轴时间/日期刻度
                    (i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 5) === 0) && h('text', {
                      x,
                      y: H - 8,
                      fontSize: 10,
                      textAnchor: 'middle',
                      fill: 'var(--dsw-alias-text-sub, #71717a)'
                    }, p.shortDate || p.time?.substring(0, 5) || p.date)
                  )
                })
              ),

              // 悬浮 Tooltip 气泡卡片 (包含总电量、空调、照明 3 条读数)
              hoveredPoint && h('div', {
                style: {
                  position: 'absolute',
                  top: '8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-text, #18181b)',
                  color: 'var(--dsw-alias-bg, #ffffff)',
                  fontSize: '11px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                }
              },
                h('span', { style: { fontWeight: 600 } }, `${hoveredPoint.datetime || `${hoveredPoint.date} ${hoveredPoint.time}`} 抄表`),
                h('span', null, `总剩余: ${hoveredPoint.total} 度 (约 ¥ ${hoveredPoint.cost})`),
                h('span', { style: { color: '#06b6d4', fontWeight: 500 } }, `空调: ${hoveredPoint.air} 度`),
                h('span', { style: { color: '#f59e0b', fontWeight: 500 } }, `照明: ${hoveredPoint.light} 度`)
              )
            )
          })(),

          // 历史抄表流水明细折叠表
          showRecordsTable && h('div', {
            style: {
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            }
          },
            h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '8px' } }, '📋 历史抄表快照流水 (最近 30 次)'),
            h('div', { style: { maxHeight: '200px', overflowY: 'auto' } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' } },
                h('thead', null,
                  h('tr', { style: { color: 'var(--dsw-alias-text-sub, #71717a)', borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))' } },
                    h('th', { style: { padding: '6px 8px' } }, '抄表时间'),
                    h('th', { style: { padding: '6px 8px' } }, '宿舍房间'),
                    h('th', { style: { padding: '6px 8px' } }, '空调动力'),
                    h('th', { style: { padding: '6px 8px' } }, '宿舍照明'),
                    h('th', { style: { padding: '6px 8px' } }, '剩余总电量'),
                    h('th', { style: { padding: '6px 8px' } }, '折合电费')
                  )
                ),
                h('tbody', null,
                  (trendData?.records || []).slice().reverse().map((r, idx) => h('tr', {
                    key: r.id || idx,
                    style: { borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.05))' }
                  },
                    h('td', { style: { padding: '6px 8px' } }, r.datetime || `${r.date} ${r.time}`),
                    h('td', { style: { padding: '6px 8px' } }, r.room || '当前宿舍'),
                    h('td', { style: { padding: '6px 8px', color: '#06b6d4', fontWeight: 500 } }, `${r.air} 度`),
                    h('td', { style: { padding: '6px 8px' } }, `${r.light} 度`),
                    h('td', { style: { padding: '6px 8px', fontWeight: 600 } }, `${r.total} 度`),
                    h('td', { style: { padding: '6px 8px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `¥ ${r.estimatedCost || (r.total * 0.5464).toFixed(2)}`)
                  ))
                )
              )
            )
          )
        ),

        // 纯白极简温馨提示卡片
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            fontSize: '12px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            lineHeight: 1.6,
          }
        },
          h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-text, inherit)', marginBottom: '4px' } }, '💡 宿舍用电与充值说明'),
          h('div', null, '1. 电费不足 10 度时微服务系统将触发低电量预警，为防止夜间断电，建议在电量低于 10 度前及时充值。'),
          h('div', null, '2. 官方收银台充值：点击右上角【在线购电】或卡片内【在线购电】，系统直通四川大学官方支付中心网关，支持微信扫码支付，资金直达学校财务处。'),
          h('div', null, '3. 如需查询其它校区或他人寝室电量，可点击右上角【切换宿舍】选择目标楼栋房间一键查看。')
        ),

        // 快捷换房模态弹窗 (纯白极简规范)
        showSwitchModal && h('div', {
          style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          },
          onClick: () => setShowSwitchModal(false),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            h('h3', { style: { margin: '0 0 6px 0', fontSize: '16px', fontWeight: 600 } }, '切换宿舍房间'),
            h('p', { style: { margin: '0 0 16px 0', fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
              '选择目标校区、楼栋与房间号，系统将自动校验并切换绑定当前宿舍。'
            ),

            switchMsg && h('div', {
              style: {
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '14px',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }
            }, switchMsg),

            h('form', { onSubmit: handleConfirmSwitch },
              // 校区选择
              h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 } }, '选择校区'),
              h('select', {
                style: { ...S.input, marginBottom: '12px' },
                value: selCampus,
                onChange: (e) => {
                  setSelCampus(e.target.value)
                  loadBuildings(e.target.value)
                }
              },
                campuses.map(c => h('option', { key: c.code, value: c.code }, c.name))
              ),

              // 楼栋选择
              h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 } }, '选择楼栋'),
              h('select', {
                style: { ...S.input, marginBottom: '12px' },
                value: selBuilding,
                onChange: (e) => {
                  setSelBuilding(e.target.value)
                  loadUnits(selCampus, e.target.value)
                }
              },
                buildings.map(b => h('option', { key: b.code, value: b.code }, b.name))
              ),

              // 单元选择 (部分楼栋无单元)
              units.length > 0 && h(React.Fragment, null,
                h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 } }, '选择单元'),
                h('select', {
                  style: { ...S.input, marginBottom: '12px' },
                  value: selUnit,
                  onChange: (e) => setSelUnit(e.target.value)
                },
                  units.map(u => h('option', { key: u.code, value: u.code }, u.name))
                )
              ),

              // 房间号输入
              h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 } }, '房间号 (如 1527 或 101c)'),
              h('input', {
                style: { ...S.input, marginBottom: '20px' },
                type: 'text',
                placeholder: '例如 1527',
                value: inputRoom,
                onChange: (e) => setInputRoom(e.target.value)
              }),

              // 按钮组
              h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px' } },
                h('button', {
                  type: 'button',
                  style: { ...S.btnSecondary, padding: '7px 16px' },
                  onClick: () => setShowSwitchModal(false)
                }, '取消'),
                h('button', {
                  type: 'submit',
                  style: { ...S.btnPrimary, padding: '7px 20px' },
                  disabled: switchLoading
                }, switchLoading ? '正在校验并绑定...' : '确认绑定')
              )
            )
          )
        ),

        // 在线购电充值模态弹窗 (纯白极简规范)
        showRechargeModal && h('div', {
          style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          },
          onClick: handleCloseRechargeModal,
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
              borderRadius: '14px',
              padding: '24px 28px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.12)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            // 弹窗头部
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' } },
              h('div', null,
                h('h3', { style: { margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '宿舍电费在线购电'),
                h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                  `充值寝室: ${eleData?.roomDisplay || '当前宿舍'} · 官方网关直结`
                )
              ),
              h('button', {
                style: {
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  display: 'flex',
                  alignItems: 'center',
                },
                onClick: handleCloseRechargeModal,
              }, h(XIcon, { size: 16 }))
            ),

            // 错误信息提示
            rechargeErr && h('div', {
              style: {
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '14px',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }
            }, rechargeErr),

            // 模式 1: 选择回路与金额
            rechargeStep === 'select' && h('div', null,
              // 回路选择
              h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '8px' } }, '选择充值用电回路'),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' } },
                h('button', {
                  type: 'button',
                  style: {
                    padding: '10px',
                    borderRadius: '8px',
                    border: rechargeType === 1 ? '1.5px solid var(--dsw-alias-text, #18181b)' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                    background: rechargeType === 1 ? 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.08))' : 'var(--dsw-alias-bg-card, #ffffff)',
                    color: 'var(--dsw-alias-text, inherit)',
                    fontWeight: rechargeType === 1 ? 600 : 400,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '13px',
                  },
                  onClick: () => setRechargeType(1)
                }, h(ZapIcon, { size: 15 }), '宿舍照明电 (回路 1)'),
                h('button', {
                  type: 'button',
                  style: {
                    padding: '10px',
                    borderRadius: '8px',
                    border: rechargeType === 2 ? '1.5px solid var(--dsw-alias-text, #18181b)' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                    background: rechargeType === 2 ? 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.08))' : 'var(--dsw-alias-bg-card, #ffffff)',
                    color: 'var(--dsw-alias-text, inherit)',
                    fontWeight: rechargeType === 2 ? 600 : 400,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '13px',
                  },
                  onClick: () => setRechargeType(2)
                }, h(SnowflakeIcon, { size: 15 }), '空调动力电 (回路 2)')
              ),

              // 充值金额快捷选项
              h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '8px' } }, '选择充值金额'),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' } },
                [20, 50, 100, 200].map(amt => {
                  const isSelected = !isCustomAmt && rechargeAmt === amt
                  return h('button', {
                    key: amt,
                    type: 'button',
                    style: {
                      padding: '9px 0',
                      textAlign: 'center',
                      borderRadius: '8px',
                      border: isSelected ? '1.5px solid var(--dsw-alias-text, #18181b)' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                      background: isSelected ? 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.08))' : 'var(--dsw-alias-bg-card, #ffffff)',
                      color: 'var(--dsw-alias-text, inherit)',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      fontSize: '13px',
                    },
                    onClick: () => {
                      setIsCustomAmt(false)
                      setRechargeAmt(amt)
                    }
                  }, `¥ ${amt}`)
                })
              ),

              // 自定义金额输入
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' } },
                h('button', {
                  type: 'button',
                  style: {
                    padding: '7px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: isCustomAmt ? '1.5px solid var(--dsw-alias-text, #18181b)' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                    background: isCustomAmt ? 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.08))' : 'transparent',
                    color: 'var(--dsw-alias-text, inherit)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  },
                  onClick: () => setIsCustomAmt(true)
                }, '自定义金额'),
                isCustomAmt && h('input', {
                  style: { ...S.input, flex: 1, padding: '6px 10px', fontSize: '13px' },
                  type: 'number',
                  min: '1',
                  max: '500',
                  step: '1',
                  placeholder: '输入 1 ~ 500 元',
                  value: customAmtStr,
                  onChange: (e) => setCustomAmtStr(e.target.value)
                })
              ),

              // 预估购电度数换算卡片
              h('div', {
                style: {
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                  marginBottom: '18px',
                  fontSize: '12px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                }
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                  h('span', null, '预计到账度数:'),
                  h('strong', { style: { color: 'var(--dsw-alias-text, inherit)', fontSize: '14px' } },
                    `~ ${((isCustomAmt ? (parseFloat(customAmtStr) || 0) : rechargeAmt) / 0.5464).toFixed(2)} 度`
                  )
                ),
                h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  h('span', null, '官方基准单价:'),
                  h('span', null, '0.5464 元/度')
                )
              ),

              // 官方网关与安全提示
              h('div', {
                style: {
                  fontSize: '11px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }
              },
                h(ShieldIcon, { size: 13 }),
                h('span', null, '直连四川大学官方统一支付中心收银台，钱款直达学校财务处')
              ),

              // 底部操作按钮
              h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px' } },
                h('button', {
                  type: 'button',
                  style: { ...S.btnSecondary, padding: '8px 16px' },
                  onClick: handleCloseRechargeModal
                }, '取消'),
                h('button', {
                  type: 'button',
                  style: { ...S.btnPrimary, padding: '8px 22px' },
                  disabled: rechargeLoading,
                  onClick: handleCreateRechargeOrder
                }, rechargeLoading ? '正在创建官方订单...' : '立即前往收银台支付')
              )
            ),

            // 模式 2: 正在支付中
            rechargeStep === 'paying' && h('div', { style: { textAlign: 'center', padding: '10px 0' } },
              h('div', {
                style: {
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  color: '#10b981',
                }
              }, h(ExternalLinkIcon, { size: 24 })),
              h('h4', { style: { margin: '0 0 6px 0', fontSize: '16px', fontWeight: 600 } }, '官方收银台已拉起'),
              h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)', margin: '0 0 16px 0' } },
                '请在弹出的新标签页中选择微信支付完成扫码支付'
              ),

              // 订单明细
              orderInfo && h('div', {
                style: {
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  marginBottom: '16px',
                  lineHeight: '1.8',
                }
              },
                h('div', null, `订单编号: ${orderInfo.orderNo || '--'}`),
                h('div', null, `充值项目: ${orderInfo.feeType || (rechargeType === 1 ? '宿舍照明电' : '空调动力电')}`),
                h('div', null, `充值金额: ¥ ${orderInfo.amount || rechargeAmt}`),
                h('div', null, `充值房间: ${orderInfo.roomName || eleData?.roomDisplay || ''}`)
              ),

              pollStatusText && h('div', {
                style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '18px' }
              }, pollStatusText),

              h('div', { style: { display: 'flex', justifyContent: 'center', gap: '10px' } },
                h('button', {
                  type: 'button',
                  style: { ...S.btnSecondary, padding: '8px 16px', fontSize: '12px' },
                  onClick: () => {
                    if (orderInfo) {
                      openOfficialGateway(orderInfo.gatewayUrl, orderInfo.orderNo)
                    }
                  }
                }, '重新打开收银台'),
                h('button', {
                  type: 'button',
                  style: { ...S.btnPrimary, padding: '8px 20px', fontSize: '12px' },
                  onClick: async () => {
                    stopPolling()
                    if (onRefresh) await onRefresh()
                    setRechargeStep('success')
                  }
                }, '我已完成支付，刷新度数')
              )
            ),

            // 模式 3: 充值成功
            rechargeStep === 'success' && h('div', { style: { textAlign: 'center', padding: '20px 0' } },
              h('div', {
                style: {
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  color: '#10b981',
                }
              }, h(CheckCircleIcon, { size: 28 })),
              h('h4', { style: { margin: '0 0 6px 0', fontSize: '17px', fontWeight: 600 } }, '充值成功，度数已入账！'),
              h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-text-sub, #71717a)', margin: '0 0 20px 0' } },
                '宿舍电表度数已自动同步更新，祝您用电愉快。'
              ),
              h('button', {
                type: 'button',
                style: { ...S.btnPrimary, padding: '8px 28px' },
                onClick: handleCloseRechargeModal
              }, '完成')
            )
          )
        )
      )
    }

    // ================== 微服务子页面：校园一卡通详情看板与记账统计 (纯白极简风格) ==================
    function CardDetailView({ onRequireLogin, onBack, cardData, loading, refreshing, lastUpdated, errorMsg, onRefresh }) {
      const [bookkeepingData, setBookkeepingData] = useState(null)
      const [bookkeepingLoading, setBookkeepingLoading] = useState(false)
      const [noteModalItem, setNoteModalItem] = useState(null)
      const [noteInput, setNoteInput] = useState('')
      const [noteSaving, setNoteSaving] = useState(false)
      const [activeDateFilter, setActiveDateFilter] = useState('all') // 'all' | 'YYYY-MM-DD'

      // 拉取一卡通记账分析数据
      const fetchBookkeeping = useCallback(async (isRefresh = false) => {
        setBookkeepingLoading(true)
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/card/bookkeeping${isRefresh ? '?refresh=true' : ''}`)
          if (resp.ok) {
            const d = await resp.json()
            setBookkeepingData(d)
          }
        } catch (_) {}
        finally {
          setBookkeepingLoading(false)
        }
      }, [])

      useEffect(() => {
        fetchBookkeeping(false)
      }, [fetchBookkeeping])

      // 刷新数据并同步拉取记账
      const handleFullRefresh = async () => {
        if (onRefresh) onRefresh()
        await fetchBookkeeping(true)
      }

      // 打开记账备注弹窗
      const handleOpenNoteModal = (item) => {
        setNoteModalItem(item)
        setNoteInput(item.userNote || '')
      }

      // 保存自定义记账备注
      const handleSaveNote = async () => {
        if (!noteModalItem) return
        setNoteSaving(true)
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/card/note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recordId: noteModalItem.id,
              note: noteInput.trim(),
            })
          })
          if (resp.ok) {
            // 本地状态乐观更新
            if (bookkeepingData?.records) {
              const updated = bookkeepingData.records.map(r => r.id === noteModalItem.id ? { ...r, userNote: noteInput.trim() } : r)
              // 同步更新 dailyExpenseList 中的记录
              const updatedDays = (bookkeepingData.dailyExpenseList || []).map(day => ({
                ...day,
                records: day.records.map(r => r.id === noteModalItem.id ? { ...r, userNote: noteInput.trim() } : r)
              }))
              setBookkeepingData({ ...bookkeepingData, records: updated, dailyExpenseList: updatedDays })
            }
            setNoteModalItem(null)
          }
        } catch (_) {}
        finally {
          setNoteSaving(false)
        }
      }

      const summary = bookkeepingData?.summary || {}
      const dailyTrend = bookkeepingData?.dailyTrend || []
      const dailyExpenseList = bookkeepingData?.dailyExpenseList || []

      // 筛选后的按日账单列表
      const displayDailyList = activeDateFilter === 'all'
        ? dailyExpenseList
        : dailyExpenseList.filter(d => d.date === activeDateFilter)

      return h('div', null,
        // 顶部导航行
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: onBack,
            },
              h(ArrowLeftIcon, { size: 14 }),
              '返回微服务大厅'
            ),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, '校园一卡通'),
                h('span', {
                  style: {
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontWeight: 500,
                  }
                }, '● 消费流水与余额')
              )
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            lastUpdated && h('span', {
              style: {
                fontSize: '11px',
                color: 'var(--dsw-alias-text-sub, #71717a)',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
              }
            }, `最近同步: ${lastUpdated}`),
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: handleFullRefresh,
              disabled: refreshing || loading || bookkeepingLoading,
            },
              h(RefreshIcon, { size: 13, style: { animation: (refreshing || bookkeepingLoading) ? 'spin 1s linear infinite' : 'none' } }),
              (refreshing || bookkeepingLoading) ? '正在核算...' : '刷新账单'
            )
          )
        ),

        // 异常提示
        errorMsg && h('div', {
          style: {
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            fontSize: '12px',
          }
        }, errorMsg),

        // 纯白极简 4 大记账指标栅格卡片
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
          }
        },
          // 指标 1：物理卡实时余额
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '实体卡物理余额'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(CreditCardIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              cardData?.balance !== undefined ? `¥ ${cardData.balance}` : (loading ? '...' : '--')
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              '芯片结余 · 食堂水房刷卡即扣'
            )
          ),

          // 指标 2：今日支出
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '今日总支出'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(ZapIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              summary.todaySpent !== undefined ? `¥ ${summary.todaySpent.toFixed(2)}` : (cardData?.todaySpent !== undefined ? `¥ ${cardData.todaySpent.toFixed(2)}` : '--')
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              `日均花费约 ¥ ${summary.avgDailySpent || '--'}/天`
            )
          ),

          // 指标 3：本周支出 (周一至今)
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '本周支出 (周一至今)'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(CalendarIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              summary.weekSpent !== undefined ? `¥ ${summary.weekSpent.toFixed(2)}` : '--'
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              '自然周在校日常消费'
            )
          ),

          // 指标 4：本月累计支出
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '本月累计支出'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(ChartIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              summary.monthSpent !== undefined ? `¥ ${summary.monthSpent.toFixed(2)}` : '--'
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              `累计 ${summary.totalRecords || cardData?.recordCount || 0} 笔 · 活跃天数 ${summary.activeDaysCount || 0} 天`
            )
          )
        ),

        // 核心板块 1：近 14 天每日花费统计柱状图 (纯粹反映每天多少钱)
        h('div', {
          style: {
            ...S.card,
            padding: '20px 24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '20px',
          }
        },
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '10px',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(TrendingUpIcon, { size: 16 }),
              h('span', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '近 14 天每日花费走势'),
              h('span', {
                style: {
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                }
              }, '单位: 元')
            ),
            h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', display: 'flex', alignItems: 'center', gap: '12px' } },
              summary.maxDay && h('span', null, `单日最高: ${summary.maxDay.date} (¥ ${summary.maxDay.amount.toFixed(2)})`),
              summary.maxExpense && h('span', null, `单笔最大: ¥ ${summary.maxExpense.amount} (${summary.maxExpense.merchant})`)
            )
          ),

          // 每日消费柱状图本体 (SVG)
          (() => {
            if (dailyTrend.length === 0) {
              return h('div', { style: { textAlign: 'center', padding: '30px 0', fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '暂无每日趋势数据')
            }

            const W = 620
            const H = 160
            const padL = 36
            const padR = 16
            const padT = 16
            const padB = 28
            const plotW = W - padL - padR
            const plotH = H - padT - padB
            const maxAmt = Math.max(30, Math.ceil(Math.max(...dailyTrend.map(t => t.amount)) * 1.25))

            return h('div', { style: { position: 'relative', width: '100%', overflow: 'hidden' } },
              h('svg', {
                viewBox: `0 0 ${W} ${H}`,
                style: { width: '100%', height: 'auto', display: 'block' }
              },
                // 背景参考横虚线与刻度
                [0, 0.5, 1].map((r, i) => {
                  const y = padT + r * plotH
                  const val = Math.round((1 - r) * maxAmt)
                  return h('g', { key: i },
                    h('line', {
                      x1: padL,
                      y1: y,
                      x2: W - padR,
                      y2: y,
                      stroke: 'var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      strokeDasharray: '3 3',
                    }),
                    h('text', {
                      x: padL - 8,
                      y: y + 4,
                      fontSize: 10,
                      textAnchor: 'end',
                      fill: 'var(--dsw-alias-text-sub, #71717a)'
                    }, `¥${val}`)
                  )
                }),

                // 14 根每日柱形
                dailyTrend.map((day, idx) => {
                  const colW = (plotW / dailyTrend.length) * 0.62
                  const x = padL + idx * (plotW / dailyTrend.length) + (plotW / dailyTrend.length - colW) / 2
                  const barH = (day.amount / maxAmt) * plotH
                  const y = padT + (plotH - barH)
                  const isToday = idx === dailyTrend.length - 1
                  const isSelected = activeDateFilter === day.date

                  return h('g', {
                    key: day.date,
                    style: { cursor: 'pointer' },
                    onClick: () => setActiveDateFilter(activeDateFilter === day.date ? 'all' : day.date)
                  },
                    // 柱子
                    h('rect', {
                      x,
                      y,
                      width: colW,
                      height: Math.max(3, barH),
                      rx: 3,
                      fill: isSelected ? '#10b981' : (isToday ? 'var(--dsw-alias-text, #18181b)' : (day.amount > 0 ? '#3b82f6' : 'var(--dsw-alias-border, rgba(125, 125, 125, 0.18))')),
                      opacity: day.amount > 0 ? 0.9 : 0.4,
                    }, h('title', null, `${day.date} (${day.weekday}): 支出 ¥ ${day.amount} (${day.count} 笔，点击筛选当天)`)),

                    // 柱顶金额标签 (对消费大于 0 的显示)
                    day.amount > 0 && h('text', {
                      x: x + colW / 2,
                      y: Math.max(12, y - 4),
                      fontSize: 9,
                      textAnchor: 'middle',
                      fill: isSelected ? '#10b981' : (isToday ? 'var(--dsw-alias-text, inherit)' : 'var(--dsw-alias-text-sub, #71717a)'),
                      fontWeight: (isToday || isSelected) ? 600 : 500,
                    }, `¥${day.amount >= 10 ? Math.round(day.amount) : day.amount.toFixed(1)}`),

                    // X 轴日期刻度
                    h('text', {
                      x: x + colW / 2,
                      y: H - 8,
                      fontSize: 10,
                      textAnchor: 'middle',
                      fill: isSelected ? '#10b981' : (isToday ? 'var(--dsw-alias-text, inherit)' : 'var(--dsw-alias-text-sub, #71717a)'),
                      fontWeight: (isToday || isSelected) ? 600 : 400,
                    }, day.shortDate)
                  )
                })
              ),
              h('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '11px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                }
              },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                  h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                    h('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: 'var(--dsw-alias-text, #18181b)' } }),
                    '黑色为今日'
                  ),
                  h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                    h('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#3b82f6' } }),
                    '蓝色为产生消费日'
                  ),
                  activeDateFilter !== 'all' && h('span', { style: { color: '#10b981', fontWeight: 500 } }, `已筛选: ${activeDateFilter}`)
                ),
                activeDateFilter !== 'all' && h('button', {
                  style: { ...S.btnSecondary, fontSize: '11px', padding: '2px 8px' },
                  onClick: () => setActiveDateFilter('all')
                }, '查看全部日期')
              )
            )
          })()
        ),

        // 核心板块 2：每日花费明细账本 (纯粹按天统计每天多少钱)
        h('div', {
          style: {
            ...S.card,
            padding: '20px 24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '20px',
          }
        },
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
              flexWrap: 'wrap',
              gap: '10px',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(ListIcon, { size: 15 }),
              h('span', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '每日花费统计账本'),
              h('span', {
                style: {
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                }
              }, `共 ${displayDailyList.length} 天有流水`)
            ),
            h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, '点击单笔交易右侧【记备注】可记录消费事由')
          ),

          // 按天聚合账单卡片列表
          displayDailyList.length === 0 ? (
            h('div', { style: { textAlign: 'center', padding: '40px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } },
              '所选日期暂无消费记录'
            )
          ) : (
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
              displayDailyList.map(day => h('div', {
                key: day.date,
                style: {
                  borderRadius: '10px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.02))',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                  overflow: 'hidden',
                }
              },
                // 每天的汇总标题行
                h('div', {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 16px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
                    borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    h(CalendarIcon, { size: 13, style: { color: 'var(--dsw-alias-text-sub, #71717a)' } }),
                    h('span', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } },
                      `${day.date} ${day.weekday}`
                    )
                  ),
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' } },
                    day.totalSpent > 0 && h('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } },
                      `支出 ¥ ${day.totalSpent.toFixed(2)} (${day.count} 笔)`
                    ),
                    day.rechargeAmt > 0 && h('span', { style: { color: '#10b981', fontWeight: 500 } },
                      `+¥ ${day.rechargeAmt.toFixed(2)} 充值`
                    )
                  )
                ),

                // 当天的各笔交易流水明细
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--dsw-alias-border, rgba(125, 125, 125, 0.06))' } },
                  day.records.map((item, idx) => {
                    const isRecharge = item.isRecharge
                    return h('div', {
                      key: item.id || idx,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 16px',
                        background: 'var(--dsw-alias-bg-card, #ffffff)',
                      }
                    },
                      // 左侧：商户名与时间
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 } },
                        h('div', {
                          style: {
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: isRecharge ? 'rgba(16, 185, 129, 0.08)' : 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                            color: isRecharge ? '#10b981' : 'var(--dsw-alias-text, inherit)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }
                        }, isRecharge ? h(CreditCardIcon, { size: 13 }) : h(CoffeeIcon, { size: 13 })),
                        h('div', { style: { overflow: 'hidden' } },
                          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                            h('span', {
                              style: {
                                fontSize: '13px',
                                fontWeight: 500,
                                color: 'var(--dsw-alias-text, inherit)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }
                            }, item.merchant),
                            item.userNote && h('span', {
                              style: {
                                fontSize: '11px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.1))',
                                color: 'var(--dsw-alias-text, inherit)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }
                            },
                              h(Edit3Icon, { size: 10 }),
                              item.userNote
                            )
                          ),
                          h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                            `${item.time || item.datetime} · ${item.type || '消费'}`
                          )
                        )
                      ),

                      // 右侧：金额与记账按钮
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 } },
                        h('div', { style: { textAlign: 'right' } },
                          h('div', {
                            style: {
                              fontSize: '14px',
                              fontWeight: 600,
                              color: isRecharge ? '#10b981' : 'var(--dsw-alias-text, inherit)'
                            }
                          }, isRecharge ? `+¥ ${item.amount.toFixed(2)}` : `-¥ ${item.amount.toFixed(2)}`),
                          item.balance && h('div', { style: { fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, `余 ¥ ${item.balance}`)
                        ),
                        h('button', {
                          style: {
                            ...S.btnSecondary,
                            padding: '3px 8px',
                            fontSize: '11px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            cursor: 'pointer',
                          },
                          onClick: () => handleOpenNoteModal(item),
                        },
                          h(Edit3Icon, { size: 10 }),
                          item.userNote ? '改备注' : '记备注'
                        )
                      )
                    )
                  })
                )
              ))
            )
          )
        ),

        // 自定义记账备注模态弹窗 (纯白极简规范)
        noteModalItem && h('div', {
          style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          },
          onClick: () => setNoteModalItem(null),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            h('h3', { style: { margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600 } }, '流水记账备注'),
            h('p', { style: { margin: '0 0 14px 0', fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
              `${noteModalItem.merchant} · ¥ ${noteModalItem.amount.toFixed(2)} (${noteModalItem.date})`
            ),
            h('input', {
              style: { ...S.input, marginBottom: '16px' },
              type: 'text',
              placeholder: '例如：和室友聚餐、买牛奶零食、理发等...',
              value: noteInput,
              onChange: (e) => setNoteInput(e.target.value),
              autoFocus: true,
              onKeyDown: (e) => {
                if (e.key === 'Enter') handleSaveNote()
              }
            }),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
              h('button', {
                type: 'button',
                style: { ...S.btnSecondary, padding: '6px 14px' },
                onClick: () => setNoteModalItem(null),
              }, '取消'),
              h('button', {
                type: 'button',
                style: { ...S.btnPrimary, padding: '6px 16px' },
                onClick: handleSaveNote,
                disabled: noteSaving,
              }, noteSaving ? '保存中...' : '确认记账')
            )
          )
        ),

        // 纯白极简温馨提示卡片
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            fontSize: '12px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            lineHeight: 1.6,
          }
        },
          h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-text, inherit)', marginBottom: '4px' } }, '💡 校园一卡通每日花费统计说明'),
          h('div', null, '1. 每日花费核算：系统按自然日自动汇总您每一天的消费金额与笔数，柱状图直观呈现开销起伏。'),
          h('div', null, '2. 随手记账备注：每笔流水右侧均支持一键补充记账备注，数据持久化保存在本地，方便学期末对账复盘。'),
          h('div', null, '3. 线上充值通道：可微信关注【微川大】服务号或手机端【智慧川大 APP】直接充值，充值后可在食堂圈存机贴卡补登。')
        )
      )
    }

    // ================== 微服务子页面：校园网服务详情看板 (纯白极简风格) ==================
    function NetworkDetailView({ onRequireLogin, onBack, netData, loading, refreshing, lastUpdated, errorMsg, onRefresh, onOfflineDevice }) {
      const [offlineLoadingId, setOfflineLoadingId] = useState('')

      const handleOffline = async (dev) => {
        if (!window.confirm(`确定要强制将终端设备 (MAC: ${dev.mac || dev.deviceId}) 踢下线吗？`)) {
          return
        }
        setOfflineLoadingId(dev.deviceId)
        try {
          await onOfflineDevice(dev.deviceId, dev.ip)
        } finally {
          setOfflineLoadingId('')
        }
      }

      return h('div', null,
        // 顶部导航行
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: onBack,
            },
              h(ArrowLeftIcon, { size: 14 }),
              '返回微服务大厅'
            ),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, '校园网服务'),
                h('span', {
                  style: {
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontWeight: 500,
                  }
                }, '● 实时在线')
              )
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            lastUpdated && h('span', {
              style: {
                fontSize: '11px',
                color: 'var(--dsw-alias-text-sub, #71717a)',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
              }
            }, `最近检测: ${lastUpdated}`),
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: onRefresh,
              disabled: refreshing || loading,
            },
              h(RefreshIcon, { size: 13, style: { animation: refreshing ? 'spin 1s linear infinite' : 'none' } }),
              refreshing ? '正在检测...' : '刷新设备'
            )
          )
        ),

        // 异常提示
        errorMsg && h('div', {
          style: {
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            fontSize: '12px',
          }
        }, errorMsg),

        // 核心指标卡片 (在线终端 / 网络环境)
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
          }
        },
          // 指标 1：当前在线设备数 (川大上限 2 台)
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '当前在线终端'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(WifiIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              netData?.deviceCount !== undefined ? `${netData.deviceCount} / ${netData.maxDevices || 2} 台` : (loading ? '...' : '--')
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              netData?.deviceCount >= (netData?.maxDevices || 2) ? '⚠️ 已达终端最大并发限制 (2台)' : '配额充裕 · 允许多终端并网'
            )
          ),

          // 指标 2：网络连通性与接入类型
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '校园网络环境'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(CheckCircleIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: '#10b981' } },
              '连通正常'
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              'SCU-Wireless / 宿舍有线千兆'
            )
          )
        ),

        // 在线终端设备列表 (纯白极简规范)
        h('div', {
          style: {
            ...S.card,
            padding: '20px 24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '20px',
          }
        },
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(LaptopIcon, { size: 15 }),
              h('span', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '当前在线终端清单')
            ),
            h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
              `共 ${netData?.devices?.length || 0} 台设备连接中`
            )
          ),

          // 设备列表渲染
          loading && !netData?.devices?.length ? (
            h('div', { style: { textAlign: 'center', padding: '30px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } },
              '正在检测当前在线终端...'
            )
          ) : (!netData?.devices || netData.devices.length === 0) ? (
            h('div', { style: { textAlign: 'center', padding: '30px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } },
              '当前未检测到在线终端设备'
            )
          ) : (
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
              netData.devices.map((dev, idx) => {
                const isOperating = offlineLoadingId === dev.deviceId
                return h('div', {
                  key: dev.deviceId || idx,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.06))',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }
                },
                  // 左侧终端真实 MAC 与 IP
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                    h('div', {
                      style: {
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.08))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }
                    }, h(WifiIcon, { size: 16 })),
                    h('div', null,
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                        h('span', { style: { fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: 'var(--dsw-alias-text, inherit)' } }, dev.mac || dev.deviceId || '未知 MAC'),
                        h('span', {
                          style: {
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.08)',
                            color: '#10b981',
                            fontWeight: 500,
                          }
                        }, '在线中')
                      ),
                      h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '3px', display: 'flex', gap: '12px', fontFamily: 'monospace' } },
                        h('span', null, `IP: ${dev.ip || '--'}`)
                      )
                    )
                  ),

                  // 右侧强制下线操作按钮
                  h('button', {
                    style: {
                      ...S.btnSecondary,
                      padding: '5px 14px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.25)',
                      background: 'rgba(239, 68, 68, 0.04)',
                      cursor: isOperating ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                    },
                    disabled: isOperating,
                    onClick: () => handleOffline(dev),
                  }, isOperating ? '正在下线...' : '强制下线')
                )
              })
            )
          )
        ),

        // 极简说明卡片
        h('div', {
          style: {
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
            fontSize: '11px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }
        },
          h('span', null, '提示：四川大学校园网每账号最多支持 2 台设备同时在线，超额时可点击【强制下线】释放名额。')
        )
      )
    }

    // ================== 微服务子页面：校园交通车 / 校车时刻表 (纯白极简风格) ==================
    function BusDetailView({ onRequireLogin, onBack }) {
      const [busData, setBusData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [errorMsg, setErrorMsg] = useState('')
      const [activeRouteId, setActiveRouteId] = useState('ja_wj')
      const [showImgModal, setShowImgModal] = useState(false)
      const [selectedImgUrl, setSelectedImgUrl] = useState('')

      const fetchSchedule = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)
        setErrorMsg('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/bus/schedule`)
          if (resp.status === 401) return onRequireLogin()
          const d = await resp.json()
          if (!resp.ok) throw new Error(d.detail || '获取时刻表失败')
          setBusData(d)
        } catch (e) {
          setErrorMsg(e.message || '网络连接异常')
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        fetchSchedule(false)
      }, [fetchSchedule])

      const curRoute = busData?.routes?.find(r => r.id === activeRouteId) || busData?.routes?.[0]
      const timetable = curRoute?.timetable || []
      const curTime = busData?.currentTime || ''

      return h('div', null,
        // 顶部导航行
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: onBack,
            },
              h(ArrowLeftIcon, { size: 14 }),
              '返回微服务大厅'
            ),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, '校园交通车时刻'),
                h('span', {
                  style: {
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontWeight: 500,
                  }
                }, `● ${busData?.dayTypeText || '班次查询'}`)
              )
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: () => fetchSchedule(true),
              disabled: refreshing || loading,
            },
              h(RefreshIcon, { size: 13, style: { animation: refreshing ? 'spin 1s linear infinite' : 'none' } }),
              refreshing ? '正在刷新...' : '刷新时刻'
            )
          )
        ),

        // 异常提示
        errorMsg && h('div', {
          style: {
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            fontSize: '12px',
          }
        }, errorMsg),

        // 纯白极简 下一班发车高能提醒大卡片
        h('div', {
          style: {
            ...S.card,
            padding: '22px 24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
            h('div', {
              style: {
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.08)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }
            }, h(TruckIcon, { size: 24 })),
            h('div', null,
              h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                `当前时间: ${curTime || '--:--'} · ${busData?.dayTypeText || '正常班次'}`
              ),
              h('div', { style: { fontSize: '24px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
                busData?.nextBus ? `下一班校车: ${busData.nextBus}` : (loading ? '正在计算班次...' : '今日计划班次已全部发完')
              ),
              h('div', { style: { fontSize: '12px', color: '#10b981', marginTop: '2px', fontWeight: 500 } },
                busData?.countdownMinutes !== null && busData?.countdownMinutes !== undefined
                  ? `预计距发车还有约 ${busData.countdownMinutes} 分钟，请提前前往乘车点候车`
                  : '夜间停运期间请搭乘公共交通或网约车'
              )
            )
          ),
          h('div', { style: { display: 'flex', gap: '10px' } },
            h('button', {
              type: 'button',
              style: { ...S.btnSecondary, padding: '7px 14px', fontSize: '12px', borderRadius: '8px' },
              onClick: () => {
                setSelectedImgUrl('https://imgwfw.scu.edu.cn/image/29/ef9048ef8a77ad8544b40f7317d4a4ec.png')
                setShowImgModal(true)
              }
            }, '查看官方时刻表原图 ↗')
          )
        ),

        // 路线切换 Segment Tabs
        h('div', {
          style: {
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }
        },
          (busData?.routes || []).map(r => {
            const isSel = activeRouteId === r.id
            return h('button', {
              key: r.id,
              type: 'button',
              style: {
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isSel ? 600 : 400,
                border: isSel ? '1px solid var(--dsw-alias-text, #000000)' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                background: isSel ? 'var(--dsw-alias-text, #000000)' : 'var(--dsw-alias-bg-card, #ffffff)',
                color: isSel ? 'var(--dsw-alias-bg, #ffffff)' : 'var(--dsw-alias-text, inherit)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              },
              onClick: () => setActiveRouteId(r.id),
            }, r.name)
          })
        ),

        // 线路发车地点与乘车须知信息条
        curRoute && h('div', {
          style: {
            padding: '12px 18px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
            marginBottom: '18px',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }
        },
          h('div', null,
            h('span', { style: { color: 'var(--dsw-alias-text-sub, #71717a)' } }, '📍 发车站点: '),
            h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } }, curRoute.station)
          ),
          h('div', null,
            h('span', { style: { color: 'var(--dsw-alias-text-sub, #71717a)' } }, '💳 票价标准: '),
            h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } }, curRoute.price)
          )
        ),

        // 班次时刻时间轴排布卡片
        h('div', {
          style: {
            ...S.card,
            padding: '20px 24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '20px',
          }
        },
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
            }
          },
            h('div', { style: { fontWeight: 600, fontSize: '14px', color: 'var(--dsw-alias-text, inherit)' } },
              `全日发车班次列表 (${timetable.length} 班次)`
            ),
            h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
              '高亮绿色边框为即将发车班次'
            )
          ),

          // 班次卡片网格
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '10px',
            }
          },
            timetable.map((timeStr, idx) => {
              const isPast = curTime && timeStr < curTime
              const isNext = timeStr === busData?.nextBus
              return h('div', {
                key: idx,
                style: {
                  padding: '10px 8px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  background: isNext
                    ? 'rgba(16, 185, 129, 0.08)'
                    : isPast
                    ? 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))'
                    : 'var(--dsw-alias-bg-card, #ffffff)',
                  border: isNext
                    ? '1.5px solid #10b981'
                    : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                  color: isPast ? 'var(--dsw-alias-text-sub, #a1a1aa)' : 'var(--dsw-alias-text, inherit)',
                  transition: 'all 0.15s ease',
                }
              },
                h('div', {
                  style: {
                    fontSize: '16px',
                    fontWeight: isNext ? 700 : (isPast ? 400 : 600),
                    color: isNext ? '#10b981' : 'inherit',
                  }
                }, timeStr),
                h('div', { style: { fontSize: '10px', marginTop: '2px', color: isNext ? '#10b981' : 'var(--dsw-alias-text-sub, #71717a)' } },
                  isNext ? '● 下一班' : (isPast ? '已发车' : `第 ${idx + 1} 班`)
                )
              )
            })
          )
        ),

        // 纯白极简 乘车提示卡片
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            fontSize: '12px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            lineHeight: 1.6,
          }
        },
          h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-text, inherit)', marginBottom: '4px' } }, '💡 校园班车乘车温馨提示'),
          h('div', null, '1. 乘车刷卡：请佩戴口罩，持本人校园一卡通在车载刷卡机贴卡或使用微信/支付宝乘车码结算；学生优惠票价 4 元/人次。'),
          h('div', null, '2. 早晚高峰加班：早晨 07:30~08:30 及下午 17:00~18:00 高峰期，后勤将视现场排队候车人数滚动加开班次，坐满即走。'),
          h('div', null, '3. 校车调度咨询：如遇大雾、交通拥堵等特殊情况，请致电后勤保障部交通运输服务中心咨询电话：028-85401111。')
        ),

        // 官方图片预览弹窗
        showImgModal && h('div', {
          style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          },
          onClick: () => setShowImgModal(false)
        },
          h('div', {
            style: {
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '800px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            },
            onClick: e => e.stopPropagation()
          },
            h('div', { style: { padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' } },
              h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '四川大学校园交通车官方时刻表原图'),
              h('button', { style: { border: 'none', background: 'transparent', cursor: 'pointer' }, onClick: () => setShowImgModal(false) }, h(XIcon, { size: 16 }))
            ),
            h('div', { style: { overflowY: 'auto', padding: '16px', textAlign: 'center' } },
              h('img', { src: selectedImgUrl, style: { maxWidth: '100%', height: 'auto', borderRadius: '8px' }, alt: '时刻表原图' })
            )
          )
        )
      )
    }

    // ================== 微服务子页面：校园卡失物招领中心 (纯白极简风格) ==================
    function CardLostDetailView({ onRequireLogin, onBack }) {
      const [lostData, setLostData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [errorMsg, setErrorMsg] = useState('')
      const [searchQuery, setSearchQuery] = useState('')
      const [searchResult, setSearchResult] = useState(null)

      const fetchLostCards = useCallback(async (isRefresh = false, queryId = '') => {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)
        setErrorMsg('')
        try {
          const p = queryId ? `?student_id=${encodeURIComponent(queryId)}` : ''
          const resp = await fetch(`${SERVICE_URL}/api/wfw/card/lost_found${p}`)
          if (resp.status === 401) return onRequireLogin()
          const d = await resp.json()
          if (!resp.ok) throw new Error(d.detail || '拉取失物招领失败')
          setLostData(d)
        } catch (e) {
          setErrorMsg(e.message || '网络连接异常')
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        fetchLostCards(false)
      }, [fetchLostCards])

      const handleDoSearch = () => {
        const q = searchQuery.trim()
        if (!q) {
          setSearchResult(null)
          return
        }
        const records = lostData?.records || []
        const matched = records.find(r => r.cardno === q)
        if (matched) {
          setSearchResult({ found: true, record: matched })
        } else {
          setSearchResult({ found: false, query: q })
        }
      }

      return h('div', null,
        // 顶部导航行
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: onBack,
            },
              h(ArrowLeftIcon, { size: 14 }),
              '返回微服务大厅'
            ),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, '校园卡失物招领'),
                h('span', {
                  style: {
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontWeight: 500,
                  }
                }, '● 拾得登记')
              )
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: () => fetchLostCards(true),
              disabled: refreshing || loading,
            },
              h(RefreshIcon, { size: 13, style: { animation: refreshing ? 'spin 1s linear infinite' : 'none' } }),
              refreshing ? '正在刷新...' : '刷新招领'
            )
          )
        ),

        // 本人卡片安全排查结果状态大横幅 (纯白极简规范)
        h('div', {
          style: {
            ...S.card,
            padding: '20px 24px',
            borderRadius: '12px',
            background: lostData?.isSafe === false ? 'rgba(239, 68, 68, 0.05)' : 'var(--dsw-alias-bg-card, #ffffff)',
            border: lostData?.isSafe === false ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
            h('div', {
              style: {
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: lostData?.isSafe === false ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.08)',
                color: lostData?.isSafe === false ? '#ef4444' : '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }
            }, h(lostData?.isSafe === false ? ShieldIcon : CheckCircleIcon, { size: 22 })),
            h('div', null,
              h('div', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } },
                lostData?.isSafe === false ? '⚠️ 检测到您的校园卡已被拾得登记！' : '✅ 本人校园卡状态安全'
              ),
              h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                lostData?.tip || '自动比对学号 2024141470117'
              )
            )
          ),
          h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
            `全校在录件数: `,
            h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } }, `${lostData?.totalCount || 0} 件`)
          )
        ),

        // 学号自定义搜索栏 (纯白极简)
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' } },
            h(SearchIcon, { size: 16 }),
            h('input', {
              type: 'text',
              placeholder: '输入指定同学的学号进行失物招领匹配排查...',
              value: searchQuery,
              onChange: e => setSearchQuery(e.target.value),
              onKeyDown: e => { if (e.key === 'Enter') handleDoSearch() },
              style: {
                ...S.input,
                border: 'none',
                background: 'transparent',
                padding: '4px 0',
                width: '100%',
                fontSize: '13px',
                outline: 'none',
              }
            })
          ),
          h('button', {
            type: 'button',
            style: { ...S.btnPrimary, padding: '6px 16px', fontSize: '12px', borderRadius: '6px' },
            onClick: handleDoSearch,
          }, '检索学号')
        ),

        // 检索结果展示 (若有)
        searchResult && h('div', {
          style: {
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '18px',
            background: searchResult.found ? 'rgba(16, 185, 129, 0.08)' : 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
            border: `1px solid ${searchResult.found ? 'rgba(16, 185, 129, 0.2)' : 'var(--dsw-alias-border, rgba(125, 125, 125, 0.1))'}`,
            fontSize: '12px',
          }
        },
          searchResult.found ? (
            h('div', null,
              h('div', { style: { fontWeight: 600, color: '#10b981', marginBottom: '4px' } },
                `🎉 匹配成功！学号 ${searchResult.record.cardno} 已被登记拾得：`
              ),
              h('div', null, `捡拾地点/存放位置: ${searchResult.record.addr}`),
              h('div', { style: { color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                `登记日期: ${searchResult.record.date}`
              )
            )
          ) : (
            h('div', { style: { color: 'var(--dsw-alias-text-sub, #71717a)' } },
              `未在失物招领列表中检索到学号 ${searchResult.query} 的卡片登记记录。`
            )
          )
        ),

        // 全校最新失物招领记录列表
        h('div', {
          style: {
            ...S.card,
            padding: '20px 24px',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            marginBottom: '20px',
          }
        },
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
            }
          },
            h('div', { style: { fontWeight: 600, fontSize: '14px', color: 'var(--dsw-alias-text, inherit)' } },
              '全校近期拾获一卡通登记记录'
            ),
            h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
              '卡号中间已作脱敏保护'
            )
          ),

          loading && !lostData?.records?.length ? (
            h('div', { style: { textAlign: 'center', padding: '30px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } },
              '正在加载全校失物招领数据...'
            )
          ) : (!lostData?.records || lostData.records.length === 0) ? (
            h('div', { style: { textAlign: 'center', padding: '30px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } },
              '近期暂无新拾获的一卡通招领记录'
            )
          ) : (
            h('div', {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '400px',
                overflowY: 'auto',
              }
            },
              lostData.records.map((it, idx) => h('div', {
                key: it.id || idx,
                style: {
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }
              },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  h('div', {
                    style: {
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      background: 'rgba(59, 130, 246, 0.08)',
                      color: '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }
                  }, h(CreditCardIcon, { size: 14 })),
                  h('div', null,
                    h('div', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } },
                      `卡号: ${it.maskedCardno}`
                    ),
                    h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                      `📍 拾获存放位置: ${it.addr}`
                    )
                  )
                ),
                h('div', { style: { textAlign: 'right' } },
                  h('span', {
                    style: {
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                    }
                  }, it.date)
                )
              ))
            )
          )
        ),

        // 线下认领服务大厅网点卡片
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            fontSize: '12px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            lineHeight: 1.6,
          }
        },
          h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-text, inherit)', marginBottom: '4px' } }, '💡 校园卡失物认领指引'),
          h('div', null, '1. 携带有效证件：如确认为本人遗失校园卡，请携带学生证或身份证等有效证明材料前往指定存放点认领。'),
          h('div', null, '2. 常见认领窗口：江安校区青春广场一卡通大厅失物招领处、望江校区基础教学楼一卡通服务大厅、华西校区西区活动中心。'),
          h('div', null, '3. 拾获上交：若拾得他人一卡通，可就近交至各食堂前台、教学楼值班保安室或一卡通服务大厅。')
        )
      )
    }

    // ================== 微服务子页面：我的图书馆借阅看板 (纯白极简风格) ==================
    function LibraryDetailView({ onRequireLogin, onBack }) {
      const [libData, setLibData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [errorMsg, setErrorMsg] = useState('')

      const fetchLibrary = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)
        setErrorMsg('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/library/status${isRefresh ? '?refresh=true' : ''}`)
          if (resp.status === 401) return onRequireLogin()
          const d = await resp.json()
          if (!resp.ok) throw new Error(d.detail || '获取图书馆信息失败')
          setLibData(d)
        } catch (e) {
          setErrorMsg(e.message || '网络连接异常')
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        fetchLibrary(false)
      }, [fetchLibrary])

      return h('div', null,
        // 顶部导航行
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: onBack,
            },
              h(ArrowLeftIcon, { size: 14 }),
              '返回微服务大厅'
            ),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, '我的图书馆'),
                h('span', {
                  style: {
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontWeight: 500,
                  }
                }, `● 读者证 ${libData?.status || '正常'}`)
              )
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: () => fetchLibrary(true),
              disabled: refreshing || loading,
            },
              h(RefreshIcon, { size: 13, style: { animation: refreshing ? 'spin 1s linear infinite' : 'none' } }),
              refreshing ? '正在刷新...' : '刷新状态'
            )
          )
        ),

        // 异常提示
        errorMsg && h('div', {
          style: {
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            fontSize: '12px',
          }
        }, errorMsg),

        // 4 大纯白极简核心指标栅格卡片
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
          }
        },
          // 指标 1：读者证状态
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '读者证状态'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(CheckCircleIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: '#10b981' } },
              libData?.status || (loading ? '...' : '正常')
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              `读者证号: ${libData?.readerNo || '--'}`
            )
          ),

          // 指标 2：当前在借图书
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '当前在借册数'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(BookOpenIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              `${libData?.currentBorrowed !== undefined ? libData.currentBorrowed : 0} 册`
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              `最大可借上限: ${libData?.maxBorrowable || 30} 册`
            )
          ),

          // 指标 3：借阅欠费
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '逾期欠费金额'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(CreditCardIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              `¥ ${libData?.arrears !== undefined ? libData.arrears.toFixed(2) : '0.00'}`
            ),
            h('div', { style: { fontSize: '11px', color: '#10b981', marginTop: '4px' } },
              '无图书超期与滞纳金'
            )
          ),

          // 指标 4：累计借阅图书
          h('div', {
            style: {
              ...S.card,
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', fontWeight: 500 } }, '累计借阅总数'),
              h('div', {
                style: {
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(AwardIcon, { size: 14 }))
            ),
            h('div', { style: { fontSize: '26px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } },
              `${libData?.totalBorrowed !== undefined ? libData.totalBorrowed : 0} 册`
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
              `注册日期: ${libData?.registerDate || '--'}`
            )
          )
        ),

        // 快捷业务入口条 (馆藏图书检索 / 我的借阅历史)
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
          }
        },
          h('a', {
            href: libData?.searchUrl || 'https://wfw.scu.edu.cn/site/library/collection',
            target: '_blank',
            rel: 'noopener noreferrer',
            style: {
              ...S.card,
              padding: '16px 20px',
              borderRadius: '10px',
              textDecoration: 'none',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'border 0.15s ease',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
              h('div', {
                style: {
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  color: '#3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(SearchIcon, { size: 16 })),
              h('div', null,
                h('div', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '馆藏图书检索'),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                  '全校文理馆、工学馆、医学馆、江安馆藏书查询'
                )
              )
            ),
            h(ExternalLinkIcon, { size: 14, style: { color: 'var(--dsw-alias-text-sub, #71717a)' } })
          ),

          h('a', {
            href: libData?.historyUrl || 'https://wfw.scu.edu.cn/site/library/history',
            target: '_blank',
            rel: 'noopener noreferrer',
            style: {
              ...S.card,
              padding: '16px 20px',
              borderRadius: '10px',
              textDecoration: 'none',
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'border 0.15s ease',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
              h('div', {
                style: {
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(ListIcon, { size: 16 })),
              h('div', null,
                h('div', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, '我的借阅历史'),
                h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                  '个人借书记录归档与历史书单回顾'
                )
              )
            ),
            h(ExternalLinkIcon, { size: 14, style: { color: 'var(--dsw-alias-text-sub, #71717a)' } })
          )
        ),

        // 纯白极简 借阅规则说明卡片
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.03))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            fontSize: '12px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            lineHeight: 1.6,
          }
        },
          h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-text, inherit)', marginBottom: '4px' } }, '💡 四川大学图书馆借阅政策说明'),
          h('div', null, '1. 借书权限额度：全日制本科生可同时借阅中文、外文图书上限为 30 册，每册借期通常为 30 天。'),
          h('div', null, '2. 续借政策说明：在图书无其他读者预约的情况下，可登录“我的图书馆”在线续借 1 次，续借期从操作之日起顺延。'),
          h('div', null, '3. 超期与遗失：超期归还将暂停借书权限并按规定计收逾期违约金；如遇图书破损或遗失，请尽快前往各校区总服务台办理赔偿补书手续。')
        )
      )
    }

    // ================== 微服务子页面：全校微应用服务广场与全局搜索 (纯白极简风格) ==================
    function AppSquareDetailView({ onRequireLogin, onBack }) {
      const [squareData, setSquareData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [errorMsg, setErrorMsg] = useState('')
      const [searchKw, setSearchKw] = useState('')
      const [activeCategory, setActiveCategory] = useState('all')

      const fetchSquare = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)
        setErrorMsg('')
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/apps/all${isRefresh ? '?refresh=true' : ''}`)
          if (resp.status === 401) return onRequireLogin()
          const d = await resp.json()
          if (!resp.ok) throw new Error(d.detail || '拉取微应用广场失败')
          setSquareData(d)
        } catch (e) {
          setErrorMsg(e.message || '网络连接异常')
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      }, [onRequireLogin])

      useEffect(() => {
        fetchSquare(false)
      }, [fetchSquare])

      const allApps = squareData?.allApps || []
      const kw = searchKw.trim().toLowerCase()
      const filteredApps = allApps.filter(a => {
        const matchCat = activeCategory === 'all' || a.category === activeCategory
        const matchKw = !kw || a.name.toLowerCase().includes(kw) || a.category.toLowerCase().includes(kw)
        return matchCat && matchKw
      })

      const categories = [
        { key: 'all', label: `全部应用 (${allApps.length})` },
        ...(squareData?.categories || []).map(c => ({ key: c.name, label: `${c.name} (${c.count})` }))
      ]

      return h('div', null,
        // 顶部导航行
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: onBack,
            },
              h(ArrowLeftIcon, { size: 14 }),
              '返回微服务大厅'
            ),
            h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, '微应用服务广场'),
                h('span', {
                  style: {
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontWeight: 500,
                  }
                }, `共 ${allApps.length} 个应用`)
              )
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('button', {
              style: {
                ...S.btnSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '8px',
              },
              onClick: () => fetchSquare(true),
              disabled: refreshing || loading,
            },
              h(RefreshIcon, { size: 13, style: { animation: refreshing ? 'spin 1s linear infinite' : 'none' } }),
              refreshing ? '正在刷新...' : '刷新应用'
            )
          )
        ),

        // 即时全局搜索栏 (纯白极简规范)
        h('div', {
          style: {
            ...S.card,
            padding: '12px 18px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }
        },
          h(SearchIcon, { size: 16, style: { color: 'var(--dsw-alias-text-sub, #71717a)' } }),
          h('input', {
            type: 'text',
            placeholder: '输入应用名称或关键词实时过滤 (如: 校车, 场馆, 报修, 课表, 体测, 请假)...',
            value: searchKw,
            onChange: e => setSearchKw(e.target.value),
            style: {
              ...S.input,
              border: 'none',
              background: 'transparent',
              padding: '4px 0',
              width: '100%',
              fontSize: '13px',
              outline: 'none',
            }
          }),
          searchKw && h('button', {
            type: 'button',
            style: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)', padding: '2px' },
            onClick: () => setSearchKw('')
          }, h(XIcon, { size: 14 }))
        ),

        // 分类标签胶囊筛选栏
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '18px',
            overflowX: 'auto',
            paddingBottom: '4px',
          }
        },
          categories.map(cat => {
            const isSel = activeCategory === cat.key
            return h('button', {
              key: cat.key,
              type: 'button',
              style: {
                padding: '5px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: isSel ? 600 : 400,
                border: isSel ? '1px solid var(--dsw-alias-text, #000000)' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                background: isSel ? 'var(--dsw-alias-text, #000000)' : 'var(--dsw-alias-bg-card, #ffffff)',
                color: isSel ? 'var(--dsw-alias-bg, #ffffff)' : 'var(--dsw-alias-text-sub, #71717a)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              },
              onClick: () => setActiveCategory(cat.key),
            }, cat.label)
          })
        ),

        // 62+ 微应用响应式卡片网格
        loading && !allApps.length ? (
          h('div', { style: { textAlign: 'center', padding: '40px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } },
            '正在拉取四川大学全校微应用广场...'
          )
        ) : filteredApps.length === 0 ? (
          h('div', { style: { textAlign: 'center', padding: '40px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } },
            `未找到与 "${searchKw}" 匹配的微应用，请尝试其他关键词`
          )
        ) : (
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: '12px',
              marginBottom: '24px',
            }
          },
            filteredApps.map((app, idx) => h('a', {
              key: app.id || idx,
              href: app.link || 'https://wfw.scu.edu.cn',
              target: '_blank',
              rel: 'noopener noreferrer',
              style: {
                ...S.card,
                padding: '14px 16px',
                borderRadius: '10px',
                background: 'var(--dsw-alias-bg-card, #ffffff)',
                border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' } },
                h('div', {
                  style: {
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                  }
                },
                  app.icon ? h('img', { src: app.icon, style: { width: '22px', height: '22px', objectFit: 'contain' }, alt: '' }) : h(GridIcon, { size: 14 })
                ),
                h('div', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  h('div', {
                    style: {
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--dsw-alias-text, inherit)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }
                  }, app.name),
                  h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '2px' } },
                    app.category
                  )
                )
              ),
              h(ExternalLinkIcon, { size: 12, style: { color: 'var(--dsw-alias-text-sub, #71717a)', flexShrink: 0, marginLeft: '6px' } })
            ))
          )
        )
      )
    }

    // ================== 子页面 7：四川大学校园微服务大厅 (纯白极简卡片架构) ==================
    const ELE_CACHE_EXPIRE_MS = 60 * 60 * 1000 // 1 小时自动缓存有效周期

    function ServicesView({ onRequireLogin }) {
      const [subView, setSubView] = useState('hub') // 'hub' | 'electricity' | 'card' | 'network' | 'bus' | 'lostfound' | 'library' | 'apps'
      const [activeCategory, setActiveCategory] = useState('all') // 'all' | 'life' | 'network' | 'public'
      const [activeModalApp, setActiveModalApp] = useState(null)
      const [hoveredCardId, setHoveredCardId] = useState(null)

      // 1. 电费数据与 1 小时缓存管理器 (支持秒开与防抖刷新)
      const cachedEle = SCU_CACHE.get('electricity')
      const [eleData, setEleData] = useState(cachedEle?.data || null)
      const [lastUpdated, setLastUpdated] = useState(cachedEle?.updatedAt || '')
      const [eleLoading, setEleLoading] = useState(!cachedEle?.data)
      const [eleRefreshing, setEleRefreshing] = useState(false)
      const [eleError, setEleError] = useState('')

      const fetchElectricity = useCallback(async (force = false) => {
        const cache = SCU_CACHE.get('electricity')
        const now = Date.now()

        if (!force && cache?.data && (now - (cache.timestamp || 0) < ELE_CACHE_EXPIRE_MS)) {
          setEleData(cache.data)
          setLastUpdated(cache.updatedAt || '')
          setEleLoading(false)
          return
        }

        if (force) setEleRefreshing(true)
        else setEleLoading(true)
        setEleError('')

        try {
          const resp = await fetch(`${SERVICE_URL}/api/electricity/status`)
          if (resp.status === 401) {
            return onRequireLogin()
          }
          const d = await resp.json()
          if (!resp.ok) {
            throw new Error(d.detail || '获取电费信息失败')
          }
          setEleData(d)
          const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          setLastUpdated(timeStr)
          SCU_CACHE.set('electricity', d)
        } catch (err) {
          setEleError(err.message || '网络连接异常')
        } finally {
          setEleLoading(false)
          setEleRefreshing(false)
        }
      }, [onRequireLogin])

      // 2. 校园一卡通数据与 1 小时缓存管理器 (支持秒开与防抖刷新)
      const cachedCard = SCU_CACHE.get('wfw_card')
      const [cardData, setCardData] = useState(cachedCard?.data || null)
      const [cardLastUpdated, setCardLastUpdated] = useState(cachedCard?.updatedAt || '')
      const [cardLoading, setCardLoading] = useState(!cachedCard?.data)
      const [cardRefreshing, setCardRefreshing] = useState(false)
      const [cardError, setCardError] = useState('')

      const fetchCard = useCallback(async (force = false) => {
        const cache = SCU_CACHE.get('wfw_card')
        const now = Date.now()

        if (!force && cache?.data && (now - (cache.timestamp || 0) < ELE_CACHE_EXPIRE_MS)) {
          setCardData(cache.data)
          setCardLastUpdated(cache.updatedAt || '')
          setCardLoading(false)
          return
        }

        if (force) setCardRefreshing(true)
        else setCardLoading(true)
        setCardError('')

        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/card/status${force ? '?refresh=true' : ''}`)
          if (resp.status === 401) {
            return onRequireLogin()
          }
          const d = await resp.json()
          if (!resp.ok) {
            throw new Error(d.detail || '获取一卡通数据失败')
          }
          setCardData(d)
          const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          setCardLastUpdated(timeStr)
          SCU_CACHE.set('wfw_card', d)
        } catch (err) {
          setCardError(err.message || '网络连接异常')
        } finally {
          setCardLoading(false)
          setCardRefreshing(false)
        }
      }, [onRequireLogin])

      // 3. 校园网服务数据与 1 小时缓存管理器 (支持秒开与防抖刷新)
      const cachedNet = SCU_CACHE.get('wfw_network')
      const [netData, setNetData] = useState(cachedNet?.data || null)
      const [netLastUpdated, setNetLastUpdated] = useState(cachedNet?.updatedAt || '')
      const [netLoading, setNetLoading] = useState(!cachedNet?.data)
      const [netRefreshing, setNetRefreshing] = useState(false)
      const [netError, setNetError] = useState('')

      const fetchNetwork = useCallback(async (force = false) => {
        const cache = SCU_CACHE.get('wfw_network')
        const now = Date.now()

        if (!force && cache?.data && (now - (cache.timestamp || 0) < ELE_CACHE_EXPIRE_MS)) {
          setNetData(cache.data)
          setNetLastUpdated(cache.updatedAt || '')
          setNetLoading(false)
          return
        }

        if (force) setNetRefreshing(true)
        else setNetLoading(true)
        setNetError('')

        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/network/status${force ? '?refresh=true' : ''}`)
          if (resp.status === 401) {
            return onRequireLogin()
          }
          const d = await resp.json()
          if (!resp.ok) {
            throw new Error(d.detail || '获取校园网数据失败')
          }
          setNetData(d)
          const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          setNetLastUpdated(timeStr)
          SCU_CACHE.set('wfw_network', d)
        } catch (err) {
          setNetError(err.message || '网络连接异常')
        } finally {
          setNetLoading(false)
          setNetRefreshing(false)
        }
      }, [onRequireLogin])

      // 4. 校车运行时刻数据与缓存
      const cachedBus = SCU_CACHE.get('wfw_bus')
      const [busData, setBusData] = useState(cachedBus?.data || null)
      const fetchBus = useCallback(async () => {
        const cache = SCU_CACHE.get('wfw_bus')
        const now = Date.now()
        if (cache?.data && (now - (cache.timestamp || 0) < ELE_CACHE_EXPIRE_MS)) {
          setBusData(cache.data)
          return
        }
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/bus/schedule`)
          if (resp.ok) {
            const d = await resp.json()
            setBusData(d)
            SCU_CACHE.set('wfw_bus', d)
          }
        } catch (_) {}
      }, [])

      // 5. 校园卡失物招领数据与缓存
      const cachedLost = SCU_CACHE.get('wfw_lost')
      const [lostData, setLostData] = useState(cachedLost?.data || null)
      const fetchLost = useCallback(async () => {
        const cache = SCU_CACHE.get('wfw_lost')
        const now = Date.now()
        if (cache?.data && (now - (cache.timestamp || 0) < ELE_CACHE_EXPIRE_MS)) {
          setLostData(cache.data)
          return
        }
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/card/lost_found`)
          if (resp.ok) {
            const d = await resp.json()
            setLostData(d)
            SCU_CACHE.set('wfw_lost', d)
          }
        } catch (_) {}
      }, [])

      // 6. 图书馆读者证数据与缓存
      const cachedLib = SCU_CACHE.get('wfw_lib')
      const [libData, setLibData] = useState(cachedLib?.data || null)
      const fetchLib = useCallback(async () => {
        const cache = SCU_CACHE.get('wfw_lib')
        const now = Date.now()
        if (cache?.data && (now - (cache.timestamp || 0) < ELE_CACHE_EXPIRE_MS)) {
          setLibData(cache.data)
          return
        }
        try {
          const resp = await fetch(`${SERVICE_URL}/api/wfw/library/status`)
          if (resp.ok) {
            const d = await resp.json()
            setLibData(d)
            SCU_CACHE.set('wfw_lib', d)
          }
        } catch (_) {}
      }, [])

      // 远程下线终端设备操作
      const handleOfflineDevice = useCallback(async (deviceId, ip) => {
        const resp = await fetch(`${SERVICE_URL}/api/wfw/network/offline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, ip: ip || '' })
        })
        const res = await resp.json()
        if (!resp.ok) {
          throw new Error(res.detail || res.message || '下线操作失败')
        }
        // 下线成功后强制刷新设备列表
        await fetchNetwork(true)
      }, [fetchNetwork])

      // 挂载时检查：仅在无缓存或已超 1 小时时静默拉取微服务数据
      useEffect(() => {
        fetchElectricity(false)
        fetchCard(false)
        fetchNetwork(false)
        fetchBus()
        fetchLost()
        fetchLib()

        // 定时检测：每 10 分钟检测一次，若自然过去超过 1 小时则自动静默刷新一次
        const timer = setInterval(() => {
          fetchElectricity(false)
          fetchCard(false)
          fetchNetwork(false)
          fetchBus()
          fetchLost()
          fetchLib()
        }, 10 * 60 * 1000)

        return () => clearInterval(timer)
      }, [fetchElectricity, fetchCard, fetchNetwork, fetchBus, fetchLost, fetchLib])

      // 若当前进入子页面（电费详情 / 一卡通详情 / 校园网详情 / 校车时刻 / 失物招领 / 图书馆 / 微应用广场）
      if (subView === 'electricity') {
        return h(ElectricityDetailView, {
          onRequireLogin,
          onBack: () => setSubView('hub'),
          eleData,
          loading: eleLoading,
          refreshing: eleRefreshing,
          lastUpdated,
          errorMsg: eleError,
          onRefresh: () => fetchElectricity(true),
        })
      }
      if (subView === 'card') {
        return h(CardDetailView, {
          onRequireLogin,
          onBack: () => setSubView('hub'),
          cardData,
          loading: cardLoading,
          refreshing: cardRefreshing,
          lastUpdated: cardLastUpdated,
          errorMsg: cardError,
          onRefresh: () => fetchCard(true),
        })
      }
      if (subView === 'network') {
        return h(NetworkDetailView, {
          onRequireLogin,
          onBack: () => setSubView('hub'),
          netData,
          loading: netLoading,
          refreshing: netRefreshing,
          lastUpdated: netLastUpdated,
          errorMsg: netError,
          onRefresh: () => fetchNetwork(true),
          onOfflineDevice: handleOfflineDevice,
        })
      }
      if (subView === 'bus') {
        return h(BusDetailView, {
          onRequireLogin,
          onBack: () => setSubView('hub'),
        })
      }
      if (subView === 'lostfound') {
        return h(CardLostDetailView, {
          onRequireLogin,
          onBack: () => setSubView('hub'),
        })
      }
      if (subView === 'library') {
        return h(LibraryDetailView, {
          onRequireLogin,
          onBack: () => setSubView('hub'),
        })
      }
      if (subView === 'apps') {
        return h(AppSquareDetailView, {
          onRequireLogin,
          onBack: () => setSubView('hub'),
        })
      }

      // 过滤分类应用
      const filteredServices = MICRO_SERVICES_CATALOG.filter(item => {
        if (activeCategory === 'all') return true
        return item.category === activeCategory
      })

      // 分类筛选列表
      const categories = [
        { key: 'all', label: '全部服务 (7)' },
        { key: 'life', label: '校园生活 (3)' },
        { key: 'network', label: '网络信息化 (1)' },
        { key: 'public', label: '综合便民 (3)' },
      ]

      return h('div', null,
        // 微服务大厅顶部概览条
        h('div', {
          style: {
            ...S.card,
            padding: '16px 20px',
            borderRadius: '12px',
            marginBottom: '18px',
            background: 'var(--dsw-alias-bg-card, #ffffff)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }
        },
          h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('div', {
                style: {
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              }, h(GridIcon, { size: 16 })),
              h('span', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--dsw-alias-text, inherit)' } }, '校园微服务大厅')
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', {
              style: {
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '12px',
                fontWeight: 500,
                background: 'rgba(16, 185, 129, 0.08)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }
            },
              h('span', { style: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' } }),
              '统一认证 SSO 已就绪'
            )
          )
        ),

        // 分类标签胶囊筛选栏
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '18px',
            overflowX: 'auto',
            paddingBottom: '4px',
          }
        },
          categories.map(cat => {
            const isSelected = activeCategory === cat.key
            return h('button', {
              key: cat.key,
              style: {
                padding: '5px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer',
                background: isSelected ? 'var(--dsw-alias-text, #18181b)' : 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
                color: isSelected ? 'var(--dsw-alias-bg, #ffffff)' : 'var(--dsw-alias-text, inherit)',
                border: isSelected ? '1px solid transparent' : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              },
              onClick: () => setActiveCategory(cat.key),
            }, cat.label)
          })
        ),

        // 核心微服务卡片网格
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }
        },
          filteredServices.map(srv => {
            const isEle = srv.id === 'electricity'
            const isCard = srv.id === 'card'
            const isNet = srv.id === 'network'
            const isOnline = srv.status === 'online'
            const isHovered = hoveredCardId === srv.id
            const IconComp = srv.icon

            // 底部操作文案
            let bottomActionText = '查看微服务详情'
            if (isEle) bottomActionText = '查看耗电走势折线图与购电'
            else if (isCard) bottomActionText = '进入智能记账大盘与备注'
            else if (isNet) bottomActionText = '管理在线终端与网络'
            else if (srv.id === 'bus') bottomActionText = '查看校车时刻与下一班'
            else if (srv.id === 'lostfound') bottomActionText = '排查本人卡片与招领'
            else if (srv.id === 'library') bottomActionText = '查看读者证与借阅额度'
            else if (srv.id === 'apps') bottomActionText = '浏览 62+ 全校微应用'
            else if (srv.id === 'sports') bottomActionText = '直达场馆预约平台'
            else if (srv.id === 'repairs') bottomActionText = '直达后勤微报修'

            return h('div', {
              key: srv.id,
              style: {
                ...S.card,
                padding: '20px',
                borderRadius: '12px',
                background: 'var(--dsw-alias-bg-card, #ffffff)',
                border: isHovered
                  ? '1px solid var(--dsw-alias-text, rgba(0, 0, 0, 0.3))'
                  : '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                boxShadow: isHovered
                  ? '0 6px 18px rgba(0, 0, 0, 0.06)'
                  : '0 2px 8px rgba(0, 0, 0, 0.02)',
                transform: isHovered ? 'translateY(-2px)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '210px',
              },
              onMouseEnter: () => setHoveredCardId(srv.id),
              onMouseLeave: () => setHoveredCardId(null),
              onClick: () => {
                if (isEle) {
                  setSubView('electricity')
                } else if (isCard) {
                  setSubView('card')
                } else if (isNet) {
                  setSubView('network')
                } else if (srv.id === 'bus') {
                  setSubView('bus')
                } else if (srv.id === 'lostfound') {
                  setSubView('lostfound')
                } else if (srv.id === 'library') {
                  setSubView('library')
                } else if (srv.id === 'apps') {
                  setSubView('apps')
                } else if (srv.url) {
                  window.open(srv.url, '_blank')
                } else {
                  setActiveModalApp(srv)
                }
              }
            },
              // 卡片上半部
              h('div', null,
                // 标头行：图标、名称与状态徽章
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                    h('div', {
                      style: {
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: isOnline ? 'rgba(16, 185, 129, 0.08)' : 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                        color: isOnline ? '#10b981' : 'var(--dsw-alias-text, inherit)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                    }, h(IconComp, { size: 18 })),
                    h('div', null,
                      h('div', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-text, inherit)' } }, srv.name),
                      h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, srv.categoryLabel)
                    )
                  ),
                  h('span', {
                    style: {
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 500,
                      background: srv.badgeBg,
                      color: srv.badgeColor,
                      border: `1px solid ${srv.badgeBorder}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }
                  },
                    h('span', { style: { display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: srv.badgeColor } }),
                    srv.statusText
                  )
                ),

                // 描述
                h('p', {
                  style: {
                    fontSize: '12px',
                    color: 'var(--dsw-alias-text-sub, #71717a)',
                    lineHeight: 1.5,
                    margin: '0 0 14px 0',
                  }
                }, srv.desc),

                // 1. 电费专属微缩概览指标
                isEle && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(MapPinIcon, { size: 12 }),
                      eleData?.roomDisplay || (eleLoading ? '正在同步宿舍...' : '已绑定宿舍')
                    ),
                    eleData?.air?.balance !== undefined && eleData?.light?.balance !== undefined && (
                      (eleData.air.balance < 10 || eleData.light.balance < 10)
                        ? h('span', { style: { fontSize: '10px', color: '#ef4444', fontWeight: 600 } }, '⚠️ 电量偏低')
                        : h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, '● 电量充足')
                    )
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, `空调: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        eleData?.air?.balance !== undefined ? `${eleData.air.balance.toFixed(2)} 度` : (eleLoading ? '...' : '--')
                      )
                    ),
                    h('span', null, `照明: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        eleData?.light?.balance !== undefined ? `${eleData.light.balance.toFixed(2)} 度` : (eleLoading ? '...' : '--')
                      )
                    )
                  ),
                  lastUpdated && h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, `最近抄表: ${lastUpdated}`),
                    eleRefreshing ? h('span', { style: { color: 'var(--dsw-alias-text, inherit)', fontWeight: 500 } }, '正在同步最新度数...') : h('span', null, '1小时自动校验')
                  )
                ),

                // 2. 校园一卡通专属微缩概览指标
                isCard && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(CreditCardIcon, { size: 12 }),
                      cardData?.records?.[0]?.merchant ? `最新: ${cardData.records[0].merchant.split(' · ')[0]}` : '实体一卡通芯片'
                    ),
                    h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, '● 正常使用')
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, `物理余额: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        cardData?.balance !== undefined ? `¥ ${cardData.balance}` : (cardLoading ? '...' : '--')
                      )
                    ),
                    h('span', null, `今日支出: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        cardData?.todaySpent !== undefined ? `¥ ${cardData.todaySpent.toFixed(2)}` : (cardLoading ? '...' : '--')
                      )
                    )
                  ),
                  cardLastUpdated && h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, `最近同步: ${cardLastUpdated}`),
                    cardRefreshing ? h('span', { style: { color: 'var(--dsw-alias-text, inherit)', fontWeight: 500 } }, '正在同步流水...') : h('span', null, '1小时自动校验')
                  )
                ),

                // 3. 校园网服务专属微缩概览指标
                isNet && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(WifiIcon, { size: 12 }),
                      'SCU-Wireless / 宿舍千兆'
                    ),
                    netData?.deviceCount >= (netData?.maxDevices || 3)
                      ? h('span', { style: { fontSize: '10px', color: '#ef4444', fontWeight: 600 } }, '⚠️ 连接已满 (3/3)')
                      : h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, '● 配额充裕')
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, `在线终端: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        netData?.deviceCount !== undefined ? `${netData.deviceCount} / ${netData.maxDevices || 3} 台` : (netLoading ? '...' : '--')
                      )
                    ),
                    h('span', null, `主终端IP: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        netData?.devices?.[0]?.ip || (netLoading ? '...' : '--')
                      )
                    )
                  ),
                  netLastUpdated && h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, `最近检测: ${netLastUpdated}`),
                    netRefreshing ? h('span', { style: { color: 'var(--dsw-alias-text, inherit)', fontWeight: 500 } }, '正在刷新设备...') : h('span', null, '可远程一键踢出')
                  )
                ),

                // 4. 校车运行时刻专属微缩概览指标
                srv.id === 'bus' && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(TruckIcon, { size: 12 }),
                      busData?.routes?.[0]?.nextBus ? `下一班: ${busData.routes[0].nextBus.time}` : '望江 ⇄ 江安 ⇄ 华西'
                    ),
                    h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, `● ${busData?.dayTypeText || '工作日'}`)
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, `最近发车: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        busData?.routes?.[0]?.nextBus ? (busData.routes[0].nextBus.diffMinutes > 0 ? `约 ${busData.routes[0].nextBus.diffMinutes} 分钟后` : '即将发车') : '按时刻表发车'
                      )
                    ),
                    h('span', null, `运行区间: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } }, '07:15 - 22:30')
                    )
                  ),
                  h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, '后勤保障部官方时刻表'),
                    h('span', null, '点进查看原图与多路线')
                  )
                ),

                // 5. 校园卡失物招领专属微缩概览指标
                srv.id === 'lostfound' && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(SearchIcon, { size: 12 }),
                      '本人学号安全体检'
                    ),
                    h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, '● 状态正常')
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, `本人卡片: `,
                      h('strong', { style: { color: '#10b981' } },
                        lostData?.myStatus?.isFound ? '⚠️ 被人拾获' : '未见丢失登记'
                      )
                    ),
                    h('span', null, `全校公示: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        lostData?.totalCount !== undefined ? `${lostData.totalCount} 张待认领` : '实时同步中...'
                      )
                    )
                  ),
                  h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, '服务大厅: 青春广场 / 基教'),
                    h('span', null, '支持任意学号快速自查')
                  )
                ),

                // 6. 图书馆专属微缩概览指标
                srv.id === 'library' && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(LibraryIcon, { size: 12 }),
                      libData?.readerId ? `读者证: ${libData.readerId}` : '四川大学图书馆'
                    ),
                    h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, `● ${libData?.status || '证件正常'}`)
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, `在借图书: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        libData?.borrowCount !== undefined ? `${libData.borrowCount} / ${libData.maxBorrow || 30} 册` : '0 / 30 册'
                      )
                    ),
                    h('span', null, `借阅欠费: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } },
                        libData?.arrears !== undefined ? `¥ ${libData.arrears.toFixed(2)}` : '¥ 0.00'
                      )
                    )
                  ),
                  h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, '本科生可借 30 册 / 30 天'),
                    h('span', null, '馆藏检索与借阅直达')
                  )
                ),

                // 7. 微应用服务广场专属微缩概览指标
                srv.id === 'apps' && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(GridIcon, { size: 12 }),
                      '四川大学官方微服务平台'
                    ),
                    h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, '● 全量聚合')
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, `收录应用: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } }, '62+ 全校服务')
                    ),
                    h('span', null, `覆盖板块: `,
                      h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } }, '9 大核心分类')
                    )
                  ),
                  h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, '支持毫秒级全局即输即搜'),
                    h('span', null, '免密跳转官方各大子系统')
                  )
                ),

                // 8. 快捷直达微服务概览（体育场馆、后勤报修）
                (srv.id === 'sports' || srv.id === 'repairs') && h('div', {
                  style: {
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                    border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                    marginBottom: '14px',
                    fontSize: '12px',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 } },
                      h(srv.icon, { size: 12 }),
                      srv.id === 'sports' ? '三校区场馆中心' : '智慧后勤微服务'
                    ),
                    h('span', { style: { fontSize: '10px', color: '#10b981', fontWeight: 500 } }, '● 官方直连')
                  ),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    h('span', null, srv.id === 'sports' ? '支持羽毛球/网球/游泳馆' : '支持水电门窗空调极速报修'),
                    h('span', null, h('strong', { style: { color: 'var(--dsw-alias-text, inherit)' } }, '一键直达'))
                  ),
                  h('div', {
                    style: {
                      fontSize: '10px',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }
                  },
                    h('span', null, '统一身份认证免密进入'),
                    h('span', null, '在新窗口安全打开')
                  )
                ),

                // 9. 其它微服务亮点微标签 (兜底)
                !isOnline && h('div', {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginBottom: '14px',
                  }
                },
                  srv.features.slice(0, 2).map((feat, idx) => h('span', {
                    key: idx,
                    style: {
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
                      color: 'var(--dsw-alias-text-sub, #71717a)',
                      border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.06))',
                    }
                  }, feat.split('：')[0]))
                )
              ),

              // 卡片底部操作栏 (纯白极简)
              h('div', {
                style: {
                  paddingTop: '12px',
                  borderTop: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: isHovered ? 'var(--dsw-alias-text, inherit)' : 'var(--dsw-alias-text-sub, #71717a)',
                  fontWeight: 500,
                }
              },
                h('span', null, bottomActionText),
                h(ChevronRightIcon, { size: 14 })
              )
            )
          })
        ),

        // 规划中微服务详情说明弹窗 (纯白极简规范)
        activeModalApp && h('div', {
          style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          },
          onClick: () => setActiveModalApp(null),
        },
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-card, #ffffff)',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
            },
            onClick: (e) => e.stopPropagation(),
          },
            // 弹窗头部
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                h('div', {
                  style: {
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }
                }, h(activeModalApp.icon, { size: 18 })),
                h('div', null,
                  h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 600 } }, `${activeModalApp.name} (微服务)`),
                  h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                    `${activeModalApp.categoryLabel} · 规范对接中`
                  )
                )
              ),
              h('span', {
                style: {
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 500,
                  background: activeModalApp.badgeBg,
                  color: activeModalApp.badgeColor,
                  border: `1px solid ${activeModalApp.badgeBorder}`,
                }
              }, activeModalApp.statusText)
            ),

            // 业务描述
            h('p', {
              style: {
                fontSize: '13px',
                color: 'var(--dsw-alias-text-sub, #71717a)',
                lineHeight: 1.5,
                margin: '0 0 16px 0',
              }
            }, activeModalApp.desc),

            // 核心能力规划列表
            h('div', {
              style: {
                padding: '14px 16px',
                borderRadius: '8px',
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.08))',
                marginBottom: '20px',
              }
            },
              h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '8px' } }, '📋 核心业务能力与接入规划:'),
              h('ul', { style: { margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', lineHeight: 1.6 } },
                activeModalApp.features.map((feat, i) => h('li', { key: i, style: { marginBottom: '4px' } }, feat))
              )
            ),

            // 弹窗操作栏
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px' } },
              activeModalApp.url && h('a', {
                href: activeModalApp.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: {
                  ...S.btnSecondary,
                  padding: '7px 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  textDecoration: 'none',
                  fontSize: '12px',
                }
              },
                h(ExternalLinkIcon, { size: 13 }),
                '访问官方网页版'
              ),
              h('button', {
                type: 'button',
                style: { ...S.btnPrimary, padding: '7px 20px' },
                onClick: () => setActiveModalApp(null)
              }, '关闭')
            )
          )
        )
      )
    }

    // 保持对旧引用兼容
    const ElectricityView = ServicesView


    // ================== 子页面 7：选课与智能抢课 (极简莫兰迪风格，全自动后台并发与互斥备选) ==================
    function CourseGrabView({ onRequireLogin }) {
    // 选课阶段与搜索
    const [phases, setPhases] = useState([
      { id: 'PLAN', label: '培养方案选课', deal_type: 2 },
      { id: 'SCHOOL', label: '校级公选课', deal_type: 3 },
      { id: 'DEPART', label: '院系课程', deal_type: 4 },
      { id: 'FREE', label: '自由选课(补退选)', deal_type: 5 },
    ])
    const [selectedPhase, setSelectedPhase] = useState('FREE')
    const [keyword, setKeyword] = useState('')
    const [searching, setSearching] = useState(false)
    const [searchResults, setSearchResults] = useState([])
    const [searchMsg, setSearchMsg] = useState('')
    const [expandedCourseKey, setExpandedCourseKey] = useState(null)

    // 快速直添
    const [directCourseId, setDirectCourseId] = useState('')
    const [directSeqNo, setDirectSeqNo] = useState('')

    // 任务队列
    const [tasks, setTasks] = useState([])
    const [bannerMsg, setBannerMsg] = useState({ text: '', type: 'info' })

    // 运行状态与统计
    const [isRunning, setIsRunning] = useState(false)
    const [stats, setStats] = useState({
      duration: '--:--:--',
      total_attempts: 0,
      success_count: 0,
      failed_count: 0,
      waiting_count: 0,
    })
    const [actionLoading, setActionLoading] = useState(false)

    // 参数设置 Modal
    const [showSettings, setShowSettings] = useState(false)
    const [sleepTime, setSleepTime] = useState(1.0)
    const [sleepJitter, setSleepJitter] = useState(0.2)
    const [savingSettings, setSavingSettings] = useState(false)

    // 定时开抢状态与快捷键引用
    const [scheduledTime, setScheduledTime] = useState('')
    const [isScheduled, setIsScheduled] = useState(false)
    const [countdownText, setCountdownText] = useState('')
    const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
    const searchInputRef = useRef(null)

    // 实时日志
    const [logs, setLogs] = useState([])
    const [autoScroll, setAutoScroll] = useState(true)
    const [logFilter, setLogFilter] = useState('ALL')
    const lastLogIdRef = useRef(0)
    const logContainerRef = useRef(null)

    const notify = (text, type = 'info') => {
      setBannerMsg({ text, type })
      setTimeout(() => setBannerMsg({ text: '', type: 'info' }), 3000)
    }

    // 选课界面按 / 键自动聚焦搜索框
    useEffect(() => {
      const handleSlash = (e) => {
        if (e.key === '/') {
          const tag = e.target?.tagName?.toLowerCase()
          if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
            e.preventDefault()
            if (searchInputRef.current) {
              searchInputRef.current.focus()
            }
          }
        }
      }
      window.addEventListener('keydown', handleSlash)
      return () => window.removeEventListener('keydown', handleSlash)
    }, [])

    // 定时开抢倒计时动态计算
    useEffect(() => {
      if (!isScheduled || !scheduledTime) {
        setCountdownText('')
        return
      }

      const updateCountdown = () => {
        const now = new Date()
        let target = new Date()
        const parts = scheduledTime.trim().split(':')
        if (parts.length >= 2) {
          target.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || 0, 10), 0)
          if (target.getTime() <= now.getTime()) {
            if (now.getTime() - target.getTime() > 10000) {
              target.setDate(target.getDate() + 1)
            }
          }
        }

        const diffSec = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
        if (diffSec === 0) {
          setCountdownText('开抢时间已到达！系统正在出击')
        } else {
          const h = Math.floor(diffSec / 3600).toString().padStart(2, '0')
          const m = Math.floor((diffSec % 3600) / 60).toString().padStart(2, '0')
          const s = (diffSec % 60).toString().padStart(2, '0')
          setCountdownText(`${h}:${m}:${s}`)
        }
      }

      updateCountdown()
      const cTimer = setInterval(updateCountdown, 1000)
      return () => clearInterval(cTimer)
    }, [isScheduled, scheduledTime])

    // 1. 初始化拉取阶段、任务、设置、状态
    const initData = useCallback(async () => {
      try {
        const pResp = await fetch(`${SERVICE_URL}/api/grab/phases`).catch(() => null)
        if (pResp && pResp.ok) {
          const d = await pResp.json()
          if (d.phases && d.phases.length > 0) setPhases(d.phases)
          if (d.current_phase) setSelectedPhase(d.current_phase)
        }

        const tResp = await fetch(`${SERVICE_URL}/api/grab/tasks`).catch(() => null)
        if (tResp && tResp.ok) {
          const d = await tResp.json()
          if (Array.isArray(d.tasks)) setTasks(d.tasks)
        }

        const cResp = await fetch(`${SERVICE_URL}/api/grab/config`).catch(() => null)
        if (cResp && cResp.ok) {
          const d = await cResp.json()
          if (d.sleep_time !== undefined) setSleepTime(d.sleep_time)
          if (d.sleep_jitter !== undefined) setSleepJitter(d.sleep_jitter)
          if (d.scheduled_time) {
            setScheduledTime(d.scheduled_time)
            setIsScheduled(true)
          }
        }

        const sResp = await fetch(`${SERVICE_URL}/api/grab/status`).catch(() => null)
        if (sResp && sResp.ok) {
          const d = await sResp.json()
          setIsRunning(d.is_running || false)
          setStats({
            duration: d.duration || '--:--:--',
            total_attempts: d.total_attempts || 0,
            success_count: d.success_count || 0,
            failed_count: d.failed_count || 0,
            waiting_count: d.waiting_count || 0,
          })
          if (Array.isArray(d.tasks) && d.tasks.length > 0) {
            setTasks(d.tasks)
          }
          if (d.is_scheduled && d.scheduled_time) {
            setScheduledTime(d.scheduled_time)
            setIsScheduled(true)
          }
        }
      } catch (_) {}
    }, [])

    useEffect(() => {
      initData()
    }, [initData])

    // 2. 日志与状态实时流式推送 (SSE 优先，自动降级增量轮询)
    useEffect(() => {
      let es = null
      let pollTimer = null
      let isUnmounted = false

      const startFallbackPoll = () => {
        if (pollTimer || isUnmounted) return
        pollTimer = setInterval(async () => {
          try {
            const sResp = await fetch(`${SERVICE_URL}/api/grab/status`).catch(() => null)
            if (sResp) {
              if (sResp.status === 401) {
                onRequireLogin && onRequireLogin()
                return
              }
              if (sResp.ok) {
                const d = await sResp.json()
                setIsRunning(d.is_running || false)
                setStats({
                  duration: d.duration || '--:--:--',
                  total_attempts: d.total_attempts || 0,
                  success_count: d.success_count || 0,
                  failed_count: d.failed_count || 0,
                  waiting_count: d.waiting_count || 0,
                })
                if (Array.isArray(d.tasks)) setTasks(d.tasks)
              }
            }

            const lResp = await fetch(`${SERVICE_URL}/api/grab/logs?since_id=${lastLogIdRef.current}`).catch(() => null)
            if (lResp && lResp.ok) {
              const ld = await lResp.json()
              if (Array.isArray(ld.logs) && ld.logs.length > 0) {
                setLogs(prev => [...prev, ...ld.logs].slice(-300))
                lastLogIdRef.current = ld.last_id || lastLogIdRef.current
              }
            }
          } catch (_) {}
        }, isRunning ? 1500 : 5000)
      }

      // 优先建立 SSE 实时长连接
      if (typeof window !== 'undefined' && window.EventSource) {
        try {
          es = new EventSource(`${SERVICE_URL}/api/grab/logs/stream`)
          es.onmessage = (e) => {
            if (!e.data || isUnmounted) return
            try {
              const payload = JSON.parse(e.data)
              if (payload.type === 'log' && payload.log) {
                setLogs(prev => [...prev.slice(-299), payload.log])
                if (payload.log.id) lastLogIdRef.current = payload.log.id
              } else if (payload.type === 'status') {
                if (payload.is_running !== undefined) setIsRunning(payload.is_running)
                if (payload.stats) setStats(payload.stats)
                if (Array.isArray(payload.tasks)) setTasks(payload.tasks)
                if (payload.is_scheduled !== undefined) setIsScheduled(payload.is_scheduled)
                if (payload.scheduled_time) setScheduledTime(payload.scheduled_time)
              }
            } catch (_) {}
          }
          es.onerror = () => {
            if (es) { es.close(); es = null }
            startFallbackPoll()
          }
        } catch (_) {
          startFallbackPoll()
        }
      } else {
        startFallbackPoll()
      }

      // 周期性同步队列
      const taskSyncTimer = setInterval(async () => {
        try {
          const tResp = await fetch(`${SERVICE_URL}/api/grab/tasks`).catch(() => null)
          if (tResp && tResp.ok) {
            const d = await tResp.json()
            if (Array.isArray(d.tasks)) setTasks(d.tasks)
          }
        } catch (_) {}
      }, 5000)

      return () => {
        isUnmounted = true
        if (es) es.close()
        if (pollTimer) clearInterval(pollTimer)
        if (taskSyncTimer) clearInterval(taskSyncTimer)
      }
    }, [isRunning, onRequireLogin])

    // 日志自动滚动
    useEffect(() => {
      if (autoScroll && logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
      }
    }, [logs, autoScroll])

    // 3. 搜索课程
    const handleSearch = async () => {
      const kw = keyword.trim()
      if (!kw) {
        setSearchMsg('请输入课程名称或课程号关键词')
        return
      }
      setSearching(true)
      setSearchMsg('')
      try {
        const resp = await fetch(`${SERVICE_URL}/api/grab/search?keyword=${encodeURIComponent(kw)}&phase=${selectedPhase}`)
        if (resp.status === 401) {
          onRequireLogin && onRequireLogin()
          return
        }
        const data = await resp.json()
        if (!resp.ok) {
          setSearchMsg(data.detail || '搜索失败')
          return
        }
        setSearchResults(data.courses || [])
        if (!data.courses || data.courses.length === 0) {
          setSearchMsg('未检索到符合条件的课程，可尝试更换关键词或选课阶段')
        }
      } catch (err) {
        setSearchMsg(`搜索请求异常: ${err.message}`)
      } finally {
        setSearching(false)
      }
    }

    // 4. 同步任务队列到后端
    const syncTasks = async (nextTasks) => {
      setTasks(nextTasks)
      try {
        await fetch(`${SERVICE_URL}/api/grab/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks: nextTasks }),
        })
      } catch (_) {}
    }

    // 5. 添加任务
    const handleAddTask = (course) => {
      const kcId = `${course.course_id}_${course.seq_no}`
      if (tasks.some(t => `${t.course.course_id}_${t.course.seq_no}` === kcId)) {
        notify(`《${course.name}》已在抢课队列中`, 'warning')
        return
      }
      const newTask = {
        course,
        status: 'WAITING',
        attempts: 0,
        last_message: '待抢',
        group_id: 0,
      }
      const next = [...tasks, newTask]
      syncTasks(next)
      notify(`已将《${course.name}》加入抢课目标队列`, 'success')
    }

    // 6. 手工直添
    const handleDirectAdd = () => {
      const cId = directCourseId.trim()
      const seq = directSeqNo.trim()
      if (!cId || !seq) {
        notify('请同时输入课程号和课序号', 'warning')
        return
      }
      const course = {
        course_id: cId,
        seq_no: seq,
        name: `直添课程_${cId}_${seq}`,
        teacher: '',
        seats_free: -1,
        classroom: '直添排定',
        schedule: '待抢到后确认',
      }
      handleAddTask(course)
      setDirectCourseId('')
      setDirectSeqNo('')
    }

    // 7. 队列操作
    const handleRemoveTask = (idx) => {
      const next = tasks.filter((_, i) => i !== idx)
      syncTasks(next)
      notify('已移除该抢课任务')
    }

    const handleMoveTask = (idx, delta) => {
      const target = idx + delta
      if (target < 0 || target >= tasks.length) return
      const next = [...tasks]
      const temp = next[idx]
      next[idx] = next[target]
      next[target] = temp
      syncTasks(next)
    }

    const handleSetGroup = (idx, gid) => {
      const next = [...tasks]
      next[idx] = { ...next[idx], group_id: gid }
      syncTasks(next)
    }

    // 8. 启动与停止抢课
    const handleStartGrab = async () => {
      if (tasks.length === 0) {
        notify('抢课队列为空，请先添加课程', 'warning')
        return
      }
      setActionLoading(true)
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
        })
        if (resp.status === 401) {
          onRequireLogin && onRequireLogin()
          return
        }
        const data = await resp.json()
        if (!resp.ok) {
          notify(data.detail || '启动失败', 'error')
        } else {
          setIsRunning(true)
          notify('抢课引擎已在后台启动！', 'success')
        }
      } catch (err) {
        notify(`启动失败: ${err.message}`, 'error')
      } finally {
        setActionLoading(false)
      }
    }

    const handleStopGrab = async () => {
      setActionLoading(true)
      try {
        const resp = await fetch(`${SERVICE_URL}/api/grab/stop`, { method: 'POST' })
        if (resp.ok) {
          setIsRunning(false)
          notify('已下发停止抢课指令')
        }
      } catch (err) {
        notify(`停止失败: ${err.message}`, 'error')
      } finally {
        setActionLoading(false)
      }
    }

    // 9. 保存参数设置
    const handleSaveConfig = async () => {
      setSavingSettings(true)
      try {
        await fetch(`${SERVICE_URL}/api/grab/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sleep_time: sleepTime, sleep_jitter: sleepJitter }),
        })
        notify('参数已保存并实时生效', 'success')
        setShowSettings(false)
      } catch (err) {
        notify(`保存失败: ${err.message}`, 'error')
      } finally {
        setSavingSettings(false)
      }
    }

    // 10. 设定定时开抢
    const handleSetSchedule = async () => {
      const tm = scheduledTime.trim()
      if (!tm) {
        notify('请输入目标开抢时间 (例如 13:00:00)', 'error')
        return
      }
      setScheduleSubmitting(true)
      try {
        const resp = await fetch(`${SERVICE_URL}/api/grab/scheduled`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_time: tm }),
        }).catch(() => null)
        if (resp && resp.ok) {
          setIsScheduled(true)
          notify(`已开启毫秒级定时待命: ${tm}`, 'success')
        } else {
          // 本地待命模式
          setIsScheduled(true)
          notify(`已开启定时待命: ${tm}`, 'success')
        }
      } catch (err) {
        setIsScheduled(true)
        notify(`已开启定时待命: ${tm}`, 'info')
      } finally {
        setScheduleSubmitting(false)
      }
    }

    // 取消定时开抢
    const handleCancelSchedule = async () => {
      setScheduleSubmitting(true)
      try {
        await fetch(`${SERVICE_URL}/api/grab/scheduled/cancel`, { method: 'POST' }).catch(() => null)
        setIsScheduled(false)
        setCountdownText('')
        notify('已取消定时待命', 'info')
      } catch (_) {}
      finally {
        setScheduleSubmitting(false)
      }
    }

    // 11. 简单冲突预检 (计算队列中有哪些课程上课时间可能重叠)
    const conflicts = []
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const s1 = tasks[i].course.schedule || ''
        const s2 = tasks[j].course.schedule || ''
        if (s1 && s2 && s1 !== '待抢到后确认' && s2 !== '待抢到后确认') {
          // 简易冲突判定：同在周几且节次文字有交叠
          const m1 = s1.match(/周([一二三四五六日])/);
          const m2 = s2.match(/周([一二三四五六日])/);
          if (m1 && m2 && m1[1] === m2[1]) {
            conflicts.push({
              nameA: tasks[i].course.name,
              nameB: tasks[j].course.name,
              day: m1[1],
              isSameGroup: tasks[i].group_id > 0 && tasks[i].group_id === tasks[j].group_id,
            })
          }
        }
      }
    }

    const filteredLogs = logs.filter(l => {
      if (logFilter === 'ALL') return true
      if (logFilter === 'SUCCESS') return l.level === 'SUCCESS'
      if (logFilter === 'ERROR') return l.level === 'ERROR'
      return true
    })

    return h('div', null,
      // 顶部 Banner 提示
      bannerMsg.text && h('div', {
        style: {
          padding: '8px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          fontWeight: 500,
          background: bannerMsg.type === 'success'
            ? 'rgba(16, 185, 129, 0.12)'
            : bannerMsg.type === 'error'
            ? 'rgba(239, 68, 68, 0.12)'
            : bannerMsg.type === 'warning'
            ? 'rgba(245, 158, 11, 0.12)'
            : 'var(--dsw-alias-bg-hover, rgba(125, 125, 125, 0.1))',
          color: bannerMsg.type === 'success'
            ? '#10b981'
            : bannerMsg.type === 'error'
            ? '#ef4444'
            : bannerMsg.type === 'warning'
            ? '#f59e0b'
            : 'inherit',
          border: `1px solid ${bannerMsg.type === 'success' ? '#10b98144' : bannerMsg.type === 'error' ? '#ef444444' : 'var(--dsw-alias-border, rgba(125,125,125,0.15))'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
      },
        h('span', null, bannerMsg.text),
        h('button', {
          style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '13px' },
          onClick: () => setBannerMsg({ text: '', type: 'info' }),
        }, '✕')
      ),

      // 1. 顶部主控制与仪表盘卡片
      h('div', {
        style: {
          ...S.card,
          padding: '18px 20px',
          marginBottom: '18px',
          background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.04))',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          },
        },
          // 左侧：状态指示与定时倒计时徽章
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
            h('span', {
              style: {
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isRunning ? '#10b981' : (isScheduled ? '#3b82f6' : '#a1a1aa'),
                boxShadow: isRunning ? '0 0 10px rgba(16, 185, 129, 0.8)' : (isScheduled ? '0 0 10px rgba(59, 130, 246, 0.6)' : 'none'),
                display: 'inline-block',
                transition: 'all 0.2s ease',
              },
            }),
            h('span', { style: { fontSize: '15px', fontWeight: 600 } },
              isRunning ? '抢课后台引擎运行中' : (isScheduled ? '定时待命待命中' : '抢课引擎就绪 (空闲待命)')
            ),
            h('span', {
              style: {
                ...S.badge,
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.08))',
              },
            }, `轮询间隔: ${sleepTime}s ±${sleepJitter}s`),
            isScheduled && h('span', {
              style: {
                ...S.badge,
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#2563eb',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                fontWeight: 600,
              },
            }, `⏱️ 定时: ${scheduledTime} · 倒计时 ${countdownText || '计算中...'}`)
          ),

          // 右侧：定时开抢输入与主控制按钮组
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            // 定时开抢输入条
            !isScheduled ? (
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                h('input', {
                  type: 'text',
                  placeholder: '定时开抢 如 13:00:00',
                  value: scheduledTime,
                  onChange: (e) => setScheduledTime(e.target.value),
                  onKeyDown: (e) => e.key === 'Enter' && handleSetSchedule(),
                  style: {
                    ...S.btnSecondary,
                    padding: '5px 8px',
                    width: '130px',
                    fontSize: '11px',
                    background: 'var(--dsw-alias-bg-sub, rgba(125,125,125,0.06))',
                  },
                }),
                h('button', {
                  style: { ...S.btnSecondary, padding: '5px 10px', fontSize: '11px', fontWeight: 600 },
                  onClick: handleSetSchedule,
                  disabled: scheduleSubmitting,
                }, '设定定时')
              )
            ) : (
              h('button', {
                style: {
                  ...S.btnSecondary,
                  color: '#ef4444',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  background: 'rgba(239, 68, 68, 0.05)',
                  padding: '5px 10px',
                  fontSize: '11px',
                },
                onClick: handleCancelSchedule,
                disabled: scheduleSubmitting,
              }, '取消定时待命')
            ),

            h('button', {
              style: { ...S.btnSecondary, display: 'inline-flex', alignItems: 'center', gap: '6px' },
              onClick: () => setShowSettings(true),
              title: '配置刷新间隔与随机抖动',
            },
              h(SettingsIcon, { size: 13 }),
              '抢课参数'
            ),
            isRunning
              ? h('button', {
                  style: {
                    ...S.btnSecondary,
                    color: '#ef4444',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.08)',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  },
                  onClick: handleStopGrab,
                  disabled: actionLoading,
                },
                  h(SquareStopIcon, { size: 13 }),
                  actionLoading ? '停止中...' : '停止抢课'
                )
              : h('button', {
                  style: {
                    ...S.btnPrimary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: tasks.length === 0 ? 0.5 : 1,
                    cursor: tasks.length === 0 ? 'not-allowed' : 'pointer',
                  },
                  onClick: handleStartGrab,
                  disabled: actionLoading || tasks.length === 0,
                },
                  h(PlayIcon, { size: 13 }),
                  actionLoading ? '启动中...' : `立即开抢 (${tasks.length} 门目标)`
                )
          )
        ),

        // 4 个状态指标展示槽
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
          },
        },
          [
            { label: '运行时长', value: stats.duration, color: 'inherit' },
            { label: '总扫描尝试', value: `${stats.total_attempts} 次`, color: '#38bdf8' },
            { label: '抢课成功', value: `${stats.success_count} 门`, color: '#10b981' },
            { label: '待处理队列', value: `${stats.waiting_count || tasks.length} 门`, color: '#fbbf24' },
          ].map((item, i) =>
            h('div', {
              key: i,
              style: {
                background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
                borderRadius: '8px',
                padding: '10px 14px',
              },
            },
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } }, item.label),
              h('div', { style: { fontSize: '16px', fontWeight: 700, marginTop: '4px', color: item.color } }, item.value)
            )
          )
        )
      ),

      // 2. 搜索检索与手动直添栏
      h('div', {
        style: {
          ...S.card,
          padding: '14px 18px',
          marginBottom: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        },
      },
        // 搜索行
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('select', {
            style: {
              ...S.input,
              width: '160px',
              marginBottom: 0,
              padding: '8px 10px',
              fontSize: '12px',
              fontWeight: 500,
            },
            value: selectedPhase,
            onChange: (e) => setSelectedPhase(e.target.value),
          },
            phases.map(p => h('option', { key: p.id, value: p.id }, p.label))
          ),
          h('input', {
            type: 'text',
            ref: searchInputRef,
            placeholder: '输入课程名关键词、教师名或课程号（按 / 键快速聚焦搜索）...',
            style: { ...S.input, flex: 1, minWidth: '220px', marginBottom: 0, padding: '8px 12px' },
            value: keyword,
            onChange: (e) => setKeyword(e.target.value),
            onKeyDown: (e) => e.key === 'Enter' && handleSearch(),
          }),
          h('button', {
            style: { ...S.btnPrimary, padding: '8px 18px', fontSize: '13px' },
            onClick: handleSearch,
            disabled: searching,
          }, searching ? '检索中...' : '搜索课程')
        ),

        // 手工直添行
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px dashed var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
            fontSize: '12px',
            color: 'var(--dsw-alias-text-sub, #71717a)',
            flexWrap: 'wrap',
          },
        },
          h('span', { style: { fontWeight: 500 } }, '快速直添 (无需先搜索):'),
          h('input', {
            type: 'text',
            placeholder: '课程号 (如 104231030)',
            style: { ...S.input, width: '150px', marginBottom: 0, padding: '5px 10px', fontSize: '12px' },
            value: directCourseId,
            onChange: (e) => setDirectCourseId(e.target.value),
          }),
          h('input', {
            type: 'text',
            placeholder: '序号 (如 01)',
            style: { ...S.input, width: '70px', marginBottom: 0, padding: '5px 8px', fontSize: '12px' },
            value: directSeqNo,
            onChange: (e) => setDirectSeqNo(e.target.value),
          }),
          h('button', {
            style: { ...S.btnSecondary, padding: '5px 12px', fontSize: '12px' },
            onClick: handleDirectAdd,
          }, '+ 直接加入队列')
        ),

        searchMsg && h('div', { style: { fontSize: '12px', color: '#ef4444', marginTop: '2px' } }, searchMsg)
      ),

      // 3. 冲突警告条 (若有时间冲突)
      conflicts.length > 0 && h('div', {
        style: {
          padding: '10px 14px',
          borderRadius: '8px',
          marginBottom: '16px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#d97706',
        },
      },
        h(AlertTriangleIcon, { size: 16 }),
        h('div', null,
          h('span', { style: { fontWeight: 600 } }, '检测到上课时间重叠：'),
          conflicts.map((c, idx) =>
            h('span', { key: idx, style: { marginLeft: '6px' } },
              `《${c.nameA}》与《${c.nameB}》(周${c.day}) ` +
              (c.isSameGroup ? '【已设为备选互斥】' : '【建议设为相同备选组】')
            )
          )
        )
      ),

      // 4. 双栏主要内容区 (左：搜索结果候选；右：抢课队列目标)
      h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: searchResults.length > 0 ? '1.1fr 1fr' : '1fr',
          gap: '16px',
          marginBottom: '18px',
        },
      },
        // 左栏：课程检索结果列表
        searchResults.length > 0 && h('div', {
          style: {
            ...S.card,
            padding: '16px',
            marginBottom: 0,
            display: 'flex',
            flexDirection: 'column',
          },
        },
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            },
          },
            h('span', { style: { fontSize: '14px', fontWeight: 600 } },
              `检索候选结果 (${searchResults.length} 门课程)`
            ),
            h('button', {
              style: { ...S.btnSecondary, padding: '2px 8px', fontSize: '11px' },
              onClick: () => setSearchResults([]),
            }, '收起结果')
          ),

          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' } },
            searchResults.map((c, i) => {
              const inQueue = tasks.some(t => t.course.course_id === c.course_id && t.course.seq_no === c.seq_no)
              const cardKey = `${c.course_id}_${c.seq_no}_${i}`
              const isExpanded = expandedCourseKey === cardKey

              return h('div', {
                key: cardKey,
                style: {
                  background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                  border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  transition: 'border-color 0.15s ease',
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' } },
                  h('div', { style: { flex: 1 } },
                    h('div', { style: { fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' } },
                      h('span', null, c.name),
                      h('span', { style: S.badge }, `${c.course_id}-${c.seq_no}`)
                    ),
                    h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginTop: '4px' } },
                      c.teacher ? `教师: ${c.teacher}` : '教师待公布',
                      c.schedule ? ` · ${c.schedule}` : '',
                      c.classroom ? ` · ${c.classroom}` : ''
                    )
                  ),

                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    h('span', {
                      style: {
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        background: c.seats_free > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(125, 125, 125, 0.15)',
                        color: c.seats_free > 0 ? '#10b981' : 'var(--dsw-alias-text-sub, #71717a)',
                      },
                    }, `余量: ${c.seats_free}`),

                    h('button', {
                      style: {
                        ...S.btnSecondary,
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: inQueue ? 'transparent' : 'var(--dsw-alias-bg-hover, rgba(125,125,125,0.1))',
                        color: inQueue ? 'var(--dsw-alias-text-sub, #71717a)' : 'inherit',
                      },
                      onClick: () => handleAddTask(c),
                      disabled: inQueue,
                    }, inQueue ? '已在队列' : '+ 加入抢课')
                  )
                ),

                // 展开详情切换
                h('div', { style: { marginTop: '6px', textAlign: 'right' } },
                  h('button', {
                    style: { background: 'transparent', border: 'none', fontSize: '10px', color: 'var(--dsw-alias-text-sub, #71717a)', cursor: 'pointer' },
                    onClick: () => setExpandedCourseKey(isExpanded ? null : cardKey),
                  }, isExpanded ? '收起详情 ▲' : '查看完整属性 ▼')
                ),

                // 详细属性展开面板
                isExpanded && c.raw && h('div', {
                  style: {
                    marginTop: '6px',
                    padding: '8px',
                    borderRadius: '4px',
                    background: 'var(--dsw-alias-bg-card, rgba(0,0,0,0.15))',
                    fontSize: '11px',
                    lineHeight: 1.6,
                    color: 'var(--dsw-alias-text-sub, #71717a)',
                  },
                },
                  c.raw.kclbmc && h('div', null, `课程类别: ${c.raw.kclbmc}`),
                  c.raw.xf && h('div', null, `学分: ${c.raw.xf} · 学时: ${c.raw.xs || '--'}`),
                  c.raw.kkxsmc && h('div', null, `开课学院: ${c.raw.kkxsmc}`),
                  c.raw.xqmc && h('div', null, `校区: ${c.raw.xqmc}`),
                  c.raw.zxjxjhh && h('div', null, `教学计划号: ${c.raw.zxjxjhh}`),
                  c.raw.xkxzsm && h('div', null, `选课限制: ${c.raw.xkxzsm}`)
                )
              )
            })
          )
        ),

        // 右栏：抢课目标队列
        h('div', {
          style: {
            ...S.card,
            padding: '16px',
            marginBottom: 0,
            display: 'flex',
            flexDirection: 'column',
          },
        },
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('span', { style: { fontSize: '14px', fontWeight: 600 } },
                `抢课目标队列 (${tasks.length} 门)`
              ),
              h('span', { style: S.badge }, '优先抢排在前面的课程')
            ),
            h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
              '同组号互为备选'
            )
          ),

          tasks.length === 0
            ? h('div', {
                style: {
                  textAlign: 'center',
                  padding: '40px 16px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  fontSize: '13px',
                },
              },
                h(CrosshairIcon, { size: 32, style: { opacity: 0.3, marginBottom: '8px' } }),
                h('div', null, '暂未添加抢课目标'),
                h('div', { style: { fontSize: '11px', marginTop: '4px' } },
                  '可在上方搜索或直添课程，加入队列后点击“开始抢课”即可在后台全自动高频监控'
                )
              )
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' } },
                tasks.map((task, idx) => {
                  const statusColors = {
                    SUCCESS: { text: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: '已抢到' },
                    FAILED: { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: '失败' },
                    GRABBING: { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', label: '监控抢课中' },
                    CANCELLED: { text: '#a1a1aa', bg: 'rgba(161, 161, 170, 0.12)', label: '已自动取消' },
                    WAITING: { text: '#a1a1aa', bg: 'rgba(125, 125, 125, 0.12)', label: '等待就绪' },
                  }
                  const st = statusColors[task.status] || statusColors.WAITING

                  return h('div', {
                    key: `${task.course.course_id}_${task.course.seq_no}_${idx}`,
                    style: {
                      background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.04))',
                      border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.12))',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    },
                  },
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                        h('span', { style: { fontSize: '12px', fontWeight: 700, color: 'var(--dsw-alias-text-sub, #71717a)' } }, `#${idx + 1}`),
                        h('span', { style: { fontSize: '13px', fontWeight: 600 } }, task.course.name),
                        h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                          `(${task.course.course_id}-${task.course.seq_no})`
                        )
                      ),

                      h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                        h('span', {
                          style: {
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: st.bg,
                            color: st.text,
                            fontWeight: 600,
                          },
                        }, st.label),

                        h('button', {
                          style: { background: 'transparent', border: 'none', cursor: idx > 0 ? 'pointer' : 'default', opacity: idx > 0 ? 0.7 : 0.2, padding: '2px' },
                          onClick: () => handleMoveTask(idx, -1),
                          disabled: idx === 0,
                          title: '提升优先级',
                        }, h(ChevronUpIcon, { size: 14 })),

                        h('button', {
                          style: { background: 'transparent', border: 'none', cursor: idx < tasks.length - 1 ? 'pointer' : 'default', opacity: idx < tasks.length - 1 ? 0.7 : 0.2, padding: '2px' },
                          onClick: () => handleMoveTask(idx, 1),
                          disabled: idx === tasks.length - 1,
                          title: '降低优先级',
                        }, h(ChevronDownIcon, { size: 14 })),

                        h('button', {
                          style: { background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', marginLeft: '2px' },
                          onClick: () => handleRemoveTask(idx),
                          title: '移除该目标',
                        }, h(TrashIcon, { size: 13 }))
                      )
                    ),

                    // 辅助信息与备选组设定
                    h('div', {
                      style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: 'var(--dsw-alias-text-sub, #71717a)',
                        flexWrap: 'wrap',
                        gap: '6px',
                      },
                    },
                      h('div', null,
                        task.course.teacher ? `教师: ${task.course.teacher} · ` : '',
                        `尝试扫描: ${task.attempts} 次`,
                        task.last_message ? ` · ${task.last_message}` : ''
                      ),

                      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                        h('span', null, '备选互斥:'),
                        h('select', {
                          style: {
                            background: 'var(--dsw-alias-bg-input, rgba(125, 125, 125, 0.08))',
                            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                            color: 'inherit',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '11px',
                          },
                          value: task.group_id,
                          onChange: (e) => handleSetGroup(idx, parseInt(e.target.value) || 0),
                        },
                          h('option', { value: 0 }, '组0 (独立任务)'),
                          h('option', { value: 1 }, '组1 (同组互斥备选)'),
                          h('option', { value: 2 }, '组2 (同组互斥备选)'),
                          h('option', { value: 3 }, '组3 (同组互斥备选)')
                        )
                      )
                    )
                  )
                })
              )
        )
      ),

      // 5. 底部实时运行日志控制台
      h('div', {
        style: {
          ...S.card,
          padding: '16px',
          background: 'var(--dsw-alias-bg-card, rgba(125, 125, 125, 0.03))',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h(TerminalIcon, { size: 15 }),
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '实时运行终端日志 (Live Log Terminal)'),
            h('span', { style: S.badge }, `${filteredLogs.length} 条记录`)
          ),

          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            // 级别筛选按钮
            [
              { key: 'ALL', label: '全部' },
              { key: 'SUCCESS', label: '仅成功' },
              { key: 'ERROR', label: '仅异常警报' },
            ].map(f =>
              h('button', {
                key: f.key,
                style: {
                  ...S.btnSecondary,
                  padding: '2px 8px',
                  fontSize: '11px',
                  borderRadius: '10px',
                  background: logFilter === f.key ? 'var(--dsw-alias-text, #18181b)' : 'transparent',
                  color: logFilter === f.key ? 'var(--dsw-alias-bg, #ffffff)' : 'inherit',
                  borderColor: logFilter === f.key ? 'transparent' : 'var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
                  fontWeight: logFilter === f.key ? 600 : 400,
                },
                onClick: () => setLogFilter(f.key),
              }, f.label)
            ),

            h('label', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px', cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: autoScroll,
                onChange: (e) => setAutoScroll(e.target.checked),
              }),
              '自动滚屏'
            ),

            h('button', {
              style: { ...S.btnSecondary, padding: '2px 8px', fontSize: '11px', marginLeft: '4px' },
              onClick: () => setLogs([]),
              title: '清空日志面板',
            }, '清屏')
          )
        ),

        // 终端代码视窗
        h('div', {
          ref: logContainerRef,
          style: {
            fontFamily: 'Consolas, Menlo, Monaco, "Courier New", monospace',
            fontSize: '12px',
            lineHeight: 1.6,
            height: '180px',
            overflowY: 'auto',
            background: 'var(--dsw-alias-bg-sub, rgba(0, 0, 0, 0.18))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
            borderRadius: '8px',
            padding: '10px 14px',
            boxSizing: 'border-box',
          },
        },
          filteredLogs.length === 0
            ? h('div', { style: { color: 'var(--dsw-alias-text-sub, #71717a)', textAlign: 'center', padding: '24px' } },
                '终端空闲。点击上方“开始抢课”，此处将实时打印网络扫描、Token验证、余量嗅探与提交结果...'
              )
            : filteredLogs.map((l, idx) => {
                const colors = {
                  SUCCESS: '#10b981',
                  ERROR: '#ef4444',
                  DEBUG: '#818cf8',
                  INFO: 'var(--dsw-alias-text-sub, #71717a)',
                }
                const tagColor = colors[l.level] || 'inherit'

                return h('div', { key: idx, style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } },
                  h('span', { style: { color: 'var(--dsw-alias-text-sub, #71717a)', marginRight: '6px' } }, `[${l.time}]`),
                  h('span', { style: { color: tagColor, fontWeight: 700, marginRight: '6px' } }, `[${l.level}]`),
                  h('span', { style: { color: l.level === 'SUCCESS' ? '#10b981' : l.level === 'ERROR' ? '#ef4444' : 'inherit' } }, l.message)
                )
              })
        )
      ),

      // 6. 参数设置 Modal
      showSettings && h('div', {
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
        onClick: () => setShowSettings(false),
      },
        h('div', {
          style: {
            background: 'var(--dsw-alias-bg-panel, var(--dsw-alias-bg-card, #ffffff))',
            color: 'var(--dsw-alias-text, inherit)',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.2))',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          },
          onClick: (e) => e.stopPropagation(),
        },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
            h('div', { style: { fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' } },
              h(SettingsIcon, { size: 16 }),
              h('span', null, '抢课引擎运行参数设置')
            ),
            h('button', {
              style: { background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--dsw-alias-text-sub, #71717a)' },
              onClick: () => setShowSettings(false),
            }, '✕')
          ),

          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' } },
            h('div', null,
              h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' } },
                '基础轮询间隔 (秒):'
              ),
              h('input', {
                type: 'number',
                min: '0.5',
                max: '30.0',
                step: '0.5',
                style: { ...S.input, marginBottom: '4px' },
                value: sleepTime,
                onChange: (e) => setSleepTime(parseFloat(e.target.value) || 1.0),
              }),
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                '单轮课程扫描后的基准等待秒数。推荐 1.0s ~ 3.0s。'
              )
            ),

            h('div', null,
              h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' } },
                '随机浮动抖动范围 (±秒):'
              ),
              h('input', {
                type: 'number',
                min: '0.0',
                max: '5.0',
                step: '0.1',
                style: { ...S.input, marginBottom: '4px' },
                value: sleepJitter,
                onChange: (e) => setSleepJitter(parseFloat(e.target.value) || 0.2),
              }),
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)' } },
                '在基准间隔上产生随机偏差，拟真人工操作，防止被网关反爬检测。'
              )
            )
          ),

          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
            h('button', {
              style: S.btnSecondary,
              onClick: () => setShowSettings(false),
            }, '取消'),
            h('button', {
              style: S.btnPrimary,
              onClick: handleSaveConfig,
              disabled: savingSettings,
            }, savingSettings ? '保存中...' : '保存并生效')
          )
        )
      )
    )
  
    }


    // ================== 子页面 6：四川大学统一身份认证与凭据管理 (纯白极简风格) ==================
    function SettingsView({ onLoginSuccess, onLogoutSuccess, isLoggedIn, studentName, hasCreds }) {
      const [authTab, setAuthTab] = useState('unified') // 'unified' | 'qrcode' | 'legacy'
      const [username, setUsername] = useState('')
      const [password, setPassword] = useState('')
      const [remember, setRemember] = useState(true)
      const [submitting, setSubmitting] = useState(false)
      const [msg, setMsg] = useState({ text: '', isError: false })
      const [showPassword, setShowPassword] = useState(false)

      // 本地硬件加密记住的凭据与快捷填入
      const [savedCreds, setSavedCreds] = useState(null)
      const [autoFillTip, setAutoFillTip] = useState('')

      // 扫码登录专用状态
      const [qrCodeData, setQrCodeData] = useState(null)
      const [qrLoading, setQrLoading] = useState(false)
      const [qrStatusText, setQrStatusText] = useState('')
      const pollTimerRef = useRef(null)

      // 挂载时拉取本地基于硬件加密保存的凭据并自动快捷预填
      useEffect(() => {
        async function loadSavedCredentials() {
          try {
            const resp = await fetch(`${SERVICE_URL}/api/auth/saved-credentials`)
            if (resp.ok) {
              const d = await resp.json()
              if (d.hasSaved && d.username && d.password) {
                setSavedCreds(d)
                setUsername(d.username)
                setPassword(d.password)
                if (d.authType === 'legacy_urp') {
                  setAuthTab('legacy')
                } else {
                  setAuthTab('unified')
                }
              }
            }
          } catch (_) {}
        }
        loadSavedCredentials()
      }, [])

      // 一键快捷重新填入已记住的凭据
      const handleAutoFill = () => {
        if (savedCreds) {
          setUsername(savedCreds.username)
          setPassword(savedCreds.password)
          if (savedCreds.authType === 'legacy_urp') setAuthTab('legacy')
          else setAuthTab('unified')
          setAutoFillTip('已快捷填入已保存的凭据')
          setTimeout(() => setAutoFillTip(''), 3000)
        }
      }

      // 拉取动态二维码
      const fetchNewQrCode = useCallback(async () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        setQrLoading(true)
        setQrStatusText('正在获取统一认证动态二维码...')
        setMsg({ text: '', isError: false })
        try {
          const resp = await fetch(`${SERVICE_URL}/api/auth/qrcode/new`)
          const data = await resp.json()
          if (!resp.ok) throw new Error(data.detail || '获取二维码失败')
          setQrCodeData(data)
          setQrStatusText('等待微川大或智慧川大 APP 扫码确认...')
          startPolling(data.code)
        } catch (err) {
          setQrStatusText(`获取失败: ${err.message}`)
        } finally {
          setQrLoading(false)
        }
      }, [])

      // 轮询扫码状态
      const startPolling = (code) => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        pollTimerRef.current = setInterval(async () => {
          try {
            const resp = await fetch(`${SERVICE_URL}/api/auth/qrcode/status?code=${encodeURIComponent(code)}`)
            const data = await resp.json()
            if (data.status === 'SUCCESS') {
              clearInterval(pollTimerRef.current)
              setQrStatusText('统一认证扫码成功！教务与电费系统已无缝打通')
              setMsg({ text: '扫码成功！已同步关联教务处与宿舍电费', isError: false })
              onLoginSuccess(data.studentName || data.username)
            } else if (data.status === 'EXPIRED') {
              clearInterval(pollTimerRef.current)
              setQrStatusText('二维码已失效，请点击刷新')
            } else {
              setQrStatusText(data.message || '等待微川大或智慧川大 APP 扫码确认...')
            }
          } catch {
            // 网络微抖动忽略
          }
        }, 2000)
      }

      // 当切换到扫码 Tab 时自动拉取二维码
      useEffect(() => {
        if (authTab === 'qrcode') {
          fetchNewQrCode()
        } else {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        }
        return () => {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        }
      }, [authTab, fetchNewQrCode])

      // 统一表单登录处理
      const handleLogin = async (e) => {
        e.preventDefault()
        if (!username || !password) {
          return setMsg({ text: '请填写学号与密码', isError: true })
        }
        setSubmitting(true)
        setMsg({ text: '', isError: false })
        try {
          const authType = authTab === 'unified' ? 'unified_sso' : 'legacy_urp'
          const resp = await fetch(`${SERVICE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, authType, remember }),
          })
          const d = await resp.json()
          if (!resp.ok) {
            setMsg({ text: d.detail || '认证失败，请检查账号密码', isError: true })
          } else {
            setMsg({ text: d.message || '登录成功！已基于主机密钥加密保存凭据。', isError: false })
            if (remember) {
              setSavedCreds({ username, password, authType, studentName: d.studentName || username })
            }
            onLoginSuccess(d.studentName || username)
          }
        } catch (err) {
          setMsg({ text: `连接本地服务失败: ${err.message}`, isError: true })
        } finally {
          setSubmitting(false)
        }
      }

      const handleLogout = async () => {
        try {
          await fetch(`${SERVICE_URL}/api/logout`, { method: 'POST' }).catch(() => {})
        } finally {
          setUsername('')
          setPassword('')
          setSavedCreds(null)
          setMsg({ text: '已清除本地保存的凭据并退出所有系统。', isError: false })
          onLogoutSuccess()
        }
      }

      return h('div', { style: { maxWidth: '540px', margin: '0 auto' } },
        // 1. 已登录在线状态卡片 (极简纯白)
        isLoggedIn && h('div', {
          style: {
            ...S.card,
            padding: '18px 22px',
            borderRadius: '10px',
            marginBottom: '20px',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.05))',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
        },
          h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('span', { style: S.statusDot(true) }),
              h('span', { style: { fontSize: '14px', fontWeight: 600 } }, `当前已登录: ${studentName || '川大学生'}`)
            ),
            h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
              h('span', {
                style: {
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  fontWeight: 500,
                },
              }, '● 教务系统已就绪'),
              h('span', {
                style: {
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  fontWeight: 500,
                },
              }, '● 宿舍电费已连通')
            )
          ),
          h('button', {
            style: {
              ...S.btnSecondary,
              color: '#ef4444',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              padding: '6px 12px',
              fontSize: '12px',
            },
            onClick: handleLogout,
          }, '退出当前登录')
        ),

        // 2. 主登录卡片 (纯白极简多模态切换)
        h('div', { style: { ...S.card, padding: '24px' } },
          // 头部标题
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' } },
            h(ShieldIcon, { size: 19 }),
            h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 600 } }, '四川大学统一身份认证')
          ),

          // 记住密码快捷填入胶囊条
          savedCreds && h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(16, 185, 129, 0.07)',
              border: '1px solid rgba(16, 185, 129, 0.22)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '12px',
            }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(KeyIcon, { size: 14, style: { color: '#10b981' } }),
              h('span', null, `已记住账号: `, h('strong', { style: { fontWeight: 600 } }, savedCreds.username)),
              autoFillTip && h('span', { style: { color: '#10b981', fontWeight: 500, marginLeft: '4px' } }, `✓ ${autoFillTip}`)
            ),
            h('button', {
              type: 'button',
              style: {
                ...S.btnSecondary,
                fontSize: '11px',
                padding: '4px 10px',
                borderColor: 'rgba(16, 185, 129, 0.35)',
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.05)',
                fontWeight: 600,
              },
              onClick: handleAutoFill,
            }, '快捷填入')
          ),

          // 提示消息
          msg.text && h('div', {
            style: {
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '16px',
              background: msg.isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
              color: msg.isError ? '#ef4444' : '#10b981',
              border: msg.isError ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
            },
          }, msg.text),

          // 多模态切换 Tab 栏 (极简药丸组)
          h('div', {
            style: {
              display: 'flex',
              gap: '4px',
              background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.06))',
              padding: '4px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.1))',
            },
          },
            h('button', {
              type: 'button',
              style: S.tabBtn(authTab === 'unified'),
              onClick: () => { setAuthTab('unified'); setMsg({ text: '', isError: false }) },
            },
              h(KeyIcon, { size: 13, style: { marginRight: '6px' } }),
              '统一认证账密 (推荐)'
            ),
            h('button', {
              type: 'button',
              style: S.tabBtn(authTab === 'qrcode'),
              onClick: () => { setAuthTab('qrcode'); setMsg({ text: '', isError: false }) },
            },
              h(QrCodeIcon, { size: 13, style: { marginRight: '6px' } }),
              '手机动态扫码'
            ),
            h('button', {
              type: 'button',
              style: S.tabBtn(authTab === 'legacy'),
              onClick: () => { setAuthTab('legacy'); setMsg({ text: '', isError: false }) },
            },
              h(UserIcon, { size: 13, style: { marginRight: '6px' } }),
              '教务处旧密码'
            )
          ),

          // 模式 1: 统一身份认证账密登录
          authTab === 'unified' && h('form', { onSubmit: handleLogin },
            h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 } }, '川大学号'),
            h('input', {
              style: S.input,
              type: 'text',
              placeholder: '例如 2024xxxxxxx',
              value: username,
              onChange: (e) => setUsername(e.target.value),
            }),
            h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 } }, '统一身份认证密码'),
            h('div', { style: { position: 'relative', marginBottom: '16px' } },
              h('input', {
                style: { ...S.input, marginBottom: 0, paddingRight: '42px' },
                type: showPassword ? 'text' : 'password',
                placeholder: '四川大学统一身份认证密码',
                value: password,
                onChange: (e) => setPassword(e.target.value),
              }),
              h('button', {
                type: 'button',
                style: {
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                title: showPassword ? '隐藏密码' : '显示密码',
                onClick: () => setShowPassword(!showPassword),
              },
                showPassword ? h(EyeOffIcon, { size: 16 }) : h(EyeIcon, { size: 16 })
              )
            ),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '20px', cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: remember,
                onChange: (e) => setRemember(e.target.checked),
              }),
              '记住账号与密码'
            ),
            h('div', { style: { display: 'flex', gap: '10px' } },
              h('button', {
                type: 'submit',
                style: { ...S.btnPrimary, flex: 1 },
                disabled: submitting,
              }, submitting ? '正在登录...' : (isLoggedIn ? '更新凭据' : '登录')),
              isLoggedIn && h('button', {
                type: 'button',
                style: S.btnSecondary,
                onClick: handleLogout,
              }, '退出登录')
            )
          ),

          // 模式 2: 手机动态扫码登录
          authTab === 'qrcode' && h('div', { style: { textAlign: 'center', padding: '10px 0' } },
            qrLoading
              ? h('div', { style: { padding: '40px 0', color: 'var(--dsw-alias-text-sub, #71717a)', fontSize: '13px' } }, '正在获取动态二维码...')
              : qrCodeData && qrCodeData.qrcode
                ? h('div', null,
                    h('div', {
                      style: {
                        display: 'inline-block',
                        padding: '12px',
                        background: '#ffffff',
                        borderRadius: '10px',
                        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                        border: '1px solid rgba(0, 0, 0, 0.08)',
                        marginBottom: '14px',
                      },
                    },
                      h('img', {
                        src: qrCodeData.qrcode,
                        alt: '统一认证动态二维码',
                        style: { width: '160px', height: '160px', display: 'block' },
                      })
                    ),
                    h('div', { style: { fontSize: '13px', fontWeight: 500, color: 'var(--dsw-alias-text, inherit)', marginBottom: '4px' } },
                      qrStatusText
                    ),
                    h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '16px' } },
                      '请打开手机【微川大】微信服务号或【智慧川大 APP】扫码授权'
                    ),
                    h('button', {
                      type: 'button',
                      style: { ...S.btnSecondary, fontSize: '12px', padding: '5px 14px' },
                      onClick: fetchNewQrCode,
                    },
                      h(RefreshIcon, { size: 12, style: { marginRight: '5px' } }),
                      '刷新二维码'
                    )
                  )
                : h('div', null,
                    h('p', { style: { color: '#ef4444', fontSize: '13px' } }, qrStatusText),
                    h('button', {
                      type: 'button',
                      style: S.btnSecondary,
                      onClick: fetchNewQrCode,
                    }, '重新生成二维码')
                  )
          ),

          // 模式 3: 教务处独立旧密码登录 (兼容通道)
          authTab === 'legacy' && h('form', { onSubmit: handleLogin },
            h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 } }, '川大学号'),
            h('input', {
              style: S.input,
              type: 'text',
              placeholder: '例如 2024xxxxxxx',
              value: username,
              onChange: (e) => setUsername(e.target.value),
            }),
            h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 } }, '综合教务系统专属密码'),
            h('div', { style: { position: 'relative', marginBottom: '16px' } },
              h('input', {
                style: { ...S.input, marginBottom: 0, paddingRight: '42px' },
                type: showPassword ? 'text' : 'password',
                placeholder: '四川大学综合教务处独立密码',
                value: password,
                onChange: (e) => setPassword(e.target.value),
              }),
              h('button', {
                type: 'button',
                style: {
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--dsw-alias-text-sub, #71717a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                title: showPassword ? '隐藏密码' : '显示密码',
                onClick: () => setShowPassword(!showPassword),
              },
                showPassword ? h(EyeOffIcon, { size: 16 }) : h(EyeIcon, { size: 16 })
              )
            ),
            h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '14px', lineHeight: 1.4 } },
              '提示：此通道仅登录教务处独立系统。'
            ),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '20px', cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: remember,
                onChange: (e) => setRemember(e.target.checked),
              }),
              '记住密码'
            ),
            h('div', { style: { display: 'flex', gap: '10px' } },
              h('button', {
                type: 'submit',
                style: { ...S.btnPrimary, flex: 1 },
                disabled: submitting,
              }, submitting ? '正在登录...' : '登录教务处'),
              isLoggedIn && h('button', {
                type: 'button',
                style: S.btnSecondary,
                onClick: handleLogout,
              }, '退出登录')
            )
          )
        ),

        // 3. 官方统一身份认证 (SSO) 找回指引
        h('div', {
          style: {
            ...S.card,
            marginTop: '16px',
            border: '1px solid var(--dsw-alias-border, rgba(125, 125, 125, 0.15))',
            background: 'var(--dsw-alias-bg-sub, rgba(125, 125, 125, 0.02))',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
            h(ShieldIcon, { size: 14 }),
            h('h4', { style: { margin: 0, fontSize: '13px', fontWeight: 600 } }, '忘记统一认证密码')
          ),
          h('p', { style: { fontSize: '12px', color: 'var(--dsw-alias-text-sub, #71717a)', marginBottom: '12px', lineHeight: 1.6 } },
            '若忘记统一身份认证密码，可前往学校认证中心通过手机验证码重置。'
          ),
          h('button', {
            type: 'button',
            style: {
              ...S.btnSecondary,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '5px 12px',
              fontWeight: 500,
            },
            onClick: () => {
              if (typeof window !== 'undefined' && window.open) {
                window.open('https://id.scu.edu.cn/frontend/login#/find_pwd', '_blank')
              }
            },
          },
            h(ExternalLinkIcon, { size: 13 }),
            '前往统一认证中心找回密码'
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
      const [isStartingService, setIsStartingService] = useState(false)

      const checkStatus = useCallback(async (retryCount = 0) => {
        try {
          const resp = await fetch(`${SERVICE_URL}/api/status`, { signal: AbortSignal.timeout(1500) })
          if (resp.ok) {
            const d = await resp.json()
            setIsLoggedIn(d.isLoggedIn)
            setHasCreds(d.hasCredentials)
            setStudentName(d.studentName || d.username || '')
            setIsStartingService(false)
            setStatusChecked(true)
            if (!d.hasCredentials && !d.isLoggedIn) {
              setActiveTab('settings')
            }
            return
          }
        } catch (_) {}

        // 后端可能正在被 DSH 宿主环境静默唤醒中，启动渐进重试
        if (retryCount < 8) {
          setIsStartingService(true)
          setTimeout(() => checkStatus(retryCount + 1), 800)
        } else {
          setIsStartingService(false)
          setStatusChecked(true)
        }
      }, [])

      useEffect(() => {
        checkStatus(0)
      }, [checkStatus])

      // Keyboard-first 极客快捷键: 数字键 1~8 秒切 8 大 Tab
      useEffect(() => {
        const handleKeyDown = (e) => {
          const tag = e.target?.tagName?.toLowerCase()
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
            return
          }
          const tabMap = {
            '1': 'schedule',
            '2': 'grades',
            '3': 'studyPlan',
            '4': 'exams',
            '5': 'classrooms',
            '6': 'services',
            '7': 'grab',
            '8': 'settings',
          }
          if (tabMap[e.key]) {
            e.preventDefault()
            setActiveTab(tabMap[e.key])
          }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
      }, [])

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
              )
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', fontSize: '13px' } },
                h('span', {
                  style: {
                    ...S.statusDot(isLoggedIn),
                    background: isStartingService ? '#f59e0b' : (isLoggedIn ? '#10b981' : '#71717a'),
                    boxShadow: isStartingService ? '0 0 8px rgba(245, 158, 11, 0.4)' : (isLoggedIn ? '0 0 8px rgba(16, 185, 129, 0.3)' : 'none'),
                  }
                }),
                h('span', { style: { color: 'var(--dsw-alias-text-sub, #71717a)' } },
                  isStartingService
                    ? '正在自动唤醒后台服务...'
                    : (isLoggedIn ? `${studentName || '已连接'}` : '未连接教务处')
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
              '课表'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'grades'),
              onClick: () => setActiveTab('grades'),
            },
              h(ChartIcon, { size: 14, style: { marginRight: '6px' } }),
              '成绩'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'studyPlan'),
              onClick: () => setActiveTab('studyPlan'),
            },
              h(CompassIcon, { size: 14, style: { marginRight: '6px' } }),
              '培养方案'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'exams'),
              onClick: () => setActiveTab('exams'),
            },
              h(FileTextIcon, { size: 14, style: { marginRight: '6px' } }),
              '考试'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'classrooms'),
              onClick: () => setActiveTab('classrooms'),
            },
              h(LibraryIcon, { size: 14, style: { marginRight: '6px' } }),
              '自习'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'services' || activeTab === 'electricity'),
              onClick: () => setActiveTab('services'),
            },
              h(GridIcon, { size: 14, style: { marginRight: '6px' } }),
              '微服务'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'grab'),
              onClick: () => setActiveTab('grab'),
            },
              h(CrosshairIcon, { size: 14, style: { marginRight: '6px' } }),
              '选课'
            ),
            h('button', {
              style: S.tabBtn(activeTab === 'settings'),
              onClick: () => setActiveTab('settings'),
            },
              h(SettingsIcon, { size: 14, style: { marginRight: '6px' } }),
              '账号'
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
              : h('div', { key: activeTab, className: 'scu-tab-content' },
                  activeTab === 'schedule' && h(ScheduleView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'grades' && h(GradesView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'studyPlan' && h(StudyPlanView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'exams' && h(ExamsView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'classrooms' && h(ClassroomsView, { onRequireLogin: () => setActiveTab('settings') }),
                  (activeTab === 'services' || activeTab === 'electricity') && h(ServicesView, { onRequireLogin: () => setActiveTab('settings') }),
                  activeTab === 'grab' && h(CourseGrabView, { onRequireLogin: () => setActiveTab('settings') })
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
