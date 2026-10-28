# Neflix Desktop

面向 **Windows / macOS** 的在线视频桌面播放器 MVP。片源以 HLS / DASH 多码率流的形式放在对象存储中，通过 CDN 分发；App 只做在线流式播放，不做本地转码、下载或离线缓存。

当前仓库可直接运行：未配置云端接口时会启用内置演示片源，仍会按分页方式读取视频清单。

> 本项目是技术演示，与 Netflix 无关。

---

## 1. 技术选型

| 层 | 选择 | 原因 |
| --- | --- | --- |
| 桌面壳 | Electron 45 | 同一套 Windows/macOS 窗口、菜单、全屏、安装包能力，Chromium 内置 Media Source Extensions，HLS/DASH 行为一致 |
| UI | React 19 + TypeScript + Vite | 组件化 UI、类型约束强，开发热更新快；渲染层与主进程可分别构建 |
| 播放器 | Shaka Player 5 | 同时支持 HLS / DASH、ABR 自动码率、手动清晰度、网络重试和清晰的错误分类，避免自行维护两套播放内核 |
| 构建 | electron-vite + electron-builder | 主进程 / preload / renderer 三端构建；生成 NSIS、DMG/ZIP 安装包 |
| 测试 | Vitest | 直接测试纯数据层与播放状态机，不需要启动 Electron |

没有使用原生播放器分开适配 Windows/macOS，因为两个平台对 HLS/DASH 的支持差异较大；Shaka Player + MSE 能让两端复用同一套播放逻辑。

---

## 2. 功能范围

- 分页片库：标题、封面、时长、清晰度、HLS/DASH 标识；滚动到底部附近或点击按钮加载下一页。
- 在线播放：播放/暂停、进度拖动、全屏、倍速、音量、状态提示、失败重试。
- 清晰度：默认 ABR 自动切换；流里有多档清晰度时可手动锁定，使用 Shaka 的 variant track 切换。
- 续播：仅把 `videoId / position / duration / updatedAt` 保存到 `localStorage`，不保存播放地址、分片或视频文件。
- 异常提示：断网、清单加载失败、CDN 404/403、清单格式错误、浏览器不支持的格式、DRM 内容、缓冲超时、加载超时。
- 配置化：清单接口、CDN 域名、封面域名、偏好格式、分页大小、超时、OSS 接入信息全部走环境变量；示例配置不包含真实密钥。
- 缓存约束：禁用 Chromium HTTP 缓存；退出播放器时销毁 Shaka、释放 MSE 缓冲并调用 `session.clearCache()`；主进程拦截下载。

明确不做：网站/移动端、DRM、水印、防录屏、防逆向、WAF/DDoS、防盗链、杜比或音频增强、下载/离线观看、本地转码、复杂微服务。

---

## 3. 目录结构

```text
src/
  main/                  Electron 主进程：窗口、系统菜单、全屏、缓存清理、下载拦截
  preload/               contextBridge 暴露最小桌面 API
  shared/                主进程 / preload 共享类型与 IPC 通道
  renderer/
    public/covers/       演示封面
    src/
      components/        片库页、播放器页、视频卡片、图标
      data/              配置、清单解析、分页仓库、进度元数据存储
      playback/          Shaka 接入、播放状态机、错误映射、清晰度工具
      hooks/             全屏、在线状态
      utils/             时间格式化
examples/
  catalog.json                     内置演示片源
  video-api-response.example.json  清单接口响应示例
  local-acceptance-catalog.json    本地 HTTP/CDN 与异常验收清单
scripts/
  transcode-hls-dash.sh            FFmpeg HLS/DASH 转码脚本
  upload-oss.sh                    ossutil 上传脚本
  mock-cdn-server.mjs              本地分页 API + CORS/Range CDN 模拟服务
  load-test-mock.mjs               本地并发冒烟测试
  generate-icon.mjs                生成应用图标
tests/                              数据层 / 状态机 / 进度 / 错误映射测试
```

分层关系：

1. **视频数据层**：`data/repository.ts` 负责请求分页接口；`data/manifest.ts` 负责校验和归一化，相对播放地址会基于 CDN 域名补全；`data/progressStore.ts` 只管理播放位置元数据。
2. **播放控制层**：`playback/useShakaPlayback.ts` 管理 Shaka 实例、事件、ABR、重试、超时；`playback/playbackMachine.ts` 是纯 reducer，所有状态切换都能在 Node 中单测。
3. **UI 层**：`LibraryPage` 只消费分页数据；`PlayerPage` 只消费播放状态和用户操作，不直接操作 Shaka。

