// PWA Service Worker Registration
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('[PWA] New Service Worker installing...');

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                console.log('[PWA] New version available! Refresh to update.');

                // Show update notification
                if (confirm('A new version is available! Reload to update?')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error);
        });

      // Handle service worker updates (guard against infinite reload)
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloading) {
          reloading = true;
          window.location.reload();
        }
      });
    });
  }
}

// Install prompt
let deferredPrompt = null;

export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();

    // Stash the event so it can be triggered later
    deferredPrompt = e;

    console.log('[PWA] Install prompt available');

    // Show install button or banner
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully');
    deferredPrompt = null;
    hideInstallButton();
  });
}

function showInstallButton() {
  // Create install button if it doesn't exist
  const existingButton = document.getElementById('pwa-install-btn');
  if (existingButton) return;

  const button = document.createElement('button');
  button.id = 'pwa-install-btn';
  button.innerHTML = '📱 Install App';
  button.className = 'fixed bottom-4 right-4 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors z-50';
  button.onclick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install prompt outcome: ${outcome}`);

    // Clear the deferred prompt
    deferredPrompt = null;
    hideInstallButton();
  };

  document.body.appendChild(button);
}

function hideInstallButton() {
  const button = document.getElementById('pwa-install-btn');
  if (button) {
    button.remove();
  }
}

// Check if running as PWA
export function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

// Offline detection
export function setupOfflineDetection() {
  window.addEventListener('online', () => {
    console.log('[PWA] Back online');
    showToast('🟢 Back online', 'success');
  });

  window.addEventListener('offline', () => {
    console.log('[PWA] Gone offline');
    showToast('🔴 Offline mode - Some features may be limited', 'warning');
  });
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 ${
    type === 'success' ? 'bg-green-600' :
    type === 'warning' ? 'bg-yellow-600' :
    type === 'error' ? 'bg-red-600' :
    'bg-blue-600'
  } text-white`;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Initialize PWA features
export function initPWA() {
  registerServiceWorker();
  setupInstallPrompt();
  setupOfflineDetection();

  // Log PWA status
  if (isPWA()) {
    console.log('[PWA] Running as installed app');
  } else {
    console.log('[PWA] Running in browser');
  }
}
