# Cloud saves with Google Drive: one-time setup

> **No setup needed for backups.** *Sync Saves → Back up to Google Drive* works
> in every build. It saves a backup file through Android's file picker (choose
> **Drive**) or into the Google Drive folder on a PC, and the game keeps that
> file up to date (`src/net/backupfile.ts`, `BackupFilePlugin.java`,
> `electron/backup.cjs`). This page is only for the optional **sign-in**
> version, which needs the game registered with Google.

Players sign in with Google on each device. Each save slot is then kept as a
small file in a hidden app folder in their own Google Drive, and slot 1 on a
phone shares its progress with slot 1 on a PC. Nothing goes through a server
of ours.

The game only offers Google Drive once the builds know which Google Cloud
project they belong to. The steps below set that up once. Until then, Google
Drive simply doesn't appear in **Sync Saves**.

## 1. Create the Google Cloud project

1. Open <https://console.cloud.google.com/> and create a project, e.g. "Unbound Underworld".
2. Go to **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.
3. Go to **Google Auth Platform → Branding** (older consoles: **OAuth consent screen**):
   - App name: *Unbound Underworld*; support email: yours.
   - Audience: **External**.
4. Under **Data Access**, add the scope `https://www.googleapis.com/auth/drive.appdata`.
   It only reaches the game's own hidden folder, so Google treats it as a
   non-sensitive scope and no app review is needed.
5. Under **Audience**, either add your own Google account(s) as **test users**
   while you try it, or click **Publish app** so everyone can sign in.

## 2. Create the three sign-in clients

In **Google Auth Platform → Clients** (older consoles: **Credentials → Create
credentials → OAuth client ID**), create:

| Client type | Used by | What to fill in |
| --- | --- | --- |
| **Web application** | the web version, and as the "Drive is set up" switch for all builds | **Authorized JavaScript origins**: every address the web version runs from, e.g. `https://unbound-underworld.pages.dev`, and `http://localhost:5173` for development. |
| **Desktop app** | Windows, macOS and Linux | Nothing else. |
| **Android** | the Android APK and the Play Store build | Package name `io.github.meztking.unboundunderworld` and the **SHA-1 fingerprint** of the signing key (see below). |

Android needs one Android client per signing key:

- **GitHub APK**: the key in the `ANDROID_KEYSTORE_BASE64` secret. Get its SHA-1 with
  `keytool -list -v -keystore release.keystore -alias <your alias>`.
- **Play Store**: Play signs the app with its own key. Copy its SHA-1 from Play
  Console → your app → **Test and release → App integrity → App signing**.

## 3. Give the IDs to the build

In the GitHub repository, open **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `GOOGLE_WEB_CLIENT_ID` | the Web application client ID (`…apps.googleusercontent.com`) |
| Variable | `GOOGLE_DESKTOP_CLIENT_ID` | the Desktop app client ID |
| Secret | `GOOGLE_DESKTOP_CLIENT_SECRET` | the Desktop app client secret (`GOCSPX-…`) |

The Android client needs nothing here: Google recognises the app by its package
name and signing key.

The next **App builds** run includes Google Drive in every app.

## Running from source

- Web or Android: `VITE_GOOGLE_WEB_CLIENT_ID=<web client id> npm run dev` (or
  `npm run android:sync`).
- Desktop: also set `UU_GOOGLE_CLIENT_ID` and `UU_GOOGLE_CLIENT_SECRET` to the
  Desktop app client before `npm run desktop`, or put them in
  `electron/google.json` as `{ "clientId": "…", "clientSecret": "…" }`. That
  file is ignored by git.

## How it works

- **Desktop**: *Sign in with Google* opens the system browser, which returns to
  the game through a one-off address on `127.0.0.1` (Google's flow for
  installed apps, with PKCE). The sign-in is kept in the app's data folder,
  encrypted by the operating system where it can be, so it lasts until the
  player signs out (`electron/google.cjs`).
- **Android**: Google Play services shows its account picker and asks for
  access (`GoogleDrivePlugin.java`). Later requests don't show anything.
- **Web**: Google's sign-in popup. A sign-in lasts about an hour, after which the
  game asks again the next time the player syncs by hand.
- The Drive calls are the same on every platform (`src/net/gdrive.ts`). Each
  slot is `slot-N.json` in the app folder: the save plus the time it was
  uploaded.
- With **Keep in sync** on, the save uploads after each escape. When the game
  starts, it offers the Drive copy if that copy is newer than the save on this
  device.
- **Sign out** removes the game's access to the account. The saves stay in Drive
  for the next sign-in. A player can also remove the game's access from their
  Google Account → Security → Third-party connections.
