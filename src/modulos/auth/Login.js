import React, { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../../firebase";
import logoZalfro from "../../assets/logo-zalfro.png";
import "./Login.css";

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
      <path d="M12 3 19 6v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [recordarme, setRecordarme] = useState(
    localStorage.getItem("zalfroRecordarme") === "true"
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensajeOk, setMensajeOk] = useState("");
const [loadingReset, setLoadingReset] = useState(false);


useEffect(() => {
  const emailGuardado = localStorage.getItem("zalfroEmailRecordado");

  if (localStorage.getItem("zalfroRecordarme") === "true" && emailGuardado) {
    setEmail(emailGuardado);
  }
}, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Completá email y contraseña.");
      return;
    }

    if (recordarme) {
      localStorage.setItem("zalfroEmailRecordado", email);
    } else {
      localStorage.removeItem("zalfroEmailRecordado");
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      if (onLogin) onLogin();
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      setError(`Error: ${err.code}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRecuperarPassword = async () => {
  setError("");
  setMensajeOk("");

  if (!email) {
    setError("Ingresá tu email para recuperar la contraseña.");
    return;
  }

  try {
    setLoadingReset(true);
    await sendPasswordResetEmail(auth, email);
    setMensajeOk("Te enviamos un email para recuperar tu contraseña.");
  } catch (err) {
    console.error("Error recuperando contraseña:", err);
    setError("No pudimos enviar el email de recuperación.");
  } finally {
    setLoadingReset(false);
  }
};

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-panel">
          <img src={logoZalfro} alt="Zalfro" className="login-brand-img" />

          <h1>Ingresar</h1>
          <p>Accedé al sistema de gestión.</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-input-wrap">
              <MailIcon />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="login-input-wrap">
              <LockIcon />
              <input
                type={verPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setVerPassword((prev) => !prev)}
                title="Ver contraseña"
              >
                <EyeIcon />
              </button>
            </div>

            {error && <div className="login-error">{error}</div>}
            {mensajeOk && <div className="login-success">{mensajeOk}</div>}

            <button type="submit" disabled={loading} className="login-submit-btn">
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
            <div className="login-options-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={recordarme}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRecordarme(checked);
                    localStorage.setItem("zalfroRecordarme", checked ? "true" : "false");
                  }}
                />
                <span>Recordarme</span>
              </label>

              <button
                type="button"
                className="login-forgot-btn"
                onClick={handleRecuperarPassword}
                disabled={loadingReset}
              >
                {loadingReset ? "Enviando..." : "¿Olvidaste tu contraseña?"}
              </button>
            </div>
          </form>

          <div className="login-footer">
            <ShieldIcon />
            <span>Zalfro · Gestión simple, resultados reales.</span>
          </div>
        </div>

        <div className="login-visual">
          <div className="login-visual-overlay">
            <h2>Tu negocio,<br />bajo control.</h2>
            <p>
              Organizá pedidos, producción, clientes y ventas desde un solo lugar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}