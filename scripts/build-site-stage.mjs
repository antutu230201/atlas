#!/usr/bin/env node
/**
 * 组装 ZCode Sites 部署包（.zcode-site/stage）——Atlas 的单容器部署形态。
 *
 * 产物结构（stage 根 = 云端 /app）：
 *   start.sh   由本脚本生成（LF 行尾）：前台 Next(0.0.0.0:3000)，后台 API(3001)+内嵌 PG
 *   web/       Next.js standalone（server.js + 裁剪后的 node_modules + 静态资源）
 *   api/       NestJS dist + 内核迁移 + linux-x64 生产依赖 + @atlas/* 工作区包（真实文件）
 *
 * 用法：
 *   node scripts/build-site-stage.mjs                      # 常规（API 反代目标 127.0.0.1:3001）
 *   node scripts/build-site-stage.mjs --api-origin <url>   # 本机验证用：改写 /v1 反代目标
 *
 * 并发安全：同一工作树可能有其他会话在跑构建（nest build 的 deleteOutDir 会先清空 dist），
 * 因此每步构建完成后立即快照到 .zcode-site/snapshot/（带标志文件校验与重试），
 * 之后所有组装只读快照，不读工作树的构建产物。
 *
 * 平台限制与部署步骤见 docs/deploy/zcode-site.md。
 * 前置：已 pnpm install；本机 npm ≥ 10（交叉安装 linux-x64 依赖）。
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const stageDir = path.join(root, '.zcode-site', 'stage');
const snapshotDir = path.join(root, '.zcode-site', 'snapshot');
const webAppDir = path.join(root, 'apps', 'web');
const apiAppDir = path.join(root, 'apps', 'api');

/** API 服务端运行时需要的外部包（不含 @atlas/* 工作区包——它们不在 npm 上，以真实文件拷入）。
 *  lunar-typescript 是 dashboard 模块服务端 dist 的依赖（农历计算），apps/api 未直接声明。 */
const RUNTIME_PACKAGES = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  'dotenv',
  'drizzle-orm',
  'embedded-postgres',
  'lunar-typescript',
  'pg',
  'reflect-metadata',
  'rxjs',
  'zod',
];

/** 以真实文件落进 stage/api/node_modules 的工作区包（模块注册表按 package.json 依赖名扫描） */
const WORKSPACE_PACKAGES = [
  '@atlas/core',
  '@atlas/sdk',
  '@atlas/module-dashboard',
  '@atlas/module-goals',
  '@atlas/module-habits',
  '@atlas/module-sample-note',
  '@atlas/module-todo-notes',
];

/** 体积红线（ZCode Sites 包契约）：解压 ≤ 400MB、文件数 ≤ 20000 */
const SIZE_LIMIT_MB = 400;
const FILE_COUNT_LIMIT = 20_000;

const args = process.argv.slice(2);
const apiOriginIndex = args.indexOf('--api-origin');
const apiOrigin = apiOriginIndex !== -1 ? args[apiOriginIndex + 1] : 'http://127.0.0.1:3001';

// monorepo 布局：standalone 的 server.js 在 apps/web/ 下；单项目布局在根。
const standaloneDir = path.join(webAppDir, '.next', 'standalone');
const webEntry = (
  existsSync(path.join(standaloneDir, 'apps', 'web', 'server.js'))
    ? path.join('apps', 'web', 'server.js')
    : 'server.js'
)
  .split(path.sep)
  .join('/');

