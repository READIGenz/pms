import { useEffect, useId, useRef } from 'react';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;            // default: "OK"
  onConfirm: () => void;           // called when OK is clicked (or Enter pressed)
  onOpenChange?: (open: boolean) => void; // optional: notify open/close
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText = 'OK',
  onConfirm,
  onOpenChange,
}: ConfirmModalProps) {
  const okRef = useRef<HTMLButtonElement | null>(null);
  const dlgId = useId();
  const descId = useId();

  // Autofocus OK when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => okRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Handle ESC / Enter inside the modal
  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onOpenChange?.(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      {/* Backdrop (non-click-through to avoid accidental close) */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Dialog */}
      <div
        className="absolute inset-0 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dlgId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
      >
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow border">
          <h3 id={dlgId} className="text-lg font-semibold">{title}</h3>
          {description && (
            <p id={descId} className="text-sm text-gray-600 mt-2">
              {description}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            {/* Optional close button — uncomment if you want a visible cancel
            <button
              className="px-4 py-2 rounded border"
              onClick={() => onOpenChange?.(false)}
            >
              Close
            </button>
            */}
            <button
              ref={okRef}
              className="px-4 py-2 rounded bg-emerald-600 text-white"
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
