import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟后端不可用，使 detectMode 退回 localStorage 模式
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('backend unavailable'))));

const LS_STORE = 'json-editor-files';

// 每次测试前清理 localStorage 并重置模块缓存
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

// ===== 辅助函数 =====
// 直接测试内部逻辑，通过重新实现来验证行为
// 因为 readStore/writeStore/normalizeName/byteSize 未导出，
// 我们主要通过导出的公共接口和 normalizeName 的间接效果来测试。

describe('storage.js - normalizeName 行为（通过 createFile 后缀）', () => {
  it('createFile 会自动为不带 .json 后缀的名字添加 .json', async () => {
    const { createFile } = await import('../storage.js');
    const name = await createFile('myfile');
    expect(name).toBe('myfile.json');
    // 验证 localStorage 中存储的 key 带后缀
    const raw = localStorage.getItem(LS_STORE);
    const store = JSON.parse(raw);
    expect(store['myfile.json']).toBeDefined();
    expect(store['myfile']).toBeUndefined();
  });

  it('createFile 不会对已带 .json 后缀的名字重复添加', async () => {
    const { createFile } = await import('../storage.js');
    const name = await createFile('data.json');
    expect(name).toBe('data.json');
    const store = JSON.parse(localStorage.getItem(LS_STORE));
    expect(store['data.json']).toBeDefined();
  });
});

describe('storage.js - byteSize（通过 listFiles 返回的 size）', () => {
  it('ASCII 内容的字节数等于字符长度', async () => {
    const { createFile, listFiles } = await import('../storage.js');
    await createFile('ascii.json', '{"a":1}');
    const files = await listFiles();
    const file = files.find(f => f.name === 'ascii.json');
    // '{"a":1}' 共 7 个 ASCII 字符 = 7 字节
    expect(file.size).toBe(7);
  });

  it('UTF-8 中文字符每个占 3 字节', async () => {
    const { createFile, listFiles } = await import('../storage.js');
    // "中" 在 UTF-8 中占 3 字节
    await createFile('unicode.json', '"中"');
    const files = await listFiles();
    const file = files.find(f => f.name === 'unicode.json');
    // '"中"' = 引号(1) + 中(3) + 引号(1) = 5 字节
    expect(file.size).toBe(5);
  });
});

describe('storage.js - listFiles（localStorage 模式）', () => {
  it('空存储时返回空数组', async () => {
    const { listFiles } = await import('../storage.js');
    const files = await listFiles();
    expect(files).toEqual([]);
  });

  it('创建多个文件后按文件名字母序返回', async () => {
    const { createFile, listFiles } = await import('../storage.js');
    await createFile('beta.json', '{}');
    await createFile('alpha.json', '{}');
    await createFile('gamma.json', '{}');
    const files = await listFiles();
    expect(files.map(f => f.name)).toEqual(['alpha.json', 'beta.json', 'gamma.json']);
  });

  it('listFiles 返回的对象包含 name, size, modified 字段', async () => {
    const { createFile, listFiles } = await import('../storage.js');
    await createFile('sample.json', '{"key":"value"}');
    const files = await listFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).toHaveProperty('name', 'sample.json');
    expect(files[0]).toHaveProperty('size');
    expect(typeof files[0].size).toBe('number');
    expect(files[0]).toHaveProperty('modified');
  });
});

describe('storage.js - readFile / saveFile（localStorage 模式）', () => {
  it('readFile 能读取已创建文件的内容', async () => {
    const { createFile, readFile } = await import('../storage.js');
    await createFile('doc.json', '{"hello":"world"}');
    const content = await readFile('doc.json');
    expect(content).toBe('{"hello":"world"}');
  });

  it('saveFile 能更新已存在文件的内容', async () => {
    const { createFile, saveFile, readFile } = await import('../storage.js');
    await createFile('doc.json', '{}');
    await saveFile('doc.json', '{"updated":true}');
    const content = await readFile('doc.json');
    expect(content).toBe('{"updated":true}');
  });

  it('saveFile 能创建新文件（不存在则创建）', async () => {
    const { saveFile, readFile } = await import('../storage.js');
    await saveFile('newfile.json', 'content');
    const content = await readFile('newfile.json');
    expect(content).toBe('content');
  });

  it('readFile 读取不存在的文件应抛出错误', async () => {
    const { readFile } = await import('../storage.js');
    await expect(readFile('nonexistent.json')).rejects.toThrow('文件不存在');
  });
});

describe('storage.js - createFile（localStorage 模式）', () => {
  it('重复创建同名文件应抛出错误', async () => {
    const { createFile } = await import('../storage.js');
    await createFile('dup.json', '{}');
    await expect(createFile('dup.json', '{}')).rejects.toThrow('文件已存在');
  });

  it('createFile 默认内容为 {}', async () => {
    const { createFile, readFile } = await import('../storage.js');
    await createFile('default.json');
    const content = await readFile('default.json');
    expect(content).toBe('{}');
  });
});

describe('storage.js - deleteFile（localStorage 模式）', () => {
  it('deleteFile 能删除已存在的文件', async () => {
    const { createFile, deleteFile, readFile } = await import('../storage.js');
    await createFile('toDelete.json', '{}');
    await deleteFile('toDelete.json');
    await expect(readFile('toDelete.json')).rejects.toThrow('文件不存在');
  });

  it('deleteFile 删除不存在的文件不报错', async () => {
    const { deleteFile } = await import('../storage.js');
    await expect(deleteFile('ghost.json')).resolves.not.toThrow();
  });
});

