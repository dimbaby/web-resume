#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(scriptDir);
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const prodUrl = "http://127.0.0.1:8000";
const devUrl = "http://127.0.0.1:5173";
const healthUrl = "http://127.0.0.1:8000/api/health";
const dataDir = process.env.RESUME_DATA_DIR || join(projectDir, "data");
const pidPath = join(dataDir, "webresume.pid");
const scriptPath = fileURLToPath(import.meta.url);

function usage() {
  console.log(`webresume - 本地简历管理器命令

用法：
  webresume --start      生产模式：构建、启动服务，并自动打开网页
  webresume --dev        开发模式：启动前后端热更新服务，并自动打开网页
  webresume --serve      仅启动生产服务，不重新构建
  webresume --update     更新代码和依赖，不覆盖本地修改
  webresume --backup [路径]  创建包含简历、照片和原件的完整备份
  webresume --restore 路径  从指定备份恢复数据
  webresume --test       运行后端和前端测试
  webresume --status     查看当前服务状态
  webresume --stop       停止当前本地服务
  webresume --help       查看帮助

常用：
  webresume --start

服务运行期间请保持终端窗口打开；按 Control+C 停止服务。`);
}

function venvPythonPath() {
  return isWindows
    ? join(projectDir, ".venv", "Scripts", "python.exe")
    : join(projectDir, ".venv", "bin", "python");
}

function ensureProject() {
  if (!existsSync(projectDir)) {
    throw new Error(`项目目录不存在：${projectDir}`);
  }
  if (!existsSync(venvPythonPath())) {
    throw new Error(
      [
        "缺少后端虚拟环境，请先执行首次安装命令。",
        isWindows
          ? "Windows: py -3 -m venv .venv && .\\.venv\\Scripts\\python -m pip install -r backend\\requirements.txt"
          : "macOS/Linux: python3 -m venv .venv && ./.venv/bin/pip install -r backend/requirements.txt",
      ].join("\\n"),
    );
  }
  if (
    !existsSync(join(projectDir, "node_modules")) ||
    !existsSync(join(projectDir, "frontend", "node_modules"))
  ) {
    throw new Error("缺少前端依赖，请先执行 npm install 和 npm --prefix frontend install。");
  }
}

async function ensureVenv() {
  if (existsSync(venvPythonPath())) return;
  console.log("未检测到 Python 虚拟环境，正在创建 .venv...");
  if (isWindows) await run("py", ["-3", "-m", "venv", ".venv"]);
  else await run("python3", ["-m", "venv", ".venv"]);
}

