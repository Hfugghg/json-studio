import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App, { SAMPLE_JSON } from '../App';

const DRAFT_PREFIX = 'json-editor-draft:';

// 读回草稿，草稿不存在时返回 null（方便直接断言「没写进去」）。
// 草稿按标签页分槽，这里不关心是哪个槽，取到任意一份即可。
function readDraft() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DRAFT_PREFIX)) return JSON.parse(localStorage.getItem(key));
  }
  return null;
}

// 预置一份草稿。用固定的槽名：页面启动时还没有自己标签页的草稿，
// 会退回「最近写入的一份」，正好就是这份。
function seedDraft(draft) {
  localStorage.setItem(`${DRAFT_PREFIX}seeded`, JSON.stringify(draft));
}

// ===== 模拟 fetch：后端不可用，退回 localStorage 模式 =====
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no backend'))));

// ===== 模拟 navigator.clipboard =====
beforeEach(() => {
  localStorage.clear();
  // 重置 clipboard mock
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(() => Promise.resolve()),
      readText: vi.fn(() => Promise.resolve('')),
    },
  });
});

describe('App 组件渲染', () => {
  it('渲染顶部工具栏按钮', () => {
    render(<App />);
    // 使用 getByRole 避免文本重复匹配
    expect(screen.getByRole('button', { name: /格式化/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /压缩/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /清空/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制/ })).toBeInTheDocument();
  });

  it('渲染代码编辑器区域', () => {
    render(<App />);
    const textarea = document.querySelector('.code-input');
    expect(textarea).toBeInTheDocument();
  });

  it('渲染状态栏', () => {
    render(<App />);
    const statusBar = document.querySelector('.status-bar');
    expect(statusBar).toBeInTheDocument();
  });

  it('渲染视图切换按钮', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: '代码' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '分屏' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '树形' })).toBeInTheDocument();
  });

  it('初始加载示例 JSON 并显示有效状态', async () => {
    render(<App />);
    // 等待防抖解析完成
    await waitFor(() => {
      const status = document.querySelector('.status-text');
      expect(status.textContent).toContain('JSON 有效');
    });
  });
});

describe('App - 格式化按钮', () => {
  it('点击格式化按钮美化 JSON', async () => {
    render(<App />);
    // 先压缩为单行
    fireEvent.click(screen.getByRole('button', { name: /压缩/ }));
    await waitFor(() => {
      expect(document.querySelector('.status-text').textContent).toContain('已压缩');
    });
    // 再点击格式化
    fireEvent.click(screen.getByRole('button', { name: /格式化/ }));
    await waitFor(() => {
      expect(document.querySelector('.status-text').textContent).toContain('已格式化');
    });
    // 验证 textarea 内容已美化（含换行和缩进）
    const textarea = document.querySelector('.code-input');
    expect(textarea.value).toContain('\n');
    expect(textarea.value).toContain('  ');
  });
});

describe('App - 压缩按钮', () => {
  it('点击压缩按钮去除空白', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /压缩/ }));
    await waitFor(() => {
      expect(document.querySelector('.status-text').textContent).toContain('已压缩');
    });
    const textarea = document.querySelector('.code-input');
    // 压缩后不应含换行
    expect(textarea.value).not.toContain('\n');
  });
});

describe('App - 清空按钮', () => {
  it('点击清空按钮清空编辑器', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /清空/ }));
    await waitFor(() => {
      expect(document.querySelector('.status-text').textContent).toContain('已清空');
    });
    const textarea = document.querySelector('.code-input');
    expect(textarea.value).toBe('');
  });
});

