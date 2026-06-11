# feishu-mcp-setup

配置 feishu-user-plugin MCP，让 Claude 能双向操作飞书（读消息、发消息、读写文档、操作 Bitable、日历等）。

## 前提条件

- Node.js 18+
- 一个飞书自建应用（App ID + App Secret）
- 飞书网页版账号可正常登录

## 用法

```bash
node ~/.agents/skills/feishu-mcp-setup/setup.js
```

**用户只需操作两件事：**
1. 在弹出的浏览器中**扫码登录飞书**（自动提取 Cookie）
2. **扫码 OAuth 授权**（获取 UAT，用于读取用户数据）

其余全部自动完成。

---

## 飞书应用配置（一次性，可复用）

### 创建应用
前往 [open.feishu.cn](https://open.feishu.cn) → 创建企业自建应用 → 记录 App ID 和 App Secret。

### 开通权限（批量导入）
开发者后台 → 权限管理 → 右上角「以 JSON 导入」，粘贴：

```json
{"scopes":{"tenant":[],"user":["calendar:calendar:readonly","contact:user.base:readonly","contact:user.id:readonly","docs:document.media:download","docs:document.media:upload","docx:document","drive:drive","drive:file:upload","im:chat","im:message","okr:okr.content:readonly","okr:okr.content:writeonly","okr:okr.period:readonly","okr:okr:readonly","search:message","sheets:spreadsheet","task:task","wiki:wiki","wiki:wiki:readonly"]}}
```

### 注册 OAuth 回调 URL
开发者后台 → 安全设置 → 重定向 URL，添加：

```
http://127.0.0.1:9997/callback
```

---

## 验证连接

重启 Claude Code 后，调用 `get_login_status` 工具，应显示：
- Cookie: Active
- App credentials: Valid
- User access token: Valid

---

## Cookie 失效处理

飞书 session 约 30 天过期，重新运行脚本即可刷新。

---

## 技术原理

- **Cookie 提取**：Puppeteer 的 `Network.getAllCookies` CDP 命令可读取所有 Cookie（包括 HttpOnly），无需用户手动进入 DevTools
- **UAT 获取**：`npx feishu-user-plugin oauth` 启动本地 OAuth 服务，扫码后写入 credentials.json
- **配置写入**：自动更新 `~/.feishu-user-plugin/credentials.json` 和 `~/.claude.json`

---

## 搭配使用

与 [zarazhangrui/lark-channel-bridge](https://github.com/zarazhangrui/lark-coding-agent-bridge) 组合，实现完整双向：

| 方向 | 工具 |
|------|------|
| 飞书 → Claude | lark-channel-bridge（扫码启动） |
| Claude → 飞书 | feishu-user-plugin MCP（本 Skill） |
