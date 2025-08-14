/// <reference lib="webworker" />

export type Align = "start" | "center" | "end";
export type Orientation = "vertical" | "horizontal";

type WmPosition = "tl" | "tr" | "bl" | "br" | "center";

export type StitchRequest = {
  id: string;
  images: string[]; // data URLs
  options: {
    orientation: Orientation;
    align: Align;
    gap: number;
    gapColor: string;
    outerPadding: number;
    transparentBg: boolean;
    bgColor: string;
    format: "png" | "jpeg" | "webp";
    quality: number;
    uniformItemWidth: number | "";
    uniformItemHeight: number | "";
    maxOutputWidth: number | "";
    maxOutputHeight: number | "";
    borderRadius: number;
    borderWidth: number;
    borderColor: string;
    wmText: string;
    wmOpacity: number;
    wmRotate: number;
    wmPosition: WmPosition;
    wmTile: boolean;
    wmImageDataUrl?: string;
    wmImageScale: number;
    wmImageOpacity?: number;
    wmImageOffsetX?: number;
    wmImageOffsetY?: number;
  };
};

const cancelled = new Set<string>();

export type StitchResponse =
  | { id: string; type: "progress"; value: number }
  | { id: string; type: "result"; blob: Blob }
  | { id: string; type: "cancelled" }


  | { id: string; type: "error"; message: string };

type CancelMessage = { id: string; type: "cancel" };

function post(msg: StitchResponse) {

  (self as unknown as { postMessage: (m: StitchResponse) => void }).postMessage(
    msg
  );
}

async function dataUrlToImageBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  return bmp;
}

function roundRectPath(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawWatermark(
  base: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
  options: {
    type: "text" | "image";
    text?: string;
    image?: ImageBitmap;
    opacity?: number;
    position?: WmPosition;
    font?: string;
    color?: string;
    rotateDeg?: number;
    margin?: number;
    scale?: number;
    tile?: boolean;
    offsetX?: number;
    offsetY?: number;
  }
) {
  const {
    type,
    text,
    image,
    opacity = 0.3,
    position = "br",
    font = "16px sans-serif",
    color = "#000",
    rotateDeg = 0,
    margin = 16,
    scale = 0.2,
    tile = false,
    offsetX = 0,
    offsetY = 0,
  } = options;
  ctx.save();
  ctx.globalAlpha = opacity;
  if (type === "text" && text) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const textH = 16;
    const drawAt = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x + offsetX, y + offsetY);
      if (rotateDeg) ctx.rotate((rotateDeg * Math.PI) / 180);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    if (tile) {
      const step = Math.max(textW, textH) * 3;
      for (let y = 0; y < base.height + step; y += step) {
        for (let x = 0; x < base.width + step; x += step) {
          drawAt(x, y);
        }
      }
    } else {
      let x = base.width - margin - textW / 2;
      let y = base.height - margin - textH / 2;
      if (position === "tl") {
        x = margin + textW / 2;
        y = margin + textH / 2;
      } else if (position === "tr") {
        x = base.width - margin - textW / 2;
        y = margin + textH / 2;
      } else if (position === "bl") {
        x = margin + textW / 2;
        y = base.height - margin - textH / 2;
      } else if (position === "center") {
        x = base.width / 2;
        y = base.height / 2;
      }
      drawAt(x, y);
    }
  } else if (type === "image" && image) {
    const targetW = base.width * scale;
    const ratio = targetW / image.width;
    const w = targetW;
    const h = image.height * ratio;
    const drawAt = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x + offsetX, y + offsetY);
      if (rotateDeg) ctx.rotate((rotateDeg * Math.PI) / 180);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.restore();
    };
    if (tile) {
      const step = Math.max(w, h) * 2.5;
      for (let y = 0; y < base.height + step; y += step) {
        for (let x = 0; x < base.width + step; x += step) {
          drawAt(x, y);
        }
      }
    } else {
      let x = base.width - w / 2 - 16;
      let y = base.height - h / 2 - 16;
      if (position === "tl") {
        x = w / 2 + 16;
        y = h / 2 + 16;
      } else if (position === "tr") {
        x = base.width - w / 2 - 16;
        y = h / 2 + 16;
      } else if (position === "bl") {
        x = w / 2 + 16;
        y = base.height - h / 2 - 16;
      } else if (position === "center") {
        x = base.width / 2;
        y = base.height / 2;
      }
      drawAt(x, y);
    }
  }
  ctx.restore();
}

