#!/usr/bin/env bash
set -euo pipefail

# 将单个原始视频转码为多码率 HLS + DASH。需要本机安装 ffmpeg。
# 用法: ./scripts/transcode-hls-dash.sh ./input.mp4 ./output/video-id
# 输出:
#   output/video-id/hls/master.m3u8
#   output/video-id/hls/{0,1,2}/index.m3u8
#   output/video-id/dash/manifest.mpd

if [[ $# -lt 2 ]]; then
  echo "用法: $0 <input-video> <output-dir>" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [[ ! -f "$INPUT" ]]; then
  echo "找不到输入文件: $INPUT" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "未找到 ffmpeg，请先安装并加入 PATH。" >&2
  exit 1
fi

mkdir -p "$OUTPUT/hls/0" "$OUTPUT/hls/1" "$OUTPUT/hls/2" "$OUTPUT/dash"

FILTER="[0:v]split=3[v0][v1][v2];\
[v0]scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v1080];\
[v1]scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v720];\
[v2]scale=w=960:h=540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v540]"

echo "[1/2] HLS: 1080p / 720p / 540p"
ffmpeg -hide_banner -y -i "$INPUT" \
  -filter_complex "$FILTER" \
  -map "[v1080]" -map "[v720]" -map "[v540]" \
  -map 0:a:0 -map 0:a:0 -map 0:a:0 \
  -c:v libx264 -preset medium -profile:v main -pix_fmt yuv420p \
  -b:v:0 5000k -maxrate:v:0 5350k -bufsize:v:0 7500k \
  -b:v:1 2800k -maxrate:v:1 3000k -bufsize:v:1 4200k \
  -b:v:2 1400k -maxrate:v:2 1500k -bufsize:v:2 2100k \
  -c:a aac -b:a 128k -ac 2 \
  -force_key_frames "expr:gte(t,n_forced*6)" -sc_threshold 0 \
  -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_flags independent_segments \
  -hls_segment_filename "$OUTPUT/hls/%v/segment_%05d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  "$OUTPUT/hls/%v/index.m3u8"

echo "[2/2] DASH: 1080p / 720p / 540p"
ffmpeg -hide_banner -y -i "$INPUT" \
  -filter_complex "$FILTER" \
  -map "[v1080]" -map "[v720]" -map "[v540]" -map 0:a:0 \
  -c:v libx264 -preset medium -profile:v main -pix_fmt yuv420p \
  -b:v:0 5000k -maxrate:v:0 5350k -bufsize:v:0 7500k \
  -b:v:1 2800k -maxrate:v:1 3000k -bufsize:v:1 4200k \
  -b:v:2 1400k -maxrate:v:2 1500k -bufsize:v:2 2100k \
  -c:a aac -b:a 128k -ac 2 \
  -force_key_frames "expr:gte(t,n_forced*6)" -sc_threshold 0 \
  -f dash -seg_duration 6 -use_template 1 -use_timeline 0 \
  -adaptation_sets "id=0,streams=v id=1,streams=a" \
  "$OUTPUT/dash/manifest.mpd"

echo "完成:"
echo "  HLS  master: $OUTPUT/hls/master.m3u8"
echo "  DASH manifest: $OUTPUT/dash/manifest.mpd"