function spawnInherit(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectDir,
    env: process.env,
    stdio: "inherit",
    windowsHide: false,
    ...options,
  });
  return child;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnInherit(command, args, options);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} 退出失败：${signal ?? code}`));
    });
  });
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runningState() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json();
    if (body?.app === "web-resume") return "current";
    if (body?.status !== "ok") return null;
    const schemaResponse = await fetch(`${prodUrl}/openapi.json`, {
      signal: controller.signal,
    });
    if (!schemaResponse.ok) return null;
    const schema = await schemaResponse.json();
    return schema?.info?.title === "Web Resume API" ? "legacy" : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function isRunning() {
  return (await runningState()) !== null;
}

function writePid(pid) {
  mkdirSync(dirname(pidPath), { recursive: true });
  writeFileSync(pidPath, String(pid), "utf8");
}

function clearPid(pid) {
  if (!existsSync(pidPath)) return;
  try {
    const current = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
    if (current === pid) unlinkSync(pidPath);
  } catch {
    // PID 文件只用于辅助识别；损坏时退回健康接口和端口检查。
  }
}

function managedPid() {
  if (!existsSync(pidPath)) return null;
  try {
    const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
    return Number.isSafeInteger(pid) && pid > 0 ? String(pid) : null;
  } catch {
    return null;
  }
}

function openUrl(url) {
  if (isWindows) {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [url], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {
    console.log(`请在浏览器中打开：${url}`);
  });
  child.unref();
}

async function openWhenReady(url, probeUrl = healthUrl) {
  for (let index = 0; index < 80; index += 1) {
    if (await probe(probeUrl)) {
      openUrl(url);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.error(`服务启动超时，请手动打开：${url}`);
}

function serverArgs({ reload = false } = {}) {
  const args = [
    "-m",
    "uvicorn",
    "backend.app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ];
  if (reload) args.push("--reload", "--reload-dir", "backend");
  return args;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") resolve();
      else reject(new Error(`服务退出失败：${signal ?? code}`));
    });
  });
}

async function startProduction({ build = true, open = true } = {}) {
  ensureProject();
  const running = await runningState();
  if (running === "legacy") {
    console.log("检测到旧版 Web Resume 服务，正在停止后启动新版...");
    await stopServer();
  } else if (running === "current") {
    console.log(`Web Resume 已在运行：${prodUrl}`);
    if (open) openUrl(prodUrl);
    return;
  }
  if (build) {
    console.log("正在构建生产版本...");
    await run(npmCommand, ["run", "build"]);
  }
  console.log(`正在启动 Web Resume：${prodUrl}`);
  if (open) void openWhenReady(prodUrl, healthUrl);
  const child = spawnInherit(venvPythonPath(), serverArgs(), {
    env: { ...process.env, APP_ORIGIN: prodUrl },
  });
  if (child.pid) writePid(child.pid);
  try {
    await waitForExit(child);
  } finally {
    if (child.pid) clearPid(child.pid);
  }
}

async function startDev({ open = true } = {}) {
  ensureProject();
  const children = [];
  const stopChildren = () => {
    for (const child of children) {
      if (!child.killed) child.kill();
    }
  };
  process.once("SIGINT", () => {
    stopChildren();
  });
  process.once("SIGTERM", () => {
    stopChildren();
  });

  const backend = spawnInherit(venvPythonPath(), serverArgs({ reload: true }), {
    env: { ...process.env, APP_ORIGIN: devUrl },
  });
  const frontend = spawnInherit(npmCommand, ["--prefix", "frontend", "run", "dev"]);
  children.push(backend, frontend);

  if (open) void openWhenReady(devUrl, devUrl);

  await Promise.race(children.map(waitForExit));
  stopChildren();
}

function commandOutput(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve(""));
    child.on("exit", () => resolve(output));
  });
}

async function listenerPids() {
  if (isWindows) {
    const output = await commandOutput("netstat", ["-ano", "-p", "tcp"]);
    return [
      ...new Set(
        output
          .split(/\r?\n/)
          .filter((line) => line.includes(":8000") && /LISTENING/i.test(line))
          .map((line) => line.trim().split(/\s+/).at(-1))
          .filter(Boolean),
      ),
    ];
  }
  const output = await commandOutput("lsof", ["-tiTCP:8000", "-sTCP:LISTEN"]);
  return output
    .split(/\s+/)
    .map((pid) => pid.trim())
    .filter(Boolean);
}

async function stopServer() {
  if (!(await isRunning())) {
    console.log("当前没有检测到 Web Resume 服务。");
    return;
  }
  const listenerIds = await listenerPids();
  const recordedPid = managedPid();
  const pids = recordedPid && listenerIds.includes(recordedPid) ? [recordedPid] : listenerIds;
  if (pids.length === 0) {
    console.log("检测到健康接口，但没有找到 8000 端口监听进程。");
    return;
  }
  if (isWindows) {
    for (const pid of pids) await run("taskkill", ["/PID", pid, "/F"]);
  } else {
    for (const pid of pids) process.kill(Number(pid));
  }
  for (let index = 0; index < 30 && (await isRunning()); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log("已停止 Web Resume 服务。");
}

async function status() {
  if (await isRunning()) console.log(`运行中：${prodUrl}`);
  else console.log("未运行。");
}

async function runTests() {
  ensureProject();
  await run(venvPythonPath(), ["-m", "pytest", "backend/tests", "-q"]);
  await run(npmCommand, ["--prefix", "frontend", "run", "test"]);
}

async function updateApp() {
  if (!existsSync(projectDir)) throw new Error(`项目目录不存在：${projectDir}`);
  const wasRunning = await isRunning();
  if (wasRunning) {
    console.log("检测到 Web Resume 正在运行，正在安全停止旧服务...");
    await stopServer();
  }
  await ensureVenv();
  console.log("正在备份本地简历数据...");
  await run(venvPythonPath(), ["-m", "backend.app.maintenance", "backup"]);
  console.log("正在拉取最新代码...");
  await run("git", ["pull", "--ff-only"]);
  console.log("正在加载新版更新程序...");
  await run(process.execPath, [scriptPath, "--finish-update"]);
  if (wasRunning) {
    console.log("旧服务已停止。请运行 webresume --start 启动更新后的版本。");
  }
}

async function finishUpdate() {
  await ensureVenv();
  console.log("正在更新后端依赖...");
  await run(venvPythonPath(), ["-m", "pip", "install", "-r", "backend/requirements.txt"]);
  console.log("正在更新前端依赖...");
  await run(npmCommand, ["install"]);
  await run(npmCommand, ["--prefix", "frontend", "install"]);
  console.log("正在构建生产版本...");
  await run(npmCommand, ["run", "build"]);
  console.log("更新完成。运行 webresume --start 或 npm run prod:open 即可启动。");
}

async function backupData(destination) {
  await ensureVenv();
  const args = ["-m", "backend.app.maintenance", "backup"];
  if (destination) args.push(resolve(process.cwd(), destination));
  await run(venvPythonPath(), args);
}

async function restoreData(source) {
  if (!source) throw new Error("请提供备份文件路径：webresume --restore /path/to/backup.sqlite3");
  if (await isRunning()) {
    throw new Error("恢复数据前请先运行 webresume --stop。");
  }
  await ensureVenv();
  await run(venvPythonPath(), [
    "-m",
    "backend.app.maintenance",
    "restore",
    resolve(process.cwd(), source),
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "--help";
  const noOpen = args.includes("--no-open");
  const shouldOpen = args.includes("--open");

  switch (command) {
    case "--start":
    case "start":
      await startProduction({ build: true, open: true });
      break;
    case "--serve":
    case "serve":
      await startProduction({ build: false, open: shouldOpen });
      break;
    case "--dev":
    case "dev":
      await startDev({ open: !noOpen });
      break;
    case "--status":
    case "status":
      await status();
      break;
    case "--test":
    case "test":
      await runTests();
      break;
    case "--update":
    case "update":
      await updateApp();
      break;
    case "--finish-update":
      await finishUpdate();
      break;
    case "--backup":
    case "backup":
      await backupData(args[1]);
      break;
    case "--restore":
    case "restore":
      await restoreData(args[1]);
      break;
    case "--stop":
    case "stop":
      await stopServer();
      break;
    case "--help":
    case "-h":
    case "help":
      usage();
      break;
    default:
      console.error(`未知参数：${command}`);
      usage();
      process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
