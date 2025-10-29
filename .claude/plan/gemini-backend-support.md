# 项目任务分解规划：Gemini Vision API 后端支持

## 已明确的决策

- **架构模式**：延续现有的工厂模式 + 接口抽象设计
- **API 选择**：使用 Google Gemini 2.5 Flash (默认) 和 1.5 Pro (可选)
- **认证方式**：使用 `x-goog-api-key` Header 认证（区别于 OpenAI 的 Bearer Token）
- **请求格式**：Gemini `contents` 格式（区别于 OpenAI `messages` 格式）
- **代码复用**：复用 OpenAI 后端的 Base64 编码、MIME 检测、错误处理逻辑
- **配置管理**：扩展现有的 LocalStorage + Preferences 双层配置机制

## 整体规划概述

### 项目目标

为 Raycast OCR Extension 添加 Google Gemini Vision API 作为第三个 OCR 后端，用户可以在以下三种后端间自由切换：

1. **macOS Vision API**（本地免费）
2. **OpenAI Vision**（云端付费）
3. **Gemini Vision**（云端付费，新增）✨

### 技术栈

- **语言**：TypeScript
- **框架**：Raycast Extension API
- **HTTP 客户端**：原生 `fetch`
- **配置存储**：Raycast LocalStorage + Preferences
- **图片处理**：Node.js `fs/promises`

### 主要阶段

1. **Phase 1 - 后端核心实现**（约 2 小时）
2. **Phase 2 - 配置系统集成**（约 1 小时）
3. **Phase 3 - UI 界面更新**（约 1 小时）
4. **Phase 4 - 测试与验证**（约 1 小时）

---

## 详细任务分解

### 阶段 1：后端核心实现

#### 任务 1.1：扩展类型系统

- **目标**：在 `OCRBackend` 枚举中添加 `GEMINI_VLM` 选项
- **输入**：现有 `src/backends/types.ts`
- **输出**：更新后的枚举定义
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/backends/types.ts`
- **预估工作量**：15 分钟

**实施细节**：
```typescript
export enum OCRBackend {
  VISION_API = "vision",
  OPENAI_VLM = "openai",
  GEMINI_VLM = "gemini", // 新增
}
```

#### 任务 1.2：创建 Gemini 后端实现类

- **目标**：实现 `GeminiVLMBackend` 类，遵循 `IOCRBackend` 接口
- **输入**：
  - `IOCRBackend` 接口规范
  - Gemini API 文档
  - `openai-vlm.ts` 作为参考模板
- **输出**：新文件 `src/backends/gemini-vlm.ts`
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/backends/gemini-vlm.ts`（新建）
- **预估工作量**：1.5 小时

**实施细节**：

核心方法实现：
1. **构造函数**：
   - 接收 `OCRBackendConfig` 参数
   - 初始化 `apiKey`、`apiEndpoint`（默认 `https://generativelanguage.googleapis.com/v1beta`）
   - 初始化 `model`（默认 `gemini-2.5-flash`）

2. **`recognizeText(imagePath: string)`**：
   - 调用 `prepareImage()` 获取 Base64 和 MIME type
   - 构造 Gemini API 请求体：
     ```json
     {
       "contents": [{
         "parts": [
           {
             "inline_data": {
               "mime_type": "image/jpeg",
               "data": "base64_encoded_image"
             }
           },
           {"text": "Extract all text from this image..."}
         ]
       }]
     }
     ```
   - 发送 `POST` 请求到 `${apiEndpoint}/models/${model}:generateContent`
   - 使用 Header: `x-goog-api-key: ${apiKey}`
   - 设置 60 秒超时
   - 解析响应：`response.candidates[0].content.parts[0].text`
   - 调用 `handleAPIError()` 处理错误

3. **`prepareImage(imagePath: string)`**：
   - **复用逻辑**：与 OpenAI 后端完全相同
   - 读取图片文件 → Buffer → Base64
   - 检测 MIME type（支持 PNG、JPEG、WEBP、HEIC、HEIF）

