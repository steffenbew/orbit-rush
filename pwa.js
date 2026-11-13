// Installation is offered by the browser; unsupported browsers can still play normally.
if (window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .catch(error => console.warn('Orbit Rush offline setup failed:', error));
  });
}
