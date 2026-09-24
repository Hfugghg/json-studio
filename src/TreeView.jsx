import { useState, useRef, useEffect, useContext, createContext } from 'react';

// 行号分配 context — 避免在渲染过程中 mutation ref（H10）
// 每次 TreeView 渲染时创建新的分配函数，子节点通过 context 获取行号
const LineCounterContext = createContext(() => 0);

// ========== 工具函数 ==========
function getValueType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function defaultValueForType(type) {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return true;
    case 'null': return null;
    case 'array': return [];
    case 'object': return {};
    default: return '';
  }
}

// 彩虹色阶
const RAINBOW = [
  '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c',
  '#4dabf7', '#9775fa', '#f783ac', '#66d9e8',
];

function getDepthColor(depth) {
  return RAINBOW[depth % RAINBOW.length];
}

// 生成背景色（每层一个实色背景，全宽）
function getDepthBgStyle(depth) {
  const color = RAINBOW[depth % RAINBOW.length];
  return { borderLeft: `3px solid ${color}66`, background: `${color}18` };
}

// 检查节点的值或任意后代是否匹配搜索词（用于搜索过滤 C2）
// 键名匹配在 TreeNode 中单独处理，此处只检查值与后代
function valueMatchesSearch(value, type, searchTerm, hiddenKeys) {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();

  // 叶子节点：直接检查值
  if (type !== 'object' && type !== 'array') {
    return String(value).toLowerCase().includes(term);
  }

  // 数组：递归检查元素
  if (type === 'array') {
    return value.some((item) => valueMatchesSearch(item, getValueType(item), searchTerm, hiddenKeys));
  }

  // 对象：递归检查属性值
  if (type === 'object') {
    return Object.entries(value).some(([k, v]) => {
      if (hiddenKeys.includes(k)) return false;
      return valueMatchesSearch(v, getValueType(v), searchTerm, hiddenKeys);
    });
  }

  return false;
}

// ========== 值编辑器 ==========
function ValueEditor({ value, type, onCommit, onCancel }) {
  const [editValue, setEditValue] = useState(() => {
    if (type === 'boolean') return String(value);
    if (type === 'null') return 'null';
    return String(value);
  });
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const commit = () => {
    let parsed;
    switch (type) {
      case 'string': parsed = editValue; break;
      case 'number': parsed = Number(editValue); if (isNaN(parsed)) parsed = 0; break;
      case 'boolean': parsed = editValue === 'true'; break;
      case 'null': parsed = null; break;
      default: parsed = editValue;
    }
    onCommit(parsed);
  };

  if (type === 'boolean') {
    return (
      <select ref={inputRef} className="inline-select" value={editValue}
        onChange={(e) => setEditValue(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (type === 'null') return <span className="tree-value null">null</span>;

  return (
    <input ref={inputRef} className={`inline-input ${type}`}
      type={type === 'number' ? 'number' : 'text'} value={editValue}
      onChange={(e) => setEditValue(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }} />
  );
}

// ========== 键名编辑器 ==========
function KeyEditor({ value, onCommit, onCancel }) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input ref={inputRef} className="inline-input key-input" type="text"
      value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }} />
  );
}

