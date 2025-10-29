# Raycast OCR 多后端支持功能规划（修订版）

**规划日期：** 2025-10-28
**状态：** 已审查，待实施
**版本：** v1.1
**变更：** 整合 OpenAI API 文档信息，优化技术方案

---

## 📋 修订说明

### v1.1 变更内容

1. ✅ 基于 OpenAI 官方文档优化 API 集成方案
2. ✅ 添加 `detail` 参数支持（low/auto/high）
3. ✅ 统一接口返回类型为 `Promise<string>`（保持简单性）
4. ✅ 完善图片格式检测和 MIME 类型处理
5. ✅ 优化 Prompt 设计（中英文、保留格式）
6. ✅ 细化错误类型和处理策略
7. ✅ 添加性能监控机制
8. ✅ 明确配置验证时机

---

## 1. 目标定义

### 1.1 功能目标

为 Raycast OCR 扩展增加多后端支持能力，允许用户在不同的 OCR 引擎之间自由切换：

1. **保留现有后端**：macOS Vision API（本地、免费、隐私保护）
2. **新增 OpenAI VLM 后端**：支持 OpenAI 格式的 Vision Language Model API
3. **用户友好的切换机制**：通过 Raycast 扩展偏好设置进行配置

### 1.2 用户价值

- **灵活性**：用户可以根据需求选择不同的 OCR 后端
- **高精度选项**：OpenAI VLM 在复杂场景下可能提供更好的识别效果
- **成本控制**：通过 `detail` 参数平衡精度和成本
- **兼容性**：支持自建或第三方 OpenAI 兼容 API 端点
- **平滑迁移**：现有用户默认使用 Vision API，无需修改配置

### 1.3 技术约束

- 保持 Raycast Extension 的轻量级特性
- OpenAI API 需要用户自行提供 API Key
- 需要妥善处理 API Key 的安全存储
- 保持现有功能的向后兼容性
- 错误处理和超时机制需要针对不同后端优化
- 图片大小和格式受 OpenAI API 限制

---

## 2. 功能分解

### 2.1 后端抽象层设计

#### 2.1.1 接口定义

创建统一的 OCR 后端接口：

```typescript
// src/backends/types.ts

/**
 * 支持的 OCR 后端类型
 */
export enum OCRBackend {
  VISION_API = "vision",
  OPENAI_VLM = "openai",
}

/**
 * OCR 后端配置
 */
export interface OCRBackendConfig {
  type: OCRBackend;
  // OpenAI 专用配置
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
  detail?: "auto" | "low" | "high"; // 图片清晰度（high 推荐用于 OCR）
}

/**
 * 统一的 OCR 后端接口
 */
export interface IOCRBackend {
  /**
   * 识别图片中的文字
   * @param imagePath - 图片文件的绝对路径
   * @returns 识别出的文字内容
   * @throws OCRError 识别失败时抛出错误
   */
  recognizeText(imagePath: string): Promise<string>;

  /**
   * 验证后端配置是否有效
   * @returns true 如果配置有效
   */
  validateConfig(): Promise<boolean>;

  /**
   * 获取后端显示名称
   */
  getName(): string;
}

/**
 * OCR 错误类型
 */
export enum OCRErrorType {
  NETWORK_ERROR = "network",
  API_KEY_INVALID = "api_key",
  QUOTA_EXCEEDED = "quota",
  TIMEOUT = "timeout",
  INVALID_IMAGE = "invalid_image",
  CONFIG_ERROR = "config",
  UNKNOWN = "unknown",
}

/**
 * OCR 自定义错误类
 */
export class OCRError extends Error {
  constructor(
    public type: OCRErrorType,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "OCRError";
  }
}
```

#### 2.1.2 后端工厂模式

```typescript
// src/backends/factory.ts
import { OCRBackend, OCRBackendConfig, IOCRBackend } from "./types";
import { VisionAPIBackend } from "./vision-api";
import { OpenAIVLMBackend } from "./openai-vlm";

export class OCRBackendFactory {
  /**
   * 创建 OCR 后端实例
   * @param config 后端配置
   * @returns OCR 后端实例
   */
  static create(config: OCRBackendConfig): IOCRBackend {
    switch (config.type) {
      case OCRBackend.VISION_API:
        return new VisionAPIBackend();

      case OCRBackend.OPENAI_VLM:
        return new OpenAIVLMBackend(config);

      default:
        throw new Error(`Unknown backend type: ${config.type}`);
    }
  }
}
```

