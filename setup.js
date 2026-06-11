#!/usr/bin/env node
/**
 * feishu-mcp-setup
 * 自动配置 feishu-user-plugin MCP，让 Claude 可以读写飞书
 *
 * 用户只需操作两步：
 *   1. 在浏览器窗口扫码登录飞书（获取 Cookie）
 *   2. 扫码授权 OAuth（获取 UAT）
 *
 * 用法：node setup.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execSync, spawnSync } = require('child_process');

const CREDENTIALS_PATH = path.join(os.homedir(), '.feishu-user-plugin', 'credentials.json');
const CLAUDE_JSON_PATH = path.join(os.homedir(), '.claude.json');

// 19 个必要权限 scope
const REQUIRED_SCOPES = [
  'calendar:calendar:readonly',
  'contact:user.base:readonly',
  'contact:user.id:readonly',
  'docs:document.media:download',
  'docs:document.media:upload',
  'docx:document',
  'drive:drive',
  'drive:file:upload',
  'im:chat',
  'im:message',
  'okr:okr.content:readonly',
  'okr:okr.content:writeonly',
  'okr:okr.period:readonly',
  'okr:okr:readonly',
  'search:message',
  'sheets:spreadsheet',
  'task:task',
  'wiki:wiki',
  'wiki:wiki:readonly',
];

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`✅ ${msg}`); }
function info(msg) { console.log(`ℹ️  ${msg}`); }
function warn(msg) { console.log(`⚠️  ${msg}`); }

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

function readCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) return { profiles: { default: {} }, active: 'default' };
  try { return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')); } catch { return { profiles: { default: {} }, active: 'default' }; }
}

function writeCredentials(data) {
  fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2));
}

// ─── Step 1: App credentials ───────────────────────────────────────────────

async function ensureAppCredentials(credentials) {
  const profile = credentials.profiles?.default || {};
  if (profile.LARK_APP_ID && profile.LARK_APP_SECRET) {
    ok(`已有应用配置：${profile.LARK_APP_ID}`);
    return credentials;
  }

  log('\n─── Step 1: 飞书自建应用配置 ───');
  log('前往 https://open.feishu.cn 创建应用，获取 App ID 和 App Secret');
  log('应用需要开通以下权限（在开发者后台→权限管理中批量导入）：');
  log(JSON.stringify({ scopes: { tenant: [], user: REQUIRED_SCOPES } }, null, 2));
  log('');

  const appId = await prompt('App ID (cli_xxx): ');
  const appSecret = await prompt('App Secret: ');

  if (!credentials.profiles) credentials.profiles = {};
  if (!credentials.profiles.default) credentials.profiles.default = {};
  credentials.profiles.default.LARK_APP_ID = appId;
  credentials.profiles.default.LARK_APP_SECRET = appSecret;
  credentials.active = 'default';

  writeCredentials(credentials);
  ok('应用配置已保存');
  return credentials;
}

// ─── Step 2: Cookie via Puppeteer ─────────────────────────────────────────

async function extractCookie() {
  log('\n─── Step 2: 获取登录 Cookie ───');
  info('将打开飞书网页，请在浏览器中扫码登录');

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    log('正在安装 puppeteer...');
    execSync('npm install puppeteer', { stdio: 'inherit', cwd: __dirname });
    puppeteer = require('puppeteer');
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--window-size=900,700'],
  });

  const page = await browser.newPage();
  await page.goto('https://feishu.cn/accounts/suite/login', { waitUntil: 'domcontentloaded' });

  log('👆 请在浏览器窗口中扫码登录飞书，登录成功后自动继续...\n');

  // 等待跳转离开登录页（URL 不再含 /accounts/）
  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/accounts/'),
    { timeout: 180000, polling: 1500 }
  );

  // 等几秒让所有 Cookie 落地
  await new Promise(r => setTimeout(r, 3000));

  // CDP 读取全部 Cookie（包含 HttpOnly）
  const client = await page.target().createCDPSession();
  const { cookies } = await client.send('Network.getAllCookies');
  await browser.close();

  const feishuCookies = cookies.filter(c =>
    c.domain.includes('feishu.cn') || c.domain.includes('lark.cn') || c.domain.includes('larksuite.com')
  );

  if (!feishuCookies.some(c => c.name === 'session')) {
    throw new Error('未找到 session cookie，登录可能未完成，请重试');
  }

  const cookieString = feishuCookies.map(c => `${c.name}=${c.value}`).join('; ');
  ok('Cookie 获取成功');
  return cookieString;
}

// ─── Step 3: OAuth for UAT ────────────────────────────────────────────────

async function runOAuth() {
  log('\n─── Step 3: OAuth 授权（获取 UAT）───');
  info('将打开授权页面，请扫码授权');

  try {
    // feishu-user-plugin oauth 会启动本地服务并打开浏览器
    spawnSync('npx', ['-y', 'feishu-user-plugin', 'oauth'], {
      stdio: 'inherit',
      env: { ...process.env, FEISHU_PLUGIN_PROFILE: 'default' },
    });
    ok('UAT 授权完成');
  } catch (e) {
    warn('OAuth 步骤出错，可稍后手动运行：npx feishu-user-plugin oauth');
  }
}

// ─── Step 4: 写入 ~/.claude.json MCP 配置 ────────────────────────────────

function updateClaudeJson() {
  log('\n─── Step 4: 写入 MCP 配置 ───');

  let config = {};
  if (fs.existsSync(CLAUDE_JSON_PATH)) {
    try { config = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8')); } catch {}
  }

  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers['feishu-user-plugin'] = {
    command: 'npx',
    args: ['-y', 'feishu-user-plugin'],
    env: { FEISHU_PLUGIN_PROFILE: 'default' },
  };

  fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));
  ok('~/.claude.json 已更新');
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  log('');
  log('╔══════════════════════════════════════╗');
  log('║     Feishu MCP Setup  v1.0           ║');
  log('║  让 Claude 双向操作飞书               ║');
  log('╚══════════════════════════════════════╝');
  log('');

  let credentials = readCredentials();

  // Step 1: App credentials
  credentials = await ensureAppCredentials(credentials);

  // Step 2: Cookie
  const cookie = await extractCookie();
  credentials.profiles.default.LARK_COOKIE = cookie;
  writeCredentials(credentials);

  // Step 3: OAuth
  await runOAuth();

  // Step 4: claude.json
  updateClaudeJson();

  log('');
  log('🎉 配置完成！');
  log('   重启 Claude Code，然后用 get_login_status 工具验证连接。');
  log('');
  log('   Cookie 会在飞书重新登录后失效，届时重新运行此脚本即可。');
  log('');
}

main().catch(err => {
  console.error('\n❌ 出错了：', err.message);
  process.exit(1);
});
