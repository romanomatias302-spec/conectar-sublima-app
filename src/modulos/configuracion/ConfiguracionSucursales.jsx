import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import ActionMenu from "../../comunes/componentes/ActionMenu";

const SUCURSAL_PRINCIPAL_ID = "principal";

export default function ConfiguracionSucursales({ perfil }) {
  const [sucursales, setSucursales] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [modalCrear, setModalCrear] = useState(false);
  const [sucursalEditando, setSucursalEditando] = useState(null);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!perfil?.clienteId) return;

    const ref = collection(db, "sucursales");
    const q = query(ref, where("clienteId", "==", perfil.clienteId));

    const unsubscribe = onSnapshot(q, async (snap) => {
      const lista = snap.docs.map((d) => ({
        firebaseId: d.id,
        ...d.data(),
      }));

const tienePrincipal = lista.some(
  (s) => s.esPrincipal === true || s.codigo === SUCURSAL_PRINCIPAL_ID
);

if (!tienePrincipal) {
  await setDoc(doc(db, "sucursales", `${perfil.clienteId}_principal`), {
    clienteId: perfil.clienteId,
    codigo: SUCURSAL_PRINCIPAL_ID,
    nombre: "Sucursal principal",
    direccion: "",
    activa: true,
    esPrincipal: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return;
}

      setSucursales(
        lista.sort((a, b) => {
          if (a.esPrincipal) return -1;
          if (b.esPrincipal) return 1;
          return (a.nombre || "").localeCompare(b.nombre || "");
        })
      );
    });

    return () => unsubscribe();
  }, [perfil?.clienteId]);

  const sucursalesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return sucursales.filter(
      (s) =>
        !texto ||
        String(s.nombre || "").toLowerCase().includes(texto) ||
        String(s.direccion || "").toLowerCase().includes(texto)
    );
  }, [sucursales, busqueda]);

const cerrarModalCrear = () => {
  setModalCrear(false);
  setSucursalEditando(null);
  setNombre("");
  setDireccion("");
  setMensaje("");
};

  const crearSucursal = async () => {
    try {
      const nombreLimpio = nombre.trim();

      if (!nombreLimpio) {
        setMensaje("Ingresá un nombre para la sucursal.");
        return;
      }

      const yaExiste = sucursales.some(
        (s) =>
          String(s.nombre || "").trim().toLowerCase() ===
          nombreLimpio.toLowerCase()
      );

      if (yaExiste) {
        setMensaje("Ya existe una sucursal con ese nombre.");
        return;
      }

      setGuardando(true);
      setMensaje("");

      await addDoc(collection(db, "sucursales"), {
        clienteId: perfil.clienteId,
        codigo: "",
        nombre: nombreLimpio,
        direccion: direccion.trim(),
        activa: true,
        esPrincipal: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      cerrarModalCrear();
    } catch (error) {
      console.error("Error creando sucursal:", error);
      setMensaje("No se pudo crear la sucursal.");
    } finally {
      setGuardando(false);
    }
  };

 
 const abrirEditarSucursal = (sucursal) => {
  setSucursalEditando(sucursal);
  setNombre(sucursal.nombre || "");
  setDireccion(sucursal.direccion || "");
  setModalCrear(true);
};

const guardarSucursal = async () => {
  if (sucursalEditando) {
    await actualizarSucursal();
    return;
  }

  await crearSucursal();
};

const actualizarSucursal = async () => {
  try {
    const nombreLimpio = nombre.trim();

    if (!nombreLimpio) {
      setMensaje("Ingresá un nombre para la sucursal.");
      return;
    }

    setGuardando(true);
    setMensaje("");

    await updateDoc(doc(db, "sucursales", sucursalEditando.firebaseId), {
      nombre: nombreLimpio,
      direccion: direccion.trim(),
      updatedAt: serverTimestamp(),
    });

    cerrarModalCrear();
  } catch (error) {
    console.error("Error actualizando sucursal:", error);
    setMensaje("No se pudo actualizar la sucursal.");
  } finally {
    setGuardando(false);
  }
};
 

  const cambiarEstadoSucursal = async (sucursal) => {
    if (sucursal.esPrincipal) {
      alert("La sucursal principal no se puede desactivar.");
      return;
    }

    await updateDoc(doc(db, "sucursales", sucursal.firebaseId), {
      activa: sucursal.activa === false,
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <div className="sucursales-page" style={{ display: "grid", gap: 18 }}>
      <div className="container-secundaria">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Sucursales</h3>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => {
            setSucursalEditando(null);
            setNombre("");
            setDireccion("");
            setModalCrear(true);
            }}
          >
            + Crear sucursal
          </button>
        </div>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar sucursal..."
          style={{ maxWidth: 420, marginTop: 14 }}
        />

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {sucursalesFiltradas.map((sucursal) => (
                <tr key={sucursal.firebaseId}>
                  <td>
                    <strong>{sucursal.nombre}</strong>
                    {sucursal.esPrincipal && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#eaf7ff",
                          color: "#0096d1",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Sucursal por defecto
                      </span>
                    )}
                  </td>

                  <td>{sucursal.direccion || "-"}</td>
                  <td>{sucursal.activa === false ? "Inactiva" : "Activa"}</td>

                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                    onEditar={() => abrirEditarSucursal(sucursal)}
                    onEliminar={
                        sucursal.esPrincipal || sucursal.activa === false
                        ? undefined
                        : () => cambiarEstadoSucursal(sucursal)
                    }
                    />
                    {sucursal.activa === false && !sucursal.esPrincipal && (
                    <button
                        type="button"
                        className="btn btn-secundario"
                        onClick={() => cambiarEstadoSucursal(sucursal)}
                        style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        margin: 0,
                        }}
                    >
                        Reactivar
                    </button>
                    )}
                  </td>
                </tr>
              ))}

              {sucursalesFiltradas.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: "center", padding: 18 }}>
                    No hay sucursales cargadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalCrear && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 460 }}>
           <h2>{sucursalEditando ? "Editar sucursal" : "Nueva sucursal"}</h2>

            {mensaje && <div className="alert-error">{mensaje}</div>}

            <label>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Local Pilar"
            />

            <label>Dirección opcional</label>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Ej: Av. Principal 123"
            />

            <div className="modal-buttons">
              <button className="cancelar" onClick={cerrarModalCrear}>
                Cancelar
              </button>

                <button onClick={guardarSucursal} disabled={guardando}>
                {guardando
                    ? "Guardando..."
                    : sucursalEditando
                    ? "Guardar cambios"
                    : "Guardar sucursal"}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}