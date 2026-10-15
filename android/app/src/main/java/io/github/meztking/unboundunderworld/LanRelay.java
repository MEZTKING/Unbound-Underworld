package io.github.meztking.unboundunderworld;

import java.net.InetSocketAddress;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The game's relay, on the phone: lets players on the same Wi-Fi or hotspot
 * join a game hosted from this device. It speaks the same protocol as
 * server/relay-core.cjs (rooms with codes, seats kept for a while after a
 * drop, messages passed between the host and the others); only save sync is
 * left to the standalone server.
 */
public class LanRelay extends WebSocketServer {

    static final int PROTOCOL = 1;
    static final long PEER_GRACE_MS = 120_000;
    static final long HOST_GRACE_MS = 60_000;
    private static final String CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    static class Seat {
        String name;
        String token;
        WebSocket conn;
        ScheduledFuture<?> timer;
    }

    static class Room {
        String code;
        String name;
        String version;
        int max;
        WebSocket host;
        String hostToken;
        ScheduledFuture<?> hostTimer;
        final LinkedHashMap<Integer, Seat> seats = new LinkedHashMap<>();
        int nextPeer = 1;
        boolean locked;
    }

    /** Which room and seat each connection holds (peer 0 = the host). */
    static class Conn {
        Room room;
        int peer = -1;
    }

    private final Map<String, Room> rooms = new HashMap<>();
    private final Map<WebSocket, Conn> conns = new HashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor();
    private final String serverName;

    public LanRelay(int port, String serverName) {
        super(new InetSocketAddress(port));
        this.serverName = serverName;
        setReuseAddr(true);
        setConnectionLostTimeout(30);
    }

    // ---------------------------------------------------------------- what the beacon announces

    /** The one room's code (the beacon tells players nearby), or "" if there isn't exactly one. */
    public synchronized String soleCode() {
        return rooms.size() == 1 ? rooms.keySet().iterator().next() : "";
    }

    public synchronized int playerCount() {
        int n = 0;
        for (Room r : rooms.values()) {
            if (r.host != null) n++;
            for (Seat s : r.seats.values()) if (s.conn != null) n++;
        }
        return n;
    }

    // ---------------------------------------------------------------- connections

    @Override
    public synchronized void onOpen(WebSocket conn, ClientHandshake handshake) {
        conns.put(conn, new Conn());
    }

    @Override
    public synchronized void onClose(WebSocket conn, int code, String reason, boolean remote) {
        Conn c = conns.remove(conn);
        if (c != null) dropped(conn, c);
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        // The connection closes on its own; nothing to add.
    }

    @Override
    public void onStart() {}

    @Override
    public synchronized void onMessage(WebSocket conn, String text) {
        Conn c = conns.get(conn);
        if (c == null) return;
        JSONObject m;
        try {
            m = new JSONObject(text);
        } catch (Exception e) {
            return;
        }
        String t = m.optString("t", "");
        switch (t) {
            case "ping":
                send(conn, obj("t", "pong", "n", m.opt("n")));
                break;
            case "info":
                JSONObject inf = info();
                set(inf, "t", "info");
                send(conn, inf);
                break;
            case "host":
                host(conn, c, m);
                break;
            case "join":
                join(conn, c, m);
                break;
            case "to":
            case "all":
                route(conn, c, m, t.equals("all"));
                break;
            case "kick":
                kick(c, m);
                break;
            case "lock":
                if (c.room != null && c.peer == 0) c.room.locked = m.optBoolean("on", false);
                break;
            case "leave":
                leave(conn, c);
                break;
            case "save-put":
            case "save-get":
                send(conn, error("no-saves", "Save sync needs an online server, not a game hosted on a phone."));
                break;
            default:
                break;
        }
    }

    private JSONObject info() {
        return obj("game", "unbound-underworld", "protocol", PROTOCOL, "name", serverName, "rooms", rooms.size(), "players", playerCount(), "saves", false);
    }

