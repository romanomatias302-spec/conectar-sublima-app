// Importar funciones desde Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuración de tu proyecto Firebase (reemplazá con tus datos reales)
const firebaseConfig = {
  apiKey: "AIzaSyC4JyAiVxQ1lHBfTlUEQLRHISMjevoQz8c",
  authDomain: "conectarsublimados-7881e.firebaseapp.com",
  projectId: "conectarsublimados-7881e",
  storageBucket: "conectarsublimados-7881e.appspot.com",
  messagingSenderId: "581268637988",
  appId: "1:581268637988:web:e341af5e071daa736d4bb1"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar la base de datos
export const db = getFirestore(app);