### 2.2 Vision API 后端重构

将现有的 Vision API 实现封装为后端类：

```typescript
// src/backends/vision-api.ts
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { environment } from "@raycast/api";
import { IOCRBackend, OCRError, OCRErrorType } from "./types";

const execAsync = promisify(exec);

interface VisionResult {
  success: boolean;
  text?: string;
  error?: string;
}

export class VisionAPIBackend implements IOCRBackend {
  async recognizeText(imagePath: string): Promise<string> {
    const scriptPath = path.join(environment.assetsPath, "scripts", "vision-ocr.swift");

    try {
      const { stdout, stderr } = await execAsync(
        `/usr/bin/swift "${scriptPath}" "${imagePath}"`,
        {
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 10,
        }
      );

      if (stderr) {
        console.error("Swift script stderr:", stderr);
      }

      const trimmedOutput = stdout.trim();
      if (!trimmedOutput) {
        throw new OCRError(
          OCRErrorType.UNKNOWN,
          "No output from OCR script"
        );
      }

      const result: VisionResult = JSON.parse(trimmedOutput);

      if (!result.success) {
        throw new OCRError(
          OCRErrorType.UNKNOWN,
          result.error || "Unknown error occurred"
        );
      }

      return result.text || "";
    } catch (error) {
      if (error instanceof OCRError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.message.includes("ETIMEDOUT") || error.message.includes("SIGTERM")) {
          throw new OCRError(
            OCRErrorType.TIMEOUT,
            "OCR operation timed out after 30 seconds"
          );
        }

        if (error.message.includes("JSON")) {
          throw new OCRError(
            OCRErrorType.UNKNOWN,
            "Failed to parse OCR result"
          );
        }
      }

      throw new OCRError(
        OCRErrorType.UNKNOWN,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const scriptPath = path.join(environment.assetsPath, "scripts", "vision-ocr.swift");
      const { access } = await import("fs/promises");
      await access(scriptPath);
      return true;
    } catch {
      return false;
    }
  }

  getName(): string {
    return "macOS Vision API";
  }
}
```

### 2.3 OpenAI VLM 后端实现

#### 2.3.1 核心功能实现