async function handleRequest(req: StitchRequest) {
  try {
    const { images, options } = req;
    const {
      orientation,
      align,
      gap,
      gapColor,
      outerPadding,
      transparentBg,
      bgColor,
      format,
      quality,
      uniformItemWidth,
      uniformItemHeight,
      maxOutputWidth,
      maxOutputHeight,
      borderRadius,
      borderWidth,
      borderColor,
      wmText,
      wmOpacity,
      wmRotate,
      wmPosition,
      wmTile,
      wmImageDataUrl,
      wmImageScale,
      wmImageOpacity,
      wmImageOffsetX,
      wmImageOffsetY,
    } = options;

    // Load all images into ImageBitmap
    const bitmaps = await Promise.all(images.map((u) => dataUrlToImageBitmap(u)));

    // Compute per-image target size (uniform options)
    const sized = bitmaps.map((bmp) => {
      const w = bmp.width;
      const h = bmp.height;
      let tw = w;
      let th = h;
      if (typeof uniformItemWidth === "number") {
        tw = uniformItemWidth;
        th = Math.round((uniformItemWidth / w) * h);
      }
      if (typeof uniformItemHeight === "number") {
        th = uniformItemHeight;
        tw = Math.round((uniformItemHeight / h) * w);
      }
      return { bmp, tw, th };
    });

    // Compute overall size before scale
    let rawW = 0;
    let rawH = 0;
    if (orientation === "vertical") {
      rawW = sized.reduce((m, it) => Math.max(m, it.tw), 0);
      rawH = sized.reduce((sum, it) => sum + it.th, 0) + gap * (sized.length - 1);
    } else {
      rawW = sized.reduce((sum, it) => sum + it.tw, 0) + gap * (sized.length - 1);
      rawH = sized.reduce((m, it) => Math.max(m, it.th), 0);
    }

    // Global scale based on maxOutput
    let scale = 1;
    if (typeof maxOutputWidth === "number" && rawW > maxOutputWidth)
      scale = Math.min(scale, maxOutputWidth / rawW);
    if (typeof maxOutputHeight === "number" && rawH > maxOutputHeight)
      scale = Math.min(scale, maxOutputHeight / rawH);

    const finalW = Math.max(1, Math.round(rawW * scale));
    const finalH = Math.max(1, Math.round(rawH * scale));

    const pad = Math.max(0, outerPadding);
    const checkCancelled = () => {
      if (cancelled.has(req.id)) {
        throw new Error("cancelled");
      }
    };
    checkCancelled();

    const paddedW = finalW + pad * 2;
    const paddedH = finalH + pad * 2;

    const canvas = new OffscreenCanvas(paddedW, paddedH);
    const ctx = canvas.getContext("2d")!;

    // Background
    if (transparentBg) {
      ctx.clearRect(0, 0, paddedW, paddedH);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, paddedW, paddedH);
    }

    // Content
    const scaledGap = Math.round(gap * scale);
    ctx.save();
    ctx.translate(pad, pad);

    if (borderRadius > 0) {
      roundRectPath(ctx, 0, 0, finalW, finalH, borderRadius);
      ctx.clip();
    }

    if (orientation === "vertical") {
      let y = 0;
      for (let i = 0; i < sized.length; i++) {
        const it = sized[i];
        const dw = Math.max(1, Math.round(it.tw * scale));
        const dh = Math.max(1, Math.round(it.th * scale));
        const x =
          align === "start"
            ? 0
            : align === "center"
              ? Math.round((finalW - dw) / 2)
              : finalW - dw;
        if (i > 0 && scaledGap > 0) {
          ctx.fillStyle = gapColor;
          ctx.fillRect(0, y, finalW, scaledGap);
          y += scaledGap;
        }
        ctx.drawImage(it.bmp, 0, 0, it.tw, it.th, x, y, dw, dh);
        y += dh;
        checkCancelled();
        post({ id: req.id, type: "progress", value: (i + 1) / sized.length });
      }
    } else {
      let x = 0;
      for (let i = 0; i < sized.length; i++) {
        const it = sized[i];
        const dw = Math.max(1, Math.round(it.tw * scale));
        const dh = Math.max(1, Math.round(it.th * scale));
        const y =
          align === "start"
            ? 0
            : align === "center"
              ? Math.round((finalH - dh) / 2)
              : finalH - dh;
        if (i > 0 && scaledGap > 0) {
          ctx.fillStyle = gapColor;
          ctx.fillRect(x, 0, scaledGap, finalH);
          x += scaledGap;
        }
        ctx.drawImage(it.bmp, 0, 0, it.tw, it.th, x, y, dw, dh);
        x += dw;
        checkCancelled();
        post({ id: req.id, type: "progress", value: (i + 1) / sized.length });
      }
    }

    // Optional stroke border
    if (borderWidth > 0) {
      ctx.save();
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = borderColor;
      roundRectPath(ctx, 0, 0, finalW, finalH, borderRadius);
      ctx.stroke();
      ctx.restore();
    }

    // Watermarks
    if (wmText) {
      drawWatermark(canvas, ctx, {
        type: "text",
        text: wmText,
        opacity: wmOpacity,
        rotateDeg: wmRotate,
        position: wmPosition,
        tile: wmTile,
      });
    }
    if (wmImageDataUrl) {
      const wmBmp = await dataUrlToImageBitmap(wmImageDataUrl);
      drawWatermark(canvas, ctx, {
        type: "image",
        image: wmBmp,
        opacity: wmImageOpacity ?? wmOpacity,
        rotateDeg: wmRotate,
        position: wmPosition,
        tile: wmTile,
        scale: wmImageScale,
        offsetX: wmImageOffsetX,
        offsetY: wmImageOffsetY,
      });
      if (cancelled.has(req.id)) {
        post({ id: req.id, type: "cancelled" });
        cancelled.delete(req.id);
        return;
      }
    }

    const mime =
      format === "png"
        ? "image/png"
        : format === "webp"
          ? "image/webp"
          : "image/jpeg";

    const blob = await canvas.convertToBlob({ type: mime, quality });
    post({ id: req.id, type: "result", blob });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    post({ id: req.id, type: "error", message });
  }
}

self.onmessage = (ev: MessageEvent<StitchRequest | CancelMessage>) => {
  const data = ev.data as StitchRequest | CancelMessage;
  if ((data as CancelMessage).type === "cancel") {
    const id = (data as CancelMessage).id;
    if (id) cancelled.add(id);
    return;
  }
  handleRequest(data as StitchRequest);
};

