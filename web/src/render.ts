import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny';
import type { Template } from '@velohud/shared';
import { sampleAt, type Activity } from './telemetry.js';
import { fitShareSize } from './widgets.js';
import { drawOverlay } from './overlay.js';
import { t } from './i18n.js';
import type { Units } from './format.js';

export interface RenderOptions {
  file: Blob;
  activity: Activity;
  offsetSec: number;
  template: Template;
  units: Units;
  includeAudio: boolean;
  /** Trim range in seconds of the source timeline. Defaults to the full video. */
  trimStart?: number;
  trimEnd?: number | null;
  /**
   * File stream for direct-to-disk output (File System Access API). When set,
   * encoded data streams to the file as it is produced and RAM stays flat;
   * when omitted, the whole file is buffered in memory (ceiling: long clips).
   */
  saveStream?: FileSystemWritableFileStream;
  /** Optional visible canvas: doubles as live render preview. */
  canvas?: HTMLCanvasElement;
  onProgress?: (renderedSec: number, totalSec: number) => void;
}

function drawSample(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sample: VideoSample,
): void {
  // sample.draw() already applies rotation, flip and aspect adjustments, and
  // the canvas is sized to displayWidth/displayHeight, so a plain fill is
  // exact. A manual transform here would rotate the frame twice.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  sample.draw(ctx, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// ponytail: passthrough only for AAC/MP3; other input codecs lose their audio track
// silently — upgrade by decoding/re-encoding via AudioBufferSource.
const PASSTHROUGH_AUDIO = new Set(['aac', 'mp3']);

/**
 * Full-frame render: decode → paint frame + telemetry overlay → encode → mux.
 * Audio is copied packet-by-packet (no re-encode) when the codec allows it.
 * Returns the rendered file, or null when it streamed straight to disk
 * (finalize closes the file stream, so the video is already saved).
 */
export async function renderVideo(options: RenderOptions): Promise<Blob | null> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(options.file) });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error(t('err.noVideoTrack'));
    const duration = await input.computeDuration([videoTrack]);
    const start = Math.min(Math.max(options.trimStart ?? 0, 0), duration);
    const end = Math.min(Math.max(options.trimEnd ?? duration, 0), duration);
    if (!(end > start)) throw new Error(t('err.badTrim'));
    const outDuration = end - start;

    const sink = new VideoSampleSink(videoTrack);
    const firstTimestamp = await input.getFirstTimestamp([videoTrack]);
    const probe = await sink.getSample(firstTimestamp);
    if (!probe) throw new Error(t('err.noFrame'));
    const frameW = probe.displayWidth;
    const frameH = probe.displayHeight;
    probe.close();

    const canvas = options.canvas ?? document.createElement('canvas');
    canvas.width = frameW;
    canvas.height = frameH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('err.noCanvas'));

    const saveStream = options.saveStream ?? null;
    const target =
      saveStream === null
        ? new BufferTarget()
        : new StreamTarget(saveStream, { chunked: true });
    const output = new Output({
      // ponytail: 'in-memory' fast-start holds the whole file in RAM (ceiling: long
      // high-res clips); the disk path below avoids it via sequential writes.
      // fastStart off on disk: plain moov-at-end MP4, friendliest to editors.
      format: new Mp4OutputFormat({ fastStart: saveStream === null ? 'in-memory' : false }),
      target,
    });
    const canvasSource = new CanvasSource(canvas, {
      codec: 'avc',
      // ponytail: fixed 'high' quality, no size/quality control; upgrade by exposing a quality option.
      quality: new Quality('high'),
    });
    output.addVideoTrack(canvasSource);

    let audioSource: EncodedAudioPacketSource | null = null;
    const audioTrack = options.includeAudio ? await input.getPrimaryAudioTrack() : null;
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    if (audioTrack && audioCodec && PASSTHROUGH_AUDIO.has(audioCodec)) {
      audioSource = new EncodedAudioPacketSource(audioCodec);
      output.addAudioTrack(audioSource);
    }
    await output.start();

    if (audioSource && audioTrack) {
      const decoderConfig = await audioTrack.getDecoderConfig();
      const packetSink = new EncodedPacketSink(audioTrack);
      let first = true;
      for await (const packet of packetSink.packets()) {
        const packetEnd = packet.timestamp + packet.duration;
        if (packetEnd <= start || packet.timestamp >= end) continue;
        const shifted = new EncodedPacket(
          packet.data,
          packet.type,
          packet.timestamp - start,
          packet.duration,
          packet.sequenceNumber,
          packet.byteLength,
          packet.sideData,
        );
        await audioSource.add(shifted, first && decoderConfig ? { decoderConfig } : undefined);
        first = false;
      }
    }

    let frames = 0;
    for await (const sample of sink.samples(start, end)) {
      try {
        drawSample(ctx, canvas, sample);
        const tt = sample.timestamp + options.offsetSec;
        const telemetry = sampleAt(options.activity, tt);
        drawOverlay(ctx, options.template, telemetry, canvas.width, canvas.height, options.units, {
          activity: options.activity,
          t: tt,
        });
        await canvasSource.add(sample.timestamp - start, sample.duration);
        frames += 1;
        options.onProgress?.(sample.timestamp - start, outDuration);
      } finally {
        sample.close();
      }
    }
    if (frames === 0) throw new Error(t('err.noFrames'));

    await output.finalize();
    if (target instanceof BufferTarget) {
      if (!target.buffer) throw new Error(t('err.noOutput'));
      return new Blob([target.buffer], { type: 'video/mp4' });
    }
    return null;
  } finally {
    input.dispose();
  }
}

