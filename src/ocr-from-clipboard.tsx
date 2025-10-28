import { Clipboard, showToast, Toast, showHUD } from "@raycast/api";
import { recognizeTextFromImage } from "./utils/vision-ocr";
import { getClipboardImagePath, cleanupTempFile } from "./utils/clipboard";

export default async function Command() {
  let tempFilePath: string | null = null;

  try {
    // Show loading toast
    await showToast({
      style: Toast.Style.Animated,
      title: "正在识别图片中的文字...",
    });

    // Get image from clipboard
    tempFilePath = await getClipboardImagePath();

    if (!tempFilePath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "剪贴板中没有图片",
        message: "请先复制或截图一张包含文字的图片",
      });
      return;
    }

    // Recognize text
    const recognizedText = await recognizeTextFromImage(tempFilePath);

    if (!recognizedText || recognizedText.trim().length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "未识别到文字",
        message: "图片中可能没有文字，或文字不够清晰",
      });
      return;
    }

    // Copy to clipboard
    await Clipboard.copy(recognizedText);

    // Show success message with preview
    const preview = recognizedText.length > 100 ? recognizedText.substring(0, 100) + "..." : recognizedText;

    await showHUD(`✓ 已复制识别结果: ${preview}`);
  } catch (error) {
    console.error("OCR Error:", error);

    await showToast({
      style: Toast.Style.Failure,
      title: "识别失败",
      message: error instanceof Error ? error.message : "未知错误，请重试",
    });
  } finally {
    // Clean up temporary file
    if (tempFilePath && tempFilePath.startsWith("/tmp/raycast-ocr")) {
      await cleanupTempFile(tempFilePath);
    }
  }
}