4. **`detectImageType(imagePath: string)`**：
   - **复用逻辑**：扩展支持 HEIC/HEIF 格式
   ```typescript
   const mimeTypes: Record<string, string> = {
     png: "image/png",
     jpg: "image/jpeg",
     jpeg: "image/jpeg",
     webp: "image/webp",
     heic: "image/heic",
     heif: "image/heif",
     gif: "image/gif",
   };
   ```

5. **`getOCRPrompt()`**：
   - **优化**：针对 Gemini 的指令风格调整
   ```typescript
   return `Extract all text from this image accurately.

   Requirements:
   1. Preserve the original layout and line breaks
   2. Support Chinese (Simplified/Traditional), English, and mixed text
   3. Maintain formatting (spaces, indentation, tables if present)
   4. Return ONLY the extracted text without explanation
   5. If no text is found, return empty response

   Extract the text now:`;
   ```

6. **`handleAPIError(response: Response)`**：
   - 解析错误响应，映射到 `OCRErrorType`：
     - 401/403 → `API_KEY_INVALID`
     - 429 → `QUOTA_EXCEEDED`
     - 500+ → `NETWORK_ERROR`
     - 其他 → `UNKNOWN`
   - 提取 Gemini 特定的错误信息格式

7. **`validateConfig()`**：
   - 验证 API Key 非空
   - 验证 API Key 格式（Gemini Key 通常以 `AIza` 开头）

8. **`getName()`**：
   - 返回 `"Google Gemini Vision"`

**错误处理清单**：
- ✅ API Key 缺失 → `CONFIG_ERROR`
- ✅ 图片读取失败 → `INVALID_IMAGE`
- ✅ 网络超时 → `TIMEOUT`
- ✅ 401/403 认证错误 → `API_KEY_INVALID`
- ✅ 429 配额超限 → `QUOTA_EXCEEDED`
- ✅ 服务器错误 → `NETWORK_ERROR`
- ✅ 响应解析失败 → `UNKNOWN`

#### 任务 1.3：在工厂中注册 Gemini 后端

- **目标**：在 `OCRBackendFactory` 中添加 Gemini 分支
- **输入**：新创建的 `GeminiVLMBackend` 类
- **输出**：更新后的工厂类
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/backends/factory.ts`
- **预估工作量**：10 分钟

**实施细节**：
```typescript
import { GeminiVLMBackend } from "./gemini-vlm";

export class OCRBackendFactory {
  static create(config: OCRBackendConfig): IOCRBackend {
    switch (config.type) {
      case OCRBackend.VISION_API:
        return new VisionAPIBackend();
      case OCRBackend.OPENAI_VLM:
        return new OpenAIVLMBackend(config);
      case OCRBackend.GEMINI_VLM: // 新增
        return new GeminiVLMBackend(config);
      default:
        throw new Error(`Unknown backend type: ${config.type}`);
    }
  }
}
```

---

### 阶段 2：配置系统集成

#### 任务 2.1：扩展配置接口

- **目标**：在 `Preferences` 接口中添加 Gemini 相关配置字段
- **输入**：现有 `src/utils/config.ts`
- **输出**：更新后的接口和配置读取逻辑
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/utils/config.ts`
- **预估工作量**：20 分钟

**实施细节**：
```typescript
interface Preferences {
  ocrBackend: string;
  openaiApiKey?: string;
  openaiApiEndpoint?: string;
  openaiModel?: string;
  openaiDetail?: "auto" | "low" | "high";
  // 新增 Gemini 配置
  geminiApiKey?: string;
  geminiApiEndpoint?: string;
  geminiModel?: string;
}
```

#### 任务 2.2：更新配置读取逻辑

