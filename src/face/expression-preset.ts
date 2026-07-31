/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

/**
 * The VRM 1.0 standard expression preset names (a standalone mirror of
 * three-vrm-core's `VRMExpressionPresetName`, so consumers don't have to import
 * the enum from the peer dep).
 *
 * These fall into four separated concerns — visemes, emotions, gaze, blink —
 * exposed as the grouped catalogs below. See the VRM spec:
 * https://github.com/vrm-c/vrm-specification (VRMC_vrm-1.0/expressions).
 */
export const VRMExpressionPreset = {
  // Vowels / visemes (lip-sync)
  Aa: "aa",
  Ih: "ih",
  Ou: "ou",
  Ee: "ee",
  Oh: "oh",
  // Emotions
  Happy: "happy",
  Angry: "angry",
  Sad: "sad",
  Relaxed: "relaxed",
  Surprised: "surprised",
  Neutral: "neutral",
  // Gaze (look direction)
  LookUp: "lookUp",
  LookDown: "lookDown",
  LookLeft: "lookLeft",
  LookRight: "lookRight",
  // Blink
  Blink: "blink",
  BlinkLeft: "blinkLeft",
  BlinkRight: "blinkRight",
} as const;

export type VRMExpressionPreset =
  (typeof VRMExpressionPreset)[keyof typeof VRMExpressionPreset];

/**
 * Vowel / viseme presets used for lip-sync. Weight each toward 1 to shape the
 * mouth. Driven by {@link VisemeController}.
 */
export const VISEME_PRESETS = ["aa", "ih", "ou", "ee", "oh"] as const;
export type VisemePreset = (typeof VISEME_PRESETS)[number];

/**
 * Emotion / mood presets. Driven by {@link EmotionController}. `neutral` is
 * kept for VRM 0.x backwards compatibility.
 */
export const EMOTION_PRESETS = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "neutral",
] as const;
export type EmotionPreset = (typeof EMOTION_PRESETS)[number];

/** Blink presets (both eyes + per-eye winks). Driven by {@link EyeController}. */
export const BLINK_PRESETS = ["blink", "blinkLeft", "blinkRight"] as const;
export type BlinkPreset = (typeof BLINK_PRESETS)[number];

/**
 * Gaze / look-direction presets. On models whose eyes move via expressions
 * rather than bones, {@link EyeController} drives these; otherwise it drives
 * the procedural `VRMLookAt`.
 */
export const GAZE_PRESETS = [
  "lookUp",
  "lookDown",
  "lookLeft",
  "lookRight",
] as const;
export type GazePreset = (typeof GAZE_PRESETS)[number];