const START_SH = `#!/usr/bin/env bash
# Atlas on ZCode Sites：单容器多进程拓扑（由 scripts/build-site-stage.mjs 生成，勿手改）
#   内嵌 PostgreSQL（数据在 $DATA_DIR，实例回收即失）
#   + Atlas API（NestJS，127.0.0.1:${apiOrigin.replace(/^https?:\/\/[^:]+:/, '') || '3001'}，崩溃自动重启）
#   + Web（Next.js standalone，0.0.0.0:3000，前台进程，承接 / 与 /v1 反代）
set -euo pipefail
cd "$(dirname "$BASH_SOURCE")"

export NODE_ENV=production
export DATA_DIR="\${DATA_DIR:-$PWD/data}"
mkdir -p "$DATA_DIR/pgdata" "$DATA_DIR/storage"

# 网易云凭据加密密钥：平台不注入密钥，实例内随机生成（与数据同生命周期，重启后失效）
if [ -z "\${ATLAS_NETEASE_SECRET:-}" ]; then
  ATLAS_NETEASE_SECRET="atlas-site-$(head -c 24 /dev/urandom | base64 | tr -d '+/=')"
  export ATLAS_NETEASE_SECRET
fi

# ---- API：内嵌 PostgreSQL + NestJS，后台运行（linux 二进制；本机 check 时跳过） ----
if [ "$(uname -s)" = "Linux" ]; then
  (
    cd api
    export PORT=${apiOrigin.replace(/^https?:\/\/[^:]+:(\d+).*$/, '$1') || '3001'}
    export EMBEDDED_PG=true
    export PG_DATA_DIR="$DATA_DIR/pgdata"
    export STORAGE_DIR="$DATA_DIR/storage"
    export NODE_OPTIONS="--max-old-space-size=384"
    while true; do
      node dist/main.js || echo "[start] API 进程退出，2 秒后重启" >&2
      sleep 2
    done
  ) &
else
  echo "[start] 非 Linux 环境：跳过 API（其依赖按 linux-x64 交叉安装，仅在云端运行）" >&2
fi

# ---- Web：Next.js standalone，前台服务 0.0.0.0:3000 ----
cd web
export PORT=3000
export HOSTNAME=0.0.0.0
# /status 页服务端探测走内部绝对地址（Node fetch 不支持相对 URL）
export ATLAS_INTERNAL_API_URL="${apiOrigin}"
export NODE_OPTIONS="--max-old-space-size=384"
exec node ${webEntry}
`;

function step(name) {
  console.log(`\n== ${name} ==`);
}

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`命令失败（exit ${result.status}）：${cmd} ${cmdArgs.join(' ')}`);
  }
}

function output(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`命令失败（exit ${result.status}）：${cmd} ${cmdArgs.join(' ')}`);
  }
  return result.stdout;
}

