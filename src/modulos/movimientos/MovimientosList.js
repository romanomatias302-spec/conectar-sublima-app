import React, { useEffect, useState } from "react";
import { obtenerMovimientosPaginados } from "../../firebase/movimientos";

export default function MovimientosList({ perfil }) {
  const [movimientos, setMovimientos] = useState([]);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const [loading, setLoading] = useState(false);

  const cargarMovimientos = async () => {
    try {
      setLoading(true);
      const res = await obtenerMovimientosPaginados({ perfil });
      setMovimientos(res.movimientos);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (error) {
      console.error("Error al cargar movimientos:", error);
    } finally {
      setLoading(false);
    }
  };

  const cargarMas = async () => {
    try {
      if (!ultimoDoc || !hayMas) return;
      const res = await obtenerMovimientosPaginados({ perfil, ultimoDoc });
      setMovimientos((prev) => [...prev, ...res.movimientos]);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (error) {
      console.error("Error al cargar más movimientos:", error);
    }
  };

  useEffect(() => {
    cargarMovimientos();
  }, [perfil]);

  return (
    <div className="clientes-lista">
      <div className="encabezado-lista">
        <h1>Movimientos</h1>
      </div>

      {loading && <p>Cargando movimientos...</p>}

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Subtipo</th>
            <th>Descripción</th>
            <th>Medio de pago</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.firebaseId}>
              <td>{m.fecha}</td>
              <td>{m.tipo}</td>
              <td>{m.subtipo}</td>
              <td>{m.descripcion}</td>
              <td>{m.medioPago}</td>
              <td>${m.monto}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!loading && hayMas && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={cargarMas}>Cargar más</button>
        </div>
      )}
    </div>
  );
}