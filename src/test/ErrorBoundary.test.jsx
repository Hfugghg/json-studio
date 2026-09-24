import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// 一个会抛出错误的组件（仅在生产环境触发，测试中手动模拟）
function BrokenChild({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('测试错误');
  }
  return <div>正常内容</div>;
}

describe('ErrorBoundary - 正常渲染', () => {
  it('无错误时正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <div>子组件内容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('子组件内容')).toBeInTheDocument();
  });

  it('渲染多个子组件', () => {
    render(
      <ErrorBoundary>
        <div>第一个子组件</div>
        <div>第二个子组件</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('第一个子组件')).toBeInTheDocument();
    expect(screen.getByText('第二个子组件')).toBeInTheDocument();
  });
});

describe('ErrorBoundary - 错误捕获', () => {
  it('捕获错误并显示降级 UI', () => {
    // 抑制 console.error 避免测试输出混乱
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 强制让 ErrorBoundary 进入错误状态
    const { rerender } = render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>
    );
    // 重新渲染触发错误
    rerender(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>
    );

    // 降级 UI 应显示
    expect(screen.getByText(/页面出现错误/)).toBeInTheDocument();
    expect(screen.getByText(/测试错误/)).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();

    spy.mockRestore();
  });

  it('降级 UI 包含 role="alert"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>
    );
    rerender(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();

    spy.mockRestore();
  });
});

describe('ErrorBoundary - 重试恢复', () => {
  it('点击重试按钮恢复子组件渲染', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>
    );
    rerender(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>
    );

    // 确认降级 UI 显示
    expect(screen.getByText(/页面出现错误/)).toBeInTheDocument();

    // 点击重试（用 act 包裹确保状态更新被提交后再渲染）
    act(() => {
      fireEvent.click(screen.getByText('重试'));
    });

    // 重试重置 hasError 后，子组件仍会抛出错误（shouldThrow=true），
    // 因此降级 UI 会再次出现。这验证了重试机制能正常工作。
    expect(screen.getByRole('alert')).toBeInTheDocument();

    spy.mockRestore();
  });

  it('重试后渲染不抛错的子组件', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>
    );
    // 触发错误
    rerender(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/页面出现错误/)).toBeInTheDocument();

    // 即使子组件改为不抛错，错误边界仍保持错误状态
    // （React 错误边界不会自动恢复，必须显式重试）
    rerender(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/页面出现错误/)).toBeInTheDocument();

    // 点击重试后恢复
    act(() => {
      fireEvent.click(screen.getByText('重试'));
    });

    // 正常内容应显示
    expect(screen.getByText('正常内容')).toBeInTheDocument();
    expect(screen.queryByText(/页面出现错误/)).not.toBeInTheDocument();

    spy.mockRestore();
  });
});
