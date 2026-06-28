import React, { useEffect, useMemo, useState } from "react";
import { obtenerListasPrecios, obtenerProductosBase } from "../../firebase/listasPrecios";
import { formatearMoneda } from "../../utils/moneda";
import "./ProductoSelectorModal.css";

export default function ProductoSelectorModal({
  open,
  perfil,
  configMoneda,
  itemActual = null,
  onClose,
  onAplicar,
}) {
  const [listas, setListas] = useState([]);
  const [productosBase, setProductosBase] = useState([]);
  const [origen, setOrigen] = useState("lista_precio");
  const [listaId, setListaId] = useState("");
  const [productoIndex, setProductoIndex] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [reglaIndex, setReglaIndex] = useState(null);
  const [adicionalesIds, setAdicionalesIds] = useState([]);
  const [precioAnimando, setPrecioAnimando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      if (!open || !perfil?.clienteId) return;

      const [listasDb, productosBaseDb] = await Promise.all([
        obtenerListasPrecios(perfil.clienteId),
        obtenerProductosBase(perfil.clienteId),
      ]);

      const activas = (listasDb || []).filter((l) => l.activa !== false);
      setListas(activas);
      setProductosBase(productosBaseDb || []);

      const defaultId =
        itemActual?.listaPrecioId ||
        activas.find((l) => l.predeterminada)?.firebaseId ||
        activas[0]?.firebaseId ||
        "";

      setOrigen("lista_precio");
      setListaId(defaultId);
      setProductoIndex("");
      setBusqueda("");
      setReglaIndex(null);
      setAdicionalesIds([]);
    };

    cargar();
  }, [open, perfil?.clienteId]);

  const listaSeleccionada = useMemo(
    () => listas.find((l) => l.firebaseId === listaId) || null,
    [listas, listaId]
  );

  const productos = listaSeleccionada?.productos || [];

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return productos
      .map((producto, index) => ({ producto, indexOriginal: index }))
      .filter(({ producto }) => {
        if (!texto) return true;
        return (producto.nombre || "").toLowerCase().includes(texto);
      });
  }, [productos, busqueda]);

  const productoSeleccionado =
    productoIndex !== "" ? productos[Number(productoIndex)] : null;

  const obtenerImagen = (producto) => {
    const base = productosBase.find(
      (p) => p.firebaseId === producto?.productoBaseId
    );

    return (
      base?.imagenThumb ||
      base?.imagenUrl ||
      producto?.imagenThumb ||
      producto?.imagenUrl ||
      ""
    );
  };

  const precioUnitario = useMemo(() => {
    if (!productoSeleccionado) return 0;

    const reglas = productoSeleccionado.reglasCantidad || [];
    const regla = reglaIndex !== null ? reglas[reglaIndex] : null;

    const precioBase = Number(regla?.precio || productoSeleccionado.precioBase || 0);

    const adicionales = productoSeleccionado.adicionales || [];

    const totalAdicionales = adicionales
      .filter((a, index) => adicionalesIds.includes(a.id || `adicional-${index}`))
      .reduce((acc, a) => acc + Number(a.precio || 0), 0);

    return precioBase + totalAdicionales;
  }, [productoSeleccionado, reglaIndex, adicionalesIds]);

  useEffect(() => {
    if (!open || !productoSeleccionado) return;

    setPrecioAnimando(false);
    const t1 = setTimeout(() => setPrecioAnimando(true), 20);
    const t2 = setTimeout(() => setPrecioAnimando(false), 360);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [precioUnitario, productoIndex, reglaIndex, adicionalesIds, listaId, open]);

  const toggleAdicional = (id) => {
    setAdicionalesIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const aplicar = () => {
    if (!productoSeleccionado || !listaSeleccionada) return;

    const reglas = productoSeleccionado.reglasCantidad || [];
    const reglaSeleccionada = reglaIndex !== null ? reglas[reglaIndex] : null;

    const adicionales = (productoSeleccionado.adicionales || []).filter((a, index) =>
      adicionalesIds.includes(a.id || `adicional-${index}`)
    );

    const nombreProducto = productoSeleccionado.nombre || "";

    const descripcion =
      adicionales.length === 0
        ? nombreProducto
        : adicionales.length <= 2
        ? `${nombreProducto} + ${adicionales.map((a) => a.nombre).join(" + ")}`
        : `${nombreProducto} + ${adicionales.length} adicionales`;

    onAplicar({
      descripcion,
      precioUnitario,
      origenPrecio: "lista_precio",
      listaPrecioId: listaSeleccionada.firebaseId,
      listaPrecioNombre: listaSeleccionada.nombre || "",
      productoListaNombre: productoSeleccionado.nombre || "",
      productoBaseId: productoSeleccionado.productoBaseId || "",
      reglaCantidad: reglaSeleccionada || null,
      adicionalesSeleccionados: adicionales,
      precioDetalleInterno: {
        origen: "lista_precio",
        precioBase: Number(productoSeleccionado.precioBase || 0),
        precioAplicado: precioUnitario,
        reglaCantidad: reglaSeleccionada || null,
        adicionales,
      },
    });

    onClose();
  };

  if (!open) return null;

  return (
    <div className="ps-overlay">
      <div className="ps-modal">
        <div className="ps-header">
          <div>
            <span>Seleccionar producto</span>
            <h2>Agregar al ítem</h2>
          </div>

          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="ps-toolbar">
          <div className="ps-tabs">
            <button
              type="button"
              className={origen === "lista_precio" ? "activo" : ""}
              onClick={() => setOrigen("lista_precio")}
            >
              Lista de precios
            </button>

            <button type="button" disabled className="disabled">
              Inventario
            </button>
          </div>

          <div className={`ps-total ${precioAnimando ? "is-pulsing" : ""}`}>
            <div>
              <span>Precio unitario</span>
              <strong>
                {formatearMoneda(
                  precioUnitario,
                  configMoneda.moneda,
                  configMoneda.localeMoneda
                )}
              </strong>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={aplicar}
              disabled={!productoSeleccionado}
            >
              Aplicar
            </button>
          </div>
        </div>

        <div className="ps-layout">
          <aside className="ps-col">
            <div className="ps-col-head">
              <h3>Listas</h3>
              <span>{listas.length}</span>
            </div>

            <div className="ps-scroll">
              {listas.map((lista) => (
                <button
                  key={lista.firebaseId}
                  type="button"
                  className={`ps-list-item ${listaId === lista.firebaseId ? "activo" : ""}`}
                  onClick={() => {
                    setListaId(lista.firebaseId);
                    setProductoIndex("");
                    setBusqueda("");
                    setReglaIndex(null);
                    setAdicionalesIds([]);
                  }}
                >
                  <strong>{lista.nombre}</strong>
                  <span>
                    {(lista.productos || []).length} productos
                    {lista.predeterminada ? " · Predeterminada" : ""}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="ps-col">
            <div className="ps-col-head">
              <h3>Productos</h3>
              <span>{productos.length}</span>
            </div>

            <div className="ps-search">
              <input
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setProductoIndex("");
                  setReglaIndex(null);
                  setAdicionalesIds([]);
                }}
                placeholder="Buscar producto..."
              />
            </div>

            <div className="ps-scroll">
              {productosFiltrados.map(({ producto, indexOriginal }) => (
                <button
                  key={`${producto.nombre}-${indexOriginal}`}
                  type="button"
                  className={`ps-product-item ${
                    Number(productoIndex) === indexOriginal ? "activo" : ""
                  }`}
                  onClick={() => {
                    setProductoIndex(String(indexOriginal));
                    setReglaIndex(null);
                    setAdicionalesIds([]);
                  }}
                >
                  <div className="ps-thumb">
                    {obtenerImagen(producto) ? (
                      <img src={obtenerImagen(producto)} alt={producto.nombre} />
                    ) : (
                      <span />
                    )}
                  </div>

                  <div>
                    <strong>{producto.nombre}</strong>
                    <span>
                      {formatearMoneda(
                        producto.precioBase,
                        configMoneda.moneda,
                        configMoneda.localeMoneda
                      )}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="ps-col ps-detail">
            {!productoSeleccionado ? (
              <div className="ps-empty">
                <strong>Elegí un producto</strong>
                <span>Después seleccioná reglas y adicionales.</span>
              </div>
            ) : (
              <>
                <div className="ps-hero">
                  <div className="ps-hero-img">
                    {obtenerImagen(productoSeleccionado) ? (
                      <img
                        src={obtenerImagen(productoSeleccionado)}
                        alt={productoSeleccionado.nombre}
                      />
                    ) : (
                      <span />
                    )}
                  </div>

                  <div>
                    <span className="ps-pill">
                      {productoSeleccionado.tipoProducto || "Personalizado"}
                    </span>
                    <h3>{productoSeleccionado.nombre}</h3>
                    <strong>
                      {formatearMoneda(
                        productoSeleccionado.precioBase,
                        configMoneda.moneda,
                        configMoneda.localeMoneda
                      )}
                    </strong>
                  </div>
                </div>

                <div className="ps-section">
                  <h3>Reglas</h3>

                  {(productoSeleccionado.reglasCantidad || []).length === 0 ? (
                    <p className="ps-muted">Usa precio base.</p>
                  ) : (
                    <div className="ps-options">
                      {(productoSeleccionado.reglasCantidad || []).map((regla, index) => {
                        const activo = reglaIndex === index;

                        return (
                          <button
                            type="button"
                            key={index}
                            className={`ps-option ${activo ? "activo" : ""}`}
                            onClick={() =>
                              setReglaIndex((prev) => (prev === index ? null : index))
                            }
                          >
                            <span className="ps-circle" />
                            <span>
                              {regla.desde || 0} a {regla.hasta || "sin límite"}
                            </span>
                            <strong>
                              {formatearMoneda(
                                regla.precio,
                                configMoneda.moneda,
                                configMoneda.localeMoneda
                              )}
                            </strong>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="ps-section">
                  <h3>Adicionales</h3>

                  {(productoSeleccionado.adicionales || []).length === 0 ? (
                    <p className="ps-muted">Sin adicionales.</p>
                  ) : (
                    <div className="ps-options">
                      {(productoSeleccionado.adicionales || []).map((adicional, index) => {
                        const id = adicional.id || `adicional-${index}`;
                        const activo = adicionalesIds.includes(id);

                        return (
                          <button
                            type="button"
                            key={id}
                            className={`ps-option ${activo ? "activo" : ""}`}
                            onClick={() => toggleAdicional(id)}
                          >
                            <span className="ps-circle" />
                            <span>
                              {adicional.nombre} ·{" "}
                              {adicional.tipoCalculo === "por_pedido"
                                ? "por pedido"
                                : "por unidad"}
                            </span>
                            <strong>
                              {formatearMoneda(
                                adicional.precio,
                                configMoneda.moneda,
                                configMoneda.localeMoneda
                              )}
                            </strong>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}