function sleepSync(ms) {
  spawnSync(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`], { shell: false });
}

/**
 * 把工作树的构建产物快照到隔离目录：源缺失/不完整时等待重试（并行会话的
 * nest build/tsc 会先清空输出目录再写回，窗口通常只有几秒）。
 * @param markers 相对 src 的标志文件，拷贝前后都必须存在才算快照成功
 */
function snapshotTree(src, dest, markers, attempts = 6) {
  for (let attempt = 1; ; attempt++) {
    const ready = markers.every((marker) => existsSync(path.join(src, marker)));
    if (ready) {
      try {
        rmSync(dest, { recursive: true, force: true });
        cpSync(src, dest, { recursive: true });
        if (markers.every((marker) => existsSync(path.join(dest, marker)))) return;
      } catch {
        // 拷贝中途源被清空：落入重试
      }
    }
    if (attempt >= attempts) {
      throw new Error(
        `快照失败：${src}（标志文件 ${markers.join(', ')} 不齐，已重试 ${attempts} 次）`,
      );
    }
    console.log(`   ${path.relative(root, src)} 暂不完整（第 ${attempt} 次），3 秒后重试…`);
    sleepSync(3000);
  }
}

/** 递归统计体积（MB）与文件数 */
function measure(dir) {
  let bytes = 0;
  let files = 0;
  const walk = (entry) => {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      for (const name of readdirSync(entry)) walk(path.join(entry, name));
    } else {
      bytes += stat.size;
      files += 1;
    }
  };
  walk(dir);
  return { mb: bytes / 1024 / 1024, files };
}

/** 从 pnpm list 的解析结果提取精确版本 */
function resolveVersions() {
  const json = output(
    'pnpm',
    ['--filter', '@atlas/api...', 'list', '--prod', '--depth', '0', '--json'],
    { cwd: root },
  );
  const projects = JSON.parse(json);
  const versions = new Map();
  for (const project of projects) {
    for (const [name, info] of Object.entries(project.dependencies ?? {})) {
      if (!versions.has(name) && typeof info.version === 'string') {
        versions.set(name, info.version);
      }
    }
  }
  const missing = RUNTIME_PACKAGES.filter((name) => !versions.has(name));
  if (missing.length > 0) {
    throw new Error(`pnpm 依赖清单里找不到：${missing.join(', ')}（请检查 RUNTIME_PACKAGES）`);
  }
  return versions;
}

/** 包名 → 仓库目录：@atlas/core|sdk → packages/，@atlas/module-x → modules/x（目录名无前缀） */
function workspaceSourceDir(pkgName) {
  if (pkgName === '@atlas/core' || pkgName === '@atlas/sdk') {
    return path.join(root, 'packages', pkgName.replace('@atlas/', ''));
  }
  return path.join(root, 'modules', pkgName.replace('@atlas/module-', ''));
}

// ---------------------------------------------------------------------------
step('清理并重建 stage / snapshot 目录');
rmSync(stageDir, { recursive: true, force: true });
rmSync(snapshotDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
mkdirSync(snapshotDir, { recursive: true });

// ---------------------------------------------------------------------------
step('构建 API 及其工作区依赖（turbo），随后立即快照');
run('pnpm', ['--filter', '@atlas/api...', 'build'], { cwd: root });
snapshotTree(path.join(apiAppDir, 'dist'), path.join(snapshotDir, 'api', 'dist'), [
  'main.js',
  'app.module.js',
]);
snapshotTree(path.join(apiAppDir, 'drizzle'), path.join(snapshotDir, 'api', 'drizzle'), ['meta']);
for (const pkgName of WORKSPACE_PACKAGES) {
  const sourceDir = workspaceSourceDir(pkgName);
  const target = path.join(snapshotDir, 'atlas', pkgName.replace('@atlas/', ''));
  snapshotTree(path.join(sourceDir, 'dist'), path.join(target, 'dist'), ['index.js']);
  cpSync(path.join(sourceDir, 'package.json'), path.join(target, 'package.json'));
  const migrationsDir = path.join(sourceDir, 'migrations');
  if (existsSync(migrationsDir)) {
    cpSync(migrationsDir, path.join(target, 'migrations'), { recursive: true });
  }
}

// ---------------------------------------------------------------------------
step('以部署形态构建 Web（standalone + /v1 反代 + 同源相对 API 地址），随后立即快照');
run('pnpm', ['--filter', '@atlas/web...', 'build'], {
  cwd: root,
  env: {
    ...process.env,
    ATLAS_SITE_DEPLOY: '1',
    ATLAS_SITE_API_ORIGIN: apiOrigin,
    NEXT_PUBLIC_API_URL: '',
  },
});
if (!existsSync(path.join(standaloneDir, webEntry))) {
  throw new Error('未找到 standalone server.js——standalone 构建未生效，检查 next.config.ts');
}
snapshotTree(standaloneDir, path.join(snapshotDir, 'web'), [webEntry]);
snapshotTree(
  path.join(webAppDir, '.next', 'static'),
  path.join(snapshotDir, 'web', path.dirname(webEntry), '.next', 'static'),
  [],
);
cpSync(
  path.join(webAppDir, 'public'),
  path.join(snapshotDir, 'web', path.dirname(webEntry), 'public'),
  {
    recursive: true,
  },
);

// ---------------------------------------------------------------------------
step('组装 stage/web（自快照）');
cpSync(path.join(snapshotDir, 'web'), path.join(stageDir, 'web'), { recursive: true });

// ---------------------------------------------------------------------------
step('组装 stage/api：dist + 内核迁移 + linux-x64 生产依赖');
const apiStageDir = path.join(stageDir, 'api');
mkdirSync(apiStageDir, { recursive: true });
cpSync(path.join(snapshotDir, 'api', 'dist'), path.join(apiStageDir, 'dist'), { recursive: true });
cpSync(path.join(snapshotDir, 'api', 'drizzle'), path.join(apiStageDir, 'drizzle'), {
  recursive: true,
});

const versions = resolveVersions();
const publicDeps = Object.fromEntries(RUNTIME_PACKAGES.map((name) => [name, versions.get(name)]));
// 第一阶段 package.json 只含 npm 可装的公开依赖；@atlas/* 装完后以真实文件补入并登记
writeFileSync(
  path.join(apiStageDir, 'package.json'),
  `${JSON.stringify(
    { name: '@atlas/api', version: '0.1.0', private: true, dependencies: publicDeps },
    null,
    2,
  )}\n`,
);

run(
  'npm',
  ['install', '--omit=dev', '--no-audit', '--no-fund', '--os=linux', '--cpu=x64', '--libc=glibc'],
  { cwd: apiStageDir },
);

// embedded-postgres 的 linux 二进制是运行时核心，交叉安装后必须存在
const linuxPgDir = path.join(apiStageDir, 'node_modules', '@embedded-postgres', 'linux-x64');
if (!existsSync(linuxPgDir)) {
  throw new Error('交叉安装后缺少 @embedded-postgres/linux-x64——云端将无法启动内嵌 PG');
}
// 其 postinstall（hydrate-symlinks）在 Windows 上建不了符号链接：postgres 运行依赖
// 这些无版本号库链接（如 libicui18n.so.60），按 pg-symlinks.json 补齐；建链失败则复制文件
const symlinkMapPath = path.join(linuxPgDir, 'native', 'pg-symlinks.json');
if (existsSync(symlinkMapPath)) {
  let hydrated = 0;
  for (const { source, target } of JSON.parse(readFileSync(symlinkMapPath, 'utf8'))) {
    const targetAbs = path.join(linuxPgDir, target);
    if (existsSync(targetAbs)) continue;
    const sourceAbs = path.join(linuxPgDir, source);
    try {
      symlinkSync(path.relative(path.dirname(targetAbs), sourceAbs), targetAbs);
    } catch {
      cpSync(sourceAbs, targetAbs);
    }
    hydrated += 1;
  }
  console.log(`   embedded-postgres linux-x64 库链接已补齐（${hydrated} 个）`);
}

// ---------------------------------------------------------------------------
step('拷入 @atlas 工作区包（自快照，真实文件）');
for (const pkgName of WORKSPACE_PACKAGES) {
  // node_modules 内目录名 = 包名去 scope（与包名一致，与仓库目录名无关）
  const targetDir = path.join(
    apiStageDir,
    'node_modules',
    '@atlas',
    pkgName.replace('@atlas/', ''),
  );
  mkdirSync(targetDir, { recursive: true });
  cpSync(path.join(snapshotDir, 'atlas', pkgName.replace('@atlas/', '')), targetDir, {
    recursive: true,
  });
}

// 第二阶段：登记 @atlas/* 依赖（模块注册表按依赖名扫描 apps 侧 package.json）
const manifest = JSON.parse(readFileSync(path.join(apiStageDir, 'package.json'), 'utf8'));
for (const pkgName of WORKSPACE_PACKAGES) {
  manifest.dependencies[pkgName] = JSON.parse(
    readFileSync(
      path.join(snapshotDir, 'atlas', pkgName.replace('@atlas/', ''), 'package.json'),
      'utf8',
    ),
  ).version;
}
writeFileSync(path.join(apiStageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// ---------------------------------------------------------------------------
step('写入 start.sh（LF 行尾）');
writeFileSync(path.join(stageDir, 'start.sh'), START_SH, 'utf8');

// ---------------------------------------------------------------------------
step('体积与文件数核对');
const webSize = measure(path.join(stageDir, 'web'));
const apiSize = measure(path.join(stageDir, 'api'));
const total = { mb: webSize.mb + apiSize.mb, files: webSize.files + apiSize.files };
console.log(
  `   web: ${webSize.mb.toFixed(1)} MB / ${webSize.files} 文件；` +
    `api: ${apiSize.mb.toFixed(1)} MB / ${apiSize.files} 文件`,
);
console.log(
  `   合计: ${total.mb.toFixed(1)} MB / ${total.files} 文件（红线 ${SIZE_LIMIT_MB} MB / ${FILE_COUNT_LIMIT}）`,
);
if (total.mb > SIZE_LIMIT_MB || total.files > FILE_COUNT_LIMIT) {
  throw new Error('超出 ZCode Sites 包契约体积红线，需精简后再部署');
}

console.log('\nstage 组装完成：.zcode-site/stage');
console.log('后续：zcode-site check .zcode-site/stage → 部署命令见 docs/deploy/zcode-site.md');
