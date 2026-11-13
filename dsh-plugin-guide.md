# DSH 插件开发教程与规范

> 适用对象：想为 DeepSeek Harness（下称 DSH）编写、审阅、安装插件的人。
> 依据：本机已安装的 DSH 运行环境。文中所有 Service、Event、Slot 名称都以本机实际能力为准——写代码前用 `cordis_inspect_query` 再确认一次，不要凭记忆或旧文档。
> 本文分两半：**教程**（第 1–3、7、8、11 节，带你从零跑通）与**规范**（第 4–6、9、10、12–14 节，约束怎么写得对）。

---

## 1. 心智模型：三层

DSH 的插件不是一个文件，而是三层东西拼起来的：

| 层 | 是什么 | 谁负责 |
|---|---|---|
| **bundle（插件包）** | 一个普通 npm 包，`package.json` 里 `dsh.bundle.patch` 指向一份 YAML 补丁 | 你写 |
| **patch（补丁）** | 往 profile 的插件列表里 `insert` 若干「行」（row）：`id` + `name`（要加载的包）+ 可选 `config` | 你写 |
| **plugin（插件模块）** | 被加载的 JS 模块。Host 半部分 `index.js` 用 `apply(ctx, config)` 注册能力；Web 半部分 `client.js` 往页面插槽注册 React 组件 | 你写 |

安装 = 把 bundle 目录交给 `plugin_manager` 的 `install_bundle`，由它负责装包、选中 bundle、写入 profile 配置。

**三条铁律：**

1. 不要手写 profile 的 `package.json` 或 `cordis.patch.yml`，不要在 `$DSH_HOME` 下建包，不要在 profile 目录里跑 pnpm——这些都由 `install_bundle` 完成，手写会破坏用户配置且需要逐次审批。
2. profile 的 `cordis.patch.yml` 属于用户，里面还有别的插件、注释和 `!!js` 表达式。插件自己的配置只能走 `configEditor` 改。
3. 一切「谁在生效」的判断，看工具返回的 `application` / 警告 / inspection 结果，不要看日志、进程列表或页面 boot 数据。

---

## 2. 三种插件形态

| 形态 | 必需文件 | 能力 | 典型用途 |
|---|---|---|---|
| **Host-only** | `index.js`、`cordis.patch.yml`、`package.json` | 注册工具、提示词、命令、事件监听、HTTP 路由 | 给 agent 加一个工具；改行为策略 |
| **UI（Host + Client）** | 上面 + `client.js`、`dsh.client` 声明 | 在 Web 界面插槽里渲染组件 | 装饰、面板、按钮、Chat 行 |
| **纯配置（MCP）** | `cordis.patch.yml` + `locale` + `icon` | 不改代码接入一个 MCP server | 连第三方 MCP 服务 |

Host-only 与纯配置的 bundle **不需要依赖、安装脚本或构建工具**，一个 `package.json` + 一份 YAML 就能跑。UI 插件用浏览器模块表里的 React，也不要自己再装一份 React。

---

## 3. 从零跑通：一个 Host-only 插件

### 3.1 目录

```
my-plugin/
├── package.json
├── cordis.patch.yml
├── index.js
├── icon.svg
└── locale/
    ├── en.json
    └── zh.json
```

### 3.2 `package.json`

```json
{
  "name": "@local/my-plugin",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["index.js", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

### 3.3 `cordis.patch.yml`

```yaml
- insert:
    - id: my-plugin            # profile 内唯一
      name: '@local/my-plugin' # 与 package.json 的 name 一致
      config: {}               # 可选；由插件的 Config 校验
```

### 3.4 `index.js`：注册一个工具

```js
export const inject = ['tools']

