# Web Resume

本地单用户简历管理器：导入 Markdown 或 DOCX，在网页中调整内容和顺序，并按参考版式导出 A4 PDF。

## 功能

- 导入 Markdown / DOCX 简历并解析为结构化模块。
- 在网页中编辑基本信息、教育经历、项目经历、技能、奖项等内容。
- 支持模块、条目和要点拖拽排序。
- 支持复制岗位版本、重命名和删除版本。
- 支持实时 A4 预览和 PDF 导出。
- 数据保存在本地，不上传到外部服务。

## 运行要求

- Git
- Python 3.9+
- Node.js 18+
- Google Chrome，用于导出 PDF

PDF 导出会自动尝试寻找常见位置的 Google Chrome。如果 Chrome 不在默认位置，可以通过 `CHROME_PATH` 指定 Chrome 可执行文件路径。

## 安装

在希望存放项目的目录执行：

### macOS / Linux

```bash
git clone https://github.com/dimbaby/web-resume.git
cd web-resume
python3 -m venv .venv
./.venv/bin/pip install -r backend/requirements.txt
npm install
npm --prefix frontend install
```

### Windows PowerShell

```powershell
git clone https://github.com/dimbaby/web-resume.git
cd web-resume
py -3 -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
npm install
npm --prefix frontend install
```

Windows 用户可以直接使用 PowerShell。WSL 用户也可以按 Linux 流程运行。

## 运行

### 生产模式

生产模式会先构建前端，再启动本地服务并打开浏览器。

```bash
npm run prod:open
```

打开地址：

```text
http://127.0.0.1:8000
```

也可以使用内置启动命令：

macOS / Linux：

```bash
./bin/webresume --start
```

Windows PowerShell：

```powershell
.\bin\webresume.cmd --start
```

### 开发模式

开发模式会启动前后端热更新服务，适合修改代码时使用。

```bash
npm run dev:open
```

前端地址：

```text
http://127.0.0.1:5173
```

后端接口：

```text
http://127.0.0.1:8000
```

服务运行期间终端窗口需要保持打开；按 `Control + C` 可以停止服务。

## 可选：安装全局命令

macOS / Linux 可以把 `webresume` 安装到 `PATH` 中：

```bash
mkdir -p "$HOME/.local/bin"
ln -sfn "$PWD/bin/webresume" "$HOME/.local/bin/webresume"
```

如果随后提示 `webresume: command not found`，需要把 `~/.local/bin` 加入 shell 的 `PATH`。

安装后可在任意目录执行：

```bash
webresume --start
webresume --dev
webresume --status
webresume --stop
webresume --test
```

Windows 用户通常直接在项目目录使用 `npm run prod:open` 或 `.\bin\webresume.cmd --start` 即可。

## 测试

```bash
npm test
```

## 数据保存

- 运行数据保存在 `data/`。
- SQLite 数据库位于 `data/resumes.sqlite3`。
- 上传原件、照片和导出 PDF 也保存在 `data/` 下。
- `data/` 已被 `.gitignore` 排除，不会被提交到 GitHub。

## 版本管理

- 编辑内容会自动保存。
- “复制岗位版”会先保存当前内容，再建立一份独立快照。
- 原版和复制版后续互不影响。
- 复制时建议用“公司 - 岗位 - 日期”命名，首页可继续重命名或删除版本。
- 版本删除只移除版本库记录，不会改动其他简历版本。
