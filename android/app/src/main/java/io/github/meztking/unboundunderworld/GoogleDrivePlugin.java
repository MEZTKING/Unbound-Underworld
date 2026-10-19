package io.github.meztking.unboundunderworld;

import android.app.Activity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/**
 * Cloud saves: asks Google Play services for access to the game's hidden app
 * folder in the player's Google Drive and hands the access token to the game,
 * which makes the Drive calls itself (src/net/gdrive.ts). Google matches the
 * app by its package name and signing key, so there is no client ID here.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

    private static final String SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consent;
    private PluginCall waiting;

    @Override
    public void load() {
        consent = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = waiting;
            waiting = null;
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
                call.reject("Google sign-in was cancelled.", "cancelled");
                return;
            }
            try {
                AuthorizationResult r = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(result.getData());
                resolveToken(call, r);
            } catch (ApiException e) {
                call.reject(explain(e), "failed", e);
            }
        });
    }

    /** An access token; with `interactive` it may show Google's account and consent screens. */
    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(SCOPE))).build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(r -> {
                if (!r.hasResolution()) {
                    resolveToken(call, r);
                    return;
                }
                if (!interactive || r.getPendingIntent() == null) {
                    call.reject("Sign in to Google Drive again.", "signin-required");
                    return;
                }
                if (waiting != null) waiting.reject("Google sign-in was cancelled.", "cancelled");
                waiting = call;
                consent.launch(new IntentSenderRequest.Builder(r.getPendingIntent().getIntentSender()).build());
            })
            .addOnFailureListener(e -> call.reject(explain(e), "failed", e));
    }

    /** Forgets a token Google refused, so the next request gets a fresh one. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.resolve();
            return;
        }
        new Thread(() -> {
            try {
                GoogleAuthUtil.clearToken(getContext(), token);
            } catch (Exception ignored) {
                // Already gone.
            }
            call.resolve();
        }).start();
    }

    private void resolveToken(PluginCall call, AuthorizationResult r) {
        String token = r.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Google did not grant access to Drive.", "failed");
            return;
        }
        JSObject o = new JSObject();
        o.put("accessToken", token);
        call.resolve(o);
    }

    private static String explain(Exception e) {
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            if (code == CommonStatusCodes.DEVELOPER_ERROR) return "Google sign-in isn't set up for this build of the app (error 10).";
            if (code == CommonStatusCodes.NETWORK_ERROR) return "Couldn't reach Google. Check the connection.";
            if (code == CommonStatusCodes.CANCELED) return "Google sign-in was cancelled.";
            return "Google sign-in failed (error " + code + ").";
        }
        String m = e.getMessage();
        return m == null || m.isEmpty() ? "Google sign-in failed." : m;
    }
}
