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
