# Firebase setup checklist

1. Confirm Email/Password and Google providers are enabled.
2. Register the web app and copy its config into `public/firebase-config.js`.
3. Create Firestore in Production mode.
4. Publish `firestore.rules`.
5. Add `localhost` to Authentication → Settings → Authorized domains.
6. Create a service account key for the server only. Store its JSON in `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable. Never upload it to the public folder or Git.
7. Set Gemini key privately as `GEMINI_API_KEY`.
8. Test registration, Google sign-in, logout, refresh, Firestore task creation, and an AI request.