---

## 4. 快速开始

前置条件：

- Node.js >= 22（开发环境验证使用 Node 24）
- npm >= 10
- 播放演示片源需要能访问公网；转码脚本需要 FFmpeg（运行 App 本身不需要）

```bash
npm install
npm run dev
```

如果 `npm install` 后 Electron 可执行文件缺失（部分 npm 版本会拦截安装脚本），手动补下载：

```bash
node node_modules/electron/install.js
```

默认无需 `.env`，直接使用内置演示片源。演示片源来自公开测试流，因此需要联网。

### 常用命令

```bash
npm run dev            # 开发运行
npm start              # 预览已构建版本
npm run typecheck      # 主进程 + 渲染层类型检查
npm test               # Vitest 单元测试
npm run build          # 类型检查 + 生产构建
npm run dist:win       # Windows NSIS 安装包
npm run dist:mac       # macOS DMG + ZIP
npm run pack:win       # Windows 未打包目录，便于调试
npm run pack:mac       # macOS .app 目录
npm run icon           # 重新生成 build/icon.png 与 icon.ico
npm run mock:cdn       # 启动本地分页 API + CORS/Range CDN（端口 8899）
npm run load:mock      # 对本地 CDN 做 200 并发冒烟测试
```

构建产物：

- 渲染进程 / 主进程：`out/`
- Windows：`release/Neflix-0.1.0-x64-setup.exe`
- Windows 免安装目录：`release/win-unpacked/`
- macOS：`release/Neflix-0.1.0-<arch>.dmg` / `.zip`（需在 macOS 上执行构建）

当前 `electron-builder.yml` 中 macOS `identity: null`，用于本地无签名构建。正式分发需要配置 Apple Developer ID 签名与 notarization；Windows 安装包当前未签名（实测 `Get-AuthenticodeSignature` 为 `NotSigned`），SmartScreen 可能会提示未知发布者。桌面端主进程、preload、React 与 Shaka 都已由 Vite 打包，因此安装包通过 `files` 排除了 `node_modules`，当前 `app.asar` 约 5.1 MB、安装包约 117 MB。

签名接入时可使用 electron-builder 标准环境变量：Windows 配置 `CSC_LINK` / `CSC_KEY_PASSWORD`；macOS 配置 Developer ID 证书并接入 Apple notarization 凭据。当前环境没有证书与 Apple 账号，因此无法完成签名验证。

---

## 5. 配置

复制示例：

```bash
cp .env.example .env.local
```

### 运行时变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_DEMO_MODE` | 清单地址为空时为 `true` | `true` 使用内置演示数据；生产必须设为 `false` |
| `VITE_VIDEO_MANIFEST_URL` | 空 | 分页视频清单接口，或相对路径 |
| `VITE_MANIFEST_API_BASE_URL` | 空 | 清单接口基础地址；当清单地址为相对路径时使用 |
| `VITE_CDN_BASE_URL` | 空 | CDN 域名；清单里的相对播放地址会基于它补全 |
| `VITE_IMAGE_BASE_URL` | 回退到 CDN 域名 | 封面图域名 |
| `VITE_PREFERRED_FORMAT` | `auto` | `auto` / `hls` / `dash`；指定格式缺失时回退到列表中的第一个可用源 |
| `VITE_PAGE_SIZE` | `4` | 每页数量；生产建议 12–24 |
| `VITE_REQUEST_TIMEOUT_MS` | `12000` | 清单请求超时 |
| `VITE_LOADING_TIMEOUT_MS` | `30000` | 播放器加载清单超时 |
| `VITE_BUFFER_TIMEOUT_MS` | `20000` | 连续缓冲超时 |
| `VITE_PROGRESS_SAVE_INTERVAL_MS` | `5000` | 续播位置保存间隔 |
| `VITE_OSS_BUCKET` / `VITE_OSS_REGION` / `VITE_OSS_ENDPOINT` | 空 | 预留的 OSS 接入标识，仅用于配置展示/联调，不参与播放 |

> **安全要求**：所有 `VITE_*` 变量都会被打包进客户端。不要放 AccessKeySecret、签名密钥、私有 Token。OSS 上传凭证只放在运维环境或 ossutil 本机配置中。

生产示例：

```dotenv
VITE_DEMO_MODE=false
VITE_VIDEO_MANIFEST_URL=https://api.example.com/v1/videos
VITE_CDN_BASE_URL=https://cdn.example.com
VITE_IMAGE_BASE_URL=https://cdn.example.com
VITE_PAGE_SIZE=12
```

