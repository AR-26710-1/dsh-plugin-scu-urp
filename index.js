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

  // 0. 自动托管：如果后台服务未运行，则静默自动拉起 Python 后端独立守护进程
  if (autoStart) {
    let daemonSpawned = false

    async function isServiceAlive() {
      try {
        const res = await fetch(`${serviceUrl}/api/status`, { signal: AbortSignal.timeout(1000) })
        return res.ok
      } catch (_) {
        return false
      }
    }

    async function ensureBackendRunning() {
      if (await isServiceAlive()) {
        return // 已经在线，无需重复启动
      }

      if (daemonSpawned) return
      daemonSpawned = true

      const serverScript = path.resolve(__dirname, 'server', 'app.py')
      const logDir = path.resolve(__dirname, 'server', 'data')
      try {
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true })
        }
      } catch (_) {}
      const logFile = path.resolve(logDir, 'daemon.log')

      try {
        // 精准定位已安装依赖的 Python 3.12 绝对路径，杜绝被 MSYS2 / MinGW 等无依赖的 Python 干扰
        const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.resolve(process.env.USERPROFILE, 'AppData', 'Local') : 'C:\\Users\\30315\\AppData\\Local')
        const pyCandidates = [
          path.resolve(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
          'C:\\Users\\30315\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
          path.resolve(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
        ]

        let pyBin = 'py'
        let pyArgs = ['-3.12', serverScript]

        if (process.platform === 'win32') {
          for (const cand of pyCandidates) {
            try {
              if (fs.existsSync(cand)) {
                pyBin = cand
                pyArgs = [serverScript]
                break
              }
            } catch (_) {}
          }
        } else {
          pyBin = 'python3'
          pyArgs = [serverScript]
        }

        // 以脱钩独立守护进程模式拉起，重定向输出到 daemon.log
        const outFd = fs.openSync(logFile, 'a')
        const child = spawn(pyBin, pyArgs, {
          cwd: path.resolve(__dirname, 'server'),
          detached: true,
          stdio: ['ignore', outFd, outFd],
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
          },
        })

        child.unref()
        fs.closeSync(outFd)

        // 持续轮询最多 10 秒直至就绪
        let retries = 0
        const timer = setInterval(async () => {
          retries++
          if (await isServiceAlive()) {
            clearInterval(timer)
            console.log(`[SCU-URP] Python 后端服务已成功在后台启动 (PID: ${child.pid}, ${serviceUrl})`)
          } else if (retries >= 20) {
            clearInterval(timer)
            daemonSpawned = false // 允许后续再次尝试拉起
          }
        }, 500)

        child.on('error', (err) => {
          daemonSpawned = false
          console.warn('[SCU-URP] 自动启动 Python 后端服务失败:', err.message)
        })
      } catch (e) {
        daemonSpawned = false
        console.warn('[SCU-URP] 启动子进程异常:', e.message)
      }
    }

    ctx.effect(() => {
      ensureBackendRunning()
      // 保持长效守护，不随 effect 频繁重建而 kill 正常运行的后端
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
  ctx.effect(() => ctx.tools.register({
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

  // 7.15 注册宿舍电费历史抄表与用电走势查询工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_electricity_history',
    description: '查询四川大学宿舍电费的真实历史抄表快照数据、总电费/空调/照明 3 条回路真实用电走势、每日耗电量变化与剩余电量预计可用天数分析。',
    parameters: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          description: '可选：分析近 N 天的用电走势，默认 14 天，可选范围 3 ~ 90 天。',
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
      },
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询宿舍电费历史走势失败: ${value.error}` }]
        }
        const d = value.data
        const s = d.summary || {}
        const days = d.days || 14
        const peakText = s.peakDay ? `• **耗电峰值日**: ${s.peakDay.date} (单日耗电 **${s.peakDay.usedDegrees} 度** · 约 ¥ ${s.peakDay.cost})\n` : ''
        
        let dailyText = ''
        if (d.dailyUsage && d.dailyUsage.length > 0) {
          const recentDays = d.dailyUsage.slice(-5)
          const rows = recentDays.map(item => `  - ${item.date}: 消耗 **${item.usedDegrees} 度** (约 ¥ ${item.cost})`)
          dailyText = `\n\n**近几天单日耗电明细**:\n` + rows.join('\n')
        }

        const insufficientTip = d.isInsufficient ? '\n• **真实数据积累提示**: 当前已记录真实抄表读数少于 2 次，根据 100% 真实数据原则暂不连线。随着后续查询与自动打点，累积到 2 次及以上将自动生成 3 条回路真实走势。' : ''

        return [{
          type: 'text',
          text: `**川大宿舍电费 3 条回路真实用电走势 (近 ${days} 天)**:\n• **当前剩余总电量**: **${s.currentTotalDegrees || 0} 度**\n  - 空调回路: **${s.currentAirDegrees || 0} 度** (约 ¥ ${((s.currentAirDegrees || 0) * 0.5464).toFixed(2)})\n  - 宿舍照明: **${s.currentLightDegrees || 0} 度** (约 ¥ ${((s.currentLightDegrees || 0) * 0.5464).toFixed(2)})\n• **区间日均消耗**: **${s.avgDailyUsage || 0} 度/天** (区间累计消耗 ${s.totalPeriodUsage || 0} 度)\n• **预计可用天数**: 约 **${s.estimatedDaysLeft || '--'} 天** (以当前日均耗电推算)\n${peakText}• **基准电价**: 0.5464 元/度${insufficientTip}${dailyText}\n\n提示: 可在插件左侧看板【宿舍电费】中查看 3 条回路折线图与双模历史抄表流水。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const days = args.days || 14
        const resp = await fetch(`${serviceUrl}/api/electricity/history?days=${days}`)
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

  // 7.2 注册宿舍电费在线购电下单工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_create_electricity_recharge',
    description: '为四川大学宿舍电费创建在线购电充值订单，支持为空调动力用电 (type=1) 或宿舍照明用电 (type=2) 充值 1~500 元，并返回川大官方统一支付中心收银台支付信息与订单号。',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'integer',
          description: '用电回路类型：1 为空调动力电，2 为宿舍照明电。',
          enum: [1, 2],
        },
        amount: {
          type: 'number',
          description: '充值金额 (人民币元)，取值范围 1 ~ 500 元。',
        },
      },
      required: ['type', 'amount'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          orderNo: { type: 'string' },
          amount: { type: 'number' },
          feeType: { type: 'string' },
          roomName: { type: 'string' },
          payUrl: { type: 'string' },
          message: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(_args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `创建宿舍电费充值订单失败: ${value.error || value.message}` }]
        }
        const estKwh = (value.amount / 0.5464).toFixed(2)
        return [{
          type: 'text',
          text: `⚡ **四川大学宿舍电费购电订单已生成**:\n• **订单编号**: \`${value.orderNo}\`\n• **充值项目**: ${value.feeType} (${value.type === 1 ? '空调动力回路' : '照明回路'})\n• **充值金额**: **¥ ${value.amount} 元** (折合预估约 **${estKwh} 度**)\n• **充值房间**: ${value.roomName}\n• **支付网关**: 四川大学统一支付中心官方收银台\n\n💡 **支付方式**: 请在插件左侧的微服务大厅【宿舍用电】看板中点击【在线购电】，系统将自动拉起官方聚合支付收银台完成微信扫码支付；资金直达川大财务处，支付后系统将自动刷新电表度数。`,
        }]
      },
    },
    async execute(args) {
      try {
        const resp = await fetch(`${serviceUrl}/api/electricity/recharge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: args.type,
            amount: args.amount,
          }),
        })
        const data = await resp.json()
        if (!resp.ok || !data.success) {
          return { success: false, error: data.detail || data.message || `HTTP ${resp.status}` }
        }
        return {
          success: true,
          orderNo: data.orderNo,
          amount: data.amount,
          feeType: data.feeType,
          type: data.type,
          roomName: data.roomName,
          payUrl: data.payUrl,
          message: data.message,
        }
      } catch (e) {
        return { success: false, error: `无法连接到本地充值服务: ${e.message}` }
      }
    },
  }))

  // 8. 注册校园一卡通查询工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_card_info',
    description: '查询四川大学学生校园一卡通的实时物理卡余额、今日消费总额、近 30 天消费流水笔数与近期档口消费明细（如食堂、校车、超市等）。',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: '可选：返回最近流水明细的最大条数，默认为 5 条，最多 30 条。',
        },
        refresh: {
          type: 'boolean',
          description: '可选：是否强制穿透缓存从四川大学微服务平台拉取最新数据。',
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
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询校园一卡通失败: ${value.error}` }]
        }
        const d = value.data
        const limit = args?.limit || 5
        const records = (d.records || []).slice(0, limit)
        
        let recordListText = ''
        if (records.length > 0) {
          const rows = records.map((r, i) => {
            const isRecharge = r.type && (r.type.includes('充值') || r.type.includes('补助'))
            const sign = isRecharge ? '+' : '-'
            return `${i + 1}. **${r.merchant}** · ${r.datetime || `${r.date} ${r.time}`} · ${sign}¥ ${r.amount.toFixed(2)}${r.balance ? ` (余 ¥ ${r.balance})` : ''}`
          })
          recordListText = `\n\n**近期消费流水明细 (前 ${records.length} 笔)**:\n` + rows.join('\n')
        } else {
          recordListText = '\n\n近期暂无校园卡消费流水。'
        }

        return [{
          type: 'text',
          text: `**川大校园一卡通实时信息**:\n• **实体卡物理余额**: **¥ ${d.balance}** (卡片服务状态: **${d.cardStatus || '正常'}**)\n• **今日在校支出**: **¥ ${d.todaySpent !== undefined ? d.todaySpent.toFixed(2) : '--'}**\n• **近 30 天消费总计**: **¥ ${d.totalSpent !== undefined ? d.totalSpent.toFixed(2) : '--'}** (${d.recordCount || 0} 笔流水 · 统计区间: ${d.dateRange || '近30天'})\n• **最近同步时间**: ${d.lastUpdated || '--'}${recordListText}\n\n提示: 可通过微信【微川大】服务号或手机端【智慧川大 APP】进行在线充值，充值后可在食堂圈存机贴卡补登。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const refreshParam = args.refresh ? '?refresh=true' : ''
        const resp = await fetch(`${serviceUrl}/api/wfw/card/status${refreshParam}`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))

  // 8.1 注册校园一卡通每日花费统计工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_card_bookkeeping',
    description: '查询四川大学校园一卡通每日花费统计，包括今日、本周、本月的支出汇总、日均花费、近 14 天每日花费走势与按天账单清单。',
    parameters: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: '可选：是否强制刷新并重新计算一卡通每日消费账单。',
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
      },
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `获取一卡通每日花费统计失败: ${value.error}` }]
        }
        const d = value.data
        const s = d.summary || {}
        
        let dailyText = ''
        if (d.dailyExpenseList && d.dailyExpenseList.length > 0) {
          const recentDays = d.dailyExpenseList.slice(0, 5)
          const rows = recentDays.map(item => `  - **${item.date} (${item.weekday})**: 支出 **¥ ${item.totalSpent.toFixed(2)}** (${item.count} 笔)${item.rechargeAmt > 0 ? ` · +¥ ${item.rechargeAmt.toFixed(2)} 充值` : ''}`)
          if (rows.length > 0) {
            dailyText = `\n\n**近期每日花费汇总**:\n` + rows.join('\n')
          }
        }

        const maxDay = s.maxDay ? `\n• **单日最高花费**: **¥ ${s.maxDay.amount.toFixed(2)}** (${s.maxDay.date} · 共 ${s.maxDay.count} 笔)` : ''
        const maxExp = s.maxExpense ? `\n• **单笔最高消费**: **¥ ${s.maxExpense.amount}** (${s.maxExpense.merchant} · ${s.maxExpense.datetime || s.maxExpense.date})` : ''

        return [{
          type: 'text',
          text: `**川大校园一卡通每日花费统计**:\n• **物理卡当前余额**: **¥ ${d.balance || '0.00'}**\n• **今日总支出**: **¥ ${s.todaySpent !== undefined ? s.todaySpent.toFixed(2) : '--'}**\n• **本周累计支出**: **¥ ${s.weekSpent !== undefined ? s.weekSpent.toFixed(2) : '--'}** (周一至今)\n• **本月累计支出**: **¥ ${s.monthSpent !== undefined ? s.monthSpent.toFixed(2) : '--'}** (当月1日至今)\n• **区间日均花费**: 约 **¥ ${s.avgDailySpent !== undefined ? s.avgDailySpent.toFixed(2) : '--'} / 天**\n• **累计充值金额**: **¥ ${s.totalRecharge !== undefined ? s.totalRecharge.toFixed(2) : '0.00'}**${maxDay}${maxExp}${dailyText}\n\n提示: 可在插件左侧看板【校园一卡通】中查看每日花费柱状图、按天流水明细并为每笔交易随手添加自定义备注。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const refreshParam = args.refresh ? '?refresh=true' : ''
        const resp = await fetch(`${serviceUrl}/api/wfw/card/bookkeeping${refreshParam}`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))

  // 9. 注册校园网在线终端状态查询工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_network_status',
    description: '查询四川大学校园网当前在线终端设备清单、当前并发连接数与上限（通常为 3 台）、各终端分配的内网 IP 与物理 MAC 地址、设备类型推测。',
    parameters: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: '可选：是否强制穿透缓存实时检测当前在线终端。',
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
          return [{ type: 'text', text: `查询校园网终端状态失败: ${value.error}` }]
        }
        const d = value.data
        const maxDev = d.maxDevices || 3
        const isFull = d.deviceCount >= maxDev
        const quotaNotice = isFull ? '⚠️ **名额已满 (无法接入新终端)**' : '✅ **配额充裕**'

        let deviceListText = ''
        if (d.devices && d.devices.length > 0) {
          const rows = d.devices.map((dev, i) => {
            return `${i + 1}. **${dev.deviceType || '接入终端'}** · IP: \`${dev.ip || '--'}\` · MAC: \`${dev.mac || dev.deviceId}\` · 状态: 在线`
          })
          deviceListText = `\n\n**在线终端清单 (${d.devices.length} 台)**:\n` + rows.join('\n')
        } else {
          deviceListText = '\n\n当前未检测到在线终端设备。'
        }

        return [{
          type: 'text',
          text: `**川大校园网在线终端监控**:\n• **并发设备数**: **${d.deviceCount || 0} / ${maxDev} 台** (${quotaNotice})\n• **远程踢出权限**: **${d.canOffline ? '支持远程强制下线' : '受限'}**\n• **网络接入环境**: SCU-Wireless / 宿舍有线千兆网口\n• **检测时间**: ${d.lastUpdated || '--'}${deviceListText}\n\n提示: 若因达到 3 台上限无法登录新设备，可指示我调用 \`scu_offline_network_device\` 工具远程下线设备释放名额。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const refreshParam = args.refresh ? '?refresh=true' : ''
        const resp = await fetch(`${serviceUrl}/api/wfw/network/status${refreshParam}`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))

  // 10. 注册校园网设备远程强制下线工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_offline_network_device',
    description: '远程强制下线四川大学校园网中的指定在线终端设备，释放并发连接配额，解决“超出 3 台设备限制导致新设备无法认证上网”的问题。',
    parameters: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: '必填：需要下线的设备 MAC 地址（支持格式如 "FE:05:A9:9B:39:A3" 或 "FE05A99B39A3"）。',
        },
        ip: {
          type: 'string',
          description: '可选：目标设备的分配 IP 地址。',
        },
      },
      required: ['deviceId'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['success'],
        additionalProperties: true,
      },
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `下线设备失败: ${value.error}` }]
        }
        return [{
          type: 'text',
          text: `✅ **校园网设备下线成功**:\n• **目标设备 MAC**: \`${args.deviceId}\`${args.ip ? `\n• **目标设备 IP**: \`${args.ip}\`` : ''}\n• **状态**: **已从四川大学校园网强制踢出下线，成功释放 1 个并发连接名额**。\n• **后续**: 您的新电脑或手机现在可以打开 Portal 登录页面进行接入认证。`,
        }]
      },
    },
    async execute(args = {}) {
      if (!args.deviceId) {
        return { success: false, error: '缺少必须的设备 MAC 地址 (deviceId)' }
      }
      try {
        const cleanMac = args.deviceId.replace(/[:-]/g, '').toUpperCase().trim()
        const resp = await fetch(`${serviceUrl}/api/wfw/network/offline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: cleanMac, ip: args.ip || '' }),
        })
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, message: data.message || '终端已成功下线' }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))

  // 12. 注册全校微应用广场与全局搜索工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_app_square',
    description: '搜索或浏览四川大学微服务平台 9 大分类全量 60+ 微应用（包含校车、体育场馆预约、体测、报修、校历、失物招领、第二课堂等），获取官方直达链接与所属分类。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '可选：搜索微应用名称或业务关键词（如 "校车", "场馆", "报修", "体测", "请假"）。不传则返回常用精选微应用列表。',
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
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `获取微应用广场失败: ${value.error}` }]
        }
        const d = value.data
        const kw = args?.keyword?.trim()
        const apps = d.apps || d.allApps || []
        
        let appListText = ''
        if (apps.length > 0) {
          const rows = apps.slice(0, 10).map((a, i) => {
            return `${i + 1}. **${a.name}** (${a.category}) · [打开微应用 ↗](${a.link})`
          })
          appListText = `\n\n**匹配微应用 (共 ${apps.length} 个)**:\n` + rows.join('\n')
        } else {
          appListText = '\n\n未匹配到相关微应用，可在微服务大厅浏览全部分类。'
        }

        return [{
          type: 'text',
          text: `**川大微服务平台应用广场**${kw ? ` (搜索: "${kw}")` : ''}:${appListText}\n\n提示: 点击应用链接可免密跳转至川大对应微服务官方页面。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const kw = args.keyword ? encodeURIComponent(args.keyword.trim()) : ''
        const url = kw ? `${serviceUrl}/api/wfw/apps/search?keyword=${kw}` : `${serviceUrl}/api/wfw/apps/all`
        const resp = await fetch(url)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))

  // 13. 注册校园交通车 / 校车时刻表工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_shuttle_bus',
    description: '查询四川大学望江校区、江安校区与华西校区之间的官方校车班车运行时刻表、当前时间下一班待发班车与发车倒计时。',
    parameters: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: '可选：指定查询路线，可选值为 "wj_ja" (望江到江安), "ja_wj" (江安到望江), "wj_hx" (望江到华西), "ja_hx" (江安到华西)，不传则返回全线概览与下一班车。',
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
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询校车时刻表失败: ${value.error}` }]
        }
        const d = value.data
        const nextTip = d.nextBus 
          ? `• **下一班待发校车**: **${d.nextBus}** (距发车还有 **${d.countdownMinutes} 分钟**)\n`
          : '• **今日班次**: **今日计划班车已全部发车完毕**\n'

        let routeDetails = ''
        if (d.routes && d.routes.length > 0) {
          const rows = d.routes.map(r => {
            const timetableStr = Array.isArray(r.timetable) ? r.timetable.slice(0, 8).join(', ') + ' ...' : r.timetable
            return `• **${r.name}**: ${r.station}\n  班次: ${timetableStr}`
          })
          routeDetails = '\n\n**各校区乘车点与主要班次**:\n' + rows.join('\n')
        }

        return [{
          type: 'text',
          text: `**川大校园交通车 (校车) 时刻看板**:\n• **当前运行模式**: **${d.dayTypeText || '工作日班次'}** (当前时间: ${d.currentTime})\n${nextTip}• **乘车费用**: 4 元 / 5 元 (学生可直接刷校园一卡通)${routeDetails}\n\n提示: 高峰期学校会根据排队人数增派加班车，请提前 5-10 分钟到达乘车点候车。`,
        }]
      },
    },
    async execute() {
      try {
        const resp = await fetch(`${serviceUrl}/api/wfw/bus/schedule`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))

  // 14. 注册校园卡失物招领自查工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_lost_cards',
    description: '查询四川大学全校一卡通失物招领最新记录，自动排查本人校园卡是否已被拾获登记，或按学号检索招领信息。',
    parameters: {
      type: 'object',
      properties: {
        student_id: {
          type: 'string',
          description: '可选：指定检索的学号或卡号，若不传则自动排查当前登录学生的校园卡。',
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
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询校园卡失物招领失败: ${value.error}` }]
        }
        const d = value.data
        const isSafeText = d.isSafe 
          ? '✅ **安全**：您的校园卡当前未在全校失物招领名单中。'
          : `⚠️ **注意**：检测到您的校园卡已被拾获！请尽快核实领取。`

        let recordsText = ''
        if (d.records && d.records.length > 0) {
          const rows = d.records.slice(0, 5).map((r, i) => {
            return `${i + 1}. 卡号 **${r.maskedCardno}** · ${r.date} · 捡拾地: ${r.addr}`
          })
          recordsText = '\n\n**全校最新捡拾登记 (前 5 条)**:\n' + rows.join('\n')
        } else {
          recordsText = '\n\n全校近期暂无未认领的一卡通登记记录。'
        }

        return [{
          type: 'text',
          text: `**川大校园卡失物招领与安全排查**:\n• **自查状态**: ${isSafeText}\n• **全校登记件数**: **${d.totalCount || 0} 件**${recordsText}\n\n认领网点: 江安青春广场一卡通大厅 / 望江基础教学楼一卡通窗口。`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const sidParam = args.student_id ? `?student_id=${encodeURIComponent(args.student_id.trim())}` : ''
        const resp = await fetch(`${serviceUrl}/api/wfw/card/lost_found${sidParam}`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))

  // 15. 注册图书馆读者证与借阅状态工具 (Cordis Tools)
  ctx.effect(() => ctx.tools.register({
    name: 'scu_get_library_info',
    description: '查询四川大学图书馆读者证状态、读者证号、当前在借图书册数、最大可借额度与欠费情况。',
    parameters: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: '可选：是否穿透缓存强制从微服务平台拉取最新读者数据。',
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
      render(args, value) {
        if (!value.success) {
          return [{ type: 'text', text: `查询图书馆状态失败: ${value.error}` }]
        }
        const d = value.data
        return [{
          type: 'text',
          text: `**川大图书馆读者证状态**:\n• **读者证号**: \`${d.readerNo || '--'}\` (${d.readerType || '本科生'})\n• **证件状态**: **${d.status || '正常'}**\n• **当前借阅**: **${d.currentBorrowed || 0} / ${d.maxBorrowable || 30} 册** (已用额度: ${d.borrowPercentage || 0}%)\n• **欠费金额**: **¥ ${d.arrears !== undefined ? d.arrears.toFixed(2) : '0.00'}**\n• **累计借阅**: **${d.totalBorrowed || 0} 册** (注册日期: ${d.registerDate || '--'})\n\n快速入口: [馆藏图书检索 ↗](${d.searchUrl || 'https://wfw.scu.edu.cn/site/library/collection'}) · [我的借阅历史 ↗](${d.historyUrl || 'https://wfw.scu.edu.cn/site/library/history'})`,
        }]
      },
    },
    async execute(args = {}) {
      try {
        const refreshParam = args.refresh ? '?refresh=true' : ''
        const resp = await fetch(`${serviceUrl}/api/wfw/library/status${refreshParam}`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        return { success: true, data }
      } catch (e) {
        return { success: false, error: `无法连接到本地微服务后端: ${e.message}` }
      }
    },
  }))
}
