#!/usr/bin/env bash
set -euo pipefail

# 使用阿里云 ossutil 上传已转码视频目录。凭证由 ossutil 的本机配置或环境提供，
# 不要把 AccessKeySecret 写入仓库、客户端环境变量或脚本参数。
# 用法: OSS_BUCKET=my-bucket ./scripts/upload-oss.sh ./output/video-id videos/video-id

if [[ $# -lt 2 ]]; then
  echo "用法: OSS_BUCKET=<bucket> $0 <local-dir> <remote-prefix>" >&2
  exit 1
fi

LOCAL_DIR="$1"
REMOTE_PREFIX="${2#/}"
: "${OSS_BUCKET:?请通过环境变量 OSS_BUCKET 指定 Bucket}"

if ! command -v ossutil >/dev/null 2>&1; then
  echo "未找到 ossutil，请先安装阿里云 ossutil 并完成本机凭证配置。" >&2
  exit 1
fi

if [[ ! -d "$LOCAL_DIR" ]]; then
  echo "找不到本地目录: $LOCAL_DIR" >&2
  exit 1
fi

ossutil cp -r "$LOCAL_DIR/" "oss://${OSS_BUCKET}/${REMOTE_PREFIX}/" --update

echo "上传完成: oss://${OSS_BUCKET}/${REMOTE_PREFIX}/"
echo "请确认 CDN 已回源、CORS 已允许桌面客户端，并为切片设置长缓存。"