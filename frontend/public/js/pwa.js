// Register service worker and handle install prompt
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered.', reg))
      .catch(err => console.warn('Service Worker registration failed:', err));
  });
}

let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  window.deferredPwaPrompt = e; // expose for manual UI triggers if needed
  console.log('PWA beforeinstallprompt captured');
});

window.addEventListener('appinstalled', () => {
  console.log('PWA installed');
  deferredPwaPrompt = null;
});

// Optional helper to prompt the install UI from other scripts:
window.promptPWAInstall = async function() {
  if (!deferredPwaPrompt) return false;
  deferredPwaPrompt.prompt();
  const choice = await deferredPwaPrompt.userChoice;
  const outcome = choice && choice.outcome ? choice.outcome : 'unknown';
  console.log('PWA install choice:', outcome);
  deferredPwaPrompt = null;
  return outcome;
};
