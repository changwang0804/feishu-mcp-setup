# feishu-mcp-setup

一键配置 [feishu-user-plugin](https://www.npmjs.com/package/feishu-user-plugin) MCP，让 Claude Code 能双向操作飞书。

**用户只需扫两次码**，其余全部自动完成。

---

## 能做什么

配置完成后，Claude 可以：

| 能力 | 示例 |
|------|------|
| 发消息 | 以你的身份发消息到任意群/个人 |
| 读消息 | 读任意群历史、P2P 消息、搜索聊天记录 |
| 操作文档 | 读写飞书文档、Wiki、Bitable |
| 日历任务 | 查看/创建日历事件、任务 |
| OKR | 读取 OKR 进展、写进度记录 |

搭配 [lark-channel-bridge](https://github.com/zarazhangrui/lark-coding-agent-bridge)，还能从飞书直接发消息驱动本地 Claude 执行任务（真正双向）。

---

## 快速开始

### 1. 准备飞书自建应用

前往 [open.feishu.cn](https://open.feishu.cn) 创建企业自建应用，记录 **App ID** 和 **App Secret**。

**开通权限**（开发者后台 → 权限管理 → 右上角「以 JSON 导入」）：

```json
{"scopes":{"tenant":[],"user":["calendar:calendar:readonly","contact:user.base:readonly","contact:user.id:readonly","docs:document.media:download","docs:document.media:upload","docx:document","drive:drive","drive:file:upload","im:chat","im:message","okr:okr.content:readonly","okr:okr.content:writeonly","okr:okr.period:readonly","okr:okr:readonly","search:message","sheets:spreadsheet","task:task","wiki:wiki","wiki:wiki:readonly"]}}
```

**注册 OAuth 回调 URL**（安全设置 → 重定向 URL）：

```
http://127.0.0.1:9997/callback
```

### 2. 运行安装脚本

```bash
git clone https://github.com/YOUR_USERNAME/feishu-mcp-setup
cd feishu-mcp-setup
npm install
node setup.js
```

**过程中你需要操作两次：**
1. 浏览器弹出飞书登录页 → **扫码登录**（自动提取 Cookie）
2. OAuth 授权页 → **扫码授权**（获取 UAT）

### 3. 重启 Claude Code

重启后，在对话中调用 `get_login_status` 工具验证：

```
Cookie: Active
App credentials: Valid
User access token: Valid
```

---

## 技术原理

传统方式需要用户手动从浏览器 DevTools 复制 Cookie（麻烦且容易出错）。

本脚本使用 Puppeteer 的 **Chrome DevTools Protocol `Network.getAllCookies`** 命令，在用户扫码登录后自动提取所有 Cookie（包括 HttpOnly），无需任何手动操作。

```
登录页扫码 → Puppeteer 检测 URL 跳转 → CDP 提取全部 Cookie → 写入配置
```

---

## Cookie 失效

飞书 session 约 30 天过期，重新运行 `node setup.js` 即可刷新（只走 Cookie 步骤，跳过已有配置）。

---

## 相关项目

- [feishu-user-plugin](https://www.npmjs.com/package/feishu-user-plugin) — MCP 插件本体
- [lark-channel-bridge](https://github.com/zarazhangrui/lark-coding-agent-bridge) — 飞书消息驱动本地 Claude CLI
