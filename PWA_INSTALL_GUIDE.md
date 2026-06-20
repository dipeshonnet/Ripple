# Ripple PWA Install Guide

Ripple now includes Progressive Web App support. After deployment to Netlify, users can install the same web app as a desktop/mobile app.

## What changed

- `manifest.webmanifest` added
- `service-worker.js` added
- app icons added in `/icons`
- PWA metadata added to `index.html`
- service worker registration added to `index.html`

## What the user needs to do

PWA support does not auto-install the app on a device. It enables the browser install option.

### Windows / Edge

1. Open the Netlify URL, for example `https://ripple108.netlify.app/`.
2. Click the three dots.
3. Go to **Apps**.
4. Click **Install this site as an app**.
5. Name it `Ripple`.

### Windows / Chrome

1. Open the Netlify URL.
2. Click the install icon in the address bar, or use **Three dots → Cast, save, and share → Install page as app**.
3. Name it `Ripple`.

### iPhone

1. Open the Netlify URL in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Confirm the name `Ripple`.

### Android

1. Open the Netlify URL in Chrome.
2. Tap the three dots.
3. Tap **Install app** or **Add to Home screen**.

## Notes

- Netlify/HTTPS is required for installability.
- Safari on iPhone uses Add to Home Screen rather than an automatic install prompt.
- If the install option does not appear immediately, refresh once and wait a few seconds.
- After major updates, users may need to refresh once to pick up the latest cached version.