describe('App - JSON 语法错误显示', () => {
  it('输入无效 JSON 时显示错误', async () => {
    render(<App />);
    const textarea = document.querySelector('.code-input');
    fireEvent.change(textarea, { target: { value: '{ invalid json' } });
    await waitFor(() => {
      const status = document.querySelector('.status-text');
      expect(status.classList.contains('status-error')).toBe(true);
    }, { timeout: 1000 });
    // 错误信息应在状态栏
    const statusText = document.querySelector('.status-text').textContent;
    expect(statusText).toContain('行');
  });

  it('缺少逗号时错误应指向漏逗号的行（而非解析器报错的下一行）', async () => {
    render(<App />);
    const textarea = document.querySelector('.code-input');
    // 第 3 行末尾缺少逗号（"b": 2 后面没有逗号）
    // 解析器原本报错在第 4 行（"c" 处），修正后应指向第 3 行
    fireEvent.change(textarea, { target: { value: '{\n  "a": 1,\n  "b": 2\n  "c": 3\n}' } });
    await waitFor(() => {
      const status = document.querySelector('.status-text');
      expect(status.classList.contains('status-error')).toBe(true);
    }, { timeout: 1000 });
    // 错误应指向第 3 行（漏逗号的那行），而非第 4 行
    const statusText = document.querySelector('.status-text').textContent;
    expect(statusText).toContain('第 3 行');
    expect(statusText).toContain('缺少逗号');
  });

  it('缺少闭合大括号时错误应指向未闭合的行', async () => {
    render(<App />);
    const textarea = document.querySelector('.code-input');
    // 缺少两个闭合大括号：第 3 行和第 1 行的 { 都未闭合
    fireEvent.change(textarea, { target: { value: '{\n  "a": 1,\n  "b": {\n    "c": 2\n' } });
    await waitFor(() => {
      const status = document.querySelector('.status-text');
      expect(status.classList.contains('status-error')).toBe(true);
    }, { timeout: 1000 });
    const statusText = document.querySelector('.status-text').textContent;
    // 应指向最深层未闭合的 {（第 3 行）
    expect(statusText).toContain('第 3 行');
    expect(statusText).toContain('}');
    expect(statusText).toContain('未闭合');
  });

  it('缺少闭合中括号时错误应指向未闭合的行', async () => {
    render(<App />);
    const textarea = document.querySelector('.code-input');
    // 第 2 行的 [ 未闭合（缺少 ]），文件以 } 结束
    fireEvent.change(textarea, { target: { value: '{\n  "a": [1, 2, 3\n}' } });
    await waitFor(() => {
      const status = document.querySelector('.status-text');
      expect(status.classList.contains('status-error')).toBe(true);
    }, { timeout: 1000 });
    const statusText = document.querySelector('.status-text').textContent;
    expect(statusText).toContain('[');
    expect(statusText).toContain('未闭合');
  });

  it('删除 [ 后错误应定位到被删除的行（而非 X+2 行）', async () => {
    render(<App />);
    const textarea = document.querySelector('.code-input');
    // 第 2 行的 [ 被删除："a": 后面直接跟数组元素
    // V8 报错在 line 4（"Expected double-quoted property name"），应修正为 line 2
    fireEvent.change(textarea, { target: { value: '{\n  "a":\n    1,\n    2\n  ]\n}' } });
    await waitFor(() => {
      const status = document.querySelector('.status-text');
      expect(status.classList.contains('status-error')).toBe(true);
    }, { timeout: 1000 });
    const statusText = document.querySelector('.status-text').textContent;
    // 应指向第 2 行（括号被删除的行），而非第 4 行
    expect(statusText).toContain('第 2 行');
    expect(statusText).toContain('[');
    expect(statusText).toContain('缺少开启符号');
  });

  it('删除 { 后错误应定位到被删除的行（而非 X+1 行）', async () => {
    render(<App />);
    const textarea = document.querySelector('.code-input');
    // 第 2 行的 { 被删除："a": 后面直接跟 "b": 1
    // V8 报错在 line 3（"Expected ',' or '}' after property value"），应修正为 line 2
    fireEvent.change(textarea, { target: { value: '{\n  "a":\n    "b": 1\n  }\n}' } });
    await waitFor(() => {
      const status = document.querySelector('.status-text');
      expect(status.classList.contains('status-error')).toBe(true);
    }, { timeout: 1000 });
    const statusText = document.querySelector('.status-text').textContent;
    // 应指向第 2 行（括号被删除的行），而非第 3 行
    expect(statusText).toContain('第 2 行');
    expect(statusText).toContain('{');
    expect(statusText).toContain('缺少开启符号');
  });
});

