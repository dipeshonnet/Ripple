# Performance Arena — Deployment Guide

## 1. Local desktop launch

### 1.1 Recommended folder structure

The app folder must directly contain:

```text
index.html
styles.css
data.js
app-core.js
app-views-agent.js
app-views-lead-mgr.js
app-modals.js
```

If these files are inside a nested folder, launch from that nested folder.

### 1.2 Double-click launcher

If present, double-click:

```text
launch_desktop.bat
```

or

```text
launch.bat
```

Expected behavior:

- Starts a local static server.
- Opens the browser.
- Opens:

```text
http://localhost:5173/index.html
```

### 1.3 Manual local launch

Open Command Prompt in the folder that directly contains `index.html`.

Run:

```cmd
python -m http.server 5173
```

If `python` is not recognized, try:

```cmd
py -m http.server 5173
```

Then open:

```text
http://localhost:5173/index.html
```

Keep the Command Prompt window open while using the app.

## 2. Avoiding wrong-folder directory listing

If the browser shows a directory listing instead of the app, the server is running from the wrong folder or `index.html` is not at the server root.

Fix:

1. Close the server window.
2. Open the folder that directly contains `index.html`.
3. Click the Windows Explorer address bar.
4. Type:

```cmd
cmd
```

5. Press Enter.
6. Run:

```cmd
dir index.html
```

7. If `index.html` is found, run:

```cmd
python -m http.server 5173
```

8. Open:

```text
http://localhost:5173/index.html
```

## 3. Netlify deployment

Netlify is the recommended mobile demo deployment path.

### 3.1 Prepare files

Use the app folder that directly contains:

```text
index.html
styles.css
data.js
app-core.js
app-views-agent.js
app-views-lead-mgr.js
app-modals.js
```

### 3.2 Upload to Netlify Drop

1. Go to Netlify Drop.
2. Drag the **contents of the app folder** or the folder itself if Netlify preserves `index.html` at root.
3. Confirm the deployed site root has `index.html` directly at root.
4. Open:

```text
https://<netlify-site>.netlify.app/index.html
```

### 3.3 Common Netlify mistake

Do not deploy a parent folder that creates this structure:

```text
/netlify-root/performance_arena_working/index.html
```

If that happens, the root URL may be blank or show a folder listing. The Netlify root should be:

```text
/netlify-root/index.html
```

## 4. Mobile demo

### 4.1 Recommended mobile path

Use the Netlify URL on iPhone/Android:

```text
https://<netlify-site>.netlify.app/index.html
```

Do not rely on opening a local `.html` file from iPhone Files. iPhone file preview can break the UI.

### 4.2 Teams mobile demo setup

| Device | Setup |
|---|---|
| Laptop | Join Teams with audio/camera and speaker notes. |
| Phone | Open Netlify URL, join Teams muted, share phone screen. |

Before sharing phone screen:

- Turn on Do Not Disturb.
- Keep phone on Wi-Fi or stable mobile data.
- Mute phone mic and speaker in Teams.
- Close notifications.
- Test navigation once.

## 5. Troubleshooting

### 5.1 Directory listing appears

Cause: server is running from wrong folder.

Fix: launch from folder that directly contains `index.html`, or open `/index.html` explicitly.

### 5.2 Blank page

Possible causes:

- Wrong folder uploaded/deployed.
- Browser cache.
- JavaScript file missing.
- `data.js` missing.
- CDN blocked.

Fix:

- Confirm root contains all app JS/CSS files.
- Hard refresh.
- Open Developer Tools console if available.
- Try `http://localhost:5173/index.html` rather than just `/`.

### 5.3 Python not found

Try:

```cmd
py -m http.server 5173
```

If Python is not installed and no admin access exists, use Netlify deployment instead.

### 5.4 Port already in use

Use a different port:

```cmd
python -m http.server 5174
```

Then open:

```text
http://localhost:5174/index.html
```

### 5.5 Mobile cannot access localhost

`localhost` on your phone means the phone itself, not your laptop.

Options:

- Use Netlify.
- Use laptop LAN IP only if phone and laptop are on same network and firewall allows.
- Use desktop browser mobile emulation as fallback.

### 5.6 iPhone file preview problem

Opening `.html` through iPhone Files may launch Quick Look/preview and break app rendering.

Use Netlify or another static host instead.

### 5.7 Browser cache/localStorage issue

Reset prototype state:

```js
localStorage.removeItem('arena_state_v7'); location.reload();
```

Hard refresh after reset.

## 6. Testing

Run from app folder:

```cmd
node test_prototype.js
```

Expected latest package result:

```text
140 PASS / 0 FAIL
```

If Node is not available, use `test.bat` / `test_app.bat` if the package includes a bundled or accessible Node runtime.

## 7. Deployment checklist

Before demo:

- [ ] App opens on desktop.
- [ ] App opens on phone through Netlify.
- [ ] Agent Home loads.
- [ ] TL Client Outcomes loads.
- [ ] TL SLA/KPI Trends loads.
- [ ] TL RCA loads.
- [ ] Manager Client Outcomes loads.
- [ ] Manager Revenue & Commercial loads.
- [ ] Definition question-mark popovers work.
- [ ] Reset state done.
- [ ] Teams screen-share tested.

---

## Regenerating `data.js` after Excel edits

After editing `Performance_Arena_Dataset.xlsx`, regenerate and validate the static app data before deploying:

```cmd
python export_to_json.py
python validate_data.py
node test_prototype.js
```

If the browser was already opened before the data change, reset local state:

```js
localStorage.removeItem('arena_state_v7'); location.reload();
```

Then redeploy the static folder to Netlify or relaunch locally.
