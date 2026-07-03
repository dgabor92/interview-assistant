import { useRef, useState } from 'react';

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  active: boolean;
}

const EMPTY_DRAG: DragState = { startX: 0, startY: 0, currentX: 0, currentY: 0, active: false };

export function useCropOverlay() {
  const [open, setOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(EMPTY_DRAG);
  const [confirmed, setConfirmed] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const openWithScreenshot = (base64: string) => {
    setScreenshot(base64);
    setDrag(EMPTY_DRAG);
    setConfirmed(false);
    setOpen(true);
  };

  const bounds = () => {
    const x = Math.min(drag.startX, drag.currentX);
    const y = Math.min(drag.startY, drag.currentY);
    const w = Math.abs(drag.currentX - drag.startX);
    const h = Math.abs(drag.currentY - drag.startY);
    return { x, y, w, h };
  };

  const boxStyle = () => {
    const { x, y, w, h } = bounds();
    return { left: x, top: y, width: w, height: h };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({ startX: e.clientX - rect.left, startY: e.clientY - rect.top, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top, active: true });
    setConfirmed(false);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.active) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag((prev) => ({ ...prev, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top }));
  };

  const onMouseUp = () => {
    if (!drag.active) return;
    setDrag((prev) => ({ ...prev, active: false }));
    setConfirmed(true);
  };

  const confirm = async (): Promise<string | null> => {
    if (!screenshot) return null;
    const { x, y, w, h } = bounds();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || w < 10 || h < 10) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scaleX);
        canvas.height = Math.round(h * scaleY);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, x * scaleX, y * scaleY, w * scaleX, h * scaleY, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.src = `data:image/png;base64,${screenshot}`;
    });
  };

  const close = () => {
    setOpen(false);
    setDrag(EMPTY_DRAG);
    setConfirmed(false);
    setScreenshot(null);
  };

  const hasBounds = bounds().w > 10 && bounds().h > 10;

  return { open, openWithScreenshot, screenshot, overlayRef, drag, boxStyle, onMouseDown, onMouseMove, onMouseUp, confirm, close, hasBounds, confirmed };
}
