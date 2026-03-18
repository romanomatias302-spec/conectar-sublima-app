import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC4JyAiVxQ1lHBFtUIEQLRHISMjevoQz8c",
  authDomain: "conectarsublimados-7881e.firebaseapp.com",
  projectId: "conectarsublimados-7881e",
  storageBucket: "conectarsublimados-7881e.firebasestorage.app",
  messagingSenderId: "581268637988",
  appId: "1:581268637988:web:e341af5e071daa736d4bb1"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);