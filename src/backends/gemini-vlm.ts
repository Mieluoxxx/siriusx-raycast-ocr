/**
 * Google Gemini Vision Language Model 后端实现
 * 支持 Gemini API 进行图片文字识别
 */

import { readFile } from "fs/promises";
import { IOCRBackend, OCRBackendConfig, OCRError, OCRErrorType } from "./types";

export class GeminiVLMBackend implements IOCRBackend {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;

  constructor(config: OCRBackendConfig) {
    this.apiKey = config.apiKey || "";
    this.apiEndpoint = config.apiEndpoint || "https://generativelanguage.googleapis.com/v1beta";
    this.model = config.model || "gemini-2.5-flash";
  }

  async recognizeText(imagePath: string): Promise<string> {
    // 验证配置
    if (!this.apiKey) {
      throw new OCRError(
        OCRErrorType.CONFIG_ERROR,
        "Gemini API Key is not configured. Please set it in extension preferences."
      );
    }

    try {
      // 1. 读取并转换图片
      const { base64Image, mimeType } = await this.prepareImage(imagePath);

      // 2. 构造 Gemini API 请求
      const url = `${this.apiEndpoint}/models/${this.model}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
                {
                  text: this.getOCRPrompt(),
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(60000), // 60s timeout
      });

      // 3. 处理 HTTP 错误
      if (!response.ok) {
        await this.handleAPIError(response);
      }

      // 4. 解析响应
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!text) {
        throw new OCRError(OCRErrorType.UNKNOWN, "No text content in API response");
      }

      return text.trim();
    } catch (error) {
      if (error instanceof OCRError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError" || error.message.includes("timeout")) {
          throw new OCRError(OCRErrorType.TIMEOUT, "Request timed out after 60 seconds");
        }

        if (error.message.includes("fetch")) {
          throw new OCRError(OCRErrorType.NETWORK_ERROR, "Network error: " + error.message);
        }
      }

      throw new OCRError(OCRErrorType.UNKNOWN, error instanceof Error ? error.message : "Unknown error");
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
      heic: "image/heic",
      heif: "image/heif",
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
      if (response.status === 400 && errorMessage.includes("API_KEY")) {
        errorType = OCRErrorType.API_KEY_INVALID;
        errorMessage = "Invalid API key. Please check your Gemini API key in settings.";
      } else if (response.status === 429) {
        errorType = OCRErrorType.QUOTA_EXCEEDED;
        errorMessage = "API quota exceeded or rate limit reached. Please try again later.";
      } else if (response.status >= 500) {
        errorType = OCRErrorType.NETWORK_ERROR;
        errorMessage = "Gemini server error. Please try again later.";
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

    // 简单验证 API Key 格式（Gemini API Key 以 AIza 开头）
    return this.apiKey.startsWith("AIza") && this.apiKey.length > 30;
  }

  getName(): string {
    return "Google Gemini Vision";
  }
}
