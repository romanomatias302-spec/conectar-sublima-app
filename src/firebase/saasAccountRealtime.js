import {collection, doc, onSnapshot, query, where} from "firebase/firestore";
import {db} from "../firebase";

const rows = (snapshot, idField = "id") => snapshot.docs.map((item) => ({
  [idField]: item.id,
  ...item.data(),
}));

export function subscribeSaasAccountState({tenantId, onState, onError = console.error}) {
  if (!tenantId) return () => {};
  const state = {client: null, users: null, invitations: null, branches: null, movements: null};
  const emit = () => {
    if (Object.values(state).some((value) => value === null)) return;
    onState({...state});
  };
  const listen = (reference, key, mapper) => onSnapshot(reference, (snapshot) => {
    state[key] = mapper(snapshot);
    emit();
  }, onError);
  const tenantQuery = (name, field = "clienteId") => query(
    collection(db, name), where(field, "==", tenantId)
  );
  const unsubscribers = [
    listen(doc(db, "clientes-saas", tenantId), "client", (snapshot) =>
      snapshot.exists() ? {id: snapshot.id, ...snapshot.data()} : {}),
    listen(tenantQuery("usuarios"), "users", (snapshot) => rows(snapshot, "uid")),
    listen(tenantQuery("invitaciones_usuarios"), "invitations", rows),
    listen(tenantQuery("sucursales"), "branches", rows),
    listen(tenantQuery("saas_pagos", "clienteSaasId"), "movements", rows),
  ];
  return () => unsubscribers.forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
}
