# Smart Student AI — Full Website Starter

A Firebase-authenticated academic dashboard with:
- Email/password registration and login
- Google sign-in and password reset
- Per-user Firestore profile, tasks, reminders and activity history
- Gemini-powered study planner and learning assistant
- Weekly activity report with CSV export and browser Print → Save as PDF
- Focus timer, browser reminders, installable PWA shell

## 1. Install
Install Node.js 20+ then open this folder in VS Code. In the terminal:
```bash
npm install
```

## 2. Firebase web configuration
Open `public/firebase-config.js` and replace `YOUR_FIREBASE_WEB_API_KEY` with your Firebase Web App API key. This is the browser Firebase config, not a service-account private key.

In Firebase Console for project `student-ai-4e35b`:
- Authentication → Sign-in method: enable Email/Password and Google.
- Authentication → Settings → Authorized domains: add `localhost` for local testing and your deployed domain later.
- Firestore Database: create database.
- Firestore → Rules: publish the contents of `firestore.rules`.

## 3. Firebase Admin for secure AI requests
The backend verifies Firebase ID tokens before allowing Gemini requests. Create a Firebase service account:
- Firebase Console → Project settings → Service accounts → Generate new private key.
- Keep the downloaded JSON private. Do not put it in `public/`, do not commit it, and do not send it in chat.
- Copy the complete JSON as a single line into `.env` as `FIREBASE_SERVICE_ACCOUNT_JSON='...json...'` (without breaking the JSON). A safer production method is to set this as a hosting secret/environment variable.
- Use a private `.env` copied from `.env.example`. Add your own Gemini API key as `GEMINI_API_KEY`. Never expose it in frontend files.

## 4. Run locally
```bash
npm start
```
Open http://localhost:3000. The browser must be online because Firebase and Google Fonts load from their CDNs.

## 5. Deploy publicly
Deploy the Node server to a Node-compatible host (for example, Render, Railway, or a VPS). Set `GEMINI_API_KEY`, `GEMINI_MODEL`, and `FIREBASE_SERVICE_ACCOUNT_JSON` as private environment variables. Add the HTTPS production domain to Firebase Authentication → Authorized domains. Do not deploy `.env` or service-account JSON files.

## Current limitations — read before launch
- Browser notifications in this starter work only while the website is open and the browser has granted permission. They are not reliable background push notifications. True mobile push requires Firebase Cloud Messaging, VAPID configuration, a messaging service worker, and a trusted server-side scheduler.
- Weekly report metrics are based on generated AI sessions and completed tasks currently loaded from Firestore. It is not a full attendance/time-tracking system.
- Firestore rules provide per-user path isolation; production deployments should add field validation, abuse controls, rate limiting, backups, privacy/terms pages and monitoring.
- This is a working starter/prototype, not a fully audited commercial SaaS.
