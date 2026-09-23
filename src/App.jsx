import { useState, useCallback, useRef, useEffect } from 'react';
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
  const treeVersionRef = useRef(0); // 用于强制树形视图刷新
  const [toolbarHidden, setToolbarHidden] = useState(false);
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

  // 解析 JSON 错误位置
  const parseErrorPosition = useCallback((err, text) => {
    const message = err.message || '';
    let line = 1;
    let column = 1;
    let reason = message;

    // 尝试从错误信息中提取 position
    const posMatch = message.match(/position (\d+)/i);
    const atMatch = message.match(/at position (\d+)/i);
    const pos = posMatch ? parseInt(posMatch[1]) : (atMatch ? parseInt(atMatch[1]) : null);

    if (pos !== null && !isNaN(pos)) {
      // 将 position 转换为行号列号
      const lines = text.substring(0, pos).split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    } else {
      // 尝试直接匹配 "line X column Y"
      const lineColMatch = message.match(/line (\d+) column (\d+)/i);
      if (lineColMatch) {
        line = parseInt(lineColMatch[1]);
        column = parseInt(lineColMatch[2]);
      }
    }

    // 提取更友好的错误原因
    if (message.includes('Unexpected end')) {
      reason = 'JSON 不完整（可能缺少闭合括号或引号）';
    } else if (message.includes('Unexpected token')) {
      const tokenMatch = message.match(/Unexpected token '?([^']*)'?/);
      const token = tokenMatch ? tokenMatch[1] : '';
      reason = `意外的字符 "${token}"`;
    } else if (message.includes('Unexpected string')) {
      reason = '此处出现意外的字符串（可能缺少逗号或冒号）';
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

  // ========== 数据操作：修改后同步到代码 ==========
  const syncToCode = useCallback((newData) => {
    const newCode = JSON.stringify(newData, null, 2);
    setCode(newCode);
    setError(null);
    setParsedData(newData);
    treeVersionRef.current++;
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
      const val = parent[key];
      delete parent[key];
      parent[newKey] = val;
      syncToCode(newData);
      setStatus('✓ 已重命名键');
    }
  }, [parsedData, syncToCode]);

  // ========== 工具栏操作 ==========
  const handleFormat = useCallback(() => {
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

  // 监听代码区滚动（用 scrollend 避免布局变化引发的循环触发）
  useEffect(() => {
    const textarea = textareaRef.current;
    const treeViewport = treeViewportRef.current;
    if (textarea) textarea.addEventListener('scrollend', handleScroll, { passive: true });
    if (treeViewport) treeViewport.addEventListener('scrollend', handleScroll, { passive: true });
    return () => {
      if (textarea) textarea.removeEventListener('scrollend', handleScroll);
      if (treeViewport) treeViewport.removeEventListener('scrollend', handleScroll);
    };
  }, [handleScroll]);

  // 行号与代码同步滚动
  const lineNumbersRef = useRef(null);
  const isScrollingRef = useRef(false); // 防止循环触发
  const LINE_HEIGHT = 21.45; // 13px * 1.65 line-height，代码区行高

  // 获取代码区第一个可见行号
  const getFirstVisibleLine = useCallback((textarea) => {
    return Math.floor(textarea.scrollTop / LINE_HEIGHT) + 1;
  }, []);

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
      textarea.scrollTop = (firstVisibleLine - 1) * LINE_HEIGHT;
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textarea.scrollTop;
      }
      requestAnimationFrame(() => { isScrollingRef.current = false; });
    }
  }, []);

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
    <div className="app">
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
                  `${code.length} 字符 · ${code.split('\n').length} 行`
                )}
              </span>
            </div>
            <div className="editor-wrapper">
              <div className="line-numbers" ref={lineNumbersRef}>
                {code.split('\n').map((_, i) => (
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
                key={treeVersionRef.current}
                data={parsedData}
                error={error}
                hiddenKeys={hiddenKeys}
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
