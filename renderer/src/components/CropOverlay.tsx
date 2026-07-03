import { Crop, X, Check } from 'lucide-react';
import type { useCropOverlay } from '../hooks/useCropOverlay';

type CropOverlayProps = ReturnType<typeof useCropOverlay>;

export function CropOverlay({
  open,
  screenshot,
  overlayRef,
  drag,
  boxStyle,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  confirm,
  close,
  hasBounds,
  confirmed,
}: CropOverlayProps) {
  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 cursor-crosshair select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {screenshot && (
        <img
          src={`data:image/png;base64,${screenshot}`}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'fill' }}
          draggable={false}
        />
      )}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-800/90 text-zinc-200 text-sm px-4 py-2 rounded-full border border-zinc-600 shadow-lg pointer-events-none z-10">
        <Crop size={14} />
        Húzd ki a kivágandó területet · Esc = mégse
      </div>

      {(drag.active || confirmed) && hasBounds && (
        <div
          className="absolute border-2 border-indigo-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] z-10"
          style={boxStyle()}
        >
          {confirmed && (
            <div
              className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={confirm}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                <Check size={12} />
                Küldés AI-nak
              </button>
              <button
                onClick={close}
                className="flex items-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                <X size={12} />
                Mégse
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
