import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot, setDoc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";

// Retorna [valor, gravar, carregado]. `carregado` só fica true depois da primeira
// leitura do servidor — use antes de qualquer limpeza que dependa de a lista estar
// completa.
export function useFirestoreData(uid, key, defaultValue) {
  const [val, setVal] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const valRef = useRef(defaultValue);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    if (!uid) return;
    const ref = doc(db, "users", uid, "data", key);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const v = snap.exists() ? (snap.data().value ?? defaultValue) : defaultValue;
        valRef.current = v;
        setVal(v);
        loadedRef.current = true;
        setLoaded(true);
      },
      // Se a escuta cai (permissão negada, rede), o que está na tela deixa de ser
      // confiável: bloqueia gravação em vez de mandar dado velho pro servidor.
      (err) => {
        console.error(`useFirestoreData(${key}): escuta caiu`, err);
        loadedRef.current = false;
        setLoaded(false);
      }
    );
    return unsub;
  }, [uid, key]);

  const persist = (newOrFn) => {
    const isFn = typeof newOrFn === "function";
    const newVal = isFn ? newOrFn(valRef.current) : newOrFn;
    valRef.current = newVal;
    setVal(newVal);
    if (!uid || !loadedRef.current) return;

    const ref = doc(db, "users", uid, "data", key);
    if (!isFn) { setDoc(ref, { value: newVal }); return; }

    // Mudança em forma de função (filtrar, adicionar, editar) é reaplicada em cima
    // do que está no servidor, não da cópia local. Antes, uma aba aberta há semanas
    // gravava a lista velha inteira de volta e ressuscitava o que já tinha sido
    // apagado — foi assim que os recorrentes voltaram em setembro.
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const server = snap.exists() ? (snap.data().value ?? defaultValue) : defaultValue;
      tx.set(ref, { value: newOrFn(server) });
    }).catch((err) => console.error(`useFirestoreData(${key}):`, err));
  };

  return [val, persist, loaded];
}
