import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "../../../firebase";

import {
  actualizarDetalleManualProduccion,
  subirArchivoProduccion,
  subirImagenPortadaProduccion,
  asignarUsuarioProduccion,
} from "../../../firebase/produccionPedidos";

import {
  crearEtiquetaProduccion,
  actualizarEtiquetaProduccion,
  desactivarEtiquetaProduccion,
} from "../../../firebase/produccionEtiquetas";


function obtenerEtiquetasPedido(pedido) {
  if (
    Array.isArray(
      pedido?.produccionEtiquetas
    )
  ) {
    return pedido.produccionEtiquetas
      .slice(0, 4);
  }

  if (pedido?.produccionEtiquetaId) {
    return [
      {
        id:
          pedido.produccionEtiquetaId,

        nombre:
          pedido.produccionEtiquetaNombre ||
          "",

        color:
          pedido.produccionEtiquetaColor ||
          "",
      },
    ];
  }

  return [];
}


function obtenerImagenesPedido(
  productos = []
) {
  const resultado = [];

  productos.forEach((producto) => {
    (producto?.imagenes || []).forEach(
      (imagen, index) => {
        const normalizada =
          typeof imagen === "string"
            ? {
                url: imagen,
                tipo: "link",
                portada: false,
              }
            : imagen;

        if (!normalizada?.url) return;

        resultado.push({
          id: `${
            producto.id ||
            producto.productoNombre ||
            "producto"
          }-${index}`,

          url: normalizada.url,

          thumbUrl:
            normalizada.thumbUrl ||
            normalizada.url,

          portada:
            normalizada.portada ||
            false,

          producto:
            producto.productoNombre ||
            producto.producto ||
            "Producto",

          tipo:
            normalizada.tipo ||
            "link",
        });
      }
    );
  });

  return resultado;
}


