"use client";

import { useEffect, useState } from "react";

type ToastType = "info" | "warning" | "error";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

export default function Toast({ message, type = "info", duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const colors = {
    info: "border-signal-clear/40 bg-signal-clear/10 text-signal-clear",
    warning: "border-signal-warn/40 bg-signal-warn/10 text-signal-warn",
    error: "border-signal-alert/40 bg-signal-alert/10 text-signal-alert",
  };

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg border px-4 py-2 font-mono text-sm ${colors[type]} backdrop-blur`}>
      {message}
    </div>
  );
}
