
import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  startAfter,
} from "firebase/firestore";
import { db } from "../../firebase";
import { obtenerVentasPaginadas } from "../../firebase/ventas";
import "./VentasPage.css";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";

export default function VentasList({ perfil, onVer = () => {}, onEditar = () => {} }) {
  const [ventas, setVentas] = useState([]);
  const [ventasFiltradas, setVentasFiltradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMas, setLoadingMas] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  
  

  const PAGE_SIZE = 100;

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  

  function normalizarTexto(texto) {
    return (texto || "").toString().trim().toLowerCase();
  }

  async function cargarVentasIniciales() {
    try {
      setLoading(true);

      const res = await obtenerVentasPaginadas({
        perfil,
        pageSize: PAGE_SIZE,
      });

      console.log("VENTAS INICIALES:", res.ventas);
      console.log("PERFIL LISTADO VENTAS:", perfil);

      setVentas(res.ventas);
      setVentasFiltradas(res.ventas);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (e) {
      console.error("Error al cargar ventas:", e);
    } finally {
      setLoading(false);
    }
  }

  async function cargarMasVentas() {
    try {
      if (!ultimoDoc || !hayMas) return;

      setLoadingMas(true);

      const res = await obtenerVentasPaginadas({
        perfil,
        ultimoDoc,
        pageSize: PAGE_SIZE,
      });

      const acumuladas = [...ventas, ...res.ventas];

      setVentas(acumuladas);
      setVentasFiltradas(acumuladas);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (e) {
      console.error("Error al cargar más ventas:", e);
    } finally {
      setLoadingMas(false);
    }
  }

  async function buscarVentasEnFirestore(textoOriginal) {
    try {
      const texto = normalizarTexto(textoOriginal);
      if (!texto) {
        setVentasFiltradas(ventas);
        return;
      }

      const ventasRef = collection(db, "ventas");
      let q;

      if (/^\d+$/.test(texto)) {
        q =
          perfil?.rol === "superadmin"
            ? query(
                ventasRef,
                where("numeroVenta", "==", texto),
                limit(20)
              )
            : query(
                ventasRef,
                where("clienteId", "==", perfil?.clienteId),
                where("numeroVenta", "==", texto),
                limit(20)
              );
      } else {
        q =
          perfil?.rol === "superadmin"
            ? query(
                ventasRef,
                orderBy("clienteNombre"),
                where("clienteNombre", ">=", textoOriginal),
                where("clienteNombre", "<=", textoOriginal + "\uf8ff"),
                limit(50)
              )
            : query(
                ventasRef,
                where("clienteId", "==", perfil?.clienteId),
                orderBy("clienteNombre"),
                where("clienteNombre", ">=", textoOriginal),
                where("clienteNombre", "<=", textoOriginal + "\uf8ff"),
                limit(50)
              );
      }

      const snap = await getDocs(q);

      const lista = snap.docs.map((docu) => ({
        firebaseId: docu.id,
        ...docu.data(),
      }));

      setVentasFiltradas(lista);
    } catch (e) {
      console.error("Error buscando ventas:", e);
    }
  }



  useEffect(() => {
    if (!perfil) return;
    cargarVentasIniciales();
  }, [perfil]);

  useEffect(() => {
    const texto = normalizarTexto(busqueda);

    if (!texto) {
      setVentasFiltradas(ventas);
      return;
    }

    const local = ventas.filter((v) => {
      const numero = (v.numeroVenta || "").toString().toLowerCase();
      const cliente = (v.clienteNombre || "").toLowerCase();
      const dni = (v.clienteDNI || "").toString().toLowerCase();
      const pedido = (v.pedidoVisibleId || "").toString().toLowerCase();

      return (
        numero.includes(texto) ||
        cliente.includes(texto) ||
        dni.includes(texto) ||
        pedido.includes(texto)
      );
    });

    if (local.length > 0) {
      setVentasFiltradas(local);
      return;
    }

    const timer = setTimeout(() => {
      buscarVentasEnFirestore(busqueda);
    }, 350);

    return () => clearTimeout(timer);
  }, [busqueda, ventas]);

  return (
    <div className="ventas-page">
      <div className="ventas-topbar">
        <h1>Listado de ventas</h1>
        <p>Ventas registradas en el sistema</p>
      </div>

      <div className="ventas-card">
        <div className="ventas-grid ventas-grid-2">
          <div className="ventas-field">
            <label>Buscar venta</label>
            <input
              type="text"
              placeholder="Buscar por N° venta, cliente, DNI o pedido..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {loading && <p style={{ marginTop: "16px" }}>Cargando ventas...</p>}

        {!loading && (
          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead>
                <tr>
                  <th>N° Venta</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Pedido asociado</th>
                  <th>Total</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {ventasFiltradas.map((v) => (
                  <tr key={v.firebaseId}>
                    <td>{v.numeroVenta || "-"}</td>
                    <td>{v.fechaVenta || "-"}</td>
                    <td>{v.clienteNombre || "-"}</td>
                    <td>{v.pedidoVisibleId ? `#${v.pedidoVisibleId}` : "-"}</td>
                    <td>{formatearMoneda(v.total, configMoneda.moneda, configMoneda.localeMoneda)}</td>
                    <td>{formatearMoneda(v.totalPagado, configMoneda.moneda, configMoneda.localeMoneda)}</td> 
                    <td>
                      {Number(v.saldoAFavor || 0) > 0 ? (
                        <span className="ventas-saldo-badge ventas-saldo-favor">
                          A favor: {formatearMoneda(v.saldoAFavor, configMoneda.moneda, configMoneda.localeMoneda)}
                        </span>
                      ) : Number(v.saldoPendiente || 0) > 0 ? (
                        <span className="ventas-saldo-badge ventas-saldo-pendiente">
                          Pendiente: {formatearMoneda(v.saldoPendiente, configMoneda.moneda, configMoneda.localeMoneda)} 
                        </span>
                      ) : (
                        <span className="ventas-saldo-badge ventas-saldo-ok">
                          {formatearMoneda(0)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="ventas-acciones">
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => onVer(v)}
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {ventasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "18px" }}>
                      No se encontraron ventas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !busqueda && hayMas && (
          <div style={{ textAlign: "center", marginTop: "18px" }}>
            <button
              className="btn btn-secondary"
              onClick={cargarMasVentas}
              disabled={loadingMas}
            >
              {loadingMas ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}