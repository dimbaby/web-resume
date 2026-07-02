# Web Resume

本地单用户简历管理器：导入 Markdown 或 DOCX，在网页中调整内容和顺序，并按参考版式导出 A4 PDF。

## 给别人安装

把 GitHub 仓库链接发给对方即可：

<https://github.com/dimbaby/web-resume>

对方可以在终端执行：

```bash
git clone https://github.com/dimbaby/web-resume.git
cd web-resume
python3 -m venv .venv
./.venv/bin/pip install -r backend/requirements.txt
npm install
npm --prefix frontend install
npm run prod:open
```

然后浏览器会打开 <http://127.0.0.1:8000>。

当前项目主要按 macOS 本地使用设计；PDF 导出默认使用 macOS 的 Google Chrome 路径。如果对方的 Chrome 不在默认位置，可以通过 `CHROME_PATH` 指定 Chrome 可执行文件路径。

## 首次安装

```bash
python3 -m venv .venv
./.venv/bin/pip install -r backend/requirements.txt
npm install
npm --prefix frontend install
```

本机需要 Google Chrome；PDF 导出会自动使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。

## 命令行运行

如果已经安装了全局命令，可以在任意目录执行：

```bash
webresume --start
```

它会以生产模式构建、启动服务，并自动打开 <http://127.0.0.1:8000>。

其他命令：

```bash
webresume --dev      # 开发模式，自动打开 http://127.0.0.1:5173
webresume --status   # 查看服务状态
webresume --stop     # 停止服务
```

如果还没有安装全局命令，也可以在项目目录中运行下面的 npm 命令。

也可以直接在项目目录使用内置命令：

```bash
./bin/webresume --start
```

如果想把它安装成全局命令，可以在项目目录执行：

```bash
mkdir -p "$HOME/.local/bin"
ln -sfn "$PWD/bin/webresume" "$HOME/.local/bin/webresume"
```

如果随后提示 `webresume: command not found`，需要把 `~/.local/bin` 加入 shell 的 `PATH`。

开发模式：

```bash
npm run dev
```

打开 <http://127.0.0.1:5173>。后端接口位于 <http://127.0.0.1:8000/api/health>。

如果想一行命令启动并自动打开浏览器：

```bash
npm run dev:open
```

生产模式：

```bash
npm run build
npm run start
```

打开 <http://127.0.0.1:8000>。

如果想一行命令构建、启动并自动打开浏览器：

```bash
npm run prod:open
```

服务运行期间终端窗口需要保持打开；按 `Control + C` 可以停止服务。

## 测试

```bash
npm test
```

运行数据保存在 `data/`，不会上传到外部服务。

## 版本与保存说明

- 编辑内容会自动保存到本地 SQLite 数据库 `data/resumes.sqlite3`。
- “复制岗位版”会先保存当前内容，再建立一份独立快照；原版会继续保留，两个版本后续互不影响。
- 复制时建议用“公司 - 岗位 - 日期”命名，首页可继续重命名或删除版本。
- 版本删除只移除版本库记录，不会改动或删除原始 Markdown、DOCX 和其他简历版本。
