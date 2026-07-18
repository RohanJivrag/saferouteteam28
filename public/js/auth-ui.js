/**
 * SafeRoute Auth UI Module
 * Provides login/signup UI overlay
 */
(function(global) {
  'use strict';

  // Private state
  var _isInitialized = false;
  var _firebaseService = null;
  var _eventListeners = [];
  var _dialogId = 'saferoute-auth-dialog';
  var _currentView = 'login'; // 'login', 'signup', 'reset'

  /**
   * Initialize the Auth UI
   */
  function init(firebaseService) {
    if (_isInitialized) {
      console.log('[SafeRoute Auth UI] Already initialized');
      return;
    }

    console.log('[SafeRoute Auth UI] Initializing...');

    _firebaseService = firebaseService;

    // Listen for auth state changes
    document.addEventListener('firebase:auth-change', _onAuthChange);
    _eventListeners.push({
      element: document,
      event: 'firebase:auth-change',
      handler: _onAuthChange
    });

    _isInitialized = true;
    console.log('[SafeRoute Auth UI] Initialized successfully');
  }

  /**
   * Handle auth state changes
   */
  function _onAuthChange(e) {
    var user = e.detail.user;
    if (user) {
      // User logged in - update UI
      _updateUIForLoggedIn(user);
    } else {
      // User logged out
      _updateUIForLoggedOut();
    }
  }

  /**
   * Update UI for logged in user
   */
  function _updateUIForLoggedIn(user) {
    // Hide any auth dialogs
    var existingDialog = document.getElementById(_dialogId);
    if (existingDialog) {
      existingDialog.remove();
    }

    // Emit event for other modules
    var event = new CustomEvent('saferoute:login', {
      detail: { user: user }
    });
    document.dispatchEvent(event);

    console.log('[SafeRoute Auth UI] User logged in:', user.email);
  }

  /**
   * Update UI for logged out user
   */
  function _updateUIForLoggedOut() {
    var event = new CustomEvent('saferoute:logout', {
      detail: {}
    });
    document.dispatchEvent(event);

    console.log('[SafeRoute Auth UI] User logged out');
  }

  /**
   * Show the login/signup dialog
   */
  function showDialog(initialView) {
    _currentView = initialView || 'login';

    // Remove existing dialog
    var existingDialog = document.getElementById(_dialogId);
    if (existingDialog) {
      existingDialog.remove();
    }

    _createDialog();
  }

  /**
   * Hide the dialog
   */
  function hideDialog() {
    var dialog = document.getElementById(_dialogId);
    if (dialog) {
      dialog.classList.add('dialog-hiding');
      setTimeout(function() {
        dialog.remove();
      }, 200);
    }
  }

  /**
   * Create the auth dialog
   */
  function _createDialog() {
    var overlay = document.createElement('div');
    overlay.id = _dialogId;
    overlay.className = 'saferoute-auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;opacity:0;transition:opacity 0.2s ease;';

    var dialog = document.createElement('div');
    dialog.className = 'saferoute-auth-dialog';
    dialog.style.cssText = 'background:#1a1f2e;border-radius:16px;padding:24px;width:90%;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Show with animation
    requestAnimationFrame(function() {
      overlay.style.opacity = '1';
    });

    // Close on overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        hideDialog();
      }
    });

    _renderDialogContent(dialog);
  }

  /**
   * Render dialog content based on current view
   */
  function _renderDialogContent(dialog) {
    var content = '';

    if (_currentView === 'login') {
      content = _getLoginContent();
    } else if (_currentView === 'signup') {
      content = _getSignupContent();
    } else if (_currentView === 'reset') {
      content = _getResetContent();
    }

    dialog.innerHTML = content;
    _attachDialogListeners(dialog);
  }

  /**
   * Get login form content
   */
  function _getLoginContent() {
    return `
      <div class="auth-header">
        <h2 style="margin:0 0 8px 0;color:#fff;font-size:24px;font-weight:700;text-align:center;">Welcome Back</h2>
        <p style="margin:0;color:#9ca3af;font-size:14px;text-align:center;">Sign in to sync your contacts</p>
      </div>
      <div class="auth-form" style="margin-top:24px;">
        <div style="margin-bottom:16px;">
          <label for="auth-email" style="display:block;margin-bottom:6px;color:#9ca3af;font-size:13px;">Email</label>
          <input type="email" id="auth-email" placeholder="your@email.com" style="width:100%;padding:12px 14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:8px;">
          <label for="auth-password" style="display:block;margin-bottom:6px;color:#9ca3af;font-size:13px;">Password</label>
          <input type="password" id="auth-password" placeholder="••••••••" style="width:100%;padding:12px 14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
        </div>
        <button class="auth-forgot" style="background:none;border:none;color:#6b7280;font-size:13px;cursor:pointer;padding:0;margin-bottom:20px;text-decoration:underline;">Forgot password?</button>
        <button class="auth-submit" style="width:100%;padding:14px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;transition:background 0.2s;">Sign In</button>
      </div>
      <div class="auth-footer" style="margin-top:20px;text-align:center;">
        <span style="color:#6b7280;font-size:14px;">Don't have an account? </span>
        <button class="auth-switch-signup" style="background:none;border:none;color:#ef4444;font-size:14px;cursor:pointer;padding:0;font-weight:500;">Sign Up</button>
      </div>
      <div class="auth-close" style="position:absolute;top:12px;right:12px;">
        <button style="background:none;border:none;color:#6b7280;font-size:24px;cursor:pointer;padding:4px;line-height:1;">&times;</button>
      </div>
    `;
  }

  /**
   * Get signup form content
   */
  function _getSignupContent() {
    return `
      <div class="auth-header">
        <h2 style="margin:0 0 8px 0;color:#fff;font-size:24px;font-weight:700;text-align:center;">Create Account</h2>
        <p style="margin:0;color:#9ca3af;font-size:14px;text-align:center;">Sign up to sync contacts across devices</p>
      </div>
      <div class="auth-form" style="margin-top:24px;">
        <div style="margin-bottom:16px;">
          <label for="auth-email" style="display:block;margin-bottom:6px;color:#9ca3af;font-size:13px;">Email</label>
          <input type="email" id="auth-email" placeholder="your@email.com" style="width:100%;padding:12px 14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:16px;">
          <label for="auth-password" style="display:block;margin-bottom:6px;color:#9ca3af;font-size:13px;">Password</label>
          <input type="password" id="auth-password" placeholder="••••••••" style="width:100%;padding:12px 14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:16px;">
          <label for="auth-confirm" style="display:block;margin-bottom:6px;color:#9ca3af;font-size:13px;">Confirm Password</label>
          <input type="password" id="auth-confirm" placeholder="••••••••" style="width:100%;padding:12px 14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
        </div>
        <button class="auth-submit" style="width:100%;padding:14px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">Create Account</button>
      </div>
      <div class="auth-footer" style="margin-top:20px;text-align:center;">
        <span style="color:#6b7280;font-size:14px;">Already have an account? </span>
        <button class="auth-switch-login" style="background:none;border:none;color:#ef4444;font-size:14px;cursor:pointer;padding:0;font-weight:500;">Sign In</button>
      </div>
      <div class="auth-close" style="position:absolute;top:12px;right:12px;">
        <button style="background:none;border:none;color:#6b7280;font-size:24px;cursor:pointer;padding:4px;line-height:1;">&times;</button>
      </div>
    `;
  }

  /**
   * Get password reset content
   */
  function _getResetContent() {
    return `
      <div class="auth-header">
        <h2 style="margin:0 0 8px 0;color:#fff;font-size:24px;font-weight:700;text-align:center;">Reset Password</h2>
        <p style="margin:0;color:#9ca3af;font-size:14px;text-align:center;">Enter your email to reset password</p>
      </div>
      <div class="auth-form" style="margin-top:24px;">
        <div style="margin-bottom:16px;">
          <label for="auth-email" style="display:block;margin-bottom:6px;color:#9ca3af;font-size:13px;">Email</label>
          <input type="email" id="auth-email" placeholder="your@email.com" style="width:100%;padding:12px 14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
        </div>
        <button class="auth-submit" style="width:100%;padding:14px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">Send Reset Link</button>
      </div>
      <div class="auth-footer" style="margin-top:20px;text-align:center;">
        <button class="auth-switch-login" style="background:none;border:none;color:#ef4444;font-size:14px;cursor:pointer;padding:0;font-weight:500;">Back to Sign In</button>
      </div>
      <div class="auth-close" style="position:absolute;top:12px;right:12px;">
        <button style="background:none;border:none;color:#6b7280;font-size:24px;cursor:pointer;padding:4px;line-height:1;">&times;</button>
      </div>
    `;
  }

  /**
   * Attach event listeners to dialog
   */
  function _attachDialogListeners(dialog) {
    var self = this;

    // Close button
    var closeBtn = dialog.querySelector('.auth-close button');
    if (closeBtn) {
      closeBtn.addEventListener('click', hideDialog);
    }

    // Submit button
    var submitBtn = dialog.querySelector('.auth-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', function() {
        _handleSubmit();
      });
    }

    // Switch to signup
    var switchSignup = dialog.querySelector('.auth-switch-signup');
    if (switchSignup) {
      switchSignup.addEventListener('click', function() {
        _currentView = 'signup';
        _renderDialogContent(dialog);
      });
    }

    // Switch to login
    var switchLogin = dialog.querySelector('.auth-switch-login');
    if (switchLogin) {
      switchLogin.addEventListener('click', function() {
        _currentView = 'login';
        _renderDialogContent(dialog);
      });
    }

    // Forgot password
    var forgotBtn = dialog.querySelector('.auth-forgot');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', function() {
        _currentView = 'reset';
        _renderDialogContent(dialog);
      });
    }

    // Enter key support
    var inputs = dialog.querySelectorAll('input');
    inputs.forEach(function(input) {
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          _handleSubmit();
        }
      });
    });
  }

  /**
   * Handle form submission
   */
  function _handleSubmit() {
    var dialog = document.getElementById(_dialogId);
    if (!dialog) return;

    var emailInput = dialog.querySelector('#auth-email');
    var passwordInput = dialog.querySelector('#auth-password');
    var confirmInput = dialog.querySelector('#auth-confirm');
    var submitBtn = dialog.querySelector('.auth-submit');

    var email = emailInput ? emailInput.value.trim() : '';
    var password = passwordInput ? passwordInput.value : '';
    var confirm = confirmInput ? confirmInput.value : '';

    // Validate
    if (!email) {
      _showError('Please enter your email');
      return;
    }
    if (!password && _currentView !== 'reset') {
      _showError('Please enter your password');
      return;
    }
    if (_currentView === 'signup' && password !== confirm) {
      _showError('Passwords do not match');
      return;
    }
    if (_currentView === 'signup' && password.length < 6) {
      _showError('Password must be at least 6 characters');
      return;
    }

    // Disable button during processing
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait...';
    }

    var promise;

    if (_currentView === 'login') {
      promise = _firebaseService.signIn(email, password);
    } else if (_currentView === 'signup') {
      promise = _firebaseService.signUp(email, password);
    } else if (_currentView === 'reset') {
      promise = _firebaseService.resetPassword(email);
    }

    if (promise) {
      promise.then(function() {
        hideDialog();
        _showSuccess(_currentView === 'reset' ? 'Password reset email sent!' :
                    _currentView === 'signup' ? 'Account created!' : 'Signed in!');
      }).catch(function(err) {
        _showError(err.message || 'An error occurred');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = _currentView === 'login' ? 'Sign In' :
                                 _currentView === 'signup' ? 'Create Account' : 'Send Reset Link';
        }
      });
    }
  }

  /**
   * Show error message
   */
  function _showError(message) {
    var dialog = document.getElementById(_dialogId);
    if (!dialog) return;

    // Remove existing error
    var existingError = dialog.querySelector('.auth-error');
    if (existingError) {
      existingError.remove();
    }

    // Add error message
    var errorDiv = document.createElement('div');
    errorDiv.className = 'auth-error';
    errorDiv.style.cssText = 'background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;padding:12px;margin-bottom:16px;color:#ef4444;font-size:13px;';
    errorDiv.textContent = message;

    var form = dialog.querySelector('.auth-form');
    if (form) {
      form.insertBefore(errorDiv, form.firstChild);
    }
  }

  /**
   * Show success message
   */
  function _showSuccess(message) {
    // Dispatch event for toast notification
    var event = new CustomEvent('saferoute:notification', {
      detail: { type: 'success', message: message }
    });
    document.dispatchEvent(event);
  }

  /**
   * Create floating login button
   */
  function createFloatingButton() {
    var button = document.createElement('button');
    button.id = 'saferoute-auth-btn';
    button.className = 'saferoute-auth-floating-btn';
    button.innerHTML = '👤';
    button.title = 'Login / Sign Up';
    button.setAttribute('aria-label', 'Login');

    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showDialog();
    });

    document.body.appendChild(button);
  }

  /**
   * Check if user is logged in
   */
  function isLoggedIn() {
    return _firebaseService && _firebaseService.isLoggedIn();
  }

  /**
   * Get current user
   */
  function getCurrentUser() {
    return _firebaseService ? _firebaseService.getCurrentUser() : null;
  }

  /**
   * Sign out
   */
  function signOut() {
    if (_firebaseService) {
      return _firebaseService.signOut();
    }
    return Promise.reject(new Error('Firebase not initialized'));
  }

  /**
   * Clean up
   */
  function cleanup() {
    _eventListeners.forEach(function(item) {
      try {
        item.element.removeEventListener(item.event, item.handler);
      } catch (e) {}
    });
    _eventListeners = [];
    hideDialog();
    _isInitialized = false;
  }

  // Public API
  var AuthUI = {
    init: init,
    cleanup: cleanup,
    showDialog: showDialog,
    hideDialog: hideDialog,
    createFloatingButton: createFloatingButton,
    isLoggedIn: isLoggedIn,
    getCurrentUser: getCurrentUser,
    signOut: signOut
  };

  // Export
  if (typeof global.SafeRoute === 'undefined') {
    global.SafeRoute = {};
  }
  global.SafeRoute.AuthUI = AuthUI;

})(typeof window !== 'undefined' ? window : this);