describe('App - 复制到剪贴板', () => {
  it('点击复制按钮调用 navigator.clipboard.writeText', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /复制/ }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    expect(document.querySelector('.status-text').textContent).toContain('已复制到剪贴板');
  });
});

describe('App - 视图切换', () => {
  it('切换到树形视图', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '树形' }));
    // 树形视图容器应出现
    expect(document.querySelector('.tree-viewport')).toBeInTheDocument();
  });

  it('切换到代码视图', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '代码' }));
    expect(document.querySelector('.code-input')).toBeInTheDocument();
  });
});

describe('App - 草稿恢复', () => {
  it('没有草稿时加载示例 JSON，且不弹恢复提示', () => {
    render(<App />);
    expect(document.querySelector('.code-input').value).toBe(SAMPLE_JSON);
    expect(document.querySelector('.restore-notice')).not.toBeInTheDocument();
  });

  it('草稿里没保存的内容会在刷新后回到编辑器', () => {
    seedDraft({
      code: '{"draft":"断电前没来得及保存的内容"}',
      currentFile: null,
      view: 'split',
      savedAt: '2026-10-08T04:00:00.000Z',
    });

    render(<App />);

    expect(document.querySelector('.code-input').value).toBe('{"draft":"断电前没来得及保存的内容"}');
    expect(document.querySelector('.restore-notice')).toBeInTheDocument();
  });

  it('草稿里的视图模式一并恢复（树形）', () => {
    seedDraft({ code: '{"a":1}', currentFile: null, view: 'tree', savedAt: null });

    render(<App />);

    expect(document.querySelector('.tree-viewport')).toBeInTheDocument();
    expect(document.querySelector('.code-input')).not.toBeInTheDocument();
  });

  it('草稿与它绑定的文件对不上时，提示并标出未保存', async () => {
    // 浏览器存储模式下预置一个文件，内容和草稿故意不同
    localStorage.setItem('json-editor-files', JSON.stringify({
      'a.json': { content: '{"a":1}', modified: new Date().toISOString() },
    }));
    seedDraft({ code: '{"a":999}', currentFile: 'a.json', view: 'split', savedAt: null });

    render(<App />);

    await waitFor(() => {
      expect(document.querySelector('.restore-notice')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.querySelector('.btn-dirty')).toBeInTheDocument();
    });
  });

  it('草稿内容与示例完全一致时不打扰用户，不显示恢复提示', () => {
    seedDraft({ code: SAMPLE_JSON, currentFile: null, view: 'split', savedAt: null });

    render(<App />);

    expect(document.querySelector('.code-input').value).toBe(SAMPLE_JSON);
    expect(document.querySelector('.restore-notice')).not.toBeInTheDocument();
  });
});

describe('App - 草稿写入', () => {
  it('卸载时立刻落盘，覆盖「敲完马上刷新」防抖还没到期的场景', () => {
    const { unmount } = render(<App />);
    fireEvent.change(document.querySelector('.code-input'), {
      target: { value: '{"typed":"刚敲完就刷新"}' },
    });

    unmount();

    expect(readDraft().code).toBe('{"typed":"刚敲完就刷新"}');
  });

  it('停止输入后自动写入草稿', async () => {
    render(<App />);
    fireEvent.change(document.querySelector('.code-input'), { target: { value: '{"auto":true}' } });

    await waitFor(() => {
      expect(readDraft()?.code).toBe('{"auto":true}');
    }, { timeout: 2000 });
  });
});