export function apply(ctx, config) {
  ctx.effect(() => ctx.tools.register({
    name: 'hello',
    description: 'Say hello to someone.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Person to greet.' } },
      required: ['name'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
        additionalProperties: false,
      },
      render(_args, value) { return [{ type: 'text', text: value.message }] },
    },
    async execute(args) {
      return { message: `Hello, ${args.name}.` }
    },
  }))
}
```

要点：

- `export const inject = ['tools']` 表示「需要 `tools` 服务」；缺它的 profile 里插件不会被激活，而不是启动报错。
- `ctx.effect(() => ...)` 注册的东西，在插件卸载时自动清理——**所有**资源都这样注册。
- 工具名不能叫 `run_code`（保留名）。
- 工具参数/输出都是 JSON Schema；结果用 `output.render` 决定模型与界面上看到什么。

### 3.5 安装并确认

安装通过工具完成（不是 shell）：

```
plugin_manager({ action: "install_bundle", target: "<bundle 目录的绝对路径>" })
```

然后读返回值：

- `application: applied` 才代表生效；`restart-required` 代表还没生效；`overridden` 代表被更高层覆盖。
- 安装后**用不花审批的 inspection 确认**，而不是再列一遍插件：

```
cordis_inspect_query({ platform: "host", provider: "Config", method: "listConfigs", input: { name: "@local/my-plugin" } })
cordis_inspect_query({ platform: "host", provider: "Tool",   method: "listTools" })
```

前者确认行已加载、后者确认 `hello` 已出现在可调用工具里。

---

## 4. 包清单规范（MUST）

### 4.1 必填字段

| 字段 | 要求 |
|---|---|
| `name` | 与 patch 行的 `name` 一致。本地包用 `@local/xxx` 前缀，避免与官方包冲突 |
| `version` | 语义化版本；替换同包时改版本 |
| `type` | `"module"` |
| `exports` | 至少 `"."`；UI 插件加 `"./client"`；有展示资源时加 `"./locale/*.json"` 与 `"./icon"` |
| `files` | 列出**全部**运行时文件、patch、locale、图标。新增模块/资源必须同步更新 |
| `dsh.bundle.patch` | 指向补丁 YAML 的相对路径 |

### 4.2 UI 插件额外字段

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "immediately": true,
    "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
  }
}
```

- `immediately`：页面启动时加载，而不是等到需要时才懒加载。
- `inject`：只决定激活顺序，**不是**允许 import 的模块白名单。
- 非基线运行时依赖写进 `dsh.client.external`。
- 用部署自带的 Client 构建工具产出编译后的 `client.js` 时，产物必须是下面这种「注册惰性工厂」的形式。

### 4.3 命名

- 包名、行 id、插槽注册 id 都要唯一。
- 行 id 是用户在 profile 里看到的身份，改名等于换一个插件。

---

## 5. patch 规范（Loader 方言）

profile 由「bundle 自带的行列表」加「多层 patch」有序合成。patch 是一个映射：

### 5.1 插入

```yaml
- insert:
    - id: my-plugin
      name: '@local/my-plugin'
      config: {}
```

- 带 `id`、指向一个 `group: true` 的行时，行被插入该组的 `config` 列表内部。
- 插入的相对路径以**补丁文件所在目录**为锚点。

### 5.2 定向覆盖（改已有行）

```yaml
- id: some-existing-row
  disabled: false
```

- 有 `id`、没有 `insert` 时，选中同 id 的既有行，给出的字段覆盖它。
- **`config` 是整体替换，不是深合并**：要把该行需要的每个字段都重写一遍。
- 非空 `id` 才有效；匹配不到任何行、或没有 `id` 的非 insert 补丁会被警告并跳过。
- 真值 `name` 只是「断言这个行就是该插件」，不是重命名。

### 5.3 组与包含

```yaml
- insert:
    - id: my-group
      name: 'cordis:group'
      group: true
      config:
        - id: inner
          name: '@local/my-plugin'
```

`cordis:include` 从 `config.path` 读取一份字面量 YAML/JSON 行列表。

### 5.4 `disabled`

接受布尔、`null` 或 `!!js` 表达式；表达式在每次挂载决策时针对 Loader 上下文求值。被禁用的行不需要 `config`，除非 `group: true` 强制激活。

### 5.5 `!!js` 表达式

```yaml
config:
  root: !!js dshHomePath('sessions')
  enabled: !!js "!ctx.get('profileContext')"
```

- 写法是 `!!js`，**不是** `!js`。
- `config` 内的 `!!js` 在该行声明的注入激活之后求值，对着该插件自己的上下文（`ctx.<service>`）。
- 只用于 `config`；行的其他元数据保持字面量。

### 5.6 `isolate`

服务名映射到 `true` 或领域标签。提供服务的插件会与它的消费者一起被隔离（作用域管贡献与事件可见性，`isolate` 管服务实例）。

### 5.7 行字段速查

一行可以有：`id`、`name`（包名）、`config`、`disabled`、`inject`、`intercept`、`isolate`。

