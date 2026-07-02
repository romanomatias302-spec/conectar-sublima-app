import React, { useEffect, useMemo, useState } from "react";
import { obtenerListasPrecios, obtenerProductosBase } from "../../firebase/listasPrecios";
import { formatearMoneda } from "../../utils/moneda";
import "./ProductoSelectorModal.css";

function normalizarVariantesProducto(producto = {}) {
  const productoSeguro = producto || {};

  if (
    Array.isArray(productoSeguro.variantes) &&
    productoSeguro.variantes.length > 0
  ) {
    return productoSeguro.variantes.map((v, index) => ({
      id: v.id || `variante-${index}`,
      nombre: v.nombre || "General",
      precioBase: Number(v.precioBase || 0),
      reglasCantidad: Array.isArray(v.reglasCantidad) ? v.reglasCantidad : [],
      adicionales: Array.isArray(v.adicionales) ? v.adicionales : [],
      imagenUrl: v.imagenUrl || "",
      imagenThumb: v.imagenThumb || "",
      activa: v.activa !== false,
    }));
  }

  return [
    {
      id: "general",
      nombre: "General",
      precioBase: Number(productoSeguro.precioBase || 0),
      reglasCantidad: Array.isArray(productoSeguro.reglasCantidad)
        ? productoSeguro.reglasCantidad
        : [],
      adicionales: Array.isArray(productoSeguro.adicionales)
        ? productoSeguro.adicionales
        : [],
      imagenUrl: productoSeguro.imagenUrl || "",
      imagenThumb: productoSeguro.imagenThumb || "",
      activa: true,
    },
  ];
}

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
  const [varianteIndex, setVarianteIndex] = useState(0);

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
        setBusqueda("");

        const listaBase = activas.find((l) => l.firebaseId === defaultId);
        const productosBaseLista = listaBase?.productos || [];

        const indexProductoActual = productosBaseLista.findIndex((p) => {
          return (
            (itemActual?.productoBaseId && p.productoBaseId === itemActual.productoBaseId) ||
            (itemActual?.productoListaNombre &&
              String(p.nombre || "").trim().toLowerCase() ===
                String(itemActual.productoListaNombre || "").trim().toLowerCase())
          );
        });

        if (indexProductoActual >= 0) {
          const productoActual = productosBaseLista[indexProductoActual];
          const variantes = normalizarVariantesProducto(productoActual);

          const indexVarianteActual = variantes.findIndex(
            (v) =>
              v.id === itemActual?.varianteId ||
              String(v.nombre || "").trim().toLowerCase() ===
                String(itemActual?.varianteNombre || "").trim().toLowerCase()
          );

          const varianteActual =
            variantes[indexVarianteActual >= 0 ? indexVarianteActual : 0];

          const reglas = varianteActual?.reglasCantidad || [];

          const indexReglaActual = reglas.findIndex((r) => {
            const reglaActual = itemActual?.reglaCantidad || {};
            return (
              Number(r.desde || 0) === Number(reglaActual.desde || 0) &&
              String(r.hasta ?? "") === String(reglaActual.hasta ?? "") &&
              Number(r.precio || 0) === Number(reglaActual.precio || 0)
            );
          });

          setProductoIndex(String(indexProductoActual));
          setVarianteIndex(indexVarianteActual >= 0 ? indexVarianteActual : 0);
          setReglaIndex(indexReglaActual >= 0 ? indexReglaActual : null);
          setAdicionalesIds(
            Array.isArray(itemActual?.adicionalesSeleccionados)
              ? itemActual.adicionalesSeleccionados.map((a, index) => a.id || `adicional-${index}`)
              : []
          );
        } else {
          setProductoIndex("");
          setVarianteIndex(0);
          setReglaIndex(null);
          setAdicionalesIds([]);
        }
    };

    cargar();
  }, [open, perfil?.clienteId, itemActual]);

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

  const variantesProducto = normalizarVariantesProducto(productoSeleccionado);

  const varianteSeleccionada =
    variantesProducto[varianteIndex] || variantesProducto[0] || null;  

 const obtenerImagen = (producto, variante = null) => {
  const base = productosBase.find(
    (p) => p.firebaseId === producto?.productoBaseId
  );

  return (
    variante?.imagenThumb ||
    variante?.imagenUrl ||
    producto?.imagenThumb ||
    producto?.imagenUrl ||
    base?.imagenThumb ||
    base?.imagenUrl ||
    ""
  );
};

