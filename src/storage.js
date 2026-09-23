// 文件存储适配层。
//
// 本地开发时由 server.mjs 提供 /api 接口，文件落在项目的 json-files/ 目录；
// 静态部署（如 GitHub Pages）没有后端，这里自动退回浏览器 localStorage，
// 让文件面板在线上依然可用。两种模式对调用方暴露同一套接口。

const API = '/api';
const LS_STORE = 'json-editor-files';
const PROBE_TIMEOUT = 1500;

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
