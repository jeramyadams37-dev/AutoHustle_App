# Push AutoHustle v10 to GitHub and trigger the first APK build

Run these in Termux from the machine that has the v10 tree and the new
keystore (`~/autohustle-v10-release.keystore`). Do NOT paste the keystore
file or any password into chat.

## 0. Prerequisites

- `gh` CLI installed and logged in (`gh auth status` should show you as
  jeramyadams37-dev). If not: `pkg install gh` then `gh auth login`.
- The v10 tree is at `~/workspace/autohustle-v10/` on Muse's VM, not on your
  phone — copy it to your phone first, or push from the machine that has it.
  The tree is a plain folder, not a git repo yet.

## 1. Push the tree (first time)

```
cd autohustle-v10
git init
git add -A
git commit -m "AutoHustle v10: canonical Capacitor build, server-side Gemini, Bluetooth OBD2 plugin, Driver Uptime pre-shift check"
git branch -M main
git remote add origin https://github.com/jeramyadams37-dev/AutoHustle_App.git
git push -u origin main
```

If `AutoHustle_App` is the wrong repo for v10, use the repo you want instead
— the workflow runs on push to `main`/`master` in whatever repo it lands in.

## 2. Add the signing secrets (one time)

The workflow reads these four secrets. `gh secret set` prompts for the value
— type it in Termux, never in chat.

```
gh secret set ANDROID_KEYSTORE_BASE64 --repo jeramyadams37-dev/AutoHustle_App < <(base64 -w0 ~/autohustle-v10-release.keystore)
gh secret set ANDROID_KEYSTORE_PASSWORD --repo jeramyadams37-dev/AutoHustle_App
gh secret set ANDROID_KEY_ALIAS --repo jeramyadams37-dev/AutoHustle_App
gh secret set ANDROID_KEY_PASSWORD --repo jeramyadams37-dev/AutoHustle_App
```

- `ANDROID_KEY_ALIAS` is `autohustle`.
- Keystore password and key password are the ones you chose when you made
  the keystore. If you used the same password for both, enter it twice.

## 3. Trigger the build and watch it

```
gh workflow run "Build Auto-Hustle Standalone APK" --repo jeramyadams37-dev/AutoHustle_App
gh run watch --repo jeramyadams37-dev/AutoHustle_App
```

When it finishes, download the artifact:

```
gh run download --repo jeramyadams37-dev/AutoHustle_App --name AutoHustle-v10-APK
```

- With secrets set you get the signed `AutoHustle-v10.apk`.
- Without secrets you get `AutoHustle-v10-debug.apk` (installable for
  testing, not for the Play Store).

## 4. Test on the LeSabre

1. Install the APK, pair the ELM327 adapter in Android Bluetooth settings.
2. Open AutoHustle → Live Scan → connect, read codes, read live data.
3. Run a Pre-Shift Check on the LeSabre and confirm codes + live data come
   through. Until then Live Scan still has its labelled demo fallback.

## 5. After the new Firebase key is verified

Once sign-in and Firestore work with the new key ("AutoHustle web (rotated
Nov 8 2026)"), delete the old API key in Google Cloud Console →
APIs & Services → Credentials → project artifact-console.
