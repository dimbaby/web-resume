# Web Resume

本地单用户简历管理器：导入 Markdown 或 DOCX，在网页中调整内容和顺序，并按参考版式导出 A4 PDF。

## 功能

- 导入 Markdown / DOCX 简历并解析为结构化模块。
- 导入后先核对基本信息、解析警告和待确认内容。
- 在网页中编辑基本信息、教育经历、项目经历、技能、奖项等内容。
- 支持模块、条目和要点拖拽排序。
- 支持多套模板样式、要点符号样式和无符号要点。
- 支持主标题 / 副标题加粗、斜体控制。
- 支持复制岗位版本、重命名和删除版本。
- 支持 revision 冲突保护、回收站、完整备份和恢复。
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
webresume --update
webresume --backup
webresume --restore /path/to/backup.zip
```

Windows 用户通常直接在项目目录使用 `npm run prod:open` 或 `.\bin\webresume.cmd --start` 即可。

## 更新

已安装过的项目不需要重新安装。进入项目目录后执行：

```bash
npm run update
```

如果已经配置了全局 `webresume` 命令，也可以在任意目录执行：

```bash
webresume --update
```

Windows PowerShell 也可以直接在项目目录执行：

```powershell
npm run update
```

更新命令会先停止正在运行的旧服务并创建完整备份，然后拉取最新代码、重新加载新版更新程序、刷新依赖并构建生产版本。更新完成后重新执行 `webresume --start` 或 `npm run prod:open`。

如果项目源码有本地修改，更新可能会停止并提示先处理本地修改；这是为了避免覆盖用户自己的改动。

如果旧版全局命令提示 `未知参数：--update`，说明当前终端执行到的是旧脚本。先进入项目目录执行：

```bash
webresume --stop
git pull --ff-only
npm run update
```

更新完成后，如果 `webresume --help` 仍然看不到 `--update`，需要重新确认全局命令指向当前项目的 `bin/webresume`。

## 备份与恢复

首页提供“备份”和“恢复”入口。完整备份是 ZIP 文件，包含：

- SQLite 简历版本库。
- 已上传的照片。
- Markdown / DOCX 原件。

导出的 PDF 不包含在备份中，可以从简历版本重新生成。

命令行创建备份：

```bash
webresume --backup
```

未配置全局命令时，在项目目录执行：

```bash
npm run backup
```

指定备份保存位置：

```bash
webresume --backup /path/to/web-resume-backup.zip
```

项目目录内也可以执行：

```bash
npm run backup -- /path/to/web-resume-backup.zip
```

恢复备份前先停止服务：

```bash
webresume --stop
webresume --restore /path/to/web-resume-backup.zip
webresume --start
```

未配置全局命令时使用：

```bash
npm run restore -- /path/to/web-resume-backup.zip
npm run prod:open
```

恢复前会自动创建当前数据的完整安全备份。备份归档会校验格式、路径、文件大小、SHA-256 和简历数据结构，拒绝不完整或包含不安全路径的 ZIP。备份快照中不存在的现有照片或原件不会直接删除，而会移入 `data/backups/restore-quarantine-*` 隔离目录。

## 测试

```bash
npm test
```

GitHub Actions 会在 Ubuntu、macOS 和 Windows 的干净环境中运行后端测试、前端测试和生产构建。测试资料均为仓库内的虚构数据，不依赖用户本地简历文件。

## 数据保存

- 运行数据保存在 `data/`。
- SQLite 数据库位于 `data/resumes.sqlite3`。
- 上传原件、照片和导出 PDF 也保存在 `data/` 下。
- 自动备份保存在 `data/backups/`。
- `data/` 已被 `.gitignore` 排除，不会被提交到 GitHub。

## 版本管理

- 编辑内容会自动保存。
- “复制岗位版”会先保存当前内容，再建立一份独立快照。
- 原版和复制版后续互不影响。
- 复制时建议用“公司 - 岗位 - 日期”命名，首页可继续重命名或删除版本。
- 版本删除会先移入回收站，可以恢复；永久删除需要再次确认。

## 许可证

本项目采用 MIT License，详见 `LICENSE`。
