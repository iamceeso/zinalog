"use client";

import DialogShell from "./dialog-shell";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <DialogShell
      title={title}
      description={message}
      onClose={onCancel}
      danger={danger}
      widthClassName="w-full max-w-[420px]"
      footer={
        <>
          <button
            onClick={onCancel}
            className="bg-(--bg-card) border border-(--border) rounded-md px-4.5 py-2 text-[13px] text-(--text-muted) cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`${danger ? "bg-(--error)" : "bg-(--accent-glow)"} border-none rounded-md px-4.5 py-2 text-[13px] font-semibold text-white cursor-pointer`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <></>
    </DialogShell>
  );
}
