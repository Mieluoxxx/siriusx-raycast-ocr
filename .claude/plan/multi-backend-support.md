# Raycast OCR 多后端支持功能规划

**规划日期：** 2025-10-28
**状态：** 待审核
**版本：** v1.0

---

## 1. 目标定义

### 1.1 功能目标

为 Raycast OCR 扩展增加多后端支持能力，允许用户在不同的 OCR 引擎之间自由切换：

1. **保留现有后端**：macOS Vision API（本地、免费、隐私保护）
2. **新增 OpenAI VLM 后端**：支持 OpenAI 格式的 Vision Language Model API
3. **用户友好的切换机制**：通过 Raycast 扩展偏好设置进行配置

### 1.2 用户价值

- **灵活性**：用户可以根据需求选择不同的 OCR 后端
- **高精度选项**：OpenAI VLM 可能在某些场景下提供更好的识别效果
- **兼容性**：支持自建或第三方 OpenAI 兼容 API 端点
- **平滑迁移**：现有用户默认使用 Vision API，无需修改配置

### 1.3 技术约束

- 保持 Raycast Extension 的轻量级特性
- OpenAI API 需要用户自行提供 API Key
- 需要妥善处理 API Key 的安全存储
- 保持现有功能的向后兼容性
- 错误处理和超时机制需要针对不同后端优化

---

## 2. 功能分解

### 2.1 后端抽象层设计

#### 2.1.1 接口定义

创建统一的 OCR 后端接口：

```typescript
// src/backends/types.ts
export enum OCRBackend {
  VISION_API = "vision",
  OPENAI_VLM = "openai",
}

export interface OCRBackendConfig {
  type: OCRBackend;
  apiKey?: string;      // For OpenAI
  apiEndpoint?: string; // For custom OpenAI-compatible endpoints
  model?: string;       // Model name for VLM
}

export interface OCRResult {
  success: boolean;
  text?: string;
  error?: string;
  confidence?: number;  // Optional confidence score
}

export interface IOCRBackend {
  /**
   * Recognize text from an image
   * @param imagePath - Absolute path to the image file
   * @returns OCR result with recognized text
   */
  recognizeText(imagePath: string): Promise<OCRResult>;

  /**
   * Validate backend configuration
   * @returns true if configuration is valid
   */
  validateConfig(): Promise<boolean>;

  /**
   * Get backend display name
   */
  getName(): string;
}
```

#### 2.1.2 后端工厂模式

```typescript
// src/backends/factory.ts
export class OCRBackendFactory {
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
export class VisionAPIBackend implements IOCRBackend {
  async recognizeText(imagePath: string): Promise<OCRResult> {
    // 现有的 vision-ocr.ts 逻辑
  }

  async validateConfig(): Promise<boolean> {
    // 检查 Swift 脚本是否存在
    return true;
  }

  getName(): string {
    return "macOS Vision API";
  }
}
```

### 2.3 OpenAI VLM 后端实现

#### 2.3.1 核心功能

```typescript
// src/backends/openai-vlm.ts
export class OpenAIVLMBackend implements IOCRBackend {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;

  constructor(config: OCRBackendConfig) {
    this.apiKey = config.apiKey || "";
    this.apiEndpoint = config.apiEndpoint || "https://api.openai.com/v1";
    this.model = config.model || "gpt-4o";
  }

  async recognizeText(imagePath: string): Promise<OCRResult> {
    // 1. 读取图片并转换为 base64
    // 2. 构造 OpenAI Vision API 请求
    // 3. 调用 API
    // 4. 解析响应
  }

  async validateConfig(): Promise<boolean> {
    // 验证 API Key 和端点的有效性
  }

  getName(): string {
    return "OpenAI Vision";
  }
}
```

#### 2.3.2 OpenAI API 集成

- **请求格式**：
  ```json
  {
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Please extract all text from this image. Return only the text content, no additional explanation."
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,..."
            }
          }
        ]
      }
    ],
    "max_tokens": 1000
  }
  ```

