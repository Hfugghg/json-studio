import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

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