---

## 6. Host 插件规范

### 6.1 导出形式（二选一，不要混用）

```js
// 形式 A：函数式
export const inject = ['tools']          // 可选
export const Config = { /* schema */ }   // 可选
export function apply(ctx, config) {}

// 形式 B：服务类
export default class MyService { /* ... */ }
```

### 6.2 生命周期与清理（MUST）

- 所有资源（工具、监听、路由、定时器、插槽注册……）都在 `apply` 内用 `ctx.effect` / `ctx.on` 注册，并返回清理函数。
- 不要在 `apply` 之外做副作用注册。
- 注册到**别的上下文**（如 `agent.ctx`）的资源有两个所有者：既要在插件自己的 effect 里保留 disposer，也要能被 `agent.ctx` 的销毁移除。插件卸载本身不会销毁 `agent.ctx` 上的注册。

### 6.3 可选依赖

```js
export const inject = ['tools', 'storage']
```

或者 `ctx.inject([...], ...)`。可选服务用 `ctx.get('name')` 并判空，让插件在没有该服务的 profile 里保持不激活，而不是抛错。

### 6.4 Config 与配置持久化

- 声明 `Config` 后，行的 `config` 会在激活时按它校验。**写 `config` 前先 `Config.listConfigs` 查该插件投影出的 JSON Schema**，并顺着 `$defs` 看引用类型。
- 用户可调的值一律放进 `Config`，这样用户能在自己的补丁层里改，升级不丢。
- 插件在 `apply` 返回之后要改自己的配置，只能走配置编辑器：

```js
const entry = ctx.fiber.entry
const editor = ctx.get('configEditor')
if (entry === undefined || editor === undefined) {
  throw new Error('Configuration cannot be saved in this profile')
}
await editor.edit(entry, current => ({ ...current, field: value }))
```

- 回调拿到该行**完整**的当前 config，返回新的完整 config。
- 编辑器会保留文件其余内容、校验候选值、与其他 profile 写入串行化，并拒绝被更高层覆盖的值。**被拒绝或编辑器不存在时要如实告诉用户，不能声称已保存。**
- 改普通字段会**重启插件**让 `apply` 重建状态；声明为 `.volatile()` 的字段原地更新，用 `config.field.get()` 读。
- 秘密（登录拿到的 token、绑定流程的密钥）不要写进配置，存到 `ctx.credentials.modifyRecord()` 的记录里；在 `inject` 里声明 `credentials`，或 `ctx.get('credentials')`。

### 6.5 常用扩展点

| 想做 | 用 |
|---|---|
| 加工具 | `ctx.tools.register()` |
| 加提示词段落 | `ctx.systemPrompt.section()` |
| 给单个 agent 注入上下文 | `agent.inject()`（在 `agent/created` 里做） |
| 加命令 | `ctx.commands.register()` |
| 加 HTTP 路由 | `ctx.webServer.register()` |
| 存插件私有数据 | `ctx.storage`（通过 inspection 找到可用的存储服务） |

> 上表只是入口提示。方法签名、返回类型、作用域语义全部以 `cordis_inspect_query` 的 `Service` 结果为准。

---

## 7. 工具注册规范

### 7.1 一个 `ToolDefinition` 的最小形状

```js
{
  name, description, parameters,       // 模型可见的 schema
  output: { schema, render },          // 结果如何呈现
  execute(args, exec) { ... },         // 返回 JSON 值
  // 可选：projectContent / finalizeContent / timeoutMs /
  //       isConcurrencySafe / presentCall / presentResult
}
```

- `parameters` 是 JSON Schema；`additionalProperties: false` 能减少模型乱传参。
- `execute` 的返回值必须是 JSON 值；文本呈现交给 `output.render`。
- 长任务要支持 `exec.signal` 取消；并发安全才声明 `isConcurrencySafe`。
- 需要给下一步追加上下文用 `exec.deferContext()`；需要结束回合用 `exec.concludeTurn()`。
- 条件注册用第二个参数 `{ when: ctx => boolean }`，不要把判断塞进 `execute`。

### 7.2 策略类机制，从弱到强

| 机制 | 能做 | 不能做 |
|---|---|---|
| `ctx.tools.restrict({ allow, deny })` | 从该作用域移除全局工具 | 加工具 |
| `ctx.tools.guard(exec => reason \| undefined)` | 单调拒绝（同步） | 异步询问用户 |
| waterfall 监听（`tools/pre-execute` 等） | 改写决策 | 必须保住别人的贡献 |
| `system-prompt/assemble` | 替换整份装配 | 加/删工具与文本 |