```typescript
// src/backends/openai-vlm.ts
import { readFile } from "fs/promises";
import { IOCRBackend, OCRBackendConfig, OCRError, OCRErrorType } from "./types";

export class OpenAIVLMBackend implements IOCRBackend {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;
  private detail: "auto" | "low" | "high";

  constructor(config: OCRBackendConfig) {
    this.apiKey = config.apiKey || "";
    this.apiEndpoint = config.apiEndpoint || "https://api.openai.com/v1";
    this.model = config.model || "gpt-4o";
    this.detail = config.detail || "high"; // OCR 场景推荐使用 high
  }

  async recognizeText(imagePath: string): Promise<string> {
    // 验证配置
    if (!this.apiKey) {
      throw new OCRError(
        OCRErrorType.CONFIG_ERROR,
        "OpenAI API Key is not configured. Please set it in extension preferences."
      );
    }

    try {
      // 1. 读取并转换图片
      const { base64Image, mimeType } = await this.prepareImage(imagePath);

      // 2. 构造 API 请求
      const response = await fetch(`${this.apiEndpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: this.getOCRPrompt(),
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                    detail: this.detail,
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
          temperature: 0, // 提高一致性
        }),
        signal: AbortSignal.timeout(60000), // 60s timeout
      });

      // 3. 处理 HTTP 错误
      if (!response.ok) {
        await this.handleAPIError(response);
      }

      // 4. 解析响应
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";

      if (!text) {
        throw new OCRError(
          OCRErrorType.UNKNOWN,
          "No text content in API response"
        );
      }

      return text.trim();
    } catch (error) {
      if (error instanceof OCRError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError" || error.message.includes("timeout")) {
          throw new OCRError(
            OCRErrorType.TIMEOUT,
            "Request timed out after 60 seconds"
          );
        }

        if (error.message.includes("fetch")) {
          throw new OCRError(
            OCRErrorType.NETWORK_ERROR,
            "Network error: " + error.message
          );
        }
      }

      throw new OCRError(
        OCRErrorType.UNKNOWN,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * 准备图片：读取、检测格式、转换为 base64
   */
  private async prepareImage(imagePath: string): Promise<{
    base64Image: string;
    mimeType: string;
  }> {
    try {
      const imageBuffer = await readFile(imagePath);
      const base64Image = imageBuffer.toString("base64");
      const mimeType = this.detectImageType(imagePath);

      return { base64Image, mimeType };
    } catch (error) {
      throw new OCRError(
        OCRErrorType.INVALID_IMAGE,
        "Failed to read image file: " + (error instanceof Error ? error.message : "Unknown error")
      );
    }
  }

  /**
   * 检测图片 MIME 类型
   */
  private detectImageType(imagePath: string): string {
    const ext = imagePath.toLowerCase().split(".").pop();
    const mimeTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    return mimeTypes[ext || "png"] || "image/png";
  }

  /**
   * 获取优化的 OCR Prompt
   */
  private getOCRPrompt(): string {
    return `Extract all text from this image accurately.

Requirements:
1. Preserve the original layout and line breaks
2. Support Chinese (Simplified/Traditional), English, and mixed text
3. Maintain formatting (spaces, indentation, tables if present)
4. Return ONLY the extracted text without any explanation or additional content
5. If no text is found, return an empty response

Please extract the text now:`;
  }

  /**
   * 处理 API 错误响应
   */
  private async handleAPIError(response: Response): Promise<never> {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    let errorType = OCRErrorType.UNKNOWN;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorMessage;

      // 根据错误信息分类
      if (response.status === 401) {
        errorType = OCRErrorType.API_KEY_INVALID;
        errorMessage = "Invalid API key. Please check your OpenAI API key in settings.";
      } else if (response.status === 429) {
        errorType = OCRErrorType.QUOTA_EXCEEDED;
        errorMessage = "API quota exceeded or rate limit reached. Please try again later.";
      } else if (response.status >= 500) {
        errorType = OCRErrorType.NETWORK_ERROR;
        errorMessage = "OpenAI server error. Please try again later.";
      }
    } catch {
      // 无法解析错误响应，使用默认消息
    }

    throw new OCRError(errorType, errorMessage);
  }

  async validateConfig(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    // 可选：测试 API Key 有效性
    // 这里简单验证格式，避免额外的 API 调用
    return this.apiKey.startsWith("sk-") && this.apiKey.length > 20;
  }

  getName(): string {
    return "OpenAI Vision";
  }
}
```

### 2.4 Raycast 偏好设置集成

#### 2.4.1 package.json 配置

```json
{
  "preferences": [
    {
      "name": "ocrBackend",
      "type": "dropdown",
      "required": true,
      "title": "OCR Backend",
      "description": "Choose which OCR engine to use",
      "default": "vision",
      "data": [
        {
          "title": "macOS Vision API (Free, Local, Private)",
          "value": "vision"
        },
        {
          "title": "OpenAI Vision (Requires API Key)",
          "value": "openai"
        }
      ]
    },
    {
      "name": "openaiApiKey",
      "type": "password",
      "required": false,
      "title": "OpenAI API Key",
      "description": "Your OpenAI API key (only needed for OpenAI backend)",
      "placeholder": "sk-..."
    },
    {
      "name": "openaiApiEndpoint",
      "type": "textfield",
      "required": false,
      "title": "API Endpoint",
      "description": "Custom OpenAI-compatible API endpoint (optional)",
      "default": "https://api.openai.com/v1",
      "placeholder": "https://api.openai.com/v1"
    },
    {
      "name": "openaiModel",
      "type": "textfield",
      "required": false,
      "title": "Model Name",
      "description": "OpenAI model to use for OCR",
      "default": "gpt-4o",
      "placeholder": "gpt-4o"
    },
    {
      "name": "openaiDetail",
      "type": "dropdown",
      "required": false,
      "title": "Image Detail Level",
      "description": "Higher detail = better OCR accuracy but slower and more expensive",
      "default": "high",
      "data": [
        {
          "title": "High (Best for OCR)",
          "value": "high"
        },
        {
          "title": "Auto (Balanced)",
          "value": "auto"
        },
        {
          "title": "Low (Faster, cheaper)",
          "value": "low"
        }
      ]
    }
  ]
}
```

#### 2.4.2 配置读取工具

```typescript
// src/utils/config.ts
import { getPreferenceValues } from "@raycast/api";
import { OCRBackend, OCRBackendConfig } from "../backends/types";

