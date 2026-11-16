/**
 * DeepSeek Harness - 四川大学教务系统 (URP) Host 插件
 * 遵循 dsh-plugin-guide.md 规范
 * 支持自动托管启动本地 Python 桥接服务
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const inject = ['tools']

export const Config = {
  type: 'object',
  properties: {
    serviceUrl: {
      type: 'string',
      description: '本地 Python URP 适配服务的 HTTP 地址',
      default: 'http://127.0.0.1:48080',
    },
    autoStartServer: {
      type: 'boolean',
      description: '是否在插件加载时自动在后台拉起 Python 适配服务',
      default: true,
    },
  },
  additionalProperties: false,
}

export function apply(ctx, config) {
  const serviceUrl = config?.serviceUrl || 'http://127.0.0.1:48080'
  const autoStart = config?.autoStartServer !== false

  // 0. 自动托管：如果后台服务未运行，则静默自动拉起 Python 后端进程
  if (autoStart) {
    let serverProcess = null

    ctx.effect(() => {
      async function ensureBackendRunning() {
        try {
          const res = await fetch(`${serviceUrl}/api/status`, { signal: AbortSignal.timeout(1000) })
          if (res.ok) return // 已经在线，无需重复启动
        } catch (_) {}

        const serverScript = path.resolve(__dirname, 'server', 'app.py')
        try {
          // 优先定位已安装依赖的 Python 3.12 绝对路径，避免被系统的其它 Python (如 msys/mingw) 干扰
          const localAppData = process.env.LOCALAPPDATA || path.resolve(process.env.USERPROFILE || 'C:\\Users\\30315', 'AppData', 'Local')
          const defaultPy312 = path.resolve(localAppData, 'Programs', 'Python', 'Python312', 'python.exe')
          
          let pyBin = 'py'
          let pyArgs = ['-3.12', serverScript]

          if (process.platform === 'win32') {
            try {
              if (fs.existsSync(defaultPy312)) {
                pyBin = defaultPy312
                pyArgs = [serverScript]
              }
            } catch (_) {}
          } else {
            pyBin = 'python3'
            pyArgs = [serverScript]
          }

          serverProcess = spawn(pyBin, pyArgs, {
            cwd: path.resolve(__dirname, 'server'),
            detached: false,
            stdio: 'ignore',
            windowsHide: true,
          })
          serverProcess.on('error', (err) => {
            console.warn('[SCU-URP] 自动启动 Python 后端服务失败:', err.message)
          })
        } catch (e) {
          console.warn('[SCU-URP] 启动子进程异常:', e.message)
        }
      }

      ensureBackendRunning()

      // 插件卸载/退出时自动回收子进程
      return () => {
        if (serverProcess) {
          try {
            serverProcess.kill()
          } catch (_) {}
          serverProcess = null
        }
      }
    })
  }

  // 1. 注册课表查询工具
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_schedule',
    description: '查询四川大学当前学期的课表数据，包含星期、上课节次、教学楼/教室位置、授课教师及学分信息。',
    parameters: {
      type: 'object',
      properties: {
        filterToday: {
          type: 'boolean',
          description: '是否仅获取今天的课程日程，默认为 false（返回全周课表）。',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询课表失败: ${value.error}` }]
        }
        const d = value.data
        if (d.todayWeekday !== undefined) {
          const courses = d.courses || []
          if (courses.length === 0) {
            return [{ type: 'text', text: '今天没有排定的课程，好好休息吧。' }]
          }
          const list = courses.map(c => `• **${c.name}** (${c.property || '课程'} ${c.credit}学分)\n  教师: ${c.teacher || '未知'}\n  时间: ${c.schedules?.map(s => `周${s.day} 第${s.startSession}~${s.startSession + s.continuingSessions - 1}节 (${s.building} ${s.classroom})`).join('; ')}`).join('\n')
          return [{ type: 'text', text: `**今日课程日程 (${courses.length} 门)**:\n${list}` }]
        }
        return [{ type: 'text', text: `本学期共开设 ${d.totalCourses || 0} 门课程，课表数据已拉取成功。` }]
      },
    },
    async execute(args) {
      try {
        const resp = await fetch(`${serviceUrl}/api/schedule`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        if (args.filterToday) {
          const todayDay = new Date().getDay() || 7
          const todayCourses = (data.courses || []).filter(c =>
            c.schedules?.some(s => s.day === todayDay)
          )
          return {
            success: true,
            data: {
              todayWeekday: todayDay,
              totalCoursesToday: todayCourses.length,
              courses: todayCourses,
            },
          }
        }
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地教务后端: ${e.message}` }
      }
    },
  }))

  // 2. 注册成绩与 GPA 查询工具
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_grades',
    description: '查询四川大学全部学期或指定学期的成绩清单、总学分、平均学分绩点(GPA)与加权平均分。支持仅查看保研/评优必修课加权GPA。',
    parameters: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: '可选：指定学期名称或代码（如 "2024-2025学年秋"），不传则返回全量成绩与总GPA。',
        },
        onlyRequired: {
          type: 'boolean',
          description: '可选：是否仅统计必修课加权绩点（保研排名与奖学金评选标准）。',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询成绩失败: ${value.error}` }]
        }
        const d = value.data
        if (d.term) {
          return [{ type: 'text', text: `**学期 ${d.term}** 共有 ${d.totalCourses} 门成绩记录。` }]
        }
        return [{
          type: 'text',
          text: `**川大成绩与 GPA 统计分析**:\n• **必修课加权绩点 (保研/评奖标准)**: **${d.requiredGpa}** (${d.requiredCourses} 门必修 · ${d.requiredCredit} 学分)\n• 全科综合加权 GPA: **${d.overallGpa}** (总修读 ${d.totalCourses} 门 · ${d.totalCredit} 学分)\n• 综合加权平均分: **${d.overallAvgScore} 分**\n\n• 成绩单导出: [下载标准 Excel/CSV 成绩单表格](${serviceUrl}/api/grades/export-csv?download=true)`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const resp = await fetch(`${serviceUrl}/api/grades`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        if (args.onlyRequired) {
          data.grades = (data.grades || []).filter(g => g.isRequired)
          data.totalCourses = data.requiredCourses
          data.totalCredit = data.requiredCredit
        }
        if (args.term) {
          const filtered = (data.grades || []).filter(g => g.term === args.term)
          return {
            success: true,
            data: {
              term: args.term,
              totalCourses: filtered.length,
              grades: filtered,
            },
          }
        }
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地教务后端: ${e.message}` }
      }
    },
  }))

  // 3. 注册考试日程查询工具
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_exams',
    description: '查询四川大学当前已排定的期末或阶段性考试安排日程、考场地点与考位号。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询考试安排失败: ${value.error}` }]
        }
        const d = value.data
        const exams = d.exams || []
        if (exams.length === 0) {
          return [{ type: 'text', text: '近期暂无已排定的考试安排。' }]
        }
        const list = exams.map(e => `• **${e.courseName}**\n  时间: ${e.examTime}\n  考场: ${e.location || '待定'} (座位: ${e.seatNumber || '见现场'})`).join('\n')
        return [{ type: 'text', text: `**已排定考试安排 (${exams.length} 门)**:\n${list}` }]
      },
    },
    async execute() {
      try {
        const resp = await fetch(`${serviceUrl}/api/exams`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地教务后端: ${e.message}` }
      }
    },
  }))

  // 4. 注册日历导出工具
  ctx.effect(() => ctx.tools.register({
    name: 'scu_export_calendar',
    description: '将四川大学课表导出为标准手机日历文件 (.ics / iCalendar 格式)，可直接导入 iPhone、Mac、Android 手机系统日历或 Outlook。支持自定义开学周一日期与课前提醒。',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: '开学第一周周一的公历日期 (格式 YYYY-MM-DD)，默认为 2026-08-31',
        },
        alarmMinutes: {
          type: 'number',
          description: '上课前提前提醒分钟数，默认为 15 分钟',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          eventCount: { type: 'number' },
          startDate: { type: 'string' },
          alarmMinutes: { type: 'number' },
          downloadUrl: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `导出日历失败: ${value.error}` }]
        }
        return [{
          type: 'text',
          text: `**课表日历已成功生成**\n• 共生成 **${value.eventCount}** 个上课日程事件\n• 开学第一周周一: ${value.startDate}\n• 提前提醒: 课前 ${value.alarmMinutes ?? 15} 分钟\n• **下载链接**: [点击下载 .ics 日历文件](${serviceUrl}${value.downloadUrl})\n\n**系统导入指引**:\n• **iPhone / Mac**: 点击下载后用系统自带“日历”打开，或发送给手机点击即可全量订阅/添加到日历；\n• **Android / Windows**: 打开系统“日历”应用 -> 账户与设置 -> 从本地 .ics 文件导入。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const query = new URLSearchParams()
        if (args.startDate) query.set('startDate', args.startDate)
        if (typeof args.alarmMinutes === 'number') query.set('alarmMinutes', args.alarmMinutes.toString())
        const resp = await fetch(`${serviceUrl}/api/schedule/export-ics?${query.toString()}`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return data
      } catch (e) {
        return { success: false, error: `无法连接到本地教务后端: ${e.message}` }
      }
    },
  }))

  // 5. 注册空闲自习室查询工具
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_free_classrooms',
    description: '查询四川大学今日或指定日期的空闲教室与考研自习室排期、1~12节占用矩阵、座位容量及空调配置。支持指定校区（江安/望江/华西）与教学楼（一教A/B/C/D、综B、综C、二基楼、基教楼等）。',
    parameters: {
      type: 'object',
      properties: {
        campus: {
          type: 'string',
          description: '校区名称或代号，支持 "江安" (03)、"望江" (01)、"华西" (02)，默认 "江安"',
        },
        building: {
          type: 'string',
          description: '教学楼名称或代号，例如 "一教A座"、"一教B座"、"综B"、"二基楼"、"基教楼A座" 等，默认 "一教A座"',
        },
        date: {
          type: 'string',
          description: '可选：查询日期，格式 YYYY-MM-DD，默认为今天',
        },
        session: {
          type: 'number',
          description: '可选：指定具体第几节 (1~12)，按所选校区官方作息表精准筛选，如第 1 节 (江安 08:15-09:00 / 望江 08:00-08:45)',
        },
        timeSlot: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'all'],
          description: '可选：指定时段，morning(上午1-4节)、afternoon(下午5-9节)、evening(晚上10-12节)、all(全天1-12节)',
        },
        onlyFreeNow: {
          type: 'boolean',
          description: '可选：是否仅返回目标时段或当前时刻正处于空闲状态的教室，默认为 false',
        },
        minCapacity: {
          type: 'number',
          description: '可选：最小座位数容量过滤',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询空闲教室失败: ${value.error}` }]
        }
        const d = value.data
        const rooms = d.classrooms || []
        const freeTargetList = rooms.filter(r => r.isTargetFree)
        const topRooms = freeTargetList.slice(0, 10).map(r => {
          const ac = r.hasAirConditioner ? ' · 空调/研讨' : ''
          return `• **${r.name}** (${r.capacity}座${ac}): 该时段空闲，连续空闲 **${r.consecutiveFreeSessions}** 节`
        }).join('\n')

        return [{
          type: 'text',
          text: `**川大空闲自习室查询 (${d.campus} · ${d.building})**:\n• 查询日期: ${d.queryDate} (第 ${d.teachingWeek} 教学周 · 周${d.dayOfWeek})\n• 目标时段: **${d.targetLabel}**\n• 该时段空闲教室: **${d.targetFreeCount}** 间 / 今日全天空闲: **${d.freeAllDayCount}** 间 (共 ${d.totalClassrooms} 间)\n\n**推荐空闲自习室 (最长连续空闲)**:\n${topRooms || '所选时段该楼栋暂无可用空闲教室'}\n\n提示: 可以在插件面板中切换校区、教学楼、具体节次或查看全天 1~12 节完整占用矩阵。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const query = new URLSearchParams()
        if (args.campus) query.set('campus', args.campus)
        if (args.building) query.set('building', args.building)
        if (args.date) query.set('date', args.date)
        if (typeof args.session === 'number') query.set('session', args.session.toString())
        if (args.timeSlot) query.set('timeSlot', args.timeSlot)
        if (args.onlyFreeNow) query.set('onlyFreeNow', 'true')
        if (typeof args.minCapacity === 'number') query.set('minCapacity', args.minCapacity.toString())

        const resp = await fetch(`${serviceUrl}/api/classrooms/free?${query.toString()}`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地教务后端: ${e.message}` }
      }
    },
  }))

  // 6. 注册培养方案与学分进度查询工具
  ctx.tools.register(agentScope({
    name: 'scu_get_study_plan',
    description: '查询四川大学培养方案与学业进度、毕业要求总学分完成度、已修课程、在读课程及保研必修/总加权平均分。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询培养方案失败: ${value.error}` }]
        }
        const d = value.data
        const bs = d.baseStats || {}
        const pct = d.requiredTotalCredits > 0 ? Math.round(((d.completedCredits + d.inProgressCredits) / d.requiredTotalCredits) * 100) : 0
        return [{
          type: 'text',
          text: `**川大培养方案与学业规划 (${d.major} · ${d.grade})**:\n• 方案名称: **${d.programName}** (${d.college})\n• 学分完成进度: 已修 **${d.completedCredits}** + 在读 **${d.inProgressCredits}** / 要求总学分 **${d.requiredTotalCredits}** 学分 (${pct}%)\n• 当前基准学分加权均分: 总均分 **${bs.overallAvgScore}** 分 (GPA: ${bs.overallGpa}) / 必修均分 **${bs.requiredAvgScore}** 分 (GPA: ${bs.requiredGpa})\n• 方案课程状态: 已完成 **${(d.completedCourses || []).length}** 门 / 在读 **${(d.inProgressCourses || []).length}** 门 / 方案待修 **${(d.pendingCourses || []).length}** 门\n\n提示: 可在插件左侧看板【培养方案与均分模拟】专区中滑动修改在读与待修课程成绩，实时测算未来总均分与保研均分走势。`,
        }]
      },
    },
    async execute() {
      try {
        const resp = await fetch(`${serviceUrl}/api/program/scheme`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地教务后端: ${e.message}` }
      }
    },
  }))

  // 7. 注册宿舍电费查询工具
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_electricity',
    description: '查询四川大学当前绑定宿舍的实时电费与剩余电量（包含空调动力用电与宿舍照明用电）、预估剩余金额、基准电价及当前房间位置。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询宿舍电费失败: ${value.error}` }]
        }
        const d = value.data
        const air = d.air || {}
        const light = d.light || {}
        const airBal = air.balance !== undefined && air.balance !== null ? air.balance.toFixed(2) : '--'
        const lightBal = light.balance !== undefined && light.balance !== null ? light.balance.toFixed(2) : '--'
        const airCost = air.balance !== undefined && air.balance !== null ? (air.balance * (air.price || 0.5464)).toFixed(2) : '--'
        const lightCost = light.balance !== undefined && light.balance !== null ? (light.balance * (light.price || 0.5464)).toFixed(2) : '--'
        
        let warningText = ''
        if ((air.balance !== null && air.balance < 10) || (light.balance !== null && light.balance < 10)) {
          warningText = '\n\n⚠️ **特别提醒**: 部分电量已不足 10 度，请及时通过微川大或智慧川大充值，防止夜间断电。'
        }

        return [{
          type: 'text',
          text: `**川大宿舍电费实时账单 (${d.roomDisplay || '当前宿舍'})**:\n• **绑定身份**: ${d.cusName} (${d.cusNo})\n• **空调动力电费**: **${airBal} 度** (预估剩余 ¥ ${airCost} · 单价 ${air.price || 0.5464} 元/度)\n• **宿舍照明电费**: **${lightBal} 度** (预估剩余 ¥ ${lightCost} · 单价 ${light.price || 0.5464} 元/度)${warningText}\n\n提示: 可在插件左侧看板【宿舍电费】专区中一键刷新或点击【切换宿舍】查询其它寝室。`,
        }]
      },
    },
    async execute() {
      try {
        const resp = await fetch(`${serviceUrl}/api/electricity/status`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地电费后端: ${e.message}` }
      }
    },
  }))
}
