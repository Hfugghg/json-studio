import '@testing-library/jest-dom';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ===== localStorage  polyfill（jsdom 25+ 不再默认提供）=====
function createLocalStorage() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  };
}

// 在 jsdom 环境中挂载 localStorage 和 sessionStorage
if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorage(),
    configurable: true,
    writable: true,
  });
}
if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createLocalStorage(),
    configurable: true,
    writable: true,
  });
}

// 每个测试后清理 React 渲染树，避免测试间污染
afterEach(() => {
  cleanup();
});

// 每个测试前清理 localStorage
beforeEach(() => {
  globalThis.localStorage.clear();
});
