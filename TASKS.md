# json-studio 修复任务追踪

> 基于三方审查报告（安全 13 项 + 正确性 12 项 + 架构 18 项），合并去重后共 43 项。

---

## 🔴 CRITICAL（4 项）

- [x] **C1** · CORS 通配符 + 无认证 → 跨站数据泄露/篡改
  - 文件: `server.mjs:19`
  - 修复: 已移除 `cors()` 和 cors 依赖
  - 状态: ✅ 已完成

- [x] **C2** · 搜索过滤是虚假功能
  - 文件: `src/App.jsx`, `src/TreeView.jsx`
  - 修复: 已实现搜索过滤（searchTerm 传入 TreeView，按键名/值/后代匹配过滤）
  - 状态: ✅ 已完成

- [x] **C3** · server.js 是死代码且无法执行（CommonJS in ESM）
  - 文件: `server.js`
  - 修复: 已删除 server.js
  - 状态: ✅ 已完成

- [x] **C4** · server.js 路径遍历防护可绕过（startsWith）
  - 文件: `server.js`
  - 修复: 随 C3 删除 server.js
  - 状态: ✅ 已完成

---

## 🟠 HIGH（14 项）

- [x] **H1** · 50MB JSON body 拒绝服务
  - 文件: `server.mjs:20`
  - 修复: 已降低 limit 至 5mb + content 字段单独校验
  - 状态: ✅ 已完成

- [x] **H2** · 无请求频率限制
  - 文件: `server.mjs`
  - 修复: 为文件 API 添加按客户端 IP 的窗口限流、429/Retry-After 响应与过期记录清理；不额外引入运行时依赖
  - 状态: ✅ 已完成（已添加独立单元测试）

- [x] **H3** · 同步文件 I/O 阻塞事件循环
  - 文件: `server.mjs`
  - 修复: 已改为 fs.promises 异步 API
  - 状态: ✅ 已完成

- [x] **H4** · 服务端错误消息泄露
  - 文件: `server.mjs`
  - 修复: 已添加 toSafeError 脱敏函数
  - 状态: ✅ 已完成

- [x] **H5** · 缺少安全响应头
  - 文件: `server.mjs`
  - 修复: 已手动添加 X-Content-Type-Options / X-Frame-Options / Referrer-Policy
  - 状态: ✅ 已完成

- [x] **H6** · 双向滚动同步映射根本性错误
  - 文件: `src/App.jsx`, `src/TreeView.jsx`, `src/scrollSync.js`
  - 修复: 通过 JSON 路径映射源码行和树节点；支持压缩/自定义缩进、嵌套数组及转义字符串；增加映射单测
  - 状态: ✅ 已完成

- [x] **H7** · handleTreeRenameKey 重命名键静默覆盖数据
  - 文件: `App.jsx:232-248`
  - 修复: 已添加重复键名检查
  - 状态: ✅ 已完成

- [x] **H8** · scheduleParse 竞态覆盖 parsedData
  - 文件: `App.jsx:159-166,251-279`
  - 修复: 已在 syncToCode/format/minify 中清除防抖定时器
  - 状态: ✅ 已完成

- [x] **H9** · treeVersionRef key 每次编辑重建整棵树
  - 文件: `App.jsx:781-790`
  - 修复: 已移除 key 属性
  - 状态: ✅ 已完成

- [x] **H10** · lineCounterRef 在渲染阶段 mutation
  - 文件: `TreeView.jsx`
  - 修复: 已改用 LineCounterContext + 局部变量 allocateLine
  - 状态: ✅ 已完成

- [x] **H11** · code.split('\n') 每次渲染执行两次
  - 文件: `App.jsx:45`
  - 修复: 已用 useMemo 缓存 codeLines
  - 状态: ✅ 已完成

- [ ] **H12** · App.jsx 职责仍然过载
  - 文件: `src/App.jsx`
  - 进展: 已将双向滚动同步抽取为 `src/useScrollSync.js`，路径映射独立为 `src/scrollSync.js`；解析器与文件管理 hook 仍待拆分

- [x] **H13** · 无 React ErrorBoundary
  - 文件: `src/main.jsx`
  - 修复: 已创建 ErrorBoundary.jsx 并包裹 App
  - 状态: ✅ 已完成

- [x] **H14** · server.js 与 server.mjs 并存的安全降级风险
  - 文件: `server.js`
  - 修复: 已随 C3 删除 server.js
  - 状态: ✅ 已完成

---

## 🟡 MEDIUM（19 项）

- [x] **M1** · LINE_HEIGHT 21.45 与树行高 23.4px 不匹配
  - 修复: 已改用 getComputedStyle 动态获取行高
- [x] **M2** · TOCTOU 竞态：createFile exists→write 之间可被覆盖
  - 修复: 已改用 fs.promises.open with 'wx' 排他创建
- [x] **M3** · server.js 缺 /api/health → 误启动时前端无感知退回
  - 修复: 已随 C3 删除 server.js
