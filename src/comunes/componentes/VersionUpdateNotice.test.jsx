import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { VersionUpdateView } from "./VersionUpdateNotice";
import {
  POLL_INTERVAL_MS,
  buildReloadUrl,
  createVersionMonitor,
  validateVersionManifest,
} from "./versionUpdate";

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: jest.fn().mockResolvedValue(body) };
}

function environment({ online = true, visible = true } = {}) {
  const windowListeners = {};
  const documentListeners = {};
  const intervals = new Map();
  const timeouts = new Map();
  let sequence = 0;
  const windowObject = {
    location: { origin: "https://app.zalfro.com" },
    navigator: { onLine: online },
    AbortController,
    addEventListener: jest.fn((name, fn) => { windowListeners[name] = fn; }),
    removeEventListener: jest.fn((name, fn) => {
      if (windowListeners[name] === fn) delete windowListeners[name];
    }),
    setInterval: jest.fn(fn => { const id = ++sequence; intervals.set(id, fn); return id; }),
    clearInterval: jest.fn(id => intervals.delete(id)),
    setTimeout: jest.fn(fn => { const id = ++sequence; timeouts.set(id, fn); return id; }),
    clearTimeout: jest.fn(id => timeouts.delete(id)),
  };
  const documentObject = {
    visibilityState: visible ? "visible" : "hidden",
    addEventListener: jest.fn((name, fn) => { documentListeners[name] = fn; }),
    removeEventListener: jest.fn((name, fn) => {
      if (documentListeners[name] === fn) delete documentListeners[name];
    }),
  };
  return { windowObject, documentObject, windowListeners, documentListeners, intervals, timeouts };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function monitorFor({
  fetchImpl,
  onUpdate = jest.fn(),
  warn = jest.fn(),
  env = environment(),
  BroadcastChannelClass,
  now = () => 100000,
} = {}) {
  const monitor = createVersionMonitor({
    currentBuildId: "actual",
    onUpdate,
    fetchImpl,
    windowObject: env.windowObject,
    documentObject: env.documentObject,
    BroadcastChannelClass,
    warn,
    now,
    minCheckIntervalMs: 60000,
    fetchTimeoutMs: 8000,
  });
  return { monitor, onUpdate, warn, env };
}

test("valida estrictamente el manifiesto", () => {
  expect(validateVersionManifest({ schema: 1, buildId: " nuevo ", updateMode: "required" }))
    .toEqual({ schema: 1, buildId: "nuevo", updateMode: "required" });
  expect(validateVersionManifest({ schema: 2, buildId: "nuevo", updateMode: "required" }))
    .toBeNull();
  expect(validateVersionManifest({ schema: 1, buildId: "", updateMode: "required" }))
    .toBeNull();
  expect(validateVersionManifest({ schema: 1, buildId: "nuevo", updateMode: "otro" }))
    .toBeNull();
});

test("el mismo build no muestra aviso", async () => {
  const setup = monitorFor({ fetchImpl: jest.fn().mockResolvedValue(response({ schema: 1, buildId: "actual", updateMode: "required" })) });
  setup.monitor.start();
  await setup.monitor.check({ force: true });
  expect(setup.onUpdate).not.toHaveBeenCalled();
  setup.monitor.stop();
});

test.each(["required", "optional"])("un build distinto activa modo %s", async updateMode => {
  const setup = monitorFor({ fetchImpl: jest.fn().mockResolvedValue(response({ schema: 1, buildId: "nuevo", updateMode })) });
  setup.monitor.start();
  await setup.monitor.check({ force: true });
  expect(setup.onUpdate).toHaveBeenCalledWith({ schema: 1, buildId: "nuevo", updateMode });
  setup.monitor.stop();
});

test("manifiesto inválido y error HTTP no bloquean", async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(response({ schema: 3 }))
    .mockResolvedValueOnce(response({}, { ok: false, status: 503 }));
  let currentTime = 100000;
  const setup = monitorFor({ fetchImpl, now: () => currentTime });
  setup.monitor.start();
  await setup.monitor.check({ force: true });
  currentTime += 60001;
  await setup.monitor.check();
  expect(setup.onUpdate).not.toHaveBeenCalled();
  expect(setup.warn).toHaveBeenCalledTimes(2);
  setup.monitor.stop();
});

test("offline omite el request", async () => {
  const env = environment({ online: false });
  const fetchImpl = jest.fn();
  const setup = monitorFor({ env, fetchImpl });
  setup.monitor.start();
  await settle();
  expect(fetchImpl).not.toHaveBeenCalled();
  setup.monitor.stop();
});

test("el timeout aborta el request sin bloquear", async () => {
  const env = environment();
  const fetchImpl = jest.fn((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { name: "AbortError" })));
  }));
  const setup = monitorFor({ env, fetchImpl });
  setup.monitor.start();
  await settle();
  const timeout = [...env.timeouts.values()][0];
  timeout();
  await setup.monitor.check({ force: true });
  expect(setup.warn).toHaveBeenCalledTimes(1);
  setup.monitor.stop();
});

