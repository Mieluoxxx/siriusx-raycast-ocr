# LaTeX 数学公式识别功能规划

## 已明确的决策

基于当前项目架构和技术栈的分析，以下决策已经确定：

- **技术架构**：复用现有的后端抽象层设计（`IOCRBackend` 接口）
- **实现方式**：通过优化 Prompt 方式利用 OpenAI Vision 和 Gemini Vision 的能力进行 LaTeX 识别
- **代码组织**：遵循现有的工厂模式和依赖注入原则
- **用户体验**：保持与现有 OCR 命令一致的交互流程（剪贴板/截图）
- **配置管理**：沿用现有的 LocalStorage + Raycast Preferences 双层配置系统

---

## 整体规划概述

### 项目目标

为 Raycast OCR 扩展添加 LaTeX 数学公式识别功能，使用户能够：
1. 快速将图片中的数学公式转换为可编辑的 LaTeX 代码
2. 在学术写作、笔记整理、教学场景中提高效率
3. 支持从剪贴板图片和截图两种方式识别公式

### 用户价值

- **学术研究者**：快速将论文、书籍中的公式转换为 LaTeX 代码
- **学生**：整理课堂笔记，将手写或印刷的数学公式数字化
- **教师**：准备教学材料时快速录入复杂公式
- **技术文档编写者**：提高包含数学表达式的文档编写效率

### 技术栈

**复用现有技术栈**：
- TypeScript + Node.js
- Raycast API (@raycast/api ^1.83.2)
- 现有的后端抽象层（`IOCRBackend` 接口）

**支持的 LaTeX 识别后端**：
- **OpenAI Vision (gpt-4o)**: 强大的公式识别能力，支持复杂公式和手写公式
- **Google Gemini Vision (gemini-2.5-flash)**: 成本更低，对常见数学符号识别准确
- **macOS Vision API**: 不支持 LaTeX 识别（仅作为备选的纯文字 OCR）

### 预期效果

用户截图或复制一个包含数学公式的图片后，系统能够：
1. 识别图片中的数学公式
2. 转换为标准的 LaTeX 代码
3. 自动复制到剪贴板
4. 可直接粘贴到支持 LaTeX 的编辑器（如 Overleaf、Notion、Obsidian 等）

### 主要阶段

1. **阶段 1：核心功能实现** - 实现 LaTeX 识别的核心逻辑
2. **阶段 2：用户界面开发** - 添加新的 Raycast 命令和配置界面
3. **阶段 3：测试与优化** - 全面测试和性能优化

---

## 技术方案

### LaTeX 识别实现方式

#### 方案选择：基于 Vision API + 专用 Prompt

**核心思路**：
- 不需要训练新模型或集成专门的 LaTeX OCR 库
- 利用 OpenAI Vision 和 Gemini Vision 的多模态理解能力
- 通过精心设计的 Prompt 引导模型输出 LaTeX 代码

**优势**：
- ✅ 代码复用度高，遵循现有架构
- ✅ 开发周期短，无需引入新的依赖
- ✅ 支持手写公式和印刷公式
- ✅ 可持续优化（通过改进 Prompt）

**劣势**：
- ⚠️ Vision API 后端不支持（需要提示用户）
- ⚠️ 依赖网络和 API 配额

#### 专用 Prompt 设计

**OpenAI Vision Prompt**：
```
You are a LaTeX formula recognition expert. Please analyze this image and extract all mathematical formulas/expressions as LaTeX code.

Requirements:
1. Output ONLY valid LaTeX code, without any explanation or markdown code blocks
2. For inline formulas, wrap with $...$
3. For display formulas, wrap with $$...$$
4. Preserve the original layout if there are multiple formulas
5. Support common mathematical notations: fractions, integrals, summations, matrices, Greek letters, etc.
6. If the image contains both text and formulas, only extract the formulas
7. If no formulas are found, return "NO_FORMULA_FOUND"

Examples of expected output format:
- Inline: $E = mc^2$
- Display: $$\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
- Multiple: $$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

Please extract the LaTeX code now:
```

**Gemini Vision Prompt**：
```
Extract all mathematical formulas from this image and convert them to LaTeX code.

Rules:
1. Output only LaTeX code, no explanations
2. Use $ for inline math, $$ for display math
3. Include all mathematical symbols, operators, and structures
4. Maintain the original formula structure and layout
5. If no formulas detected, output: NO_FORMULA_FOUND

Output format examples:
$f(x) = x^2 + 2x + 1$
$$\lim_{x \to 0} \frac{\sin x}{x} = 1$$

Extract now:
```

