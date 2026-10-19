package io.github.meztking.unboundunderworld;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Save backups in a file the player picks with Android's own file picker, so
 * it can live in Google Drive (or anywhere else the picker offers) without the
 * game signing in to anything. The game keeps permission to that one file and
 * rewrites it after each escape (src/net/backupfile.ts).
 */
@CapacitorPlugin(name = "BackupFile")
public class BackupFilePlugin extends Plugin {

    /** Asks where to create a new backup file. */
    @PluginMethod
    public void create(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/json");
        i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "unbound-underworld-save.json"));
        startActivityForResult(call, i, "picked");
    }

    /** Asks for an existing backup file. */
    @PluginMethod
    public void open(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        // Drive and other apps label .json files differently, so show them all.
        i.setType("*/*");
        startActivityForResult(call, i, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(new JSObject()); // cancelled
            return;
        }
        Uri uri = data.getData();
        ContentResolver resolver = getContext().getContentResolver();
        try {
            resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            try {
                resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {
                // Usable until the app closes.
            }
        }
        JSObject o = new JSObject();
        o.put("uri", uri.toString());
        o.put("name", displayName(uri));
        call.resolve(o);
    }

    @PluginMethod
    public void read(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("No backup file.");
            return;
        }
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(Uri.parse(uri))) {
                if (in == null) throw new Exception("The file can't be opened.");
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                JSObject o = new JSObject();
                o.put("text", new String(buf.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(o);
            } catch (Exception e) {
                call.reject(explain(e), e);
            }
        }).start();
    }

    @PluginMethod
    public void write(PluginCall call) {
        String uri = call.getString("uri");
        String text = call.getString("text", "");
        if (uri == null) {
            call.reject("No backup file.");
            return;
        }
        new Thread(() -> {
            try {
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                OutputStream out;
                try {
                    out = getContext().getContentResolver().openOutputStream(Uri.parse(uri), "wt");
                } catch (Exception notTruncating) {
                    // Some providers only offer "w"; the game ignores anything after the first line.
                    out = getContext().getContentResolver().openOutputStream(Uri.parse(uri), "w");
                }
                if (out == null) throw new Exception("The file can't be written.");
                try (OutputStream o = out) {
                    o.write(bytes);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(explain(e), e);
            }
        }).start();
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String name = c.getString(0);
                if (name != null) return name;
            }
        } catch (Exception ignored) {
            // Fall back to the link itself.
        }
        String last = uri.getLastPathSegment();
        return last == null ? "backup file" : last;
    }

    private static String explain(Exception e) {
        if (e instanceof SecurityException) return "The game no longer has access to the backup file. Choose it again.";
        String m = e.getMessage();
        return m == null || m.isEmpty() ? "The backup file couldn't be reached." : m;
    }
}
