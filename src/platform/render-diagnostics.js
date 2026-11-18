// Local-only failure reporting: no network requests, storage or automatic reloads.
export function createRenderDiagnostics({ root, canvas, getState, onFailure, t }) {
  const reportField = root.querySelector('#render-report');
  const copyButton = root.querySelector('#copy-render-report');
  const copyStatus = root.querySelector('#render-copy-status');
  let failed = false;

  function report(kind, error) {
    if (failed) return; // Preserve the original failure, not follow-up errors.
    failed = true;
    let game;
    try {
      game = getState();
    } catch (stateError) {
      game = { snapshotError: String(stateError) };
    }
    const details = {
      diagnosticsVersion: 1,
      timestamp: new Date().toISOString(),
      kind,
      message: error?.message || String(error),
      stack: error?.stack || null,
      page: location.origin + location.pathname,
      device: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGB: navigator.deviceMemory,
        viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio }
      },
      game
    };
    reportField.value = JSON.stringify(details, null, 2);
    root.showModal();
    copyButton.focus();
    try {
      onFailure();
    } catch (shutdownError) {
      details.shutdownError = String(shutdownError);
      reportField.value = JSON.stringify(details, null, 2);
    }
    console.error('Orbit Rush rendering stopped:', details);
  }

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    report('webgl-context-lost', new Error(event.statusMessage || 'WebGL graphics context lost'));
  });
  root.addEventListener('cancel', event => event.preventDefault());
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(reportField.value);
      copyStatus.textContent = t('diagnosticsCopied');
    } catch {
      // Clipboard access can be blocked on mobile or insecure local HTTP URLs.
      reportField.focus();
      reportField.select();
      copyStatus.textContent = t('diagnosticsCopyManually');
    }
  });
  root.querySelector('#reload-render').addEventListener('click', () => location.reload());

  return {
    get failed() { return failed; },
    report,
    runFrame(callback) {
      if (failed) return;
      try {
        callback();
      } catch (error) {
        report('frame-error', error);
      }
    }
  };
}
