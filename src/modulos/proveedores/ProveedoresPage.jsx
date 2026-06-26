import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCheck, FaEdit, FaTrash, FaPlus } from "react-icons/fa";
import {
  escucharProveedores,
  crearProveedor,
  actualizarProveedor,
  cambiarEstadoProveedor,
} from "../../firebase/proveedores";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import "./ProveedoresPage.css";
import { puedeHacer } from "../../utils/permisos";


const RUBROS_BASE = [
  "Telas",
  "Insumos",
  "Tintas",
  "Avíos",
  "Packaging",
  "Transporte",
  "Servicios",
  "Maquinaria",
];

export default function ProveedoresPage({ perfil }) {

const puedeCrearProveedores = puedeHacer(perfil, "proveedores", "crear");
const puedeEditarProveedores = puedeHacer(perfil, "proveedores", "editar");
const puedeAnularProveedores = puedeHacer(perfil, "proveedores", "anular");
     
  const [proveedores, setProveedores] = useState([]);
  
  const [busqueda, setBusqueda] = useState("");
  const [rubroFiltro, setRubroFiltro] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [proveedorEditando, setProveedorEditando] = useState(null);

  const [form, setForm] = useState({
    nombre: "",
    cuit: "",
    telefono: "",
    email: "",
    web: "",
    direccion: "",
    localidad: "",
    provincia: "",
    observaciones: "",
    rubros: [],
  });

  const [nuevoRubro, setNuevoRubro] = useState("");
  const [rubroDropdownAbierto, setRubroDropdownAbierto] = useState(false);

    const [mostrarNuevoRubro, setMostrarNuevoRubro] = useState(false);

    const [editandoRubro, setEditandoRubro] = useState("");

    const [nombreRubroEditando, setNombreRubroEditando] = useState("");

    const rubroDropdownRef = useRef(null);

    useEffect(() => {
        const manejarClickAfuera = (event) => {
            if (
            rubroDropdownRef.current &&
            !rubroDropdownRef.current.contains(event.target)
            ) {
            setRubroDropdownAbierto(false);
            setMostrarNuevoRubro(false);
            setEditandoRubro("");
            setNombreRubroEditando("");
            }
        };

        document.addEventListener("mousedown", manejarClickAfuera);

        return () => {
            document.removeEventListener("mousedown", manejarClickAfuera);
        };
        }, []);

  useEffect(() => {
    const unsub = escucharProveedores({
      perfil,
      onData: setProveedores,
      onError: console.error,
    });

    return () => unsub();
  }, [perfil]);

const rubrosDisponibles = useMemo(() => {
  const existentes = proveedores.flatMap((p) =>
    Array.isArray(p.rubros) ? p.rubros : []
  );

  return [...new Set([...RUBROS_BASE, ...existentes, ...form.rubros])].sort();
}, [proveedores, form.rubros]);

  const limpiarForm = () => {
    setForm({
      nombre: "",
      cuit: "",
      telefono: "",
      email: "",
      web: "",
      direccion: "",
      localidad: "",
      provincia: "",
      observaciones: "",
      rubros: [],
    });

    setProveedorEditando(null);
    setNuevoRubro("");
  };

const abrirNuevo = () => {
  if (!puedeCrearProveedores) return;

  limpiarForm();
  setModalAbierto(true);
};

  const abrirEditar = (proveedor) => {
  if (!puedeEditarProveedores) return;
    setProveedorEditando(proveedor);

    setForm({
      nombre: proveedor.nombre || "",
      cuit: proveedor.cuit || "",
      telefono: proveedor.telefono || "",
      email: proveedor.email || "",
      web: proveedor.web || "",
      direccion: proveedor.direccion || "",
      localidad: proveedor.localidad || "",
      provincia: proveedor.provincia || "",
      observaciones: proveedor.observaciones || "",
      rubros: proveedor.rubros || [],
    });

    setModalAbierto(true);
  };

  const guardarProveedor = async () => {
    try {
      if (proveedorEditando) {
        await actualizarProveedor({
          perfil,
          proveedorId: proveedorEditando.firebaseId,
          proveedor: form,
        });
      } else {
        await crearProveedor({
          perfil,
          proveedor: form,
        });
      }

      setModalAbierto(false);
      limpiarForm();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  const toggleRubro = (rubro) => {
    setForm((prev) => ({
      ...prev,
      rubros: prev.rubros.includes(rubro)
        ? prev.rubros.filter((r) => r !== rubro)
        : [...prev.rubros, rubro],
    }));
  };

 const agregarRubroPersonalizado = () => {
  const valor = nuevoRubro.trim();
  if (!valor) return;

  if (!form.rubros.includes(valor)) {
    setForm((prev) => ({
      ...prev,
      rubros: [...prev.rubros, valor],
    }));
  }

  setNuevoRubro("");
  setMostrarNuevoRubro(false);
};

const guardarEdicionRubro = (rubroOriginal) => {
  const nuevoNombre = nombreRubroEditando.trim();
  if (!nuevoNombre) return;

  setForm((prev) => ({
    ...prev,
    rubros: prev.rubros.map((r) =>
      r === rubroOriginal ? nuevoNombre : r
    ),
  }));

  setEditandoRubro("");
  setNombreRubroEditando("");
};

const eliminarRubro = (rubro) => {
  const confirmar = window.confirm(`¿Eliminar el rubro "${rubro}"?`);
  if (!confirmar) return;

  setForm((prev) => ({
    ...prev,
    rubros: prev.rubros.filter((r) => r !== rubro),
  }));

  if (rubroFiltro === rubro) {
    setRubroFiltro("");
  }
};
  

  const proveedoresFiltrados = proveedores.filter((p) => {
    const texto = busqueda.toLowerCase();

    const coincideBusqueda =
      !texto ||
      p.nombre?.toLowerCase().includes(texto) ||
      p.cuit?.toLowerCase().includes(texto) ||
      p.telefono?.toLowerCase().includes(texto);

    const coincideRubro =
      !rubroFiltro ||
      (Array.isArray(p.rubros) && p.rubros.includes(rubroFiltro));

    return coincideBusqueda && coincideRubro;
  });

  return (
    <div className="config-productos">
      <h1>Proveedores</h1>

      <div className="productos-toolbar">
        <input
          className="productos-buscador"
          placeholder="Buscar proveedor..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <select
          value={rubroFiltro}
          onChange={(e) => setRubroFiltro(e.target.value)}
        >
          <option value="">Todos los rubros</option>

          {rubrosDisponibles.map((rubro) => (
            <option key={rubro} value={rubro}>
              {rubro}
            </option>
          ))}
        </select>

            {puedeCrearProveedores && (
            <button className="btn-nuevo" onClick={abrirNuevo}>
                + Nuevo proveedor
            </button>
            )}
      </div>

      <table className="tabla-config">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Identificación</th>
            <th>Teléfono</th>
            <th>Rubros</th>
            <th>Estado</th>
            <th style={{ textAlign: "right" }}>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {proveedoresFiltrados.map((p) => (
            <tr
                key={p.firebaseId}
                className={p.activo === false ? "fila-inactiva" : ""}
                className="fila-clickable"
                onClick={() => {
                if (puedeEditarProveedores) abrirEditar(p);
                }}
            >
              <td>{p.nombre}</td>
              <td>{p.cuit || "-"}</td>
              <td>{p.telefono || "-"}</td>
              <td>{(p.rubros || []).join(", ") || "-"}</td>
              <td>
                <span
                    className={
                    p.activo === false
                        ? "badge-inactivo"
                        : "badge-activo"
                    }
                >
                    {p.activo === false ? "INACTIVO" : "ACTIVO"}
                </span>
                </td>

              <td
                style={{ textAlign: "right" }}
                onClick={(e) => e.stopPropagation()}
                >
                {(puedeEditarProveedores || puedeAnularProveedores) && (
                <ActionMenu
                    onEditar={
                    puedeEditarProveedores ? () => abrirEditar(p) : undefined
                    }
                    onCambiarEstado={
                    puedeAnularProveedores
                        ? () =>
                            cambiarEstadoProveedor({
                            perfil,
                            proveedor: p,
                            })
                        : undefined
                    }
                    labelCambiarEstado={
                    p.activo === false ? "Reactivar" : "Desactivar"
                    }
                />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modalAbierto && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>
              {proveedorEditando
                ? "Editar proveedor"
                : "Nuevo proveedor"}
            </h2>

            <div className="form-grid">
              <input
                placeholder="Nombre"
                value={form.nombre}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    nombre: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Identificación fiscal / CUIT / RUC / NIT"
                value={form.cuit}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    cuit: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Teléfono"
                value={form.telefono}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    telefono: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Sitio web"
                value={form.web}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    web: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Dirección"
                value={form.direccion}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    direccion: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Localidad"
                value={form.localidad}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    localidad: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Provincia"
                value={form.provincia}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    provincia: e.target.value,
                  }))
                }
              />
            </div>

            <h3>Rubros</h3>

           <div
                ref={rubroDropdownRef}
                style={{
                    position: "relative",
                width: "100%",
                marginBottom: 14,
            }}
            >
            <div
                onClick={() => setRubroDropdownAbierto((prev) => !prev)}
                style={{
                width: "100%",
                minHeight: 38,
                padding: "8px 12px",
                border: "1px solid #d3d9de",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                }}
            >
                <span style={{ color: form.rubros.length ? "#1a1a1a" : "#777" }}>
                {form.rubros.length
                    ? form.rubros.join(", ")
                    : "Seleccionar rubros"}
                </span>

                <span style={{ color: "#0096d1" }}>▾</span>
            </div>

            {rubroDropdownAbierto && (
                <div
                style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    minWidth: 320,
                    background: "#fff",
                    border: "1px solid #d3d9de",
                    borderRadius: 12,
                    boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
                    zIndex: 3000,
                    maxHeight: 320,
                    overflowY: "auto",
                    padding: 8,
                }}
                >
                <div
                    onClick={(e) => {
                    e.stopPropagation();
                    setMostrarNuevoRubro(true);
                    setNuevoRubro("");
                    }}
                    style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    color: "#0096d1",
                    fontWeight: 700,
                    background: mostrarNuevoRubro ? "#eaf7ff" : "transparent",
                    marginBottom: 4,
                    }}
                >
                    <FaPlus size={14} />
                    Nuevo rubro
                </div>

                {mostrarNuevoRubro && (
                    <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 30px",
                        gap: 8,
                        alignItems: "center",
                        padding: "6px 8px 10px",
                    }}
                    >
                    <input
                        autoFocus
                        value={nuevoRubro}
                        onChange={(e) => setNuevoRubro(e.target.value)}
                        onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            agregarRubroPersonalizado();
                        }

                        if (e.key === "Escape") {
                            setMostrarNuevoRubro(false);
                            setNuevoRubro("");
                        }
                        }}
                        placeholder="Crear rubro"
                        style={{
                        marginBottom: 0,
                        borderColor: "#0096d1",
                        boxShadow: "0 0 0 2px rgba(0,150,209,0.12)",
                        }}
                    />

                    {nuevoRubro.trim() && (
                        <button
                        type="button"
                        onClick={agregarRubroPersonalizado}
                        style={{
                            padding: 0,
                            margin: 0,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "transparent",
                            color: "#0096d1",
                        }}
                        title="Confirmar rubro"
                        >
                        <FaCheck size={14} />
                        </button>
                    )}
                    </div>
                )}

                {rubrosDisponibles.map((rubro) => {
                    const seleccionado = form.rubros.includes(rubro);

                    return (
                    <div
                        key={rubro}
                        onClick={() => toggleRubro(rubro)}
                        style={{
                        display: "grid",
                        gridTemplateColumns: "24px minmax(0, 1fr) 34px 34px",
                        gap: 10,
                        alignItems: "center",
                        padding: "12px 14px",
                        borderRadius: 10,
                        cursor: "pointer",
                        background: seleccionado ? "#eaf7ff" : "transparent",
                        marginBottom: 2,
                        }}
                    >
                        <span
                        style={{
                            color: seleccionado ? "#0096d1" : "#94a3b8",
                            fontWeight: 800,
                        }}
                        >
                        {seleccionado ? "✓" : ""}
                        </span>

                        {editandoRubro === rubro ? (
                        <input
                            autoFocus
                            value={nombreRubroEditando}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setNombreRubroEditando(e.target.value)}
                            onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                guardarEdicionRubro(rubro);
                            }

                            if (e.key === "Escape") {
                                setEditandoRubro("");
                                setNombreRubroEditando("");
                            }
                            }}
                            style={{ marginBottom: 0 }}
                        />
                        ) : (
                        <span>{rubro}</span>
                        )}

                        <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();

                            if (editandoRubro === rubro) {
                            guardarEdicionRubro(rubro);
                            } else {
                            setEditandoRubro(rubro);
                            setNombreRubroEditando(rubro);
                            }
                        }}
                        style={{
                            padding: 0,
                            margin: 0,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "transparent",
                            color: "#0096d1",
                        }}
                        title="Editar rubro"
                        >
                        {editandoRubro === rubro ? (
                            <FaCheck size={14} />
                        ) : (
                            <FaEdit size={15} />
                        )}
                        </button>

                        <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            eliminarRubro(rubro);
                        }}
                        style={{
                            padding: 0,
                            margin: 0,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "transparent",
                            color: "#0096d1",
                        }}
                        title="Eliminar rubro"
                        >
                        <FaTrash size={14} />
                        </button>
                    </div>
                    );
                })}
                </div>
            )}
            </div>    

            <textarea
              rows={4}
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  observaciones: e.target.value,
                }))
              }
            />
            <div className="modal-buttons">
            <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalAbierto(false)}
            >
                Cancelar
            </button>

            <button
                type="button"
                className="btn btn-primary"
                onClick={guardarProveedor}
            >
                Guardar
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

