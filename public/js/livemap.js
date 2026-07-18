/**
 * SafeRoute Live Map Module
 * Isolated Leaflet + Geolocation implementation
 * Does NOT modify or interact with React application
 */
(function(global) {
  'use strict';

  // Private state
  var _map = null;
  var _marker = null;
  var _watchId = null;
  var _isInitialized = false;
  var _isVisible = false;
  var _eventListeners = [];
  var _backButtonHandler = null;

  // Configuration
  var _config = {
    tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    defaultCenter: [19.0760, 72.8777], // Mumbai
    defaultZoom: 13,
    mapContainerId: 'livemap-container',
    buttonId: 'livemap-toggle-btn',
    errorId: 'livemap-error',
    closeBtnId: 'livemap-close-btn'
  };

  /**
   * Initialize the map module
   */
  function init() {
    if (_isInitialized) {
      console.log('[SafeRoute LiveMap] Already initialized');
      return;
    }

    console.log('[SafeRoute LiveMap] Initializing...');
    _createMapContainer();
    _createToggleButton();
    _setupBackButtonHandler();
    _isInitialized = true;
    console.log('[SafeRoute LiveMap] Initialized successfully');
  }

  /**
   * Create map container overlay
   */
  function _createMapContainer() {
    var container = document.createElement('div');
    container.id = _config.mapContainerId;
    container.className = 'livemap-overlay';
    container.style.display = 'none';
    document.body.appendChild(container);
  }

  /**
   * Create floating toggle button
   */
  function _createToggleButton() {
    var button = document.createElement('button');
    button.id = _config.buttonId;
    button.className = 'livemap-toggle-btn';
    button.innerHTML = '📍';
    button.title = 'Live Map';
    button.setAttribute('aria-label', 'Toggle Live Map');

    var listener = function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (_isVisible) {
        hideMap();
      } else {
        showMap();
      }
    };

    button.addEventListener('click', listener);
    _eventListeners.push({ element: button, event: 'click', handler: listener });
    document.body.appendChild(button);
  }

  /**
   * Setup Android back button handler
   */
  function _setupBackButtonHandler() {
    // Listen for back button when map is visible
    _backButtonHandler = function(e) {
      if (_isVisible) {
        e.preventDefault();
        hideMap();
        return false;
      }
      return true;
    };

    // Handle back button on Android
    document.addEventListener('backbutton', _backButtonHandler);
    _eventListeners.push({
      element: document,
      event: 'backbutton',
      handler: _backButtonHandler
    });

    // Also handle browser back button
    window.addEventListener('popstate', _backButtonHandler);
    _eventListeners.push({
      element: window,
      event: 'popstate',
      handler: _backButtonHandler
    });
  }

  /**
   * Show error message to user
   */
  function _showError(message) {
    var container = document.getElementById(_config.mapContainerId);
    if (!container) return;

    var errorDiv = document.createElement('div');
    errorDiv.id = _config.errorId;
    errorDiv.className = 'livemap-error';
    errorDiv.innerHTML = message;
    container.appendChild(errorDiv);
  }

  /**
   * Hide error message
   */
  function _hideError() {
    var errorDiv = document.getElementById(_config.errorId);
    if (errorDiv) {
      errorDiv.remove();
    }
  }

  /**
   * Create close button
   */
  function _createCloseButton() {
    var container = document.getElementById(_config.mapContainerId);
    if (!container) return;

    var closeBtn = document.createElement('button');
    closeBtn.id = _config.closeBtnId;
    closeBtn.className = 'livemap-close-btn';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Close Map';
    closeBtn.setAttribute('aria-label', 'Close Map');

    var listener = function(e) {
      e.preventDefault();
      e.stopPropagation();
      hideMap();
    };

    closeBtn.addEventListener('click', listener);
    _eventListeners.push({ element: closeBtn, event: 'click', handler: listener });
    container.appendChild(closeBtn);
  }

  /**
   * Initialize Leaflet map
   */
  function _initLeaflet() {
    var container = document.getElementById(_config.mapContainerId);
    if (!container) {
      console.error('[SafeRoute LiveMap] Container not found');
      return false;
    }

    // Check if L is available from CDN
    if (typeof L === 'undefined') {
      console.error('[SafeRoute LiveMap] Leaflet not loaded');
      _showError('Map library failed to load. Please check your internet connection.');
      return false;
    }

    _map = L.map(_config.mapContainerId, {
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer(_config.tileLayer, {
      attribution: _config.attribution,
      maxZoom: 19
    }).addTo(_map);

    // Set default view
    _map.setView(_config.defaultCenter, _config.defaultZoom);

    // Create close button after map is initialized
    _createCloseButton();

    console.log('[SafeRoute LiveMap] Leaflet initialized');
    return true;
  }

  /**
   * Show the map
   */
  function showMap() {
    if (_isVisible) {
      console.log('[SafeRoute LiveMap] Map already visible');
      return;
    }

    console.log('[SafeRoute LiveMap] Showing map...');

    // Initialize Leaflet if needed
    if (!_map) {
      if (!_initLeaflet()) {
        console.error('[SafeRoute LiveMap] Failed to initialize Leaflet');
        return;
      }
    }

    // Clear any previous error
    _hideError();

    // Show container
    var container = document.getElementById(_config.mapContainerId);
    if (container) {
      container.style.display = 'block';
    }

    // Hide toggle button while map is open
    var button = document.getElementById(_config.buttonId);
    if (button) {
      button.style.display = 'none';
    }

    // Invalidate map size to fix rendering issues
    setTimeout(function() {
      if (_map) {
        _map.invalidateSize();
      }
    }, 100);

    // Start geolocation tracking
    _startGeolocation();

    _isVisible = true;
    console.log('[SafeRoute LiveMap] Map visible');
  }

  /**
   * Hide the map
   */
  function hideMap() {
    if (!_isVisible) {
      return;
    }

    console.log('[SafeRoute LiveMap] Hiding map...');

    // Hide container
    var container = document.getElementById(_config.mapContainerId);
    if (container) {
      container.style.display = 'none';
    }

    // Show toggle button
    var button = document.getElementById(_config.buttonId);
    if (button) {
      button.style.display = 'flex';
    }

    // Clear error message
    _hideError();

    // Stop geolocation but keep marker for next time
    _stopGeolocation();

    _isVisible = false;
    console.log('[SafeRoute LiveMap] Map hidden');
  }

  /**
   * Start geolocation tracking
   */
  function _startGeolocation() {
    if (!navigator.geolocation) {
      console.warn('[SafeRoute LiveMap] Geolocation not supported');
      _showError('Geolocation is not supported on this device.');
      return;
    }

    var options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    _watchId = navigator.geolocation.watchPosition(
      _onGeolocationSuccess,
      _onGeolocationError,
      options
    );

    console.log('[SafeRoute LiveMap] Geolocation started, watchId:', _watchId);
  }

  /**
   * Stop geolocation tracking
   */
  function _stopGeolocation() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      console.log('[SafeRoute LiveMap] Geolocation stopped');
      _watchId = null;
    }
  }

  /**
   * Geolocation success callback
   */
  function _onGeolocationSuccess(position) {
    var lat = position.coords.latitude;
    var lng = position.coords.longitude;
    var accuracy = position.coords.accuracy;

    console.log('[SafeRoute LiveMap] Location:', lat, lng, 'Accuracy:', accuracy);

    if (!_map) return;

    // Clear error if previously shown
    _hideError();

    var latLng = [lat, lng];

    // Remove existing marker before creating new one (prevents duplicates)
    if (_marker) {
      _map.removeLayer(_marker);
      _marker = null;
    }

    // Create new marker
    _marker = L.marker(latLng, {
      title: 'Your Location'
    }).addTo(_map);
    _marker.bindPopup('Your Location<br><small>Accuracy: ' + Math.round(accuracy) + 'm</small>').openPopup();

    // Pan to location
    _map.panTo(latLng);
  }

  /**
   * Geolocation error callback
   */
  function _onGeolocationError(error) {
    var errorMessages = {
      1: 'Location permission denied. Please enable location access in settings.',
      2: 'Unable to determine location. Please check your GPS settings.',
      3: 'Location request timed out. Please try again.'
    };
    var message = errorMessages[error.code] || 'An unknown error occurred.';
    console.warn('[SafeRoute LiveMap] Geolocation error:', message);
    _showError(message);
  }

  /**
   * Clean up all resources
   */
  function cleanup() {
    console.log('[SafeRoute LiveMap] Cleaning up...');

    // Stop geolocation
    _stopGeolocation();

    // Remove marker
    if (_marker && _map) {
      _map.removeLayer(_marker);
      _marker = null;
    }

    // Remove map
    if (_map) {
      _map.remove();
      _map = null;
    }

    // Remove event listeners
    _eventListeners.forEach(function(item) {
      try {
        item.element.removeEventListener(item.event, item.handler);
      } catch (e) {
        // Ignore removal errors
      }
    });
    _eventListeners = [];

    // Remove DOM elements
    var container = document.getElementById(_config.mapContainerId);
    if (container) {
      container.remove();
    }

    var button = document.getElementById(_config.buttonId);
    if (button) {
      button.remove();
    }

    _isInitialized = false;
    _isVisible = false;

    console.log('[SafeRoute LiveMap] Cleanup complete');
  }

  // Public API
  var LiveMap = {
    init: init,
    show: showMap,
    hide: hideMap,
    toggle: function() {
      if (_isVisible) {
        hideMap();
      } else {
        showMap();
      }
    },
    cleanup: cleanup,
    isVisible: function() {
      return _isVisible;
    },
    isInitialized: function() {
      return _isInitialized;
    }
  };

  // Export to global scope
  if (typeof global.SafeRoute === 'undefined') {
    global.SafeRoute = {};
  }
  global.SafeRoute.LiveMap = LiveMap;

})(typeof window !== 'undefined' ? window : this);