生产构建前设置好环境变量；Vite 会在构建时写入客户端。若需要“不重新打包就换配置”，可以在后续版本中加入主进程读取外部 `app-config.json`，当前 MVP 未实现。

### 清单接口契约

请求：

```http
GET /v1/videos?page=1&pageSize=12
Accept: application/json
```

响应：

```json
{
  "page": 1,
  "pageSize": 12,
  "total": 240,
  "items": [
    {
      "id": "tears-of-steel",
      "title": "Tears of Steel",
      "description": "可选简介",
      "cover": "images/tears-of-steel.jpg",
      "duration": 734,
      "year": 2012,
      "qualities": ["1080p", "720p", "480p"],
      "tags": ["科幻", "短片"],
      "sources": [
        { "type": "hls", "url": "videos/tears-of-steel/master.m3u8" },
        { "type": "dash", "url": "videos/tears-of-steel/manifest.mpd" }
      ]
    }
  ]
}
```

约定：

- `duration` 单位是秒。
- `sources[].type` 可为 `hls` / `dash` / `auto`；`auto` 和缺省值会根据 URL 后缀推断。
- 播放地址可以是绝对地址，也可以是相对于 `VITE_CDN_BASE_URL` 的路径。
- `cover` 可以是绝对地址、相对 `VITE_IMAGE_BASE_URL` 的路径，或应用内相对路径。
- 客户端会校验 `page / pageSize / total / items`，并要求接口只返回当前页；不会请求整个片库。
- `hasMore` 由 `page * pageSize < total` 计算，不依赖服务端额外字段。
- 建议服务端返回稳定排序，并设置 `Cache-Control: no-store` 或短缓存。
- 接口当前不带鉴权；如需要鉴权，建议通过网关/短期 Token 实现，不要写死在客户端。

完整示例见 `examples/video-api-response.example.json`。

---

## 6. 对象存储与 CDN 接入

### 6.1 推荐目录结构

```text
oss://<bucket>/videos/<video-id>/hls/master.m3u8
oss://<bucket>/videos/<video-id>/hls/0/index.m3u8
oss://<bucket>/videos/<video-id>/hls/0/segment_00001.ts
oss://<bucket>/videos/<video-id>/dash/manifest.mpd
oss://<bucket>/videos/<video-id>/dash/chunk-*.m4s
oss://<bucket>/images/<video-id>.jpg
```

CDN 回源到 OSS，App 只拼接 `VITE_CDN_BASE_URL + 清单相对地址`。

### 6.2 上传流程

1. 原始视频由运营侧上传到 OSS，不经过 App。
2. 在 ECS / 函数计算 / 离线工作站使用 FFmpeg 转码（见第 7 节）。
3. 使用 `ossutil` 上传转码目录：

   ```bash
   OSS_BUCKET=my-bucket \
     ./scripts/upload-oss.sh ./output/video-id videos/video-id
   ```

4. 刷新 CDN 文件，或使用带版本号的路径，避免旧清单缓存。
5. 在清单接口中写入 `videos/video-id/...` 相对地址。

### 6.3 CDN / CORS

Electron 渲染层开启了 `webSecurity`。HLS/DASH 主清单、子清单、音视频分片都必须允许跨域：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Origin, Accept
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges
```

`file://` 页面的 Origin 通常为 `null`，部分 CDN 需要显式允许 `*` 或 `null`。可用浏览器/DevTools 的 Network 面板排查 CORS。

### 6.4 内容类型与缓存

| 文件 | Content-Type | 建议缓存 |
| --- | --- | --- |
| `.m3u8` | `application/vnd.apple.mpegurl` | 1–5 分钟，或跟随清单版本 |
| `.mpd` | `application/dash+xml` | 1–5 分钟 |
| `.ts` | `video/mp2t` | 1 年，`immutable` |
| `.m4s` / `.mp4` 分片 | `video/iso.segment` / `video/mp4` | 1 年，`immutable` |
| 封面图片 | `image/jpeg` / `image/webp` | 1 天以上 |

对象键建议使用不可变内容寻址或带版本前缀。CDN 开启 Range 请求回源，否则拖动进度会变慢。

### 6.5 阿里云配置预留

`.env.example` 已预留 `VITE_OSS_BUCKET / VITE_OSS_REGION / VITE_OSS_ENDPOINT`。真实接入时：

