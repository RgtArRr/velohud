export interface GateResult {
  ok: boolean;
  missing: string[];
}

/**
 * Feature-detection gate. Browsers without WebCodecs land here
 * instead of failing halfway through an upload.
 */
export function checkSupport(): GateResult {
  const missing: string[] = [];
  if (typeof VideoEncoder === 'undefined') missing.push('VideoEncoder (WebCodecs)');
  if (typeof VideoDecoder === 'undefined') missing.push('VideoDecoder (WebCodecs)');
  if (typeof EncodedVideoChunk === 'undefined') missing.push('EncodedVideoChunk (WebCodecs)');
  if (typeof OffscreenCanvas === 'undefined') missing.push('OffscreenCanvas');
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('2d')) missing.push('Canvas 2D');
  } catch {
    missing.push('Canvas 2D');
  }
  return { ok: missing.length === 0, missing };
}
