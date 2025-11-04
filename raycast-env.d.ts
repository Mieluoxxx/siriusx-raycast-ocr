/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** OCR Backend - Choose which OCR engine to use */
  "ocrBackend": "vision" | "openai" | "gemini",
  /** OpenAI API Key - Your OpenAI API key (only needed for OpenAI backend) */
  "openaiApiKey"?: string,
  /** API Endpoint - Custom OpenAI-compatible API endpoint (optional) */
  "openaiApiEndpoint": string,
  /** Model Name - OpenAI model to use for OCR */
  "openaiModel": string,
  /** Image Detail Level - Higher detail = better OCR accuracy but slower and more expensive */
  "openaiDetail": "high" | "auto" | "low",
  /** Gemini API Key - Your Google Gemini API key (only needed for Gemini backend) */
  "geminiApiKey"?: string,
  /** Gemini API Endpoint - Custom Gemini API endpoint (optional) */
  "geminiApiEndpoint": string,
  /** Gemini Model - Gemini model to use for OCR */
  "geminiModel": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `ocr-from-clipboard` command */
  export type OcrFromClipboard = ExtensionPreferences & {}
  /** Preferences accessible in the `ocr-from-screenshot` command */
  export type OcrFromScreenshot = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `ocr-from-clipboard` command */
  export type OcrFromClipboard = {}
  /** Arguments passed to the `ocr-from-screenshot` command */
  export type OcrFromScreenshot = {}
}

