# 万能 JSON 编辑器

一个开箱即用的 JSON 编辑工具：左边写代码，右边看树形结构，改完实时校验。

**🌐 在线使用：<https://hfugghg.github.io/json-studio/>**

不用安装、不用注册，打开就能用。

---

## 功能

| 功能 | 说明 |
| --- | --- |
| 双视图编辑 | 代码 / 分屏 / 树形三种布局随意切换，代码区和树形区滚动位置双向联动 |
| 语法校验 | 输入即校验（300ms 防抖），精确提示出错的行号，并翻译成人话的原因 |
| 格式化 / 压缩 | 一键美化或压成一行 |
| 树形编辑 | 双击改值、增删节点、重命名键、折叠展开，无需手写括号 |
| 隐藏键 | 长表格里把不关心的字段从树中隐掉，随时恢复，选择记在本地 |
| 搜索过滤 | 按键名或值实时过滤树节点 |
| 文件管理 | 新建 / 打开 / 保存 / 删除 JSON 文件，支持本地文件上传下载 |
| 剪贴板 | 一键粘贴、一键复制 |

## 在线版说明

GitHub Pages 只能托管静态文件，跑不了后端，所以线上版本的文件面板**自动切换为浏览器本地存储**：

- 文件保存在你当前浏览器的 `localStorage` 里，面板标题会显示「浏览器存储」并带一个 `本地` 徽标
- 数据**不会上传到任何服务器**，但也**不会跨设备同步** —— 换台电脑或换个浏览器就看不到了
- 清空浏览器数据会一并清掉这些文件，重要内容请用「下载」导出到本地
- 需要跨设备共享或长期保存，请按下面的步骤在本地跑，文件会真正落到磁盘上

编辑器本身的功能（编辑、树形、格式化、校验、上传下载、搜索）在线上和本地完全一致。

## 快速开始

需要 Node.js 18 或更高版本。

```bash
git clone https://github.com/Hfugghg/json-studio.git
cd json-studio
npm install
```

**本地完整模式**（带文件管理，文件存到 `json-files/` 目录）：

```bash
npm run server   # 终端 1：启动文件服务（端口 3001）
npm run dev      # 终端 2：启动前端（端口 5173）
```

或者一条命令同时起两个：

```bash
npm start
```

然后打开 <http://localhost:5173>。

> 只跑 `npm run dev` 也能用，此时文件面板会自动退回浏览器存储 —— 和线上版本行为一致。

**局域网访问**：开发服务器已监听 `0.0.0.0`，同一网络下的手机、平板直接用 `http://你的电脑IP:5173` 就能打开。

## 可用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（HMR） |
| `npm run server` | 只启动 Express 文件服务 |
| `npm start` | 同时启动文件服务和前端 |
| `npm run build` | 构建到 `dist/` |
| `npm run build:pages` | 构建到 `docs/`，用于 GitHub Pages 部署 |
| `npm run lint` | 代码检查（oxlint） |
| `npm run preview` | 预览构建产物 |

## 项目结构

```
├── src/
│   ├── App.jsx        # 主组件：编辑器、工具栏、文件面板、状态栏
│   ├── TreeView.jsx   # 树形视图与节点增删改
│   ├── storage.js     # 存储适配层：后端 API ↔ 浏览器存储自动切换
│   ├── App.css        # 组件样式
│   └── index.css      # 全局样式与主题变量
├── server.mjs         # Express 文件服务，读写 json-files/
├── server.js          # 同上的旧版实现（保留）
├── scripts/
│   └── postbuild-pages.mjs   # Pages 构建后处理
├── public/            # 静态资源
├── json-files/        # 本地 JSON 文件存放目录（不入库）
└── docs/              # GitHub Pages 构建产物（由脚本生成，请勿手改）
```

### 存储适配层

`src/storage.js` 是本地文件和线上体验能统一的关键。它启动时探测一次 `/api/health`：

- 探测到本机 Express 服务 → 所有文件操作走真实文件系统
- 探测不到（静态托管、服务没起、网络异常）→ 自动退回 `localStorage`

探测时会同时校验响应体内容，避免静态托管对任意路径返回 200 的 `index.html` 导致误判。

## 部署到 GitHub Pages

```bash
npm run build:pages
git add docs
git commit -m "build: 更新 Pages 产物"
git push
```

构建产物输出到 `docs/` 目录，仓库设置里 Pages 的来源选 **main 分支的 `/docs` 文件夹** 即可。

`vite.config.js` 里的 `base` 已按仓库名设为 `/json-studio/`。**如果你 fork 后改了仓库名，记得同步改这里**，否则线上会白屏（资源全部 404）。

## 技术栈

React 19 · Vite 8 · Express 5 · oxlint

## 许可

MIT