- **目标**：在 `getBackendConfig()` 中添加 Gemini 配置的映射
- **输入**：扩展后的 `Preferences` 接口
- **输出**：支持 Gemini 配置的读取函数
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/utils/config.ts`
- **预估工作量**：15 分钟

**实施细节**：
```typescript
export async function getBackendConfig(): Promise<OCRBackendConfig> {
  // ... 现有逻辑 ...

  return {
    type: prefs.ocrBackend as OCRBackend,
    apiKey: prefs.ocrBackend === "gemini"
      ? prefs.geminiApiKey?.trim()
      : prefs.openaiApiKey?.trim(),
    apiEndpoint: prefs.ocrBackend === "gemini"
      ? prefs.geminiApiEndpoint?.trim() || "https://generativelanguage.googleapis.com/v1beta"
      : prefs.openaiApiEndpoint?.trim() || "https://api.openai.com/v1",
    model: prefs.ocrBackend === "gemini"
      ? prefs.geminiModel?.trim() || "gemini-2.5-flash"
      : prefs.openaiModel?.trim() || "gpt-4o",
    detail: prefs.openaiDetail || "high", // Gemini 不需要此字段
  };
}
```

#### 任务 2.3：更新 package.json 偏好设置

- **目标**：在 `package.json` 的 `preferences` 数组中添加 Gemini 配置项
- **输入**：Gemini API 配置需求
- **输出**：更新后的 `package.json`
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/package.json`
- **预估工作量**：15 分钟

**实施细节**：
```json
{
  "preferences": [
    {
      "name": "ocrBackend",
      "data": [
        {"title": "macOS Vision API (Free, Local, Private)", "value": "vision"},
        {"title": "OpenAI Vision (Requires API Key)", "value": "openai"},
        {"title": "Google Gemini Vision (Requires API Key)", "value": "gemini"}
      ]
    },
    // 新增 Gemini 配置
    {
      "name": "geminiApiKey",
      "type": "password",
      "required": false,
      "title": "Gemini API Key",
      "description": "Your Google Gemini API key (only needed for Gemini backend)",
      "placeholder": "AIza..."
    },
    {
      "name": "geminiApiEndpoint",
      "type": "textfield",
      "required": false,
      "title": "Gemini API Endpoint",
      "description": "Custom Gemini API endpoint (optional)",
      "default": "https://generativelanguage.googleapis.com/v1beta",
      "placeholder": "https://generativelanguage.googleapis.com/v1beta"
    },
    {
      "name": "geminiModel",
      "type": "textfield",
      "required": false,
      "title": "Gemini Model",
      "description": "Gemini model to use for OCR",
      "default": "gemini-2.5-flash",
      "placeholder": "gemini-2.5-flash"
    }
  ]
}
```

---

### 阶段 3：UI 界面更新

#### 任务 3.1：在配置界面添加 Gemini 后端选项

- **目标**：在 `configure-ocr.tsx` 的下拉菜单中添加 Gemini 选项
- **输入**：现有 `src/configure-ocr.tsx`
- **输出**：支持 Gemini 选择的 UI
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/configure-ocr.tsx`
- **预估工作量**：30 分钟

**实施细节**：
```tsx
<Form.Dropdown
  id="backend"
  title="OCR 后端"
  value={selectedBackend}
  onChange={(newValue) => setSelectedBackend(newValue as OCRBackend)}
>
  <Form.Dropdown.Item value={OCRBackend.VISION_API} title="macOS Vision API" icon="🍎" />
  <Form.Dropdown.Item value={OCRBackend.OPENAI_VLM} title="OpenAI Vision" icon="☁️" />
  <Form.Dropdown.Item value={OCRBackend.GEMINI_VLM} title="Google Gemini Vision" icon="✨" />
</Form.Dropdown>
```

#### 任务 3.2：添加 Gemini 配置表单

- **目标**：根据选择的后端动态显示 Gemini 配置字段
- **输入**：Gemini 配置需求（API Key、Endpoint、Model）
- **输出**：动态表单组件
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/configure-ocr.tsx`
- **预估工作量**：30 分钟

