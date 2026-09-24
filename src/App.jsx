import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import TreeView from './TreeView';
import { listFiles, readFile, saveFile, createFile, deleteFile, detectMode } from './storage';
import './App.css';

const SAMPLE_JSON = `{
  "name": "万能 JSON 编辑器",
  "version": "1.0.0",
  "features": [
    "代码编辑",
    "树形视图",
    "格式化 / 压缩",
    "语法验证",
    "文件上传 / 下载",
    "搜索过滤"
  ],
  "config": {
    "theme": "dark",
    "autoFormat": true,
    "tabSize": 2
  },
  "stats": {
    "users": 1024,
    "active": true,
    "rating": 4.9
  }
}`;

function App() {
  const [code, setCode] = useState(SAMPLE_JSON);
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenKeys, setHiddenKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('json-editor-hidden-keys');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 缓存代码行数组，避免每次渲染重复 split（H11）
  const codeLines = useMemo(() => code.split('\n'), [code]);

  // 持久化隐藏键到 localStorage
  useEffect(() => {
    localStorage.setItem('json-editor-hidden-keys', JSON.stringify(hiddenKeys));
  }, [hiddenKeys]);

  const [showHiddenPanel, setShowHiddenPanel] = useState(false);
  const hiddenToggleRef = useRef(null);
  const hiddenPanelRef = useRef(null);

  // 本地文件列表
  const [fileList, setFileList] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [showFilePanel, setShowFilePanel] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  // 'server' = 本地 Express 服务（json-files 目录）；'local' = 浏览器 localStorage
  const [storageMode, setStorageMode] = useState(null);

  // 计算面板位置（相对于 viewport）
  const getPanelPosition = useCallback((targetEl) => {
    const rect = targetEl.getBoundingClientRect();
    return {
      position: 'fixed',
      top: `${rect.bottom + 6}px`,
      right: `${window.innerWidth - rect.right}px`,
    };
  }, []);
  const [status, setStatus] = useState('就绪');
  const [view, setView] = useState('split');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [dragOver, setDragOver] = useState(false); // 拖放文件视觉反馈
  const treeViewportRef = useRef(null);

  // ========== 解析 JSON ==========
  const [errorLine, setErrorLine] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);

  const parseJSON = useCallback((text) => {
    try {
      const parsed = JSON.parse(text);
      setError(null);
      setErrorLine(null);
      setErrorDetail(null);
      setParsedData(parsed);
      setStatus('✓ JSON 有效');
      return parsed;
    } catch (e) {
      setError(e.message);
      setParsedData(undefined);

      // 解析错误位置（从 position 转换为行号列号）
      const detail = parseErrorPosition(e, text);
      setErrorLine(detail.line);
      setErrorDetail(detail);
      setStatus(`✕ 第 ${detail.line} 行: ${detail.reason}`);
      return null;
    }
  }, []);

  // 扫描文本，找到最深层未闭合的 { 或 [ 及其行号列号
  // 用于"Unexpected end of JSON"时定位真正的错误位置
  const findUnclosedBracket = (text) => {
    const stack = [];
    let line = 1;
    let col = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      col++;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else {
        if (ch === '"') {
          inString = true;
        } else if (ch === '{' || ch === '[') {
          stack.push({ char: ch, line, col });
        } else if (ch === '}' || ch === ']') {
          // 仅在匹配时才弹出（} 匹配 {，] 匹配 [），否则保留不闭合的括号
          if (stack.length > 0) {
            const top = stack[stack.length - 1];
            if ((ch === '}' && top.char === '{') || (ch === ']' && top.char === '[')) {
              stack.pop();
            }
          }
        } else if (ch === '\n') {
          line++;
          col = 0;
        }
      }
    }

    // 返回最深层未闭合的括号（最具体的错误位置）
    if (stack.length > 0) {
      const unclosed = stack[stack.length - 1];
      return { line: unclosed.line, col: unclosed.col, char: unclosed.char };
    }
    return null;
  };

  // 解析 JSON 错误位置
  const parseErrorPosition = useCallback((err, text) => {
    const message = err.message || '';
    let line = 1;
    let column = 1;
    let reason = message;

    // 优先从 V8 新格式错误消息中提取 line/column："(line X column Y)"
    const lineColMatch = message.match(/\(line (\d+) column (\d+)\)/);
    if (lineColMatch) {
      line = parseInt(lineColMatch[1]);
      column = parseInt(lineColMatch[2]);
    } else {
      // 回退：从 position 计算
      const posMatch = message.match(/position (\d+)/i);
      const pos = posMatch ? parseInt(posMatch[1]) : null;
      if (pos !== null && !isNaN(pos) && pos < text.length) {
        const lines = text.substring(0, pos).split('\n');
        line = lines.length;
        column = lines[lines.length - 1].length + 1;
      }
    }

    // 判断是否到达输入末尾（position >= 文本长度 或 Unexpected end）
    const posMatch = message.match(/position (\d+)/);
    const pos = posMatch ? parseInt(posMatch[1]) : null;
    const isEndOfInput = message.includes('Unexpected end') ||
      (pos !== null && pos >= text.length);

    if (isEndOfInput) {
      // 文件意外结束 → 扫描未闭合的括号
      const unclosed = findUnclosedBracket(text);
      if (unclosed) {
        line = unclosed.line;
        column = unclosed.col;
        const closeChar = unclosed.char === '{' ? '}' : ']';
        reason = `缺少闭合符号 "${closeChar}" — 此行开启了 ${unclosed.char} 但未闭合`;
      } else {
        reason = 'JSON 不完整（可能缺少闭合括号或引号）';
      }
    } else if (message.startsWith('Expected')) {
      // V8 新格式："Expected ',' or '}' after property value at position N (line X column Y)"
      // 报错位置在下一个元素开头，真正错误在上一行末尾（漏了逗号）
      const charAtPos = pos !== null && pos < text.length ? text[pos] : null;

      if (charAtPos === '"' || /[0-9tfn]/.test(charAtPos || '')) {
        // 下一个 token 是字符串/数字/布尔/null → 缺少逗号
        if (line > 1) {
          const prevLineEnd = text.lastIndexOf('\n', (pos || 0) - 1);
          const prevLineStart = prevLineEnd > 0 ? text.lastIndexOf('\n', prevLineEnd - 1) + 1 : 0;
          const prevLine = text.substring(prevLineStart, prevLineEnd).trim();
          if (prevLine && !prevLine.endsWith(',') && !prevLine.endsWith('{') && !prevLine.endsWith('[')) {
            const prevLines = text.substring(0, prevLineStart).split('\n');
            line = prevLines.length;
            column = prevLines[prevLines.length - 1].length + 1;
            reason = '缺少逗号 — 此行末尾可能漏了逗号';
          } else {
            reason = '缺少逗号 — 元素之间可能漏了逗号';
          }
        } else {
          reason = '缺少逗号 — 元素之间可能漏了逗号';
        }
      } else if (charAtPos === '}' || charAtPos === ']') {
        // 解析器遇到 } 或 ] 但期望逗号 → 内层结构可能未闭合
        const unclosed = findUnclosedBracket(text);
        if (unclosed) {
          line = unclosed.line;
          column = unclosed.col;
          const closeChar = unclosed.char === '{' ? '}' : ']';
          reason = `缺少闭合符号 "${closeChar}" — 此行开启了 ${unclosed.char} 但未闭合`;
        } else {
          reason = '缺少逗号 — 元素之间可能漏了逗号';
        }
      } else {
        reason = '缺少逗号或闭合符号 — 请检查括号是否匹配';
      }
    } else if (message.includes('Unexpected token')) {
      const tokenMatch = message.match(/Unexpected token '?([^']*)'?/);
      const token = tokenMatch ? tokenMatch[1] : '';
      if (token === '}' || token === ']') {
        reason = `多余的闭合符号 "${token}" — 可能缺少对应的开启符号或位置不对`;
      } else {
        reason = `意外的字符 "${token}"`;
      }
    } else if (message.includes('Unexpected string')) {
      reason = '缺少逗号 — 此键名前一行末尾可能漏了逗号';
    } else if (message.includes('Unexpected number')) {
      reason = '此处出现意外的数字（可能缺少逗号）';
    }

    return { line, column, reason, raw: message };
  }, []);

  // 实时解析（防抖）
  const parseTimerRef = useRef(null);
  const scheduleParse = useCallback((text) => {
    clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(() => parseJSON(text), 300);
  }, [parseJSON]);

  // 卸载时清理解析定时器（M4）
  useEffect(() => () => clearTimeout(parseTimerRef.current), []);

  // ========== 数据操作：修改后同步到代码 ==========
  const syncToCode = useCallback((newData) => {
    // 先清除定时器，避免竞态：防抖到期后用旧文本覆盖 parsedData（H8）
    clearTimeout(parseTimerRef.current);
    const newCode = JSON.stringify(newData, null, 2);
    setCode(newCode);
    setError(null);
    setParsedData(newData);
  }, []);

  // 根据路径获取父节点和键
  const getParentAndKey = (data, path) => {
    let current = data;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    return { parent: current, key: path[path.length - 1] };
  };

  // 深拷贝
  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

  // 删除节点
  const handleTreeDelete = useCallback((path) => {
    if (path.length === 0) {
      setStatus('✕ 不能删除根节点');
      return;
    }
    const newData = deepCopy(parsedData);
    const { parent, key } = getParentAndKey(newData, path);
    if (Array.isArray(parent)) {
      parent.splice(key, 1);
    } else {
      delete parent[key];
    }
    syncToCode(newData);
    setStatus('✓ 已删除节点');
  }, [parsedData, syncToCode]);

  // 编辑值
  const handleTreeEdit = useCallback((path, newVal) => {
    if (path.length === 0) {
      // 根节点
      syncToCode(newVal);
      return;
    }
    const newData = deepCopy(parsedData);
    const { parent, key } = getParentAndKey(newData, path);
    parent[key] = newVal;
    syncToCode(newData);
    setStatus('✓ 已修改值');
  }, [parsedData, syncToCode]);

  // 添加子节点
  const handleTreeAdd = useCallback((path, childVal) => {
    const newData = deepCopy(parsedData);
    let target = newData;
    for (const segment of path) {
      target = target[segment];
    }
    if (Array.isArray(target)) {
      target.push(childVal);
    } else if (typeof target === 'object' && target !== null) {
      // 找一个不重复的键名
      let keyName = 'newKey';
      let counter = 1;
      while (target.hasOwnProperty(keyName + counter)) counter++;
      target[keyName + counter] = childVal;
    }
    syncToCode(newData);
    setStatus('✓ 已添加节点');
  }, [parsedData, syncToCode]);

  // 重命名键
  const handleTreeRenameKey = useCallback((path, newKey) => {
    if (path.length === 0) return;
    const newData = deepCopy(parsedData);
    const { parent, key } = getParentAndKey(newData, path);
    if (typeof parent === 'object' && !Array.isArray(parent)) {
      // 防止重命名为已存在的键导致静默覆盖（H7）
      if (parent.hasOwnProperty(newKey) && newKey !== key) {
        setStatus(`✕ 键名 "${newKey}" 已存在`);
        return;
      }
      const val = parent[key];
      delete parent[key];
      parent[newKey] = val;
      syncToCode(newData);
      setStatus('✓ 已重命名键');
    }
  }, [parsedData, syncToCode]);

  // ========== 工具栏操作 ==========
  const handleFormat = useCallback(() => {
    // 清除防抖定时器，避免旧文本覆盖结果（H8）
    clearTimeout(parseTimerRef.current);
    try {
      const parsed = JSON.parse(code);
      const formatted = JSON.stringify(parsed, null, 2);
      setCode(formatted);
      setParsedData(parsed);
      setError(null);
      setStatus('✓ 已格式化');
    } catch {
      setStatus('✕ 无法格式化：JSON 有语法错误');
    }
  }, [code]);

  const handleMinify = useCallback(() => {
    // 清除防抖定时器，避免旧文本覆盖结果（H8）
    clearTimeout(parseTimerRef.current);
    try {
      const parsed = JSON.parse(code);
      const minified = JSON.stringify(parsed);
      setCode(minified);
      setParsedData(parsed);
      setError(null);
      setStatus('✓ 已压缩');
    } catch {
      setStatus('✕ 无法压缩：JSON 有语法错误');
    }
  }, [code]);

  const handleClear = useCallback(() => {
    setCode('');
    setParsedData(undefined);
    setError(null);
    setStatus('已清空');
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setStatus('✓ 已复制到剪贴板');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setStatus('✓ 已复制到剪贴板');
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([code], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('✓ 已下载');
  }, [code]);

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setCode(text);
      scheduleParse(text);
      setStatus(`✓ 已加载 ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [scheduleParse]);

  // ========== 拖放文件打开 ==========
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // 仅在真正离开容器时取消（避免子元素触发）
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    // 仅接受 JSON 相关类型和无扩展名的文件
    const acceptedTypes = ['application/json', 'text/plain', 'text/json', ''];
    const isJson = acceptedTypes.includes(file.type) ||
      file.name.toLowerCase().endsWith('.json') ||
      file.name.toLowerCase().endsWith('.jsonl');
    if (!isJson) {
      setStatus('✕ 仅支持 JSON 文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setCode(text);
      scheduleParse(text);
      setCurrentFile(null); // 拖放的文件不在文件面板中，清除当前文件
      setStatus(`✓ 已加载 ${file.name}`);
    };
    reader.onerror = () => setStatus('✕ 读取文件失败');
    reader.readAsText(file);
  }, [scheduleParse]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCode(text);
      scheduleParse(text);
      setStatus('✓ 已从剪贴板粘贴');
    } catch {
      setStatus('✕ 无法读取剪贴板');
    }
  }, [scheduleParse]);

  // ========== 本地文件列表（服务端 API，静态部署时自动退回浏览器存储） ==========
  const fetchFileList = useCallback(async (silent = false) => {
    if (!silent) setFileLoading(true);
    try {
      setStorageMode(await detectMode());
      const files = await listFiles();
      setFileList(files);
      return files;
    } catch (e) {
      if (!silent) setStatus('✕ 获取文件列表失败: ' + e.message);
      setFileList([]);
      return [];
    } finally {
      if (!silent) setFileLoading(false);
    }
  }, []);

  // 启动时解析初始 JSON，树形视图立即显示（无需等待用户输入）
  useEffect(() => {
    parseJSON(code);
  }, []); // 仅挂载时执行一次

  // 启动时加载文件列表
  useEffect(() => {
    fetchFileList();
  }, [fetchFileList]);

  const handleLoadFile = useCallback(async (fileName) => {
    setFileLoading(true);
    try {
      const content = await readFile(fileName);
      setCode(content);
      scheduleParse(content);
      setCurrentFile(fileName);
      setStatus(`✓ 已打开 ${fileName}`);
    } catch (e) {
      setStatus('✕ 读取文件失败: ' + e.message);
    } finally {
      setFileLoading(false);
    }
  }, [scheduleParse]);

  const handleSaveFile = useCallback(async () => {
    if (!currentFile) {
      handleDownload();
      return;
    }
    try {
      await saveFile(currentFile, code);
      setStatus(`✓ 已保存到 ${currentFile}`);
      fetchFileList(); // 刷新列表（文件大小可能变了）
    } catch (e) {
      setStatus('✕ 保存失败: ' + e.message);
    }
  }, [currentFile, code, handleDownload, fetchFileList]);

  const handleNewFile = useCallback(async () => {
    const name = prompt('请输入新文件名（无需 .json 后缀）');
    if (!name || !name.trim()) return;
    try {
      const created = await createFile(name.trim(), '{\n  \n}');
      await fetchFileList();
      handleLoadFile(created);
      setStatus(`✓ 已创建 ${created}`);
    } catch (e) {
      setStatus('✕ 创建失败: ' + e.message);
    }
  }, [fetchFileList, handleLoadFile]);

  const handleDeleteFile = useCallback(async (fileName) => {
    if (!confirm(`确定要删除 ${fileName} 吗？`)) return;
    try {
      await deleteFile(fileName);
      if (currentFile === fileName) setCurrentFile(null);
      await fetchFileList();
      setStatus(`✓ 已删除 ${fileName}`);
    } catch (e) {
      setStatus('✕ 删除失败: ' + e.message);
    }
  }, [currentFile, fetchFileList]);

  // ========== 隐藏/恢复键 ==========
  const hideKey = useCallback((key) => {
    setHiddenKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  }, []);

  const unhideKey = useCallback((key) => {
    setHiddenKeys(prev => prev.filter(k => k !== key));
  }, []);

  // 点击外部关闭隐藏面板
  useEffect(() => {
    const handleClickOutside = (e) => {
      // 点击 toggle 按钮或面板内部不关闭
      if (hiddenToggleRef.current?.contains(e.target)) return;
      if (hiddenPanelRef.current?.contains(e.target)) return;
      setShowHiddenPanel(false);
    };
    if (showHiddenPanel) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showHiddenPanel]);

  // ========== 滚动时收起顶栏（用 scrollend 避免布局变化引发的循环触发）==========
  const handleScroll = useCallback((e) => {
    const currentScrollTop = e.target.scrollTop;
    // 滚动超过 100px 时收起顶栏，回到顶部附近时展开
    if (currentScrollTop > 100) {
      setToolbarHidden(true);
    } else {
      setToolbarHidden(false);
    }
  }, []);

  // 检测 scrollend 事件支持性（Safari < 16 不支持）
  const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

  // 监听代码区滚动（用 scrollend 避免布局变化引发的循环触发；不支持时回退到 scroll + 节流）（M5）
  useEffect(() => {
    const textarea = textareaRef.current;
    const treeViewport = treeViewportRef.current;
    // 用于 scroll 回退的节流定时器
    const scrollTimers = new Map();
    const onScrollFallback = (e) => {
      const el = e.target;
      if (scrollTimers.has(el)) clearTimeout(scrollTimers.get(el));
      scrollTimers.set(el, setTimeout(() => handleScroll(e), 100));
    };
    if (supportsScrollEnd) {
      if (textarea) textarea.addEventListener('scrollend', handleScroll, { passive: true });
      if (treeViewport) treeViewport.addEventListener('scrollend', handleScroll, { passive: true });
    } else {
      if (textarea) textarea.addEventListener('scroll', onScrollFallback, { passive: true });
      if (treeViewport) treeViewport.addEventListener('scroll', onScrollFallback, { passive: true });
    }
    return () => {
      if (supportsScrollEnd) {
        if (textarea) textarea.removeEventListener('scrollend', handleScroll);
        if (treeViewport) treeViewport.removeEventListener('scrollend', handleScroll);
      } else {
        if (textarea) textarea.removeEventListener('scroll', onScrollFallback);
        if (treeViewport) treeViewport.removeEventListener('scroll', onScrollFallback);
      }
      scrollTimers.forEach((t) => clearTimeout(t));
      scrollTimers.clear();
    };
  }, [handleScroll, supportsScrollEnd]);

  // 行号与代码同步滚动
  const lineNumbersRef = useRef(null);
  const isScrollingRef = useRef(false); // 防止循环触发

  // 动态获取代码区行高（避免硬编码与 CSS 不一致）（M1）
  const getLineHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return 21.45; // 回退默认值：13px * 1.65
    const lh = parseFloat(window.getComputedStyle(ta).lineHeight);
    return isNaN(lh) || lh === 0 ? 21.45 : lh;
  }, []);

  // 获取代码区第一个可见行号
  const getFirstVisibleLine = useCallback((textarea) => {
    return Math.floor(textarea.scrollTop / getLineHeight()) + 1;
  }, [getLineHeight]);

  // 滚动树形视图到指定行对应的节点
  const scrollTreeToLine = useCallback((line) => {
    if (!treeViewportRef.current) return;
    const treeViewport = treeViewportRef.current;
    const nodes = treeViewport.querySelectorAll('[data-line]');
    let targetNode = null;
    for (const node of nodes) {
      const nodeLine = parseInt(node.dataset.line, 10);
      if (nodeLine <= line) {
        targetNode = node;
      } else {
        break;
      }
    }
    if (targetNode) {
      const treeRect = treeViewport.getBoundingClientRect();
      const nodeRect = targetNode.getBoundingClientRect();
      const offset = nodeRect.top - treeRect.top + treeViewport.scrollTop - 8;
      treeViewport.scrollTop = Math.max(0, offset);
    }
  }, []);

  const handleEditorScroll = useCallback((e) => {
    // 行号同步
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
    // 树形视图同步滚动（分屏模式下，用行号对应同步）
    if (treeViewportRef.current && !isScrollingRef.current) {
      isScrollingRef.current = true;
      const line = getFirstVisibleLine(e.target);
      scrollTreeToLine(line);
      requestAnimationFrame(() => { isScrollingRef.current = false; });
    }
  }, [getFirstVisibleLine, scrollTreeToLine]);

  const handleTreeScroll = useCallback((e) => {
    const textarea = textareaRef.current;
    if (textarea && !isScrollingRef.current) {
      isScrollingRef.current = true;
      // 获取树形视图中第一个可见节点对应的行号
      const treeViewport = e.target;
      const nodes = treeViewport.querySelectorAll('[data-line]');
      const treeRect = treeViewport.getBoundingClientRect();
      let firstVisibleLine = 1;
      for (const node of nodes) {
        const nodeRect = node.getBoundingClientRect();
        if (nodeRect.top > treeRect.top) {
          firstVisibleLine = parseInt(node.dataset.line, 10) || 1;
          break;
        }
      }
      // 滚动代码区到对应行
      textarea.scrollTop = (firstVisibleLine - 1) * getLineHeight();
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textarea.scrollTop;
      }
      requestAnimationFrame(() => { isScrollingRef.current = false; });
    }
  }, [getLineHeight]);

  // ========== 代码编辑 ==========
  const handleCodeChange = useCallback((e) => {
    const text = e.target.value;
    setCode(text);
    scheduleParse(text);
  }, [scheduleParse]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      scheduleParse(newCode);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [code, scheduleParse]);

  return (
    <div
      className="app"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖放文件时的视觉遮罩 */}
      {dragOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <span className="drag-overlay-icon">📄</span>
            <span className="drag-overlay-text">拖放 JSON 文件到此处打开</span>
          </div>
        </div>
      )}
      {/* 顶部工具栏 */}
      <header className={`toolbar ${toolbarHidden ? 'toolbar-hidden' : ''}`}>
        <div className="toolbar-left">
          <h1 className="logo">
            <span className="logo-icon">{'{ }'}</span>
            <span>JSON 编辑器</span>
          </h1>
        </div>

        <div className="toolbar-center">
          <button className="btn" onClick={handleFormat} title="格式化">
            <span className="btn-icon">↹</span> 格式化
          </button>
          <button className="btn" onClick={handleMinify} title="压缩">
            <span className="btn-icon">⤬</span> 压缩
          </button>
          <div className="divider" />
          <button className="btn" onClick={handleNewFile} title="新建 JSON 文件">
            <span className="btn-icon">📁</span> 新建
          </button>
          <button className="btn" onClick={handleUpload} title="打开单个文件">
            <span className="btn-icon">📂</span> 打开
          </button>
          <button className="btn" onClick={handleSaveFile} title="保存到文件">
            <span className="btn-icon">💾</span> 保存
          </button>
          <div className="divider" />
          <button className="btn" onClick={handlePaste} title="粘贴">
            <span className="btn-icon">📋</span> 粘贴
          </button>
          <button className="btn" onClick={handleCopy} title="复制">
            <span className="btn-icon">📑</span> 复制
          </button>
          <div className="divider" />
          <button className="btn btn-danger" onClick={handleClear} title="清空">
            <span className="btn-icon">🗑</span> 清空
          </button>
        </div>

        <div className="toolbar-right">
          <div className="view-toggle">
            <button className={`view-btn ${view === 'code' ? 'active' : ''}`} onClick={() => setView('code')}>代码</button>
            <button className={`view-btn ${view === 'split' ? 'active' : ''}`} onClick={() => setView('split')}>分屏</button>
            <button className={`view-btn ${view === 'tree' ? 'active' : ''}`} onClick={() => setView('tree')}>树形</button>
          </div>
        </div>
      </header>

      {/* 搜索栏 */}
      <div className={`search-bar ${toolbarHidden ? 'search-bar-hidden' : ''}`}>
        <input
          type="text"
          className="search-input"
          placeholder="🔍 搜索键名或值..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="search-clear" onClick={() => setSearchTerm('')}>✕</button>
        )}
        {hiddenKeys.length > 0 && (
          <div className="hidden-keys-dropdown-wrapper">
            <button ref={hiddenToggleRef} className="hidden-keys-toggle" onClick={() => setShowHiddenPanel(!showHiddenPanel)}>
              🙈 {hiddenKeys.length}
            </button>
          </div>
        )}

        {/* 使用 portal 渲染下拉面板，避免被搜索栏 overflow 裁剪 */}
        {showHiddenPanel && hiddenToggleRef.current &&
          createPortal(
            <div className="hidden-keys-panel" ref={hiddenPanelRef} style={getPanelPosition(hiddenToggleRef.current)}>
              <div className="hidden-keys-panel-header">
                <span>隐藏的键</span>
                <button className="hidden-clear-all" onClick={() => { setHiddenKeys([]); setShowHiddenPanel(false); }}>全部恢复</button>
              </div>
              <div className="hidden-keys-list">
                {hiddenKeys.map(k => (
                  <div key={k} className="hidden-key-item">
                    <span className="hidden-key-name">{k}</span>
                    <button className="hidden-key-restore" onClick={() => unhideKey(k)} title="恢复显示">↩</button>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        }
      </div>

      {/* 本地文件列表 */}
      {showFilePanel && (
        <div className="file-panel">
          <div className="file-panel-header">
            <span className="file-panel-title">
              📁 {storageMode === 'local' ? '浏览器存储' : 'json-files'}
              {storageMode === 'local' && (
                <span className="file-panel-badge" title="当前是静态部署，没有后端服务，文件保存在浏览器 localStorage 中（仅本机本浏览器可见）">
                  本地
                </span>
              )}
            </span>
            <div className="file-panel-actions">
              <button className="file-panel-refresh" onClick={fetchFileList} title="刷新列表">↻</button>
              <button className="file-panel-close" onClick={() => setShowFilePanel(false)}>✕</button>
            </div>
          </div>
          <div className="file-panel-list">
            {fileLoading ? (
              <div className="file-panel-empty">加载中...</div>
            ) : fileList.length === 0 ? (
              <div className="file-panel-empty">
                暂无 JSON 文件，点击「新建」创建
                {storageMode === 'local' && '（文件保存在浏览器中，不会上传）'}
              </div>
            ) : (
              fileList.map(f => (
                <div
                  key={f.name}
                  className={`file-item ${currentFile === f.name ? 'file-item-active' : ''}`}
                  onClick={() => handleLoadFile(f.name)}
                >
                  <span className="file-item-icon">{'{ }'}</span>
                  <span className="file-item-name">{f.name}</span>
                  {currentFile === f.name && <span className="file-item-badge">当前</span>}
                  <button className="file-item-delete" onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.name); }} title="删除">✕</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 主编辑区 */}
      <main className="editor-area">
        {/* 代码编辑器 */}
        {(view === 'code' || view === 'split') && (
          <div className="panel code-panel">
            <div className="panel-header">
              <span className="panel-title">代码</span>
              <span className="panel-info">
                {errorLine ? (
                  <span className="panel-error-info">✕ 第 {errorLine} 行{errorDetail ? `: ${errorDetail.reason}` : ''}</span>
                ) : (
                  `${code.length} 字符 · ${codeLines.length} 行`
                )}
              </span>
            </div>
            <div className="editor-wrapper">
              <div className="line-numbers" ref={lineNumbersRef}>
                {codeLines.map((_, i) => (
                  <div
                    key={i}
                    className={`line-number ${errorLine === i + 1 ? 'line-number-error' : ''}`}
                    title={errorLine === i + 1 && errorDetail ? errorDetail.reason : undefined}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                className="code-input"
                value={code}
                onChange={handleCodeChange}
                onKeyDown={handleKeyDown}
                onScroll={handleEditorScroll}
                spellCheck={false}
                placeholder="在此粘贴或输入 JSON..."
              />
            </div>
          </div>
        )}

        {/* 树形视图 */}
        {(view === 'tree' || view === 'split') && (
          <div className="panel tree-panel">
            <div className="panel-header">
              <span className="panel-title">树形编辑器</span>
              {parsedData !== undefined && (
                <span className="panel-info">
                  {Array.isArray(parsedData) ? `数组 [${parsedData.length}]`
                    : typeof parsedData === 'object' && parsedData !== null ? `对象 {${Object.keys(parsedData).length}}`
                    : typeof parsedData}
                </span>
              )}
            </div>
            <div className="tree-viewport" ref={treeViewportRef} onScroll={handleTreeScroll}>
              <TreeView
                data={parsedData}
                error={error}
                hiddenKeys={hiddenKeys}
                searchTerm={searchTerm}
                onDelete={handleTreeDelete}
                onEdit={handleTreeEdit}
                onAdd={handleTreeAdd}
                onRenameKey={handleTreeRenameKey}
                onHideKey={hideKey}
              />
            </div>
          </div>
        )}
      </main>

      {/* 状态栏 */}
      <footer className="status-bar">
        <span className={`status-text ${error ? 'status-error' : 'status-ok'}`}>
          {status}
        </span>
        <span className="status-right">
          <span className="status-hint">双击编辑 · 折叠后 ✕ 整段删除 · Tab 缩进</span>
        </span>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

export default App;