- OSS Bucket、Region、Endpoint 由运维配置；
- CDN 加速域名填入 `VITE_CDN_BASE_URL`；
- OSS AccessKeyId / Secret 只用于转码/上传环境，不进入客户端；
- 如 Bucket 为私有，由清单接口生成短期签名 URL，或配置 CDN 回源鉴权；本项目不实现签名服务和防盗链。

---

## 7. HLS / DASH 视频准备

App 只消费已经切片的流，不在本地转码。准备要求：

- 视频编码建议 H.264 High/Main + AAC，保证 Windows/macOS Chromium 都能解码；
- HLS：6 秒左右分片、独立关键帧、`master.m3u8` 含多档码率；
- DASH：MPD + 自适应视频/音频 AdaptationSet，至少两档视频码率；
- 所有码率的关键帧对齐，建议 `-force_key_frames "expr:gte(t,n_forced*6)"`；
- 不要启用 DRM 或需要特殊许可证的加密流（当前明确不支持 DRM）；
- 多语言音轨/字幕不在 MVP 范围内，但不会破坏基础播放。

### 转码脚本

```bash
./scripts/transcode-hls-dash.sh ./input.mp4 ./output/video-id
```

脚本需要 FFmpeg，生成 1080p / 720p / 540p 三档 HLS 和 DASH：

```text
output/video-id/hls/master.m3u8
output/video-id/dash/manifest.mpd
```

Windows 可使用 Git Bash 或 WSL 执行；也可以把脚本放入 Linux 转码机/任务流中。脚本不会上传、不会申请云资源，也不读取任何真实密钥。

生产建议：

- 使用云端媒体处理服务（如阿里云智能媒体服务）或 FFmpeg 集群批处理；
- 转码完成后生成清单条目，再写入视频清单 API；
- 分片命名保持稳定，CDN 长缓存，清单短缓存；
- 校验 CDN 的 CORS、Range 和 MIME。

---

## 8. 播放器实现说明

- **初始化**：`new shaka.Player()` → `attach(video)` → `configure()` → `load(url, startTime, mimeType)`。重试时等待前一个 Player `destroy()` 完成后才挂载，避免争用同一个 `<video>`。
- **ABR**：Shaka 默认开启 ABR，设置 `switchInterval`、`bufferingGoal`、重试参数；网络变差时由 Shaka 主动降码率。
- **手动清晰度**：读取 `getVariantTracks()` 去重后的高度列表；选择后关闭 ABR 并 `selectVariantTrack()`。选择“自动”后重新开启 ABR。
- **状态管理**：纯 reducer 覆盖 `loading / ready / playing / paused / buffering / ended / error`，组件只负责把 Shaka 和原生媒体事件映射为 action。
- **续播**：进入播放器前从 `ProgressStore` 读取位置；播放中每 5 秒保存一次；结束或接近结尾时删除记录。
- **超时**：加载超时 30 秒、缓冲超时 20 秒（均可配置），触发后给出可重试错误。
- **失败重试**：重建 Shaka 实例，从最后播放位置继续，并保留倍速、音量、静音和手动清晰度设置。
- **缓存**：主进程启动参数 `disable-http-cache`；进入/退出播放器时清理 Chromium HTTP 缓存；Shaka 只使用内存 MSE 缓冲。主进程禁止 `will-download`。

### 快捷键

| 操作 | Windows | macOS |
| --- | --- | --- |
| 播放 / 暂停 | `Space` / `K` | `Space` / `K` |
| 快退 / 快进 10 秒 | `←` / `→`（或 `J` / `L`） | 同左 |
| 音量 | `↑` / `↓` | 同左 |
| 静音 | `M` | `M` |
| 全屏 | `F` / `F11` | `F` / `Control+Command+F` |
| 退出全屏 | `Esc` / `F` | `Esc` / `F` |
| 返回片库 | `Esc` / `Alt+←` | `Esc` / `Command+[` |

系统菜单也注册了播放、快进/快退、返回、全屏快捷键。

---

## 9. 测试与验证

### 已执行的检查

以下结果来自当前仓库实际执行：

```text
npm run typecheck   通过（主进程 + 渲染层）
npm test            通过：5 个测试文件，32 个测试
npm run build       通过
npx electron-builder --win --dir    通过
npx electron-builder --win          通过，生成 NSIS 安装包
bash -n scripts/*.sh                通过
./scripts/transcode-hls-dash.sh     通过（FFmpeg 6.1.1，生成 HLS + DASH）
npm run load:mock                   通过（200 并发清单请求 + 200 并发 Range 请求）
NSIS 静默安装 / 启动 / 卸载          通过
```

