import { describe, it, expect } from 'vitest';
import { diffLines } from '../diff';

const set = (...lines) => new Set(lines);

describe('diff.js - 无改动', () => {
  it('内容完全相同时没有任何标记', () => {
    const { changed, deletedBefore } = diffLines('a\nb\nc', 'a\nb\nc');
    expect(changed.size).toBe(0);
    expect(deletedBefore.size).toBe(0);
  });

  it('相同内容只差结尾换行时也不标记', () => {
    const { changed, deletedBefore } = diffLines('{\n}', '{\n}');
    expect(changed.size).toBe(0);
    expect(deletedBefore.size).toBe(0);
  });
});

describe('diff.js - 修改', () => {
  it('改了一行，标记落在那一行', () => {
    const { changed, deletedBefore } = diffLines('a\nb\nc', 'a\nB\nc');
    expect(changed).toEqual(set(1));
    // 被替换的行算「改过」，不再重复标删除
    expect(deletedBefore.size).toBe(0);
  });

  it('改多行时每行都标出来', () => {
    const { changed } = diffLines('a\nb\nc\nd', 'a\nB\nc\nD');
    expect(changed).toEqual(set(1, 3));
  });

  it('JSON 缩进整体变化时，变化的那几行被标出', () => {
    const before = '{\n  "a": 1,\n  "b": 2\n}';
    const after = '{\n  "a": 1,\n  "b": 3\n}';
    const { changed } = diffLines(before, after);
    expect(changed).toEqual(set(2));
  });
});

describe('diff.js - 新增', () => {
  it('中间插入一行', () => {
    const { changed } = diffLines('a\nc', 'a\nb\nc');
    expect(changed).toEqual(set(1));
  });

  it('开头插入一行', () => {
    const { changed } = diffLines('a\nb', 'x\na\nb');
    expect(changed).toEqual(set(0));
  });

  it('结尾追加一行', () => {
    const { changed } = diffLines('a\nb', 'a\nb\nc');
    expect(changed).toEqual(set(2));
  });

  it('连续插入多行', () => {
    const { changed } = diffLines('a\nz', 'a\nb\nc\nd\nz');
    expect(changed).toEqual(set(1, 2, 3));
  });
});

describe('diff.js - 删除', () => {
  it('中间删掉一行，记号留在它原本的位置', () => {
    const { changed, deletedBefore } = diffLines('a\nb\nc', 'a\nc');
    expect(changed.size).toBe(0);
    expect(deletedBefore).toEqual(set(1));
  });

  it('删掉结尾的行，记号落在最后一行上', () => {
    const { changed, deletedBefore } = diffLines('a\nb\nc', 'a\nb');
    expect(changed.size).toBe(0);
    expect(deletedBefore).toEqual(set(1));
  });

  it('内容被清空时标记落在仅剩的空行上', () => {
    const { changed, deletedBefore } = diffLines('a\nb\nc', '');
    expect(changed).toEqual(set(0));
    expect(deletedBefore.size).toBe(0);
  });
});

describe('diff.js - 边界', () => {
  it('从空内容开始写，所有行都是新增', () => {
    const { changed } = diffLines('', 'a\nb');
    expect(changed).toEqual(set(0, 1));
  });

  it('标记不会落到并不存在的行上', () => {
    const { changed, deletedBefore } = diffLines('a\nb\nc\nd', 'a');
    const lastLine = 'a'.split('\n').length - 1;
    for (const line of [...changed, ...deletedBefore]) {
      expect(line).toBeGreaterThanOrEqual(0);
      expect(line).toBeLessThanOrEqual(lastLine);
    }
  });

  it('差异段极大时退化为整段标记，不做精细比对', () => {
    const oldText = Array.from({ length: 3000 }, (_, i) => `old-${i}`).join('\n');
    const newText = Array.from({ length: 3000 }, (_, i) => `new-${i}`).join('\n');

    const { changed } = diffLines(oldText, newText);
    expect(changed.size).toBe(3000);
    expect(changed.has(0)).toBe(true);
    expect(changed.has(2999)).toBe(true);
  });
});
