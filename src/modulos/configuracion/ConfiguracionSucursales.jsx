import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import {
  asegurarSucursalPrincipalSaas,
  cambiarEstadoSucursalSaas,
  completarDowngradeSaas,
  crearSucursalSaas,
} from "../../firebase/saasEntitlements";
import {
  calculateSaasResourceUsage,
  formatPlanUsage,
  planLimitMessage,
} from "../../domain/saasEntitlementUsage";
import {
  buildBranchCapacityChanges,
  canConfirmCapacitySelection,
  initialBranchSelection,
} from "../../domain/saasOverLimitSelection";
import {pendingPlanEntitlements} from "../../domain/saasPlanChange";

const SUCURSAL_PRINCIPAL_ID = "principal";

export default function ConfiguracionSucursales({ perfil, onEntitlementsChanged }) {
  const [sucursales, setSucursales] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [modalCrear, setModalCrear] = useState(false);
  const [sucursalEditando, setSucursalEditando] = useState(null);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [clienteSaas, setClienteSaas] = useState(null);
  const [seleccionSucursales, setSeleccionSucursales] = useState(null);
  const [aplicandoSeleccion, setAplicandoSeleccion] = useState(false);

  useEffect(() => {
    if (!perfil?.clienteId) return;

    const ref = collection(db, "sucursales");
    const q = query(ref, where("clienteId", "==", perfil.clienteId));

    const unsubscribe = onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => ({
        firebaseId: d.id,
        ...d.data(),
      }));

const tienePrincipal = lista.some(
  (s) => s.esPrincipal === true || s.codigo === SUCURSAL_PRINCIPAL_ID
);

if (!tienePrincipal && lista.length === 0) {
  asegurarSucursalPrincipalSaas(perfil.clienteId).catch((error) => {
    console.error("No se pudo asegurar la sucursal principal:", error);
    setMensaje(error.message || "No se pudo preparar la sucursal principal.");
  });
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

  useEffect(() => {
    if (!perfil?.clienteId) return undefined;
    return onSnapshot(doc(db, "clientes-saas", perfil.clienteId), (snapshot) => {
      setClienteSaas(snapshot.exists() ? {id: snapshot.id, ...snapshot.data()} : null);
    });
  }, [perfil?.clienteId]);

  const resourceUsage = useMemo(() => calculateSaasResourceUsage({
    client: clienteSaas || {}, branches: sucursales,
  }), [clienteSaas, sucursales]);
  const futureEntitlements = useMemo(() => pendingPlanEntitlements(clienteSaas || {}), [clienteSaas]);
  const pendingBranchesOverLimit = Boolean(futureEntitlements && !futureEntitlements.unlimitedBranches &&
    resourceUsage.activeBranches > futureEntitlements.maxBranches);
  const selectionBranchesOverLimit = resourceUsage.branchesOverLimit || pendingBranchesOverLimit;
  const selectionBranchLimit = futureEntitlements?.maxBranches ?? resourceUsage.entitlements.maxBranches;

  useEffect(() => {
    if (!selectionBranchesOverLimit) {
      setSeleccionSucursales(null);
      return;
    }
    setSeleccionSucursales((actual) => actual || new Set(initialBranchSelection(sucursales)));
  }, [selectionBranchesOverLimit, sucursales]);

  const alternarSucursalSeleccionada = (id) => {
    setSeleccionSucursales((actual) => {
      const siguiente = new Set(actual || []);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const aplicarSeleccionSucursales = async () => {
    const limit = selectionBranchLimit;
    if (!seleccionSucursales || !canConfirmCapacitySelection(seleccionSucursales.size, limit)) return;
    const selectedNames = sucursales
      .filter((sucursal) => seleccionSucursales.has(sucursal.firebaseId))
      .map((sucursal) => sucursal.nombre || "Sucursal");
    const confirmar = window.confirm(
      `Vas a mantener activas:\n- ${selectedNames.join("\n- ")}\n\n` +
      "Las demás sucursales quedarán inactivas. No se eliminará información ni historial."
    );
    if (!confirmar) return;
    try {
      setAplicandoSeleccion(true);
      setMensaje("");
      const ids = buildBranchCapacityChanges({
        branches: sucursales,
        selectedIds: [...seleccionSucursales],
      });
      for (const sucursalId of ids) {
        await cambiarEstadoSucursalSaas({clienteId: perfil.clienteId, sucursalId, activa: false});
      }
      setSeleccionSucursales(null);
      if (futureEntitlements) await completarDowngradeSaas(perfil.clienteId);
      onEntitlementsChanged?.();
      setMensaje("Selección de sucursales aplicada correctamente.");
    } catch (error) {
      console.error("Error aplicando selección de sucursales:", error);
      setMensaje(error.message || "No se pudo aplicar la selección.");
    } finally {
      setAplicandoSeleccion(false);
    }
  };

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

      await crearSucursalSaas({
        clienteId: perfil.clienteId,
        nombre: nombreLimpio,
        direccion: direccion.trim(),
      });

      cerrarModalCrear();
      onEntitlementsChanged?.();
    } catch (error) {
      console.error("Error creando sucursal:", error);
      setMensaje(error.message || "No se pudo crear la sucursal.");
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

    try {
      await cambiarEstadoSucursalSaas({
        clienteId: perfil.clienteId,
        sucursalId: sucursal.firebaseId,
        activa: sucursal.activa === false,
      });
      onEntitlementsChanged?.();
    } catch (error) {
      console.error("Error cambiando estado de sucursal:", error);
      setMensaje(error.message || "No se pudo cambiar el estado de la sucursal.");
    }
  };

  return (
    <div className="sucursales-page" style={{ display: "grid", gap: 18 }}>
      <div className="container-secundaria">
<div className="sucursales-head">
          <div>
            <h3 style={{ margin: 0 }}>Sucursales</h3>
            <p style={{margin: "6px 0 0", color: "#475569", fontWeight: 600}}>
              {formatPlanUsage(
                resourceUsage.activeBranches,
                resourceUsage.entitlements.maxBranches,
                resourceUsage.entitlements.unlimitedBranches
              )}
            </p>
            {!resourceUsage.canAddBranch && (
              <p className="alert-error" style={{marginTop: 10}}>
                {planLimitMessage(
                  resourceUsage.entitlements,
                  "branches",
                  resourceUsage.branchesOverLimit
                )}
              </p>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => {
            setSucursalEditando(null);
            setNombre("");
            setDireccion("");
            setModalCrear(true);
            }}
            disabled={!resourceUsage.canAddBranch}
          >
            + Crear sucursal
          </button>
        </div>

        {mensaje && !modalCrear && <p className="alert-error" role="alert">{mensaje}</p>}

        {selectionBranchesOverLimit && seleccionSucursales && (
          <div className="entitlement-overlimit-panel">
            <div className="entitlement-overlimit-head">
              <div>
                <strong>Ajustá las sucursales activas</strong>
                <p>
                  {futureEntitlements ? "Tu próximo plan" : "Tu plan"} permite {selectionBranchLimit} sucursales y actualmente tenés {resourceUsage.activeBranches} activas.
                  Elegí cuáles conservar; no se aplicará ningún cambio hasta confirmar.
                </p>
              </div>
              <span>{seleccionSucursales.size} de {selectionBranchLimit} seleccionadas</span>
            </div>
            <div className="entitlement-selection-grid">
              {sucursales.filter((sucursal) => sucursal.activa !== false).map((sucursal) => {
                const id = sucursal.firebaseId;
                return (
                  <label key={id} className="entitlement-selection-item">
                    <input type="checkbox" checked={seleccionSucursales.has(id)} disabled={sucursal.esPrincipal || aplicandoSeleccion} onChange={() => alternarSucursalSeleccionada(id)} />
                    <span><strong>{sucursal.nombre || "Sucursal"}</strong><small>{sucursal.esPrincipal ? "Sucursal principal · debe permanecer activa" : sucursal.direccion || "Sucursal activa"}</small></span>
                  </label>
                );
              })}
            </div>
            <div className="entitlement-overlimit-actions">
              <span>Las sucursales no seleccionadas quedarán inactivas. Sus datos e historial se conservan.</span>
              <button className="btn btn-primary" disabled={aplicandoSeleccion || !canConfirmCapacitySelection(seleccionSucursales.size, selectionBranchLimit)} onClick={aplicarSeleccionSucursales}>
                {aplicandoSeleccion ? "Aplicando..." : "Aplicar selección"}
              </button>
            </div>
          </div>
        )}

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
                        disabled={!resourceUsage.canAddBranch}
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