describe('storage.js - writeStore 错误处理', () => {
  it('localStorage 写入失败时应抛出有意义的错误', async () => {
    // 模拟 localStorage.setItem 抛出异常
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    const { createFile } = await import('../storage.js');
    await expect(createFile('fail.json')).rejects.toThrow('浏览器存储写入失败');
    localStorage.setItem = originalSetItem;
  });
});

describe('storage.js - 编辑草稿', () => {
  const DRAFT_PREFIX = 'json-editor-draft:';
  const TAB_ID_KEY = 'json-editor-tab-id';

  // 列出当前所有草稿槽，用来断言「谁被写了 / 谁被淘汰了」
  function draftKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return keys.filter((k) => k.startsWith(DRAFT_PREFIX)).sort();
  }
  const useTab = (id) => sessionStorage.setItem(TAB_ID_KEY, id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  it('没有草稿时返回 null', async () => {
    const { loadDraft } = await import('../storage.js');
    expect(loadDraft()).toBeNull();
  });

  it('saveDraft 写入的内容能原样读回，并带上保存时间', async () => {
    const { saveDraft, loadDraft } = await import('../storage.js');
    useTab('tab-a');

    expect(saveDraft({ code: '{"a":1}', currentFile: 'demo.json', view: 'tree' })).toBe(true);

    const draft = loadDraft();
    expect(draft.code).toBe('{"a":1}');
    expect(draft.currentFile).toBe('demo.json');
    expect(draft.view).toBe('tree');
    // savedAt 应当是合法时间戳，用来告诉用户恢复的是哪个时刻的内容
    expect(Number.isNaN(Date.parse(draft.savedAt))).toBe(false);
  });

  it('未绑定文件的草稿，currentFile 读回 null', async () => {
    const { saveDraft, loadDraft } = await import('../storage.js');
    useTab('tab-a');

    saveDraft({ code: '{}', currentFile: null, view: 'split' });
    expect(loadDraft().currentFile).toBeNull();
  });

  it('多个标签页各写各的，互不覆盖', async () => {
    const { saveDraft, loadDraft } = await import('../storage.js');

    useTab('tab-a');
    saveDraft({ code: '{"tab":"a"}', currentFile: 'a.json', view: 'split' });

    useTab('tab-b');
    saveDraft({ code: '{"tab":"b"}', currentFile: 'b.json', view: 'split' });

    // B 读到自己的
    expect(loadDraft().code).toBe('{"tab":"b"}');

    // 回到 A，A 的内容没被 B 冲掉
    useTab('tab-a');
    expect(loadDraft().code).toBe('{"tab":"a"}');

    expect(draftKeys()).toEqual([`${DRAFT_PREFIX}tab-a`, `${DRAFT_PREFIX}tab-b`]);
  });

  it('没有自己草稿的新标签页退回最近写入的那一份', async () => {
    const { saveDraft, loadDraft } = await import('../storage.js');

    useTab('tab-a');
    saveDraft({ code: '{"first":1}', currentFile: null, view: 'split' });
    await wait(10);
    useTab('tab-b');
    saveDraft({ code: '{"second":2}', currentFile: null, view: 'split' });

    // 断电重启 / 关掉标签页重开：全新标签页，没有自己的草稿
    useTab('tab-fresh');
    expect(loadDraft().code).toBe('{"second":2}');
  });

  it('草稿份数超过上限时淘汰最旧的一份', async () => {
    const { saveDraft } = await import('../storage.js');

    for (const id of ['t1', 't2', 't3', 't4']) {
      useTab(id);
      saveDraft({ code: `{"t":"${id}"}`, currentFile: null, view: 'split' });
      await wait(10);
    }

    expect(draftKeys()).toHaveLength(3);
    expect(draftKeys()).not.toContain(`${DRAFT_PREFIX}t1`); // 最旧的被清掉
    expect(draftKeys()).toContain(`${DRAFT_PREFIX}t4`); // 自己这份永远保留
  });

  it('草稿被改坏成非法 JSON 时返回 null，而不是把脏数据交给调用方', async () => {
    const { loadDraft } = await import('../storage.js');
    localStorage.setItem(`${DRAFT_PREFIX}broken`, '{ 这不是 JSON');
    expect(loadDraft()).toBeNull();
  });

  it('缺少 code 字段的草稿视为无效', async () => {
    const { loadDraft } = await import('../storage.js');
    localStorage.setItem(`${DRAFT_PREFIX}broken`, JSON.stringify({ currentFile: 'a.json' }));
    expect(loadDraft()).toBeNull();
  });

  it('非法的 view 回退到 split，非字符串的 currentFile 归为 null', async () => {
    const { loadDraft } = await import('../storage.js');
    localStorage.setItem(
      `${DRAFT_PREFIX}broken`,
      JSON.stringify({ code: '{}', view: 'hacker', currentFile: 42 }),
    );

    const draft = loadDraft();
    expect(draft.view).toBe('split');
    expect(draft.currentFile).toBeNull();
  });

  it('写入失败（超出配额）时返回 false', async () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    const { saveDraft } = await import('../storage.js');
    expect(saveDraft({ code: '{}', currentFile: null, view: 'split' })).toBe(false);
    localStorage.setItem = originalSetItem;
  });
});
