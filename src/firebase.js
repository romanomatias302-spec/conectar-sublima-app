import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC4JyAiVxQ1lHBFtUIEQLRHISMjevoQz8c",
  authDomain: "conectarsublimados-7881e.firebaseapp.com",
  projectId: "conectarsublimados-7881e",
  storageBucket: "conectarsublimados-7881e.firebasestorage.app",
  messagingSenderId: "581268637988",
  appId: "1:581268637988:web:e341af5e071daa736d4bb1",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(
  app,
  "gs://conectarsublimados-7881e.firebasestorage.app"
);

const secondaryApp =
  getApps().find((a) => a.name === "secondary") ||
  initializeApp(firebaseConfig, "secondary");

export const secondaryAuth = getAuth(secondaryApp);
export const secondaryDb = getFirestore(secondaryApp);