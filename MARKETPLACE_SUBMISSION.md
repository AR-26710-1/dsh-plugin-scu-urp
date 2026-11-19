# DSH 官方插件市场 (Marketplace) 上架提交流程与物料清单

> **目标**：通过向 DeepSeek Harness 官方插件索引仓库提交 Pull Request（方式 A），将本项目正式收录进 DSH 官方插件市场，供所有用户在线搜索、一键安装使用。

---

## 📌 第一步：仓库公开化（前置核心要求）

由于目前仓库处于私有（Private）状态，官方市场收录机器人与普通用户在安装插件时，无法直接拉取私有仓库的代码或元数据。在发起 PR 前，需将仓库转为 **Public（公开）**。

### 仓库安全性自检确认
本项目已完成全方位的脱敏与安全隔离：
-  **0 密钥泄露风险**：用户登录凭据与会话缓存仅存储于用户本机的 `server/.credentials.json`，且已通过 `.gitignore` 和 `.npmignore` 彻底隔离，仓库内绝无任何个人敏感数据；
-  **0 商标侵权风险**：官方校徽已全部替换为原创黑白简笔学术学位帽矢量图；
-  **0 依赖冗余**：测试日志、临时缓存与大体积二进制文件均已规范隔离。

### 公开化操作步骤（耗时约 30 秒）
1. 打开项目 GitHub 页面：[https://github.com/AR-26710-1/dsh-plugin-scu-urp](https://github.com/AR-26710-1/dsh-plugin-scu-urp)
2. 点击顶部导航栏右侧的 **Settings (设置)**；
3. 滚动到底部的 **Danger Zone (危险区域)**；
4. 找到 **Change repository visibility (更改仓库可见性)**，点击 **Change to public (设为公开)**；
5. 输入仓库名称 `AR-26710-1/dsh-plugin-scu-urp` 进行确认即可。

---

## 🚀 第二步：发布 GitHub Release v1.0.0

为了让 Windows 用户无需安装 Python 即可零门槛使用，建议在 GitHub 仓库发布正式 Release，并挂载本地打包好的免安装单文件与精简插件包。

### 挂载资产清单（本地均已就绪）
- **精简插件包**：`dsh-plugin-scu-urp-1.0.0.tgz` (仅 189 KB，位于项目根目录)
- **免安装独立服务程序**：`bin/scu-urp-service.exe` (154 MB，内嵌 Python 3.12 核心与 ONNX 识别模型)

### 发布步骤
1. 打开 GitHub 仓库页面右侧的 **Releases** -> 点击 **Create a new release**；
2. **Choose a tag**：输入 `v1.0.0` 并点击 *Create new tag*；
3. **Release title**：`v1.0.0 - SCU URP & Microservices Assistant (AI-Crafted Edition)`；
4. **Description**：直接粘贴下方推荐的 Release 说明文案；
5. **Attach binaries**：将项目根目录下的 `dsh-plugin-scu-urp-1.0.0.tgz` 与 `bin/scu-urp-service.exe` 拖入上传框；
6. 点击 **Publish release**。

---

## 📝 第三步：向 DSH 官方插件仓库提交 PR

在官方插件索引仓库（如 `deepseek-ai/dsh-plugins`）的 `community-plugins.json` 或 `plugins/` 目录提交 PR，直接使用以下为您准备的标准化物料：

### 1. 提交至官方 `plugins.json` 的条目代码 (Entry JSON)
```json
{
  "id": "dsh-plugin-scu-urp",
  "name": "四川大学教务与微服务助手 (AI 原生创作)",
  "displayName": "川大教务处",
  "version": "1.0.0",
  "description": "[AI 原生协同创作] 四川大学教务系统与微服务助手：竹云统一认证免密自动登录、高颜值课表、手机日历同步、培养方案大纲与保研 GPA 测算、随堂作业备忘、考试倒计时与自习室查询、宿舍电费与一卡通流水大厅。",
  "author": "AR-26710-1 (Co-created with DeepSeek AI Agent)",
  "repo": "https://github.com/AR-26710-1/dsh-plugin-scu-urp",
  "branch": "main",
  "icon": "icon.svg",
  "license": "MIT",
  "aiCoCreated": true,
  "category": "Education & Utilities",
  "tags": [
    "education",
    "scu",
    "urp",
    "ai-crafted",
    "cordis",
    "dsh-plugin"
  ]
}
```

---

### 2. PR 标题 (Pull Request Title)
```text
feat(marketplace): add dsh-plugin-scu-urp (AI-Crafted SCU URP Assistant)
```

---

### 3. PR 描述正文模板 (PR Body / Description)

```markdown
### 📌 插件基本信息 (Plugin Information)
- **Plugin Name**: 四川大学教务与微服务助手 (dsh-plugin-scu-urp)
- **Repository**: https://github.com/AR-26710-1/dsh-plugin-scu-urp
- **License**: MIT
- **Category**: Education & Utilities
- **Target Audience**: 四川大学本硕博学生及教职工

---

### 🤖 AI 原生协同创作声明 (AI Co-Creation Statement)
- 本插件属于 **AI 原生结对协同创作（AI-Crafted Plugin）**，由人类开发者（@AR-26710-1）与 **DeepSeek AI Agent** 深度协同构建；
- 全栈覆盖底层 IDaaS/URP 逆向协议、国密 SM2/SM3 动态安全加密、SWR 高性能秒开前端交互架构、What-If 均分预测引擎、以及独立单文件免安装环境自愈机制；
- 遵循开放开源准则，不含有任何受保护的第三方版权或商业机密。

---

### 🌟 核心功能一览 (Core Features)
1. **统一身份认证全自动免密登录**：深度对接川大竹云 IDaaS，支持微信/微川大免密扫码与本地硬件级会话加密保活；
2. **现代化高颜值课表与手机日历同步**：支持双校区精准作息时间对齐，一键导出 RFC 5545 标准手机日历文件（.ics）；
3. **培养方案大纲与 What-If 动态均分/保研绩点测算引擎**：首创在读/未修课程动态成绩滑动模拟，实时预测毕业总均分与保研必修加权成绩；
4. **全生命周期校园微服务大厅**：集成宿舍电费双模实时监控与换房向导、实体一卡通消费流水记账图表、校园网在线终端管理与并发下线；
5. **对话 Agent 智能工具联动**：内置 10 大 Cordis Tools，支持在聊天主窗口通过自然语言即时查询课表、自习室与成绩；
6. **零环境门槛独立启动**：内置 154MB 免安装单文件二进制服务与 Python 解释器环境自愈机制，普通用户无需配置 Python 环境即可开箱即用。

---

### 🛡️ 知识产权与合规声明 (Compliance & IP)
- **视觉图标脱敏**：完全使用原创黑白简笔学术学位帽矢量图（`icon.svg` 与 UI 内部组件），严格规避任何高校官方注册商标与专有印章；
- **第三方开源协议合规**：完整梳理并声明了所有第三方开源组件的 SPDX 许可证标识（详见项目 `THIRD_PARTY_NOTICES.md`）；
- **用户数据隐私**：所有账号密码与会话凭证均经本地硬件加盐对称加密存储，0 数据上传第三方，完全离线与私有化运行。

---

### ✅ 规范自检清单 (Checklist)
- [x] `node --check` 语法校验通过，无外部未声明依赖
- [x] `package.json` 清单包含完整 `dsh` 命名空间与导出规范
- [x] `cordis.patch.yml` 名称与包名严格一致
- [x] `locale/zh.json` 与 `locale/en.json` 提供中英双语展示文案与 AI 创作标识
- [x] 图标为包内原创 SVG（<= 256 KiB）
- [x] 已在本地 DSH 运行环境实机测试通过
```