interface Preferences {
  ocrBackend: string;
  openaiApiKey?: string;
  openaiApiEndpoint?: string;
  openaiModel?: string;
  openaiDetail?: "auto" | "low" | "high";
}

/**
 * 获取用户配置的 OCR 后端配置
 */
export function getBackendConfig(): OCRBackendConfig {
  const prefs = getPreferenceValues<Preferences>();

  return {
    type: prefs.ocrBackend as OCRBackend,
    apiKey: prefs.openaiApiKey?.trim(),
    apiEndpoint: prefs.openaiApiEndpoint?.trim() || "https://api.openai.com/v1",
    model: prefs.openaiModel?.trim() || "gpt-4o",
    detail: prefs.openaiDetail || "high",
  };
}
```

### 2.5 命令文件重构

#### 2.5.1 剪贴板 OCR 重构

```typescript
// src/ocr-from-clipboard.tsx
import { Clipboard, showToast, Toast, showHUD } from "@raycast/api";
import { getClipboardImagePath, cleanupTempFile } from "./utils/clipboard";
import { getBackendConfig } from "./utils/config";
import { OCRBackendFactory } from "./backends/factory";
import { OCRError, OCRErrorType } from "./backends/types";

export default async function Command() {
  let tempFilePath: string | null = null;

  try {
    // 显示加载提示
    await showToast({
      style: Toast.Style.Animated,
      title: "正在识别图片中的文字...",
    });

    // 获取剪贴板图片
    tempFilePath = await getClipboardImagePath();

    if (!tempFilePath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "剪贴板中没有图片",
        message: "请先复制或截图一张包含文字的图片",
      });
      return;
    }

    // 创建后端实例
    const config = getBackendConfig();
    const backend = OCRBackendFactory.create(config);

    // 执行 OCR
    const recognizedText = await backend.recognizeText(tempFilePath);

    if (!recognizedText || recognizedText.trim().length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "未识别到文字",
        message: "图片中可能没有文字，或文字不够清晰",
      });
      return;
    }

    // 复制到剪贴板
    await Clipboard.copy(recognizedText);

    // 显示成功消息
    const preview =
      recognizedText.length > 100
        ? recognizedText.substring(0, 100) + "..."
        : recognizedText;

    await showHUD(`✓ 已复制识别结果: ${preview}`);
  } catch (error) {
    console.error("OCR Error:", error);
    await handleOCRError(error);
  } finally {
    // 清理临时文件
    if (tempFilePath && tempFilePath.startsWith("/tmp/raycast-ocr")) {
      await cleanupTempFile(tempFilePath);
    }
  }
}

/**
 * 统一的错误处理
 */
