# Web Resume

本地单用户简历管理器：导入 Markdown 或 DOCX，在网页中调整内容和顺序，并按参考版式导出 A4 PDF。

## 首次安装

```bash
cd /Users/dimbaby/Desktop/新简历/web-resume
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

## 放到 GitHub 前的注意事项

这个仓库适合上传代码，但不要上传本地简历数据。`.gitignore` 已默认排除：

- `.venv/`、`node_modules/` 等本地依赖目录；
- `frontend/dist/` 等构建产物；
- `data/` 下的 SQLite 数据库、上传原件、照片、导出 PDF 和运行日志；
- `.env`、`.DS_Store`、缓存目录和日志文件。

如果你已经在 GitHub 新建空仓库，可以在本目录执行：

```bash
git init
git add .
git commit -m "Initial resume manager app"
git branch -M main
git remote add origin git@github.com:你的用户名/你的仓库名.git
git push -u origin main
```

如果用 HTTPS 远程地址，把最后两行里的地址换成 GitHub 页面给出的 HTTPS 地址即可。
