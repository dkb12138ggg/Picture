"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import exifr from "exifr";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import NextImage from "next/image";

const LS_KEY = "image-stitcher-settings-v1";
const PRESETS: Record<string, { w: number; h: number } | null> = {
  none: null,
  "1080x1920": { w: 1080, h: 1920 },
  "1920x1080": { w: 1920, h: 1080 },
  "1242x2208": { w: 1242, h: 2208 },
};
// Unified transition classes
const TRANSITION = "transition-all duration-300 ease-in-out transform-gpu";
const SHIFT_SHOW = "translate-y-0";
const SHIFT_HIDE_SM = "-translate-y-1";
const SHIFT_HIDE_MD = "-translate-y-2";

// {{RIPER-5+SMART-6:
//   Action: "Parallel-Added"
//   Task_ID: "nufAT7h5TWBGu6S2axUt4K"
// Create a rounded-rectangle path
function roundRectPath(
  ctx: CanvasRenderingContext2D,
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

//   Timestamp: "2025-08-13"
//   Authoring_Subagent: "react-frontend-expert"
//   Principle_Applied: "SOLID-S (Single Responsibility Principle)"
//   Quality_Check: "Build compiles; basic manual smoke done."
// }}
// {{START_MODIFICATIONS}}

type Orientation = "vertical" | "horizontal";
type Align = "start" | "center" | "end";
type OutputFormat = "png" | "jpeg" | "webp";

interface LoadedImage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Apply EXIF orientation to a dataURL by drawing onto a canvas
async function correctOrientation(
  dataUrl: string,
  orientation: number
): Promise<{ dataUrl: string } | null> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  // Set canvas size and transform based on EXIF orientation (1-8)
  switch (orientation) {
    case 2: // horizontal flip
      canvas.width = w;
      canvas.height = h;
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // 180°
      canvas.width = w;
      canvas.height = h;
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      break;

    case 4: // vertical flip
      canvas.width = w;
      canvas.height = h;
      ctx.translate(0, h);
      ctx.scale(1, -1);
      break;
    case 5: // vertical flip + 90° CW
      canvas.width = h;
      canvas.height = w;
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // 90° CW
      canvas.width = h;
      canvas.height = w;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -h);
      break;
    case 7: // horizontal flip + 90° CW
      canvas.width = h;
      canvas.height = w;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(w, -h);
      ctx.scale(-1, 1);
      break;
    case 8: // 90° CCW
      canvas.width = h;
      canvas.height = w;
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-w, 0);
      break;
    case 1:
    default:
      canvas.width = w;
      canvas.height = h;
      break;
  }

  ctx.drawImage(img, 0, 0);
  return { dataUrl: canvas.toDataURL() };
}

