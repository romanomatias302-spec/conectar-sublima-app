import React, { useEffect, useRef, useState } from "react";
import {
  CURRENT_BUILD_ID,
  buildReloadUrl,
  createVersionMonitor,
} from "./versionUpdate";
import "./VersionUpdateNotice.css";

const DEFAULT_MONITOR_OPTIONS = Object.freeze({});

export function VersionUpdateView({ update, onReload }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (update?.updateMode === "required") buttonRef.current?.focus();
  }, [update]);

  if (!update) return null;

  if (update.updateMode === "required") {
    return (
      <div
        className="zalfro-version-overlay"
        onKeyDown={event => {
          if (event.key === "Escape" || event.key === "Tab") {
            event.preventDefault();
            buttonRef.current?.focus();
          }
        }}
      >
        <section
          className="zalfro-version-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="zalfro-version-title"
          aria-describedby="zalfro-version-description"
        >
          <h2 id="zalfro-version-title">Zalfro se actualizó</h2>
          <p id="zalfro-version-description">
            Hay una nueva versión disponible. Para seguir usando Zalfro con los últimos cambios, actualizá la página.
          </p>
          <button ref={buttonRef} type="button" className="btn-primary" onClick={onReload}>
            Actualizar ahora
          </button>
        </section>
      </div>
    );
  }

  return (
    <aside className="zalfro-version-banner" role="status" aria-live="polite">
      <div>
        <strong>Zalfro se actualizó</strong>
        <span>Hay una nueva versión disponible. Actualizá la página para seguir usando Zalfro con los últimos cambios.</span>
      </div>
      <button type="button" className="btn-primary" onClick={onReload}>
        Actualizar ahora
      </button>
    </aside>
  );
}

export default function VersionUpdateNotice({
  currentBuildId = CURRENT_BUILD_ID,
  monitorOptions = DEFAULT_MONITOR_OPTIONS,
}) {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    const monitor = createVersionMonitor({
      currentBuildId,
      onUpdate: setUpdate,
      fetchImpl: window.fetch.bind(window),
      windowObject: window,
      documentObject: document,
      BroadcastChannelClass: window.BroadcastChannel,
      ...monitorOptions,
    });
    monitor.start();
    return () => monitor.stop();
  }, [currentBuildId, monitorOptions]);

  const reload = () => {
    if (!update?.buildId) return;
    window.location.replace(buildReloadUrl(window.location.href, update.buildId));
  };

  return <VersionUpdateView update={update} onReload={reload} />;
}
