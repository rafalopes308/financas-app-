import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export function useFirestoreData(uid, key, defaultValue) {
  const [val, setVal] = useState(defaultValue);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!uid) { loadedRef.current = false; return; }
    loadedRef.current = false;
    const ref = doc(db, "users", uid, "data", key);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setVal(snap.data().value ?? defaultValue);
      loadedRef.current = true;
    });
    return unsub;
  }, [uid, key]);

  const persist = (newOrFn) => {
    setVal((prevVal) => {
      const newVal = typeof newOrFn === "function" ? newOrFn(prevVal) : newOrFn;
      if (uid && loadedRef.current) {
        const ref = doc(db, "users", uid, "data", key);
        setDoc(ref, { value: newVal });
      }
      return newVal;
    });
  };

  return [val, persist];
}
