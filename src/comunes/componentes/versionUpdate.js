export const CURRENT_BUILD_ID = process.env.REACT_APP_ZALFRO_BUILD_ID || "";
export const VERSION_CHANNEL = "zalfro-version";
export const POLL_INTERVAL_MS = 2 * 60 * 1000;
export const EVENT_MIN_INTERVAL_MS = 60 * 1000;
export const FETCH_TIMEOUT_MS = 8 * 1000;

const UPDATE_MODES = new Set(["required", "optional"]);

export function validateVersionManifest(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.schema !== 1 ||
    typeof value.buildId !== "string" ||
    !value.buildId.trim() ||
    !UPDATE_MODES.has(value.updateMode)
  ) {
    return null;
  }
  return {
    schema: 1,
    buildId: value.buildId.trim(),
    updateMode: value.updateMode,
  };
}

export function buildReloadUrl(href, buildId) {
  const url = new URL(href);
  url.searchParams.set("__zalfro_build", buildId);
  return url.toString();
}

export function createVersionMonitor({
  currentBuildId,
  onUpdate,
  fetchImpl,
  windowObject,
  documentObject,
  BroadcastChannelClass,
  warn = console.warn,
  now = () => Date.now(),
  pollIntervalMs = POLL_INTERVAL_MS,
  minCheckIntervalMs = EVENT_MIN_INTERVAL_MS,
  fetchTimeoutMs = FETCH_TIMEOUT_MS,
}) {
  let stopped = false;
  let lastCheckAt = Number.NEGATIVE_INFINITY;
  let inFlight = null;
  let activeController = null;
  let intervalId = null;
  let channel = null;
  let available = null;

  const applyManifest = (manifest, broadcast) => {
    if (stopped) return;
    if (manifest.buildId === currentBuildId) {
      if (available) {
        available = null;
        onUpdate(null);
      }
      return;
    }

    const unchanged =
      available?.buildId === manifest.buildId &&
      available?.updateMode === manifest.updateMode;
    const wouldDowngrade =
      available?.buildId === manifest.buildId &&
      available?.updateMode === "required" &&
      manifest.updateMode === "optional";
    if (unchanged || wouldDowngrade) return;

    available = manifest;
    onUpdate(manifest);
    if (broadcast && channel) {
      try {
        channel.postMessage(manifest);
      } catch (error) {
        warn("No se pudo comunicar la nueva versión a otras pestañas.", error);
      }
    }
  };

  const check = ({ force = false } = {}) => {
    if (stopped || !currentBuildId || windowObject.navigator?.onLine === false) {
      return Promise.resolve(null);
    }
    if (inFlight) return inFlight;

    const checkStartedAt = now();
    if (!force && checkStartedAt - lastCheckAt < minCheckIntervalMs) {
      return Promise.resolve(null);
    }
    lastCheckAt = checkStartedAt;
    activeController = new windowObject.AbortController();
    const timeoutId = windowObject.setTimeout(() => activeController?.abort(), fetchTimeoutMs);
    const versionUrl = new URL("/version.json", windowObject.location.origin);
    versionUrl.searchParams.set("t", String(checkStartedAt));

    inFlight = Promise.resolve()
      .then(() => fetchImpl(versionUrl.toString(), {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: activeController.signal,
      }))
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(value => {
        const manifest = validateVersionManifest(value);
        if (!manifest) {
          warn("El manifiesto de versión publicado no es válido.");
          return null;
        }
        applyManifest(manifest, true);
        return manifest;
      })
      .catch(error => {
        if (!stopped) warn("No se pudo comprobar la versión publicada.", error);
        return null;
      })
      .finally(() => {
        windowObject.clearTimeout(timeoutId);
        activeController = null;
        inFlight = null;
      });
    return inFlight;
  };

  const handleVisibility = () => {
    if (documentObject.visibilityState === "visible") check({ force: true });
  };
  const handleFocus = () => check({ force: true });
  const handleOnline = () => check({ force: true });

  const start = () => {
    if (!currentBuildId) {
      warn("REACT_APP_ZALFRO_BUILD_ID no está disponible; detector desactivado.");
      return;
    }

    if (BroadcastChannelClass) {
      try {
        channel = new BroadcastChannelClass(VERSION_CHANNEL);
        channel.onmessage = event => {
          const manifest = validateVersionManifest(event.data);
          if (manifest) applyManifest(manifest, false);
        };
      } catch (error) {
        channel = null;
        warn("BroadcastChannel no está disponible; se mantiene el polling individual.", error);
      }
    }

    documentObject.addEventListener("visibilitychange", handleVisibility);
    windowObject.addEventListener("focus", handleFocus);
    windowObject.addEventListener("online", handleOnline);
    intervalId = windowObject.setInterval(() => {
      if (documentObject.visibilityState === "visible") check();
    }, pollIntervalMs);
    check({ force: true });
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    activeController?.abort();
    if (intervalId !== null) windowObject.clearInterval(intervalId);
    documentObject.removeEventListener("visibilitychange", handleVisibility);
    windowObject.removeEventListener("focus", handleFocus);
    windowObject.removeEventListener("online", handleOnline);
    if (channel) {
      channel.onmessage = null;
      channel.close();
    }
  };

  return { start, stop, check };
}