// ========== 添加节点菜单 ==========
function AddButton({ onAdd }) {
  const [open, setOpen] = useState(false);

  const types = ['string', 'number', 'boolean', 'null', 'object', 'array'];

  return (
    <div className="add-btn-wrapper">
      <button className="add-btn" onClick={() => setOpen(!open)} title="添加子节点">+</button>
      {open && (
        <div className="add-menu">
          {types.map(t => (
            <button key={t} className="add-menu-item" onClick={() => { onAdd(defaultValueForType(t)); setOpen(false); }}>
              <span className={`type-dot type-${t}`}></span>{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== 隐藏确认提示 ==========
function HideConfirm({ nodeKey, onConfirm, onCancel }) {
  return (
    <div className="hide-confirm" onClick={(e) => e.stopPropagation()}>
      <span className="hide-confirm-text">隐藏所有 "<b>{nodeKey}</b>" 键?</span>
      <div className="hide-confirm-actions">
        <button className="hide-confirm-yes" onClick={() => onConfirm(nodeKey)}>隐藏</button>
        <button className="hide-confirm-no" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

// ========== 单个树节点 ==========
function TreeNode({ nodeKey, value, depth, path, searchTerm, onDelete, onEdit, onAdd, onRenameKey, hiddenKeys, onHideKey }) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const type = getValueType(value);
  const isExpandable = type === 'object' || type === 'array';
  const childCount = isExpandable
    ? (type === 'array' ? value.length : Object.keys(value).length)
    : 0;

  const isArrayItem = typeof nodeKey === 'number';
  const isHidden = hiddenKeys.length > 0 && !isArrayItem && hiddenKeys.includes(String(nodeKey));

  if (isHidden) return null;

  // 搜索过滤：节点键名、值及后代均不匹配时隐藏（C2）
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    // 键名匹配（跳过根节点和数组索引）
    const keyMatches = nodeKey !== 'root' && !isArrayItem && String(nodeKey).toLowerCase().includes(term);
    // 值或后代匹配
    const valueMatches = valueMatchesSearch(value, type, searchTerm, hiddenKeys);
    if (!keyMatches && !valueMatches) return null;
  }

  // 分配行号（通过 context 获取分配函数，避免渲染中 ref mutation）（H10）
  const allocateLine = useContext(LineCounterContext);
  const currentLine = allocateLine();

  const toggle = () => { if (isExpandable) setCollapsed(c => !c); };

  const handleDelete = (e) => { e.stopPropagation(); onDelete(path); };

  const handleValueCommit = (newVal) => { onEdit(path, newVal); setEditing(false); };
  const handleKeyCommit = (newKey) => { onRenameKey(path, newKey); setEditingKey(false); };
  const handleAddChild = (childVal) => { onAdd(path, childVal); setCollapsed(false); };

  const handleHideClick = (e) => {
    e.stopPropagation();
    setConfirmHide(true);
  };

  const handleConfirmHide = (key) => {
    onHideKey(key);
    setConfirmHide(false);
  };

  const indentStyle = { paddingLeft: `${depth * 18 + 8}px`, ...getDepthBgStyle(depth) };
  const keyColor = { color: getDepthColor(depth) };

  // --- 叶子节点 ---
  if (!isExpandable) {
    return (
      <div className="tree-row tree-leaf" style={indentStyle} data-line={currentLine}>
        {isArrayItem ? null : (
          <>
            <span className="tree-key clickable" style={keyColor}
              onDoubleClick={() => setEditingKey(true)} title="双击重命名键">{nodeKey}</span>
            <span className="tree-colon">:</span>
          </>
        )}
        {editing ? (
          <ValueEditor value={value} type={type} onCommit={handleValueCommit} onCancel={() => setEditing(false)} />
        ) : (
          <span className={`tree-value ${type} clickable`}
            onDoubleClick={() => setEditing(true)} title="双击编辑值">
            {type === 'string' ? `"${value}"` : String(value)}
          </span>
        )}
        <div className="node-actions">
          {!isArrayItem && (
            confirmHide ? (
              <HideConfirm nodeKey={nodeKey} onConfirm={handleConfirmHide} onCancel={() => setConfirmHide(false)} />
            ) : (
              <button className="node-hide" onClick={handleHideClick} title="隐藏此键名下所有节点">👁</button>
            )
          )}
          <button className="node-delete" onClick={handleDelete} title="删除">✕</button>
        </div>
      </div>
    );
  }

  // --- 分支节点 ---
  return (
    <div>
      <div className="tree-row tree-branch" style={indentStyle} data-line={currentLine} onClick={toggle}>
        <span className={`tree-arrow ${collapsed ? '' : 'expanded'}`}>
          {collapsed ? '▶' : '▼'}
        </span>
        {isArrayItem ? (
          <span className="tree-key array-index" style={keyColor}>[{nodeKey}]</span>
        ) : (
          editingKey ? (
            <KeyEditor value={nodeKey} onCommit={handleKeyCommit} onCancel={() => setEditingKey(false)} />
          ) : (
            <span className="tree-key clickable" style={keyColor}
              onDoubleClick={(e) => { e.stopPropagation(); setEditingKey(true); }} title="双击重命名键">{nodeKey}</span>
          )
        )}
        <span className="tree-summary">
          {collapsed ? getSummary(value, type) : `${type === 'array' ? `[${childCount}]` : `{${childCount}}`}`}
        </span>
        <div className="node-actions">
          <AddButton onAdd={handleAddChild} />
          {!isArrayItem && (
            confirmHide ? (
              <HideConfirm nodeKey={nodeKey} onConfirm={handleConfirmHide} onCancel={() => setConfirmHide(false)} />
            ) : (
              <button className="node-hide" onClick={handleHideClick} title="隐藏此键名下所有节点">👁</button>
            )
          )}
          <button className="node-delete" onClick={handleDelete} title="删除整个节点">✕</button>
        </div>
      </div>
      {!collapsed && (
        <div className="tree-children">
          {type === 'array'
            ? value.map((item, i) => (
                <TreeNode key={`${i}-${childCount}`} nodeKey={i} value={item} depth={depth + 1}
                  path={[...path, i]} searchTerm={searchTerm}
                  onDelete={onDelete} onEdit={onEdit} onAdd={onAdd}
                  onRenameKey={onRenameKey} hiddenKeys={hiddenKeys} onHideKey={onHideKey} />
              ))
            : Object.entries(value).map(([k, v]) => (
                <TreeNode key={`${k}-${childCount}`} nodeKey={k} value={v} depth={depth + 1}
                  path={[...path, k]} searchTerm={searchTerm}
                  onDelete={onDelete} onEdit={onEdit} onAdd={onAdd}
                  onRenameKey={onRenameKey} hiddenKeys={hiddenKeys} onHideKey={onHideKey} />
              ))
          }
          {childCount === 0 && (
            <div className="tree-empty-node" style={{ paddingLeft: `${(depth + 1) * 18 + 22}px` }}>
              空 {type === 'array' ? '数组' : '对象'} — 点击 + 添加
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== 折叠时显示内容摘要 ==========
function getSummary(value, type) {
  if (type === 'array') {
    if (value.length === 0) return '[ ]';
    const items = value.slice(0, 3).map(v => {
      const t = getValueType(v);
      if (t === 'string') return `"${v.length > 10 ? v.slice(0, 10) + '…' : v}"`;
      if (t === 'object') return `{…}`;
      if (t === 'array') return `[…]`;
      return String(v);
    });
    const suffix = value.length > 3 ? `, …+${value.length - 3}` : '';
    return `[ ${items.join(', ')}${suffix} ]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{ }';
    const shown = keys.slice(0, 3).map(k => `${k}: …`);
    const suffix = keys.length > 3 ? `, …+${keys.length - 3}` : '';
    return `{ ${shown.join(', ')}${suffix} }`;
  }
  return String(value);
}

// ========== 主组件 ==========
export default function TreeView({ data, error, hiddenKeys, searchTerm, onDelete, onEdit, onAdd, onRenameKey, onHideKey }) {
  // 行号计数器：每次渲染创建新的分配函数，通过 context 提供给子节点（H10）
  // 使用局部变量而非 ref，确保每次渲染独立计数，不跨渲染残留
  let lineCounter = 1;
  const allocateLine = () => lineCounter++;

  if (error) {
    return (
      <div className="tree-error">
        <span className="tree-error-icon">✕</span>
        <span>{error}</span>
        <span className="tree-error-hint">修复语法错误后树形视图将自动恢复</span>
      </div>
    );
  }

  if (data === undefined) {
    return <div className="tree-empty">在左侧输入 JSON 以查看树形视图</div>;
  }

  const type = getValueType(data);

  return (
    <LineCounterContext.Provider value={allocateLine}>
      <div className="tree-container">
        <TreeNode nodeKey="root" value={data} depth={0} path={[]}
          searchTerm={searchTerm || ''}
          onDelete={onDelete} onEdit={onEdit} onAdd={onAdd} onRenameKey={onRenameKey}
          hiddenKeys={hiddenKeys || []} onHideKey={onHideKey} />
      </div>
    </LineCounterContext.Provider>
  );
}
