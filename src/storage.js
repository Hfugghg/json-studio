// 文件存储适配层。
//
// 本地开发时由 server.mjs 提供 /api 接口，文件落在项目的 json-files/ 目录；
// 静态部署（如 GitHub Pages）没有后端，这里自动退回浏览器 localStorage，
// 让文件面板在线上依然可用。两种模式对调用方暴露同一套接口。

const API = '/api';
const LS_STORE = 'json-editor-files';
const PROBE_TIMEOUT = 1500;

const VIEW_MODES = ['code', 'split', 'tree'];

// null = 尚未探测；true = 服务端；false = 浏览器本地存储
let backendReady = null;

// 探测服务端是否可用，结果会被缓存，整个会话只真正请求一次
export async function detectMode() {
  if (backendReady !== null) return backendReady ? 'server' : 'local';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    const res = await fetch(`${API}/health`, { signal: controller.signal });
    clearTimeout(timer);
    // 静态托管对 /api/health 也可能返回 200 的 index.html，
    // 所以必须确认响应体确实是我们的接口，不能只看状态码。
    const data = res.ok ? await res.json().catch(() => null) : null;
    backendReady = data?.success === true && data?.status === 'running';
  } catch {
    backendReady = false;
  }

  return backendReady ? 'server' : 'local';
}

// ===== 浏览器本地存储 =====

function readStore() {
  try {
    const raw = localStorage.getItem(LS_STORE);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(LS_STORE, JSON.stringify(store));
  } catch {
    throw new Error('浏览器存储写入失败，可能已超出容量限制');
  }
}

function normalizeName(name) {
  return name.endsWith('.json') ? name : `${name}.json`;
}

// UTF-8 字节数，与服务端 stat.size 的口径保持一致
function byteSize(text) {
  return new TextEncoder().encode(text).length;
}

// ===== 服务端接口 =====

async function callServer(path, options) {
  const res = await fetch(`${API}${path}`, options);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务器响应格式错误 (HTTP ${res.status})`);
  }
  if (!data.success) throw new Error(data.error || '未知错误');
  return data;
}

// ===== 统一接口 =====

// 返回 [{ name, size, modified }]
export async function listFiles() {
  if (await detectMode() === 'server') {
    const data = await callServer('/files');
    return Array.isArray(data.files) ? data.files : [];
  }

  return Object.entries(readStore())
    .map(([name, entry]) => ({
      name,
      size: byteSize(entry?.content ?? ''),
      modified: entry?.modified ?? new Date(0).toISOString(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// 返回文件内容的字符串
export async function readFile(name) {
  if (await detectMode() === 'server') {
    const data = await callServer(`/files/${encodeURIComponent(name)}`);
    if (typeof data.content !== 'string') throw new Error('文件内容无效');
    return data.content;
  }

  const entry = readStore()[name];
  if (!entry) throw new Error('文件不存在');
  return entry.content ?? '';
}

// 保存（不存在则创建）
export async function saveFile(name, content) {
  if (await detectMode() === 'server') {
    await callServer(`/files/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return;
  }

  const store = readStore();
  store[name] = { content, modified: new Date().toISOString() };
  writeStore(store);
}

// 新建文件，返回实际使用的文件名
export async function createFile(name, content = '{}') {
  const fileName = normalizeName(name);

  if (await detectMode() === 'server') {
    const data = await callServer('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    return data.name || fileName;
  }

  const store = readStore();
  if (store[fileName]) throw new Error('文件已存在');
  store[fileName] = { content, modified: new Date().toISOString() };
  writeStore(store);
  return fileName;
}

export async function deleteFile(name) {
  if (await detectMode() === 'server') {
    await callServer(`/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
    return;
  }

  const store = readStore();
  delete store[name];
  writeStore(store);
}

// ===== 编辑草稿 =====
//
// 刷新、误关标签页甚至断电，都不该带走用户正在敲的内容 —— 尤其是内容还没
// 保存进文件的时候。这里把「正在编辑的状态」落到 localStorage，由 App 在
// 启动时读回：
//
//   code        当前编辑器里的全文（含尚未保存的改动）
//   currentFile 关联的文件名，null 表示这份内容还没落到任何文件
//   view        代码 / 分屏 / 树形，刷新后保持原来的布局
//   savedAt     最后一次落盘的时间，用于在界面上说明「恢复的是什么时间的内容」
//
// 草稿按标签页分槽，key 后缀是标签页 id（存在 sessionStorage 里）：同时开着几个
// 标签页编辑不同文件时各写各的，不会互相覆盖。读的时候优先取自己标签页那份
// （刷新场景），自己没有才退回最近写入的一份（关掉标签页重开、断电重启）。
//
// 草稿独立于文件存储模式：即使跑在 Express 服务端模式下，草稿也依然只存在
// 浏览器里，两边的数据互不干扰。

const LS_DRAFT_PREFIX = 'json-editor-draft:';
const LS_TAB_ID = 'json-editor-tab-id';
// 同一时刻只保留最近几份草稿，免得陈年草稿一直占着 localStorage
const MAX_DRAFTS = 3;

// 标签页身份：sessionStorage 在同标签页内刷新后仍在、换标签页就换一份，
// 正好等于「一次持续的编辑会话」。
function getTabId() {
  try {
    let id = sessionStorage.getItem(LS_TAB_ID);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(LS_TAB_ID, id);
    }
    return id;
  } catch {
    // sessionStorage 不可用（隐私模式等）时退回共用一份，功能降级但不会崩
    return 'shared';
  }
}

// 把存着的一行 JSON 解析成草稿；结构不可信（被别的东西写过 / 手工改坏）时返回 null，
// 调用方据此回退到默认内容，而不是把一个半损坏的对象塞进编辑器。
function parseDraft(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || typeof data.code !== 'string') return null;

    return {
      code: data.code,
      currentFile: typeof data.currentFile === 'string' ? data.currentFile : null,
      view: VIEW_MODES.includes(data.view) ? data.view : 'split',
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : null,
    };
  } catch {
    return null;
  }
}

function listDraftKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_DRAFT_PREFIX)) keys.push(key);
  }
  return keys;
}

export function loadDraft() {
  try {
    const own = parseDraft(localStorage.getItem(LS_DRAFT_PREFIX + getTabId()));
    if (own) return own;

    let newest = null;
    for (const key of listDraftKeys()) {
      const draft = parseDraft(localStorage.getItem(key));
      if (draft && (!newest || (draft.savedAt || '') > (newest.savedAt || ''))) newest = draft;
    }
    return newest;
  } catch {
    return null;
  }
}

// 写入草稿。返回 false 表示写入失败 —— 通常是内容太大撑爆了 localStorage 配额，
// 调用方需要提示用户手动保存到文件。
export function saveDraft(draft) {
  const key = LS_DRAFT_PREFIX + getTabId();
  try {
    localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    return false;
  }
  pruneDrafts(key);
  return true;
}

// 超出上限时按写入时间淘汰最旧的几份，自己这份永远保留
function pruneDrafts(keepKey) {
  try {
    const keys = listDraftKeys();
    if (keys.length <= MAX_DRAFTS) return;

    keys
      .filter((key) => key !== keepKey)
      .map((key) => ({ key, savedAt: parseDraft(localStorage.getItem(key))?.savedAt || '' }))
      .sort((a, b) => (a.savedAt < b.savedAt ? -1 : 1))
      .slice(0, keys.length - MAX_DRAFTS)
      .forEach(({ key }) => localStorage.removeItem(key));
  } catch {
    // 淘汰失败不影响主流程，最坏也只是多留几份草稿
  }
}
