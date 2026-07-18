/**
 * SafeRoute Firebase Service
 * Handles Authentication, Cloud Firestore for contacts, and Realtime Database for location sharing
 */
(function(global) {
  'use strict';

  // Firebase configuration - REPLACE WITH YOUR OWN CONFIG
  var _config = {
    apiKey: "YOUR_API_KEY",
    authDomain: "saferoute-app.firebaseapp.com",
    projectId: "saferoute-app",
    storageBucket: "saferoute-app.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
    databaseURL: "https://saferoute-app.firebaseio.com"
  };

  // Firebase instances
  var _auth = null;
  var _db = null;
  var _rtdb = null;
  var _isInitialized = false;
  var _currentUser = null;
  var _locationShareRef = null;
  var _eventListeners = [];

  // Default contacts
  var _defaultContacts = [
    { name: 'Emergency 1', phone: '+917666916996', relation: 'emergency' },
    { name: 'Emergency 2', phone: '+919834784184', relation: 'emergency' }
  ];

  /**
   * Initialize Firebase
   */
  function init(config) {
    if (_isInitialized) {
      console.log('[SafeRoute Firebase] Already initialized');
      return Promise.resolve(_currentUser);
    }

    console.log('[SafeRoute Firebase] Initializing...');

    // Merge custom config if provided
    if (config) {
      Object.keys(config).forEach(function(key) {
        _config[key] = config[key];
      });
    }

    // Load Firebase from CDN
    return _loadFirebaseSDK()
      .then(function() {
        return _initializeFirebase();
      })
      .then(function() {
        _isInitialized = true;
        console.log('[SafeRoute Firebase] Initialized successfully');

        // Check for existing auth state
        return _checkAuthState();
      })
      .catch(function(err) {
        console.error('[SafeRoute Firebase] Initialization failed:', err);
        throw err;
      });
  }

  /**
   * Load Firebase SDK from CDN
   */
  function _loadFirebaseSDK() {
    return new Promise(function(resolve, reject) {
      if (typeof firebase !== 'undefined') {
        resolve();
        return;
      }

      // Load Firebase SDK
      var script = document.createElement('script');
      script.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
      script.onload = function() {
        // Load auth and firestore
        var authScript = document.createElement('script');
        authScript.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
        authScript.onload = function() {
          var dbScript = document.createElement('script');
          dbScript.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
          dbScript.onload = function() {
            var rtdbScript = document.createElement('script');
            rtdbScript.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
            rtdbScript.onload = resolve;
            rtdbScript.onerror = reject;
            document.head.appendChild(rtdbScript);
          };
          authScript.onerror = reject;
          document.head.appendChild(authScript);
        };
        authScript.onerror = reject;
        document.head.appendChild(authScript);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize Firebase app
   */
  function _initializeFirebase() {
    return new Promise(function(resolve, reject) {
      try {
        // Initialize Firebase
        firebase.initializeApp(_config);

        // Get instances
        _auth = firebase.auth();
        _db = firebase.firestore();
        _rtdb = firebase.database();

        // Set persistence
        _db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
          console.log('[SafeRoute Firebase] Persistence error:', err.code);
        });

        // Listen for auth state changes
        _auth.onAuthStateChanged(function(user) {
          _currentUser = user;
          _emitAuthChange(user);
        });

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Check current auth state
   */
  function _checkAuthState() {
    return new Promise(function(resolve) {
      if (_auth) {
        _currentUser = _auth.currentUser;
      }
      resolve(_currentUser);
    });
  }

  /**
   * Emit auth state change event
   */
  function _emitAuthChange(user) {
    var event = new CustomEvent('firebase:auth-change', {
      detail: { user: user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName
      } : null }
    });
    document.dispatchEvent(event);
  }

  // ==================== AUTHENTICATION ====================

  /**
   * Sign up with email and password
   */
  function signUp(email, password) {
    return new Promise(function(resolve, reject) {
      if (!_auth) {
        reject(new Error('Firebase not initialized'));
        return;
      }

      _auth.createUserWithEmailAndPassword(email, password)
        .then(function(result) {
          console.log('[SafeRoute Firebase] Sign up successful');
          resolve({
            user: result.user,
            email: email
          });
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Sign up failed:', err);
          reject(err);
        });
    });
  }

  /**
   * Sign in with email and password
   */
  function signIn(email, password) {
    return new Promise(function(resolve, reject) {
      if (!_auth) {
        reject(new Error('Firebase not initialized'));
        return;
      }

      _auth.signInWithEmailAndPassword(email, password)
        .then(function(result) {
          console.log('[SafeRoute Firebase] Sign in successful');
          resolve({
            user: result.user,
            email: email
          });
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Sign in failed:', err);
          reject(err);
        });
    });
  }

  /**
   * Sign in with phone number
   */
  function signInWithPhone(phoneNumber) {
    return new Promise(function(resolve, reject) {
      if (!_auth) {
        reject(new Error('Firebase not initialized'));
        return;
      }

      // Phone auth requires app verification
      // For simplicity, we'll use a different approach
      reject(new Error('Phone auth requires additional setup. Use email sign-in instead.'));
    });
  }

  /**
   * Sign out
   */
  function signOut() {
    return new Promise(function(resolve, reject) {
      if (!_auth) {
        reject(new Error('Firebase not initialized'));
        return;
      }

      // Stop location sharing
      stopLocationSharing();

      _auth.signOut()
        .then(function() {
          console.log('[SafeRoute Firebase] Signed out');
          resolve();
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Sign out failed:', err);
          reject(err);
        });
    });
  }

  /**
   * Get current user
   */
  function getCurrentUser() {
    return _currentUser;
  }

  /**
   * Check if user is logged in
   */
  function isLoggedIn() {
    return _currentUser !== null;
  }

  /**
   * Send password reset email
   */
  function resetPassword(email) {
    return new Promise(function(resolve, reject) {
      if (!_auth) {
        reject(new Error('Firebase not initialized'));
        return;
      }

      _auth.sendPasswordResetEmail(email)
        .then(function() {
          console.log('[SafeRoute Firebase] Password reset sent');
          resolve();
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Password reset failed:', err);
          reject(err);
        });
    });
  }

  // ==================== CONTACTS (FIRESTORE) ====================

  /**
   * Get contacts from Firestore
   */
  function getContacts() {
    return new Promise(function(resolve, reject) {
      if (!_currentUser) {
        // Return local storage fallback
        resolve(_getLocalContacts());
        return;
      }

      _db.collection('users').doc(_currentUser.uid).collection('contacts').get()
        .then(function(snapshot) {
          if (snapshot.empty) {
            // Initialize with default contacts
            _initializeDefaultContacts().then(resolve);
            return;
          }

          var contacts = [];
          snapshot.forEach(function(doc) {
            contacts.push(doc.data());
          });
          resolve(contacts);
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Get contacts failed:', err);
          // Fallback to local
          resolve(_getLocalContacts());
        });
    });
  }

  /**
   * Initialize default contacts
   */
  function _initializeDefaultContacts() {
    return new Promise(function(resolve) {
      var batch = _db.batch();

      _defaultContacts.forEach(function(contact, index) {
        var ref = _db.collection('users').doc(_currentUser.uid)
          .collection('contacts').doc('contact_' + index);
        batch.set(ref, contact);
      });

      batch.commit()
        .then(function() {
          console.log('[SafeRoute Firebase] Default contacts initialized');
          resolve(_defaultContacts);
        })
        .catch(function() {
          resolve(_defaultContacts);
        });
    });
  }

  /**
   * Save contacts to Firestore
   */
  function saveContacts(contacts) {
    return new Promise(function(resolve, reject) {
      if (!_currentUser) {
        // Save to local storage
        _saveLocalContacts(contacts);
        resolve(true);
        return;
      }

      // Batch write all contacts
      var batch = _db.batch();

      // First delete all existing
      _db.collection('users').doc(_currentUser.uid).collection('contacts').get()
        .then(function(snapshot) {
          snapshot.forEach(function(doc) {
            batch.delete(doc.ref);
          });

          // Then add new contacts
          contacts.forEach(function(contact, index) {
            var ref = _db.collection('users').doc(_currentUser.uid)
              .collection('contacts').doc('contact_' + index);
            batch.set(ref, contact);
          });

          return batch.commit();
        })
        .then(function() {
          console.log('[SafeRoute Firebase] Contacts saved');
          // Also save to local as backup
          _saveLocalContacts(contacts);
          resolve(true);
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Save contacts failed:', err);
          // Save locally anyway
          _saveLocalContacts(contacts);
          resolve(true);
        });
    });
  }

  /**
   * Add a single contact
   */
  function addContact(contact) {
    return getContacts().then(function(contacts) {
      contacts.push(contact);
      return saveContacts(contacts);
    });
  }

  /**
   * Update a contact
   */
  function updateContact(index, updatedContact) {
    return getContacts().then(function(contacts) {
      if (index >= 0 && index < contacts.length) {
        contacts[index] = updatedContact;
        return saveContacts(contacts);
      }
      return false;
    });
  }

  /**
   * Delete a contact
   */
  function deleteContact(index) {
    return getContacts().then(function(contacts) {
      if (index >= 0 && index < contacts.length) {
        contacts.splice(index, 1);
        return saveContacts(contacts);
      }
      return false;
    });
  }

  // ==================== LOCATION SHARING (REALTIME DATABASE) ====================

  /**
   * Start sharing location with trusted contacts
   */
  function startLocationSharing(location) {
    return new Promise(function(resolve, reject) {
      if (!_currentUser) {
        reject(new Error('Must be logged in to share location'));
        return;
      }

      if (!_rtdb) {
        reject(new Error('Firebase not initialized'));
        return;
      }

      var userLocationsRef = _rtdb.ref('locations/' + _currentUser.uid);

      var locationData = {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy || 0,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        userId: _currentUser.uid,
        displayName: _currentUser.displayName || _currentUser.email
      };

      userLocationsRef.set(locationData)
        .then(function() {
          console.log('[SafeRoute Firebase] Location sharing started');
          _locationShareRef = userLocationsRef;
          resolve(true);
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Start location sharing failed:', err);
          reject(err);
        });
    });
  }

  /**
   * Update location
   */
  function updateLocation(location) {
    return new Promise(function(resolve, reject) {
      if (!_locationShareRef) {
        // Start sharing if not already
        return startLocationSharing(location).then(resolve).catch(reject);
      }

      var locationData = {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy || 0,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };

      _locationShareRef.update(locationData)
        .then(function() {
          resolve(true);
        })
        .catch(function(err) {
          console.error('[SafeRoute Firebase] Update location failed:', err);
          reject(err);
        });
    });
  }

  /**
   * Stop sharing location
   */
  function stopLocationSharing() {
    return new Promise(function(resolve) {
      if (_locationShareRef) {
        _locationShareRef.remove()
          .then(function() {
            console.log('[SafeRoute Firebase] Location sharing stopped');
            _locationShareRef = null;
            resolve(true);
          })
          .catch(function() {
            _locationShareRef = null;
            resolve(true);
          });
      } else {
        resolve(true);
      }
    });
  }

  /**
   * Get shared location of a user
   */
  function getSharedLocation(userId) {
    return new Promise(function(resolve, reject) {
      if (!_rtdb) {
        reject(new Error('Firebase not initialized'));
        return;
      }

      _rtdb.ref('locations/' + userId).once('value')
        .then(function(snapshot) {
          var data = snapshot.val();
          if (data) {
            resolve({
              lat: data.lat,
              lng: data.lng,
              accuracy: data.accuracy,
              timestamp: data.timestamp,
              displayName: data.displayName
            });
          } else {
            resolve(null);
          }
        })
        .catch(reject);
    });
  }

  /**
   * Subscribe to location updates
   */
  function subscribeToLocation(userId, callback) {
    if (!_rtdb) {
      console.error('[SafeRoute Firebase] Firebase not initialized');
      return function() {};
    }

    var ref = _rtdb.ref('locations/' + userId);

    var listener = ref.on('value', function(snapshot) {
      var data = snapshot.val();
      if (data) {
        callback({
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          timestamp: data.timestamp,
          displayName: data.displayName
        });
      }
    });

    // Return unsubscribe function
    return function() {
      ref.off('value', listener);
    };
  }

  /**
   * Get all active shared locations
   */
  function getAllSharedLocations(callback) {
    if (!_rtdb) {
      console.error('[SafeRoute Firebase] Firebase not initialized');
      return function() {};
    }

    var ref = _rtdb.ref('locations');

    var listener = ref.on('value', function(snapshot) {
      var locations = {};
      snapshot.forEach(function(child) {
        locations[child.key] = child.val();
      });
      callback(locations);
    });

    return function() {
      ref.off('value', listener);
    };
  }

  // ==================== LOCAL STORAGE FALLBACK ====================

  /**
   * Get contacts from local storage
   */
  function _getLocalContacts() {
    try {
      var stored = localStorage.getItem('saferoute_contacts');
      return stored ? JSON.parse(stored) : _defaultContacts;
    } catch (e) {
      return _defaultContacts;
    }
  }

  /**
   * Save contacts to local storage
   */
  function _saveLocalContacts(contacts) {
    try {
      localStorage.setItem('saferoute_contacts', JSON.stringify(contacts));
    } catch (e) {
      console.error('[SafeRoute Firebase] Local save failed:', e);
    }
  }

  // ==================== CLEANUP ====================

  /**
   * Clean up all resources
   */
  function cleanup() {
    stopLocationSharing();
    _eventListeners.forEach(function(item) {
      try {
        item.element.removeEventListener(item.event, item.handler);
      } catch (e) {}
    });
    _eventListeners = [];
    _isInitialized = false;
  }

  // ==================== PUBLIC API ====================

  var FirebaseService = {
    // Initialization
    init: init,
    cleanup: cleanup,
    isInitialized: function() { return _isInitialized; },

    // Auth
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getCurrentUser: getCurrentUser,
    isLoggedIn: isLoggedIn,
    resetPassword: resetPassword,

    // Contacts
    getContacts: getContacts,
    saveContacts: saveContacts,
    addContact: addContact,
    updateContact: updateContact,
    deleteContact: deleteContact,

    // Location Sharing
    startLocationSharing: startLocationSharing,
    updateLocation: updateLocation,
    stopLocationSharing: stopLocationSharing,
    getSharedLocation: getSharedLocation,
    subscribeToLocation: subscribeToLocation,
    getAllSharedLocations: getAllSharedLocations
  };

  // Export to global scope
  if (typeof global.SafeRoute === 'undefined') {
    global.SafeRoute = {};
  }
  global.SafeRoute.Firebase = FirebaseService;

})(typeof window !== 'undefined' ? window : this);