### 后端扩展方案

#### 选项 1：扩展现有后端类（推荐）

在 `OpenAIVLMBackend` 和 `GeminiVLMBackend` 中添加新方法：

```typescript
interface IOCRBackend {
  recognizeText(imagePath: string): Promise<string>;
  recognizeLaTeX(imagePath: string): Promise<string>; // 新增
  validateConfig(): Promise<boolean>;
  getName(): string;
}
```

**优点**：
- 接口清晰，职责明确
- 易于理解和维护
- 支持后续添加更多识别模式

**缺点**：
- 需要修改接口定义，影响现有实现

#### 选项 2：通过配置参数控制识别模式

```typescript
interface RecognitionOptions {
  mode: 'text' | 'latex';
}

interface IOCRBackend {
  recognizeText(imagePath: string, options?: RecognitionOptions): Promise<string>;
  // ...
}
```

**优点**：
- 不破坏现有接口
- 向后兼容
- 灵活性高

**缺点**：
- 接口语义不够明确
- 可能导致参数传递复杂化

### 结果格式化处理

**后处理步骤**：
1. **清理输出**：移除可能的 markdown 代码块标记（\`\`\`latex）
2. **验证 LaTeX 语法**：基础语法检查（括号匹配、常见命令检查）
3. **格式优化**：
   - 统一空格和换行
   - 规范化常见符号（如 \times vs. \cdot）
4. **错误处理**：
   - 识别失败提示
   - 建议用户尝试更清晰的图片

**实现工具函数**：
```typescript
// src/utils/latex-formatter.ts
export function formatLaTeXOutput(rawOutput: string): string;
export function validateLaTeXSyntax(latex: string): { valid: boolean; error?: string };
export function cleanupLaTeXCode(latex: string): string;
```

---

## 功能分解

### 模块 1：LaTeX 识别后端抽象层

**职责**：扩展现有的 OCR 后端接口，支持 LaTeX 识别模式

**文件**：
- `src/backends/types.ts` - 扩展接口定义
- `src/backends/openai-vlm.ts` - 实现 LaTeX 识别
- `src/backends/gemini-vlm.ts` - 实现 LaTeX 识别
- `src/backends/vision-api.ts` - 添加不支持提示

**接口变更**：
```typescript
enum RecognitionMode {
  TEXT = 'text',
  LATEX = 'latex'
}

interface IOCRBackend {
  recognizeText(imagePath: string): Promise<string>;
  recognizeLaTeX(imagePath: string): Promise<string>; // 新增
  supportsMode(mode: RecognitionMode): boolean; // 新增
  // ...existing methods
}
```

### 模块 2：LaTeX 格式化工具

**职责**：处理和格式化 LaTeX 识别结果

**文件**：`src/utils/latex-formatter.ts`

**主要函数**：
```typescript
// 清理 LaTeX 代码（移除 markdown 标记等）
export function cleanupLaTeXCode(rawLatex: string): string;

// 验证 LaTeX 基础语法
export function validateLaTeXSyntax(latex: string): {
  valid: boolean;
  errors: string[];
};

// 格式化 LaTeX 输出
export function formatLaTeXOutput(latex: string): string;