- 要让拒绝「无论注册顺序都成立」，用 `guard`。
- 需要异步询问用户的决策，从 `tools/pre-execute` 返回 `ask`。
- 隐藏单个 agent 的工具用该 `agent.ctx` 上的 `restrict()`，这样 schema、查找、执行三处一致。
- 观察最终结果用 `tools/result`；`tools/post-execute` 只用来转换结果。
- 不要监听 `system-prompt/assemble` 去加工具或改文本。

---

## 8. Web UI 插件规范

### 8.1 客户端模块形态

`client.js` 注册一个**惰性工厂**，工厂 id 必须等于包名：

```js
window.__ModuleLoader__.load({
  id: '@local/my-decoration',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    function Decor() {
      const [n, setN] = React.useState(0)
      return h('button', {
        type: 'button',
        onClick: () => setN(n + 1),
        // 颜色/间距用主题 token；具体名字查 Theme.listTokens
        style: { border: '1px solid var(--dsw-alias-border)', borderRadius: 8 },
      }, `clicked ${n}`)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'my-decoration',
          order: 5,
        }, Decor))
      },
    }
  },
})
```

- React 从浏览器模块表拿，**不要再装一份**、不要 CDN、不要找 UMD。
- 工厂内部保持无副作用；样式、定时器、监听、注册都在 `apply` 里用 `ctx.effect` / `ctx.on` 注册并返回清理。
- 组件内的样式可以直接渲染成 React 元素，卸载即消失。

### 8.2 选插槽

- 先 `Slots.listSubTree`（可选传 `root` 精确到一个 slot），看这个 slot 的 `kind`、`scope`、props、注册选项和 `replaceRisk`。
- 简单装饰优先选**已经分配了空间**的 slot：`conversation.composer.dock`、`conversation.input.left` / `.right`、`conversation.session.header.actions`、`sidebar.footer.action`。
- 只有确实需要浮层、且位置明确时，才用 `shell.overlay`。
- 不要读别的插件的 DOM、样式表或组件源码去「估算位置」——选一个已经腾出位置的 slot。

### 8.3 页面与面板

- 页面就是 slot 里的 React 组件，**不要**从 Host 提供 HTML 再用 iframe 嵌进来：iframe 拿不到主题 token、亮/暗切换和 `ctx.locale`。
- 用户看到的应该是一个应用：用宿主主题 token（`--dsw-alias-*`）、宿主行高/间距、宿主的 locale。
- 不要 `require('@deepseek-ai/dsh-client-ui-primitives')` 或任何 Harness Client 包。要控件就**把原语抄进你的插件**：复制标记、CSS、行为，类名改成自己的前缀，只保留 token 引用；Modal 焦点、Esc、`role="switch"` + `aria-checked`、Tooltip 定位这些用户依赖的行为要一起抄。
- 组件抛异常会把整个 slot 条目打空（控制台 `slot entry crashed in '<slot>'`），所以控件要自己兜底。
- 不要替换应用根、不要往 `document.body` 追加第二个应用、不要在组件外写 DOM。

### 8.4 会话数据

- 用 slot props 提供的 selector hook 读数据，只订阅最小切片。
- 需要在 Client 显示「从会话推导出的值」时，在 Host 投影上声明 `wire.view`，让值算好再送到客户端；Client 不要自己折叠会话事件。
- 加一条 Chat 行：用 `ctx.uiConversation.events.register()` 注册事件定义，再在 `conversation.chat.node` 下用该定义的 `kind` 注册视图（`kind` 就是渲染 key）。分页、Turn/Step 归位、增量装配由 Conversation 层负责。

### 8.5 文案

可见文案走 Client locale 服务，不要在组件里硬编码一门外语。`.locale/*.json` 里的 `meta.title` / `meta.description` 是插件管理页显示的元数据（见第 12 节）。

---

## 9. 数据、状态与性能规范

