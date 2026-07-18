/**
 * SafeRoute App Initialization
 * Main entry point that initializes all modules
 *
 * SUPPORTED MODES:
 * 1. LOCAL-ONLY (default): Uses localStorage, no account needed, works offline
 * 2. FIREBASE: Cloud sync, user accounts (requires Firebase config)
 */
(function(global) {
  'use strict';

  // Default Firebase configuration - MUST be set in index.html to enable cloud sync
  var _defaultFirebaseConfig = null; // Set to null for local-only mode

  /**
   * Initialize the SafeRoute app
   */
  function init(options) {
    console.log('[SafeRoute App] Initializing...');

    // Get config from global variable (set in index.html) or options
    var config = typeof firebaseConfig !== 'undefined' ? firebaseConfig : null;
    config = config || (options && options.firebaseConfig) || _defaultFirebaseConfig;
    var showAuthButton = options && options.showAuthButton !== false;

    // Initialize Firebase ONLY if config is provided
    if (config && global.SafeRoute && global.SafeRoute.Firebase) {
      console.log('[SafeRoute App] Firebase config found, initializing cloud sync...');

      global.SafeRoute.Firebase.init(config).then(function(user) {
        console.log('[SafeRoute App] Firebase initialized, user:', user ? user.uid : 'none');

        // Initialize Auth UI
        if (global.SafeRoute.AuthUI) {
          global.SafeRoute.AuthUI.init(global.SafeRoute.Firebase);

          if (showAuthButton) {
            global.SafeRoute.AuthUI.createFloatingButton();
          }
        }

        // Initialize SOS with Firebase
        if (global.SafeRoute.SOS) {
          global.SafeRoute.SOS.init(config).then(function() {
            console.log('[SafeRoute App] SOS initialized with Firebase');
          });
        }

      }).catch(function(err) {
        console.warn('[SafeRoute App] Firebase init failed, falling back to local mode:', err.message);
        _initLocalMode();
      });
    } else {
      // No Firebase config - use local-only mode
      console.log('[SafeRoute App] No Firebase config - using LOCAL-ONLY mode');
      _initLocalMode();
    }

    /**
     * Initialize in local-only mode (no cloud sync)
     */
    function _initLocalMode() {
      // Initialize SOS without Firebase - uses localStorage
      if (global.SafeRoute.SOS) {
        global.SafeRoute.SOS.init(null).then(function() {
          console.log('[SafeRoute App] SOS initialized (local mode)');
        });
      }
    }

    // Listen for login/logout events
    document.addEventListener('saferoute:login', function(e) {
      console.log('[SafeRoute App] User logged in:', e.detail.user);
      _updateAuthButtonState(true, e.detail.user);
    });

    document.addEventListener('saferoute:logout', function() {
      console.log('[SafeRoute App] User logged out');
      _updateAuthButtonState(false);
    });

    // Listen for notifications
    document.addEventListener('saferoute:notification', function(e) {
      _showNotification(e.detail.type, e.detail.message);
    });

    console.log('[SafeRoute App] Initialization complete');
  }

  /**
   * Update auth button state
   */
  function _updateAuthButtonState(isLoggedIn, user) {
    var button = document.getElementById('saferoute-auth-btn');
    if (button) {
      if (isLoggedIn) {
        button.innerHTML = '✓';
        button.title = user && user.email ? user.email : 'Logged In';
      } else {
        button.innerHTML = '👤';
        button.title = 'Login / Sign Up';
      }
    }
  }

  /**
   * Show notification toast
   */
  function _showNotification(type, message) {
    // Remove existing notifications
    var existing = document.querySelector('.saferoute-notification');
    if (existing) existing.remove();

    var notification = document.createElement('div');
    notification.className = 'saferoute-notification';
    notification.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:' +
      (type === 'success' ? '#10b981' : '#ef4444') + ';color:#fff;padding:12px 24px;' +
      'border-radius:8px;font-size:14px;font-weight:500;z-index:10001;opacity:0;transition:opacity 0.3s;';
    notification.textContent = message;

    document.body.appendChild(notification);

    // Show
    requestAnimationFrame(function() {
      notification.style.opacity = '1';
    });

    // Hide after 3 seconds
    setTimeout(function() {
      notification.style.opacity = '0';
      setTimeout(function() {
        notification.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Get Firebase service
   */
  function getFirebase() {
    return global.SafeRoute ? global.SafeRoute.Firebase : null;
  }

  /**
   * Get SOS service
   */
  function getSOS() {
    return global.SafeRoute ? global.SafeRoute.SOS : null;
  }

  /**
   * Get Auth UI service
   */
  function getAuthUI() {
    return global.SafeRoute ? global.SafeRoute.AuthUI : null;
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Small delay to ensure other scripts are loaded
      setTimeout(function() {
        init();
      }, 100);
    });
  } else {
    setTimeout(function() {
      init();
    }, 100);
  }

  // Public API
  var SafeRouteApp = {
    init: init,
    getFirebase: getFirebase,
    getSOS: getSOS,
    getAuthUI: getAuthUI
  };

  if (typeof global.SafeRoute === 'undefined') {
    global.SafeRoute = {};
  }
  global.SafeRoute.App = SafeRouteApp;

})(typeof window !== 'undefined' ? window : this);