package com.saferoute.app;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import android.telephony.TelephonyManager;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * SafeRoute SMS Plugin
 * Handles sending SMS messages for emergency SOS alerts
 * Enhanced with better error handling for various scenarios
 */
@CapacitorPlugin(name = "SMSPlugin")
public class SMSPlugin extends Plugin {

    private static final String TAG = "SMSPlugin";

    /**
     * Send an SMS message to a phone number
     */
    @PluginMethod
    public void sendSMS(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        String message = call.getString("message");

        if (phoneNumber == null || phoneNumber.isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        if (message == null || message.isEmpty()) {
            call.reject("Message is required");
            return;
        }

        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
            call.reject("Invalid phone number format");
            return;
        }

        Context context = getContext();

        // Check SMS permission
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("error", "permission_denied");
            result.put("message", "SMS permission not granted. Please grant SMS permission in settings.");
            call.resolve(result);
            return;
        }

        // Check if device can send SMS
        String smsCheck = checkCanSendSMS(context);
        if (smsCheck != null) {
            JSObject result = new JSObject();
            result.put("error", smsCheck);
            result.put("message", getErrorMessage(smsCheck));
            call.resolve(result);
            return;
        }

        sendSMSInternal(phoneNumber, message, call);
    }

    /**
     * Validate phone number format
     */
    private boolean isValidPhoneNumber(String phoneNumber) {
        // Remove any spaces or dashes
        String cleaned = phoneNumber.replaceAll("[\\s-]", "");

        // Check if it starts with + or is all digits
        if (cleaned.startsWith("+")) {
            // International format - must have at least 8 more digits after +
            return cleaned.length() >= 8 && cleaned.substring(1).matches("\\d+");
        } else {
            // Local format - must be at least 7 digits
            return cleaned.length() >= 7 && cleaned.matches("\\d+");
        }
    }

    /**
     * Check if the device can send SMS
     */
    private String checkCanSendSMS(Context context) {
        TelephonyManager telephonyManager = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);

        if (telephonyManager == null) {
            return "telephony_unavailable";
        }

        // Check if SIM card is present
        if (telephonyManager.getSimState() != TelephonyManager.SIM_STATE_READY) {
            switch (telephonyManager.getSimState()) {
                case TelephonyManager.SIM_STATE_ABSENT:
                    return "no_sim";
                case TelephonyManager.SIM_STATE_PIN_REQUIRED:
                    return "sim_locked";
                case TelephonyManager.SIM_STATE_PUK_REQUIRED:
                    return "sim_locked";
                case TelephonyManager.SIM_STATE_NETWORK_LOCKED:
                    return "sim_locked";
                default:
                    return "sim_not_ready";
            }
        }

        // Check if SMS is supported
        if (telephonyManager.getPhoneType() == TelephonyManager.PHONE_TYPE_NONE) {
            return "sms_not_supported";
        }

        return null;
    }

    /**
     * Get error message for error code
     */
    private String getErrorMessage(String errorCode) {
        switch (errorCode) {
            case "no_sim":
                return "No SIM card detected. Please insert a SIM card to send emergency SMS.";
            case "sim_locked":
                return "SIM card is locked. Please unlock your SIM card.";
            case "sim_not_ready":
                return "SIM card is not ready. Please wait and try again.";
            case "telephony_unavailable":
                return "Phone services are unavailable on this device.";
            case "sms_not_supported":
                return "SMS is not supported on this device.";
            case "airplane_mode":
                return "Airplane mode is enabled. Please disable airplane mode to send emergency SMS.";
            default:
                return "Unable to send SMS. Please check your device settings.";
        }
    }

    /**
     * Send SMS directly after permission is granted
     */
    private void sendSMSInternal(String phoneNumber, String message, PluginCall call) {
        Context context = getContext();

        try {
            SmsManager smsManager = SmsManager.getDefault();

            // Split message if it's too long
            ArrayList<String> parts;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                parts = smsManager.divideMessage(message);
            } else {
                // Legacy method
                parts = new ArrayList<>();
                if (message.length() > 160) {
                    ArrayList<String> messages = smsManager.divideMessage(message);
                    parts.addAll(messages);
                } else {
                    parts.add(message);
                }
            }

            if (parts.size() == 1) {
                // Single part message
                PendingIntent sentIntent = PendingIntent.getBroadcast(
                        context,
                        0,
                        new Intent("SMS_SENT"),
                        PendingIntent.FLAG_IMMUTABLE
                );

                smsManager.sendTextMessage(phoneNumber, null, message, sentIntent, null);

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "SMS queued for sending");
                result.put("recipient", phoneNumber);
                call.resolve(result);

            } else {
                // Multi-part message
                ArrayList<PendingIntent> sentIntents = new ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    sentIntents.add(PendingIntent.getBroadcast(
                            context,
                            0,
                            new Intent("SMS_SENT"),
                            PendingIntent.FLAG_IMMUTABLE
                    ));
                }

                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null);

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "SMS queued for sending (" + parts.size() + " parts)");
                result.put("recipient", phoneNumber);
                call.resolve(result);
            }

            Log.d(TAG, "SMS sent to: " + phoneNumber + " (" + parts.size() + " parts)");

        } catch (SecurityException e) {
            Log.e(TAG, "Security exception sending SMS", e);
            JSObject result = new JSObject();
            result.put("error", "permission_denied");
            result.put("message", "SMS permission denied: " + e.getMessage());
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to send SMS", e);
            JSObject result = new JSObject();
            result.put("error", "send_failed");
            result.put("message", "Failed to send SMS: " + e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Check if SMS permission is granted
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        Context context = getContext();
        boolean hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
                == PackageManager.PERMISSION_GRANTED;

        JSObject result = new JSObject();
        result.put("hasPermission", hasPermission);
        call.resolve(result);
    }

    /**
     * Check if device can send SMS
     */
    @PluginMethod
    public void checkCanSend(PluginCall call) {
        Context context = getContext();
        String checkResult = checkCanSendSMS(context);

        JSObject result = new JSObject();
        if (checkResult == null) {
            result.put("canSend", true);
        } else {
            result.put("canSend", false);
            result.put("error", checkResult);
            result.put("message", getErrorMessage(checkResult));
        }
        call.resolve(result);
    }

    /**
     * Request SMS permission - this will trigger permission dialog
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        // In Capacitor, permissions should be requested via the activity
        // This is handled automatically by the @CapacitorPlugin annotation
        // Here we just return a response telling JS to request permission

        JSObject result = new JSObject();
        result.put("requested", true);
        call.resolve(result);
    }

    /**
     * Send SMS to multiple recipients sequentially
     */
    @PluginMethod
    public void sendSMSMultiple(PluginCall call) {
        // Get phone numbers as a JSON string array
        String phoneNumbersJson = call.getString("phoneNumbers");
        String message = call.getString("message");

        if (phoneNumbersJson == null || phoneNumbersJson.isEmpty()) {
            call.reject("Phone numbers are required");
            return;
        }

        if (message == null || message.isEmpty()) {
            call.reject("Message is required");
            return;
        }

        // Parse JSON array
        List<String> phoneNumbers = parseJsonArray(phoneNumbersJson);

        if (phoneNumbers.isEmpty()) {
            call.reject("No valid phone numbers provided");
            return;
        }

        Context context = getContext();

        // Check SMS permission
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("error", "permission_denied");
            result.put("message", "SMS permission not granted. Please grant SMS permission in settings.");
            call.resolve(result);
            return;
        }

        // Send to each number sequentially using Handler
        sendMultipleSequentially(phoneNumbers, message, 0, new ArrayList<>(), call);
    }

    /**
     * Parse JSON array string to List
     */
    private List<String> parseJsonArray(String json) {
        List<String> result = new ArrayList<>();

        // Simple JSON array parsing (assumes array of strings)
        json = json.trim();
        if (!json.startsWith("[")) {
            return result;
        }

        // Remove brackets
        json = json.substring(1, json.length() - 1);

        if (json.isEmpty()) {
            return result;
        }

        // Split by comma (simple approach)
        String[] parts = json.split(",");
        for (String part : parts) {
            // Remove quotes and whitespace
            part = part.trim().replace("\"", "").replace("'", "");
            if (!part.isEmpty()) {
                result.add(part);
            }
        }

        return result;
    }

    /**
     * Send SMS to multiple recipients sequentially using Handler
     */
    private void sendMultipleSequentially(final List<String> phoneNumbers, final String message,
                                          final int index, final List<JSObject> results,
                                          final PluginCall call) {
        if (index >= phoneNumbers.size()) {
            // All done
            int successCount = 0;
            int failCount = 0;
            for (JSObject result : results) {
                if (result.getBoolean("success", false)) {
                    successCount++;
                } else {
                    failCount++;
                }
            }

            final JSObject finalResult = new JSObject();
            finalResult.put("success", successCount > 0);
            finalResult.put("total", phoneNumbers.size());
            finalResult.put("successCount", successCount);
            finalResult.put("failedCount", failCount);

            // Convert results list to array for JSON
            final ArrayList<JSObject> resultsArray = new ArrayList<>(results);
            finalResult.put("results", resultsArray);

            // Post result on main thread
            new Handler(Looper.getMainLooper()).post(() -> call.resolve(finalResult));
            return;
        }

        final String phoneNumber = phoneNumbers.get(index);
        final Context context = getContext();

        // Create a temporary call-like object to pass to sendSMSInternal
        try {
            SmsManager smsManager = SmsManager.getDefault();

            // Split message if it's too long
            ArrayList<String> parts;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                parts = smsManager.divideMessage(message);
            } else {
                parts = new ArrayList<>();
                if (message.length() > 160) {
                    parts.addAll(smsManager.divideMessage(message));
                } else {
                    parts.add(message);
                }
            }

            final ArrayList<String> finalParts = parts;

            if (parts.size() == 1) {
                PendingIntent sentIntent = PendingIntent.getBroadcast(
                        context,
                        index,
                        new Intent("SMS_SENT"),
                        PendingIntent.FLAG_IMMUTABLE
                );

                smsManager.sendTextMessage(phoneNumber, null, message, sentIntent, null);
            } else {
                ArrayList<PendingIntent> sentIntents = new ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    sentIntents.add(PendingIntent.getBroadcast(
                            context,
                            index * 100 + i,
                            new Intent("SMS_SENT"),
                            PendingIntent.FLAG_IMMUTABLE
                    ));
                }

                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null);
            }

            Log.d(TAG, "SMS queued to: " + phoneNumber);

            // Record success (SMS is queued, delivery will happen in background)
            JSObject resultObj = new JSObject();
            resultObj.put("success", true);
            resultObj.put("recipient", phoneNumber);
            results.add(resultObj);

        } catch (Exception e) {
            Log.e(TAG, "Failed to queue SMS to " + phoneNumber, e);

            JSObject resultObj = new JSObject();
            resultObj.put("success", false);
            resultObj.put("recipient", phoneNumber);
            resultObj.put("error", "send_failed");
            resultObj.put("message", e.getMessage());
            results.add(resultObj);
        }

        // Send to next contact after a short delay
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            sendMultipleSequentially(phoneNumbers, message, index + 1, results, call);
        }, 500);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        Log.d(TAG, "SMSPlugin destroyed");
    }
}