1. **会话日志是唯一真相。** 模型能看到的一切都必须能从已提交的会话事件重建；fork / resume / replay 都从日志派生。插件自己的内存只是缓存。
2. **注册是上下文的 effect。** 插件卸载、agent 销毁、slot 收起、profile 补丁都会清掉对应上下文上的注册——先选对「所有者上下文」。
3. **框架驱动，插件计算。** 会话投影、Conversation 装配、slot 渲染已经替你订阅、缓存、发布；自己再订阅、重扫、写 DOM 等于绕开增量机制。
4. **扩展点共享，用最弱的机制。** 越强的机制越要保住别人的贡献。
5. **别人会读你写的数据。** 未知事件类型、旧版本读者、旧缓存都会遇到你写的东西；按 Envelope 提供的字段和版本声明兼容性。

### 9.1 状态

- 每会话派生状态放 `ctx.sessionProjections` 单元，不要监听 `session/event` 再重扫 `session.events`。
- `apply(state, event)` 必须纯且同步；忽略的事件**返回原引用**，不变就零成本。读取用 `stateOf()`；`view()` 在值未变时返回同一引用，从而抑制发布。
- 投影状态保持纯 JSON；字段或折叠语义变了就升 `stateVersion`，缓存会重新检查点，冷读只重放尾部，过期检查点被丢弃。

### 9.2 等待

- 等持久事件：`turn/end`、`assistant/message`、`tool/result`；要渲染实时 token 用 `agent/assistant-stream`。
- **不要轮询 `agent/status`。** `whenIdle()` 不保证「一次后续输入」结束：多个输入可能共用一个运行区间。

### 9.3 唤醒与定时器

- 定时器要发起工作时调 `agent.followup()`（会唤醒 agent）；`agent.inject()` **不会唤醒**，注入的上下文可能一直躺在收件箱里等别的输入。
- 定时器在拥有它的 effect 里清理。

### 9.4 事件写入（硬约束）

- **不要**用新的 `type` 追加会话事件。读者只有在 Envelope 带 `ignorable: true` 时才接受未知事件，而实时 `Session.append()` 不能设置该标记——会话会打不开。
- `appendPluginRecord()` 写的是可忽略的 `plugin:` 记录，但它保留给 DSH 的实验包（会话格式迁移只尽力保留）。
- 正确做法：从既有事件派生状态，或把插件私有数据放进通过 inspection 找到的存储服务。

---

## 10. 用户操作 ↔ Agent 工具：一个操作，两个调用方

当插件 UI 的操作会改应用数据或配置时：

1. **实现一次**：写成一个 Host 服务方法，返回结果或明确状态，失败带原因。
2. **UI 调用**：通过 Client 可调用的 Host 入口（如 `ctx.remote.commands.execute()` 执行的会话命令）调用同一方法，并把失败显示给用户。
3. **工具暴露**：用一份参数与语义一致的工具包装同一方法，工具结果就是它的返回值。相关操作可以共用一个工具 + `action` 参数。

**授权类操作只能人做**：批准工具调用、回答 agent 的提问、放宽策略——这些不给 agent 工具入口。

不要 UI 一套逻辑、工具另一套逻辑。

验证：同一个操作分别从工具和 UI 各做一次，比对状态变化、返回值、失败表现；纯授权操作要验证 agent 无法执行或授权。

---

## 11. MCP 接入（纯配置 bundle）

不需要 Host/Client 入口文件，只写清单和补丁：

```json
{
  "name": "@local/demo-mcp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { "./locale/*.json": "./locale/*.json", "./icon": "./icon.svg" },
  "files": ["cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
- insert:
    - id: demo-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: demo
        transport: streamable-http
        url: http://127.0.0.1:3000/mcp
        failOnStartupError: true
```

- stdio 用 `transport: stdio` + `command`，可选 `args`、`env`、`cwd`。完整 schema 查已安装行的 `Config.listConfigs`。
- 环境里的凭据会被清洗；要引用已有凭据用 Loader 的 `!!js` 表达式，不要把密钥抄进对话文本。
- 装完调用 `mcp__demo__ping`（或任意新出现的 `mcp__<serverName>__<tool>`）验证连接。
- 失败就修同一个 bundle，不要堆出第二个。

---

## 12. 展示资源：标题、描述、图标

插件管理页和设置页**不激活插件**也能读这些，所以它们是插件的门面，必须在安装前写好：

