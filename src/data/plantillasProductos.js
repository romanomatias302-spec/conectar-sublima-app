// 🧩 plantillasProductos.js
export const PLANTILLAS_PRODUCTOS = {
  remera: {
    tipo: "textil",
    zonas: [
      {
        nombre: "Frente",
        subzonas: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"],
      },
      {
        nombre: "Espalda",
        subzonas: ["E1", "E2", "E3", "E4"],
      },
      {
        nombre: "Mangas",
        subzonas: ["M1", "M2"],
      },
    ],
    talles: [
      "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL",
      ,"S Mujer", "M Mujer", "L Mujer", "XL Mujer", "XXL Mujer",
      "T4", "T6", "T8", "T10", "T12", "T14", "T16",
    ],
  },

  taza: {
    tipo: "merchandising",
    zonas: [{ nombre: "Zona principal", subzonas: ["Z1"] }],
    talles: [],
  },

  gorra: {
    tipo: "merchandising",
    zonas: [{ nombre: "Frente", subzonas: ["G1", "G2"] }],
    talles: [],
  },
};