const precioUnitario = useMemo(() => {
  if (!productoSeleccionado || !varianteSeleccionada) return 0;

  const reglas = varianteSeleccionada.reglasCantidad || [];
  const regla = reglaIndex !== null ? reglas[reglaIndex] : null;

  const precioBase = Number(
    regla?.precio || varianteSeleccionada.precioBase || 0
  );

  const adicionales = varianteSeleccionada.adicionales || [];

  const totalAdicionales = adicionales
    .filter((a, index) => adicionalesIds.includes(a.id || `adicional-${index}`))
    .reduce((acc, a) => acc + Number(a.precio || 0), 0);

  return precioBase + totalAdicionales;
}, [productoSeleccionado, varianteSeleccionada, reglaIndex, adicionalesIds]);

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
  if (!productoSeleccionado || !listaSeleccionada || !varianteSeleccionada) return;

  const reglas = varianteSeleccionada.reglasCantidad || [];
  const reglaSeleccionada = reglaIndex !== null ? reglas[reglaIndex] : null;

  const adicionales = (varianteSeleccionada.adicionales || []).filter((a, index) =>
    adicionalesIds.includes(a.id || `adicional-${index}`)
  );

  const nombreProducto = productoSeleccionado.nombre || "";
  const nombreVariante =
    varianteSeleccionada.nombre && varianteSeleccionada.nombre !== "General"
      ? varianteSeleccionada.nombre
      : "";

  const baseDescripcion = nombreVariante
    ? `${nombreProducto} - ${nombreVariante}`
    : nombreProducto;

  const descripcion =
    adicionales.length === 0
      ? baseDescripcion
      : adicionales.length <= 2
      ? `${baseDescripcion} + ${adicionales.map((a) => a.nombre).join(" + ")}`
      : `${baseDescripcion} + ${adicionales.length} adicionales`;

  const imagen = obtenerImagen(productoSeleccionado, varianteSeleccionada);

  onAplicar({
    descripcion,
    precioUnitario,
    origenPrecio: "lista_precio",
    listaPrecioId: listaSeleccionada.firebaseId,
    listaPrecioNombre: listaSeleccionada.nombre || "",
    productoListaNombre: productoSeleccionado.nombre || "",
    productoBaseId: productoSeleccionado.productoBaseId || "",

    varianteId: varianteSeleccionada.id || "general",
    varianteNombre: varianteSeleccionada.nombre || "General",

    imagenUrl: imagen,
    imagenThumb: imagen,

    reglaCantidad: reglaSeleccionada || null,
    adicionalesSeleccionados: adicionales,
    precioDetalleInterno: {
      origen: "lista_precio",
      listaPrecioId: listaSeleccionada.firebaseId,
      listaPrecioNombre: listaSeleccionada.nombre || "",
      productoListaNombre: productoSeleccionado.nombre || "",
      varianteId: varianteSeleccionada.id || "general",
      varianteNombre: varianteSeleccionada.nombre || "General",
      precioBase: Number(varianteSeleccionada.precioBase || 0),
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
              <span>Precio final</span>
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
                    setVarianteIndex(0);
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
                  setVarianteIndex(0);
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
                    {obtenerImagen(productoSeleccionado, varianteSeleccionada) ? (
                      <img
                        src={obtenerImagen(productoSeleccionado, varianteSeleccionada)}
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
                        precioUnitario,
                        configMoneda.moneda,
                        configMoneda.localeMoneda
                      )}
                    </strong>
                  </div>
                </div>

                {variantesProducto.length > 1 && (
                  <div className="ps-section">
                    <h3>Variantes</h3>

                    <div className="ps-options">
                      {variantesProducto.map((variante, index) => {
                        const activo = varianteIndex === index;

                        return (
                          <button
                            type="button"
                            key={variante.id || index}
                            className={`ps-option ${activo ? "activo" : ""}`}
                            onClick={() => {
                              setVarianteIndex(index);
                              setReglaIndex(null);
                              setAdicionalesIds([]);
                            }}
                          >
                            <span className="ps-circle" />
                            <span>{variante.nombre || "General"}</span>
                          <strong>
                            {formatearMoneda(
                              varianteIndex === index
                                ? precioUnitario
                                : variante.precioBase || 0,
                              configMoneda.moneda,
                              configMoneda.localeMoneda
                            )}
                          </strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="ps-section">
                  <h3>Reglas</h3>

                  {(varianteSeleccionada?.reglasCantidad || []).length === 0 ? (
                    <p className="ps-muted">Usa precio base.</p>
                  ) : (
                    <div className="ps-options">
                      {(varianteSeleccionada?.reglasCantidad || []).map((regla, index) => {
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

                  {(varianteSeleccionada?.adicionales || []).length === 0 ? (
                    <p className="ps-muted">Sin adicionales.</p>
                  ) : (
                    <div className="ps-options">
                      {(varianteSeleccionada?.adicionales || []).map((adicional, index) => {
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