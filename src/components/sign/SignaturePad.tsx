'use client';

// The finger-signing surface. Pointer events cover touch, pen and mouse in one
// path, the canvas is backed at device pixel ratio so the stroke is crisp on a
// phone, and `touch-action: none` stops a drawing gesture from scrolling the
// page underneath it.
//
// The parent form reads the drawing through the imperative handle:
//   const pad = useRef<SignaturePadHandle>(null);
//   pad.current?.toDataUrl()   // trimmed PNG data URL, or null if untouched

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  clear: () => void;
  /** A PNG data URL cropped to the ink, or null if nothing was drawn. */
  toDataUrl: () => string | null;
}

const STROKE = '#12121a';
const LINE_WIDTH = 2.4;

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { onChange?: (hasInk: boolean) => void; disabled?: boolean }
>(function SignaturePad({ onChange, disabled }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const context = () => canvasRef.current?.getContext('2d') ?? null;

  const applyStyle = (ctx: CanvasRenderingContext2D, dpr: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE;
    ctx.fillStyle = STROKE;
    ctx.lineWidth = LINE_WIDTH;
  };

  // Size the backing store to the element's CSS box × DPR, redoing it on
  // resize/rotate. Whatever is already drawn is preserved across the resize.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === w && canvas.height === h) return;

    const previous = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL() : null;
    canvas.width = w;
    canvas.height = h;
    applyStyle(ctx, dpr);
    if (previous) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = previous;
    }
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, [resize]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasInk(false);
    onChange?.(false);
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      isEmpty: () => !hasInk,
      clear,
      toDataUrl: () => (canvasRef.current ? trimmedDataUrl(canvasRef.current) : null),
    }),
    [hasInk, clear],
  );

  function pointFrom(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const point = pointFrom(e);
    last.current = point;

    // A tap with no movement should still leave a dot.
    const ctx = context();
    if (ctx) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, LINE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = context();
    const from = last.current;
    if (!ctx || !from) return;
    const to = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
  }

  function end() {
    drawing.current = false;
    last.current = null;
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-ink-600 bg-paper">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className="block h-[190px] w-full"
          style={{ touchAction: 'none' }}
          aria-label="Signature area"
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-ink-500/40" />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="text-sm text-ink-500">Sign here with your finger</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-paper/50">Use your finger, a stylus or the mouse.</p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-paper/80 transition hover:border-exposure hover:text-exposure disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
});

/**
 * Export the drawing cropped to its ink, on a transparent background. Cropping
 * matters: the PDF scales whatever it is handed into the signature box, so an
 * uncropped canvas would shrink a small signature into a corner of it.
 */
function trimmedDataUrl(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  if (!width || !height) return null;

  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // nothing drawn

  const pad = Math.round(Math.min(width, height) * 0.02);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
