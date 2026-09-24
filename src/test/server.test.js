import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 设置测试环境，确保 server.mjs import 时不启动 listen
process.env.NODE_ENV = 'test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../');
const JSON_DIR = path.join(projectRoot, 'json-files');

let app;

beforeAll(async () => {
  // 确保 json-files 目录存在
  fs.mkdirSync(JSON_DIR, { recursive: true });
  // 动态 import server.mjs（此时 isMainModule 为 false，不会 listen）
  const serverModule = await import('../../server.mjs');
  app = serverModule.app;
});

// 每个测试前清理测试文件
beforeEach(() => {
  // 清理测试中可能创建的文件
  const testFiles = ['test-api.json', 'dup.json', 'create.json'];
  for (const f of testFiles) {
    const filePath = path.join(JSON_DIR, f);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

describe('GET /api/health', () => {
  it('返回 { success: true, status: "running" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'running' });
  });
});

describe('GET /api/files', () => {
  it('返回成功响应和文件列表', async () => {
    // 创建一个已知文件
    fs.writeFileSync(path.join(JSON_DIR, 'list-test.json'), '{}', 'utf-8');
    const res = await request(app).get('/api/files');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.files)).toBe(true);
    const names = res.body.files.map(f => f.name);
    expect(names).toContain('list-test.json');
    // 清理
    fs.unlinkSync(path.join(JSON_DIR, 'list-test.json'));
  });
});

describe('GET /api/files/:name', () => {
  it('读取已存在的文件', async () => {
    fs.writeFileSync(path.join(JSON_DIR, 'read-test.json'), '{"key":"value"}', 'utf-8');
    const res = await request(app).get('/api/files/read-test.json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.content).toBe('{"key":"value"}');
    fs.unlinkSync(path.join(JSON_DIR, 'read-test.json'));
  });

  it('不存在的文件返回 404', async () => {
    const res = await request(app).get('/api/files/no-such-file.json');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('路径遍历攻击返回 403', async () => {
    const res = await request(app).get('/api/files/..%2f..%2fpackage.json');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('非法文件名');
  });
});

describe('POST /api/files/:name（保存）', () => {
  it('保存文件成功', async () => {
    const res = await request(app)
      .post('/api/files/save-test.json')
      .send({ content: '{"saved":true}' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 验证文件确实写入
    const filePath = path.join(JSON_DIR, 'save-test.json');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"saved":true}');
    fs.unlinkSync(filePath);
  });

  it('缺少 content 字段返回 400', async () => {
    const res = await request(app)
      .post('/api/files/no-content.json')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('非法文件名返回 403', async () => {
    const res = await request(app)
      .post('/api/files/..%2fevil.json')
      .send({ content: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/files（新建）', () => {
  it('创建新文件成功', async () => {
    const res = await request(app)
      .post('/api/files')
      .send({ name: 'new-file', content: '{"created":true}' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.name).toBe('new-file.json');
    const filePath = path.join(JSON_DIR, 'new-file.json');
    expect(fs.existsSync(filePath)).toBe(true);
    fs.unlinkSync(filePath);
  });

  it('重复创建同名文件返回 409', async () => {
    // 先创建
    await request(app).post('/api/files').send({ name: 'dup-test', content: '{}' });
    // 再创建同名
    const res = await request(app).post('/api/files').send({ name: 'dup-test', content: '{}' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('文件已存在');
    fs.unlinkSync(path.join(JSON_DIR, 'dup-test.json'));
  });

  it('缺少文件名返回 400', async () => {
    const res = await request(app)
      .post('/api/files')
      .send({ content: '{}' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('DELETE /api/files/:name', () => {
  it('删除已存在的文件', async () => {
    fs.writeFileSync(path.join(JSON_DIR, 'delete-me.json'), '{}', 'utf-8');
    const res = await request(app).delete('/api/files/delete-me.json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.existsSync(path.join(JSON_DIR, 'delete-me.json'))).toBe(false);
  });

  it('删除不存在的文件仍返回成功（幂等）', async () => {
    const res = await request(app).delete('/api/files/ghost.json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('非法文件名返回 403', async () => {
    const res = await request(app).delete('/api/files/..%2fpackage.json');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('未知路由', () => {
  it('未定义的 API 返回 404', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
