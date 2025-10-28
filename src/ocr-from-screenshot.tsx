import { Clipboard, showToast, Toast, showHUD, closeMainWindow } from "@raycast/api";
import { recognizeTextFromImage } from "./utils/vision-ocr";
import { takeScreenshot, cleanupTempFile } from "./utils/clipboard";
import { access } from "fs/promises";

export default async function Command() {
  let tempFilePath: string | null = null;

  try {
    // Show instruction toast
    await showToast({
      style: Toast.Style.Animated,
      title: "请选择要识别的屏幕区域...",
      message: "按 ESC 键可取消",
    });

    // Hide Raycast window before taking screenshot to avoid capturing it
    await closeMainWindow();

    // Wait a bit for the window to close smoothly
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Take screenshot
    tempFilePath = await takeScreenshot();

    // Check if user cancelled (file doesn't exist)
    try {
      await access(tempFilePath);
    } catch {
      await showHUD("已取消截图");
      return;
    }

    // Show recognizing toast
    await showToast({
      style: Toast.Style.Animated,
      title: "正在识别截图中的文字...",
    });

    // Recognize text
    const recognizedText = await recognizeTextFromImage(tempFilePath);

    if (!recognizedText || recognizedText.trim().length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "未识别到文字",
        message: "截图中可能没有文字，或文字不够清晰",
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

    // Don't show error if user cancelled
    if (error instanceof Error && error.message.includes("cancelled")) {
      return;
    }

    await showToast({
      style: Toast.Style.Failure,
      title: "识别失败",
      message: error instanceof Error ? error.message : "未知错误，请重试",
    });
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath);
    }
  }
}