**实施细节**：
```tsx
export default function Command() {
  // 添加 Gemini 状态
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [geminiApiEndpoint, setGeminiApiEndpoint] = useState<string>(
    "https://generativelanguage.googleapis.com/v1beta"
  );
  const [geminiModel, setGeminiModel] = useState<string>("gemini-2.5-flash");

  // 在 loadConfig 中加载 Gemini 配置
  useEffect(() => {
    const loadConfig = async () => {
      const currentConfig = await getBackendConfig();
      // ... 现有逻辑 ...
      if (currentConfig.type === OCRBackend.GEMINI_VLM) {
        setGeminiApiKey(currentConfig.apiKey || "");
        setGeminiApiEndpoint(currentConfig.apiEndpoint || "https://generativelanguage.googleapis.com/v1beta");
        setGeminiModel(currentConfig.model || "gemini-2.5-flash");
      }
    };
    loadConfig();
  }, []);

  const showGeminiConfig = selectedBackend === OCRBackend.GEMINI_VLM;

  return (
    <Form>
      {/* ... 后端选择下拉菜单 ... */}

      {showGeminiConfig && (
        <>
          <Form.Separator />
          <Form.Description text="Google Gemini 配置" />

          <Form.PasswordField
            id="geminiApiKey"
            title="API Key"
            placeholder="AIza..."
            value={geminiApiKey}
            onChange={setGeminiApiKey}
            info="你的 Google Gemini API Key"
          />

          <Form.TextField
            id="geminiApiEndpoint"
            title="API 端点"
            placeholder="https://generativelanguage.googleapis.com/v1beta"
            value={geminiApiEndpoint}
            onChange={setGeminiApiEndpoint}
            info="自定义 API 端点(可选)"
          />

          <Form.TextField
            id="geminiModel"
            title="模型名称"
            placeholder="gemini-2.5-flash"
            value={geminiModel}
            onChange={setGeminiModel}
            info="Gemini 模型名称 (推荐: gemini-2.5-flash)"
          />
        </>
      )}
    </Form>
  );
}
```

#### 任务 3.3：更新表单提交逻辑

- **目标**：在保存配置时正确处理 Gemini 参数
- **输入**：表单状态
- **输出**：更新后的 `handleSubmit` 函数
- **涉及文件**：
  - `/Users/moguw/workspace/raycast-ocr/src/configure-ocr.tsx`
- **预估工作量**：15 分钟

**实施细节**：
```tsx
const handleSubmit = async () => {
  try {
    const newConfig: OCRBackendConfig = {
      type: selectedBackend,
      apiKey: selectedBackend === OCRBackend.GEMINI_VLM
        ? geminiApiKey?.trim() || undefined
        : apiKey?.trim() || undefined,
      apiEndpoint: selectedBackend === OCRBackend.GEMINI_VLM
        ? geminiApiEndpoint?.trim() || "https://generativelanguage.googleapis.com/v1beta"
        : apiEndpoint?.trim() || "https://api.openai.com/v1",
      model: selectedBackend === OCRBackend.GEMINI_VLM
        ? geminiModel?.trim() || "gemini-2.5-flash"
        : model?.trim() || "gpt-4o",
      detail: selectedBackend === OCRBackend.OPENAI_VLM ? detail : undefined,
    };

    await saveBackendConfig(newConfig);

    const backendNames = {
      [OCRBackend.VISION_API]: "Vision API",
      [OCRBackend.OPENAI_VLM]: "OpenAI Vision",
      [OCRBackend.GEMINI_VLM]: "Google Gemini Vision",
    };

    await showToast({
      style: Toast.Style.Success,
      title: "配置已保存",
      message: `已切换到 ${backendNames[selectedBackend]}`,
    });

    pop();
  } catch (error) {
    // ... 错误处理 ...
  }
};
```

---

### 阶段 4：测试与验证

#### 任务 4.1：单元测试

- **目标**：验证 Gemini 后端的核心功能
- **输入**：实现好的 `GeminiVLMBackend` 类
- **输出**：测试用例和验证结果
- **涉及文件**：
  - 无需新建文件（手动测试）