测试覆盖：

- 清单分页解析、相对 URL 补全、去重、错误分页、示例目录分页；
- 播放状态机：加载、播放、暂停、缓冲、结束、跳转、错误、重试、清晰度回退、音量；
- 进度元数据：只写入必要字段、片头/片尾不保存、上限 200 条、损坏数据容错；
- Shaka / 原生媒体错误映射；
- 播放源选择与清晰度快照。

### 本地 HTTP/CDN 与异常验收

为验证生产 HTTP 配置（而不是只验证内置 demo 数据），使用 FFmpeg 生成 18 秒测试视频并执行转码脚本，再通过 `scripts/mock-cdn-server.mjs` 提供分页 API、CORS 和 Range：

```bash
# 1. 生成测试素材（也可换成真实视频）
mkdir -p .tmp/local-cdn
ffmpeg -f lavfi -i "testsrc2=size=1280x720:rate=24" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 18 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest .tmp/local-cdn/test-source.mp4

# 2. 转码并启动本地 API/CDN
./scripts/transcode-hls-dash.sh .tmp/local-cdn/test-source.mp4 .tmp/local-cdn/test
npm run mock:cdn

# 3. 使用 HTTP 配置构建并运行
VITE_DEMO_MODE=false \
VITE_VIDEO_MANIFEST_URL=http://127.0.0.1:8899/api/videos \
VITE_CDN_BASE_URL=http://127.0.0.1:8899 \
VITE_IMAGE_BASE_URL=http://127.0.0.1:8899 \
VITE_PAGE_SIZE=2 VITE_BUFFER_TIMEOUT_MS=8000 \
npm run build && ./node_modules/.bin/electron .
```

实际验证结果：

- 转码脚本使用 FFmpeg 6.1.1 成功生成 1080p / 720p / 540p 的 HLS 与 DASH；过程中发现并修复了 480p 非严格 16:9 导致 DASH muxer 拒绝写头的问题（改为 540p 并强制 `setsar=1`）。
- 清单接口按 `pageSize=2` 返回，首屏只请求 2 条，滚动后加载全部 8 条。
- 本地 HLS、DASH 均通过 HTTP 正常播放，自动清晰度 1080p，拖动到 12 秒可继续播放。
- 静态 CDN 响应带 `Access-Control-Allow-Origin: *`；Range 请求返回 `206` 与 `Content-Range`。
- 异常场景全部触发并显示对应中文提示：

| 场景 | 实际结果 |
| --- | --- |
| CDN 404 | `HTTP` / “视频地址不可用” |
| 损坏 HLS 清单 | `MANIFEST` / Shaka 4053 |
| MP4 播放源 | `UNSUPPORTED` / 格式不支持 |
| 不可达端口 | `NETWORK` / Shaka 1002 |
| Widevine 加密流 | `DRM` / Shaka 6001 |
| 初始分片永不返回 | `LOAD_TIMEOUT` |
| 后续分片永不返回 | `BUFFER_TIMEOUT`，视频暂停 |
| 清单 API 停机 | 片库错误页；服务恢复后点击“重新加载”成功 |

200 并发本地冒烟测试（loopback，不等同真实 CDN 压测）：

| 轮次 | 并发 | 成功响应 | p95 |
| --- | --- | --- | --- |
| 分页清单 API | 200 | 200 × HTTP 200 | 36 ms |
| 65 KB Range 分片 | 200 | 200 × HTTP 206 | 54 ms |

> 该测试验证 App 侧清单协议、播放器与本地 HTTP 服务的行为，不代表阿里云 CDN 的真实并发能力。

### Windows 实机验证

在 Windows 10 x64（`10.0.19045`）上实际启动 Electron 构建产物和打包后的 `release/win-unpacked/Neflix.exe`，通过 DevTools Protocol 驱动验证：

