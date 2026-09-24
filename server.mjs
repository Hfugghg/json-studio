import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();
const PORT = 3001;
const JSON_DIR = path.join(__dirname, 'json-files');

// 确保文件夹存在
fs.mkdirSync(JSON_DIR, { recursive: true });

// ===== 安全响应头 =====
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

app.use(express.json({ limit: '5mb' }));

// ===== 全局错误守护 =====
process.on('uncaughtException', (err) => {
  console.error('[未捕获异常]', err.message);
  // 不退出，继续服务
});

process.on('unhandledRejection', (reason) => {
  console.error('[未处理Promise拒绝]', reason);
  // 不退出
});

// ===== 辅助函数 =====

// 文件名安全检查
function isSafeFileName(name) {
  return !name.includes('/') && !name.includes('\\') && !name.includes('..');
}

// 内容字段校验中间件（用于保存/新建）
function validateContent(req, res, next) {
  if (typeof req.body.content !== 'string') {
    return res.status(400).json({ success: false, error: '内容格式错误' });
  }
  if (req.body.content.length > 5 * 1024 * 1024) {
    return res.status(413).json({ success: false, error: '内容超过 5MB 限制' });
  }
  next();
}

// 错误消息脱敏
function toSafeError(e) {
  if (e.code === 'ENOENT') return '文件不存在';
  if (e.code === 'EACCES' || e.code === 'EPERM') return '权限不足';
  return '操作失败';
}

// ===== API 路由 =====

// 获取 JSON 文件列表
app.get('/api/files', async (req, res) => {
  try {
    const entries = await fs.promises.readdir(JSON_DIR, { withFileTypes: true });
    const files = (
      await Promise.all(
        entries
          .filter(e => e.isFile() && e.name.endsWith('.json'))
          .map(async (e) => {
            const filePath = path.join(JSON_DIR, e.name);
            try {
              const stat = await fs.promises.stat(filePath);
              return {
                name: e.name,
                size: stat.size,
                modified: stat.mtime.toISOString()
              };
            } catch {
              // 文件可能在读取过程中被删除，跳过
              return null;
            }
          })
      )
    ).filter(Boolean);
    res.json({ success: true, files });
  } catch (e) {
    console.error('[获取文件列表失败]', e);
    res.status(500).json({ success: false, error: toSafeError(e) });
  }
});

// 读取指定文件
app.get('/api/files/:name', async (req, res) => {
  try {
    const fileName = req.params.name;
    // 安全检查：只允许文件名，不允许路径
    if (!isSafeFileName(fileName)) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const filePath = path.join(JSON_DIR, fileName);
    // 读取原始 buffer，去除 BOM，转为 UTF-8
    let buf = await fs.promises.readFile(filePath);
    // 去除 UTF-8 BOM (EF BB BF)
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      buf = buf.subarray(3);
    }
    const content = buf.toString('utf-8');
    res.json({ success: true, content });
  } catch (e) {
    console.error('[读取文件失败]', e);
    const status = e.code === 'ENOENT' ? 404 : 500;
    res.status(status).json({ success: false, error: toSafeError(e) });
  }
});

// 保存文件
app.post('/api/files/:name', validateContent, async (req, res) => {
  try {
    const fileName = req.params.name;
    if (!isSafeFileName(fileName)) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const filePath = path.join(JSON_DIR, fileName);
    await fs.promises.writeFile(filePath, req.body.content || '', 'utf-8');
    res.json({ success: true });
  } catch (e) {
    console.error('[保存文件失败]', e);
    res.status(500).json({ success: false, error: toSafeError(e) });
  }
});

// 新建文件（排他创建，避免 TOCTOU 竞态）
app.post('/api/files', validateContent, async (req, res) => {
  try {
    let { name, content = '{}' } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: '缺少文件名' });
    }
    name = name.trim();
    if (!isSafeFileName(name)) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const fileName = name.endsWith('.json') ? name : name + '.json';
    const filePath = path.join(JSON_DIR, fileName);
    // 排他创建：wx 标志确保文件不存在时才写入，避免 TOCTOU 竞态
    const handle = await fs.promises.open(filePath, 'wx');
    await handle.writeFile(content, 'utf-8');
    await handle.close();
    res.json({ success: true, name: fileName });
  } catch (e) {
    if (e.code === 'EEXIST') {
      return res.status(409).json({ success: false, error: '文件已存在' });
    }
    console.error('[新建文件失败]', e);
    res.status(500).json({ success: false, error: toSafeError(e) });
  }
});

// 删除文件
app.delete('/api/files/:name', async (req, res) => {
  try {
    const fileName = req.params.name;
    if (!isSafeFileName(fileName)) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const filePath = path.join(JSON_DIR, fileName);
    try {
      await fs.promises.unlink(filePath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      // 文件已不存在，视为删除成功
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[删除文件失败]', e);
    res.status(500).json({ success: false, error: toSafeError(e) });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'running' });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

// 全局错误处理中间件
app.use((err, req, res, next) => {
  console.error('[服务器错误]', err);
  res.status(500).json({ success: false, error: '操作失败' });
});


// 仅在直接运行时启动监听，import 时不启动
const isMainModule = (import.meta.url && process.argv[1])
  ? import.meta.url === `file://${process.argv[1]}`
  : false;

let server;
if (isMainModule) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`JSON 文件服务已启动: http://localhost:${PORT}`);
    console.log(`文件夹: ${JSON_DIR}`);
  });

  // 优雅关闭
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 已被占用`);
    } else {
      console.error('服务器错误:', err.message);
    }
  });
}

// 导出 server 实例（测试中可能需要关闭）
export { server };