export interface RenderImageOptions {
  /** Image bytes (PNG/JPEG/WebP). */
  file: Blob;
  activity: Activity;
  template: Template;
  units: Units;
  /** Count-up + route draw window; after it the frame holds static. */
  animSec: number;
  /** Total video length in seconds. */
  totalSec: number;
  saveStream?: FileSystemWritableFileStream;
  canvas?: HTMLCanvasElement;
  onProgress?: (renderedSec: number, totalSec: number) => void;
}

/**
 * Share render: a static image with animated totals drawn over a synthetic
 * 30 fps clock. No decode, no audio, no trim: `animSec` drives the count-up
 * and the route draw-on, the rest of `totalSec` holds the finished frame.
 */
export async function renderImage(options: RenderImageOptions): Promise<Blob | null> {
  const anim = Math.min(Math.max(options.animSec, 0.5), options.totalSec);
  const total = Math.max(options.totalSec, 1);
  const bitmap = await createImageBitmap(options.file);
  try {
    const { w: frameW, h: frameH } = fitShareSize(bitmap.width, bitmap.height);
    const canvas = options.canvas ?? document.createElement('canvas');
    canvas.width = frameW;
    canvas.height = frameH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('err.noCanvas'));

    const saveStream = options.saveStream ?? null;
    const target =
      saveStream === null
        ? new BufferTarget()
        : new StreamTarget(saveStream, { chunked: true });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: saveStream === null ? 'in-memory' : false }),
      target,
    });
    const canvasSource = new CanvasSource(canvas, { codec: 'avc', quality: new Quality('high') });
    output.addVideoTrack(canvasSource);
    await output.start();

    const FPS = 30;
    const frames = Math.max(1, Math.round(total * FPS));
    const endT = options.activity.durationSec;
    const endSample = sampleAt(options.activity, endT);
    for (let f = 0; f < frames; f += 1) {
      const tSec = f / FPS;
      const progress = Math.min(1, tSec / anim);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bitmap, 0, 0, frameW, frameH);
      drawOverlay(
        ctx,
        options.template,
        endSample,
        frameW,
        frameH,
        options.units,
        { activity: options.activity, t: endT },
        { progress },
      );
      await canvasSource.add(tSec, 1 / FPS);
      options.onProgress?.(tSec, total);
    }

    await output.finalize();
    if (target instanceof BufferTarget) {
      if (!target.buffer) throw new Error(t('err.noOutput'));
      return new Blob([target.buffer], { type: 'video/mp4' });
    }
    return null;
  } finally {
    bitmap.close();
  }
}
