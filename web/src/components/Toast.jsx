import { useEffect } from "react";
import { useUI } from "../lib/store.js";

export default function Toast() {
  const toast = useUI((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => useUI.setState({ toast: null }), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  const color =
    toast.kind === "error"
      ? "bg-red-500/90"
      : toast.kind === "ok"
        ? "bg-green-500/90"
        : "bg-accent/90";
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 ${color} text-white px-4 py-2 rounded-lg shadow-lg z-50`}
    >
      {toast.msg}
    </div>
  );
}
