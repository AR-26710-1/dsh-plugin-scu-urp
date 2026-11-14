/**
 * DeepSeek Harness - 四川大学教务系统 (URP) Host 插件
 * 遵循 dsh-plugin-guide.md 规范
 * 支持自动托管启动本地 Python 桥接服务
 */

import { spawn } from 'node:child_process'
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
              if (path.isAbsolute(defaultPy312)) {
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
          return [{ type: 'text', text: `❌ 查询课表失败: ${value.error}` }]
        }
        const d = value.data
        if (d.todayWeekday !== undefined) {
          const courses = d.courses || []
          if (courses.length === 0) {
            return [{ type: 'text', text: '🎉 今天没有排定的课程，好好休息吧！' }]
          }
          const list = courses.map(c => `• **${c.name}** (${c.property || '课程'} ${c.credit}学分)\n  教师: ${c.teacher || '未知'}\n  时间: ${c.schedules?.map(s => `周${s.day} 第${s.startSession}~${s.startSession + s.continuingSessions - 1}节 (${s.building} ${s.classroom})`).join('; ')}`).join('\n')
          return [{ type: 'text', text: `📅 **今日课程日程 (${courses.length} 门)**:\n${list}` }]
        }
        return [{ type: 'text', text: `📅 本学期共开设 ${d.totalCourses || 0} 门课程，课表数据已拉取成功。` }]
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
    description: '查询四川大学全部学期或指定学期的成绩清单、总学分、平均学分绩点(GPA)与加权平均分。',
    parameters: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: '可选：指定学期代码（如 "2024-2025-1-1"），不传则返回全量成绩与总GPA。',
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
          return [{ type: 'text', text: `❌ 查询成绩失败: ${value.error}` }]
        }
        const d = value.data
        if (d.term) {
          return [{ type: 'text', text: `📊 **学期 ${d.term}** 共有 ${d.totalCourses} 门成绩记录。` }]
        }
        return [{
          type: 'text',
          text: `📊 **全量成绩统计**:\n• 总修读门数: ${d.totalCourses}\n• 总学分: ${d.totalCredit}\n• 综合平均绩点 (GPA): **${d.overallGpa}**\n• 加权均分: **${d.overallAvgScore}**`,
        }]
      },
    },
    async execute(args) {
      try {
        const resp = await fetch(`${serviceUrl}/api/grades`)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return { success: false, error: err.detail || `HTTP ${resp.status}` }
        }
        const data = await resp.json()
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
          return [{ type: 'text', text: `❌ 查询考试安排失败: ${value.error}` }]
        }
        const d = value.data
        const exams = d.exams || []
        if (exams.length === 0) {
          return [{ type: 'text', text: '📝 近期暂无已排定的考试安排。' }]
        }
        const list = exams.map(e => `• **${e.courseName}**\n  时间: ${e.examTime}\n  考场: ${e.location || '待定'} (座位: ${e.seatNumber || '见现场'})`).join('\n')
        return [{ type: 'text', text: `📝 **已排定考试安排 (${exams.length} 门)**:\n${list}` }]
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
}
