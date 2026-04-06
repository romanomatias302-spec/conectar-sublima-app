import React, { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  invitacionEstaVencida,
  marcarInvitacionComoUsada,
  obtenerInvitacionPorToken,
} from "../../firebase/invitacionesUsuarios";
import "./Login.css";

export default function ActivarCuenta() {
  const [token, setToken] = useState("");
  const [invitacion, setInvitacion] = useState(null);
  const [loading, setLoading] = useState(true);

  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenUrl = params.get("token") || "";
    console.log("TOKEN URL:", tokenUrl);
    console.log("SEARCH COMPLETO:", window.location.search);
    setToken(tokenUrl);
  }, []);

  useEffect(() => {
    async function verificar() {
      try {
        if (!token) {
          setError("No se encontró el token de invitación en la URL.");
          setLoading(false);
          return;
        }

        setLoading(true);
        setError("");

        console.log("Buscando invitación por token:", token);

        const data = await obtenerInvitacionPorToken(token);

        console.log("Invitación encontrada:", data);

        if (!data) {
          setError("No se encontró una invitación válida.");
          setLoading(false);
          return;
        }

        if (data.estado !== "pendiente") {
          setError("Esta invitación ya fue utilizada o cancelada.");
          setLoading(false);
          return;
        }

        if (invitacionEstaVencida(data)) {
          setError("La invitación venció.");
          setLoading(false);
          return;
        }

        setInvitacion(data);
        setNombre(data.nombre || "");
      } catch (err) {
        console.error("Error verificando invitación:", err);
        setError("No se pudo validar la invitación.");
      } finally {
        setLoading(false);
      }
    }

    verificar();
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMensaje("");

    try {
      if (!invitacion) {
        setError("No se encontró una invitación válida.");
        return;
      }

      if (!nombre.trim()) {
        setError("Completá tu nombre.");
        return;
      }

      if (!password || password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }

      if (!confirmPassword) {
        setError("Completá la confirmación de contraseña.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Las contraseñas no coinciden.");
        return;
      }

      setGuardando(true);

      console.log("Paso 1: creando usuario en Auth...");

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        invitacion.email,
        password
      );

      const nuevoUsuario = userCredential.user;

      console.log("Paso 2: usuario Auth creado:", nuevoUsuario.uid);

      await updateProfile(nuevoUsuario, {
        displayName: nombre.trim(),
      });

      console.log("Paso 3: guardando usuario en Firestore...");

      await setDoc(doc(db, "usuarios", nuevoUsuario.uid), {
        nombre: nombre.trim(),
        email: invitacion.email,
        rol: invitacion.rol || "usuario",
        activo: true,
        clienteId: invitacion.clienteId,
        createdAt: serverTimestamp(),
        invitacionId: invitacion.id,
        permisos: {
          inicio: { ver: true },
          clientes: { ver: false, crear: false, editar: false, eliminar: false },
          pedidos: { ver: true, crear: false, editar: false, eliminar: false },
          produccion: {
            ver: true,
            mover: true,
            editarDetalle: true,
            asignarUsuario: false,
          },
          ventas: { ver: false, crear: false, editar: false, eliminar: false },
          movimientos: { ver: false },
          configuracion: { ver: false },
        },
      });

      console.log("Paso 4: marcando invitación como usada...");

      await marcarInvitacionComoUsada({
        invitacionId: invitacion.id,
        usuarioCreadoUid: nuevoUsuario.uid,
        dbInstance: db,
      });

      console.log("Paso 5: cerrando sesión secundaria...");

      await signOut(auth);

      setMensaje("Cuenta activada correctamente. Ya podés iniciar sesión.");
    } catch (err) {
      console.error("Error activando cuenta:", err);

      if (err.code === "auth/email-already-in-use") {
        setError("Ese email ya está registrado.");
      } else if (err.code === "auth/invalid-email") {
        setError("El email de la invitación no es válido.");
      } else if (
        err.code === "permission-denied" ||
        err.code === "firestore/permission-denied"
      ) {
        setError("No tenés permisos para completar esta activación. Revisá las reglas de Firestore.");
      } else {
        setError(`No se pudo activar la cuenta: ${err.code || err.message || "error"}`);
      }
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Activar cuenta</h1>
          <p>Validando invitación...</p>
        </div>
      </div>
    );
  }

  if (error && !invitacion) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Activar cuenta</h1>
          <div className="login-error">{error}</div>

          <p style={{ marginTop: "12px", fontSize: "13px", color: "#666" }}>
            Token leído: {token || "(vacío)"}
          </p>
        </div>
      </div>
    );
  }

  if (mensaje) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Cuenta activada</h1>
          <p>{mensaje}</p>
          <a href="/" style={{ marginTop: "12px", display: "inline-block" }}>
            Ir al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Activar cuenta</h1>
        <p>Completá tus datos para ingresar al sistema.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label style={{ fontSize: "14px", fontWeight: 600 }}>Nombre</label>
          <input
            type="text"
            placeholder="Tu nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          <label style={{ fontSize: "14px", fontWeight: 600 }}>Email invitado</label>
          <input
            type="email"
            value={invitacion?.email || ""}
            readOnly
            style={{
              background: "#f3f4f6",
              color: "#333",
            }}
          />

          <label style={{ fontSize: "14px", fontWeight: 600 }}>Contraseña</label>
          <input
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label style={{ fontSize: "14px", fontWeight: 600 }}>Confirmar contraseña</label>
          <input
            type="password"
            placeholder="Repetí la contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={guardando}>
            {guardando ? "Activando..." : "Activar cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}