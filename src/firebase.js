import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDgaSzVYZQCH_Q3zrMwxNc9DVf1nTXPfX8",
  authDomain: "financas-app-85165.firebaseapp.com",
  projectId: "financas-app-85165",
  storageBucket: "financas-app-85165.firebasestorage.app",
  messagingSenderId: "499425151668",
  appId: "1:499425151668:web:373f040a2bd11b10e4e5e1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
