import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useSession } from "../lib/store.js";

export default function LoginView() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const setUser = useSession((s) => s.setUser);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await api.login(username, password);
      setUser(u);
      nav("/");
    } catch (err) {
      setError(
        err.message === "invalid_credentials"
          ? "Usuario o contrasena incorrectos"
          : "Error iniciando sesion",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full grid place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center font-bold">
            U
          </div>
          <div>
            <div className="font-semibold">USBMUSIC</div>
            <div className="text-xs text-white/50">
              Inicia sesion para continuar
            </div>
          </div>
        </div>

        <label className="block text-xs text-white/60 mb-1">Usuario</label>
        <input
          className="input mb-3"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />

        <label className="block text-xs text-white/60 mb-1">Contrasena</label>
        <input
          type="password"
          className="input mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

        <button className="btn w-full" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-xs text-white/40 mt-4">
          Primer uso: <code>admin</code> / <code>usbmusic</code>. Cambialo en
          Ajustes.
        </p>
      </form>
    </div>
  );
}
