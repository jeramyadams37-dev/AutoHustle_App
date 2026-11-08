package com.atothei.autohustle.obd2;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Capacitor plugin "Obd2" for AutoHustle v10.
 *
 * Talks to an ELM327 adapter over classic Bluetooth Serial Port Profile
 * (SPP) — UUID 00001101-0000-1000-8000-00805F9B34FB. This is NOT BLE and
 * NOT Web Bluetooth: Web Bluetooth is BLE-only and cannot talk to a
 * classic SPP ELM327 clone, so a native plugin is required for live data.
 *
 * JS contract (src/lib/obd2.js — do not change the JS side):
 *   connect()     -> { connected: true, deviceName, deviceAddress }
 *   readCodes()   -> { codes: string[] }            (OBD mode 03)
 *   readLiveData()-> { rpm, coolantTempC, batteryVoltage,
 *                      speedKmh, engineLoadPct, supportedPids }
 *                      (PIDs 0100, 0105, 010C, plus 0104, 010D, 0142)
 *
 * Capacitor auto-discovers this plugin from the @CapacitorPlugin
 * annotation — no manual registration in MainActivity is needed.
 * Bluetooth permissions are declared in AndroidManifest.xml; on
 * Android 12+ (API 31+) BLUETOOTH_CONNECT / BLUETOOTH_SCAN are
 * requested at runtime before any Bluetooth call.
 */
@CapacitorPlugin(
        name = "Obd2",
        permissions = {
                @Permission(
                        strings = {
                                Manifest.permission.BLUETOOTH_CONNECT,
                                Manifest.permission.BLUETOOTH_SCAN
                        },
                        alias = "bluetooth"
                )
        }
)
public class Obd2Plugin extends Plugin {

    /** Classic Bluetooth SPP UUID — the one every ELM327 clone listens on. */
    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    /** Substrings that identify an ELM327-style adapter among paired devices. */
    private static final String[] ADAPTER_NAME_HINTS = {
            "OBD", "ELM", "VLINK", "VGATE", "OBDII", "OBD2"
    };

    private static final int SOCKET_TIMEOUT_MS = 5000;
    private static final int COMMAND_TIMEOUT_MS = 5000;

    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    private BluetoothSocket socket;
    private OutputStream out;
    private BufferedReader in;
    private String connectedDeviceName;
    private String connectedDeviceAddress;

    /** A call waiting on the runtime Bluetooth permission prompt. */
    private PluginCall pendingCall;
    /** What the pending call wanted to do once permission is granted. */
    private String pendingAction;

    // ------------------------------------------------------------------
    // Plugin methods (called from JS via Capacitor.registerPlugin('Obd2'))
    // ------------------------------------------------------------------

    @PluginMethod
    public void connect(PluginCall call) {
        if (!ensureBluetoothPermission(call, "connect")) {
            return; // Permission prompt shown; the callback resumes this call.
        }
        ioExecutor.execute(() -> doConnect(call));
    }

    @PluginMethod
    public void readCodes(PluginCall call) {
        if (!ensureBluetoothPermission(call, "readCodes")) {
            return;
        }
        ioExecutor.execute(() -> doReadCodes(call));
    }

    @PluginMethod
    public void readLiveData(PluginCall call) {
        if (!ensureBluetoothPermission(call, "readLiveData")) {
            return;
        }
        ioExecutor.execute(() -> doReadLiveData(call));
    }

    // ------------------------------------------------------------------
    // Runtime permissions (Android 12+)
    // ------------------------------------------------------------------

