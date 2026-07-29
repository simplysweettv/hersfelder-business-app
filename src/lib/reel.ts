import sharp from "sharp";
import { createH264MP4Encoder } from "h264-mp4-encoder";
import {
  REEL_H,
  REEL_W,
  renderReelLayer,
  type ReelContent,
  type ReelLayerKey,
} from "./render-reel";

/**
 * Reel-Rendering (9:16 MP4) ohne ffmpeg.
 *
 * Warum kein ffmpeg: die Binary wiegt ~80 MB und müsste in jedes Serverless-
 * Bundle. `h264-mp4-encoder` ist reines WebAssembly (~1 MB) und encodiert
 * RGBA-Frames direkt zu H.264/MP4 — läuft damit auch auf Vercel.
 *
 * Ablauf pro Frame:
 *   Foto (Ken Burns: langsamer Zoom + Drift)
 *     → Marken-Ebenen darüber (gestaffelt eingeblendet)
 *     → RGBA an den Encoder
 *
 * Bewusste Einschränkung: das Video hat KEINE Tonspur. Instagram und TikTok
 * akzeptieren stumme Videos; Musik legen die Plattformen ohnehin lieber selbst
 * darüber (eigener Sound aus der Mediathek zählt dort als Ranking-Signal).
 */

const FPS = 24;
const DURATION_SEC = 7;

/** Zoomfahrt: startet weit, endet nah. Bewusst dezent — mehr wirkt billig. */
const ZOOM_FROM = 1.0;
const ZOOM_TO = 1.1;

/** Einblendfenster der drei Ebenen in Sekunden [Start, Ende]. */
const TIMELINE: Record<ReelLayerKey, [number, number]> = {
  base: [0.0, 0.6],
  headline: [0.9, 1.7],
  cta: [2.6, 3.3],
};

/** Weiche S-Kurve — lineare Blenden und Zooms wirken mechanisch. */
function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Deckkraft einer Ebene zum Zeitpunkt t, auf 20 Stufen gerundet (Cache-Treffer). */
function opacityAt(layer: ReelLayerKey, t: number): number {
  const [from, to] = TIMELINE[layer];
  if (t <= from) return 0;
  if (t >= to) return 1;
  return Math.round(smoothstep((t - from) / (to - from)) * 20) / 20;
}

/**
 * Multipliziert den Alphakanal eines PNG mit `opacity`.
 * `dest-in` behält das Ziel dort, wo die Quelle deckend ist — mit einer
 * einfarbigen Kachel der gewünschten Deckkraft ergibt das eine Ausblendung.
 */
async function fade(png: Buffer, opacity: number): Promise<Buffer> {
  if (opacity >= 1) return png;
  return sharp(png)
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

export type ReelResult = {
  /** Fertiges MP4 (H.264, 1080×1920, stumm) */
  mp4: Buffer;
  durationSec: number;
  width: number;
  height: number;
};

export async function createReel(opts: {
  /** Quellfoto: JPEG/PNG-Buffer oder data:-URL */
  photo: Buffer | string;
  content: ReelContent;
  durationSec?: number;
  fps?: number;
}): Promise<ReelResult> {
  const fps = opts.fps ?? FPS;
  const duration = opts.durationSec ?? DURATION_SEC;
  const frameCount = Math.round(duration * fps);

  const photoBuf =
    typeof opts.photo === "string"
      ? Buffer.from(opts.photo.replace(/^data:[^,]+,/, ""), "base64")
      : opts.photo;

  // Ebenen einmal rendern (teuer), danach nur noch Deckkraft variieren.
  const [baseLayer, headlineLayer, ctaLayer] = await Promise.all([
    renderReelLayer("base", opts.content),
    renderReelLayer("headline", opts.content),
    renderReelLayer("cta", opts.content),
  ]);
  const layers: Record<ReelLayerKey, Buffer> = {
    base: baseLayer,
    headline: headlineLayer,
    cta: ctaLayer,
  };

  // Foto einmal auf die maximale Zoomstufe bringen; pro Frame wird daraus nur
  // noch ein Ausschnitt gezogen. `attention` wählt den interessanten Bildteil
  // (bei Reportagefotos meist die Personen) statt stumpf der Mitte.
  const prepW = Math.round(REEL_W * ZOOM_TO);
  const prepH = Math.round(REEL_H * ZOOM_TO);
  const prepared = await sharp(photoBuf)
    .resize(prepW, prepH, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();

  // Zusammengesetzte Overlays zwischenspeichern: bei 20 Deckkraft-Stufen gibt
  // es nur eine Handvoll verschiedener Zustände, aber ~170 Frames.
  const overlayCache = new Map<string, Buffer | null>();
  async function overlayFor(t: number): Promise<Buffer | null> {
    const ops: [ReelLayerKey, number][] = [
      ["base", opacityAt("base", t)],
      ["headline", opacityAt("headline", t)],
      ["cta", opacityAt("cta", t)],
    ];
    const key = ops.map(([, o]) => o.toFixed(2)).join("|");
    const hit = overlayCache.get(key);
    if (hit !== undefined) return hit;

    const visible = ops.filter(([, o]) => o > 0);
    if (!visible.length) {
      overlayCache.set(key, null);
      return null;
    }
    const parts = await Promise.all(visible.map(([k, o]) => fade(layers[k], o)));
    const merged = await sharp({
      create: {
        width: REEL_W,
        height: REEL_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(parts.map((input) => ({ input })))
      .png()
      .toBuffer();
    overlayCache.set(key, merged);
    return merged;
  }

  const encoder = await createH264MP4Encoder();
  encoder.width = REEL_W;
  encoder.height = REEL_H;
  encoder.frameRate = fps;
  // 23 ist der Kompromiss, bei dem Serifen-Headlines noch scharf bleiben,
  // die Datei aber unter den Upload-Grenzen der Plattformen liegt.
  encoder.quantizationParameter = 23;
  encoder.initialize();

  try {
    for (let i = 0; i < frameCount; i++) {
      const t = i / fps;
      const progress = i / Math.max(1, frameCount - 1);

      // Ken Burns: Ausschnitt schrumpft von "ganzes Bild" auf "Zielformat".
      const zoom = ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * smoothstep(progress);
      const winW = Math.min(prepW, Math.round((REEL_W * ZOOM_TO) / zoom));
      const winH = Math.min(prepH, Math.round((REEL_H * ZOOM_TO) / zoom));
      // Leichte Drift nach oben: Gesichter sitzen meist im oberen Bilddrittel.
      const left = Math.max(0, Math.round((prepW - winW) * 0.5));
      const top = Math.max(0, Math.round((prepH - winH) * (0.5 - 0.18 * progress)));

      let frame = sharp(prepared)
        .extract({ left, top, width: winW, height: winH })
        .resize(REEL_W, REEL_H, { fit: "fill" });

      const overlay = await overlayFor(t);
      if (overlay) frame = frame.composite([{ input: overlay }]);

      const rgba = await frame.ensureAlpha().raw().toBuffer();
      encoder.addFrameRgba(new Uint8Array(rgba));
    }

    encoder.finalize();
    const mp4 = Buffer.from(encoder.FS.readFile(encoder.outputFilename));
    return { mp4, durationSec: duration, width: REEL_W, height: REEL_H };
  } finally {
    encoder.delete();
  }
}
