import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCheck, FaEdit, FaTrash, FaPlus, FaPaperclip, FaEye } from "react-icons/fa";
import "./GastosPage.css";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import {
  crearGasto,
  actualizarGasto,
  anularGasto,
  duplicarGasto,
  obtenerGastosPaginados,
  escucharGastosRecientes,
} from "../../firebase/gastos";

const categoriasBase = [
  "Gasto fijo",
  "Gasto variable",
  "Compra de mercadería",
  "Insumos",
  "Servicios",
  "Impuestos",
  "Alquiler",
  "Sueldos",
  "Transporte",
  "Otros",
];

const itemVacio = () => ({
  descripcion: "",
  cantidad: 1,
  precioUnitario: 0,
});

const pagoVacio = () => ({
  monto: 0,
  medioPago: "efectivo",
});

const gastoInicial = {
  fecha: new Date().toISOString().split("T")[0],
  categoria: "",
  proveedor: "",
  comprobanteNumero: "",
  comprobantes: [],
  observaciones: "",
  items: [itemVacio()],
  pagos: [pagoVacio()],
};

export default function GastosPage({ perfil }) {
  const [gastos, setGastos] = useState([]);
  const [ultimoDoc, setUltimoDoc] = useState(null);
const [hayMas, setHayMas] = useState(true);
const [loading, setLoading] = useState(false);
const [guardando, setGuardando] = useState(false);
  const [categorias, setCategorias] = useState(categoriasBase);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [gastoEditando, setGastoEditando] = useState(null);
  const [form, setForm] = useState(gastoInicial);

  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [filtroSaldo, setFiltroSaldo] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroCategoria("");
    setFiltroSaldo("");
    setFechaDesde("");
    setFechaHasta("");
  };

  const [mostrarNuevaCategoria, setMostrarNuevaCategoria] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [categoriaDropdownAbierto, setCategoriaDropdownAbierto] = useState(false);
  const [editandoCategoria, setEditandoCategoria] = useState("");
  const [nombreCategoriaEditando, setNombreCategoriaEditando] = useState("");

  const categoriaDropdownRef = useRef(null);

  useEffect(() => {
    const manejarClickAfuera = (event) => {
      if (
        categoriaDropdownRef.current &&
        !categoriaDropdownRef.current.contains(event.target)
      ) {
        setCategoriaDropdownAbierto(false);
        setMostrarNuevaCategoria(false);
        setEditandoCategoria("");
        setNombreCategoriaEditando("");
      }
    };

    document.addEventListener("mousedown", manejarClickAfuera);

    return () => {
      document.removeEventListener("mousedown", manejarClickAfuera);
    };
  }, []);

  const cargarGastos = async () => {
  try {
    setLoading(true);

    const res = await obtenerGastosPaginados({
      perfil,
      pageSize: 50,
      categoria: filtroCategoria,
      fechaDesde,
      fechaHasta,
    });

    setGastos(res.gastos);
    setUltimoDoc(res.ultimoDoc);
    setHayMas(res.hayMas);
  } catch (error) {
    console.error("Error cargando gastos:", error);
    setGastos([]);
  } finally {
    setLoading(false);
  }
};

    const cargarMasGastos = async () => {
    try {
        if (!ultimoDoc || !hayMas) return;

        const res = await obtenerGastosPaginados({
        perfil,
        ultimoDoc,
        pageSize: 50,
        categoria: filtroCategoria,
        fechaDesde,
        fechaHasta,
        });

        setGastos((prev) => [...prev, ...res.gastos]);
        setUltimoDoc(res.ultimoDoc);
        setHayMas(res.hayMas);
    } catch (error) {
        console.error("Error cargando más gastos:", error);
    }
    };