- **预估工作量**：30 分钟

**测试清单**：
1. ✅ API Key 验证逻辑
   - 空 Key → 应抛出 `CONFIG_ERROR`
   - 无效格式 → `validateConfig()` 返回 false
   - 有效格式 → `validateConfig()` 返回 true

2. ✅ 图片准备逻辑
   - PNG/JPEG/WEBP → 正确的 MIME type
   - HEIC/HEIF → 正确的 MIME type
   - 不存在的文件 → 抛出 `INVALID_IMAGE`

3. ✅ API 请求构造
   - 检查 Header: `x-goog-api-key`
   - 检查请求体格式：`contents.parts.inline_data`
   - 检查 Prompt 内容

4. ✅ 错误处理
   - 401 → `API_KEY_INVALID`
   - 429 → `QUOTA_EXCEEDED`
   - 网络超时 → `TIMEOUT`
   - 500+ → `NETWORK_ERROR`

#### 任务 4.2：集成测试

- **目标**：端到端测试完整的 OCR 流程
- **输入**：测试图片（包含中英文文字）
- **输出**：验证报告
- **涉及文件**：
  - 无需新建文件
- **预估工作量**：30 分钟

**测试场景**：
1. ✅ 从剪贴板识别图片
   - 复制一张包含文字的图片
   - 运行 `OCR from Clipboard`
   - 验证识别结果准确性

2. ✅ 从截图识别文字
   - 运行 `OCR from Screenshot`
   - 截取包含文字的区域
   - 验证识别结果

3. ✅ 后端切换
   - 在 `Configure OCR` 中切换到 Gemini
   - 验证配置保存成功
   - 再次运行 OCR 验证使用的是 Gemini

4. ✅ 配置持久化
   - 保存 Gemini 配置
   - 重启 Raycast
   - 验证配置仍然有效

5. ✅ 错误友好提示
   - 使用无效 API Key
   - 验证错误消息清晰友好
   - 验证 Toast 提示正确显示

---

## 需要进一步明确的问题

### 问题 1：Gemini API 的图片大小限制处理

**背景**：Gemini API 可能对图片大小有限制（具体限制需要查阅文档），超大图片可能导致请求失败。

**推荐方案**：

- **方案 A：不做处理**（简单）
  - 优点：实现简单，与 OpenAI 后端保持一致
  - 缺点：超大图片可能失败，用户体验不佳

- **方案 B：添加图片压缩**（复杂）
  - 优点：提升成功率，降低 API 成本
  - 缺点：需要引入图片处理库（如 `sharp`），增加依赖和复杂度
  - 实现：在 `prepareImage()` 中检测图片大小，超过阈值时自动压缩

**等待用户选择**：
```
请选择您偏好的方案，或提供其他建议：
[ ] 方案 A（推荐：先简单实现，后续按需优化）
[ ] 方案 B
[ ] 其他方案：_______________
```

---

### 问题 2：是否需要支持模型自定义下拉选择

**背景**：Gemini 支持多个模型（如 gemini-2.5-flash、gemini-1.5-pro），当前设计使用文本输入框。

**推荐方案**：

- **方案 A：保持文本输入框**（灵活）
  - 优点：用户可以自由输入任何模型名称，包括未来新模型
  - 缺点：用户可能不知道有哪些可选模型

- **方案 B：改为下拉选择框**（用户友好）
  - 优点：用户体验更好，避免输入错误
  - 缺点：需要维护模型列表，新模型上线需要更新代码
  - 实现示例：
    ```tsx
    <Form.Dropdown id="geminiModel" title="模型名称" value={geminiModel} onChange={setGeminiModel}>
      <Form.Dropdown.Item value="gemini-2.5-flash" title="Gemini 2.5 Flash (推荐)" />
      <Form.Dropdown.Item value="gemini-1.5-pro" title="Gemini 1.5 Pro (更强大)" />
    </Form.Dropdown>
    ```