// 检测是否为有效的 LaTeX 公式
export function isValidFormula(latex: string): boolean;
```

### 模块 3：LaTeX 识别命令

**职责**：提供用户交互界面，调用后端识别 LaTeX

**文件**：
- `src/latex-from-clipboard.tsx` - 从剪贴板识别 LaTeX
- `src/latex-from-screenshot.tsx` - 从截图识别 LaTeX

**主要功能**：
- 获取图片（剪贴板/截图）
- 调用后端识别 LaTeX
- 格式化并复制结果
- 错误处理和用户提示

### 模块 4：配置界面扩展

**职责**：在配置界面显示 LaTeX 识别相关设置

**文件**：`src/configure-ocr.tsx`（扩展现有文件）

**新增配置项**：
- 显示当前后端是否支持 LaTeX 识别
- LaTeX 识别模式的提示和说明
- 推荐后端选择（OpenAI/Gemini）

---

## 详细任务分解

### 阶段 1：核心功能实现

#### 任务 1.1：扩展后端接口定义

- **目标**：在 `IOCRBackend` 接口中添加 LaTeX 识别方法
- **输入**：现有的 `src/backends/types.ts`
- **输出**：
  - 新增 `RecognitionMode` 枚举
  - 扩展 `IOCRBackend` 接口，添加 `recognizeLaTeX()` 和 `supportsMode()` 方法
- **涉及文件**：
  - `src/backends/types.ts`
- **预估工作量**：30 分钟
- **依赖**：无

#### 任务 1.2：实现 OpenAI Vision 后端的 LaTeX 识别

- **目标**：在 `OpenAIVLMBackend` 类中实现 `recognizeLaTeX()` 方法
- **输入**：
  - 扩展后的 `IOCRBackend` 接口
  - LaTeX 专用 Prompt 模板
- **输出**：
  - 实现 `recognizeLaTeX(imagePath: string): Promise<string>`
  - 实现 `supportsMode(mode: RecognitionMode): boolean`
  - 添加 `getLaTeXPrompt()` 私有方法
- **涉及文件**：
  - `src/backends/openai-vlm.ts`
- **预估工作量**：1 小时
- **依赖**：任务 1.1

#### 任务 1.3：实现 Gemini Vision 后端的 LaTeX 识别

- **目标**：在 `GeminiVLMBackend` 类中实现 `recognizeLaTeX()` 方法
- **输入**：
  - 扩展后的 `IOCRBackend` 接口
  - LaTeX 专用 Prompt 模板（针对 Gemini 优化）
- **输出**：
  - 实现 `recognizeLaTeX(imagePath: string): Promise<string>`
  - 实现 `supportsMode(mode: RecognitionMode): boolean`
  - 添加 `getLaTeXPrompt()` 私有方法
- **涉及文件**：
  - `src/backends/gemini-vlm.ts`
- **预估工作量**：1 小时
- **依赖**：任务 1.1

#### 任务 1.4：Vision API 后端添加不支持提示

- **目标**：在 `VisionAPIBackend` 中实现接口方法，返回不支持提示
- **输入**：扩展后的 `IOCRBackend` 接口
- **输出**：
  - 实现 `recognizeLaTeX()` - 抛出 `OCRError` 提示不支持
  - 实现 `supportsMode()` - LaTeX 模式返回 `false`
- **涉及文件**：
  - `src/backends/vision-api.ts`
- **预估工作量**：20 分钟
- **依赖**：任务 1.1

#### 任务 1.5：创建 LaTeX 格式化工具模块

- **目标**：实现 LaTeX 代码的清理、验证和格式化功能
- **输入**：Vision API 返回的原始 LaTeX 字符串
- **输出**：
  - `cleanupLaTeXCode()` - 移除 markdown 标记、多余空格
  - `validateLaTeXSyntax()` - 基础语法检查（括号匹配、常见命令）
  - `formatLaTeXOutput()` - 格式优化
  - `isValidFormula()` - 检测是否为有效公式
- **涉及文件**：
  - `src/utils/latex-formatter.ts`（新建）
- **预估工作量**：1.5 小时
- **依赖**：无

### 阶段 2：用户界面开发

#### 任务 2.1：实现剪贴板 LaTeX 识别命令

- **目标**：创建 "LaTeX from Clipboard" 命令
- **输入**：
  - 剪贴板中的图片
  - 后端 LaTeX 识别接口
  - LaTeX 格式化工具
- **输出**：
  - 完整的命令流程：获取图片 → 识别 → 格式化 → 复制
  - 用户友好的错误提示
  - Toast/HUD 反馈
- **涉及文件**：
  - `src/latex-from-clipboard.tsx`（新建）
- **预估工作量**：1 小时
- **依赖**：任务 1.2, 1.3, 1.5

#### 任务 2.2：实现截图 LaTeX 识别命令

- **目标**：创建 "LaTeX from Screenshot" 命令
- **输入**：
  - 用户选择的屏幕区域截图
  - 后端 LaTeX 识别接口
  - LaTeX 格式化工具
- **输出**：
  - 完整的命令流程：截图 → 识别 → 格式化 → 复制
  - 临时文件清理
  - 用户友好的错误提示
- **涉及文件**：
  - `src/latex-from-screenshot.tsx`（新建）
- **预估工作量**：1 小时
- **依赖**：任务 1.2, 1.3, 1.5

#### 任务 2.3：注册新命令到 package.json

- **目标**：在 Raycast 配置中注册 LaTeX 识别命令
- **输入**：新创建的命令文件
- **输出**：
  - 在 `package.json` 的 `commands` 数组中添加：
    - `latex-from-clipboard`
    - `latex-from-screenshot`
  - 配置命令标题、描述、图标
- **涉及文件**：
  - `package.json`
- **预估工作量**：15 分钟
- **依赖**：任务 2.1, 2.2

#### 任务 2.4：扩展配置界面显示 LaTeX 支持状态

- **目标**：在 Configure OCR 界面显示当前后端是否支持 LaTeX 识别
- **输入**：
  - 当前后端实例
  - `supportsMode()` 方法
- **输出**：
  - 在配置详情中显示 "LaTeX Recognition: ✓ Supported / ✗ Not Supported"
  - 如果不支持，提示切换到 OpenAI 或 Gemini 后端
- **涉及文件**：
  - `src/configure-ocr.tsx`
- **预估工作量**：30 分钟
- **依赖**：任务 1.2, 1.3, 1.4

### 阶段 3：测试与优化

#### 任务 3.1：准备测试用例

- **目标**：创建多样化的数学公式图片测试集
- **输入**：无
- **输出**：
  - 测试图片集合（10-15 张），包含：
    - 简单公式（$E=mc^2$）
    - 复杂公式（积分、求和、矩阵）
    - 手写公式
    - 多个公式的图片
    - 混合文字和公式的图片
  - 对应的预期 LaTeX 输出
- **涉及文件**：
  - `tests/fixtures/latex-images/`（新建目录）
  - `tests/fixtures/expected-results.json`（新建）
- **预估工作量**：1 小时
- **依赖**：无

#### 任务 3.2：功能测试和 Prompt 优化

- **目标**：测试识别准确率，优化 Prompt
- **输入**：测试用例集
- **输出**：
  - 测试报告（准确率、失败案例分析）
  - 优化后的 Prompt 模板
  - 边界情况处理逻辑
- **涉及文件**：
  - `src/backends/openai-vlm.ts` (Prompt 优化)
  - `src/backends/gemini-vlm.ts` (Prompt 优化)
  - `tests/latex-recognition.test.ts`（新建）
- **预估工作量**：2 小时
- **依赖**：任务 3.1, 阶段 1 和 2 的所有任务

#### 任务 3.3：错误处理和用户提示优化

- **目标**：完善错误处理，提供清晰的用户提示
- **输入**：测试中发现的问题
- **输出**：
  - 针对 LaTeX 识别的专用错误类型
  - 用户友好的错误提示文案
  - 降级策略（识别失败时的建议）
- **涉及文件**：
  - `src/backends/types.ts` (新增错误类型)
  - `src/latex-from-clipboard.tsx` (错误处理)
  - `src/latex-from-screenshot.tsx` (错误处理)
- **预估工作量**：1 小时
- **依赖**：任务 3.2

#### 任务 3.4：性能优化

- **目标**：优化识别速度和用户体验
- **输入**：性能测试数据
- **输出**：
  - 优化图片传输大小（压缩/缩放策略）
  - 优化超时设置
  - 添加进度提示
- **涉及文件**：
  - `src/backends/openai-vlm.ts`
  - `src/backends/gemini-vlm.ts`
  - `src/latex-from-clipboard.tsx`
  - `src/latex-from-screenshot.tsx`
- **预估工作量**：1 小时
- **依赖**：任务 3.2

#### 任务 3.5：更新文档

- **目标**：更新 README 和用户文档
- **输入**：已完成的功能
- **输出**：
  - README.md 添加 LaTeX 识别功能说明
  - 使用示例和最佳实践
  - 常见问题解答
- **涉及文件**：
  - `README.md`
- **预估工作量**：30 分钟
- **依赖**：任务 3.3, 3.4

---

## 需要进一步明确的问题

### 问题 1：LaTeX 识别方法集成方式

**描述**：如何在现有接口中添加 LaTeX 识别功能？

**推荐方案**：

- **方案 A（推荐）**：扩展接口，添加专用方法
  - 优点：接口清晰，职责明确，易于维护，支持未来扩展更多识别模式
  - 缺点：需要修改接口定义，所有实现类都需要更新
  - 实现：`interface IOCRBackend { recognizeLaTeX(imagePath: string): Promise<string>; }`

- **方案 B**：通过参数控制识别模式
  - 优点：向后兼容，不破坏现有接口
  - 缺点：接口语义不够明确，可能导致参数传递复杂化
  - 实现：`recognizeText(imagePath: string, options?: { mode: 'text' | 'latex' })`

**等待用户选择**：
```
请选择您偏好的方案，或提供其他建议：
[ ] 方案 A - 扩展接口添加专用方法（推荐）
[ ] 方案 B - 通过参数控制识别模式
[ ] 其他方案：_______________________
```

---

### 问题 2：LaTeX 输出格式

**描述**：识别结果应该如何格式化输出？

**推荐方案**：

- **方案 A（推荐）**：保留数学环境标记（$ 或 $$）
  - 优点：可直接粘贴到支持 LaTeX 的编辑器（Notion、Obsidian），即时渲染
  - 缺点：某些场景需要手动移除标记
  - 示例：`$E = mc^2$` 或 `$$\int_{0}^{\infty} e^{-x} dx$$`

- **方案 B**：仅输出纯 LaTeX 代码，不含环境标记
  - 优点：更灵活，用户可根据需要添加环境
  - 缺点：需要额外步骤才能在编辑器中使用
  - 示例：`E = mc^2` 或 `\int_{0}^{\infty} e^{-x} dx`

- **方案 C**：提供两种输出选项（通过配置切换）
  - 优点：灵活性最高，满足不同场景需求
  - 缺点：增加配置复杂度和开发工作量
  - 实现：在 preferences 中添加 `latexOutputFormat: "with-markers" | "raw"`

**等待用户选择**：
```
请选择您偏好的方案：
[ ] 方案 A - 保留数学环境标记（推荐，开箱即用）
[ ] 方案 B - 仅输出纯 LaTeX 代码
[ ] 方案 C - 提供两种输出选项（可配置）
[ ] 其他方案：_______________________
```

---

### 问题 3：对于不支持 LaTeX 的后端（Vision API）如何处理

**描述**：用户选择 Vision API 后端时，尝试使用 LaTeX 识别命令应该如何响应？

**推荐方案**：

- **方案 A（推荐）**：显示友好提示，引导用户切换后端
  - 实现：识别时检查 `supportsMode(RecognitionMode.LATEX)`，如果返回 false，显示 Toast：
    - "LaTeX 识别需要 OpenAI 或 Gemini 后端，请在设置中切换后端"
    - 提供快速跳转到配置界面的按钮
  - 优点：用户体验友好，引导明确
  - 缺点：需要额外的检查逻辑

- **方案 B**：回退到普通文字识别
  - 实现：自动调用 `recognizeText()` 而不是 `recognizeLaTeX()`
  - 优点：功能降级平滑，不中断用户流程
  - 缺点：可能产生混淆（用户期望 LaTeX 但得到纯文字）

- **方案 C**：在命令列表中根据后端类型动态显示/隐藏 LaTeX 命令
  - 实现：通过 Raycast 的条件渲染机制，仅在支持的后端启用 LaTeX 命令
  - 优点：避免用户看到不可用的功能
  - 缺点：Raycast 可能不支持动态命令，实现复杂

**等待用户选择**：
```
请选择您偏好的方案：
[ ] 方案 A - 显示友好提示，引导切换后端（推荐）
[ ] 方案 B - 回退到普通文字识别
[ ] 方案 C - 动态显示/隐藏命令（如果技术上可行）
[ ] 其他方案：_______________________
```

---

### 问题 4：LaTeX 识别的 Prompt 优化策略

**描述**：如何处理识别结果的质量和一致性问题？

**推荐方案**：

- **方案 A（推荐）**：使用多轮优化策略
  - 第一步：使用基础 Prompt 识别
  - 第二步：对结果进行语法验证
  - 第三步：如果验证失败，使用改进的 Prompt 重试一次
  - 优点：提高准确率，处理边界情况
  - 缺点：增加 API 调用次数和响应时间（仅在首次失败时）

- **方案 B**：单次识别 + 客户端后处理
  - 使用优化的单次 Prompt
  - 在客户端进行语法修复和格式化
  - 优点：速度快，成本低
  - 缺点：复杂公式可能需要多次尝试

- **方案 C**：提供"高级模式"选项
  - 默认使用快速模式（单次识别）
  - 用户可选择高精度模式（多轮验证）
  - 优点：平衡速度和准确率，用户可控
  - 缺点：增加配置复杂度

**等待用户选择**：
```
请选择您偏好的方案：
[ ] 方案 A - 多轮优化策略（首次失败时重试）
[ ] 方案 B - 单次识别 + 客户端后处理（推荐）
[ ] 方案 C - 提供高级模式选项
[ ] 其他方案：_______________________
```

---

## 用户反馈区域

请在此区域补充您对整体规划的意见和建议：

```
用户补充内容：












