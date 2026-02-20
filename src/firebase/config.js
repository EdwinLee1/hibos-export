import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDj-i3uOzwI3CuxoSKYwq2xYvqzUXU8yWw",
  authDomain: "hibos-export.firebaseapp.com",
  projectId: "hibos-export",
  storageBucket: "hibos-export.firebasestorage.app",
  messagingSenderId: "283495736470",
  appId: "1:283495736470:web:db61cbb3b8ab9e834d8eb7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