useEffect(() => {
  if (!perfil?.clienteId) return;

  setLoading(true);

  const unsubscribe = escucharGastosRecientes({
    perfil,
    pageSize: 50,
    categoria: filtroCategoria,
    fechaDesde,
    fechaHasta,
    onData: (res) => {
      setGastos(res.gastos);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
      setLoading(false);
    },
    onError: (error) => {
      console.error("Error escuchando gastos:", error);
      setGastos([]);
      setLoading(false);
    },
  });

  return () => unsubscribe();
}, [perfil?.clienteId, filtroCategoria, fechaDesde, fechaHasta]);

  const abrirNuevoGasto = () => {
    setGastoEditando(null);
    setForm({
      ...gastoInicial,
      fecha: new Date().toISOString().split("T")[0],
      items: [itemVacio()],
    });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setGastoEditando(null);
    setForm({
      ...gastoInicial,
      fecha: new Date().toISOString().split("T")[0],
      items: [itemVacio()],
    });
    setMostrarNuevaCategoria(false);
    setNuevaCategoria("");
    setCategoriaDropdownAbierto(false);
  };

  const actualizarCampo = (campo, valor) => {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  };

  const actualizarItem = (index, campo, valor) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [campo]: valor } : item
      ),
    }));
  };

  const agregarItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, itemVacio()],
    }));
  };

  const eliminarItem = (index) => {
    if (form.items.length === 1) return;

    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const actualizarPago = (index, campo, valor) => {
    setForm((prev) => ({
        ...prev,
        pagos: prev.pagos.map((pago, i) =>
        i === index ? { ...pago, [campo]: valor } : pago
        ),
    }));
    };

    const agregarPago = () => {
    setForm((prev) => ({
        ...prev,
        pagos: [...(prev.pagos || []), pagoVacio()],
    }));
    };

    const eliminarPago = (index) => {
    if ((form.pagos || []).length === 1) return;

    setForm((prev) => ({
        ...prev,
        pagos: prev.pagos.filter((_, i) => i !== index),
    }));
    };

    const agregarComprobantes = (archivos) => {
        const lista = Array.from(archivos || []);

        if (!lista.length) return;

        const nuevos = lista.map((archivo) => ({
            id: crypto.randomUUID(),
            nombre: archivo.name,
            tipo: archivo.type,
            size: archivo.size,
            archivo,
            urlTemporal: URL.createObjectURL(archivo),
        }));

        setForm((prev) => ({
            ...prev,
            comprobantes: [...(prev.comprobantes || []), ...nuevos],
        }));
        };

        const eliminarComprobante = (comprobanteId) => {
        setForm((prev) => ({
            ...prev,
            comprobantes: (prev.comprobantes || []).filter(
            (c) => c.id !== comprobanteId
            ),
        }));
        };

const verComprobante = (comprobante) => {
  if (comprobante?.urlTemporal) {
    window.open(comprobante.urlTemporal, "_blank");
    return;
  }

  if (comprobante?.url) {
    window.open(comprobante.url, "_blank");
  }
};

  const itemsNormalizados = useMemo(() => {
    return (form.items || []).map((item) => {
      const cantidad = Number(item.cantidad || 0);
      const precioUnitario = Number(item.precioUnitario || 0);

      return {
        ...item,
        cantidad,
        precioUnitario,
        subtotal: cantidad * precioUnitario,
      };
    });
  }, [form.items]);

  const totalModal = useMemo(() => {
    return itemsNormalizados.reduce(
      (acc, item) => acc + Number(item.subtotal || 0),
      0
    );
  }, [itemsNormalizados]);

  const totalPagadoModal = useMemo(() => {
    return (form.pagos || []).reduce(
        (acc, pago) => acc + Number(pago.monto || 0),
        0
    );
    }, [form.pagos]);

    const saldoModal = useMemo(() => {
    const saldo = totalModal - totalPagadoModal;
    return saldo < 0 ? 0 : saldo;
    }, [totalModal, totalPagadoModal]);

  const seleccionarCategoria = (cat) => {
    actualizarCampo("categoria", cat);
    setMostrarNuevaCategoria(false);
    setNuevaCategoria("");
    setCategoriaDropdownAbierto(false);
  };

  const guardarNuevaCategoriaDropdown = () => {
    const nombre = nuevaCategoria.trim();
    if (!nombre) return;

    const existente = categorias.find(
      (cat) => cat.toLowerCase() === nombre.toLowerCase()
    );

    const categoriaFinal = existente || nombre;

    if (!existente) {
      setCategorias((prev) => [categoriaFinal, ...prev]);
    }

    seleccionarCategoria(categoriaFinal);
  };

  const guardarEdicionCategoria = (categoriaOriginal) => {
    const nuevoNombre = nombreCategoriaEditando.trim();
    if (!nuevoNombre) return;

    setCategorias((prev) =>
      prev.map((cat) => (cat === categoriaOriginal ? nuevoNombre : cat))
    );

    setGastos((prev) =>
      prev.map((g) =>
        g.categoria === categoriaOriginal ? { ...g, categoria: nuevoNombre } : g
      )
    );

    if (form.categoria === categoriaOriginal) {
      actualizarCampo("categoria", nuevoNombre);
    }

    if (filtroCategoria === categoriaOriginal) {
      setFiltroCategoria(nuevoNombre);
    }

    setEditandoCategoria("");
    setNombreCategoriaEditando("");
  };

  const eliminarCategoria = (categoria) => {
    const confirmar = window.confirm(`¿Eliminar la categoría "${categoria}"?`);
    if (!confirmar) return;

    setCategorias((prev) => prev.filter((cat) => cat !== categoria));

    if (form.categoria === categoria) {
      actualizarCampo("categoria", "");
    }

    if (filtroCategoria === categoria) {
      setFiltroCategoria("");
    }
  };

  const guardarGasto = async () => {
    if (!form.fecha) {
      alert("Seleccioná una fecha.");
      return;
    }

    if (!form.categoria) {
      alert("Seleccioná una categoría.");
      return;
    }

    const itemsValidos = itemsNormalizados.filter(
      (item) =>
        item.descripcion.trim() &&
        Number(item.cantidad) > 0 &&
        Number(item.precioUnitario) >= 0
    );

    if (!itemsValidos.length) {
      alert("Agregá al menos un ítem válido.");
      return;
    }

    if (totalModal <= 0) {
      alert("El total del gasto debe ser mayor a 0.");
      return;
    }

    const descripcionResumen =
      itemsValidos.length === 1
        ? itemsValidos[0].descripcion
        : `${itemsValidos.length} ítems`;

    const gastoNormalizado = {
      fecha: form.fecha,
      categoria: form.categoria,
      proveedor: form.proveedor || "",
      comprobanteNumero: form.comprobanteNumero || "",
      comprobantes: form.comprobantes || [],
      observaciones: form.observaciones || "",
      medioPago: form.medioPago || "",
      descripcion: descripcionResumen,
        items: itemsValidos,
        pagos: (form.pagos || []).map((pago) => ({
        monto: Number(pago.monto || 0),
        medioPago: pago.medioPago || "efectivo",
        })),
        total: totalModal,
        totalPagado: totalPagadoModal,
        saldo: saldoModal,
        monto: totalModal,
      activo: true,
      creadoPor: perfil?.uid || perfil?.firebaseUid || "",
      creadoPorNombre: perfil?.nombre || perfil?.email || "",
      clienteId: perfil?.clienteId || "",
    };

    try {
    setGuardando(true);

    if (gastoEditando?.firebaseId) {
        await actualizarGasto({
        perfil,
        gastoId: gastoEditando.firebaseId,
        gasto: gastoNormalizado,
        });
    } else {
        await crearGasto({
        perfil,
        gasto: gastoNormalizado,
        });
    }

    cerrarModal();
    await cargarGastos();
    } catch (error) {
    console.error("Error guardando gasto:", error);
    alert(error.message || "No se pudo guardar el gasto.");
    } finally {
    setGuardando(false);
    }

    
  };

  const editarGasto = (gasto) => {
    setGastoEditando(gasto);
    setForm({
      fecha: gasto.fecha || "",
      categoria: gasto.categoria || "",
      proveedor: gasto.proveedor || "",
      comprobanteNumero: gasto.comprobanteNumero || "",
      comprobantes: gasto.comprobantes || [],
      observaciones: gasto.observaciones || "",
      
      items: gasto.items?.length
        ? gasto.items.map((item) => ({
            descripcion: item.descripcion || "",
            cantidad: item.cantidad || 1,
            precioUnitario: item.precioUnitario || 0,
          }))
        : [
            {
              descripcion: gasto.descripcion || "",
              cantidad: 1,
              precioUnitario: gasto.monto || 0,
            },
          ],
      pagos: gasto.pagos?.length
        ? gasto.pagos.map((pago) => ({
            monto: pago.monto || 0,
            medioPago: pago.medioPago || "efectivo",
            }))
        : [
            {
                monto: gasto.total || gasto.monto || 0,
                medioPago: gasto.medioPago || "efectivo",
            },
            ],    
    });
    setModalAbierto(true);
  };

const anularGastoLocal = async (gasto) => {
  const confirmar = window.confirm("¿Querés anular este gasto?");
  if (!confirmar) return;

  try {
    await anularGasto({
      perfil,
      gastoId: gasto.firebaseId,
      motivo: "",
    });

    await cargarGastos();
  } catch (error) {
    console.error("Error anulando gasto:", error);
    alert("No se pudo anular el gasto.");
  }
};

const duplicarGastoLocal = async (gasto) => {
  try {
    await duplicarGasto({
      perfil,
      gasto,
    });

    await cargarGastos();
  } catch (error) {
    console.error("Error duplicando gasto:", error);
    alert("No se pudo duplicar el gasto.");
  }
};

  const gastosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return gastos.filter((g) => {
      const coincideTexto =
        !texto ||
        String(g.descripcion || "").toLowerCase().includes(texto) ||
        String(g.proveedor || "").toLowerCase().includes(texto) ||
        String(g.medioPago || "").toLowerCase().includes(texto) ||
        (g.items || []).some((item) =>
          String(item.descripcion || "").toLowerCase().includes(texto)
        );

      const coincideCategoria =
        !filtroCategoria || g.categoria === filtroCategoria;

      const coincideDesde = !fechaDesde || g.fecha >= fechaDesde;
        const coincideHasta = !fechaHasta || g.fecha <= fechaHasta;

        const total = Number(g.total || g.monto || 0);
        const totalPagado = Number(g.totalPagado || 0);
        const saldo = Number(g.saldo || 0);
        const saldoAFavor = totalPagado > total ? totalPagado - total : 0;

        const coincideSaldo =
        !filtroSaldo ||
        (filtroSaldo === "pendiente" && saldo > 0) ||
        (filtroSaldo === "a_favor" && saldoAFavor > 0) ||
        (filtroSaldo === "cero" && saldo === 0 && saldoAFavor === 0);

        return (
        coincideTexto &&
        coincideCategoria &&
        coincideDesde &&
        coincideHasta &&
        coincideSaldo
        );
    });
  }, [gastos, busqueda, filtroCategoria, filtroSaldo, fechaDesde, fechaHasta]);

  const totalGastos = useMemo(() => {
    return gastosFiltrados
      .filter((g) => g.activo !== false)
      .reduce((acc, g) => acc + Number(g.total || g.monto || 0), 0);
  }, [gastosFiltrados]);

  const formatearMonto = (valor) => {
    return Number(valor || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: perfil?.moneda || "ARS",
      maximumFractionDigits: 0,
    });
  };

  return (
    <div className="clientes-lista gastos-page">
      <div className="encabezado-lista">
        <div>
          <h1>Gastos</h1>
          
        </div>

        <button className="btn btn-primary" onClick={abrirNuevoGasto}>
          + Nuevo gasto
        </button>
      </div>

      <div className="container-secundaria">
        <h3 style={{ marginTop: 0 }}>Listado de gastos</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label>Buscar</label>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Descripción, proveedor..."
            />
          </div>

          <div>
            <label>Categoría</label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas</option>
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Saldo</label>
            <select
                value={filtroSaldo}
                onChange={(e) => setFiltroSaldo(e.target.value)}
            >
                <option value="">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="a_favor">A favor</option>
                <option value="cero">$0</option>
            </select>
          </div>

          <div>
            <label>Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>

          <div>
            <label>Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
            {(busqueda ||
            filtroCategoria ||
            filtroSaldo ||
            fechaDesde ||
            fechaHasta) && (
            <div
            style={{
                display: "flex",
                alignItems: "center",
            }}
            >
                <button
                type="button"
                className="btn btn-secundario"
                onClick={limpiarFiltros}
                 style={{
                    transform: "translateY(-12px)",
                 }}
                >
                Limpiar
                </button>
            </div>
            )}
        </div>

 

        <div style={{ width: "100%", overflowX: "auto", marginTop: 16 }}>
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Categoría</th>
                <th>Descripción</th>
                <th>Proveedor</th>
                <th>Medio</th>
                <th>Total</th>
                <th>Saldo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {gastosFiltrados.map((g) => (
                <tr
                key={g.firebaseId}
                onClick={() => editarGasto(g)}
                style={{
                    opacity: g.activo === false ? 0.55 : 1,
                    cursor: "pointer",
                }}
                >
                  <td>{g.fecha}</td>
                  <td>{g.categoria}</td>
                  <td>{g.descripcion}</td>
                  <td>{g.proveedor || "-"}</td>
                  <td>{g.medioPago || "-"}</td>
                  <td>{formatearMonto(g.total || g.monto)}</td>

                    <td>
                    {(() => {
                        const saldo = Number(g.saldo || 0);
                        const totalPagado = Number(g.totalPagado || 0);
                        const total = Number(g.total || g.monto || 0);
                        const saldoAFavor = totalPagado > total ? totalPagado - total : 0;

                        let texto = "$0";
                        let bg = "#dcfce7";
                        let color = "#166534";

                        if (saldo > 0) {
                        texto = `Debe ${formatearMonto(saldo)}`;
                        bg = "#fee2e2";
                        color = "#991b1b";
                        }

                        if (saldoAFavor > 0) {
                        texto = `A favor ${formatearMonto(saldoAFavor)}`;
                        bg = "#dbeafe";
                        color = "#1e40af";
                        }

                        return (
                        <span
                            style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: bg,
                            color,
                            fontWeight: 700,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            }}
                        >
                            {texto}
                        </span>
                        );
                    })()}
                    </td>

                    <td>{g.activo === false ? "Anulado" : "Activo"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                        onVer={() => editarGasto(g)}
                        onEditar={() => editarGasto(g)}
                        onDuplicar={() => duplicarGastoLocal(g)}
                        onEliminar={
                        g.activo !== false
                            ? () => anularGastoLocal(g)
                            : null
                        }
                    />
                    </td>
                </tr>
              ))}

              {gastosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: "center", padding: 18 }}>
                    Todavía no hay gastos cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hayMas && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={cargarMasGastos}>
                Cargar más
                </button>
            </div>
           )}
        </div>
      </div>

      

      {modalAbierto && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 1000 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  {gastoEditando ? "Editar gasto" : "Nuevo gasto"}
                </h2>
                <p style={{ margin: "6px 0 0", color: "#666" }}>
                  Cargá uno o varios ítems del gasto.
                </p>
              </div>

              <button className="btn btn-secondary" onClick={cerrarModal}>
                Cerrar
              </button>
            </div>

            <div
                style={{
                display: "grid",
                gridTemplateColumns: "160px minmax(240px, 1fr) minmax(220px, 1fr) minmax(220px, 1fr)",
                gap: 12,
                alignItems: "end",
                }}
            >
              <div>
                <label>Fecha</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => actualizarCampo("fecha", e.target.value)}
                />
              </div>

                <div
                ref={categoriaDropdownRef}
                style={{
                    position: "relative",
                    width: "100%",
                }}
                >
                <label>Categoría</label>

                <div
                  onClick={() => setCategoriaDropdownAbierto((prev) => !prev)}
                    style={{
                    width: "100%",
                    height: 38,
                    padding: "0 12px",
                    border: "1px solid #d3d9de",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 14,
                    }}
                >
                  <span style={{ color: form.categoria ? "#1a1a1a" : "#777" }}>
                    {form.categoria || "Seleccionar"}
                  </span>
                  <span style={{ color: "#0096d1" }}>▾</span>
                </div>

                {categoriaDropdownAbierto && (
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
                        setMostrarNuevaCategoria(true);
                        setNuevaCategoria("");
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
                        background: mostrarNuevaCategoria ? "#eaf7ff" : "transparent",
                        marginBottom: 4,
                      }}
                    >
                      <FaPlus size={14} />
                      Nueva categoría
                    </div>

                    {mostrarNuevaCategoria && (
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
                          value={nuevaCategoria}
                          onChange={(e) => setNuevaCategoria(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              guardarNuevaCategoriaDropdown();
                            }

                            if (e.key === "Escape") {
                              setMostrarNuevaCategoria(false);
                              setNuevaCategoria("");
                            }
                          }}
                          placeholder="Crear categoría"
                          style={{
                            marginBottom: 0,
                            borderColor: "#0096d1",
                            boxShadow: "0 0 0 2px rgba(0,150,209,0.12)",
                          }}
                        />

                        {nuevaCategoria.trim() && (
                          <button
                            type="button"
                            onClick={guardarNuevaCategoriaDropdown}
                            style={{
                              padding: 0,
                              margin: 0,
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: "transparent",
                              color: "#0096d1",
                            }}
                            title="Confirmar categoría"
                          >
                            <FaCheck size={14} />
                          </button>
                        )}
                      </div>
                    )}

                    {categorias.map((cat) => (
                      <div
                        key={cat}
                        onClick={() => seleccionarCategoria(cat)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) 34px 34px",
                          gap: 10,
                          alignItems: "center",
                          padding: "12px 14px",
                          borderRadius: 10,
                          cursor: "pointer",
                          background: form.categoria === cat ? "#eaf7ff" : "transparent",
                          marginBottom: 2,
                        }}
                      >
                        {editandoCategoria === cat ? (
                          <input
                            autoFocus
                            value={nombreCategoriaEditando}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setNombreCategoriaEditando(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                guardarEdicionCategoria(cat);
                              }

                              if (e.key === "Escape") {
                                setEditandoCategoria("");
                                setNombreCategoriaEditando("");
                              }
                            }}
                            style={{ marginBottom: 0 }}
                          />
                        ) : (
                          <span>{cat}</span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();

                            if (editandoCategoria === cat) {
                              guardarEdicionCategoria(cat);
                            } else {
                              setEditandoCategoria(cat);
                              setNombreCategoriaEditando(cat);
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
                          title="Editar categoría"
                        >
                          {editandoCategoria === cat ? (
                            <FaCheck size={14} />
                          ) : (
                            <FaEdit size={15} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            eliminarCategoria(cat);
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
                          title="Eliminar categoría"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label>Proveedor opcional</label>
                <input
                  value={form.proveedor}
                  onChange={(e) => actualizarCampo("proveedor", e.target.value)}
                  placeholder="Ej: Textil Norte"
                />
              </div>

            <div className="gastos-comprobante-row">
            <label>N° comprobante / factura</label>

            <div className="gastos-comprobante-wrap">
                <input
                value={form.comprobanteNumero}
                onChange={(e) =>
                    actualizarCampo("comprobanteNumero", e.target.value)
                }
                placeholder="Ej: Factura A 0001-00001234"
                />

                <label
                className="gastos-adjunto-btn"
                title="Adjuntar comprobante"
                >
                <FaPaperclip size={15} />

                <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                    agregarComprobantes(e.target.files);
                    e.target.value = "";
                    }}
                />
                </label>
            </div>

            {(form.comprobantes || []).length > 0 && (
                <div className="gastos-adjuntos-lista">
                {(form.comprobantes || []).map((comp) => (
                    <div key={comp.id} className="gastos-adjunto-chip">
                    <span className="gastos-adjunto-nombre" title={comp.nombre}>
                        {comp.nombre}
                    </span>

                    <button
                        type="button"
                        className="gastos-adjunto-icon-btn"
                        onClick={() => verComprobante(comp)}
                        title="Ver comprobante"
                    >
                        <FaEye size={12} />
                    </button>

                    <button
                        type="button"
                        className="gastos-adjunto-icon-btn"
                        onClick={() => eliminarComprobante(comp.id)}
                        title="Quitar comprobante"
                    >
                        ×
                    </button>
                    </div>
                ))}
                </div>
            )}
            </div>

               <div className="gastos-observaciones">
                    <label>Observaciones</label>
                    <textarea
                        value={form.observaciones}
                        onChange={(e) => actualizarCampo("observaciones", e.target.value)}
                        placeholder="Notas internas del gasto, aclaraciones o detalles adicionales..."
                        rows={3}
                    />
                </div>

             
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <h3 style={{ marginTop: 0 }}>Ítems del gasto</h3>

                <button className="btn btn-primary" onClick={agregarItem}>
                  + Agregar ítem
                </button>
              </div>

              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Cant.</th>
                      <th>Precio</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {itemsNormalizados.map((item, index) => (
                      <tr key={`item-${index}`}>
                        <td>
                          <input
                            value={item.descripcion}
                            onChange={(e) =>
                              actualizarItem(index, "descripcion", e.target.value)
                            }
                            placeholder="Ej: Tela, tinta, servicio..."
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) =>
                              actualizarItem(index, "cantidad", e.target.value)
                            }
                            min="0"
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            value={item.precioUnitario}
                            onChange={(e) =>
                              actualizarItem(index, "precioUnitario", e.target.value)
                            }
                            min="0"
                          />
                        </td>

                        <td>{formatearMonto(item.subtotal)}</td>

                        <td>
                          <button
                            className="btn"
                            onClick={() => eliminarItem(index)}
                            disabled={form.items.length === 1}
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>


              <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 18,
                }}
                >
                <div
                    style={{
                    width: 340,
                    padding: 16,
                    borderRadius: 14,
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    display: "grid",
                    gap: 10,
                    }}
                >
                    <h3 style={{ margin: 0 }}>Resumen</h3>

                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subtotal</span>
                    <strong>{formatearMonto(totalModal)}</strong>
                    </div>

                    <div
                    style={{
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 10,
                        display: "grid",
                        gap: 8,
                    }}
                    >
                    <strong>Pagos iniciales</strong>

                    {(form.pagos || []).map((pago, index) => (
                        <div
                        key={`${pago.medioPago}-${index}`}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 28px",
                            gap: 8,
                            alignItems: "center",
                        }}
                        >
                        <input
                            type="number"
                            value={pago.monto}
                            onChange={(e) =>
                            actualizarPago(index, "monto", e.target.value)
                            }
                            min="0"
                            placeholder="0"
                            style={{ marginBottom: 0 }}
                        />

                        <select
                            value={pago.medioPago}
                            onChange={(e) =>
                            actualizarPago(index, "medioPago", e.target.value)
                            }
                            style={{ marginBottom: 0 }}
                        >
                            <option value="efectivo">Efectivo</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="debito">Débito</option>
                            <option value="credito">Crédito</option>
                            <option value="mercado_pago">Mercado Pago</option>
                            <option value="otro">Otro</option>
                        </select>

                        <button
                            type="button"
                            onClick={() => eliminarPago(index)}
                            disabled={(form.pagos || []).length === 1}
                            style={{
                            padding: 0,
                            margin: 0,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "transparent",
                            color: "#0096d1",
                            fontSize: 18,
                            }}
                        >
                            ×
                        </button>
                        </div>
                    ))}

                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={agregarPago}
                        style={{
                        width: "100%",
                        margin: 0,
                        }}
                    >
                        + Agregar otro pago
                    </button>
                    </div>

                    <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 10,
                    }}
                    >
                    <span>Total pagado</span>
                    <strong>{formatearMonto(totalPagadoModal)}</strong>
                    </div>

                    <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontWeight: 800,
                        fontSize: 16,
                    }}
                    >
                    <span>Saldo pendiente</span>
                    <span>{formatearMonto(saldoModal)}</span>
                    </div>
                </div>
                </div>
              </div>
            

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
                flexWrap: "wrap",
              }}
            >
              <button className="btn btn-secondary" onClick={cerrarModal}>
                Cancelar
              </button>

                <button
                className="btn btn-primary"
                onClick={guardarGasto}
                disabled={guardando}
                >
                {guardando
                    ? "Guardando..."
                    : gastoEditando
                    ? "Guardar cambios"
                    : "Guardar gasto"}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}