```

---

## 技术考量

### 代码组织原则

**遵循 SOLID 原则**：
- **单一职责**：LaTeX 格式化工具独立于识别逻辑
- **开闭原则**：通过接口扩展支持新的识别模式，无需修改现有代码
- **里氏替换**：所有后端实现可互换使用
- **接口隔离**：`recognizeLaTeX` 作为独立方法，不影响现有 `recognizeText`
- **依赖倒置**：命令依赖 `IOCRBackend` 抽象，不依赖具体实现

**复用现有代码（DRY）**：
- 复用 `getClipboardImagePath()` 和 `cleanupTempFile()` 工具函数
- 复用 `OCRBackendFactory` 创建后端实例
- 复用错误处理机制（`OCRError`、`handleOCRError`）
- 复用图片预处理逻辑（`prepareImage()`）

**保持简洁（KISS）**：
- LaTeX 识别本质是带专用 Prompt 的图片识别
- 避免引入复杂的 LaTeX 解析库
- 客户端处理保持轻量（基础清理和验证）

**避免过度设计（YAGNI）**：
- 暂不实现 LaTeX 实时预览
- 暂不实现 LaTeX 编辑器集成
- 暂不实现复杂的公式库和模板系统
- 先满足核心需求，后续根据用户反馈迭代

### 扩展性考虑

**未来可能的扩展**：
1. **多公式批量识别**：一次识别多张图片
2. **LaTeX 编辑和校正**：提供简单的编辑界面
3. **公式历史记录**：保存识别历史，快速复用
4. **自定义 Prompt 模板**：允许用户调整 Prompt 以适应特定场景
5. **支持更多数学符号集**：化学公式、物理符号等

### 维护性考虑

**测试策略**：
- 单元测试：LaTeX 格式化工具函数
- 集成测试：端到端的识别流程
- 回归测试：确保不影响现有 OCR 功能

**文档要求**：
- 代码注释：解释 Prompt 设计思路
- README 更新：使用指南和最佳实践
- 示例：常见公式的识别示例

**错误监控**：
- 记录识别失败的情况（不含图片内容，保护隐私）
- 收集用户反馈以优化 Prompt
- 监控 API 调用成功率和响应时间

---

## 验收标准

### 功能完整性

- [ ] OpenAI Vision 后端支持 LaTeX 识别
- [ ] Gemini Vision 后端支持 LaTeX 识别
- [ ] Vision API 后端正确提示不支持 LaTeX
- [ ] "LaTeX from Clipboard" 命令正常工作
- [ ] "LaTeX from Screenshot" 命令正常工作
- [ ] 识别结果自动复制到剪贴板
- [ ] 配置界面显示 LaTeX 支持状态

### 质量标准

- [ ] **准确率**：常见数学公式识别准确率 ≥ 85%
- [ ] **响应时间**：平均识别时间 < 10 秒（OpenAI）/ < 6 秒（Gemini）
- [ ] **鲁棒性**：能处理图片不清晰、倾斜、包含噪声等情况
- [ ] **错误处理**：所有错误都有友好的用户提示
- [ ] **代码质量**：通过 ESLint 检查，无 TypeScript 类型错误

### 测试场景

#### 基础功能测试

1. **简单公式识别**
   - 输入：$E = mc^2$ 的图片
   - 预期：正确识别为 `$E = mc^2$`

2. **复杂公式识别**
   - 输入：包含积分、求和、分数的复杂公式
   - 预期：正确识别所有元素和结构

3. **手写公式识别**
   - 输入：手写的数学公式照片
   - 预期：能识别主要元素（允许部分符号识别误差）

4. **多公式识别**
   - 输入：包含多个独立公式的图片
   - 预期：按顺序识别所有公式，保持布局

5. **混合内容识别**
   - 输入：包含文字说明和公式的图片
   - 预期：正确提取公式部分

#### 边界情况测试

6. **无公式图片**
   - 输入：纯文字图片（无数学公式）
   - 预期：提示 "未检测到数学公式"

7. **模糊图片**
   - 输入：分辨率很低或模糊的公式图片
   - 预期：尽力识别或提示图片质量问题

8. **大图片处理**
   - 输入：高分辨率截图（>10MB）
   - 预期：能正常处理或提示图片过大

#### 后端兼容性测试

9. **Vision API 后端**
   - 操作：选择 Vision API 后端，执行 LaTeX 识别命令
   - 预期：显示友好提示，引导切换到支持的后端

10. **OpenAI 后端**
    - 操作：使用 OpenAI 后端识别 LaTeX
    - 预期：正确调用 API，返回格式化的 LaTeX 代码

11. **Gemini 后端**
    - 操作：使用 Gemini 后端识别 LaTeX
    - 预期：正确调用 API，返回格式化的 LaTeX 代码

#### 错误处理测试

12. **API Key 无效**
    - 操作：使用无效的 API Key
    - 预期：显示清晰的错误提示，引导配置 API Key

13. **网络错误**
    - 操作：断网情况下执行识别
    - 预期：提示网络错误，建议检查连接

14. **剪贴板无图片**
    - 操作：剪贴板为空或仅包含文字时执行命令
    - 预期：提示"剪贴板中没有图片"

---

## 实施时间估算

| 阶段 | 任务数 | 预估总时长 |
|------|--------|-----------|
| **阶段 1：核心功能实现** | 5 个任务 | 4.5 小时 |
| **阶段 2：用户界面开发** | 4 个任务 | 2.75 小时 |
| **阶段 3：测试与优化** | 5 个任务 | 5.5 小时 |
| **总计** | **14 个任务** | **约 12.75 小时** |

**说明**：
- 以上为纯开发时间估算，不包括需求讨论、代码审查等时间
- 实际时间可能因 Prompt 调优、测试迭代而有所增加
- 建议分 3-4 个工作日完成，每日 3-4 小时开发时间

---

## 风险识别和应对策略

### 风险 1：LaTeX 识别准确率不达标

**可能性**：中等

**影响**：高（核心功能价值降低）

**应对策略**：
1. **Prompt 迭代优化**：准备多版本 Prompt，A/B 测试找出最优版本
2. **多后端对比**：测试 OpenAI 和 Gemini 的识别效果，推荐更优后端
3. **用户反馈循环**：收集识别失败案例，持续优化
4. **降级方案**：提供"重新识别"和"编辑结果"功能

### 风险 2：API 成本超出预期

**可能性**：低（用户自付费）

**影响**：中等（影响用户体验）

**应对策略**：
1. **成本提示**：在配置界面显示预估成本
2. **推荐 Gemini**：默认推荐成本更低的 Gemini 后端
3. **图片优化**：压缩图片大小以降低 token 消耗
4. **本地缓存**：避免重复识别相同图片（可选功能）

### 风险 3：Vision API 返回格式不一致

**可能性**：中等

**影响**：中等（需要更多后处理逻辑）

**应对策略**：
1. **强化 Prompt**：明确要求输出格式
2. **后处理增强**：`latex-formatter.ts` 处理各种格式变体
3. **格式验证**：识别后验证 LaTeX 语法，不合规则重试
4. **用户编辑**：未来版本提供编辑功能，允许手动修正

### 风险 4：影响现有 OCR 功能

**可能性**：低

**影响**：高（破坏现有功能）

**应对策略**：
1. **接口隔离**：新增方法，不修改现有方法签名
2. **回归测试**：确保现有 OCR 命令不受影响
3. **渐进式开发**：先完成后端扩展，再添加新命令
4. **版本控制**：使用 Git 分支隔离开发，充分测试后合并

---

## 下一步行动

1. **明确待决策问题**：请用户反馈上述 4 个待明确问题的方案选择
2. **细化技术方案**：根据用户反馈调整实现细节
3. **启动阶段 1 开发**：从接口扩展和后端实现开始
4. **准备测试数据**：并行收集测试用例图片
5. **迭代优化 Prompt**：在开发过程中持续测试和优化

---

**文档版本**：v1.0
**创建时间**：2025-11-04
**最后更新**：2025-11-04
**作者**：AI Planning Assistant
