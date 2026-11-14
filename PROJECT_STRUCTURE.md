# DeepSeek Harness 四川大学教务系统 (URP) 插件 — 项目架构与工程说明书

本文档用于完整记录本项目的**技术架构、工程目录组织、核心模块实现、前后端数据流转、接口清单及安全设计**，便于维护与二次开发。

---

## 1. 项目概览

本项目是专为 **DeepSeek Harness (DSH)** 打造的四川大学综合教务系统（URP）深度集成插件，具备两大核心能力：
1. **左侧二级抽屉可视化看板 (Client UI)**：以无干扰、现代化的侧边抽屉面板呈现，集成了课表、作业待办、成绩分析、考试日程、空闲自习室五大核心模块，采用极简莫兰迪色系与单色镂空简笔画 SVG 图标，亮暗主题自适应。
2. **对话式 Agent 智能工具链 (Cordis Tools)**：向大语言模型开放 4 大核心工具（查课表、查成绩、查考场、查自习室），学生在主对话窗口输入自然语言，AI 即可精准检索并给出建议。

---

## 2. 系统整体架构

```mermaid
flowchart TD
    subgraph DSH["DeepSeek Harness (宿主环境)"]
        subgraph FrontEnd["前端界面 (client.js)"]
            Drawer["侧边二级抽屉主容器 (App)"]
            Nav["顶部导航 Tab (课表/成绩/考试/自习室/设置)"]
            
            TabSchedule["子页面 1: 课表与作业待办看板"]
            TabGrades["子页面 2: 成绩绩点与保研分析"]
            TabExams["子页面 3: 考试倒计时与考场指引"]
            TabRooms["子页面 4: 空闲教室与考研自习室"]
            TabSettings["子页面 5: 账号凭据与保活设置"]
            
            Drawer --> Nav
            Nav --> TabSchedule
            Nav --> TabGrades
            Nav --> TabExams
            Nav --> TabRooms
            Nav --> TabSettings
            
            Cache["前端本地秒开缓存 (SCU_CACHE / Stale-While-Revalidate)"]
            TodoStore["待办数据管理器 (SCU_TODO_STORE)"]
            
            TabSchedule <--> Cache
            TabSchedule <--> TodoStore
            TabGrades <--> Cache
            TabExams <--> Cache
            TabRooms <--> Cache
        end
        
        subgraph AgentTools["Agent 智能工具通道 (index.js)"]
            T1["scu_get_schedule (课表查询)"]
            T2["scu_get_grades (成绩与绩点分析)"]
            T3["scu_get_exams (考试日程查询)"]
            T4["scu_get_free_classrooms (空闲教室与自习室)"]
        end
    end

    subgraph Backend["本地 Python 桥接服务 (127.0.0.1:48080)"]
        FastAPI["FastAPI 路由网关 (server/app.py)"]
        CORS["跨域预检中间件 (CORSMiddleware)"]
        Heartbeat["后台自动心跳保活协程 (_heartbeat_loop)"]
        Client["URP 协议引擎 (server/urp_client.py)"]
        OCR["ddddocr 验证码识别引擎"]
        Store["凭据加密存储 (server/crypto_store.py)"]
        ICS["RFC 5545 日历导出引擎 (server/calendar_exporter.py)"]
        TodosData["作业待办持久化文件 (data/todos.json)"]
        
        FastAPI --> CORS
        FastAPI --> Heartbeat
        FastAPI --> Client
        FastAPI --> Store
        FastAPI --> ICS
        FastAPI --> TodosData
        Client --> OCR
    end

    subgraph Remote["四川大学综合教务处"]
        URP["http://zhjw.scu.edu.cn"]
    end

    FrontEnd -->|HTTP / CORS 跨域请求| FastAPI
    AgentTools -->|HTTP Fetch| FastAPI
    Client -->|Session 连接 / 绕过系统代理 (trust_env=False)| URP
```

---

## 3. 详细工程目录结构

