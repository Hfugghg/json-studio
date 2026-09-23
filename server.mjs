import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3001;
const JSON_DIR = path.join(__dirname, 'json-files');

// 确保文件夹存在
if (!fs.existsSync(JSON_DIR)) {
  fs.mkdirSync(JSON_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== 全局错误守护 =====
process.on('uncaughtException', (err) => {
  console.error('[未捕获异常]', err.message);
  // 不退出，继续服务
});

process.on('unhandledRejection', (reason) => {
  console.error('[未处理Promise拒绝]', reason);
  // 不退出
});

// ===== API 路由 =====

// 获取 JSON 文件列表
app.get('/api/files', (req, res) => {
  try {
    const entries = fs.readdirSync(JSON_DIR, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && e.name.endsWith('.json'))
      .map(e => {
        const filePath = path.join(JSON_DIR, e.name);
        try {
          const stat = fs.statSync(filePath);
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
      .filter(Boolean);
    res.json({ success: true, files });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 读取指定文件
app.get('/api/files/:name', (req, res) => {
  try {
    const fileName = req.params.name;
    // 安全检查：只允许文件名，不允许路径
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const filePath = path.join(JSON_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    // 读取原始 buffer，去除 BOM，转为 UTF-8
    let buf = fs.readFileSync(filePath);
    // 去除 UTF-8 BOM (EF BB BF)
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      buf = buf.subarray(3);
    }
    const content = buf.toString('utf-8');
    res.json({ success: true, content });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 保存文件
app.post('/api/files/:name', (req, res) => {
  try {
    const fileName = req.params.name;
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const filePath = path.join(JSON_DIR, fileName);
    fs.writeFileSync(filePath, req.body.content || '', 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 新建文件
app.post('/api/files', (req, res) => {
  try {
    let { name, content = '{}' } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: '缺少文件名' });
    }
    name = name.trim();
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const fileName = name.endsWith('.json') ? name : name + '.json';
    const filePath = path.join(JSON_DIR, fileName);
    if (fs.existsSync(filePath)) {
      return res.status(409).json({ success: false, error: '文件已存在' });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true, name: fileName });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 删除文件
app.delete('/api/files/:name', (req, res) => {
  try {
    const fileName = req.params.name;
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      return res.status(403).json({ success: false, error: '非法文件名' });
    }
    const filePath = path.join(JSON_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'running' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
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
