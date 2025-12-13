import { db } from "../firebase";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

/**
 * 🔧 Función para actualizar todos los productos de Firestore
 * Convierte los colores con objetos { nombre, codigo } → ["nombre"]
 */
export async function actualizarColoresFirestore() {
  try {
    const productosRef = collection(db, "productosBase");
    const snapshot = await getDocs(productosRef);

    let contador = 0;

    for (const documento of snapshot.docs) {
      const data = documento.data();

      if (Array.isArray(data.colores)) {
        // Detectar si tiene objetos {nombre, codigo}
        const tieneObjetos = data.colores.some(
          (c) => typeof c === "object" && c.nombre
        );

        if (tieneObjetos) {
          // Convertir a solo nombres
          const nuevosColores = data.colores.map((c) =>
            typeof c === "object" && c.nombre ? c.nombre : c
          );

          await updateDoc(doc(db, "productosBase", documento.id), {
            colores: nuevosColores,
          });

          contador++;
          console.log(`✅ Producto ${documento.id} actualizado.`);
        }
      }
    }

    console.log(`🚀 Actualización completa (${contador} productos modificados).`);
  } catch (error) {
    console.error("❌ Error al actualizar colores:", error);
  }
}