```text
d:\antigravaty\scu教务处/
├── index.js                     # 插件顶层入口：向 DSH 注册侧边栏 Slot、图标以及 4 大 Agent Tools
├── client.js                    # 前端一体化单文件组件：全量 React UI、SVG 图标、秒开缓存与自习室矩阵
├── icon.svg                     # 侧边栏常驻四川大学单色镂空矢量图标
├── package.json                 # 插件元信息与 Cordis 规范配置
├── start.bat                    # 本地 Python 后端极速启动批处理脚本
├── .gitignore                   # Git 忽略配置（忽略凭据文件与个人用户数据）
├── README.md                    # 面向用户的项目使用说明与特性介绍
├── PROJECT_STRUCTURE.md         # 本文档：项目全套架构与工程设计说明
├── URP_API_SPEC.md              # 四川大学综合教务处 (URP) 逆向接口协议手册
│
├── server/                      # 本地 Python 桥接服务目录 (监听 127.0.0.1:48080)
│   ├── app.py                   # FastAPI 后端服务入口（含 CORS、心跳保活、待办持久化、各项 API）
│   ├── urp_client.py            # URP 核心协议类：自动验证码 OCR、MD5动态哈希、课表/成绩/自习室抓取
│   ├── crypto_store.py          # 本地凭据安全存储引擎（基于 Fernet 硬件加盐对称加密）
│   ├── calendar_exporter.py     # RFC 5545 标准 iCalendar (.ics) 日历文件生成器
│   ├── requirements.txt         # Python 运行依赖项声明
│   └── .credentials.json        # 本地加密凭据保存文件 (已加入 .gitignore，安全隔离)
│
├── data/                        # 用户本地数据持久化目录
│   └── todos.json               # 课程随堂备忘与作业待办数据存储 (已加入 .gitignore)
│
└── src/                         # 原始 TypeScript 源码备份与辅助开发目录
    ├── index.ts                 # 源码版入口
    ├── tools/                   # Agent Tools 源码
    └── views/                   # React 抽屉视图源码
```

---

## 4. 核心功能模块设计与实现

### 4.1 课表模块 (`ScheduleView`) 与系统日历导出
- **周网格与列表双模呈现**：
  - 支持“全学期”及第 1~20 教学周动态切换；
  - 自动高亮当天所在的周几，并标注距离最近的一门课程；
  - 自动过滤线上课程/未排课，并在下方设立专属卡片专区展示。
- **四川大学官方作息时间对齐**：
  - 严格依照四川大学教务处官网发布的作息时间表，区分**江安校区**与**望江/华西校区**；
  - 课程弹窗内精准标注起止分钟数。
- **标准手机系统日历导出引擎 (`server/calendar_exporter.py`)**：
  - 支持一键导出标准 `.ics` 文件，可在 iOS 日历、小米/华为/OPPO/vivo、Google Calendar 中直接导入；
  - 包含课前 15 分钟闹钟提醒、授课教师、校区、教学楼、具体教室；
  - 根据课程校区自动选取对应时刻表，做到分钟级精确映射。

### 4.2 课程随堂备忘与作业待办系统 (`SCU_TODO_STORE`)
- **双重持久化保障**：前端 `localStorage` 与本地后端 `data/todos.json` 双向同步，无论刷新页面、换浏览器还是重启服务，待办绝不丢失。
- **课程卡片动态角标**：在网格视图和列表视图的课程卡片右上角，若有未完成作业，自动呈现红底徽章（如 `1待办`）。
- **课程专属详情输入**：点击课程卡片打开详情，直接在弹窗内输入作业或备忘，支持一键勾选完成（打勾加中划线）与删除。
- **全学期作业总览抽屉 (`showTodoDrawer`)**：在课表顶部设常驻入口，一键展开全学期所有课程待办清单，支持“全部 / 待完成 / 已完成”筛选，并能直接跨课程快速添加新作业。

### 4.3 成绩绩点看板与保研必修加权分析 (`GradesView`)
- **自动折算 GPA**：支持五级等级制（A/A-/B+...）与百分制双轨自动折算。
- **保研口径切换**：一键在“全部成绩”与“必修成绩（保研标准）”之间无缝切换，实时重新计算加权平均分与加权 GPA。
- **成绩单 Excel/CSV 导出**：支持一键下载标准 CSV 格式成绩单，方便个人备份与学业规划。

### 4.4 考试日程倒计时 (`ExamsView`)
- 自动提取期末与阶段性考试日程，计算倒计时天数；
- 标注考场校区、教学楼、考室号与个人具体座位号。

### 4.5 空闲教室与考研自习室 (`ClassroomsView`)
- **双校区官方教学作息自适应**：
  - 望江/华西校区：第 1 节 08:00 开始，下午 14:00 开始，晚上 19:30 开始；
  - 江安校区：第 1 节 08:15 开始，下午 13:50 开始，晚上 19:20 开始；
  - 切换校区时，所有时间胶囊、大时段文字均自动匹配。