- `locale/<lang>.json` 里的 `meta.title`（能认出来的名字）和 `meta.description`（这项能力做什么）。
- 给用户语言和其他支持的语言各写一份（如 `locale/zh.json`），不要留模板文案。
- 英文标题按句首大写：只有第一个词和专有名词大写，如 `Git worktrees`。
- 图标要原创，或用许可允许再分发的素材，并保留要求的署名。
- 图标可以是 SVG / PNG / JPEG / WebP，≤ 256 KiB，必须在包内；绝对路径、URL、指向包外的符号链接都会被拒。
- 包根插件也可以在 `package.json` 顶层声明 `icon`（相对清单目录），优先级高于 `./icon`。
- 子路径插件（如 `my-plugins/search`）不是包，读不到 `package.json`，要导出 `./search/locale/*.json` 和 `./search/icon`。
- 缺字段时回退到 `package.json` 的 `name` / `description`；缺图用面板默认图；格式错误会有诊断并保留可用文本。
- Host-only 和纯配置的 bundle 也有自己的清单条目，**没有「不需要元数据」的豁免**。只有一次性测试包或用户明确要求时才省略，并在交付报告里说明。

---

## 13. 安装、更新与验证

### 13.1 安装

```
plugin_manager({ action: "install_bundle", target: "<绝对路径或 npm 安装规格>" })
```

- 需要 danger-full-access 或本次审批；每个 `plugin_manager` 动作（包括 `list_plugins`）都要审批，所以只在结果能决定下一步时调用。
- 包安装可能要执行允许的构建脚本；只有在用户**明确同意**后才传 `approvedBuilds`。
- 保留返回的失败与 pending 状态；不要自行用 shell 复现安装步骤。

### 13.2 更新

- 新装 bundle 可以通过 HMR 生效；**替换已安装的包需要重启**才能加载新的 JS 模块代次。
- 不要因为 slot id 没变就推断浏览器代码已更新。
- 客户端插件的热更新只在同一 checkout 下 `pnpm run dev:web` 在跑时才免刷新；否则要重建并刷新页面。

### 13.3 验证清单

安装前：

- [ ] `node --check` 过 JS 语法（在工作区副本上跑，不要在安装目录里跑）
- [ ] `package.json` 是合法 JSON，`exports` / `files` 覆盖所有文件
- [ ] patch 的 `id` / `name` 与清单一致，`config` 字段与 `Config` schema 一致
- [ ] `locale` 有真实标题与描述，图标能被渲染（不只看文件名）

安装后：

- [ ] 读 `install_bundle` 的 `application` 与 `warnings`
- [ ] `cordis_inspect_query` 确认行已加载（`Config.listConfigs`）、能力可用（`Tool.listTools` / `Slots.listSubTree`）
- [ ] UI：样式只用主题 token、没有 import Harness Client 包、控制台没有 slot 崩溃、亮暗两套主题都看一遍
- [ ] 用户操作 ↔ 工具两条路径结果一致（第 10 节）
- [ ] 测试期间改过的用户状态复原

**没有浏览器控制时**：验证只能做到语法、清单、live slot 注册三项，然后如实报告「视觉未验证」。不要用 mock 页面截图冒充验证，不要去找光栅化工具、导 SVG 预览、模拟 React/DOM。

---

## 14. 反模式

| 反模式 | 后果 | 正确做法 |
|---|---|---|
| 手写 profile 的 `cordis.patch.yml` | 破坏用户配置，需逐次审批 | 用 `configEditor` |
| 插件里从包目录向上找 `cordis.patch.yml` | 找到别人的文件 | 用 `ctx.fiber.entry` + `configEditor` |
| patch 里想「深合并」`config` | 被整体替换，字段丢失 | 重写全部字段 |
| 用 `!js` 写表达式 | 解析失败 | 写 `!!js` |
| 自定义 `type` 追加会话事件 | 会话无法再打开 | 从既有事件派生 或 用存储服务 |
| 轮询 `agent/status` | 浪费且不准 | 等 `turn/end` 等持久事件 |
| UI 里 `require` Harness Client 包 | 版本变化即崩/空白 slot | 抄原语代码，只依赖 token |
| iframe 渲染页面 | 没有主题/语言 | 写 slot 里的 React 组件 |
| 组件里往 `document.body` 塞节点 | 生命周期失控 | 只通过 slot 贡献 |
| 图标写绝对路径/URL | 被拒绝 | 放进包内用 `./icon` |
| 在 `$DSH_HOME` 建包 / profile 目录跑 pnpm | 与安装器冲突 | 交给 `install_bundle` |
| 假装已验证视觉效果 | 误导用户 | 说明验证边界 |

