import { auth, db, googleProvider } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup,
  signOut, updateProfile, sendEmailVerification, sendPasswordResetEmail,
  onAuthStateChanged, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

async function ensureProfile(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const base = {
    uid: user.uid, displayName: user.displayName || "", email: user.email || "",
    photoURL: user.photoURL || "", updatedAt: serverTimestamp()
  };
  if (!snap.exists()) await setDoc(ref, { ...base, university: "", department: "", semester: "", createdAt: serverTimestamp(), ...extra });
  else await setDoc(ref, base, { merge: true });
}
export async function register(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name.trim() });
  await ensureProfile(cred.user);
  await sendEmailVerification(cred.user);
  return cred.user;
}
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureProfile(cred.user);
  return cred.user;
}
export async function googleLogin() {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureProfile(cred.user);
  return cred.user;
}
export const logout = () => signOut(auth);
export const resetPassword = email => sendPasswordResetEmail(auth, email.trim());
export const watchAuth = callback => onAuthStateChanged(auth, callback);
export const reloadCurrentUser = () => auth.currentUser?.reload();
export const getIdToken = () => auth.currentUser?.getIdToken();
export { auth, db, doc, setDoc, getDoc, serverTimestamp };
