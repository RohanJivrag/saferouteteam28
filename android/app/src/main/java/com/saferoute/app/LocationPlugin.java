package com.saferoute.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.ArrayList;
import java.util.List;

/**
 * SafeRoute Location Plugin
 * Handles getting GPS location for emergency SOS alerts
 */
@CapacitorPlugin(name = "LocationPlugin")
public class LocationPlugin extends Plugin {

    private static final String TAG = "LocationPlugin";
    private static final int LOCATION_TIMEOUT_MS = 15000;

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private PluginCall pendingCall;
    private boolean isRequesting = false;
    private Handler timeoutHandler;

    @Override
    public void load() {
        super.load();
        timeoutHandler = new Handler(Looper.getMainLooper());
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        removeLocationCallback();
        if (timeoutHandler != null) {
            timeoutHandler.removeCallbacksAndMessages(null);
        }
    }

    /**
     * Get the current GPS location
     */
    @PluginMethod
    public void getLocation(PluginCall call) {
        Context context = getContext();

        // Check location permission
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("error", "permission_denied");
            result.put("message", "Location permission not granted. Please grant location permission in settings.");
            call.resolve(result);
            return;
        }

        // Check if GPS is enabled
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        boolean isGPSEnabled = locationManager != null && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
        boolean isNetworkEnabled = locationManager != null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);

        if (!isGPSEnabled && !isNetworkEnabled) {
            JSObject result = new JSObject();
            result.put("error", "location_disabled");
            result.put("message", "Location services are disabled. Please enable GPS or network location.");
            call.resolve(result);
            return;
        }

        // If there's a pending request, reject it
        if (isRequesting && pendingCall != null) {
            pendingCall.reject("Location request already in progress");
            return;
        }

        pendingCall = call;
        isRequesting = true;

        try {
            fusedLocationClient = LocationServices.getFusedLocationProviderClient(getActivity());

            // Create location request
            LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
                    .setWaitForAccurateLocation(false)
                    .setMinUpdateIntervalMillis(500)
                    .setMaxUpdates(1)
                    .build();

            // Create location callback
            locationCallback = new LocationCallback() {
                @Override
                public void onLocationResult(@NonNull LocationResult locationResult) {
                    removeTimeoutRunnable();

                    if (pendingCall == null) return;

                    Location location = locationResult.getLastLocation();
                    if (location != null) {
                        JSObject result = new JSObject();
                        result.put("success", true);
                        result.put("lat", location.getLatitude());
                        result.put("lng", location.getLongitude());
                        result.put("accuracy", location.getAccuracy());
                        result.put("available", true);

                        Log.d(TAG, "Location obtained: " + location.getLatitude() + ", " + location.getLongitude());
                        pendingCall.resolve(result);
                    } else {
                        JSObject result = new JSObject();
                        result.put("error", "location_unavailable");
                        result.put("message", "Unable to get location. Please try again.");
                        pendingCall.resolve(result);
                    }

                    cleanup();
                }
            };

            // Request location
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());

                // Schedule timeout
                timeoutHandler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (pendingCall != null && isRequesting) {
                            JSObject result = new JSObject();
                            result.put("error", "timeout");
                            result.put("message", "Location request timed out. Please try again.");
                            pendingCall.resolve(result);
                            cleanup();
                        }
                    }
                }, LOCATION_TIMEOUT_MS);
            }

        } catch (SecurityException e) {
            Log.e(TAG, "Security exception getting location", e);
            JSObject result = new JSObject();
            result.put("error", "permission_denied");
            result.put("message", "Location permission denied.");
            call.resolve(result);
            cleanup();
        } catch (Exception e) {
            Log.e(TAG, "Error getting location", e);
            JSObject result = new JSObject();
            result.put("error", "location_error");
            result.put("message", "Error getting location: " + e.getMessage());
            call.resolve(result);
            cleanup();
        }
    }

    private void removeTimeoutRunnable() {
        if (timeoutHandler != null) {
            timeoutHandler.removeCallbacksAndMessages(null);
        }
    }

    /**
     * Check if location permission is granted
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        Context context = getContext();
        boolean hasFineLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarseLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        JSObject result = new JSObject();
        result.put("hasPermission", hasFineLocation);
        result.put("hasFineLocation", hasFineLocation);
        result.put("hasCoarseLocation", hasCoarseLocation);
        call.resolve(result);
    }

    /**
     * Check if GPS is enabled
     */
    @PluginMethod
    public void isGPSEnabled(PluginCall call) {
        Context context = getContext();
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        boolean isGPSEnabled = locationManager != null && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
        boolean isNetworkEnabled = locationManager != null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);

        JSObject result = new JSObject();
        result.put("gpsEnabled", isGPSEnabled);
        result.put("networkEnabled", isNetworkEnabled);
        result.put("anyEnabled", isGPSEnabled || isNetworkEnabled);
        call.resolve(result);
    }

    /**
     * Open location settings
     */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    private void cleanup() {
        removeLocationCallback();
        isRequesting = false;
        pendingCall = null;
    }

    private void removeLocationCallback() {
        removeTimeoutRunnable();
        if (fusedLocationClient != null && locationCallback != null) {
            try {
                fusedLocationClient.removeLocationUpdates(locationCallback);
            } catch (Exception e) {
                Log.e(TAG, "Error removing location updates", e);
            }
        }
        locationCallback = null;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        removeLocationCallback();
    }
}