**等待用户选择**：
```
请选择您偏好的方案，或提供其他建议：
[ ] 方案 A（推荐：保持灵活性）
[ ] 方案 B
[ ] 其他方案：_______________
```

---

### 问题 3：Prompt 优化策略

**背景**：不同的 AI 模型对 Prompt 的响应风格不同，可能需要针对 Gemini 单独优化。

**推荐方案**：

- **方案 A：沿用 OpenAI Prompt**（简单）
  - 优点：减少工作量，保持一致性
  - 缺点：可能不是 Gemini 的最佳效果

- **方案 B：针对 Gemini 优化**（精细）
  - 优点：可能获得更好的识别效果
  - 缺点：需要多次测试调优
  - 实现：根据 Gemini 官方文档和社区实践调整 Prompt 风格

**等待用户选择**：
```
请选择您偏好的方案，或提供其他建议：
[ ] 方案 A（推荐：先沿用，后续按实际效果调优）
[ ] 方案 B
[ ] 其他方案：_______________
```

---

## 用户反馈区域

请在此区域补充您对整体规划的意见和建议：

```
用户补充内容：

---

---

---
```

---

## 技术实施注意事项

### 1. 代码复用清单

| 功能模块 | 复用来源 | 备注 |
|---------|---------|-----|
| Base64 编码 | `OpenAIVLMBackend.prepareImage()` | 直接复用 |
| MIME 类型检测 | `OpenAIVLMBackend.detectImageType()` | 扩展支持 HEIC/HEIF |
| 错误处理框架 | `OCRError` + `OCRErrorType` | 直接使用 |
| 配置管理 | `getBackendConfig()` / `saveBackendConfig()` | 扩展支持 Gemini |
| 超时处理 | `AbortSignal.timeout()` | 直接复用 |

### 2. Gemini API 特定逻辑

| 特性 | OpenAI | Gemini | 差异 |
|-----|--------|--------|-----|
| 认证方式 | `Authorization: Bearer {key}` | `x-goog-api-key: {key}` | ⚠️ Header 不同 |
| 请求格式 | `messages[].content[]` | `contents[].parts[]` | ⚠️ 结构不同 |
| 图片字段 | `image_url.url` | `inline_data.{mime_type, data}` | ⚠️ 字段不同 |
| 响应路径 | `choices[0].message.content` | `candidates[0].content.parts[0].text` | ⚠️ 路径不同 |
| 模型调用 | `/chat/completions` | `/models/{model}:generateContent` | ⚠️ URL 不同 |

### 3. 错误处理映射表

| HTTP 状态码 | Gemini 错误类型 | OCRErrorType | 用户友好提示 |
|-----------|---------------|-------------|------------|
| 400 | INVALID_ARGUMENT | UNKNOWN | "请求参数错误，请检查图片格式" |
| 401/403 | UNAUTHENTICATED/PERMISSION_DENIED | API_KEY_INVALID | "API Key 无效，请检查配置" |
| 429 | RESOURCE_EXHAUSTED | QUOTA_EXCEEDED | "API 配额已用尽，请稍后重试" |
| 500+ | INTERNAL | NETWORK_ERROR | "Gemini 服务错误，请稍后重试" |
| 超时 | - | TIMEOUT | "请求超时（60秒），请重试" |

### 4. SOLID 原则遵循

- **S - 单一职责**：`GeminiVLMBackend` 只负责 Gemini API 交互
- **O - 开闭原则**：通过工厂模式添加新后端，无需修改现有代码
- **L - 里氏替换**：`GeminiVLMBackend` 可以替换任何 `IOCRBackend`
- **I - 接口隔离**：`IOCRBackend` 接口精简，只定义必要方法
- **D - 依赖倒置**：上层代码依赖 `IOCRBackend` 接口，而非具体实现

---

## 验收标准

### 功能验收

