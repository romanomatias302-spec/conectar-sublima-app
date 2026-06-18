import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import "./PedidoFormModal.css";
import {
  asegurarColumnasBaseProduccion,
  obtenerColumnaInicialProduccion,
} from "../../firebase/produccionColumnas";
import { puedeHacer } from "../../utils/permisos";

export default function PedidoFormModal({ onClose, onPedidoCreado, pedido, perfil }) {
  const [clientes, setClientes] = useState([]);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [mostrarDropdownCliente, setMostrarDropdownCliente] = useState(false);
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState("");
  const [formData, setFormData] = useState({
    id: "",
    cliente: "",
    clienteDNI: "",
    fechaPedido: "",
    fechaEntrega: "",
    estado: "Pendiente",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false); // ✅ nuevo estado para el mensaje de éxito
  const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: "",
    dni: "",
    telefono: "",
    direccion: "",
    localidad: "",
    provincia: "",
    email: "",
  });

  const puedeCrearPedidos = puedeHacer(perfil, "pedidos", "crear");
  const puedeEditarPedidos = puedeHacer(perfil, "pedidos", "editar");
  const puedeCrearClientes = puedeHacer(perfil, "clientes", "crear");

  const clientesFiltrados = clientes.filter((c) => {
    const texto = busquedaCliente.trim().toLowerCase();
    if (!texto) return true;

    return (
      (c.nombre || "").toLowerCase().includes(texto) ||
      String(c.dni || "").toLowerCase().includes(texto) ||
      String(c.telefono || "").toLowerCase().includes(texto)
    );
  });

  const soloLectura =
    (pedido && !puedeEditarPedidos) || (!pedido && !puedeCrearPedidos);

  // 🔹 Cargar lista de clientes
  useEffect(() => {
    const fetchClientes = async () => {
      try {
        if (!perfil) return;

        const clientesRef = collection(db, "clientes");

        const q =
          perfil.rol === "superadmin"
            ? query(clientesRef)
            : query(
                clientesRef,
                where("clienteId", "==", perfil.clienteId)
              );

        const snapshot = await getDocs(q);

        setClientes(
          snapshot.docs.map((docu) => ({
            id: docu.id,
            ...docu.data(),
          }))
        );
      } catch (error) {
        console.error("Error al cargar clientes:", error);
      }
    };

    fetchClientes();
  }, [perfil]);

  useEffect(() => {
    document.body.classList.add("pedido-modal-abierto");

    return () => {
      document.body.classList.remove("pedido-modal-abierto");
    };
  }, []);

  // 🔹 Si estamos editando, precargar datos
useEffect(() => {
  if (pedido) {
    setFormData({
      id: pedido.id || "",
      cliente: pedido.cliente || "",
      clienteDNI: pedido.clienteDNI || "",
      fechaPedido: pedido.fechaPedido || "",
      fechaEntrega: pedido.fechaEntrega || "",
      estado: pedido.estado || "Pendiente",
    });

    setBusquedaCliente(pedido.cliente || "");
  }
}, [pedido]);

  // 🔹 Manejar cambios
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const obtenerSiguienteNumeroPedido = async () => {
    if (!perfil?.clienteId) {
      throw new Error("No se encontró clienteId para generar el número de pedido.");
    }

    const clienteSaasRef = doc(db, "clientes-saas", perfil.clienteId);

    const nuevoNumero = await runTransaction(db, async (transaction) => {
      const clienteSnap = await transaction.get(clienteSaasRef);

      if (!clienteSnap.exists()) {
        throw new Error("No existe el cliente SaaS asociado.");
      }

      const data = clienteSnap.data();
      const ultimoNumeroPedido = Number(data.ultimoNumeroPedido || 0);
      const siguienteNumero = ultimoNumeroPedido + 1;

      transaction.update(clienteSaasRef, {
        ultimoNumeroPedido: siguienteNumero,
        updatedAt: serverTimestamp(),
      });

      return siguienteNumero;
    });

    return nuevoNumero.toString();
  };

  const crearClienteDesdePedido = async () => {
  const nombreLimpio = nuevoCliente.nombre.trim();

  if (!nombreLimpio) {
    setError("El nombre del cliente es obligatorio.");
    return;
  }

  if (!perfil?.clienteId && perfil?.rol !== "superadmin") {
    setError("No se encontró el clienteId del usuario.");
    return;
  }

  try {
    const datosCliente = {
      ...nuevoCliente,
      nombre: nombreLimpio,
      dni: String(nuevoCliente.dni || "").trim(),
      clienteId: perfil?.clienteId || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, "clientes"), datosCliente);

    const clienteCreado = {
      id: ref.id,
      firebaseId: ref.id,
      ...datosCliente,
    };

    setClientes((prev) => [...prev, clienteCreado]);

    seleccionarCliente(clienteCreado);

    setNuevoCliente({
      nombre: "",
      dni: "",
      telefono: "",
      direccion: "",
      localidad: "",
      provincia: "",
      email: "",
    });

    setMostrarModalCliente(false);
    setError("");
  } catch (error) {
    console.error("Error creando cliente desde pedido:", error);
    setError("No se pudo crear el cliente.");
  }
};

