/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

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

