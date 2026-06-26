import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Tags,
  Package,
  Layers,
  Pencil,
  Trash2,
  Power,
  ArrowLeft,
  BadgeDollarSign,
  ListChecks,
  Sparkles,
  Copy,
  Star,
} from "lucide-react";
import {
  obtenerListasPrecios,
  crearListaPrecio,
  actualizarListaPrecio,
  eliminarListaPrecio,
  obtenerProductosBase,
  marcarListaPrecioPredeterminada,
  duplicarListaPrecio,
} from "../../firebase/listasPrecios";

import "./ListasPreciosPage.css";

const productoVacio = {
  productoBaseId: "",
  nombre: "",
  tipoProducto: "personalizado",
  precioBase: "",
  reglasCantidad: [],
  adicionales: [],
  activo: true,
};

export default function ListasPreciosPage({ perfil }) {
  const puedeCrear = perfil?.rol === "admin" || perfil?.rol === "superadmin" || perfil?.permisos?.listasPrecios?.crear === true;
  const puedeEditar = perfil?.rol === "admin" || perfil?.rol === "superadmin" || perfil?.permisos?.listasPrecios?.editar === true;
  const puedeEliminar = perfil?.rol === "admin" || perfil?.rol === "superadmin" || perfil?.permisos?.listasPrecios?.eliminar === true;  
  const [listas, setListas] = useState([]);
  const [productosBase, setProductosBase] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  const [modalLista, setModalLista] = useState(false);
  const [listaEditando, setListaEditando] = useState(null);
  const [formLista, setFormLista] = useState({
    nombre: "",
    descripcion: "",
  });

  const [listaSeleccionada, setListaSeleccionada] = useState(null);
  const [productoSeleccionadoIndex, setProductoSeleccionadoIndex] = useState(null);

  const [modalProducto, setModalProducto] = useState(false);
  const [productoEditandoIndex, setProductoEditandoIndex] = useState(null);
  const [formProducto, setFormProducto] = useState(productoVacio);

  const cargarDatos = async () => {
    try {
      if (!perfil?.clienteId) return;

      setCargando(true);

      const [listasDb, productosDb] = await Promise.all([
        obtenerListasPrecios(perfil.clienteId),
        obtenerProductosBase(perfil.clienteId),
      ]);

      setListas(listasDb);
      setProductosBase(productosDb);

      if (!listaSeleccionada && listasDb.length > 0) {
        setListaSeleccionada(listasDb[0]);
      }
    } catch (error) {
      console.error("Error cargando listas de precios:", error);
      alert("No se pudieron cargar las listas de precios.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [perfil?.clienteId]);

  const listasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return listas.filter((l) =>
      (l.nombre || "").toLowerCase().includes(texto)
    );
  }, [listas, busqueda]);

  const productosLista = listaSeleccionada?.productos || [];

  const productoSeleccionado =
    productoSeleccionadoIndex !== null
      ? productosLista[productoSeleccionadoIndex]
      : productosLista[0] || null;

  const productoActivoIndex =
    productoSeleccionadoIndex !== null ? productoSeleccionadoIndex : 0;

  const abrirNuevaLista = () => {
    setListaEditando(null);
    setFormLista({
      nombre: "",
      descripcion: "",
    });
    setModalLista(true);
  };

  const abrirEditarLista = (lista) => {
    setListaEditando(lista);
    setFormLista({
      nombre: lista.nombre || "",
      descripcion: lista.descripcion || "",
    });
    setModalLista(true);
  };

  const guardarLista = async () => {
    try {
      const nombre = formLista.nombre.trim();

      if (!nombre) {
        alert("Ingresá un nombre para la lista.");
        return;
      }

      if (listaEditando?.firebaseId) {
        await actualizarListaPrecio(listaEditando.firebaseId, {
          nombre,
          descripcion: formLista.descripcion || "",
        });
      } else {
        await crearListaPrecio(perfil, {
          nombre,
          descripcion: formLista.descripcion || "",
        });
      }

      setModalLista(false);
      await cargarDatos();
    } catch (error) {
      console.error("Error guardando lista:", error);
      alert("No se pudo guardar la lista.");
    }
  };

  const desactivarLista = async (lista) => {
    if (!lista?.firebaseId) return;

    const confirmar = window.confirm(
      `¿Querés ${lista.activa === false ? "activar" : "desactivar"} la lista "${lista.nombre}"?`
    );

    if (!confirmar) return;

    await actualizarListaPrecio(lista.firebaseId, {
      activa: lista.activa === false,
    });

    await cargarDatos();

    if (listaSeleccionada?.firebaseId === lista.firebaseId) {
      setListaSeleccionada({
        ...listaSeleccionada,
        activa: lista.activa === false,
      });
    }
  };

  const borrarLista = async (lista) => {
    if (!lista?.firebaseId) return;

    const confirmar = window.confirm(
      `¿Seguro querés eliminar la lista "${lista.nombre}"?`
    );

    if (!confirmar) return;

    await eliminarListaPrecio(lista.firebaseId);

    if (listaSeleccionada?.firebaseId === lista.firebaseId) {
      setListaSeleccionada(null);
      setProductoSeleccionadoIndex(null);
    }

    await cargarDatos();
  };

    const marcarComoPredeterminada = async (lista) => {
    try {
      if (!perfil?.clienteId || !lista?.firebaseId) return;

      await marcarListaPrecioPredeterminada(perfil.clienteId, lista.firebaseId);

      const listasActualizadas = listas.map((l) => ({
        ...l,
        predeterminada: l.firebaseId === lista.firebaseId,
      }));

      setListas(listasActualizadas);

      setListaSeleccionada((prev) =>
        prev?.firebaseId === lista.firebaseId
          ? { ...prev, predeterminada: true }
          : prev
      );
    } catch (error) {
      console.error("Error marcando lista predeterminada:", error);
      alert("No se pudo marcar la lista como predeterminada.");
    }
  };

  const duplicarLista = async (lista) => {
    try {
      if (!lista) return;

      await duplicarListaPrecio(perfil, lista);

      await cargarDatos();
    } catch (error) {
      console.error("Error duplicando lista:", error);
      alert("No se pudo duplicar la lista.");
    }
  };

  const abrirDetalleLista = (lista) => {
    setListaSeleccionada(lista);
    setProductoSeleccionadoIndex(null);
  };

  const abrirNuevoProducto = () => {
    setProductoEditandoIndex(null);
    setFormProducto(productoVacio);
    setModalProducto(true);
  };

  const abrirEditarProducto = (producto, index) => {
    setProductoEditandoIndex(index);
    setFormProducto({
      ...productoVacio,
      ...producto,
      reglasCantidad: producto.reglasCantidad || [],
      adicionales: producto.adicionales || [],
    });
    setModalProducto(true);
  };

  const seleccionarProductoBase = (productoBaseId) => {
    const producto = productosBase.find((p) => p.firebaseId === productoBaseId);

    setFormProducto((prev) => ({
      ...prev,
      productoBaseId,
      nombre: producto?.nombre || "",
      tipoProducto: "personalizado",
    }));
  };

  const agregarReglaCantidad = () => {
    setFormProducto((prev) => ({
      ...prev,
      reglasCantidad: [
        ...(prev.reglasCantidad || []),
        {
          desde: "",
          hasta: "",
          precio: "",
        },
      ],
    }));
  };

  const actualizarRegla = (index, campo, valor) => {
    setFormProducto((prev) => {
      const reglas = [...(prev.reglasCantidad || [])];
      reglas[index] = {
        ...reglas[index],
        [campo]: valor,
      };

      return {
        ...prev,
        reglasCantidad: reglas,
      };
    });
  };

  const quitarRegla = (index) => {
    setFormProducto((prev) => ({
      ...prev,
      reglasCantidad: (prev.reglasCantidad || []).filter((_, i) => i !== index),
    }));
  };

  const agregarAdicional = () => {
    setFormProducto((prev) => ({
      ...prev,
      adicionales: [
        ...(prev.adicionales || []),
        {
          id: crypto.randomUUID(),
          nombre: "",
          tipoCalculo: "por_unidad",
          precio: "",
          activo: true,
        },
      ],
    }));
  };

  const actualizarAdicional = (index, campo, valor) => {
    setFormProducto((prev) => {
      const adicionales = [...(prev.adicionales || [])];
      adicionales[index] = {
        ...adicionales[index],
        [campo]: valor,
      };

      return {
        ...prev,
        adicionales,
      };
    });
  };

  const quitarAdicional = (index) => {
    setFormProducto((prev) => ({
      ...prev,
      adicionales: (prev.adicionales || []).filter((_, i) => i !== index),
    }));
  };

  const guardarProductoEnLista = async () => {
    try {
      if (!listaSeleccionada?.firebaseId) return;

      if (!formProducto.nombre.trim()) {
        alert("Seleccioná o ingresá un producto.");
        return;
      }

      const productoNormalizado = {
        ...formProducto,
        nombre: formProducto.nombre.trim(),
        precioBase: Number(formProducto.precioBase || 0),
        reglasCantidad: (formProducto.reglasCantidad || []).map((r) => ({
          desde: Number(r.desde || 0),
          hasta: r.hasta === "" || r.hasta === null ? null : Number(r.hasta),
          precio: Number(r.precio || 0),
        })),
        adicionales: (formProducto.adicionales || []).map((a) => ({
          ...a,
          nombre: (a.nombre || "").trim(),
          precio: Number(a.precio || 0),
          activo: a.activo !== false,
        })),
        activo: true,
      };

      const productosActuales = listaSeleccionada.productos || [];
      let nuevosProductos = [];

      if (productoEditandoIndex !== null) {
        nuevosProductos = productosActuales.map((p, index) =>
          index === productoEditandoIndex ? productoNormalizado : p
        );
      } else {
        nuevosProductos = [...productosActuales, productoNormalizado];
      }

      await actualizarListaPrecio(listaSeleccionada.firebaseId, {
        productos: nuevosProductos,
      });

      const listaActualizada = {
        ...listaSeleccionada,
        productos: nuevosProductos,
      };

      setModalProducto(false);
      setListaSeleccionada(listaActualizada);
      setProductoSeleccionadoIndex(
        productoEditandoIndex !== null ? productoEditandoIndex : nuevosProductos.length - 1
      );

      await cargarDatos();
    } catch (error) {
      console.error("Error guardando producto en lista:", error);
      alert("No se pudo guardar el producto.");
    }
  };

  const quitarProductoDeLista = async (indexProducto) => {
    if (!listaSeleccionada?.firebaseId) return;

    const confirmar = window.confirm("¿Querés quitar este producto de la lista?");
    if (!confirmar) return;

    const nuevosProductos = (listaSeleccionada.productos || []).filter(
      (_, index) => index !== indexProducto
    );

    await actualizarListaPrecio(listaSeleccionada.firebaseId, {
      productos: nuevosProductos,
    });

    setListaSeleccionada({
      ...listaSeleccionada,
      productos: nuevosProductos,
    });

    setProductoSeleccionadoIndex(null);

    await cargarDatos();
  };

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat(perfil?.localeMoneda || "es-AR", {
      style: "currency",
      currency: perfil?.moneda || "ARS",
      minimumFractionDigits: 0,
    }).format(Number(valor || 0));
  };

  const totalProductos = productosLista.length;
  const totalReglas = productosLista.reduce(
    (acc, p) => acc + (p.reglasCantidad || []).length,
    0
  );
  const totalAdicionales = productosLista.reduce(
    (acc, p) => acc + (p.adicionales || []).length,
    0
  );

  return (
    <div className="listas-precios-page">
      <div className="lp-topbar">
        <div>
          <span className="lp-kicker">Configuración comercial</span>
          <h1>Listas de precios</h1>
          
        </div>

        {puedeCrear && (
          <button className="lp-btn-principal" onClick={abrirNuevaLista}>
            <Plus size={18} />
            Nueva lista
          </button>
        )}
      </div>

      <div className="lp-layout-pro">
        <aside className="lp-sidebar-listas">
          <div className="lp-sidebar-title">
            <div>
              <h2>Listas</h2>
              <span>{listas.length} configuradas</span>
            </div>
            <Tags size={20} />
          </div>

          <div className="lp-search">
            <Search size={17} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar lista..."
            />
          </div>

          <div className="lp-listas-scroll">
            {cargando ? (
              <p className="lp-empty">Cargando listas...</p>
            ) : listasFiltradas.length === 0 ? (
              <div className="lp-empty-box">
                <Tags size={24} />
                <strong>Sin listas</strong>
                <span>Creá tu primera lista de precios.</span>
              </div>
            ) : (
              listasFiltradas.map((lista) => (
                <button
                  key={lista.firebaseId}
                  className={`lp-lista-item ${
                    listaSeleccionada?.firebaseId === lista.firebaseId ? "activa" : ""
                  }`}
                  onClick={() => abrirDetalleLista(lista)}
                >
                  <div className="lp-lista-icon">
                    <BadgeDollarSign size={18} />
                  </div>

                  <div className="lp-lista-info">
                    <strong>{lista.nombre}</strong>
                    <span>
                        {(lista.productos || []).length} productos ·{" "}
                        {lista.moneda || perfil?.moneda || "ARS"}
                        {lista.predeterminada ? " · Predeterminada" : ""}
                    </span>
                  </div>

                  <span
                    className={`lp-dot ${
                      lista.activa === false ? "inactiva" : "activa"
                    }`}
                  />
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="lp-panel-detalle">
          {!listaSeleccionada ? (
            <div className="lp-empty-state">
              <Tags size={42} />
              <h2>Seleccioná una lista</h2>
              <p>Desde acá vas a administrar los productos y precios.</p>
            </div>
          ) : (
            <>
              <div className="lp-detalle-header">
                <div>
                  <span className="lp-kicker">Lista seleccionada</span>
                  <h2>{listaSeleccionada.nombre}</h2>
                  {listaSeleccionada.predeterminada && (
                    <span className="lp-badge-star">
                      <Star size={14} />
                      Predeterminada
                    </span>
                  )}
                </div>

                <div className="lp-detalle-actions">
                  {puedeEditar && !listaSeleccionada.predeterminada && (
                    <button
                      className="lp-btn-secundario"
                      onClick={() => marcarComoPredeterminada(listaSeleccionada)}
                    >
                      <Star size={16} />
                      Predeterminada
                    </button>
                  )}

                  {puedeCrear && (
                    <button
                      className="lp-btn-secundario"
                      onClick={() => duplicarLista(listaSeleccionada)}
                    >
                      <Copy size={16} />
                      Duplicar
                    </button>
                  )}

                  {puedeEditar && (
                    <button
                      className="lp-btn-secundario"
                      onClick={() => abrirEditarLista(listaSeleccionada)}
                    >
                      <Pencil size={16} />
                      Editar
                    </button>
                  )}

                  {puedeEditar && (
                    <button
                      className="lp-btn-secundario"
                      onClick={() => desactivarLista(listaSeleccionada)}
                    >
                      <Power size={16} />
                      {listaSeleccionada.activa === false ? "Activar" : "Desactivar"}
                    </button>
                  )}

                  {puedeEliminar && (
                    <button
                      className="lp-btn-danger"
                      onClick={() => borrarLista(listaSeleccionada)}
                    >
                      <Trash2 size={16} />
                      Eliminar
                    </button>
                  )}
                </div>
              </div>

              <div className="lp-resumen-grid">
                <div className="lp-stat-card">
                  <Package size={22} />
                  <span>Productos</span>
                  <strong>{totalProductos}</strong>
                </div>

                <div className="lp-stat-card">
                  <ListChecks size={22} />
                  <span>Reglas por cantidad</span>
                  <strong>{totalReglas}</strong>
                </div>

                <div className="lp-stat-card">
                  <Sparkles size={22} />
                  <span>Adicionales</span>
                  <strong>{totalAdicionales}</strong>
                </div>
              </div>

              <div className="lp-productos-layout">
                <div className="lp-productos-lista">
                  <div className="lp-section-head">
                    <div>
                      <h3>Productos de la lista</h3>
                      <p>Productos personalizados con precio configurado.</p>
                    </div>

                    {puedeEditar && (
                    <button className="lp-btn-principal" onClick={abrirNuevoProducto}>
                        <Plus size={17} />
                        Agregar
                    </button>
                    )}
                  </div>

                  {productosLista.length === 0 ? (
                    <div className="lp-empty-box">
                      <Package size={26} />
                      <strong>Sin productos</strong>
                      <span>Agregá el primer producto a esta lista.</span>
                    </div>
                  ) : (
                    <div className="lp-product-card-list">
                      {productosLista.map((producto, index) => (
                        <button
                          key={`${producto.nombre}-${index}`}
                          className={`lp-product-row ${
                            productoActivoIndex === index ? "activo" : ""
                          }`}
                          onClick={() => setProductoSeleccionadoIndex(index)}
                        >
                          <div className="lp-product-thumb">
                            <Package size={22} />
                          </div>

                          <div className="lp-product-main">
                            <strong>{producto.nombre}</strong>
                            <span>{formatearMoneda(producto.precioBase)}</span>
                          </div>

                          <div className="lp-product-meta">
                            <span>{(producto.reglasCantidad || []).length} reglas</span>
                            <span>{(producto.adicionales || []).length} adicionales</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lp-product-preview">
                  {!productoSeleccionado ? (
                    <div className="lp-empty-state compact">
                      <Layers size={34} />
                      <h3>Sin producto seleccionado</h3>
                      <p>Elegí un producto para ver su composición.</p>
                    </div>
                  ) : (
                    <>
                      <div className="lp-preview-hero">
                        <div className="lp-preview-image">
                          <Package size={48} />
                        </div>

                        <div className="lp-preview-info">
                          <span className="lp-pill-soft">
                            {productoSeleccionado.tipoProducto || "personalizado"}
                          </span>
                          <h3>{productoSeleccionado.nombre}</h3>
                          <strong>{formatearMoneda(productoSeleccionado.precioBase)}</strong>
                          
                        </div>
                      </div>

                      <div className="lp-preview-actions">
                        {puedeEditar && (
                            <button
                            className="lp-btn-secundario"
                            onClick={() =>
                                abrirEditarProducto(productoSeleccionado, productoActivoIndex)
                            }
                            >
                            <Pencil size={16} />
                            Editar producto
                            </button>
                        )}

                        {puedeEditar && (
                            <button
                            className="lp-btn-danger"
                            onClick={() => quitarProductoDeLista(productoActivoIndex)}
                            >
                            <Trash2 size={16} />
                            Quitar
                            </button>
                        )}
                      </div>

                      <div className="lp-preview-section">
                        <h4>Reglas por cantidad</h4>

                        {(productoSeleccionado.reglasCantidad || []).length === 0 ? (
                          <p className="lp-empty">Sin reglas por cantidad.</p>
                        ) : (
                          <div className="lp-mini-table">
                            {(productoSeleccionado.reglasCantidad || []).map((regla, index) => (
                              <div className="lp-mini-row" key={index}>
                                <span>
                                  {regla.desde || 0} a {regla.hasta || "sin límite"}
                                </span>
                                <strong>{formatearMoneda(regla.precio)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="lp-preview-section">
                        <h4>Adicionales</h4>

                        {(productoSeleccionado.adicionales || []).length === 0 ? (
                          <p className="lp-empty">Sin adicionales cargados.</p>
                        ) : (
                          <div className="lp-mini-table">
                            {(productoSeleccionado.adicionales || []).map((adicional, index) => (
                              <div className="lp-mini-row" key={adicional.id || index}>
                                <span>
                                  {adicional.nombre} ·{" "}
                                  {adicional.tipoCalculo === "por_pedido"
                                    ? "por pedido"
                                    : "por unidad"}
                                </span>
                                <strong>{formatearMoneda(adicional.precio)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {modalLista && (
        <div className="lp-modal-backdrop">
          <div className="lp-modal">
            <h2>{listaEditando ? "Editar lista" : "Nueva lista"}</h2>

            <label>Nombre</label>
            <input
              value={formLista.nombre}
              onChange={(e) =>
                setFormLista((prev) => ({
                  ...prev,
                  nombre: e.target.value,
                }))
              }
              placeholder="Ej: Minorista"
            />

            <label>Descripción</label>
            <textarea
              value={formLista.descripcion}
              onChange={(e) =>
                setFormLista((prev) => ({
                  ...prev,
                  descripcion: e.target.value,
                }))
              }
              placeholder="Opcional"
            />

            <div className="lp-modal-actions">
              <button
                className="lp-btn-secundario"
                onClick={() => setModalLista(false)}
              >
                Cancelar
              </button>
              <button className="lp-btn-principal" onClick={guardarLista}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalProducto && (
        <div className="lp-modal-backdrop">
          <div className="lp-modal lp-modal-grande">
            <div className="lp-modal-head">
              <button
                className="lp-icon-btn"
                onClick={() => setModalProducto(false)}
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h2>
                  {productoEditandoIndex !== null
                    ? "Editar producto"
                    : "Agregar producto"}
                </h2>
                <p>Configurá precio base, reglas y adicionales.</p>
              </div>
            </div>

            <div className="lp-form-grid">
              <div>
                <label>Producto personalizado</label>
                <select
                  value={formProducto.productoBaseId}
                  onChange={(e) => seleccionarProductoBase(e.target.value)}
                >
                  <option value="">Seleccionar producto...</option>
                  {productosBase.map((p) => (
                    <option key={p.firebaseId} value={p.firebaseId}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Nombre visible</label>
                <input
                  value={formProducto.nombre}
                  onChange={(e) =>
                    setFormProducto((prev) => ({
                      ...prev,
                      nombre: e.target.value,
                    }))
                  }
                  placeholder="Ej: Camiseta"
                />
              </div>

              <div>
                <label>Precio base</label>
                <input
                  type="number"
                  value={formProducto.precioBase}
                  onChange={(e) =>
                    setFormProducto((prev) => ({
                      ...prev,
                      precioBase: e.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="lp-section-title">
              <div>
                <h3>Reglas por cantidad</h3>
                <p>Definí precios especiales según cantidad.</p>
              </div>
              <button type="button" onClick={agregarReglaCantidad}>
                <Plus size={16} />
                Regla
              </button>
            </div>

            {(formProducto.reglasCantidad || []).map((regla, index) => (
              <div className="lp-grid-4" key={index}>
                <input
                  type="number"
                  placeholder="Desde"
                  value={regla.desde}
                  onChange={(e) => actualizarRegla(index, "desde", e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Hasta"
                  value={regla.hasta}
                  onChange={(e) => actualizarRegla(index, "hasta", e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Precio"
                  value={regla.precio}
                  onChange={(e) => actualizarRegla(index, "precio", e.target.value)}
                />
                <button type="button" onClick={() => quitarRegla(index)}>
                  Quitar
                </button>
              </div>
            ))}

            <div className="lp-section-title">
              <div>
                <h3>Adicionales</h3>
                <p>Agregá cargos por unidad o por pedido.</p>
              </div>
              <button type="button" onClick={agregarAdicional}>
                <Plus size={16} />
                Adicional
              </button>
            </div>

            {(formProducto.adicionales || []).map((adicional, index) => (
              <div className="lp-grid-4" key={adicional.id || index}>
                <input
                  placeholder="Nombre"
                  value={adicional.nombre}
                  onChange={(e) =>
                    actualizarAdicional(index, "nombre", e.target.value)
                  }
                />
                <select
                  value={adicional.tipoCalculo}
                  onChange={(e) =>
                    actualizarAdicional(index, "tipoCalculo", e.target.value)
                  }
                >
                  <option value="por_unidad">Por unidad</option>
                  <option value="por_pedido">Por pedido</option>
                </select>
                <input
                  type="number"
                  placeholder="Precio"
                  value={adicional.precio}
                  onChange={(e) =>
                    actualizarAdicional(index, "precio", e.target.value)
                  }
                />
                <button type="button" onClick={() => quitarAdicional(index)}>
                  Quitar
                </button>
              </div>
            ))}

            <div className="lp-modal-actions">
              <button
                className="lp-btn-secundario"
                onClick={() => setModalProducto(false)}
              >
                Cancelar
              </button>
              <button className="lp-btn-principal" onClick={guardarProductoEnLista}>
                Guardar producto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}