// Draw watermark on top of a canvas
function drawWatermark(
  base: HTMLCanvasElement,
  options: {
    type: "text" | "image";
    text?: string;
    image?: HTMLImageElement;
    opacity?: number;
    position?: "tl" | "tr" | "bl" | "br" | "center";
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
  const ctx = base.getContext("2d");
  if (!ctx) return;
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
    const textH = 16; // approx
    const drawAt = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      if (rotateDeg) ctx.rotate((rotateDeg * Math.PI) / 180);
      ctx.fillText(text!, 0, 0);
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
      ctx.translate(x, y);
      if (rotateDeg) ctx.rotate((rotateDeg * Math.PI) / 180);
      ctx.drawImage(image!, -w / 2, -h / 2, w, h);
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

async function fileToLoadedImage(file: File): Promise<LoadedImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // EXIF orientation correction (only for JPEG or if EXIF exists)
  try {
    const exif = await exifr.parse(await file.arrayBuffer(), true);
    // exifr returns orientation as a number (1-8) sometimes; if not present, skip
    if (exif && (exif.Orientation || exif.orientation)) {
      const orientation: number | undefined = (exif.Orientation ||
        exif.orientation) as number | undefined;
      if (orientation && orientation !== 1) {
        const corrected = await correctOrientation(dataUrl, orientation);
        if (corrected) {
          const fixedImg = await loadImage(corrected.dataUrl);
          return {
            id: crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            name: file.name,
            dataUrl: corrected.dataUrl,
            width: fixedImg.naturalWidth || fixedImg.width,
            height: fixedImg.naturalHeight || fixedImg.height,
          };
        }
      }
    }
  } catch (e) {
    // ignore EXIF parse errors
    console.warn("EXIF parse failed", e);
  }

  const img = await loadImage(dataUrl);
  return {
    id: crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: file.name,
    dataUrl,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

export default function ImageStitcher() {
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [orientation, setOrientation] = useState<Orientation>("vertical");
  const [align, setAlign] = useState<Align>("center");
  const [gap, setGap] = useState<number>(0);
  const [bgColor, setBgColor] = useState<string>("#ffffff");
  const [format, setFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState<number>(0.92);
  const [resultUrl, setResultUrl] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [useWorker, setUseWorker] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.useWorker === "boolean") return s.useWorker;
      }
    } catch {}
    return true;
  });
  const workerRef = useRef<Worker | null>(null);
  // Capability detection: OffscreenCanvas + createImageBitmap
  useEffect(() => {
    const g = globalThis as unknown as {
      OffscreenCanvas?: unknown;
      createImageBitmap?: unknown;
    };
    const okOffscreen = typeof g.OffscreenCanvas === "function";
    const okCreateImageBitmap = typeof g.createImageBitmap === "function";
    if (!okOffscreen || !okCreateImageBitmap) {
      setUseWorker(false);
      setBanner("当前环境不支持Worker加速，已回退到主线程");
    }
  }, []);

  useEffect(() => {
    if (!useWorker) return;
    if (workerRef.current) return;
    try {
      workerRef.current = new Worker(
        new URL("../workers/stitchWorker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (e) {
      console.warn("Worker init failed, fallback to main thread", e);
      workerRef.current = null;

      setUseWorker(false);
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [useWorker]);
  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setImages((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === String(active.id));
      const newIndex = prev.findIndex((i) => i.id === String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // scaling & watermark states
  const [uniformItemWidth, setUniformItemWidth] = useState<number | "">("");
  const [uniformItemHeight, setUniformItemHeight] = useState<number | "">("");
  const [maxOutputWidth, setMaxOutputWidth] = useState<number | "">(4096);
  const [borderRadius, setBorderRadius] = useState<number>(0);
  const [borderWidth, setBorderWidth] = useState<number>(0);
  const [borderColor, setBorderColor] = useState<string>("#e5e7eb");
  const [maxOutputHeight, setMaxOutputHeight] = useState<number | "">(8192);
  const [wmText, setWmText] = useState<string>("");
  const [wmOpacity, setWmOpacity] = useState<number>(0.2);
  const [wmRotate, setWmRotate] = useState<number>(-30);
  const [wmTile, setWmTile] = useState<boolean>(false);
  const [wmPosition, setWmPosition] = useState<
    "tl" | "tr" | "bl" | "br" | "center"
  >("br");
  const [transparentBg, setTransparentBg] = useState<boolean>(false);
  const [gapColor, setGapColor] = useState<string>("#ffffff");
  const [outerPadding, setOuterPadding] = useState<number>(0);
  const [wmImageDataUrl, setWmImageDataUrl] = useState<string>("");
  const [wmImageScale, setWmImageScale] = useState<number>(0.2);
  const [wmImageOpacity, setWmImageOpacity] = useState<number>(0.3);
  const [wmImageOffsetX, setWmImageOffsetX] = useState<number>(0);
  const [wmImageOffsetY, setWmImageOffsetY] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [cancelled, setCancelled] = useState<boolean>(false);

  const [banner, setBanner] = useState<string | null>(null);

  const cancelRef = useRef<boolean>(false);
  const nextFrame = useCallback(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    []
  );
  // persist settings
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.orientation) setOrientation(s.orientation);
      if (s.align) setAlign(s.align);
      if (typeof s.gap === "number") setGap(s.gap);
      if (typeof s.outerPadding === "number") setOuterPadding(s.outerPadding);

      if (s.bgColor) setBgColor(s.bgColor);
      if (typeof s.transparentBg === "boolean")
        setTransparentBg(s.transparentBg);
      if (s.format) setFormat(s.format);
      if (typeof s.quality === "number") setQuality(s.quality);
      if (typeof s.uniformItemWidth === "number" || s.uniformItemWidth === "")
        setUniformItemWidth(s.uniformItemWidth);
      if (typeof s.uniformItemHeight === "number" || s.uniformItemHeight === "")
        setUniformItemHeight(s.uniformItemHeight);
      if (typeof s.maxOutputWidth === "number" || s.maxOutputWidth === "")
        setMaxOutputWidth(s.maxOutputWidth);
      if (typeof s.maxOutputHeight === "number" || s.maxOutputHeight === "")
        setMaxOutputHeight(s.maxOutputHeight);
      if (typeof s.wmText === "string") setWmText(s.wmText);
      if (typeof s.wmOpacity === "number") setWmOpacity(s.wmOpacity);
      if (typeof s.wmRotate === "number") setWmRotate(s.wmRotate);
      if (typeof s.wmTile === "boolean") setWmTile(s.wmTile);
      if (s.wmPosition) setWmPosition(s.wmPosition);
      if (typeof s.wmImageDataUrl === "string")
        setWmImageDataUrl(s.wmImageDataUrl);
      if (typeof s.wmImageScale === "number") setWmImageScale(s.wmImageScale);
      if (typeof s.wmImageOpacity === "number")
        setWmImageOpacity(s.wmImageOpacity);
      if (typeof s.wmImageOffsetX === "number")
        setWmImageOffsetX(s.wmImageOffsetX);
      if (typeof s.wmImageOffsetY === "number")
        setWmImageOffsetY(s.wmImageOffsetY);
      if (typeof s.gapColor === "string") setGapColor(s.gapColor);
      if (typeof s.borderRadius === "number") setBorderRadius(s.borderRadius);
      if (typeof s.borderWidth === "number") setBorderWidth(s.borderWidth);
      if (typeof s.borderColor === "string") setBorderColor(s.borderColor);
    } catch (e) {
      console.warn("restore settings failed", e);
    }
  }, []);

  useEffect(() => {
    try {
      const s = {
        orientation,
        align,
        gap,
        outerPadding,
        bgColor,
        transparentBg,
        format,
        quality,
        uniformItemWidth,
        uniformItemHeight,
        maxOutputWidth,
        maxOutputHeight,
        borderRadius,
        borderWidth,
        borderColor,
        useWorker,
        wmText,
        wmOpacity,
        wmRotate,
        wmTile,
        wmPosition,
        wmImageDataUrl,
        wmImageScale,
        wmImageOpacity,
        wmImageOffsetX,
        wmImageOffsetY,
        gapColor,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn("persist settings failed", e);
    }
  }, [
    orientation,
    align,
    gap,
    outerPadding,
    bgColor,
    transparentBg,
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
    wmTile,
    wmPosition,
    wmImageDataUrl,
    wmImageScale,
    wmImageOpacity,
    wmImageOffsetX,
    wmImageOffsetY,
    useWorker,

    gapColor,
  ]);
  // Auto-hide UI notices
  useEffect(() => {
    if (!cancelled) return;
    const t = window.setTimeout(() => setCancelled(false), 3000);
    return () => window.clearTimeout(t);
  }, [cancelled]);
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [banner]);

  function SortableItem({ img, idx }: { img: LoadedImage; idx: number }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: img.id });
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : 1,
      background: "var(--tw-white)",
    };
    return (
      <li
        ref={setNodeRef}
        style={style}
        className="flex items-center justify-between gap-3 border rounded p-2 bg-white dark:bg-black/20"
      >
        <div className="flex items-center gap-3">
          <button
            className="px-2 py-1 border rounded cursor-grab active:cursor-grabbing"
            title="拖拽排序"
            {...attributes}
            {...listeners}
          >
            ↕
          </button>
          <NextImage
            src={img.dataUrl}
            alt={img.name}
            width={64}
            height={64}
            unoptimized
            className="w-16 h-16 rounded bg-white"
            style={{ objectFit: "contain" }}
          />
          <div className="text-sm">
            <div className="font-medium truncate max-w-[40ch]">{img.name}</div>
            <div className="text-gray-500">
              {img.width}×{img.height}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 border rounded text-red-600"
            onClick={() => removeAt(idx)}
          >
            移除
          </button>
        </div>
      </li>
    );
  }

  const totals = useMemo(() => {
    if (images.length === 0) return { width: 0, height: 0 };
    if (orientation === "vertical") {
      const width = Math.max(...images.map((i) => i.width));
      const height =
        images.reduce((acc, i) => acc + i.height, 0) +
        gap * (images.length - 1);
      return { width, height };
    } else {
      const width =
        images.reduce((acc, i) => acc + i.width, 0) + gap * (images.length - 1);
      const height = Math.max(...images.map((i) => i.height));
      return { width, height };
    }
  }, [images, orientation, gap]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const loaded = await Promise.all(arr.map(fileToLoadedImage));
    setImages((prev) => [...prev, ...loaded]);
  }, []);

  const removeAt = useCallback((idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clear = useCallback(() => {
    setImages([]);
    setResultUrl("");
  }, []);

  const doStitch = useCallback(async () => {
    if (images.length === 0) return;

    setIsProcessing(true);
    setProgress(0);
    setCancelled(false);
    cancelRef.current = false;
    await nextFrame();

    if (useWorker && workerRef.current) {
      // Worker pipeline
      const id = String(Date.now());
      // store latest id on workerRef for cancel broadcast
      (workerRef.current as unknown as { __lastTaskId?: string }).__lastTaskId =
        id;
      const req = {
        id,
        images: images.map((i) => i.dataUrl),
        options: {
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
        },
      };

      const w = workerRef.current!;
      const onMsg = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || msg.id !== id) return;
        if (msg.type === "progress") {
          setProgress(msg.value);
        } else if (msg.type === "result") {
          const url = URL.createObjectURL(msg.blob);
          setResultUrl(url);
          setIsProcessing(false);
          setProgress(1);
          w.removeEventListener("message", onMsg);
        } else if (msg.type === "cancelled") {
          setIsProcessing(false);
          setProgress(0);
          setCancelled(true);
          w.removeEventListener("message", onMsg);
        } else if (msg.type === "error") {
          console.error("Worker error:", msg.message);
          setIsProcessing(false);
          w.removeEventListener("message", onMsg);
        }
      };
      w.addEventListener("message", onMsg);
      w.postMessage(req);
      return;
    }

    // Load all images first (main thread fallback)
    const els = await Promise.all(images.map((i) => loadImage(i.dataUrl)));

    // Compute target dimensions per image (uniform size options)
    const sized = els.map((img) => {
      const ow = img.naturalWidth || img.width;
      const oh = img.naturalHeight || img.height;
      let tw = ow;
      let th = oh;
      if (orientation === "vertical" && typeof uniformItemWidth === "number") {
        const s = uniformItemWidth / ow;
        tw = Math.max(1, Math.round(ow * s));
        th = Math.max(1, Math.round(oh * s));
      } else if (
        orientation === "horizontal" &&
        typeof uniformItemHeight === "number"
      ) {
        const s = uniformItemHeight / oh;
        tw = Math.max(1, Math.round(ow * s));
        th = Math.max(1, Math.round(oh * s));
      } else if (typeof uniformItemWidth === "number") {
        const s = uniformItemWidth / ow;
        tw = Math.max(1, Math.round(ow * s));
        th = Math.max(1, Math.round(oh * s));
      } else if (typeof uniformItemHeight === "number") {
        const s = uniformItemHeight / oh;
        tw = Math.max(1, Math.round(ow * s));
        th = Math.max(1, Math.round(oh * s));
      }
      return { img, tw, th };
    });

    // Compute overall size before global scale
    let rawW = 0;
    let rawH = 0;
    if (orientation === "vertical") {
      rawW = sized.reduce((m, it) => Math.max(m, it.tw), 0);
      rawH =
        sized.reduce((sum, it) => sum + it.th, 0) + gap * (sized.length - 1);
    } else {
      rawW =
        sized.reduce((sum, it) => sum + it.tw, 0) + gap * (sized.length - 1);
      rawH = sized.reduce((m, it) => Math.max(m, it.th), 0);
    }

    const limitW =
      typeof maxOutputWidth === "number" ? maxOutputWidth : Infinity;
    const limitH =
      typeof maxOutputHeight === "number" ? maxOutputHeight : Infinity;
    const scale = Math.min(1, limitW / rawW, limitH / rawH);

    const finalW = Math.max(1, Math.floor(rawW * scale));
    const finalH = Math.max(1, Math.floor(rawH * scale));
    const scaledGap = Math.round(gap * scale);

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Optional outer padding (canvas border spacing)
    const pad = Math.max(0, outerPadding);
    const paddedW = finalW + pad * 2;
    const paddedH = finalH + pad * 2;

    canvas.width = paddedW;
    canvas.height = paddedH;

    // Background (transparent or colored)
    if (transparentBg) {
      ctx.clearRect(0, 0, paddedW, paddedH);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, paddedW, paddedH);
    }

    // Draw images (scaled) with alignment
    ctx.save();
    const total = sized.length;
    let drawn = 0;

    ctx.translate(pad, pad);

    // Optional rounded clip for final content area
    if (borderRadius > 0) {
      roundRectPath(ctx, 0, 0, finalW, finalH, borderRadius);
      ctx.clip();
    }

    // Draw images (scaled) with alignment
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
        ctx.drawImage(it.img, 0, 0, it.tw, it.th, x, y, dw, dh);
        y += dh;
        drawn = (i + 1) / total;
        setProgress(drawn);
        if (cancelRef.current) {
          setIsProcessing(false);
          return;
        }
        await nextFrame();
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
        ctx.drawImage(it.img, 0, 0, it.tw, it.th, x, y, dw, dh);
        x += dw;
        drawn = (i + 1) / total;
        setProgress(drawn);
        if (cancelRef.current) {
          setIsProcessing(false);
          return;
        }
        await nextFrame();
      }
    }

    // Watermark
    if (wmText) {
      drawWatermark(canvas, {
        type: "text",
        text: wmText,
        opacity: wmOpacity,
        rotateDeg: wmRotate,
        position: wmPosition,
        tile: wmTile,
      });
    }
    if (wmImageDataUrl) {
      const wmImg = await loadImage(wmImageDataUrl);
      drawWatermark(canvas, {
        type: "image",
        image: wmImg,
        opacity: wmImageOpacity ?? wmOpacity,
        rotateDeg: wmRotate,
        position: wmPosition,
        tile: wmTile,
        scale: wmImageScale,
        offsetX: wmImageOffsetX,
        offsetY: wmImageOffsetY,
      });
    }

    const mime =
      format === "png"
        ? "image/png"
        : format === "webp"
        ? "image/webp"
        : "image/jpeg";
    const dataUrl = canvas.toDataURL(
      mime,
      format === "jpeg" ? quality : format === "webp" ? quality : undefined
    );
    setResultUrl(dataUrl);
    setIsProcessing(false);
    setProgress(1);
  }, [
    images,
    outerPadding,
    transparentBg,
    bgColor,
    format,
    quality,
    align,
    orientation,
    gap,
    gapColor,
    uniformItemWidth,
    uniformItemHeight,
    maxOutputWidth,
    maxOutputHeight,
    borderRadius,
    borderWidth,
    borderColor,
    useWorker,
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
    nextFrame,
  ]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
        e.dataTransfer.clearData();
      }
    },
    [handleFiles]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const files: File[] = [];
      for (const item of e.clipboardData.items) {
        const file = item.getAsFile();
        if (file && file.type.startsWith("image/")) files.push(file);
      }
      if (files.length > 0)
        void handleFiles({
          0: files[0],
          length: files.length,
          item: (i: number) => files[i],
        } as unknown as FileList);
    },
    [handleFiles]
  );

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      <section
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onPaste={onPaste}
        className="border border-dashed rounded-lg p-6 text-center bg-white/40 dark:bg-black/20"
      >
        <p className="mb-3">
          选择或拖拽图片（支持粘贴剪贴板图片），将按顺序拼接为长图
        </p>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => void handleFiles(e.target.files)}
          className="mx-auto"
        />
        <div className="text-xs text-gray-500 mt-2">
          已选 {images.length} 张
        </div>
      </section>

      {images.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">图片列表（拖拽排序）</h2>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={images.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {images.map((img, idx) => (
                  <SortableItem key={img.id} img={img} idx={idx} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </section>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">拼接参数</h3>
          <div className="flex items-center gap-3">
            <label className="w-24">方向</label>
            <select
              className="border rounded p-2"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation)}
            >
              <option value="vertical">竖向</option>
              <option value="horizontal">横向</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">透明背景</label>
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={(e) => setTransparentBg(e.target.checked)}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">外边距(px)</label>
            <input
              className="border rounded p-2 w-24"
              type="number"
              min={0}
              value={outerPadding}
              onChange={(e) =>
                setOuterPadding(Math.max(0, Number(e.target.value)))
              }
            />
          </div>
          <div
            className={`${TRANSITION} ${
              banner
                ? `opacity-100 ${SHIFT_SHOW}`
                : `opacity-0 ${SHIFT_HIDE_MD} pointer-events-none`
            }`}
          >
            <div className="px-3 py-2 rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-between">
              <span>{banner}</span>
              <button
                className="ml-3 text-amber-700/80 hover:text-amber-900"
                aria-label="关闭提示"
                onClick={() => setBanner(null)}
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">间隔线颜色</label>
            <input
              type="color"
              className="border rounded p-1 w-24"
              value={gapColor}
              onChange={(e) => setGapColor(e.target.value)}
              disabled={gap === 0}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">对齐</label>
            <select
              className="border rounded p-2"
              value={align}
              onChange={(e) => setAlign(e.target.value as Align)}
            >
              <option value="start">start</option>
              <option value="center">center</option>
              <option value="end">end</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">间距</label>
            <input
              className="border rounded p-2 w-24"
              type="number"
              min={0}
              value={gap}
              onChange={(e) => setGap(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">背景色</label>
            <input
              className="border rounded p-1 w-24"
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">使用Worker加速</label>
            <input
              type="checkbox"
              checked={useWorker}
              onChange={(e) => setUseWorker(e.target.checked)}
            />
            <span className="text-xs text-gray-500">
              不支持时将自动回退主线程
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24">格式</label>
            <select
              className="border rounded p-2"
              value={format}
              onChange={(e) => setFormat(e.target.value as OutputFormat)}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
            {format === "webp" && (
              <>
                <div className="flex items-center gap-3">
                  <label className="w-24">图片水印</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () =>
                        setWmImageDataUrl(String(reader.result));
                      reader.readAsDataURL(f);
                    }}
                  />
                  {wmImageDataUrl && (
                    <>
                      <label>比例</label>
                      <input
                        className="w-40"
                        type="range"
                        min={0.05}
                        max={0.8}
                        step={0.01}
                        value={wmImageScale}
                        onChange={(e) =>
                          setWmImageScale(Number(e.target.value))
                        }
                      />
                    </>
                  )}
                </div>
                {wmImageDataUrl && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <label>图片水印透明度</label>
                    <input
                      className="w-40"
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.01}
                      value={wmImageOpacity}
                      onChange={(e) =>
                        setWmImageOpacity(Number(e.target.value))
                      }
                    />
                    <label>偏移X</label>
                    <input
                      className="border rounded p-2 w-24"
                      type="number"
                      value={wmImageOffsetX}
                      onChange={(e) =>
                        setWmImageOffsetX(Number(e.target.value))
                      }
                    />
                    <label>偏移Y</label>
                    <input
                      className="border rounded p-2 w-24"
                      type="number"
                      value={wmImageOffsetY}
                      onChange={(e) =>
                        setWmImageOffsetY(Number(e.target.value))
                      }
                    />
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  WebP 支持透明背景，适合轻量透明图导出。
                </div>
              </>
            )}
          </div>
          {format === "jpeg" && (
            <div className="flex items-center gap-3">
              <label className="w-24">质量</label>
              <input
                className="w-full"
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
              <span className="w-12 text-right text-sm">
                {Math.round(quality * 100)}%
              </span>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">尺寸与水印</h3>
            <div className="flex items-center gap-3">
              <label className="w-28">社媒预设</label>
              <select
                className="border rounded p-2"
                value={"none"}
                onChange={(e) => {
                  const p = PRESETS[e.target.value];

                  if (!p) return;
                  if (orientation === "vertical") {
                    setUniformItemWidth(p.w);
                    setMaxOutputWidth(p.w);
                    setMaxOutputHeight(p.h);
                  } else {
                    setUniformItemHeight(p.h);
                    setMaxOutputWidth(p.w);
                    setMaxOutputHeight(p.h);
                  }
                }}
              >
                <option value="none">无</option>
                <option value="1080x1920">1080x1920（竖屏）</option>
                <option value="1920x1080">1920x1080（横屏）</option>
                <option value="1242x2208">1242x2208（iPhone）</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28">统一宽度(px)</label>
              <input
                className="border rounded p-2 w-28"
                type="number"
                min={1}
                placeholder="留空不启用"
                value={uniformItemWidth as number | ""}
                onChange={(e) =>
                  setUniformItemWidth(
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28">统一高度(px)</label>
              <input
                className="border rounded p-2 w-28"
                type="number"
                min={1}
                placeholder="留空不启用"
                value={uniformItemHeight as number | ""}
                onChange={(e) =>
                  setUniformItemHeight(
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
              />
              <div className="flex items-center gap-3">
                <label className="w-28">圆角(px)</label>
                <input
                  className="border rounded p-2 w-28"
                  type="number"
                  min={0}
                  value={borderRadius}
                  onChange={(e) =>
                    setBorderRadius(Math.max(0, Number(e.target.value)))
                  }
                />
                <label className="w-28">边框宽度(px)</label>
                <input
                  className="border rounded p-2 w-28"
                  type="number"
                  min={0}
                  value={borderWidth}
                  onChange={(e) =>
                    setBorderWidth(Math.max(0, Number(e.target.value)))
                  }
                />
                <label className="w-28">边框颜色</label>
                <input
                  className="border rounded p-1 w-24"
                  type="color"
                  value={borderColor}
                  onChange={(e) => setBorderColor(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28">最大输出宽</label>
              <input
                className="border rounded p-2 w-28"
                type="number"
                min={512}
                value={maxOutputWidth as number | ""}
                onChange={(e) =>
                  setMaxOutputWidth(
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
              />
              <label className="w-28">最大输出高</label>
              <input
                className="border rounded p-2 w-28"
                type="number"
                min={512}
                value={maxOutputHeight as number | ""}
                onChange={(e) =>
                  setMaxOutputHeight(
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28">水印文本</label>
              <input
                className="border rounded p-2 flex-1"
                placeholder="留空关闭水印"
                value={wmText}
                onChange={(e) => setWmText(e.target.value)}
              />
            </div>
            {wmText && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="w-28">位置</label>
                <select
                  className="border rounded p-2"
                  value={wmPosition}
                  onChange={(e) =>
                    setWmPosition(
                      e.target.value as "tl" | "tr" | "bl" | "br" | "center"
                    )
                  }
                >
                  <option value="br">右下</option>
                  <option value="tr">右上</option>
                  <option value="bl">左下</option>
                  <option value="tl">左上</option>
                  <option value="center">居中</option>
                </select>
                <label>透明度</label>
                <input
                  type="range"
                  min={0.05}
                  max={0.8}
                  step={0.01}
                  value={wmOpacity}
                  onChange={(e) => setWmOpacity(Number(e.target.value))}
                />
                <span className="w-10 text-right text-sm">
                  {Math.round(wmOpacity * 100)}%
                </span>
                <label>旋转</label>
                <input
                  className="w-40"
                  type="range"
                  min={-90}
                  max={90}
                  step={1}
                  value={wmRotate}
                  onChange={(e) => setWmRotate(Number(e.target.value))}
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={wmTile}
                    onChange={(e) => setWmTile(e.target.checked)}
                  />
                  平铺
                </label>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            输出尺寸：{totals.width} × {totals.height}px
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
              onClick={() => void doStitch()}
              disabled={images.length === 0 || isProcessing}
            >
              {isProcessing ? `生成中… ${Math.round(progress * 100)}%` : "生成"}
            </button>
            {isProcessing ? (
              <>
                <button
                  className="px-3 py-2 rounded border"
                  onClick={() => {
                    if (useWorker && workerRef.current) {
                      const id =
                        (
                          workerRef.current as unknown as {
                            __lastTaskId?: string;
                          }
                        ).__lastTaskId ?? "__latest__";
                      workerRef.current.postMessage({ id, type: "cancel" });
                    }
                    cancelRef.current = true;
                    setCancelled(true);
                  }}
                >
                  取消
                </button>
                <div
                  className={`flex items-center gap-2 text-xs text-amber-600 ${TRANSITION} ${
                    cancelled
                      ? `opacity-100 ${SHIFT_SHOW}`
                      : `opacity-0 ${SHIFT_HIDE_SM} pointer-events-none`
                  }`}
                >
                  <span>已取消</span>
                  <button
                    className="px-1 leading-none rounded hover:bg-amber-100"
                    aria-label="关闭已取消提示"
                    onClick={() => setCancelled(false)}
                  >
                    ×
                  </button>
                </div>
              </>
            ) : (
              <button className="px-3 py-2 rounded border" onClick={clear}>
                清空
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">预览 / 下载</h3>
          {resultUrl ? (
            <>
              <div className="border rounded p-2 max-h-[480px] overflow-auto bg-white">
                {/* Using img instead of canvas for scalable preview */}
                <NextImage
                  src={resultUrl}
                  alt="Stitched result"
                  width={1200}
                  height={1200}
                  unoptimized
                  className="h-auto w-auto max-w-full"
                  style={{ height: "auto", width: "100%" }}
                />
              </div>
              <div className="flex gap-2">
                <a
                  className="px-3 py-2 rounded bg-emerald-600 text-white"
                  href={resultUrl}
                  download={`stitched.${format === "png" ? "png" : "jpg"}`}
                >
                  下载
                </a>
                <button
                  className="px-3 py-2 rounded border"
                  onClick={() => setResultUrl("")}
                >
                  清除预览
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-2 rounded border"
                  onClick={() => {
                    try {
                      const cfg = localStorage.getItem(LS_KEY) ?? "{}";
                      const blob = new Blob([cfg], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "stitch-config.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {}
                  }}
                >
                  导出配置
                </button>
                <label className="px-3 py-2 rounded border cursor-pointer">
                  导入配置
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const text = await f.text();
                      try {
                        const s = JSON.parse(text);
                        localStorage.setItem(LS_KEY, JSON.stringify(s));
                        location.reload();
                      } catch {
                        alert("配置文件无效");
                      }
                    }}
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">生成后将在此显示预览</div>
          )}
        </div>
      </section>

      {/* Hidden working canvas (for debugging if needed) */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// {{END_MODIFICATIONS}}