export default function DetalleProduccionModal({
  pedido,
  perfil,

  columnas = [],
  usuarios = [],
  etiquetasDisponibles = [],

  puedeAsignarUsuario = false,
  puedeCambiarColorTarjeta = false,

  onCerrar = () => {},
  onMoverPedido = async () => {},
  onCambiarColorTarjeta = async () => {},
}) {
  const pedidoId =
    pedido?.pedidoFirebaseId ||
    pedido?.firebaseId ||
    pedido?.id ||
    "";

  /*
   * Todo este estado es LOCAL.
   *
   * Cambiar cualquiera de estos valores
   * NO vuelve a renderizar ProduccionPage,
   * ProduccionBoard, columnas ni cards.
   */

  const [menuAbierto, setMenuAbierto] =
    useState(false);

  const [vistaMenu, setVistaMenu] =
    useState("principal");

  const [mensajeMenu, setMensajeMenu] =
    useState("");

  const [
    colorTarjeta,
    setColorTarjeta,
  ] = useState(
    pedido?.produccionColorTarjeta || ""
  );

  const [
    notaCorta,
    setNotaCorta,
  ] = useState(
    pedido?.produccionNotaCorta || ""
  );

  const [
    notaLarga,
    setNotaLarga,
  ] = useState(
    pedido?.produccionNotaLarga || ""
  );

  const [
    usuarioAsignadoUid,
    setUsuarioAsignadoUid,
  ] = useState(
    pedido?.produccionAsignadoUid || ""
  );

  const etiquetasIniciales =
    useMemo(
      () =>
        obtenerEtiquetasPedido(pedido)
          .map((etiqueta) => etiqueta.id)
          .filter(Boolean),
      [pedido]
    );

  const [
    etiquetasSeleccionadasIds,
    setEtiquetasSeleccionadasIds,
  ] = useState(etiquetasIniciales);

  const [
    mostrarNuevaEtiqueta,
    setMostrarNuevaEtiqueta,
  ] = useState(false);

  const [
    nuevaEtiquetaNombre,
    setNuevaEtiquetaNombre,
  ] = useState("");

  const [
    nuevaEtiquetaColor,
    setNuevaEtiquetaColor,
  ] = useState("rojo");

  const [
    guardandoEtiqueta,
    setGuardandoEtiqueta,
  ] = useState(false);

  const [
    guardando,
    setGuardando,
  ] = useState(false);

  const [
    imagenPortada,
    setImagenPortada,
  ] = useState(
    pedido?.produccionImagenPortada || ""
  );

  const [
    imagenPortadaThumb,
    setImagenPortadaThumb,
  ] = useState(
    pedido?.produccionImagenPortadaThumb ||
      ""
  );

  const [
    mostrarSelectorPortada,
    setMostrarSelectorPortada,
  ] = useState(false);

  const [
    imagenPreview,
    setImagenPreview,
  ] = useState("");

  const [
    imagenesPedido,
    setImagenesPedido,
  ] = useState([]);

  const [
    cargandoImagenes,
    setCargandoImagenes,
  ] = useState(false);

  const [
    subiendoPortada,
    setSubiendoPortada,
  ] = useState(false);

  const [
    archivos,
    setArchivos,
  ] = useState(
    pedido?.produccionArchivos || []
  );

  const [
    subiendoArchivo,
    setSubiendoArchivo,
  ] = useState(false);


  /*
   * Sólo cargamos las imágenes del pedido
   * cuando se abre este detalle.
   *
   * El tablero no necesita esta información.
   */
  useEffect(() => {
    let cancelado = false;

    async function cargarImagenes() {
      if (!pedidoId) return;

      try {
        setCargandoImagenes(true);

        const snapshot =
          await getDocs(
            collection(
              db,
              `pedidos/${pedidoId}/productos`
            )
          );

        if (cancelado) return;

        const productos =
          snapshot.docs.map(
            (documento) => ({
              id: documento.id,
              ...documento.data(),
            })
          );

        setImagenesPedido(
          obtenerImagenesPedido(
            productos
          )
        );
      } catch (error) {
        console.error(
          "Error cargando imágenes del pedido:",
          error
        );

        if (!cancelado) {
          setImagenesPedido([]);
        }
      } finally {
        if (!cancelado) {
          setCargandoImagenes(false);
        }
      }
    }

    cargarImagenes();

    return () => {
      cancelado = true;
    };
  }, [pedidoId]);


  async function manejarCambiarColor(
    color
  ) {
    try {
      setColorTarjeta(color || "");

      await onCambiarColorTarjeta(
        pedidoId,
        color || ""
      );

      setMensajeMenu(
        "Color actualizado"
      );
    } catch (error) {
      console.error(
        "Error cambiando color:",
        error
      );

      setMensajeMenu(
        "No se pudo cambiar el color"
      );
    }
  }


  async function manejarMover(
    columnaId
  ) {
    try {
      await onMoverPedido(
        pedidoId,
        columnaId
      );

      setMensajeMenu(
        "Se movió exitosamente"
      );

      setTimeout(() => {
        setMenuAbierto(false);
        setVistaMenu("principal");
        setMensajeMenu("");
      }, 900);
    } catch (error) {
      console.error(
        "Error moviendo pedido:",
        error
      );

      setMensajeMenu(
        "No se pudo mover"
      );
    }
  }


  async function guardarNuevaEtiqueta() {
    try {
      if (!perfil?.clienteId) return;

      const nombre =
        String(
          nuevaEtiquetaNombre || ""
        ).trim();

      if (!nombre) return;

      setGuardandoEtiqueta(true);

      await crearEtiquetaProduccion({
        clienteId:
          perfil.clienteId,

        nombre,

        color:
          nuevaEtiquetaColor,
      });

      setNuevaEtiquetaNombre("");
      setNuevaEtiquetaColor("rojo");
      setMostrarNuevaEtiqueta(false);
    } catch (error) {
      console.error(
        "Error creando etiqueta:",
        error
      );
    } finally {
      setGuardandoEtiqueta(false);
    }
  }


  async function editarEtiqueta(
    etiqueta
  ) {
    try {
      if (
        !perfil?.clienteId ||
        !etiqueta?.id
      ) {
        return;
      }

      const nuevoNombre =
        window.prompt(
          "Nuevo nombre de la etiqueta:",
          etiqueta.nombre || ""
        );

      if (nuevoNombre === null) {
        return;
      }

      const nombre =
        nuevoNombre.trim();

      if (!nombre) return;

      await actualizarEtiquetaProduccion({
        clienteId:
          perfil.clienteId,

        etiquetaId:
          etiqueta.id,

        nombre,

        color:
          etiqueta.color ||
          "rojo",
      });
    } catch (error) {
      console.error(
        "Error editando etiqueta:",
        error
      );
    }
  }


  async function eliminarEtiqueta(
    etiqueta
  ) {
    try {
      if (
        !perfil?.clienteId ||
        !etiqueta?.id
      ) {
        return;
      }

      const confirmar =
        window.confirm(
          `¿Seguro que querés eliminar la etiqueta "${etiqueta.nombre}"? No se borrará de pedidos anteriores, solo dejará de estar disponible.`
        );

      if (!confirmar) return;

      await desactivarEtiquetaProduccion({
        clienteId:
          perfil.clienteId,

        etiquetaId:
          etiqueta.id,
      });

      setEtiquetasSeleccionadasIds(
        (prev) =>
          prev.filter(
            (id) =>
              id !== etiqueta.id
          )
      );
    } catch (error) {
      console.error(
        "Error eliminando etiqueta:",
        error
      );
    }
  }


  async function manejarSubirPortada(
    event
  ) {
    try {
      const archivo =
        event.target.files?.[0];

      if (!archivo || !pedidoId) {
        return;
      }

      setSubiendoPortada(true);

      const subida =
        await subirImagenPortadaProduccion({
          pedidoId,
          archivo,
        });

      setImagenPortada(
        subida.url
      );

      setImagenPortadaThumb(
        subida.thumbUrl ||
        subida.url
      );

      setMostrarSelectorPortada(false);

      event.target.value = "";
    } catch (error) {
      console.error(
        "Error subiendo portada:",
        error
      );

      alert(
        error?.message ||
        "No se pudo subir la portada."
      );
    } finally {
      setSubiendoPortada(false);
    }
  }


  async function manejarSubirArchivos(
    event
  ) {
    try {
      const files =
        Array.from(
          event.target.files || []
        );

      if (
        !files.length ||
        !pedidoId
      ) {
        return;
      }

      if (
        archivos.length +
          files.length >
        5
      ) {
        throw new Error(
          "Máximo 5 archivos."
        );
      }

      setSubiendoArchivo(true);

      const nuevos = [];

      for (const archivo of files) {
        const subido =
          await subirArchivoProduccion({
            pedidoId,
            archivo,
          });

        nuevos.push(subido);
      }

      setArchivos(
        (prev) => [
          ...prev,
          ...nuevos,
        ]
      );

      event.target.value = "";
    } catch (error) {
      console.error(
        "Error subiendo archivo:",
        error
      );

      alert(
        error?.message ||
        "No se pudo subir el archivo."
      );
    } finally {
      setSubiendoArchivo(false);
    }
  }


  async function guardar() {
    try {
      if (!pedidoId) return;

      setGuardando(true);

      const etiquetasSeleccionadas =
        etiquetasDisponibles
          .filter((etiqueta) =>
            etiquetasSeleccionadasIds.includes(
              etiqueta.id
            )
          )
          .slice(0, 4)
          .map((etiqueta) => ({
            id: etiqueta.id,
            nombre:
              etiqueta.nombre || "",
            color:
              etiqueta.color || "",
          }));

      const usuarioSeleccionado =
        usuarios.find(
          (usuario) =>
            usuario.uid ===
            usuarioAsignadoUid
        ) || null;

      if (puedeAsignarUsuario) {
        await asignarUsuarioProduccion({
          pedidoId,

          usuarioAsignado:
            usuarioSeleccionado,

          usuarioActor: {
            uid:
              perfil?.uid ||
              perfil?.firebaseUid ||
              null,

            nombre:
              perfil?.nombre ||
              perfil?.email ||
              "Usuario",
          },
        });
      }

      await actualizarDetalleManualProduccion({
        pedidoId,

        produccionNotaCorta:
          notaCorta,

        produccionNotaLarga:
          notaLarga,

        produccionImagenPortada:
          imagenPortada,

        produccionImagenPortadaThumb:
          imagenPortadaThumb,

        produccionArchivos:
          archivos,

        produccionEtiquetas:
          etiquetasSeleccionadas,

        produccionEtiquetaId:
          etiquetasSeleccionadas[0]?.id ||
          "",

        produccionEtiquetaNombre:
          etiquetasSeleccionadas[0]
            ?.nombre || "",

        produccionEtiquetaColor:
          etiquetasSeleccionadas[0]
            ?.color || "",
      });

      onCerrar();
    } catch (error) {
      console.error(
        "Error guardando detalle de producción:",
        error
      );
    } finally {
      setGuardando(false);
    }
  }


  return (
    <>
      <div
        className="produccion-modal-overlay"
        onClick={onCerrar}
      >
        <div
          className="produccion-modal"
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <div className="produccion-modal-header">
            <h3>
              Detalle manual de producción
            </h3>

            <button
              type="button"
              className="produccion-modal-menu-btn"
              onClick={(event) => {
                event.stopPropagation();

                setMenuAbierto(
                  (prev) => !prev
                );

                setVistaMenu(
                  "principal"
                );

                setMensajeMenu("");
              }}
            >
              ⋯
            </button>

            {menuAbierto && (
              <div
                className="produccion-modal-menu"
                onClick={(event) =>
                  event.stopPropagation()
                }
              >
                {mensajeMenu && (
                  <div className="produccion-card-menu-success">
                    {mensajeMenu}
                  </div>
                )}

                {vistaMenu ===
                  "principal" && (
                  <>
                    {puedeCambiarColorTarjeta && (
                      <button
                        type="button"
                        className="produccion-card-menu-option"
                        onClick={() =>
                          setVistaMenu(
                            "color"
                          )
                        }
                      >
                        Cambiar color
                      </button>
                    )}

                    <button
                      type="button"
                      className="produccion-card-menu-option"
                      onClick={() =>
                        setVistaMenu(
                          "mover"
                        )
                      }
                    >
                      Mover
                    </button>
                  </>
                )}

                {vistaMenu ===
                  "color" && (
                  <>
                    <button
                      type="button"
                      className="produccion-card-menu-back"
                      onClick={() =>
                        setVistaMenu(
                          "principal"
                        )
                      }
                    >
                      ← Volver
                    </button>

                    <div className="produccion-card-menu-title">
                      Cambiar color
                    </div>

                    <div className="produccion-card-color-grid">
                      {[
                        {
                          id: "",
                          nombre:
                            "Blanco",
                        },
                        {
                          id:
                            "amarillo",
                          nombre:
                            "Amarillo",
                        },
                        {
                          id:
                            "verde",
                          nombre:
                            "Verde",
                        },
                        {
                          id:
                            "azul",
                          nombre:
                            "Azul",
                        },
                        {
                          id:
                            "rojo",
                          nombre:
                            "Rojo",
                        },
                        {
                          id:
                            "violeta",
                          nombre:
                            "Violeta",
                        },
                      ].map(
                        (color) => (
                          <button
                            key={
                              color.id ||
                              "blanco"
                            }
                            type="button"
                            className={`produccion-card-color-dot color-${
                              color.id ||
                              "blanco"
                            } ${
                              colorTarjeta ===
                              color.id
                                ? "activo"
                                : ""
                            }`}
                            onClick={() =>
                              manejarCambiarColor(
                                color.id
                              )
                            }
                            title={
                              color.nombre
                            }
                          />
                        )
                      )}
                    </div>
                  </>
                )}

                {vistaMenu ===
                  "mover" && (
                  <>
                    <button
                      type="button"
                      className="produccion-card-menu-back"
                      onClick={() =>
                        setVistaMenu(
                          "principal"
                        )
                      }
                    >
                      ← Volver
                    </button>

                    <div className="produccion-card-menu-title">
                      Mover a columna
                    </div>

                    <div className="produccion-card-column-list">
                      {columnas.map(
                        (columna) => (
                          <button
                            key={
                              columna.id
                            }
                            type="button"
                            onClick={() =>
                              manejarMover(
                                columna.id
                              )
                            }
                          >
                            {columna.nombre ||
                              "Columna"}
                          </button>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="produccion-modal-section">
            <h4>Notas internas</h4>

            <label>
              Nota corta
            </label>

            <input
              type="text"
              maxLength={60}
              value={notaCorta}
              onChange={(event) =>
                setNotaCorta(
                  event.target.value
                )
              }
              className="produccion-modal-input"
              placeholder="Ej: Mandar hoy / Esperar tela / Revisar logo"
            />

            <label>
              Nota larga
            </label>

            <textarea
              rows={4}
              value={notaLarga}
              onChange={(event) =>
                setNotaLarga(
                  event.target.value
                )
              }
              className="produccion-modal-input"
              placeholder="Detalle interno para producción..."
              style={{
                resize: "vertical",
                minHeight: 110,
              }}
            />
          </div>

          <div className="produccion-modal-section">
            <h4>Asignación</h4>

            {puedeAsignarUsuario && (
              <>
                <label>
                  Asignado a
                </label>

                <div className="produccion-asignacion-box">
                  <select
                    value={
                      usuarioAsignadoUid
                    }
                    onChange={(
                      event
                    ) =>
                      setUsuarioAsignadoUid(
                        event.target
                          .value
                      )
                    }
                    className="produccion-modal-input"
                  >
                    <option value="">
                      Sin asignar
                    </option>

                    {usuarios.map(
                      (usuario) => (
                        <option
                          key={
                            usuario.uid
                          }
                          value={
                            usuario.uid
                          }
                        >
                          {usuario.nombre ||
                            usuario.email ||
                            usuario.uid}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="produccion-modal-section">
            <h4>Etiquetas</h4>

            <details className="produccion-etiquetas-details">
              <summary>
                Etiquetas seleccionadas:{" "}
                {
                  etiquetasSeleccionadasIds.length
                }
                /4
              </summary>

              <div className="produccion-etiquetas-checklist">
                {etiquetasDisponibles.map(
                  (etiqueta) => {
                    const activa =
                      etiquetasSeleccionadasIds.includes(
                        etiqueta.id
                      );

                    const maximoAlcanzado =
                      etiquetasSeleccionadasIds.length >=
                        4 &&
                      !activa;

                    return (
                      <div
                        key={
                          etiqueta.id
                        }
                        className="produccion-etiqueta-check-row"
                      >
                        <label className="produccion-etiqueta-check">
                          <input
                            type="checkbox"
                            checked={
                              activa
                            }
                            disabled={
                              maximoAlcanzado
                            }
                            onChange={() => {
                              setEtiquetasSeleccionadasIds(
                                (
                                  prev
                                ) => {
                                  if (
                                    prev.includes(
                                      etiqueta.id
                                    )
                                  ) {
                                    return prev.filter(
                                      (
                                        id
                                      ) =>
                                        id !==
                                        etiqueta.id
                                    );
                                  }

                                  if (
                                    prev.length >=
                                    4
                                  ) {
                                    return prev;
                                  }

                                  return [
                                    ...prev,
                                    etiqueta.id,
                                  ];
                                }
                              );
                            }}
                          />

                          <span className="produccion-etiqueta-preview">
                            {
                              etiqueta.nombre
                            }
                          </span>
                        </label>

                        <div className="produccion-etiqueta-actions">
                          <button
                            type="button"
                            onClick={() =>
                              editarEtiqueta(
                                etiqueta
                              )
                            }
                          >
                            ✎
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              eliminarEtiqueta(
                                etiqueta
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </details>

            <small className="produccion-hint">
              Podés seleccionar hasta 4 etiquetas por tarjeta.
            </small>

            <button
              type="button"
              className="btn-produccion-secundario"
              onClick={() =>
                setMostrarNuevaEtiqueta(
                  (prev) => !prev
                )
              }
            >
              + Etiqueta
            </button>

            {mostrarNuevaEtiqueta && (
              <div className="produccion-etiqueta-nueva-box">
                <input
                  type="text"
                  maxLength={22}
                  value={
                    nuevaEtiquetaNombre
                  }
                  onChange={(event) =>
                    setNuevaEtiquetaNombre(
                      event.target.value
                    )
                  }
                  className="produccion-modal-input"
                  placeholder="Nombre de la etiqueta"
                />

                <div className="produccion-colores-box">
                  {[
                    "amarillo",
                    "verde",
                    "azul",
                    "rojo",
                    "violeta",
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`produccion-color-btn ${
                        nuevaEtiquetaColor ===
                        color
                          ? "activo"
                          : ""
                      }`}
                      onClick={() =>
                        setNuevaEtiquetaColor(
                          color
                        )
                      }
                    >
                      {color}
                    </button>
                  ))}
                </div>

                <div className="produccion-modal-actions">
                  <button
                    type="button"
                    className="btn-produccion-cancelar"
                    onClick={() => {
                      setMostrarNuevaEtiqueta(
                        false
                      );

                      setNuevaEtiquetaNombre(
                        ""
                      );

                      setNuevaEtiquetaColor(
                        "rojo"
                      );
                    }}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="btn-produccion-primario"
                    onClick={
                      guardarNuevaEtiqueta
                    }
                    disabled={
                      guardandoEtiqueta
                    }
                  >
                    {guardandoEtiqueta
                      ? "Guardando..."
                      : "Guardar etiqueta"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="produccion-modal-section">
            <h4>Portada</h4>

            <label>
              Imagen de portada
            </label>

            <div className="produccion-portada-box">
              {imagenPortada ? (
                <>
                  <img
                    src={imagenPortada}
                    alt=""
                    title="Ver imagen"
                    onClick={() =>
                      setImagenPreview(
                        imagenPortada
                      )
                    }
                    style={{
                      width: "100%",
                      maxHeight: 180,
                      objectFit:
                        "contain",
                      borderRadius: 10,
                      marginTop: 6,
                      border:
                        "1px solid #e5e7eb",
                      cursor: "zoom-in",
                    }}
                  />

                  <div className="produccion-portada-actions">
                    <button
                      type="button"
                      className="btn-produccion-secundario"
                      onClick={() =>
                        setImagenPreview(
                          imagenPortada
                        )
                      }
                    >
                      Ver portada
                    </button>

                    <button
                      type="button"
                      className="btn-produccion-secundario"
                      onClick={() =>
                        setMostrarSelectorPortada(
                          (prev) =>
                            !prev
                        )
                      }
                    >
                      Cambiar portada
                    </button>

                    <button
                      type="button"
                      className="btn-produccion-cancelar"
                      onClick={() => {
                        setImagenPortada(
                          ""
                        );

                        setImagenPortadaThumb(
                          ""
                        );

                        setMostrarSelectorPortada(
                          false
                        );
                      }}
                    >
                      Quitar
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-produccion-secundario produccion-btn-full"
                    disabled={
                      imagenesPedido.length ===
                      0
                    }
                    onClick={() =>
                      setMostrarSelectorPortada(
                        (prev) =>
                          !prev
                      )
                    }
                  >
                    {imagenesPedido.length >
                    0
                      ? `Ver imágenes del pedido (${imagenesPedido.length})`
                      : "Sin imágenes del pedido"}
                  </button>
                </>
              ) : (
                <>
                  {imagenesPedido.length >
                  0 ? (
                    <button
                      type="button"
                      className="btn-produccion-secundario produccion-btn-full"
                      onClick={() =>
                        setMostrarSelectorPortada(
                          (prev) =>
                            !prev
                        )
                      }
                    >
                      Ver imágenes del pedido (
                      {
                        imagenesPedido.length
                      }
                      )
                    </button>
                  ) : (
                    <label className="btn-produccion-secundario produccion-btn-full">
                      {subiendoPortada
                        ? "Subiendo..."
                        : "Subir portada"}

                      <input
                        type="file"
                        accept="image/*"
                        style={{
                          display:
                            "none",
                        }}
                        onChange={
                          manejarSubirPortada
                        }
                        disabled={
                          subiendoPortada
                        }
                      />
                    </label>
                  )}
                </>
              )}

              {cargandoImagenes && (
                <div className="produccion-historial-empty">
                  Cargando imágenes...
                </div>
              )}

              {mostrarSelectorPortada && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill,minmax(90px,1fr))",
                    gap: 10,
                    marginTop: 12,
                    maxHeight: 220,
                    overflowY:
                      "auto",
                  }}
                >
                  {imagenesPedido.map(
                    (imagen) => (
                      <div
                        key={
                          imagen.id
                        }
                        style={{
                          cursor:
                            "pointer",
                          border:
                            imagenPortada ===
                            imagen.url
                              ? "3px solid #00aeef"
                              : "1px solid #ddd",
                          borderRadius:
                            10,
                          overflow:
                            "hidden",
                        }}
                        onClick={() => {
                          setImagenPortada(
                            imagen.url
                          );

                          setImagenPortadaThumb(
                            imagen.thumbUrl ||
                              imagen.url
                          );

                          setMostrarSelectorPortada(
                            false
                          );
                        }}
                      >
                        <img
                          src={
                            imagen.url
                          }
                          alt=""
                          style={{
                            width:
                              "100%",
                            height: 90,
                            objectFit:
                              "cover",
                          }}
                        />

                        <div className="produccion-img-selector-footer">
                          <span>
                            {
                              imagen.producto
                            }
                          </span>

                          <button
                            type="button"
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              setImagenPreview(
                                imagen.url
                              );
                            }}
                          >
                            Ver
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  {imagenesPedido.length ===
                    0 && (
                    <div>
                      <div
                        style={{
                          color:
                            "#666",
                          marginBottom:
                            10,
                        }}
                      >
                        Este pedido no
                        tiene imágenes.
                      </div>

                      <input
                        type="file"
                        accept="image/*"
                        onChange={
                          manejarSubirPortada
                        }
                      />

                      {subiendoPortada && (
                        <div>
                          Subiendo
                          portada...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="produccion-modal-section">
            <h4>Archivos</h4>

            <label>
              Archivos de producción
            </label>

            <div className="produccion-archivos-box">
              <input
                type="file"
                multiple
                accept=".pdf,.xls,.xlsx,.doc,.docx,.zip"
                onChange={
                  manejarSubirArchivos
                }
                className="produccion-modal-input"
              />

              {subiendoArchivo && (
                <p className="produccion-historial-empty">
                  Subiendo archivo...
                </p>
              )}

              {archivos.length > 0 && (
                <div className="produccion-archivos-lista">
                  {archivos.map(
                    (archivo) => {
                      const extension =
                        archivo.extension ||
                        archivo.nombre
                          ?.split(".")
                          .pop()
                          ?.toLowerCase();

                      const icono =
                        extension ===
                        "pdf"
                          ? "📕"
                          : [
                              "xls",
                              "xlsx",
                            ].includes(
                              extension
                            )
                          ? "📊"
                          : [
                              "doc",
                              "docx",
                            ].includes(
                              extension
                            )
                          ? "📄"
                          : extension ===
                            "zip"
                          ? "🗜️"
                          : "📎";

                      return (
                        <div
                          key={
                            archivo.id
                          }
                          className="produccion-archivo-item compacto"
                        >
                          <a
                            href={
                              archivo.url
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="produccion-archivo-nombre"
                            title={
                              archivo.nombre
                            }
                          >
                            <span>
                              {
                                icono
                              }
                            </span>

                            <span>
                              {
                                archivo.nombre
                              }
                            </span>
                          </a>

                          <div className="produccion-archivo-acciones">
                            <a
                              href={
                                archivo.url
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver
                            </a>

                            <a
                              href={
                                archivo.url
                              }
                              download={
                                archivo.nombre
                              }
                              title="Descargar"
                            >
                              ↓
                            </a>

                            <button
                              type="button"
                              onClick={() =>
                                setArchivos(
                                  (
                                    prev
                                  ) =>
                                    prev.filter(
                                      (
                                        item
                                      ) =>
                                        item.id !==
                                        archivo.id
                                    )
                                )
                              }
                              title="Quitar"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="produccion-modal-actions">
            <button
              type="button"
              className="btn-produccion-cancelar"
              onClick={onCerrar}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="btn-produccion-primario"
              onClick={guardar}
              disabled={guardando}
            >
              {guardando
                ? "Guardando..."
                : "Guardar"}
            </button>
          </div>
        </div>
      </div>

      {imagenPreview && (
        <div
          className="produccion-imagen-preview-overlay"
          onClick={() =>
            setImagenPreview("")
          }
        >
          <div
            className="produccion-imagen-preview-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="produccion-imagen-preview-close"
              onClick={() =>
                setImagenPreview("")
              }
            >
              ×
            </button>

            <img
              src={imagenPreview}
              alt=""
            />
          </div>
        </div>
      )}
    </>
  );
}