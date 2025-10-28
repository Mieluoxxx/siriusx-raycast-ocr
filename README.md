# Raycast OCR Extension

使用 macOS 原生 Vision API 从图片中快速提取文字的 Raycast 扩展。

## 功能特性

- 🖼️ **识别剪贴板图片** - 复制图片后一键识别文字
- 📸 **截图识别** - 截取屏幕区域并立即识别文字
- 🚀 **快速响应** - 基于 macOS 原生 Vision API,识别速度 1-2 秒
- 🌐 **多语言支持** - 支持中文(简体/繁体)、英文等多种语言
- 🔒 **隐私优先** - 完全离线处理,无需网络和 API 密钥
- 📋 **自动复制** - 识别结果自动复制到剪贴板

## 系统要求

- macOS 10.15 或更高版本
- Raycast 应用

## 安装

1. 克隆或下载本项目:
```bash
git clone https://github.com/你的用户名/raycast-ocr.git
cd raycast-ocr
```

2. 安装依赖:
```bash
pnpm install
```

3. 在 Raycast 中开发模式运行:
```bash
pnpm dev
```

## 使用方法

### 方法 1: 识别剪贴板图片

1. 复制或截图一张包含文字的图片
2. 打开 Raycast (默认 `⌘ Space`)
3. 输入 "OCR from Clipboard" 或 "识别剪贴板"
4. 按回车执行
5. 识别的文字会自动复制到剪贴板

### 方法 2: 截图识别

1. 打开 Raycast
2. 输入 "OCR from Screenshot" 或 "截图识别"
3. 按回车执行
4. 选择要识别的屏幕区域
5. 识别的文字会自动复制到剪贴板

## 快捷键设置

建议在 Raycast 设置中为这两个命令配置快捷键,例如:

- **OCR from Clipboard**: `⌥ ⌘ V`
- **OCR from Screenshot**: `⌥ ⌘ C`

设置方法:
1. 打开 Raycast 设置
2. 进入 Extensions → OCR Text Recognition
3. 为每个命令设置快捷键

## 技术架构

- **前端**: TypeScript + React + Raycast API
- **OCR 引擎**: macOS Vision Framework (Swift)
- **桥接**: Node.js child_process

## 常见问题

### 为什么识别不到文字?

- 确保图片中的文字清晰可见
- 图片分辨率不要太低
- 避免文字过于倾斜或变形

### 支持哪些图片格式?

支持常见图片格式: PNG, JPG, JPEG, GIF, BMP, TIFF, HEIC 等

### 识别准确率如何?

使用 Apple 原生 Vision API,对清晰的印刷体文字准确率可达 95% 以上。手写字体准确率会相对较低。

### 可以离线使用吗?

是的,完全离线运行,不需要网络连接和 API 密钥。

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 代码检查
pnpm lint

# 代码格式化
pnpm fix-lint
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request!
