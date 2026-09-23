const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const JSON_DIR = path.join(__dirname, 'json-files');

// 确保文件夹存在
if (!fs.existsSync(JSON_DIR)) {
  fs.mkdirSync(JSON_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 获取 JSON 文件列表
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(JSON_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(JSON_DIR, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          size: stat.size,
          modified: stat.mtime.toISOString()
        };
      });
    res.json({ success: true, files });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 读取指定文件
app.get('/api/files/:name', (req, res) => {
  try {
    const filePath = path.join(JSON_DIR, req.params.name);
    // 安全检查：防止路径遍历
    if (!filePath.startsWith(JSON_DIR)) {
      return res.status(403).json({ success: false, error: '非法路径' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ success: true, content });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 保存文件
app.post('/api/files/:name', (req, res) => {
  try {
    const filePath = path.join(JSON_DIR, req.params.name);
    if (!filePath.startsWith(JSON_DIR)) {
      return res.status(403).json({ success: false, error: '非法路径' });
    }
    fs.writeFileSync(filePath, req.body.content, 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 新建文件
app.post('/api/files', (req, res) => {
  try {
    const { name, content = '{}' } = req.body;
    const fileName = name.endsWith('.json') ? name : name + '.json';
    const filePath = path.join(JSON_DIR, fileName);
    if (!filePath.startsWith(JSON_DIR)) {
      return res.status(403).json({ success: false, error: '非法路径' });
    }
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
    const filePath = path.join(JSON_DIR, req.params.name);
    if (!filePath.startsWith(JSON_DIR)) {
      return res.status(403).json({ success: false, error: '非法路径' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`JSON 文件服务已启动: http://localhost:${PORT}`);
  console.log(`文件夹: ${JSON_DIR}`);
});
