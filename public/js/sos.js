/**
 * SafeRoute SOS Module
 * Handles emergency SOS functionality - GPS location and SMS sending
 * Uses native Capacitor plugins for persistent storage, GPS, and SMS
 * Preserves existing UI, only replaces fake functionality with real implementation
 */
(function(global) {
  'use strict';

  // Private state
  var _isInitialized = false;
  var _isProcessing = false;
  var _eventListeners = [];

  // Configuration
  var _config = {
    sosButtonSelector: 'button, [role="button"]',
    sosButtonText: ['ACTIVATE EMERGENCY SOS', 'SOS', 'EMERGENCY', 'ALERT'],
    storageKey: 'saferoute_emergency_contacts',
    defaultContacts: [
      { name: 'Emergency 1', phone: '+917666916996' },
      { name: 'Emergency 2', phone: '+919834784184' }
    ],
    contactsContainerSelector: '[data-contacts-container]',
    contactCardClass: 'contact-card',
    editDialogId: 'contact-edit-dialog'
  };

  // Capacitor plugins
  var _preferencesPlugin = null;
  var _locationPlugin = null;
  var _smsPlugin = null;

  // Firebase integration
  var _firebaseService = null;
  var _useFirebase = false;

  /**
   * Initialize the SOS module
   */
  function init(firebaseConfig) {
    if (_isInitialized) {
      console.log('[SafeRoute SOS] Already initialized');
      return Promise.resolve();
    }

    console.log('[SafeRoute SOS] Initializing...');

    // Load Capacitor plugins
    _loadPlugins();

    // Setup button listener
    _setupButtonListener();

    // Initialize Firebase if config provided
    var firebasePromise = Promise.resolve();
    if (firebaseConfig) {
      firebasePromise = _initFirebase(firebaseConfig);
    } else {
      // No Firebase config - use local-only mode
      console.log('[SafeRoute SOS] Running in LOCAL-ONLY mode (no cloud sync)');
    }

    // Initialize default contacts if needed
    _initializeContacts();

    // Render contact cards if container exists
    _renderContactCards();

    _isInitialized = true;
    console.log('[SafeRoute SOS] Initialized successfully');

    return firebasePromise;
  }

  /**
   * Initialize Firebase service (only if config provided)
   */
  function _initFirebase(config) {
    return new Promise(function(resolve) {
      // Skip if no config
      if (!config) {
        console.log('[SafeRoute SOS] No Firebase config, skipping cloud sync');
        resolve();
        return;
      }

      // Check if Firebase is already loaded
      if (typeof global.SafeRoute !== 'undefined' && global.SafeRoute.Firebase) {
        _firebaseService = global.SafeRoute.Firebase;
        _firebaseService.init(config).then(function(user) {
          _useFirebase = !!user;
          console.log('[SafeRoute SOS] Firebase initialized, user:', !!user);
          resolve();
        }).catch(function(err) {
          console.warn('[SafeRoute SOS] Firebase init failed:', err);
          resolve();
        });
      } else {
        // Try to load Firebase module dynamically
        var script = document.createElement('script');
        script.src = 'js/firebase.js';  // Fixed path
        script.onload = function() {
          if (global.SafeRoute && global.SafeRoute.Firebase) {
            _firebaseService = global.SafeRoute.Firebase;
            _firebaseService.init(config).then(function(user) {
              _useFirebase = !!user;
              console.log('[SafeRoute SOS] Firebase initialized, user:', !!user);
              resolve();
            }).catch(function(err) {
              console.warn('[SafeRoute SOS] Firebase init failed:', err);
              resolve();
            });
          } else {
            resolve();
          }
        };
        script.onerror = function() {
          console.warn('[SafeRoute SOS] Failed to load firebase.js');
          resolve();
        };
        document.head.appendChild(script);
      }
    });
  }

  /**
   * Check if using Firebase
   */
  function isUsingFirebase() {
    return _useFirebase;
  }

  /**
   * Get Firebase service
   */
  function getFirebaseService() {
    return _firebaseService;
  }

  /**
   * Render contact cards in the UI
   * First tries to find existing contact cards to make clickable
   * If none found, creates new cards in an appropriate container
   */
  function _renderContactCards() {
    // First, try to find existing contact cards rendered by React
    var existingCards = _findExistingContactCards();

    if (existingCards && existingCards.length > 0) {
      console.log('[SafeRoute SOS] Found ' + existingCards.length + ' existing contact cards');
      _makeExistingCardsClickable(existingCards);
      return;
    }

    // If no existing cards, look for a container to create new cards
    var container = document.querySelector(_config.contactsContainerSelector);
    if (!container) {
      // Try to find container by common patterns
      container = document.querySelector('.contacts-grid') || document.querySelector('.emergency-contacts') || document.querySelector('[class*="contact"]');
    }

    if (!container) {
      console.log('[SafeRoute SOS] No contact container found, waiting for DOM...');
      // Retry after DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          setTimeout(_renderContactCards, 1000);
        });
      } else {
        setTimeout(_renderContactCards, 1000);
      }
      return;
    }

    _getContactsAsync().then(function(contacts) {
      _createContactCards(container, contacts);
      _setupContactClickHandlers();
    });
  }

  /**
   * Create floating button to add/edit contacts
   */
  function _createFloatingContactButton() {
    // Check if button already exists
    if (document.getElementById('saferoute-contact-fab')) {
      return;
    }

    var fab = document.createElement('button');
    fab.id = 'saferoute-contact-fab';
    fab.innerHTML = '👥 +';
    fab.title = 'Add Emergency Contacts';
    fab.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9998;width:56px;height:56px;border-radius:50%;' +
      'background:#ef4444;border:none;color:#fff;font-size:22px;font-weight:bold;cursor:pointer;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:transform 0.2s,box-shadow 0.2s;';

    fab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      _showContactsManagement();
    });

    fab.addEventListener('mouseenter', function() {
      fab.style.transform = 'scale(1.1)';
      fab.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    });

    fab.addEventListener('mouseleave', function() {
      fab.style.transform = 'scale(1)';
      fab.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });

    document.body.appendChild(fab);
    console.log('[SafeRoute SOS] Floating contact button created');
  }

  /**
   * Show contacts management dialog
   */
  function _showContactsManagement() {
    _getContactsAsync().then(function(contacts) {
      _createContactsManagementDialog(contacts);
    });
  }

  /**
   * Create contacts management dialog
   */
  function _createContactsManagementDialog(contacts) {
    var existingDialog = document.getElementById('contacts-management-dialog');
    if (existingDialog) {
      existingDialog.remove();
    }

    var overlay = document.createElement('div');
    overlay.id = 'contacts-management-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';

    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1a1f2e;border-radius:16px;padding:20px;width:90%;max-width:340px;max-height:80vh;overflow-y:auto;';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<h3 style="margin:0;font-size:20px;color:#fff;font-weight:600;">📱 Emergency Contacts</h3>' +
      '<button class="dialog-close" style="background:none;border:none;color:#9ca3af;font-size:28px;cursor:pointer;padding:0;line-height:1;">&times;</button></div>' +
      '<div style="color:#9ca3af;font-size:13px;margin-bottom:16px;">Tap a contact to edit phone number</div>';

    contacts.forEach(function(contact, index) {
      var phoneDisplay = contact.phone ? contact.phone : '<span style="color:#ef4444;">Tap to add</span>';
      html += '<div class="contact-edit-item" data-index="' + index + '" style="background:#0d1117;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;transition:background 0.2s;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<div style="width:40px;height:40px;background:#1a1f2e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">' + _getContactIcon(contact.name) + '</div>' +
        '<div style="flex:1;">' +
        '<div style="color:#fff;font-size:15px;font-weight:500;">' + contact.name + '</div>' +
        '<div style="color:#9ca3af;font-size:13px;">' + phoneDisplay + '</div>' +
        '</div>' +
        '<div style="color:#6b7280;">✏️</div></div></div>';
    });

    html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid #30363d;">' +
      '<div style="color:#6b7280;font-size:12px;text-align:center;">When you press SOS, these contacts will receive an SMS with your location.</div></div>';

    dialog.innerHTML = html;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Event listeners
    var closeBtn = dialog.querySelector('.dialog-close');
    closeBtn.addEventListener('click', function() {
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    // Contact click handlers
    var items = dialog.querySelectorAll('.contact-edit-item');
    items.forEach(function(item) {
      item.addEventListener('click', function() {
        var index = parseInt(item.getAttribute('data-index'), 10);
        overlay.remove();
        _openContactEditDialog(index);
      });
      item.addEventListener('mouseenter', function() {
        item.style.background = '#1a1f2e';
      });
      item.addEventListener('mouseleave', function() {
        item.style.background = '#0d1117';
      });
    });
  }

  /**
   * Find existing contact cards in the DOM (rendered by React)
   */
  function _findExistingContactCards() {
    var cards = [];
    var contactNames = ['Mother', 'Father', 'Brother', 'Sister', 'Friend', 'Wife', 'Husband', 'Emergency'];

    // Look for elements containing contact names
    var allElements = document.querySelectorAll('div, span, p, li');
    allElements.forEach(function(el) {
      var text = el.textContent || el.innerText || '';
      contactNames.forEach(function(name) {
        if (text.trim() === name || text.trim().startsWith(name + ' ')) {
          // This might be a contact card - check if it has a parent that looks like a card
          var parent = el.parentElement;
          if (parent && (parent.className && /card|contact/i.test(parent.className))) {
            cards.push(parent);
          } else if (el.className && /card|contact/i.test(el.className)) {
            cards.push(el);
          }
        }
      });
    });

    return cards;
  }

  /**
   * Make existing contact cards clickable
   */
  function _makeExistingCardsClickable(cards) {
    var contactNames = ['Mother', 'Father', 'Brother', 'Sister', 'Friend', 'Wife', 'Husband', 'Emergency'];

    cards.forEach(function(card) {
      // Get the contact name from the card
      var nameEl = card.querySelector('.contact-name, .name, [class*="name"]') || card;
      var name = nameEl.textContent || nameEl.innerText || '';

      // Find which contact this is
      var contactIndex = -1;
      _getContactsAsync().then(function(contacts) {
        contacts.forEach(function(contact, index) {
          if (name.trim() === contact.name) {
            contactIndex = index;
          }
        });

        if (contactIndex >= 0) {
          // Add click handler
          card.style.cursor = 'pointer';
          card.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            _openContactEditDialog(contactIndex);
          });
        }
      });
    });
  }

  /**
   * Create contact card elements
   */
  function _createContactCards(container, contacts) {
    // Clear existing cards but keep structure
    var existingCards = container.querySelectorAll('.' + _config.contactCardClass);
    existingCards.forEach(function(card) {
      card.remove();
    });

    // Apply grid layout to container if not already set
    if (!container.style.display || container.style.display === 'block') {
      container.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:16px;';
    }

    contacts.forEach(function(contact, index) {
      var card = _createContactCardElement(contact, index);
      container.appendChild(card);
    });
  }

  /**
   * Create a single contact card element
   */
  function _createContactCardElement(contact, index) {
    var card = document.createElement('div');
    card.className = _config.contactCardClass;
    card.setAttribute('data-contact-index', index);
    card.setAttribute('data-contact-name', contact.name);

    // Create card inner HTML matching existing design with inline styles
    var iconHtml = _getContactIcon(contact.name);
    var phoneDisplay = contact.phone ? contact.phone : '<span style="color:#6b7280;font-size:13px;">Tap to add</span>';

    card.style.cssText = 'background:#1a1f2e;border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:transform 0.15s ease,box-shadow 0.15s ease;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

    card.innerHTML =
      '<div style="width:40px;height:40px;background:#0d1117;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">' + iconHtml + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="color:#fff;font-size:15px;font-weight:500;margin-bottom:2px;">' + contact.name + '</div>' +
        '<div style="color:#9ca3af;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + phoneDisplay + '</div>' +
      '</div>';

    // Add hover effect
    card.addEventListener('mouseenter', function() {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    card.addEventListener('mouseleave', function() {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    });

    return card;
  }

  /**
   * Get icon for contact based on name
   */
  function _getContactIcon(name) {
    var icons = {
      'Mother': '👩',
      'Father': '👨',
      'Brother': '👦',
      'Sister': '👧',
      'Friend': '👤',
      'Wife': '👩‍❤️‍👨',
      'Husband': '👨‍❤️‍👨',
      'Emergency': '🚨'
    };
    return icons[name] || '👤';
  }

  /**
   * Setup click handlers for contact cards
   */
  function _setupContactClickHandlers() {
    var cards = document.querySelectorAll('.' + _config.contactCardClass);
    cards.forEach(function(card) {
      card.addEventListener('click', function(e) {
        var index = parseInt(card.getAttribute('data-contact-index'), 10);
        _openContactEditDialog(index);
      });
    });
  }

  /**
   * Open contact edit dialog
   */
  function _openContactEditDialog(contactIndex) {
    _getContactsAsync().then(function(contacts) {
      var contact = contacts[contactIndex];
      if (!contact) return;

      _createEditDialog(contact, contactIndex, contacts);
    });
  }

  /**
   * Create and show edit dialog
   */
  function _createEditDialog(contact, contactIndex, allContacts) {
    // Remove existing dialog if any
    var existingDialog = document.getElementById(_config.editDialogId);
    if (existingDialog) {
      existingDialog.remove();
    }

    // Create dialog overlay with inline styles to match existing design
    var overlay = document.createElement('div');
    overlay.id = _config.editDialogId;
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.2s ease;';

    // Create dialog content with styles matching existing app
    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1a1f2e;border-radius:12px;padding:20px;width:90%;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,0.3);';

    dialog.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;font-size:18px;color:#fff;font-weight:600;">Edit Contact</h3>' +
        '<button class="dialog-close" aria-label="Close" style="background:none;border:none;color:#9ca3af;font-size:24px;cursor:pointer;padding:0;line-height:1;">&times;</button>' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<div style="margin-bottom:12px;">' +
          '<label for="contact-name" style="display:block;margin-bottom:4px;color:#9ca3af;font-size:14px;">Name</label>' +
          '<input type="text" id="contact-name" class="input-field" value="' + _escapeHtml(contact.name) + '" placeholder="Contact Name" style="width:100%;padding:10px 12px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="margin-bottom:8px;">' +
          '<label for="contact-phone" style="display:block;margin-bottom:4px;color:#9ca3af;font-size:14px;">Phone Number</label>' +
          '<input type="tel" id="contact-phone" class="input-field" value="' + _escapeHtml(contact.phone || '') + '" placeholder="+1234567890" style="width:100%;padding:10px 12px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="color:#6b7280;font-size:12px;">Enter phone number with country code (e.g., +1234567890)</div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;">' +
        '<button class="btn-cancel" style="flex:1;padding:12px;background:#30363d;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Cancel</button>' +
        '<button class="btn-save" style="flex:1;padding:12px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Save Contact</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Add event listeners
    var closeBtn = dialog.querySelector('.dialog-close');
    var cancelBtn = dialog.querySelector('.btn-cancel');
    var saveBtn = dialog.querySelector('.btn-save');
    var nameInput = dialog.querySelector('#contact-name');
    var phoneInput = dialog.querySelector('#contact-phone');

    var closeDialog = function() {
      overlay.classList.add('dialog-closing');
      setTimeout(function() {
        overlay.remove();
      }, 200);
    };

    closeBtn.addEventListener('click', closeDialog);
    cancelBtn.addEventListener('click', closeDialog);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeDialog();
    });

    saveBtn.addEventListener('click', function() {
      var newName = nameInput.value.trim();
      var newPhone = phoneInput.value.trim();

      // Validate phone number
      if (newPhone && !_validatePhoneNumber(newPhone)) {
        phoneInput.classList.add('input-error');
        phoneInput.setCustomValidity('Please enter a valid phone number');
        phoneInput.reportValidity();
        return;
      }

      // Update contact
      allContacts[contactIndex] = {
        name: newName || contact.name,
        phone: newPhone
      };

      // Save to storage
      saveContacts(allContacts).then(function() {
        console.log('[SafeRoute SOS] Contact saved:', allContacts[contactIndex]);
        closeDialog();
        // Re-render cards
        _renderContactCards();
      });
    });

    // Show dialog with animation
    requestAnimationFrame(function() {
      overlay.classList.add('dialog-visible');
    });

    // Focus phone input for better UX
    phoneInput.focus();
  }

  /**
   * Validate phone number format
   */
  function _validatePhoneNumber(phone) {
    if (!phone || phone.length === 0) return true; // Empty is allowed
    // Basic validation: starts with + and has at least 8 digits
    var phoneRegex = /^\+?[0-9]{8,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-()]/g, ''));
  }

  /**
   * Escape HTML to prevent XSS
   */
  function _escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Load all Capacitor plugins
   */
  function _loadPlugins() {
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
      _preferencesPlugin = window.Capacitor.Plugins.Preferences;
      _locationPlugin = window.Capacitor.Plugins.LocationPlugin;
      _smsPlugin = window.Capacitor.Plugins.SMSPlugin;

      console.log('[SafeRoute SOS] Plugins loaded:');
      console.log('  - Preferences:', !!_preferencesPlugin);
      console.log('  - LocationPlugin:', !!_locationPlugin);
      console.log('  - SMSPlugin:', !!_smsPlugin);
    } else {
      console.log('[SafeRoute SOS] Running in browser mode');
    }
  }

  /**
   * Initialize contacts in storage if none exist
   */
  function _initializeContacts() {
    if (_preferencesPlugin) {
      _preferencesPlugin.get({ key: _config.storageKey }).then(function(result) {
        if (!result.value) {
          // No contacts stored, initialize with defaults
          _saveContactsToStorage(_config.defaultContacts);
        }
      }).catch(function() {
        _saveContactsToStorage(_config.defaultContacts);
      });
    } else {
      // Fallback to localStorage in browser
      try {
        var stored = localStorage.getItem(_config.storageKey);
        if (!stored) {
          localStorage.setItem(_config.storageKey, JSON.stringify(_config.defaultContacts));
        }
      } catch (e) {
        console.error('[SafeRoute SOS] Failed to initialize contacts:', e);
      }
    }
  }

  /**
   * Get emergency contacts from storage
   */
  function getContacts() {
    if (_preferencesPlugin) {
      // Will be retrieved asynchronously - use callback pattern
      return _getContactsAsync();
    }

    // Browser fallback
    try {
      var stored = localStorage.getItem(_config.storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('[SafeRoute SOS] Failed to get contacts:', e);
    }
    return _config.defaultContacts;
  }

  /**
   * Get contacts asynchronously using Capacitor Preferences or Firebase
   */
  function _getContactsAsync() {
    return new Promise(function(resolve) {
      // Try Firebase first if available
      if (_useFirebase && _firebaseService) {
        _firebaseService.getContacts().then(function(contacts) {
          resolve(contacts);
        }).catch(function() {
          // Fallback to local
          _getContactsFromLocal().then(resolve);
        });
      } else {
        _getContactsFromLocal().then(resolve);
      }
    });
  }

  /**
   * Get contacts from local storage
   */
  function _getContactsFromLocal() {
    return new Promise(function(resolve) {
      if (_preferencesPlugin) {
        _preferencesPlugin.get({ key: _config.storageKey }).then(function(result) {
          if (result.value) {
            try {
              resolve(JSON.parse(result.value));
            } catch (e) {
              resolve(_config.defaultContacts);
            }
          } else {
            resolve(_config.defaultContacts);
          }
        }).catch(function() {
          resolve(_config.defaultContacts);
        });
      } else {
        try {
          var stored = localStorage.getItem(_config.storageKey);
          resolve(stored ? JSON.parse(stored) : _config.defaultContacts);
        } catch (e) {
          resolve(_config.defaultContacts);
        }
      }
    });
  }

  /**
   * Save emergency contacts to storage
   */
  function saveContacts(contacts) {
    // Try Firebase first if available and user is logged in
    if (_useFirebase && _firebaseService && _firebaseService.isLoggedIn()) {
      return _firebaseService.saveContacts(contacts).then(function() {
        console.log('[SafeRoute SOS] Contacts saved to Firebase');
        return true;
      }).catch(function(e) {
        console.error('[SafeRoute SOS] Firebase save failed:', e);
        // Fallback to local
        return _saveContactsLocal(contacts);
      });
    }

    // Local storage fallback
    return _saveContactsLocal(contacts);
  }

  /**
   * Save contacts to local storage
   */
  function _saveContactsLocal(contacts) {
    var contactsJson = JSON.stringify(contacts);

    if (_preferencesPlugin) {
      return _preferencesPlugin.set({
        key: _config.storageKey,
        value: contactsJson
      }).then(function() {
        console.log('[SafeRoute SOS] Contacts saved via Preferences');
        return true;
      }).catch(function(e) {
        console.error('[SafeRoute SOS] Failed to save contacts:', e);
        return false;
      });
    }

    // Browser fallback
    try {
      localStorage.setItem(_config.storageKey, contactsJson);
      console.log('[SafeRoute SOS] Contacts saved to localStorage');
      return Promise.resolve(true);
    } catch (e) {
      console.error('[SafeRoute SOS] Failed to save contacts:', e);
      return Promise.resolve(false);
    }
  }

  /**
   * Save contacts synchronously to storage
   */
  function _saveContactsToStorage(contacts) {
    var contactsJson = JSON.stringify(contacts);

    if (_preferencesPlugin) {
      _preferencesPlugin.set({
        key: _config.storageKey,
        value: contactsJson
      }).then(function() {
        console.log('[SafeRoute SOS] Default contacts initialized');
      }).catch(function(e) {
        console.error('[SafeRoute SOS] Failed to initialize contacts:', e);
      });
    }
  }

  /**
   * Setup button click listener
   */
  function _setupButtonListener() {
    var buttonHandler = function(e) {
      var button = e.target.closest('button');
      if (!button) return;

      var buttonText = button.textContent || button.innerText || '';
      var isSOSButton = _config.sosButtonText.some(function(text) {
        return buttonText.toUpperCase().indexOf(text) !== -1;
      });

      var classList = button.className || '';
      var isSOSClass = /sos|emergency|panic|alert|danger/i.test(classList);

      if (isSOSButton || isSOSClass) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[SafeRoute SOS] SOS button detected');
        handleSOSButtonClick(button);
      }
    };

    document.addEventListener('click', buttonHandler);
    _eventListeners.push({
      element: document,
      event: 'click',
      handler: buttonHandler
    });
  }

  /**
   * Handle SOS button click
   */
  function handleSOSButtonClick(button) {
    if (_isProcessing) {
      console.log('[SafeRoute SOS] Already processing');
      return;
    }

    _isProcessing = true;
    console.log('[SafeRoute SOS] Starting SOS sequence...');

    // Step 1: Check permissions first
    _checkPermissions()
      .then(function(permissions) {
        if (!permissions.sms) {
          throw new Error('SMS permission is required to send emergency alerts. Please grant SMS permission.');
        }
        if (!permissions.location) {
          throw new Error('Location permission is required to include your location in the emergency message.');
        }
        return _getLocation();
      })
      .then(function(location) {
        console.log('[SafeRoute SOS] Location obtained:', location);

        // Share location via Firebase if available
        if (_useFirebase && _firebaseService && location && location.available) {
          _firebaseService.startLocationSharing(location).then(function() {
            console.log('[SafeRoute SOS] Location shared via Firebase');
          }).catch(function(err) {
            console.warn('[SafeRoute SOS] Firebase location share failed:', err);
          });
        }

        return location;
      })
      .catch(function(err) {
        console.error('[SafeRoute SOS] Permission or location error:', err);
        // Continue with location available: false
        return { lat: 0, lng: 0, available: false, error: err.message };
      })
      .then(function(location) {
        // Step 2: Get contacts
        return _getContactsAsync().then(function(contacts) {
          return { contacts: contacts, location: location };
        });
      })
      .then(function(data) {
        var contacts = data.contacts;
        var location = data.location;
        console.log('[SafeRoute SOS] Contacts:', contacts);

        // Check if any contacts have phone numbers
        var contactsWithPhone = contacts.filter(function(c) {
          return c.phone && c.phone.trim().length > 0;
        });

        if (contactsWithPhone.length === 0) {
          throw new Error('Please add at least one emergency contact.');
        }

        // Step 3: Send SMS to each contact
        return _sendSMSToContacts(contacts, location);
      })
      .then(function(results) {
        console.log('[SafeRoute SOS] All SMS sent:', results);
        _isProcessing = false;

        // Check if at least one SMS was sent successfully
        var successCount = results.filter(function(r) { return r.success; }).length;
        if (successCount > 0) {
          _triggerSuccess(results);
        } else {
          _showError('Failed to send SOS alerts to all contacts. Please try again.');
        }
      })
      .catch(function(err) {
        console.error('[SafeRoute SOS] SOS sequence failed:', err);
        _isProcessing = false;
        _showError(err.message || 'Failed to send SOS alerts');
      });
  }

  /**
   * Check required permissions
   */
  function _checkPermissions() {
    return new Promise(function(resolve) {
      var permissions = {
        sms: false,
        location: false
      };

      var checks = [];

      // Check SMS permission
      if (_smsPlugin) {
        checks.push(_smsPlugin.checkPermission().then(function(result) {
          permissions.sms = result.hasPermission || false;
        }).catch(function() {
          permissions.sms = false;
        }));
      }

      // Check location permission
      if (_locationPlugin) {
        checks.push(_locationPlugin.checkPermission().then(function(result) {
          permissions.location = result.hasPermission || false;
        }).catch(function() {
          permissions.location = false;
        }));
      }

      Promise.all(checks).then(function() {
        resolve(permissions);
      });
    });
  }

  /**
   * Request SMS permission
   */
  function requestSMSPermission() {
    return new Promise(function(resolve) {
      if (_smsPlugin) {
        _smsPlugin.requestPermission().then(function() {
          // Check again after requesting
          _smsPlugin.checkPermission().then(function(result) {
            resolve(result.hasPermission || false);
          }).catch(function() {
            resolve(false);
          });
        }).catch(function() {
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Request location permission
   */
  function requestLocationPermission() {
    return new Promise(function(resolve) {
      if (_locationPlugin) {
        // For location, we need to trigger the permission dialog
        // The permission will be requested when we call getLocation
        _locationPlugin.checkPermission().then(function(result) {
          resolve(result.hasPermission || false);
        }).catch(function() {
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Get current GPS location using native plugin
   */
  function _getLocation() {
    return new Promise(function(resolve, reject) {
      if (!_locationPlugin) {
        // Fallback to browser geolocation
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          function(position) {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              available: true
            });
          },
          function(error) {
            var errorMessages = {
              1: 'Location permission denied. Please enable location access.',
              2: 'Unable to determine location. Please check your GPS settings.',
              3: 'Location request timed out. Please try again.'
            };
            reject(new Error(errorMessages[error.code] || 'Unknown location error'));
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          }
        );
        return;
      }

      // Use native LocationPlugin
      _locationPlugin.getLocation().then(function(result) {
        if (result.error) {
          // Handle specific errors
          switch (result.error) {
            case 'permission_denied':
              reject(new Error('Location permission denied. Please enable location access in settings.'));
              break;
            case 'gps_disabled':
              reject(new Error('GPS is disabled. Please enable GPS in settings.'));
              break;
            case 'location_disabled':
              reject(new Error('Location services are disabled. Please enable GPS or network location.'));
              break;
            case 'timeout':
              reject(new Error('Location request timed out. Please try again.'));
              break;
            default:
              reject(new Error(result.message || 'Failed to get location'));
          }
        } else {
          resolve({
            lat: result.lat,
            lng: result.lng,
            accuracy: result.accuracy,
            available: result.available
          });
        }
      }).catch(function(err) {
        reject(new Error('Failed to get location: ' + (err.message || 'Unknown error')));
      });
    });
  }

  /**
   * Send SMS to all contacts sequentially
   */
  function _sendSMSToContacts(contacts, location) {
    var validContacts = contacts.filter(function(c) {
      return c.phone && c.phone.length > 0;
    });

    if (validContacts.length === 0) {
      return Promise.reject(new Error('No emergency contacts configured. Please add phone numbers.'));
    }

    // Create message
    var message = _createEmergencyMessage(location);

    console.log('[SafeRoute SOS] Sending to ' + validContacts.length + ' contacts');
    console.log('[SafeRoute SOS] Message:', message);

    // Send using native plugin if available
    if (_smsPlugin) {
      var phoneNumbers = validContacts.map(function(c) { return c.phone; });
      // Convert to JSON string for native plugin
      return _smsPlugin.sendSMSMultiple({
        phoneNumbers: JSON.stringify(phoneNumbers),
        message: message
      }).then(function(result) {
        // Map results to our format
        var results = [];
        if (result.results && Array.isArray(result.results)) {
          result.results.forEach(function(r, index) {
            results.push({
              contact: validContacts[index].name,
              phone: validContacts[index].phone,
              success: r.success || false,
              error: r.error
            });
          });
        }
        return results;
      }).catch(function(err) {
        // If the batch method fails, try sending individually
        console.log('[SafeRoute SOS] Batch send failed, trying individually');
        return _sendSMSSequential(validContacts, message, 0, []);
      });
    }

    // Fallback: send individually
    return _sendSMSSequential(validContacts, message, 0, []);
  }

  /**
   * Create emergency message text
   */
  function _createEmergencyMessage(location) {
    var timestamp = new Date().toLocaleString();
    var locationLink = '';
    var rawCoords = '';

    if (location && location.available) {
      locationLink = 'https://maps.google.com/?q=' + location.lat + ',' + location.lng;
      rawCoords = 'Lat: ' + location.lat + ', Lng: ' + location.lng;
    }

    var message = '🚨 SafeRoute Emergency Alert\n\n';
    message += 'I need immediate assistance.\n\n';

    if (rawCoords) {
      message += 'My coordinates:\n' + rawCoords + '\n\n';
    }

    if (locationLink) {
      message += 'My live location:\n' + locationLink + '\n\n';
    }

    if (!rawCoords && !locationLink) {
      message += 'Location unavailable at this time.\n\n';
    }

    message += 'Time: ' + timestamp + '\n\n';
    message += 'Please help me immediately.';

    return message;
  }

  /**
   * Send SMS sequentially to contacts using native plugin
   */
  function _sendSMSSequential(contacts, message, index, results) {
    if (index >= contacts.length) {
      return Promise.resolve(results);
    }

    var contact = contacts[index];

    return _sendSingleSMS(contact.phone, message)
      .then(function(result) {
        results.push({
          contact: contact.name,
          phone: contact.phone,
          success: result.success || false,
          error: result.error
        });
        console.log('[SafeRoute SMS] Sent to ' + contact.name + ':', result.success);

        // Update progress UI if available
        _updateProgress(contact.name, index + 1, contacts.length);

        // Small delay between messages
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve(_sendSMSSequential(contacts, message, index + 1, results));
          }, 500);
        });
      })
      .catch(function(err) {
        results.push({
          contact: contact.name,
          phone: contact.phone,
          success: false,
          error: err.message
        });
        console.error('[SafeRoute SMS] Failed to send to ' + contact.name + ':', err);

        // Continue with next contact
        return _sendSMSSequential(contacts, message, index + 1, results);
      });
  }

  /**
   * Send single SMS using native plugin
   */
  function _sendSingleSMS(phoneNumber, message) {
    return new Promise(function(resolve, reject) {
      if (_smsPlugin) {
        _smsPlugin.sendSMS({
          phoneNumber: phoneNumber,
          message: message
        }).then(function(result) {
          if (result.error) {
            reject(new Error(result.message || 'SMS failed'));
          } else {
            resolve(result);
          }
        }).catch(function(err) {
          reject(err);
        });
      } else {
        // Browser fallback - use SMS URL scheme
        var smsUrl = 'sms:' + phoneNumber + '?body=' + encodeURIComponent(message);
        var link = document.createElement('a');
        link.href = smsUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Consider it success in browser mode
        resolve({ success: true, browser: true });
      }
    });
  }

  /**
   * Update progress display
   */
  function _updateProgress(contactName, current, total) {
    var progressElement = document.querySelector('[data-sos-progress]');
    if (progressElement) {
      progressElement.textContent = 'Sending to ' + contactName + '... (' + current + '/' + total + ')';
    }

    var event = new CustomEvent('sos:progress', {
      detail: {
        contactName: contactName,
        current: current,
        total: total
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * Show error message
   */
  function _showError(message) {
    var errorElement = document.querySelector('[data-sos-error]');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }

    var event = new CustomEvent('sos:error', {
      detail: { message: message }
    });
    document.dispatchEvent(event);
  }

  /**
   * Trigger success state
   */
  function _triggerSuccess(results) {
    var event = new CustomEvent('sos:success', {
      detail: {
        timestamp: new Date().toISOString(),
        results: results
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * Check SMS permission
   */
  function checkSMSPermission() {
    return new Promise(function(resolve) {
      if (_smsPlugin) {
        _smsPlugin.checkPermission().then(function(result) {
          resolve(result.hasPermission || false);
        }).catch(function() {
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Check location permission
   */
  function checkLocationPermission() {
    return new Promise(function(resolve) {
      if (_locationPlugin) {
        _locationPlugin.checkPermission().then(function(result) {
          resolve(result.hasPermission || false);
        }).catch(function() {
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Check if GPS is enabled
   */
  function isGPSEnabled() {
    return new Promise(function(resolve) {
      if (_locationPlugin) {
        _locationPlugin.isGPSEnabled().then(function(result) {
          resolve(result.anyEnabled || false);
        }).catch(function() {
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Open location settings
   */
  function openLocationSettings() {
    return new Promise(function(resolve) {
      if (_locationPlugin) {
        _locationPlugin.openSettings().then(function() {
          resolve(true);
        }).catch(function() {
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Clean up all resources
   */
  function cleanup() {
    console.log('[SafeRoute SOS] Cleaning up...');

    _eventListeners.forEach(function(item) {
      try {
        item.element.removeEventListener(item.event, item.handler);
      } catch (e) {
        // Ignore removal errors
      }
    });
    _eventListeners = [];

    _isInitialized = false;
    _isProcessing = false;

    console.log('[SafeRoute SOS] Cleanup complete');
  }

  // Public API
  var SOS = {
    init: init,
    cleanup: cleanup,
    handleSOS: handleSOSButtonClick,
    getContacts: getContacts,
    getContactsAsync: _getContactsAsync,
    saveContacts: saveContacts,
    checkPermission: checkSMSPermission,
    checkLocationPermission: checkLocationPermission,
    requestSMSPermission: requestSMSPermission,
    requestLocationPermission: requestLocationPermission,
    isGPSEnabled: isGPSEnabled,
    openLocationSettings: openLocationSettings,
    isProcessing: function() {
      return _isProcessing;
    },
    // Firebase integration
    isUsingFirebase: isUsingFirebase,
    getFirebaseService: getFirebaseService
  };

  // Export to global scope
  if (typeof global.SafeRoute === 'undefined') {
    global.SafeRoute = {};
  }
  global.SafeRoute.SOS = SOS;

})(typeof window !== 'undefined' ? window : this);