test.each([
  ["visibilitychange a visible", setup => setup.env.documentListeners.visibilitychange()],
  ["focus", setup => setup.env.windowListeners.focus()],
  ["online", setup => setup.env.windowListeners.online()],
])("%s comprueba inmediatamente aunque no hayan pasado 60 segundos", async (name, trigger) => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ schema: 1, buildId: "actual", updateMode: "required" }));
  const setup = monitorFor({ fetchImpl, now: () => 100000 });
  setup.monitor.start();
  await setup.monitor.check({ force: true });
  trigger(setup);
  await setup.monitor.check({ force: true });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  setup.monitor.stop();
});

test("el polling visible se programa cada 2 minutos", () => {
  const setup = monitorFor({ fetchImpl: jest.fn().mockResolvedValue(response({ schema: 1, buildId: "actual", updateMode: "required" })) });
  setup.monitor.start();
  expect(POLL_INTERVAL_MS).toBe(2 * 60 * 1000);
  expect(setup.env.windowObject.setInterval).toHaveBeenCalledWith(expect.any(Function), POLL_INTERVAL_MS);
  setup.monitor.stop();
});

test("deduplica requests simultáneos", async () => {
  let finish;
  const fetchImpl = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const setup = monitorFor({ fetchImpl });
  setup.monitor.start();
  const second = setup.monitor.check({ force: true });
  await settle();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  finish(response({ schema: 1, buildId: "actual", updateMode: "required" }));
  await second;
  setup.monitor.stop();
});

test("cleanup elimina listeners, intervalo y request activo", async () => {
  const fetchImpl = jest.fn((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })));
  }));
  const setup = monitorFor({ fetchImpl });
  setup.monitor.start();
  await settle();
  setup.monitor.stop();
  await settle();
  expect(setup.env.windowObject.clearInterval).toHaveBeenCalled();
  expect(setup.env.windowObject.removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
  expect(setup.env.windowObject.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
  expect(setup.env.documentObject.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  expect(setup.warn).not.toHaveBeenCalled();
});

test("BroadcastChannel propaga y escala optional a required", async () => {
  let instance;
  class Channel {
    constructor(name) { this.name = name; this.postMessage = jest.fn(); this.close = jest.fn(); instance = this; }
  }
  const setup = monitorFor({
    BroadcastChannelClass: Channel,
    fetchImpl: jest.fn().mockResolvedValue(response({ schema: 1, buildId: "nuevo", updateMode: "optional" })),
  });
  setup.monitor.start();
  await setup.monitor.check({ force: true });
  expect(instance.name).toBe("zalfro-version");
  expect(instance.postMessage).toHaveBeenCalled();
  instance.onmessage({ data: { schema: 1, buildId: "nuevo", updateMode: "required" } });
  expect(setup.onUpdate).toHaveBeenLastCalledWith({ schema: 1, buildId: "nuevo", updateMode: "required" });
  setup.monitor.stop();
  expect(instance.close).toHaveBeenCalled();
});

test("sin BroadcastChannel conserva polling individual", async () => {
  const setup = monitorFor({
    BroadcastChannelClass: undefined,
    fetchImpl: jest.fn().mockResolvedValue(response({ schema: 1, buildId: "actual", updateMode: "required" })),
  });
  setup.monitor.start();
  await settle();
  expect(setup.env.windowObject.setInterval).toHaveBeenCalled();
  setup.monitor.stop();
});

test("conserva ruta, query, token y hash al construir la URL", () => {
  const result = new URL(buildReloadUrl(
    "https://app.zalfro.com/activar-cuenta?token=abc&periodo=mensual#paso",
    "nuevo-build"
  ));
  expect(result.pathname).toBe("/activar-cuenta");
  expect(result.searchParams.get("token")).toBe("abc");
  expect(result.searchParams.get("periodo")).toBe("mensual");
  expect(result.searchParams.get("__zalfro_build")).toBe("nuevo-build");
  expect(result.hash).toBe("#paso");
});

test("required es bloqueante, accesible y no tiene controles de cierre", () => {
  const onReload = jest.fn();
  render(<VersionUpdateView update={{ buildId: "nuevo", updateMode: "required" }} onReload={onReload} />);
  const dialog = screen.getByRole("alertdialog");
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(screen.getByRole("heading", { name: "Zalfro se actualizó" })).not.toBeNull();
  expect(screen.getByText("Hay una nueva versión disponible. Para seguir usando Zalfro con los últimos cambios, actualizá la página.")).not.toBeNull();
  expect(screen.queryByText(/cancelar|cerrar/i)).toBeNull();
  fireEvent.click(dialog.parentElement);
  fireEvent.keyDown(dialog.parentElement, { key: "Escape" });
  fireEvent.keyDown(dialog.parentElement, { key: "Tab" });
  expect(screen.getByRole("alertdialog")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));
  expect(onReload).toHaveBeenCalledTimes(1);
});

test("optional es persistente y no bloqueante", () => {
  render(<VersionUpdateView update={{ buildId: "nuevo", updateMode: "optional" }} onReload={jest.fn()} />);
  expect(screen.getByRole("status")).not.toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
