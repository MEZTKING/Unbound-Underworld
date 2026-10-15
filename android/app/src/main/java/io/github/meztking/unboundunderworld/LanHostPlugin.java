package io.github.meztking.unboundunderworld;

import android.content.Context;
import android.net.wifi.WifiManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * Hosting and finding games on the same Wi-Fi or hotspot. `start` runs the
 * game's relay on this phone (see LanRelay) and announces it with a small UDP
 * broadcast every second; `discover` listens for those announcements (from
 * phones and from the Windows app alike).
 */
@CapacitorPlugin(name = "LanHost")
public class LanHostPlugin extends Plugin {

    static final int BEACON_PORT = 7778;
    static final int GAME_PORT = 7777;

    private LanRelay relay;
    private Thread beacon;
    private volatile boolean beaconOn;
    private int port;
    private String hostName = "";

    @PluginMethod
    public void start(PluginCall call) {
        String name = call.getString("name", "Android");
        hostName = name;
        new Thread(() -> {
            try {
                synchronized (this) {
                    if (relay == null) {
                        Exception last = null;
                        for (int p = GAME_PORT; p < GAME_PORT + 10 && relay == null; p++) {
                            if (!portFree(p)) continue;
                            try {
                                LanRelay r = new LanRelay(p, name);
                                r.start();
                                relay = r;
                                port = p;
                            } catch (Exception e) {
                                last = e;
                            }
                        }
                        if (relay == null) throw last != null ? last : new Exception("No free port.");
                        // The server starts on its own thread: give it a moment to bind.
                        Thread.sleep(250);
                        startBeacon();
                    }
                }
                JSObject r = new JSObject();
                r.put("port", port);
                JSArray addrs = new JSArray();
                for (String a : addresses()) addrs.put(a);
                r.put("addresses", addrs);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Could not host on this network: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        new Thread(() -> {
            shutdown();
            call.resolve();
        }).start();
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
    }

    private synchronized void shutdown() {
        beaconOn = false;
        if (beacon != null) beacon.interrupt();
        beacon = null;
        if (relay != null) relay.shutdown();
        relay = null;
    }

    /** Listens for games announced on this network for `ms` milliseconds. */
    @PluginMethod
    public void discover(PluginCall call) {
        int ms = call.getInt("ms", 2500);
        new Thread(() -> {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiManager.MulticastLock lock = wifi != null ? wifi.createMulticastLock("uu-discover") : null;
            Map<String, JSObject> found = new LinkedHashMap<>();
            try {
                if (lock != null) {
                    lock.setReferenceCounted(false);
                    lock.acquire();
                }
                try (DatagramSocket sock = new DatagramSocket(null)) {
                    sock.setReuseAddress(true);
                    sock.setBroadcast(true);
                    sock.bind(new InetSocketAddress(BEACON_PORT));
                    long end = System.currentTimeMillis() + ms;
                    byte[] buf = new byte[2048];
                    while (true) {
                        long left = end - System.currentTimeMillis();
                        if (left <= 0) break;
                        sock.setSoTimeout((int) Math.max(1, left));
                        DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                        try {
                            sock.receive(pkt);
                        } catch (SocketTimeoutException e) {
                            break;
                        }
                        try {
                            JSONObject m = new JSONObject(new String(pkt.getData(), 0, pkt.getLength(), StandardCharsets.UTF_8));
                            if (!"uu".equals(m.optString("g"))) continue;
                            String addr = pkt.getAddress().getHostAddress();
                            JSObject game = new JSObject();
                            game.put("name", m.optString("name", "A game"));
                            game.put("address", addr);
                            game.put("port", m.optInt("port", GAME_PORT));
                            game.put("code", m.optString("code", ""));
                            game.put("players", m.optInt("players", 1));
                            game.put("version", m.optString("version", ""));
                            game.put("server", m.optBoolean("server", false));
                            found.put(addr + ":" + m.optInt("port", GAME_PORT), game);
                        } catch (Exception ignored) {
                            // Not one of ours.
                        }
                    }
                }
            } catch (Exception e) {
                // Couldn't listen (another app holds the port): report what was found.
            } finally {
                if (lock != null && lock.isHeld()) lock.release();
            }
            JSArray games = new JSArray();
            for (JSObject g : found.values()) games.put(g);
            JSObject r = new JSObject();
            r.put("games", games);
            call.resolve(r);
        }).start();
    }

    /** Announces the game hosted here, about once a second, to every network this phone is on. */
    private void startBeacon() {
        beaconOn = true;
        beacon = new Thread(() -> {
            try (DatagramSocket sock = new DatagramSocket()) {
                sock.setBroadcast(true);
                while (beaconOn) {
                    LanRelay r = relay;
                    if (r == null) break;
                    JSONObject m = new JSONObject();
                    m.put("g", "uu");
                    m.put("name", hostName);
                    m.put("port", port);
                    m.put("code", r.soleCode());
                    m.put("players", r.playerCount());
                    byte[] data = m.toString().getBytes(StandardCharsets.UTF_8);
                    for (InetAddress to : broadcastAddresses()) {
                        try {
                            sock.send(new DatagramPacket(data, data.length, to, BEACON_PORT));
                        } catch (Exception ignored) {
                            // That network refused broadcasts; others may not.
                        }
                    }
                    Thread.sleep(1200);
                }
            } catch (Exception ignored) {
                // Stopped (or no network): nothing more to announce.
            }
        });
        beacon.setDaemon(true);
        beacon.start();
    }

    /** Whether nothing else is listening on `p` (the relay itself only reports a busy port later). */
    static boolean portFree(int p) {
        try (java.net.ServerSocket s = new java.net.ServerSocket()) {
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(p));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** This phone's addresses on its networks (Wi-Fi, or the hotspot it shares). */
    static List<String> addresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof java.net.Inet4Address && !a.isLoopbackAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {
            // No networks.
        }
        return out;
    }

    static List<InetAddress> broadcastAddresses() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null) out.add(ia.getBroadcast());
                }
            }
        } catch (Exception ignored) {
            // Just the general broadcast address, then.
        }
        return out;
    }
}