- **错误处理**：
  - API Key 无效
  - 网络超时
  - 配额超限
  - 图片格式不支持

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
          "title": "macOS Vision API (Free, Local)",
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
    }
  ]
}
```

#### 2.4.2 配置读取

```typescript
// src/utils/config.ts
import { getPreferenceValues } from "@raycast/api";
import { OCRBackend, OCRBackendConfig } from "../backends/types";

interface Preferences {
  ocrBackend: string;
  openaiApiKey?: string;
  openaiApiEndpoint?: string;
  openaiModel?: string;
}

export function getBackendConfig(): OCRBackendConfig {
  const prefs = getPreferenceValues<Preferences>();

  return {
    type: prefs.ocrBackend as OCRBackend,
    apiKey: prefs.openaiApiKey,
    apiEndpoint: prefs.openaiApiEndpoint,
    model: prefs.openaiModel,
  };
}
```

### 2.5 命令文件重构

修改现有的两个命令文件以使用后端抽象：

```typescript
// src/ocr-from-clipboard.tsx
import { getBackendConfig } from "./utils/config";
import { OCRBackendFactory } from "./backends/factory";

export default async function Command() {
  const config = getBackendConfig();
  const backend = OCRBackendFactory.create(config);

  // ... 获取图片路径
  const result = await backend.recognizeText(imagePath);

  if (result.success && result.text) {
    await Clipboard.copy(result.text);
    // ...
  }
}
```

---

## 3. 实施步骤

### 阶段 1：基础架构搭建（核心）

#### 步骤 1.1：创建类型定义和接口
- **文件**：`src/backends/types.ts`
- **内容**：
  - 定义 `OCRBackend` 枚举
  - 定义 `OCRBackendConfig` 接口
  - 定义 `OCRResult` 接口
  - 定义 `IOCRBackend` 接口
- **验收**：TypeScript 编译通过，无类型错误

#### 步骤 1.2：实现后端工厂
- **文件**：`src/backends/factory.ts`
- **内容**：
  - 实现 `OCRBackendFactory.create()` 方法
  - 支持根据配置创建不同后端实例
- **验收**：可以正确创建不同类型的后端实例

#### 步骤 1.3：封装 Vision API 后端
- **文件**：`src/backends/vision-api.ts`
- **内容**：
  - 将 `src/utils/vision-ocr.ts` 的逻辑封装为 `VisionAPIBackend` 类
  - 实现 `IOCRBackend` 接口的所有方法
  - 保持原有功能不变
- **验收**：Vision API 后端功能与原实现完全一致

### 阶段 2：OpenAI VLM 后端实现（新功能）

#### 步骤 2.1：实现图片 Base64 转换
- **文件**：`src/backends/openai-vlm.ts` (工具函数)
- **内容**：
  - 读取图片文件
  - 转换为 base64 编码
  - 检测图片格式（PNG/JPEG/etc）
- **技术要点**：
  ```typescript
  import { readFile } from "fs/promises";

  async function imageToBase64(imagePath: string): Promise<string> {
    const buffer = await readFile(imagePath);
    return buffer.toString("base64");
  }
  ```

#### 步骤 2.2：实现 OpenAI API 调用
- **文件**：`src/backends/openai-vlm.ts`
- **内容**：
  - 构造符合 OpenAI Vision API 格式的请求
  - 使用 `fetch` 或 `axios` 发送 HTTP 请求
  - 解析 API 响应
  - 提取识别的文本
- **技术要点**：
  - 超时设置：60 秒（VLM 响应较慢）
  - 错误处理：网络错误、API 错误、解析错误
  - Prompt 优化：指导模型只返回文本内容

#### 步骤 2.3：实现配置验证
- **文件**：`src/backends/openai-vlm.ts`
- **内容**：
  - 验证 API Key 格式
  - 测试 API 端点连通性
  - 可选：测试 API Key 有效性（发送小请求）
- **验收**：能正确识别无效的配置

### 阶段 3：配置管理（集成）

#### 步骤 3.1：添加 Raycast 偏好设置
- **文件**：`package.json`
- **内容**：
  - 添加 `preferences` 配置节
  - 定义后端选择下拉框
  - 定义 OpenAI API Key 密码字段
  - 定义 API 端点和模型配置字段
- **验收**：Raycast 扩展设置界面显示所有配置项

#### 步骤 3.2：实现配置读取工具
- **文件**：`src/utils/config.ts`
- **内容**：
  - 封装 `getPreferenceValues()` 调用
  - 转换为 `OCRBackendConfig` 格式
  - 提供默认值处理
- **验收**：能正确读取用户配置

### 阶段 4：命令文件重构（整合）

#### 步骤 4.1：重构 ocr-from-clipboard.tsx
- **文件**：`src/ocr-from-clipboard.tsx`
- **内容**：
  - 使用 `getBackendConfig()` 获取配置
  - 使用 `OCRBackendFactory.create()` 创建后端
  - 调用 `backend.recognizeText()` 执行 OCR
  - 保持原有的用户体验不变
- **验收**：剪贴板 OCR 功能正常工作

#### 步骤 4.2：重构 ocr-from-screenshot.tsx
- **文件**：`src/ocr-from-screenshot.tsx`
- **内容**：
  - 同样使用后端抽象
  - 保持窗口隐藏等现有优化
- **验收**：截图 OCR 功能正常工作

### 阶段 5：错误处理和用户体验优化（完善）

#### 步骤 5.1：增强错误提示
- **内容**：
  - OpenAI API 错误的友好提示（API Key 错误、配额不足等）
  - 网络错误提示
  - 配置错误提示
- **验收**：所有错误都有清晰的用户提示

#### 步骤 5.2：添加配置验证
- **内容**：
  - 在使用 OpenAI 后端时检查 API Key 是否配置
  - 提示用户前往设置页面配置
- **验收**：未配置时有友好提示

#### 步骤 5.3：性能优化
- **内容**：
  - OpenAI API 调用的超时控制
  - 大图片的压缩处理（可选）
  - 缓存机制（可选）
- **验收**：响应时间在可接受范围内

### 阶段 6：文档和测试（交付）

#### 步骤 6.1：更新 README
- **文件**：`README.md`
- **内容**：
  - 说明多后端支持功能
  - 提供 OpenAI API Key 配置指南
  - 说明各后端的优缺点
- **验收**：文档清晰易懂

#### 步骤 6.2：手动测试
- **测试场景**：
  1. Vision API 后端测试（剪贴板 + 截图）
  2. OpenAI VLM 后端测试（剪贴板 + 截图）
  3. 配置切换测试
  4. 错误场景测试（无效 API Key、网络错误等）
  5. 中英文混合文本测试
- **验收**：所有场景通过测试

---

## 4. 验收标准

### 4.1 功能验收

- [ ] **后端切换**：能在 Raycast 设置中切换不同后端
- [ ] **Vision API**：保持原有功能完全正常
- [ ] **OpenAI VLM**：能正确调用 OpenAI API 并识别文本
- [ ] **配置管理**：API Key 等敏感信息安全存储
- [ ] **错误处理**：所有错误场景都有友好提示
- [ ] **向后兼容**：现有用户无需修改配置即可使用

### 4.2 质量标准

- [ ] **TypeScript**：无类型错误，完整的类型定义
- [ ] **代码规范**：通过 ESLint 检查
- [ ] **性能**：OCR 响应时间在可接受范围内（Vision API < 5s, OpenAI < 30s）
- [ ] **安全性**：API Key 使用 password 类型存储
- [ ] **可维护性**：代码结构清晰，易于扩展新后端

### 4.3 测试场景

1. **基础功能测试**
   - Vision API：中文、英文、混合文本
   - OpenAI VLM：中文、英文、混合文本
   - 剪贴板和截图两种模式

2. **配置测试**
   - 默认配置（Vision API）
   - 切换到 OpenAI VLM
   - 自定义 API 端点
   - 无效配置处理

3. **错误场景测试**
   - 无效 API Key
   - 网络断开
   - API 超时
   - 图片格式错误
   - 空文本处理

4. **性能测试**
   - 不同尺寸图片
   - 复杂文本布局
   - 响应时间测量

---

## 5. 技术方案细节

### 5.1 目录结构

```
src/
├── backends/
│   ├── types.ts           # 接口和类型定义
│   ├── factory.ts         # 后端工厂
│   ├── vision-api.ts      # Vision API 后端
│   └── openai-vlm.ts      # OpenAI VLM 后端
├── utils/
│   ├── clipboard.ts       # 剪贴板工具（保持不变）
│   ├── config.ts          # 配置管理（新增）
│   └── vision-ocr.ts      # 保留（或标记为已废弃）
├── ocr-from-clipboard.tsx # 重构使用后端抽象
└── ocr-from-screenshot.tsx # 重构使用后端抽象
```

### 5.2 依赖管理

需要添加的新依赖（如果需要）：

```json
{
  "dependencies": {
    "@raycast/api": "^1.83.2",
    "@raycast/utils": "^1.17.0"
    // 可能需要：
    // "axios": "^1.x.x" (用于 HTTP 请求)
    // 或者使用原生 fetch
  }
}
```

### 5.3 OpenAI API 请求示例

```typescript
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
            text: "Please extract all text from this image. Return only the extracted text, no explanations or additional content.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
  }),
  signal: AbortSignal.timeout(60000), // 60s timeout
});
```

### 5.4 错误处理策略

```typescript
try {
  const result = await backend.recognizeText(imagePath);

  if (!result.success) {
    throw new Error(result.error || "OCR failed");
  }

  // 处理成功结果
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes("API key")) {
      await showToast({
        style: Toast.Style.Failure,
        title: "API Key Error",
        message: "Please configure your OpenAI API key in extension settings",
      });
    } else if (error.message.includes("timeout")) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Request Timeout",
        message: "The OCR request took too long. Please try again.",
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "OCR Failed",
        message: error.message,
      });
    }
  }
}
```

---

## 6. 风险和注意事项

### 6.1 技术风险

1. **OpenAI API 成本**：
   - 用户需要自行承担 API 调用费用
   - 建议在文档中明确说明

2. **网络依赖**：
   - OpenAI 后端需要网络连接
   - 需要处理网络不稳定的情况

3. **API 限流**：
   - OpenAI API 有速率限制
   - 需要友好提示用户

### 6.2 安全考虑

1. **API Key 存储**：
   - 使用 Raycast 的 password 类型字段
   - 不在日志中输出 API Key
   - 提醒用户保护好 API Key

2. **图片隐私**：
   - OpenAI 后端会将图片上传到云端
   - 需要在文档中说明隐私考虑
   - Vision API 是本地处理，更安全

### 6.3 兼容性

1. **Raycast 版本**：
   - 确保偏好设置功能在目标 Raycast 版本中可用

2. **macOS 版本**：
   - Vision API 需要特定 macOS 版本
   - 文档中说明系统要求

---

## 7. 后续优化方向

1. **支持更多后端**：
   - Google Cloud Vision
   - Azure Computer Vision
   - 本地开源 OCR 引擎（Tesseract）

2. **高级功能**：
   - OCR 结果缓存
   - 批量 OCR 处理
   - OCR 历史记录

3. **性能优化**：
   - 图片自动压缩（减少 API 调用成本）
   - 请求重试机制
   - 并发控制

---

## 8. 总结

本规划详细定义了多后端支持功能的实施方案，核心思路是：

1. **抽象化**：通过接口和工厂模式实现后端抽象
2. **渐进式**：先封装现有功能，再添加新后端
3. **用户友好**：通过 Raycast 偏好设置提供简单的配置界面
4. **可扩展**：设计支持未来添加更多后端

遵循 SOLID 原则，确保代码质量和可维护性。