- **图形化多维筛选**：
  - 4 个大时段 Pill：全天 (1~12节)、上午 (1~4节)、下午 (5~9节)、晚上 (10~12节)；
  - 12 个微型双行时间胶囊：上行节次，下行起始时间，高亮选中态与当前进行中节次虚线提示；
  - 快速过滤：全天空闲教室、所选时段空闲、空调研讨配置；
  - 1~12 节全天占用矩阵条与点击查看详情弹窗，展示连续空闲节数。

### 4.6 性能与保活引擎 (方案 A 落地)
- **教务 Session 自动心跳探针 (`_heartbeat_loop`)**：
  - 后端每 10 分钟发送一次轻量教务探针；
  - 若教务处 Session 超时，使用本地安全凭证自动重新握手，保持登录状态永久在线。
- **前端极速秒开缓存 (`SCU_CACHE / Stale-While-Revalidate`)**：
  - 课表、成绩、考试数据首次加载后存入快照；
  - 再次打开面板时 **0 毫秒首屏瞬开**，后台静默拉取最新数据无缝更新；
  - 离线或教务网维护时优雅降级显示快照，附带更新时间注脚。

---

## 5. 后端 RESTful 接口全览 (127.0.0.1:48080)

| 路径 | 方法 | 描述 | 关键参数 / 返回格式 |
| :--- | :---: | :--- | :--- |
| `/api/status` | GET | 查询本地服务与教务登录状态 | 返回 `{ status, hasCredentials, username, isLoggedIn, studentName }` |
| `/api/login` | POST | 提交学号密码执行登录并可选保存凭据 | Body: `{ username, password, remember }` |
| `/api/logout` | POST | 清除本地保存的凭据与教务 Session | 返回 `{ success, message }` |
| `/api/schedule` | GET | 获取当前学期全量课表与教学周分布 | 返回 `{ semesterId, totalCourses, courses: [...] }` |
| `/api/grades` | GET | 获取全量成绩、各学期统计与加权 GPA | 返回 `{ grades, terms, termStats, totalCredits, gpa }` |
| `/api/exams` | GET | 获取已排定的期末/阶段考试日程 | 返回 `{ exams: [...] }` |
| `/api/schedule/export-ics` | GET | 导出全学期课表为 RFC 5545 .ics 日历 | Query: `startMonday`, `alarmMinutes`, `campus` |
| `/api/grades/export-csv` | GET | 导出成绩单为 CSV/Excel 文件 | Query: `onlyRequired`, `download` |
| `/api/classrooms/buildings` | GET | 获取各校区自习教学楼字典列表 | 返回 `{ campuses, buildings }` |
| `/api/classrooms/free` | GET | 查询指定楼栋、日期、时段空闲教室与 1~12 节矩阵 | Query: `campus`, `building`, `date`, `session`, `timeSlot`, `minCapacity` |
| `/api/todos` | GET | 读取本地所有课程随堂备忘与作业待办 | 返回 `{ todos: [...] }` |
| `/api/todos` | POST | 批量保存更新随堂备忘与作业待办 | Body: `{ todos: [...] }` |

---

## 6. 对话 Agent Tools 清单 (Cordis 注册)

向 DeepSeek Harness 主对话注册了 4 个自然语言可调用的工具：

1. `scu_get_schedule`:
   - 描述：查询四川大学当前学期课程表或今日日程。
   - 参数：`day` (1~7 周几), `week` (1~20 教学周)。
2. `scu_get_grades`:
   - 描述：查询课程成绩、各学期加权平均分及综合 GPA。
   - 参数：`term` (学期), `onlyRequired` (是否仅统计保研必修课)。
3. `scu_get_exams`:
   - 描述：查询期末与阶段性考试安排、考试时间、校区、考场与座位号。
4. `scu_get_free_classrooms`:
   - 描述：查询空闲教室与考研自习室排期、1~12节占用矩阵、座位数及空调配置。
   - 参数：`campus` (江安/望江/华西), `building` (楼栋名称), `date` (查询日期), `session` (第几节), `timeSlot` (时段)。

---

## 7. 视觉与设计规范

- **单色镂空简笔画规范**：完全摒弃任何彩色 Emoji，界面与工具提示统一采用单色镂空矢量 SVG 图标（Feather 规范），笔画规整，高质感。
- **主题双轨自适应**：
  - 自动读取 DSH 宿主 CSS 变量（`--dsw-alias-text`, `--dsw-alias-bg`, `--dsw-alias-border` 等）；
  - 莫兰迪低饱和度课表配色，在深色和浅色模式下均具备极佳对比度与阅读舒适感。