const seleccionarCliente = (cliente) => {
  if (!cliente) return;

  setFormData((prev) => ({
    ...prev,
    cliente: cliente.nombre || "",
    clienteDNI: cliente.dni || "",
  }));

  setBusquedaCliente(cliente.nombre || "");
  setClienteSeleccionadoId(cliente.id || cliente.firebaseId || "");
  setMostrarDropdownCliente(false);
};



  // 🔹 Guardar (crear o actualizar)
const guardarPedido = async () => {
  if (loading || exito) return;

  let guardadoCorrecto = false;

    if (!pedido && !puedeCrearPedidos) {
      setError("No tenés permisos para crear pedidos.");
      return;
    }

    if (pedido && !puedeEditarPedidos) {
      setError("No tenés permisos para editar pedidos.");
      return;
    }

    if (!formData.cliente || !formData.fechaPedido) {
      setError("El cliente y la fecha de pedido son obligatorios.");
      return;
    }

    if (!pedido && perfil?.rol !== "superadmin" && !perfil?.clienteId) {
      setError("No se encontró el clienteId del usuario.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const pedidosRef = collection(db, "pedidos");

      // 🔹 EDITAR pedido existente
      if (pedido && pedido.firebaseId) {
        const ref = doc(db, "pedidos", pedido.firebaseId);

        await updateDoc(ref, {
          ...formData,
          clienteBusqueda: (formData.cliente || "").trim().toLowerCase(),
          clienteId: pedido.clienteId || perfil?.clienteId || "",
          updatedAt: serverTimestamp(),
        });

        const pedidoActualizado = {
          ...pedido,
          ...formData,
          clienteId: pedido.clienteId || perfil?.clienteId || "",
        };

        guardadoCorrecto = true;
        setExito(true);

        setTimeout(() => {
          onPedidoCreado(pedidoActualizado);
          onClose();
        }, 1500);

        return;
      }

      
      // 🔹 CREAR nuevo pedido
      const nuevoID =
        perfil?.rol === "superadmin"
          ? Date.now().toString()
          : await obtenerSiguienteNumeroPedido();

      await asegurarColumnasBaseProduccion(perfil?.clienteId || "");
      const columnaInicial = await obtenerColumnaInicialProduccion(perfil?.clienteId || "");

      if (!columnaInicial) {
        throw new Error("No se encontró la columna inicial de producción.");
      }

      const nuevoPedidoData = {
        id: nuevoID,
        cliente: formData.cliente,
        clienteBusqueda: (formData.cliente || "").trim().toLowerCase(),
        clienteDNI: formData.clienteDNI,
        fechaPedido: formData.fechaPedido,
        fechaEntrega: formData.fechaEntrega,
        estado: formData.estado,
        clienteId: perfil?.clienteId || "",

        creadoPorUid: perfil?.uid || perfil?.firebaseUid || "",
        creadoPorNombre: perfil?.nombre || perfil?.displayName || perfil?.email || "",
        creadoPorEmail: perfil?.email || "",
        usuarioNombre: perfil?.nombre || perfil?.displayName || perfil?.email || "",

        // ✅ campos resumen para escalabilidad futura
        cantidadItems: 0,
        totalUnidades: 0,
        montoTotal: 0,
        estadoPago: "Pendiente",

        // ✅ producción
        columnaProduccionId: columnaInicial.id,
        progresoProduccion: 0,
        estadoProduccion: "pendiente",
        produccionFinalizada: false,
        produccionActualizadoAt: serverTimestamp(),
        ultimaAccionProduccionPor: null,
        ultimaAccionProduccionPorNombre: null,
        ultimaAccionProduccionAt: null,

        // ✅ timestamps para orden y paginación
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(pedidosRef, nuevoPedidoData);

      // ✅ Mostrar mensaje de éxito antes de redirigir
      guardadoCorrecto = true;
      setExito(true);

      setTimeout(() => {
        if (onPedidoCreado) {
          onPedidoCreado({
            firebaseId: docRef.id,
            ...nuevoPedidoData,
          });
        }
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error al guardar pedido:", err);
      setError("Hubo un problema al guardar el pedido.");
      } finally {
        if (!guardadoCorrecto) {
          setLoading(false);
        }
      }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{pedido ? "Editar Pedido" : "Nuevo Pedido"}</h2>

        {error && <div className="error">{error}</div>}
        {exito && <div className="success">✅ Pedido guardado con éxito</div>}

       

        <label>Cliente</label>

        <div className="pedido-cliente-row">
          <div className="pedido-cliente-search">
            <input
              type="text"
              value={busquedaCliente}
              placeholder="Escribí para buscar cliente..."
              onFocus={() => setMostrarDropdownCliente(true)}
              onBlur={() => {
                setTimeout(() => setMostrarDropdownCliente(false), 180);
              }}
              onChange={(e) => {
                setBusquedaCliente(e.target.value);
                setClienteSeleccionadoId("");
                setFormData((prev) => ({
                  ...prev,
                  cliente: "",
                  clienteDNI: "",
                }));
                setMostrarDropdownCliente(true);
              }}
              disabled={soloLectura}
            />

            {mostrarDropdownCliente && !soloLectura && (
              <div className="pedido-cliente-dropdown">
                {clientesFiltrados.length > 0 ? (
                  clientesFiltrados.slice(0, 8).map((c) => (
                    <button
                      key={c.id || c.firebaseId}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        seleccionarCliente(c);
                      }}
                    >
                      <strong>{c.nombre || "Sin nombre"}</strong>
                      <span>
                        {c.dni ? `Doc: ${c.dni}` : "Sin documento"}
                        {c.telefono ? ` · Tel: ${c.telefono}` : ""}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="pedido-cliente-empty">
                    No hay clientes que coincidan.
                  </div>
                )}
              </div>
            )}

            {busquedaCliente.trim() && !formData.cliente && !soloLectura && (
              <small className="pedido-cliente-aviso">
                Selecciona un cliente
              </small>
            )}
          </div>

          {puedeCrearClientes && !soloLectura && (
            <button
              type="button"
              className="btn-cliente-pedido"
              onClick={() => {
                setNuevoCliente((prev) => ({
                  ...prev,
                  nombre: busquedaCliente || prev.nombre,
                }));
                setMostrarModalCliente(true);
              }}
            >
              Crear cliente
            </button>
          )}
        </div>

        <label>Fecha de pedido</label>
        <input
          type="date"
          name="fechaPedido"
          value={formData.fechaPedido}
          onChange={handleChange}
          disabled={soloLectura}
        />

        <label>Fecha de entrega</label>
        <input
          type="date"
          name="fechaEntrega"
          value={formData.fechaEntrega}
          onChange={handleChange}
          disabled={soloLectura}
        />





        <div className="modal-buttons">
         
          <button
            className="cancelar"
            onClick={onClose}
            disabled={loading || exito}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardarPedido}
            disabled={loading || exito || soloLectura}
          >
            {loading
              ? "Guardando..."
              : pedido
              ? "Guardar Cambios"
              : "Guardar Pedido"}
          </button>
        </div>
        {mostrarModalCliente && (
          <div className="cliente-mini-overlay" onClick={() => setMostrarModalCliente(false)}>
            <div className="cliente-mini-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Crear cliente</h3>

              <label>Documento de identidad <span className="campo-opcional">(opcional)</span></label>
              <input
                value={nuevoCliente.dni}
                onChange={(e) =>
                  setNuevoCliente((prev) => ({ ...prev, dni: e.target.value }))
                }
                placeholder="Ej: 37256489"
              />

              <label>Nombre y Apellido</label>
              <input
                value={nuevoCliente.nombre}
                onChange={(e) =>
                  setNuevoCliente((prev) => ({ ...prev, nombre: e.target.value }))
                }
                placeholder="Nombre del cliente"
              />

              <label>Teléfono</label>
              <input
                value={nuevoCliente.telefono}
                onChange={(e) =>
                  setNuevoCliente((prev) => ({ ...prev, telefono: e.target.value }))
                }
              />

              <label>Dirección</label>
              <input
                value={nuevoCliente.direccion}
                onChange={(e) =>
                  setNuevoCliente((prev) => ({ ...prev, direccion: e.target.value }))
                }
              />

              <label>Localidad</label>
              <input
                value={nuevoCliente.localidad}
                onChange={(e) =>
                  setNuevoCliente((prev) => ({ ...prev, localidad: e.target.value }))
                }
              />

              <label>Provincia</label>
              <input
                value={nuevoCliente.provincia}
                onChange={(e) =>
                  setNuevoCliente((prev) => ({ ...prev, provincia: e.target.value }))
                }
              />

              <label>Email</label>
              <input
                value={nuevoCliente.email}
                onChange={(e) =>
                  setNuevoCliente((prev) => ({ ...prev, email: e.target.value }))
                }
              />

              <div className="modal-buttons">
                <button
                  type="button"
                  className="cancelar"
                  onClick={() => setMostrarModalCliente(false)}
                >
                  Cancelar
                </button>

                <button type="button" onClick={crearClienteDesdePedido}>
                  Crear cliente
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