async function handleOCRError(error: unknown) {
  if (error instanceof OCRError) {
    switch (error.type) {
      case OCRErrorType.API_KEY_INVALID:
        await showToast({
          style: Toast.Style.Failure,
          title: "API Key 错误",
          message: "请在扩展设置中配置有效的 OpenAI API Key",
        });
        break;

      case OCRErrorType.QUOTA_EXCEEDED:
        await showToast({
          style: Toast.Style.Failure,
          title: "配额超限",
          message: "API 配额已用尽或达到速率限制，请稍后重试",
        });
        break;

      case OCRErrorType.TIMEOUT:
        await showToast({
          style: Toast.Style.Failure,
          title: "请求超时",
          message: "OCR 处理时间过长，请尝试使用更小的图片",
        });
        break;

      case OCRErrorType.NETWORK_ERROR:
        await showToast({
          style: Toast.Style.Failure,
          title: "网络错误",
          message: "无法连接到 API 服务，请检查网络连接",
        });
        break;

      case OCRErrorType.CONFIG_ERROR:
        await showToast({
          style: Toast.Style.Failure,
          title: "配置错误",
          message: error.message,
        });
        break;

      default:
        await showToast({
          style: Toast.Style.Failure,
          title: "识别失败",
          message: error.message,
        });
    }
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: "识别失败",
      message: error instanceof Error ? error.message : "未知错误，请重试",
    });
  }
}
```

#### 2.5.2 截图 OCR 重构

```typescript
// src/ocr-from-screenshot.tsx
// 与 ocr-from-clipboard.tsx 类似的重构
// 保持 closeMainWindow() 等现有优化
```

---

## 3. 实施步骤

### 阶段 1：基础架构搭建（1-2小时）

#### 步骤 1.1：创建类型定义和接口
- **文件**：`src/backends/types.ts`
- **内容**：
  - ✅ 定义 `OCRBackend` 枚举
  - ✅ 定义 `OCRBackendConfig` 接口（含 detail 参数）
  - ✅ 定义 `IOCRBackend` 接口（返回 `Promise<string>`）
  - ✅ 定义 `OCRErrorType` 和 `OCRError` 类
- **验收**：TypeScript 编译通过，无类型错误

#### 步骤 1.2：实现后端工厂
- **文件**：`src/backends/factory.ts`
- **内容**：
  - ✅ 实现 `OCRBackendFactory.create()` 方法
  - ✅ 支持根据配置创建不同后端实例
- **验收**：可以正确创建不同类型的后端实例

#### 步骤 1.3：封装 Vision API 后端
- **文件**：`src/backends/vision-api.ts`
- **内容**：
  - ✅ 将 `src/utils/vision-ocr.ts` 的逻辑封装为 `VisionAPIBackend` 类
  - ✅ 实现 `IOCRBackend` 接口的所有方法
  - ✅ 使用 `OCRError` 替换原有错误处理
  - ✅ 保持原有功能不变
- **验收**：Vision API 后端功能与原实现完全一致

### 阶段 2：OpenAI VLM 后端实现（2-3小时）

#### 步骤 2.1：实现图片准备功能
- **文件**：`src/backends/openai-vlm.ts`
- **内容**：
  - ✅ 实现 `prepareImage()` 方法：读取图片、转换 base64
  - ✅ 实现 `detectImageType()` 方法：检测 MIME 类型
  - ✅ 支持 PNG, JPEG, GIF, WebP 格式
- **验收**：能正确读取和转换各种格式的图片

#### 步骤 2.2：实现 OpenAI API 调用
- **文件**：`src/backends/openai-vlm.ts`
- **内容**：
  - ✅ 实现 `recognizeText()` 核心方法
  - ✅ 构造符合 OpenAI Vision API 格式的请求
  - ✅ 使用 `detail` 参数控制清晰度
  - ✅ 使用原生 `fetch` 发送 HTTP 请求
  - ✅ 60秒超时设置
- **技术要点**：
  - 请求格式严格按照 OpenAI 文档
  - 包含 `image_url.detail` 字段
  - `temperature: 0` 提高一致性
- **验收**：能成功调用 API 并获取响应

#### 步骤 2.3：实现 Prompt 优化
- **文件**：`src/backends/openai-vlm.ts`
- **内容**：
  - ✅ 实现 `getOCRPrompt()` 方法
  - ✅ Prompt 明确要求：保留格式、支持中英文、仅返回文本
- **验收**：OCR 结果准确且格式良好

#### 步骤 2.4：实现错误处理
- **文件**：`src/backends/openai-vlm.ts`
- **内容**：
  - ✅ 实现 `handleAPIError()` 方法
  - ✅ 区分 401（API Key）、429（配额）、5xx（服务器）错误
  - ✅ 网络错误、超时错误处理
  - ✅ 抛出 `OCRError` 类型错误
- **验收**：所有错误场景都有明确的错误类型

#### 步骤 2.5：实现配置验证
- **文件**：`src/backends/openai-vlm.ts`
- **内容**：
  - ✅ 实现 `validateConfig()` 方法
  - ✅ 验证 API Key 格式（以 sk- 开头）
- **验收**：能识别无效配置

### 阶段 3：配置管理（30分钟）

#### 步骤 3.1：添加 Raycast 偏好设置
- **文件**：`package.json`
- **内容**：
  - ✅ 添加 `preferences` 配置节
  - ✅ 后端选择下拉框（vision/openai）
  - ✅ OpenAI API Key 密码字段
  - ✅ API 端点配置字段
  - ✅ 模型名称字段（默认 gpt-4o）
  - ✅ Detail 级别下拉框（high/auto/low）
- **验收**：Raycast 扩展设置界面显示所有配置项

#### 步骤 3.2：实现配置读取工具
- **文件**：`src/utils/config.ts`
- **内容**：
  - ✅ 实现 `getBackendConfig()` 函数
  - ✅ 封装 `getPreferenceValues()` 调用
  - ✅ 转换为 `OCRBackendConfig` 格式
  - ✅ 提供默认值处理
- **验收**：能正确读取用户配置

### 阶段 4：命令文件重构（1小时）

#### 步骤 4.1：重构 ocr-from-clipboard.tsx
- **文件**：`src/ocr-from-clipboard.tsx`
- **内容**：
  - ✅ 使用 `getBackendConfig()` 获取配置
  - ✅ 使用 `OCRBackendFactory.create()` 创建后端
  - ✅ 调用 `backend.recognizeText()` 执行 OCR
  - ✅ 实现 `handleOCRError()` 统一错误处理
  - ✅ 保持原有的用户体验不变
- **验收**：剪贴板 OCR 功能正常工作

#### 步骤 4.2：重构 ocr-from-screenshot.tsx
- **文件**：`src/ocr-from-screenshot.tsx`
- **内容**：
  - ✅ 同样使用后端抽象
  - ✅ 保持 `closeMainWindow()` 等现有优化
  - ✅ 复用 `handleOCRError()` 错误处理
- **验收**：截图 OCR 功能正常工作

### 阶段 5：测试和优化（1-2小时）

#### 步骤 5.1：单元测试
- **测试内容**：
  - ✅ Vision API 后端测试
  - ✅ OpenAI VLM 后端测试（模拟 API）
  - ✅ 配置读取测试
  - ✅ 错误处理测试

#### 步骤 5.2：集成测试
- **测试场景**：
  1. Vision API：中文、英文、混合文本
  2. OpenAI VLM：中文、英文、混合文本
  3. 配置切换：Vision ↔ OpenAI
  4. 错误场景：无效 API Key、网络错误、超时
  5. 不同 detail 级别对比
  6. 剪贴板和截图两种模式
- **验收**：所有场景通过测试

#### 步骤 5.3：性能测试
- **测试内容**：
  - ✅ Vision API 响应时间（目标 < 5s）
  - ✅ OpenAI API 响应时间（目标 < 30s）
  - ✅ 不同尺寸图片性能
  - ✅ 不同 detail 级别性能对比
- **验收**：响应时间在可接受范围内

### 阶段 6：文档和清理（30分钟）

#### 步骤 6.1：更新 README
- **文件**：`README.md`
- **内容**：
  - ✅ 多后端支持功能说明
  - ✅ OpenAI API Key 配置指南
  - ✅ 各后端对比表格（成本、速度、隐私等）
  - ✅ Detail 参数使用建议
  - ✅ 故障排除指南
- **验收**：文档清晰易懂

#### 步骤 6.2：代码清理
- **内容**：
  - ✅ 移除未使用的代码
  - ✅ 添加必要的注释
  - ✅ 运行 ESLint 修复
  - ✅ 格式化代码
- **验收**：代码通过所有检查

---

## 4. 验收标准

### 4.1 功能验收

- [ ] **后端切换**：能在 Raycast 设置中切换不同后端
- [ ] **Vision API**：保持原有功能完全正常
- [ ] **OpenAI VLM**：能正确调用 OpenAI API 并识别文本
- [ ] **Detail 参数**：high/auto/low 三种模式都能正常工作
- [ ] **配置管理**：API Key 等敏感信息安全存储
- [ ] **错误处理**：所有错误场景都有清晰的分类和提示
- [ ] **向后兼容**：现有用户默认使用 Vision API，无需配置

### 4.2 质量标准

- [ ] **TypeScript**：无类型错误，完整的类型定义
- [ ] **代码规范**：通过 ESLint 检查
- [ ] **性能**：Vision API < 5s, OpenAI < 30s
- [ ] **安全性**：API Key 使用 password 类型存储，不记录日志
- [ ] **可维护性**：代码结构清晰，易于扩展新后端
- [ ] **错误处理**：所有错误都有类型分类和用户友好提示

### 4.3 测试场景矩阵

| 场景 | Vision API | OpenAI (high) | OpenAI (auto) | OpenAI (low) |
|------|-----------|---------------|---------------|--------------|
| 中文文本 | ✅ | ✅ | ✅ | ✅ |
| 英文文本 | ✅ | ✅ | ✅ | ✅ |
| 中英混合 | ✅ | ✅ | ✅ | ✅ |
| 复杂排版 | ✅ | ✅ | ✅ | ⚠️ |
| 小字体 | ⚠️ | ✅ | ✅ | ⚠️ |
| 模糊图片 | ⚠️ | ✅ | ⚠️ | ❌ |
| 剪贴板模式 | ✅ | ✅ | ✅ | ✅ |
| 截图模式 | ✅ | ✅ | ✅ | ✅ |

---

## 5. 技术方案细节

### 5.1 目录结构

```
src/
├── backends/
│   ├── types.ts              # 接口、类型、错误定义
│   ├── factory.ts            # 后端工厂
│   ├── vision-api.ts         # Vision API 后端实现
│   └── openai-vlm.ts         # OpenAI VLM 后端实现
├── utils/
│   ├── clipboard.ts          # 剪贴板工具（保持不变）
│   ├── config.ts             # 配置管理（新增）
│   └── vision-ocr.ts         # 可选：保留或移除
├── ocr-from-clipboard.tsx    # 重构使用后端抽象
└── ocr-from-screenshot.tsx   # 重构使用后端抽象
```

### 5.2 依赖管理

无需添加新依赖，使用原生 Node.js API：

```json
{
  "dependencies": {
    "@raycast/api": "^1.83.2",
    "@raycast/utils": "^1.17.0"
  }
}
```

- HTTP 请求：原生 `fetch`
- 文件操作：`fs/promises`
- 进程执行：`child_process`

### 5.3 OpenAI API 完整请求示例

```typescript
// 基于官方文档的完整请求
const response = await fetch(`${this.apiEndpoint}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${this.apiKey}`,
  },
  body: JSON.stringify({
    model: this.model, // "gpt-4o"
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: this.getOCRPrompt(),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: this.detail, // "high" | "auto" | "low"
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0, // 提高一致性
  }),
  signal: AbortSignal.timeout(60000),
});