    /** A JSON object from key, value pairs (Android's org.json throws checked exceptions on put). */
    static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        for (int i = 0; i + 1 < kv.length; i += 2) set(o, (String) kv[i], kv[i + 1]);
        return o;
    }

    static void set(JSONObject o, String k, Object v) {
        try {
            o.put(k, v == null ? JSONObject.NULL : v);
        } catch (Exception e) {
            // Only non-finite numbers are refused; leave the key out.
        }
    }

    private static void send(WebSocket conn, JSONObject m) {
        if (conn != null && conn.isOpen()) conn.send(m.toString());
    }

    private static JSONObject error(String code, String text) {
        return obj("t", "error", "code", code, "text", text);
    }

    private String token() {
        byte[] b = new byte[12];
        random.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
    }

    private String newCode() {
        while (true) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 5; i++) sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
            if (!rooms.containsKey(sb.toString())) return sb.toString();
        }
    }

    private static String cleanName(Object raw, String fallback) {
        String s = raw == null ? "" : String.valueOf(raw);
        s = s.replaceAll("[\\u0000-\\u001f<>]", "").trim();
        if (s.length() > 24) s = s.substring(0, 24);
        return s.isEmpty() ? fallback : s;
    }

    // ---------------------------------------------------------------- rooms

    private void host(WebSocket conn, Conn c, JSONObject m) {
        if (c.room != null) {
            send(conn, error("busy", "Already in a game."));
            return;
        }
        String code = m.optString("code", "");
        String tok = m.optString("token", "");
        if (!code.isEmpty() && !tok.isEmpty()) {
            Room r = rooms.get(code.toUpperCase());
            if (r != null && tok.equals(r.hostToken)) {
                if (r.hostTimer != null) r.hostTimer.cancel(false);
                r.host = conn;
                c.room = r;
                c.peer = 0;
                JSONArray peers = new JSONArray();
                for (Map.Entry<Integer, Seat> e : r.seats.entrySet()) {
                    peers.put(obj("peer", e.getKey(), "name", e.getValue().name, "online", e.getValue().conn != null));
                }
                send(conn, obj("t", "hosted", "code", r.code, "token", r.hostToken, "rejoin", true, "peers", peers));
                for (Seat s : r.seats.values()) send(s.conn, obj("t", "host-back"));
                return;
            }
        }
        Room r = new Room();
        r.code = newCode();
        r.name = cleanName(m.opt("name"), "A game");
        r.version = m.optString("version", "");
        r.max = Math.max(2, Math.min(4, m.optInt("max", 4)));
        r.host = conn;
        r.hostToken = token();
        rooms.put(r.code, r);
        c.room = r;
        c.peer = 0;
        send(conn, obj("t", "hosted", "code", r.code, "token", r.hostToken, "protocol", PROTOCOL));
    }

    private void join(WebSocket conn, Conn c, JSONObject m) {
        if (c.room != null) {
            send(conn, error("busy", "Already in a game."));
            return;
        }
        String code = m.optString("code", "").trim().toUpperCase();
        if (code.isEmpty() && rooms.size() == 1) code = rooms.keySet().iterator().next();
        Room r = rooms.get(code);
        if (r == null) {
            send(conn, error("no-room", code.isEmpty() ? "No game is hosted here yet." : "No game with the code " + code + "."));
            return;
        }
        String version = m.optString("version", "");
        if (!r.version.isEmpty() && !version.isEmpty() && !r.version.equals(version)) {
            send(conn, error("version", "The host plays v" + r.version + " and you have v" + version + ". Both need the same version."));
            return;
        }
        String name = cleanName(m.opt("name"), "Player");
        String tok = m.optString("token", "");
        if (!tok.isEmpty()) {
            for (Map.Entry<Integer, Seat> e : r.seats.entrySet()) {
                Seat s = e.getValue();
                if (!tok.equals(s.token)) continue;
                if (s.timer != null) s.timer.cancel(false);
                if (s.conn != null && s.conn != conn) {
                    Conn old = conns.get(s.conn);
                    if (old != null) old.room = null;
                    s.conn.close(4000);
                }
                s.conn = conn;
                c.room = r;
                c.peer = e.getKey();
                send(conn, obj("t", "joined", "code", r.code, "peer", c.peer, "token", s.token, "rejoin", true, "name", r.name, "hostAway", r.host == null));
                send(r.host, obj("t", "peer", "peer", c.peer, "name", s.name, "rejoin", true));
                return;
            }
        }
        if (r.locked) {
            send(conn, error("locked", "That game is not taking new players."));
            return;
        }
        if (1 + r.seats.size() >= r.max) {
            send(conn, error("full", "That game is full."));
            return;
        }
        if (r.host == null) {
            send(conn, error("host-away", "The host is reconnecting. Try again in a moment."));
            return;
        }
        int peer = r.nextPeer++;
        Seat s = new Seat();
        s.name = name;
        s.token = token();
        s.conn = conn;
        r.seats.put(peer, s);
        c.room = r;
        c.peer = peer;
        send(conn, obj("t", "joined", "code", r.code, "peer", peer, "token", s.token, "name", r.name));
        send(r.host, obj("t", "peer", "peer", peer, "name", name));
    }

    private void route(WebSocket conn, Conn c, JSONObject m, boolean all) {
        Room r = c.room;
        if (r == null) return;
        String text = obj("t", "from", "peer", c.peer, "d", m.opt("d")).toString();
        if (c.peer == 0) {
            if (all) {
                int except = m.optInt("except", -1);
                for (Map.Entry<Integer, Seat> e : r.seats.entrySet()) {
                    WebSocket to = e.getValue().conn;
                    if (to != null && to.isOpen() && e.getKey() != except) to.send(text);
                }
            } else {
                Seat s = r.seats.get(m.optInt("peer", -1));
                if (s != null && s.conn != null && s.conn.isOpen()) s.conn.send(text);
            }
        } else if (r.host != null && r.host.isOpen()) {
            r.host.send(text);
        }
    }

    private void kick(Conn c, JSONObject m) {
        Room r = c.room;
        if (r == null || c.peer != 0) return;
        int peer = m.optInt("peer", -1);
        Seat s = r.seats.remove(peer);
        if (s == null) return;
        if (s.timer != null) s.timer.cancel(false);
        if (s.conn != null) {
            send(s.conn, obj("t", "closed", "text", cleanName(m.opt("text"), "The host removed you from the game.")));
            Conn other = conns.get(s.conn);
            if (other != null) other.room = null;
            s.conn.close(1000);
        }
    }

    private void leave(WebSocket conn, Conn c) {
        Room r = c.room;
        if (r == null) return;
        if (c.peer == 0) {
            closeRoom(r, "The host ended the game.");
        } else {
            Seat s = r.seats.remove(c.peer);
            if (s != null && s.timer != null) s.timer.cancel(false);
            send(r.host, obj("t", "left", "peer", c.peer, "gone", true));
        }
        c.room = null;
        c.peer = -1;
    }

    private void closeRoom(Room r, String text) {
        if (r.hostTimer != null) r.hostTimer.cancel(false);
        for (Seat s : r.seats.values()) {
            if (s.timer != null) s.timer.cancel(false);
            if (s.conn != null) {
                send(s.conn, obj("t", "closed", "text", text));
                Conn other = conns.get(s.conn);
                if (other != null) other.room = null;
                s.conn.close(1000);
            }
        }
        if (r.host != null) {
            Conn h = conns.get(r.host);
            if (h != null) h.room = null;
        }
        rooms.remove(r.code);
    }

    private void dropped(WebSocket conn, Conn c) {
        final Room r = c.room;
        if (r == null) return;
        if (c.peer == 0) {
            if (r.host != conn) return;
            r.host = null;
            for (Seat s : r.seats.values()) send(s.conn, obj("t", "host-lost"));
            r.hostTimer = timers.schedule(() -> {
                synchronized (LanRelay.this) {
                    if (r.host == null && rooms.get(r.code) == r) closeRoom(r, "The host lost their connection.");
                }
            }, HOST_GRACE_MS, TimeUnit.MILLISECONDS);
            return;
        }
        final int peer = c.peer;
        final Seat s = r.seats.get(peer);
        if (s == null || s.conn != conn) return;
        s.conn = null;
        send(r.host, obj("t", "left", "peer", peer, "lost", true));
        s.timer = timers.schedule(() -> {
            synchronized (LanRelay.this) {
                if (r.seats.get(peer) == s && s.conn == null) {
                    r.seats.remove(peer);
                    send(r.host, obj("t", "left", "peer", peer, "gone", true));
                }
            }
        }, PEER_GRACE_MS, TimeUnit.MILLISECONDS);
    }

    /** Ends every game and stops listening. */
    public void shutdown() {
        synchronized (this) {
            for (Room r : new ArrayList<>(rooms.values())) closeRoom(r, "The host stopped hosting.");
        }
        timers.shutdownNow();
        try {
            stop(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** For the beacon: the rooms this relay holds. */
    public synchronized List<String> codes() {
        return new ArrayList<>(rooms.keySet());
    }
}
