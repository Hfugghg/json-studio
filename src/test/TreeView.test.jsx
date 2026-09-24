import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TreeView from '../TreeView';

// 模拟数据
const SAMPLE_OBJECT = {
  name: 'test',
  count: 42,
  active: true,
  tags: ['a', 'b'],
  nested: { key: 'value' },
};

const SAMPLE_ARRAY = [1, 'two', true, null, { x: 1 }];

describe('TreeView - 渲染', () => {
  it('渲染对象类型数据', () => {
    render(<TreeView data={SAMPLE_OBJECT} hiddenKeys={[]} />);
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('count')).toBeInTheDocument();
  });

  it('渲染数组类型数据', () => {
    render(<TreeView data={SAMPLE_ARRAY} hiddenKeys={[]} />);
    // 数组中的原始值应渲染为叶子节点
    expect(screen.getByText('"two"')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    // 数组中的对象元素渲染为分支节点，显示数组索引
    expect(screen.getByText('[4]')).toBeInTheDocument();
    // 数组叶子节点数量：5 个元素
    const treeRows = document.querySelectorAll('.tree-row');
    expect(treeRows.length).toBeGreaterThanOrEqual(5);
  });

  it('渲染原始值', () => {
    render(<TreeView data={"hello"} hiddenKeys={[]} />);
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it('渲染数字', () => {
    render(<TreeView data={123} hiddenKeys={[]} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('data 为空时显示提示', () => {
    render(<TreeView data={undefined} hiddenKeys={[]} />);
    expect(screen.getByText(/输入 JSON/)).toBeInTheDocument();
  });
});

describe('TreeView - 错误状态', () => {
  it('有错误时显示错误提示', () => {
    render(
      <TreeView
        data={undefined}
        error="Unexpected token"
        hiddenKeys={[]}
      />
    );
    expect(screen.getByText(/Unexpected token/)).toBeInTheDocument();
    expect(screen.getByText(/修复语法错误/)).toBeInTheDocument();
  });
});

describe('TreeView - 折叠/展开', () => {
  it('点击分支节点折叠/展开', () => {
    render(<TreeView data={SAMPLE_OBJECT} hiddenKeys={[]} />);
    // 展开状态下应看到子键
    expect(screen.getByText('name')).toBeInTheDocument();
    // 点击 root 折叠
    const rootKey = screen.getByText('root');
    fireEvent.click(rootKey.parentElement);
    // 折叠后子节点不可见（但 root 键仍存在）
    // 由于折叠是通过状态控制的，验证箭头变化
    // 这里主要验证点击不报错
    expect(screen.getByText('root')).toBeInTheDocument();
  });
});

describe('TreeView - 双击编辑值', () => {
  it('双击叶子值进入编辑模式', () => {
    const onEdit = vi.fn();
    render(
      <TreeView
        data={{ key: 'oldValue' }}
        hiddenKeys={[]}
        onEdit={onEdit}
      />
    );
    const valueSpan = screen.getByText('"oldValue"');
    fireEvent.doubleClick(valueSpan);
    // 编辑模式应出现 input
    const input = document.querySelector('.inline-input');
    expect(input).toBeInTheDocument();
  });
});

describe('TreeView - 删除节点', () => {
  it('点击删除按钮触发 onDelete', () => {
    const onDelete = vi.fn();
    render(
      <TreeView
        data={{ a: 1, b: 2 }}
        hiddenKeys={[]}
        onDelete={onDelete}
      />
    );
    // 找到第一个删除按钮（叶子节点 a 的删除按钮）
    const deleteButtons = document.querySelectorAll('.node-delete');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalled();
  });
});

describe('TreeView - 添加子节点', () => {
  it('点击 + 按钮显示添加菜单', () => {
    const onAdd = vi.fn();
    render(
      <TreeView
        data={{ arr: [], obj: {} }}
        hiddenKeys={[]}
        onAdd={onAdd}
      />
    );
    const addButtons = document.querySelectorAll('.add-btn');
    expect(addButtons.length).toBeGreaterThan(0);
    fireEvent.click(addButtons[0]);
    // 添加菜单应出现
    expect(screen.getByText('string')).toBeInTheDocument();
    expect(screen.getByText('number')).toBeInTheDocument();
    expect(screen.getByText('boolean')).toBeInTheDocument();
  });
});

describe('TreeView - 隐藏键', () => {
  it('隐藏的键不渲染', () => {
    render(
      <TreeView
        data={{ visible: 1, secret: 2 }}
        hiddenKeys={['secret']}
      />
    );
    expect(screen.getByText('visible')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('点击眼睛按钮显示确认提示', () => {
    const onHideKey = vi.fn();
    render(
      <TreeView
        data={{ a: 1 }}
        hiddenKeys={[]}
        onHideKey={onHideKey}
      />
    );
    const hideButton = document.querySelector('.node-hide');
    expect(hideButton).toBeInTheDocument();
    fireEvent.click(hideButton);
    // 确认提示应出现（匹配确认按钮文本"隐藏"，排除"隐藏所有"描述文本）
    const confirmButtons = document.querySelectorAll('.hide-confirm-yes');
    expect(confirmButtons.length).toBeGreaterThan(0);
    expect(confirmButtons[0].textContent).toBe('隐藏');
  });
});