    /** True if we already hold the Bluetooth runtime permissions. */
    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true; // Pre-Android 12: manifest permissions are enough.
        }
        return ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.BLUETOOTH_SCAN)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Returns true if the call may proceed now. If permission is missing,
     * stashes the call, shows the system prompt, and returns false; the
     * permission callback below resumes the stashed call.
     */
    private boolean ensureBluetoothPermission(PluginCall call, String action) {
        if (hasBluetoothPermission()) {
            return true;
        }
        pendingCall = call;
        pendingAction = action;
        requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
        return false;
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        PluginCall pending = pendingCall;
        String action = pendingAction;
        pendingCall = null;
        pendingAction = null;
        if (pending == null || action == null) {
            return;
        }
        if (!hasBluetoothPermission()) {
            pending.reject("Bluetooth permission denied. Allow Bluetooth access so AutoHustle can talk to the ELM327 adapter.");
            return;
        }
        switch (action) {
            case "connect":
                ioExecutor.execute(() -> doConnect(pending));
                break;
            case "readCodes":
                ioExecutor.execute(() -> doReadCodes(pending));
                break;
            case "readLiveData":
                ioExecutor.execute(() -> doReadLiveData(pending));
                break;
            default:
                pending.reject("Unknown pending action: " + action);
                break;
        }
    }

    // ------------------------------------------------------------------
    // Connection
    // ------------------------------------------------------------------

    private void doConnect(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                call.reject("This device has no Bluetooth adapter.");
                return;
            }
            if (!adapter.isEnabled()) {
                call.reject("Bluetooth is off. Turn Bluetooth on and pair the ELM327 adapter first.");
                return;
            }

            BluetoothDevice device = findAdapter(adapter);
            if (device == null) {
                call.reject("No paired ELM327 adapter found. Pair the adapter in Android Bluetooth settings first (it usually shows up as OBDII, ELM327, VLink or similar).");
                return;
            }

            disconnectQuietly();
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket.setSoTimeout(SOCKET_TIMEOUT_MS);
            socket.connect();
            out = socket.getOutputStream();
            in = new BufferedReader(new InputStreamReader(socket.getInputStream()));

            // ELM327 init: reset, echo off, linefeeds off, spaces off,
            // headers off, auto protocol. Each command waits for the '>' prompt.
            sendCommand("ATZ", 3000);
            sendCommand("ATE0", 2000);
            sendCommand("ATL0", 2000);
            sendCommand("ATS0", 2000);
            sendCommand("ATH0", 2000);
            sendCommand("ATSP0", 2000);

            connectedDeviceName = device.getName();
            connectedDeviceAddress = device.getAddress();

            JSObject result = new JSObject();
            result.put("connected", true);
            result.put("deviceName", connectedDeviceName);
            result.put("deviceAddress", connectedDeviceAddress);
            call.resolve(result);
        } catch (IOException e) {
            disconnectQuietly();
            call.reject("Could not connect to the ELM327 adapter: " + e.getMessage());
        } catch (SecurityException e) {
            call.reject("Bluetooth permission was revoked: " + e.getMessage());
        }
    }

    /**
     * Finds the ELM327 among paired devices: first by name hint
     * (OBD / ELM / VLink / Vgate), otherwise the only paired device
     * if there is exactly one, otherwise null.
     */
    private BluetoothDevice findAdapter(BluetoothAdapter adapter) {
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded == null || bonded.isEmpty()) {
            return null;
        }
        for (BluetoothDevice device : bonded) {
            String name = device.getName();
            if (name != null) {
                String upper = name.toUpperCase(Locale.US);
                for (String hint : ADAPTER_NAME_HINTS) {
                    if (upper.contains(hint)) {
                        return device;
                    }
                }
            }
        }
        if (bonded.size() == 1) {
            return bonded.iterator().next();
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Mode 03 — stored trouble codes
    // ------------------------------------------------------------------

    private void doReadCodes(PluginCall call) {
        try {
            requireConnection();
            String raw = sendCommand("03", COMMAND_TIMEOUT_MS);
            List<String> codes = parseMode03(raw);
            JSObject result = new JSObject();
            result.put("codes", new JSArray(codes));
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Failed to read trouble codes: " + e.getMessage());
        } catch (IllegalStateException e) {
            call.reject(e.getMessage());
        }
    }

    /**
     * Mode 03 response looks like "43 01 33 00 00 00 00" — the leading
     * 0x43 is the mode-03 header, then one DTC per 2 bytes. "0000" pairs
     * are padding, not codes. First byte: bits 7-6 pick the letter
     * (00=P, 01=C, 10=B, 11=U), bits 5-4 are the first digit,
     * bits 3-0 the second digit; the second byte is digits 3 and 4.
     */
    private List<String> parseMode03(String raw) {
        List<String> codes = new ArrayList<>();
        String hex = cleanHex(raw);
        if (hex.length() < 4 || !hex.startsWith("43")) {
            return codes; // "NO DATA" / empty response -> no codes.
        }
        String body = hex.substring(2);
        for (int i = 0; i + 4 <= body.length(); i += 4) {
            String pair = body.substring(i, i + 4);
            if (pair.equals("0000")) {
                continue;
            }
            int b1 = Integer.parseInt(pair.substring(0, 2), 16);
            int b2 = Integer.parseInt(pair.substring(2, 4), 16);
            char letter;
            switch ((b1 >> 6) & 0x03) {
                case 0: letter = 'P'; break;
                case 1: letter = 'C'; break;
                case 2: letter = 'B'; break;
                default: letter = 'U'; break;
            }
            int d1 = (b1 >> 4) & 0x03;
            int d2 = b1 & 0x0F;
            int d3 = (b2 >> 4) & 0x0F;
            int d4 = b2 & 0x0F;
            codes.add(String.format(Locale.US, "%c%d%X%X%X", letter, d1, d2, d3, d4));
        }
        return codes;
    }

    // ------------------------------------------------------------------
    // Mode 01 — live data
    // ------------------------------------------------------------------

    private void doReadLiveData(PluginCall call) {
        try {
            requireConnection();
            JSObject live = new JSObject();

            // 0100 — supported PIDs 01-20 (bitmask, returned as hex for info).
            String supported = queryPid("0100");
            if (supported != null) {
                live.put("supportedPids", supported);
            }

            // 0105 — coolant temperature, (A - 40) deg C.
            Integer coolant = queryPidByte("0105");
            if (coolant != null) {
                live.put("coolantTempC", coolant - 40);
            }

            // 010C — engine RPM, ((A * 256) + B) / 4.
            Integer[] rpmBytes = queryPidBytes("010C", 2);
            if (rpmBytes != null) {
                live.put("rpm", ((rpmBytes[0] * 256) + rpmBytes[1]) / 4);
            }

            // 0104 — engine load, A * 100 / 255 percent.
            Integer load = queryPidByte("0104");
            if (load != null) {
                live.put("engineLoadPct", Math.round(load * 100.0 / 255.0));
            }

            // 010D — vehicle speed, A km/h.
            Integer speed = queryPidByte("010D");
            if (speed != null) {
                live.put("speedKmh", speed);
            }

            // 0142 — control module (battery) voltage, ((A * 256) + B) / 1000 V.
            Integer[] voltBytes = queryPidBytes("0142", 2);
            if (voltBytes != null) {
                live.put("batteryVoltage", ((voltBytes[0] * 256) + voltBytes[1]) / 1000.0);
            }

            call.resolve(live);
        } catch (IOException e) {
            call.reject("Failed to read live data: " + e.getMessage());
        } catch (IllegalStateException e) {
            call.reject(e.getMessage());
        }
    }

    /** Sends "01xx" and returns the data bytes after the "41 xx" header, or null on NO DATA. */
    private String queryPid(String pid) throws IOException {
        String raw = sendCommand(pid, COMMAND_TIMEOUT_MS);
        String hex = cleanHex(raw);
        String header = "41" + pid.substring(2);
        if (!hex.startsWith(header)) {
            return null;
        }
        return hex.substring(header.length());
    }

    private Integer queryPidByte(String pid) throws IOException {
        String data = queryPid(pid);
        if (data == null || data.length() < 2) {
            return null;
        }
        return Integer.parseInt(data.substring(0, 2), 16);
    }

    private Integer[] queryPidBytes(String pid, int count) throws IOException {
        String data = queryPid(pid);
        if (data == null || data.length() < count * 2) {
            return null;
        }
        Integer[] out = new Integer[count];
        for (int i = 0; i < count; i++) {
            out[i] = Integer.parseInt(data.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Low-level ELM327 I/O
    // ------------------------------------------------------------------

    private void requireConnection() {
        if (socket == null || !socket.isConnected() || out == null || in == null) {
            throw new IllegalStateException("Not connected to an ELM327 adapter. Call connect() first.");
        }
    }

    /**
     * Sends one command (terminated with CR) and reads until the ELM327
     * '>' prompt, the read times out, or the response ends. Returns the
     * raw response text including the prompt, which callers clean up.
     */
    private String sendCommand(String command, int timeoutMs) throws IOException {
        requireConnection();
        socket.setSoTimeout(timeoutMs);
        out.write((command + "\r").getBytes());
        out.flush();

        StringBuilder response = new StringBuilder();
        long deadline = System.currentTimeMillis() + timeoutMs;
        int ch;
        while (System.currentTimeMillis() < deadline) {
            try {
                ch = in.read();
            } catch (java.net.SocketTimeoutException e) {
                break;
            }
            if (ch == -1) {
                break;
            }
            response.append((char) ch);
            if (ch == '>') {
                break;
            }
        }
        return response.toString();
    }

    /**
     * Strips everything that is not hex from a response: the echoed
     * command, spaces, linefeeds, the '>' prompt, "SEARCHING..." and
     * "NO DATA" markers. Returns an uppercase hex string (possibly empty).
     */
    private String cleanHex(String raw) {
        if (raw == null) {
            return "";
        }
        String upper = raw.toUpperCase(Locale.US);
        if (upper.contains("NO DATA") || upper.contains("?")) {
            return "";
        }
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i < upper.length(); i++) {
            char c = upper.charAt(i);
            if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F')) {
                hex.append(c);
            }
        }
        return hex.toString();
    }

    private void disconnectQuietly() {
        try {
            if (in != null) {
                in.close();
            }
        } catch (IOException ignored) {
        }
        try {
            if (out != null) {
                out.close();
            }
        } catch (IOException ignored) {
        }
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (IOException ignored) {
        }
        socket = null;
        out = null;
        in = null;
        connectedDeviceName = null;
        connectedDeviceAddress = null;
    }
}