- [x] **M4** · parseTimerRef 定时器组件卸载未清理
  - 修复: 已添加 useEffect 清理
- [x] **M5** · scrollend 无 fallback，旧浏览器工具栏收起失效
  - 修复: 已添加特性检测 + scroll 事件节流回退
- [ ] **M6** · 可访问性仍需完善（ARIA/键盘/屏幕阅读器）
  - 进展: 树形视图已增加 tree/treeitem 语义、方向键折叠/展开、动作按钮标签与菜单语义；文件弹窗支持 Escape 关闭。完整焦点陷阱、焦点恢复与全站键盘路径仍待完善
- [x] **M7** · 无 TypeScript、无测试、无 CI/CD
  - 修复: 已配置 Vitest + React Testing Library，61 个测试通过
- [x] **M8** · getPanelPosition 无 resize 监听
  - 修复: 面板打开时监听窗口 resize 和捕获阶段 scroll，并将位置限制在可视区域
- [x] **M9** · prompt()/confirm() 阻塞 API
  - 修复: 新建文件与删除文件改用应用内对话框，并补充交互测试
- [ ] **M10** · 硬编码魔法值（端口、行高、颜色、SAMPLE_JSON）
  - 进展: 文件服务端口已可通过 `JSON_STUDIO_PORT` 配置，Vite 代理同步使用该值；行高按计算样式读取，仍需统一剩余常量
- [ ] **M11** · @types/react 对纯 JSX 项目无价值
- [x] **M12** · 未引用资产（hero.png, react.svg, vite.svg）
  - 修复: 已删除
- [x] **M13** · Express 缺少错误处理中间件
  - 修复: 已添加 404 处理 + 全局错误中间件
- [ ] **M14** · 无 HTTPS/HSTS
  - 进展: 文件服务和 Vite 开发服务器默认只监听 `127.0.0.1`，README 明确警告不要在不可信网络中暴露无认证 API；远程部署仍需独立的 TLS/认证方案
- [x] **M15** · content 字段无大小/类型校验
  - 修复: 已添加 validateContent 中间件
- [x] **M16** · scrollTreeToLine 每帧 O(n) DOM 查询
  - 修复: 通过 JSON 路径索引定位树节点，并缓存按源码行排序的映射索引，滚动时使用二分查找
- [x] **M17** · detectMode 会话级缓存，后端状态变化无法自适应
  - 修复: 探测结果缓存 15 秒后过期并重新探测；新增缓存过期与后端恢复测试
- [ ] **M18** · localStorage 存储文件内容可被同 origin 脚本读取
  - 进展: README 已明确提醒不要在本地草稿/文件中存放密码、访问令牌或机密；由于浏览器 localStorage 的同源访问模型，真正隔离敏感数据需要改用不落地的存储方案
- [x] **M19** · server.js 不过滤目录、不校验 name 类型
  - 修复: 已随 C3 删除 server.js

---

## 🟢 LOW（6 项）

- [x] **L1** · 单一响应式断点
  - 修复: 已有 900px 与 480px 两级响应式断点，覆盖平板/手机布局
- [x] **L2** · server.mjs 中 spawn 未使用
  - 修复: 已移除 spawn 导入
- [ ] **L3** · 硬编码中文 UI 无国际化
- [x] **L4** · docs 构建产物提交策略
  - 说明: GitHub Pages 从 main 分支 `/docs` 发布，README 已记录 `npm run build:pages` 后提交构建产物的流程
- [x] **L5** · LICENSE 版权声明检查
  - 检查: 仓库包含标准 MIT License，版权年份与仓库当前维护年份一致
- [x] **L6** · 无 React ErrorBoundary（重复 H13）
  - 修复: 已随 H13 完成

---

## 🧪 测试覆盖目标

- [x] 配置 Vitest + React Testing Library
- [x] 添加 GitHub Actions CI：自动运行测试、lint 与生产构建
- [x] storage.js 单元测试（16 个测试，覆盖 CRUD + byteSize + 错误处理）
- [x] server.mjs API 测试（15 个测试，覆盖 CRUD + 路径遍历防护 + 错误码）
- [x] App.jsx 关键逻辑测试（12 个测试，覆盖渲染 + 格式化/压缩/清空 + 错误 + 剪贴板 + 视图切换）
- [x] TreeView.jsx 渲染测试（12 个测试，覆盖渲染 + 折叠 + 编辑 + 删除 + 添加 + 隐藏）
- [x] ErrorBoundary 测试（6 个测试，覆盖正常渲染 + 错误捕获 + 重试恢复）

---

## 统计

| 优先级 | 总数 | 已完成 | 进行中 | 待处理 |
|---|---|---|---|---|
| CRITICAL | 4 | **4** | 0 | 0 |
| HIGH | 14 | **11** | 0 | 3 |
| MEDIUM | 19 | **13** | 0 | 6 |
| LOW | 6 | **2** | 0 | 4 |
| **合计** | **43** | **30** | **0** | **13** |