- [ ] 用户可在 `Configure OCR` 界面选择 "Google Gemini Vision"
- [ ] 填写 Gemini API Key 后可成功识别图片
- [ ] 识别结果准确，支持中英文混合文本
- [ ] 配置保存后持久化，重启 Raycast 仍然生效
- [ ] 在三个后端间切换无缝，无需重启

### 质量验收

- [ ] 错误提示友好，用户能理解错误原因
- [ ] API Key 无效时有明确提示
- [ ] 配额超限时有明确提示
- [ ] 网络错误时有明确提示
- [ ] 代码符合 TypeScript 最佳实践
- [ ] 无 ESLint 错误和警告

### 性能验收

- [ ] OCR 请求在 10 秒内返回结果（正常网络环境）
- [ ] 超时时间设置合理（60 秒）
- [ ] 无内存泄漏

### 兼容性验收

- [ ] 支持 PNG、JPEG、WEBP、HEIC、HEIF 格式
- [ ] 与 macOS Vision API 后端兼容
- [ ] 与 OpenAI Vision 后端兼容
- [ ] Raycast 扩展可正常打包和发布

---

## 风险评估与缓解

### 风险 1：Gemini API 响应格式变化

- **概率**：低
- **影响**：高（导致解析失败）
- **缓解措施**：
  - 添加详细的错误日志
  - 使用可选链操作符 `?.` 安全访问
  - 添加响应格式验证

### 风险 2：API Key 泄露

- **概率**：中
- **影响**：高（安全风险）
- **缓解措施**：
  - 使用 `password` 类型输入框
  - 不在日志中打印 API Key
  - 提醒用户保护好 Key

### 风险 3：图片格式不兼容

- **概率**：中
- **影响**：中（识别失败）
- **缓解措施**：
  - 扩展 MIME 类型映射表
  - 提供友好的错误提示
  - 在文档中说明支持的格式

### 风险 4：网络环境限制

- **概率**：中（中国大陆）
- **影响**：高（无法使用）
- **缓解措施**：
  - 支持自定义 API Endpoint（可配置代理）
  - 在文档中说明网络要求
  - 提供 macOS Vision API 作为离线备选

---

## 文档和教程（可选）

### 用户文档

1. **如何获取 Gemini API Key**
   - 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
   - 创建或选择项目
   - 生成 API Key
   - 复制并粘贴到 Raycast 配置

2. **推荐配置**
   - **模型**：gemini-2.5-flash（速度快、成本低）
   - **场景**：日常 OCR 需求
   - **高级场景**：gemini-1.5-pro（更强大，成本高）

3. **常见问题**
   - Q: 为什么识别失败？
   - A: 检查 API Key、网络连接、配额余额
   - Q: 支持哪些图片格式？
   - A: PNG、JPEG、WEBP、HEIC、HEIF

### 开发文档

1. **代码结构**
   ```
   src/backends/
   ├── types.ts           # 类型定义（包含 GEMINI_VLM）
   ├── factory.ts         # 工厂类（包含 Gemini 分支）
   ├── gemini-vlm.ts      # Gemini 后端实现 ✨
   ├── openai-vlm.ts      # OpenAI 后端实现
   └── vision-api.ts      # Vision API 后端实现
   ```

2. **扩展新后端的步骤**（供未来参考）
   - 在 `types.ts` 添加枚举值
   - 创建实现 `IOCRBackend` 的类
   - 在 `factory.ts` 注册
   - 更新 `config.ts` 配置读取
   - 更新 UI 和 `package.json`

---

## 总结

本规划遵循以下设计原则：

1. **最小化修改**：充分复用现有代码，减少新增逻辑
2. **保持一致**：与现有 OpenAI 后端架构保持一致
3. **用户友好**：提供清晰的配置界面和错误提示
4. **可扩展性**：为未来添加更多后端预留空间
5. **渐进式实现**：分阶段实施，每阶段可独立测试

预计总工作量：**5 小时**（包含测试和文档）

开始实施前，请先确认以上"需要进一步明确的问题"部分的决策。