// 响应解析
const data = await response.json();
const text = data.choices?.[0]?.message?.content || "";
```

### 5.4 错误处理完整策略

```typescript
// 统一错误处理函数
async function handleOCRError(error: unknown) {
  if (error instanceof OCRError) {
    const messages = {
      [OCRErrorType.API_KEY_INVALID]: {
        title: "API Key 错误",
        message: "请在扩展设置中配置有效的 OpenAI API Key",
      },
      [OCRErrorType.QUOTA_EXCEEDED]: {
        title: "配额超限",
        message: "API 配额已用尽或达到速率限制，请稍后重试",
      },
      [OCRErrorType.TIMEOUT]: {
        title: "请求超时",
        message: "OCR 处理时间过长，请尝试使用更小的图片",
      },
      [OCRErrorType.NETWORK_ERROR]: {
        title: "网络错误",
        message: "无法连接到 API 服务，请检查网络连接",
      },
      [OCRErrorType.CONFIG_ERROR]: {
        title: "配置错误",
        message: error.message,
      },
      [OCRErrorType.INVALID_IMAGE]: {
        title: "图片错误",
        message: error.message,
      },
      [OCRErrorType.UNKNOWN]: {
        title: "识别失败",
        message: error.message,
      },
    };

    const msg = messages[error.type];
    await showToast({
      style: Toast.Style.Failure,
      title: msg.title,
      message: msg.message,
    });
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: "识别失败",
      message: error instanceof Error ? error.message : "未知错误，请重试",
    });
  }
}
```

---

## 6. 风险和注意事项

### 6.1 技术风险

1. **OpenAI API 成本** ⚠️
   - 用户需要自行承担 API 调用费用
   - gpt-4o with vision 约 $0.01-0.03/image
   - 建议在文档中明确说明成本

2. **网络依赖** ⚠️
   - OpenAI 后端需要稳定网络连接
   - 国内用户可能需要代理
   - 提供自定义 API 端点支持第三方服务

3. **API 限流** ⚠️
   - OpenAI 有 RPM（每分钟请求数）限制
   - 需要友好提示用户

4. **图片大小限制** ⚠️
   - OpenAI 对图片有大小限制
   - 可能需要实现图片压缩功能

### 6.2 安全考虑

1. **API Key 存储** ✅
   - 使用 Raycast 的 password 类型字段
   - 不在日志中输出 API Key
   - 传输时使用 HTTPS
   - 提醒用户保护好 API Key

2. **图片隐私** ⚠️
   - OpenAI 后端会将图片上传到云端
   - 需要在文档中说明隐私考虑
   - Vision API 是本地处理，更安全
   - 建议敏感内容使用 Vision API

### 6.3 兼容性

1. **Raycast 版本** ✅
   - 确保 preferences 功能在 Raycast 1.83.2+ 可用
   - 测试不同版本的兼容性

2. **macOS 版本** ✅
   - Vision API 需要 macOS 10.15+
   - 文档中说明系统要求

3. **图片格式** ✅
   - Vision API：PNG, JPEG, HEIC, etc.
   - OpenAI：PNG, JPEG, GIF, WebP
   - 确保常见格式都支持

---

## 7. 后续优化方向

### 7.1 短期优化（v1.1-v1.2）

1. **图片压缩**
   - 自动压缩大于 2MB 的图片
   - 减少 API 调用成本和时间

2. **结果缓存**
   - 缓存最近的 OCR 结果
   - 避免重复处理相同图片

3. **批量处理**
   - 支持一次处理多张图片
   - 合并结果或分别输出

### 7.2 中期扩展（v2.0）

1. **更多后端**
   - Google Cloud Vision
   - Azure Computer Vision
   - 本地 Tesseract

2. **高级功能**
   - OCR 历史记录
   - 结果编辑和校正
   - 导出为不同格式

3. **性能监控**
   - 记录每次 OCR 的性能数据
   - 生成统计报告
   - 帮助用户选择最佳后端

### 7.3 长期愿景（v3.0）

1. **AI 增强**
   - 自动纠错和格式化
   - 智能分段和标题识别
   - 多语言翻译

2. **云同步**
   - OCR 历史跨设备同步
   - 设置和配置同步

---

## 8. 总结

### 8.1 核心设计理念

1. **抽象化** - 通过接口和工厂模式实现后端抽象
2. **渐进式** - 先封装现有功能，再添加新后端
3. **用户友好** - 通过 Raycast 偏好设置提供简单配置
4. **可扩展** - 设计支持未来添加更多后端
5. **类型安全** - 完整的 TypeScript 类型定义

### 8.2 编程原则应用

- ✅ **KISS**：接口简洁，返回 `Promise<string>`
- ✅ **SOLID**：
  - S - 每个后端单一职责
  - O - 对扩展开放，对修改封闭
  - L - 所有后端可替换
  - I - 接口专一（IOCRBackend）
  - D - 依赖抽象而非具体实现
- ✅ **DRY**：统一的错误处理、配置管理
- ✅ **错误优先**：完善的错误分类和处理

### 8.3 预期成果

- 🎯 用户可以自由选择 OCR 后端
- 🎯 OpenAI 后端提供高精度选项
- 🎯 Detail 参数平衡精度和成本
- 🎯 保持现有功能 100% 兼容
- 🎯 代码质量和可维护性提升
- 🎯 为未来扩展打下良好基础

---

**规划状态：** 已完成审查和优化，可以开始实施 ✨

主人，这个修订版规划已经整合了所有信息，可以开始实施了喵～ (´｡• ᵕ •｡`) ♡