---

## 15. 排查顺序

1. **插件没激活**：`Config.listConfigs` 看该行状态（`schema` / `absent` / `inactive` / `tree`）；再看 patch 是否被更高层 `overridden`；再看 `inject` 的服务在本 profile 是否存在。
2. **工具没出现**：`Tool.listTools` 看是否被 `restrict`/`guard` 挡掉；看是否 `when` 条件在当步不成立；看名字是否与保留名冲突。
3. **UI 空白**：控制台找 `slot entry crashed in '<slot>'`；确认工厂 id 等于包名；确认 `dsh.client.platform` 与 `immediately`；确认 slot 名与 `Slots.listSubTree` 完全一致。
4. **改了没生效**：替换包要重启；客户端要重建/刷新；`restart-required` 不是成功。
5. **配置保存失败**：`configEditor` 拒绝会带原因（被更高层覆盖、schema 不符）；如实转述。
6. **会话打不开**：几乎一定是自定义事件类型没有 `ignorable: true`（见 9.4）。

---

## 附录 A：常用 Slot 速查（本机当前快照）

| Slot | kind | 用途 |
|---|---|---|
| `conversation.composer.dock` | list | 输入框下方的常驻条目（简单装饰首选） |
| `conversation.input.left` / `.right` | list | 输入框工具行左右两侧的紧凑控件 |
| `conversation.input.overlay` | list | 输入卡片内的浮动条目 |
| `conversation.session.header.actions` | list | 会话标题旁的操作 |
| `conversation.session.header.utilities` | list | 右对齐的会话工具 |
| `conversation.chat.node` | keyed | 按 `ChatNodeKind` 渲染 Chat 行 |
| `conversation.chat.assistant-actions` | list | 一条 assistant 消息的操作 |
| `conversation.view` | list | 会话目标视图，一次渲染一个 |
| `sidebar.footer.action` | list | 侧栏底部设置旁的操作 |
| `sidebar.panellist` | list | 侧栏全局面板图标 |
| `settings.section` | list | 每个设置页一项 |
| `plugins.detail.section` | list | 插件详情页的附加区块 |
| `shell.overlay` | list | 全框架浮层（确实需要时才用） |

> 表是快照。写之前用 `Slots.listSubTree` 确认 `kind`、`scope`、props 与 `replaceRisk`。

## 附录 B：常用 Service 速查

`tools`、`systemPrompt`、`commands`、`sessionProjections`、`webServer`、`storage` / `storageDomain`、`configEditor`、`credentials`、`workingDirectory`、`agents`、`subagents`、`approval`、`userQuestions`、`web`、`timer`、`terminals`。

## 附录 C：常用 Event 速查

`agent/created`、`agent/pre-step`、`agent/request`、`llm/stream`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`、`tools/result`、`system-prompt/assemble`、`session/event`、`turn/end`、`assistant/message`、`tool/result`、`agent/assistant-stream`、`agent/inbox/spliced`。

> waterfall 监听（`agent/pre-step`、`agent/request`、`llm/stream`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`）不拥有决策时必须 `return next()`；改写 `agent/pre-step` 的决策要展开（`{ ...decision, messages }`），别丢掉 `startsRequestSeries` 这类字段。

## 附录 D：怎么查当前版本的准确 API

```
cordis_inspect_list()                                       # 有哪些 inspection 提供方
cordis_inspect_query({ platform: "host",   provider: "Service", method: "listService", input: { service: "tools" } })
cordis_inspect_query({ platform: "host",   provider: "Event",   method: "listEvents",  input: { event: "tools/pre-execute" } })
cordis_inspect_query({ platform: "host",   provider: "Config",  method: "listConfigs", input: { name: "@local/my-plugin" } })
cordis_inspect_query({ platform: "client", provider: "Slots",   method: "listSubTree", input: { root: "conversation.composer.dock" } })
cordis_inspect_query({ platform: "client", provider: "Theme",   method: "listTokens" })
```

还有两个入口容易忽略：

- 已安装包的 README 和 `lib/types/**/*.d.ts` 在 `packageDir` 下（`Config.listConfigs` 的单条结果里有这个路径）。
- 有 profile 时，`dsh --profile "$DSH_PROFILE" --dump-config` 能打印合成后的 profile 配置。
