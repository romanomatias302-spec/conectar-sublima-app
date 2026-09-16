import {onSnapshot} from "firebase/firestore";
import {subscribeSaasAccountState} from "./saasAccountRealtime";

jest.mock("../firebase", () => ({db: {}}));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn((...parts) => ({type: "collection", parts})),
  doc: jest.fn((...parts) => ({type: "document", parts})),
  query: jest.fn((reference) => reference),
  where: jest.fn(),
  onSnapshot: jest.fn(),
}));

test("observa contrato y recursos del tenant y limpia todos los listeners", () => {
  const cleanups = Array.from({length: 5}, () => jest.fn());
  onSnapshot.mockImplementation((_reference, _next, _error) => cleanups.shift());
  const remaining = [...cleanups];
  const unsubscribe = subscribeSaasAccountState({tenantId: "tenant", onState: jest.fn()});
  expect(onSnapshot).toHaveBeenCalledTimes(5);
  unsubscribe();
  remaining.forEach((cleanup) => expect(cleanup).toHaveBeenCalledTimes(1));
});

test("emite un estado consistente cuando llegaron los cinco snapshots", () => {
  const callbacks = [];
  onSnapshot.mockImplementation((_reference, next) => {
    callbacks.push(next);
    return jest.fn();
  });
  const onState = jest.fn();
  subscribeSaasAccountState({tenantId: "tenant", onState});
  callbacks[0]({exists: () => true, id: "tenant", data: () => ({planId: "start"})});
  callbacks.slice(1).forEach((callback) => callback({docs: []}));
  expect(onState).toHaveBeenCalledWith({
    client: {id: "tenant", planId: "start"}, users: [], invitations: [], branches: [], movements: [],
  });
});
