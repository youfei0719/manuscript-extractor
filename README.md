# 稿件提取

本地优先的短视频真实稿件提取桌面应用。它从经授权的抖音分享链接、本机视频或音频、以及已获授权的文本中取得可核对稿件，完成 AI 校对与人工确认后，将确认稿仅保存到本机。

## 下载

请从 [GitHub Releases](https://github.com/youfei0719/manuscript-extractor/releases/latest) 下载最新安装包：

- macOS（Apple 芯片）：`.dmg`
- Windows：`.msi` 或 `.exe`

首次在 macOS 打开未签名应用时，系统可能要求在“系统设置 → 隐私与安全性”中确认打开。

## 能力范围

- 识别经授权的抖音分享链接并提取真实语音稿件
- 导入本机视频或音频进行转写
- 对已有的真实稿件进行 AI 校对和人工确认
- 本机保存确认稿，支持搜索、复制、TXT 与 Markdown 导出
- 提供模型、ASR、FFmpeg、yt-dlp 与本机日志诊断

原始媒体、临时音频、访问凭据不会进入历史稿件或导出文件。没有真实稿件时，应用不会用标题、描述或摘要代替转写结果。

## 开发

环境要求：Node.js、Rust，以及桌面端所需的 Tauri 工具链。媒体转写还需要按设置页指引配置 FFmpeg、yt-dlp 和 ASR 后端。

```bash
npm install
npm run tauri dev
```

## 验证

```bash
npm run build
npm run test:unit
npm run test
cargo test --manifest-path src-tauri/Cargo.toml
```

## 许可证

MIT License，详见 [LICENSE](LICENSE)。