- 片库首屏只显示 4 条，滚动/继续加载后到 6 条；
- HLS（Mux Big Buck Bunny）播放成功，自动码率显示 1080p；
- DASH（Shaka Angel One）播放成功；
- 通过 DevTools 将下行限速到约 120 KB/s 后，自动清晰度从 1080p 降到 288p/480p，播放未中断；恢复网络后继续自适应；
- 手动切换到 720p，UI 与播放器状态更新；重试后仍保持 720p 手动清晰度；
- 倍速 1.5x 实际写入 video 元素；
- 拖动进度到约 300 秒并继续播放；
- 全屏切换与退出、`F` 快捷键正常；
- 进度写入 localStorage，重新启动打包应用后从上次位置续播，续播提示会自动消失；
- 模拟离线后视频暂停并显示“网络已断开”，重试后从原位置恢复播放；
- 打包版应用无渲染异常；
- 播放后检查 `%APPDATA%/Neflix`：不存在 HTTP `Cache` 目录，也没有 `.ts/.m4s/.m3u8/.mpd/.mp4` 分片文件；只存在播放位置元数据与 Chromium 自身的代码/着色器缓存；
- NSIS 安装包以 `/S` 静默安装成功（exit 0），安装到 `%LOCALAPPDATA%\Programs\Neflix`，桌面与开始菜单快捷方式均创建；
- 启动安装后的 `Neflix.exe` 成功显示 demo 片库并播放演示视频；
- 静默卸载成功（exit 0），安装目录、桌面快捷方式、开始菜单快捷方式与卸载注册表项均被移除；
- 精简打包后 `app.asar` 约 5.1 MB，NSIS 安装包约 117 MB；`Get-AuthenticodeSignature` 显示为 `NotSigned`。

### 尚未验证

- macOS 真机运行、窗口行为、DMG/ZIP 与双架构产物（当前环境为 Windows，无法执行 macOS 构建/签名）；
- 真实阿里云 OSS / CDN 接入：Bucket 权限、CDN 回源、真实 CORS 配置、签名 URL、缓存刷新与预热（本地模拟服务已验证 App 侧协议和 Range）；
- `upload-oss.sh` 的真实上传：仅验证了 shell 语法和缺少 `OSS_BUCKET` 时的保护逻辑，未连接 OSS；
- 真实 200 人并发与公网多地域弱网；已完成本地 200 并发 loopback 冒烟和 DevTools 限速 ABR 测试，但不代表生产 CDN 压测；
- Windows 代码签名、SmartScreen 交互、macOS Developer ID 签名与 notarization/Gatekeeper；
- 真实公网 CDN 的 403/5xx、运营商级断网、极端丢包、硬件解码器缺失等路径；本地已覆盖 404、损坏清单、不可达、DRM、加载/缓冲超时；
- 原生系统菜单快捷键在 macOS 的逐项人工验证（Windows 的应用内快捷键已验证）。

---

## 10. 安全与数据边界

- Electron `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- preload 只暴露全屏、菜单事件、清理媒体缓存、打开外链等最小 API。
- 禁止新窗口、禁止导航到外部页面、拒绝权限请求、拦截下载。
- CSP 限制脚本/样式/媒体来源；CDN 域名由配置决定。
- 不保存视频文件、分片或可离线播放的数据。
- 本项目不提供 DRM/水印/防录屏/防盗链，这是产品范围的明确非目标。

---

## 11. 后续接入建议

1. 将视频清单 API 部署为支持分页的只读服务，接入真实 CDN。
2. 按第 6、7 节准备 HLS/DASH 与 CORS，先放入 2–3 个真实视频做冒烟。
3. 在 macOS 上执行 `npm run dist:mac`，补签名/公证。
4. 用真实弱网与 CDN 故障演练验证 ABR、超时提示和重试。
5. 如需“改配置不发版”，增加主进程读取外部配置和配置校验，当前 MVP 使用构建时 `VITE_*`。

---

## 12. 常见问题

**播放失败并提示 CORS**  
检查 CDN 是否允许 `file://`（Origin `null`）或 `*`，并确保清单和分片都带 CORS 头。

**手动清晰度菜单为空**  
Shaka 尚未解析出 variant track，或流本身只有单码率。等待清单加载完成；Sintel 演示就是单码率片源。

**macOS 提示应用已损坏**  
本地无签名构建需要右键打开或在测试机执行 `xattr -dr com.apple.quarantine <app>`。正式分发请配置签名与公证。

**没有 Electron 窗口**  
确认已执行 `node node_modules/electron/install.js`，并检查 `out/` 是否已构建。

**演示视频无法播放**  
演示流来自公网，需要联网；若所在网络屏蔽了 `test-streams.mux.dev` 或 Google Storage，请改用自己配置的 HLS/DASH 源。

**Windows 打包时访问 GitHub 超时**  
如果 `node_modules/electron/dist` 已完整，可跳过在线下载，使用本地 Electron 运行时：

```bash
npx electron-builder --win --config.electronDist=node_modules/electron/dist
```