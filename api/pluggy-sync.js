// Sincronização diária com o Meu Pluggy (Open Finance).
// Roda via Vercel Cron (ver vercel.json). Busca transações novas do banco,
// categoriza (memória de categorias + palavras-chave) e grava no Firestore.
//
// Variáveis de ambiente necessárias (Vercel → Settings → Environment Variables):
//   PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET — da aplicação criada no dashboard.pluggy.ai
//   PLUGGY_ITEM_IDS — id(s) do item conectado (Meu Pluggy), separados por vírgula
//   FIREBASE_SERVICE_ACCOUNT — JSON completo da service account do Firebase
//   SYNC_UID — uid do usuário do app que recebe os lançamentos
//   CRON_SECRET — string aleatória; a Vercel envia automaticamente no header do cron

import admin from "firebase-admin";
import { suggestCategory, normalizeDesc } from "../src/ofxParser.js";

const PLUGGY_API = "https://api.pluggy.ai";
const SYNC_WINDOW_DAYS = 45;

function getDb() {
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin.firestore();
}

async function pluggyFetch(path, apiKey, options = {}) {
  const res = await fetch(`${PLUGGY_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-KEY": apiKey } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pluggy ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// /v2/transactions pagina por cursor: `next` vem como URL completa (ou null no fim),
// e o cursor é o parâmetro `after` dela.
async function fetchAllTransactions(apiKey, accountId, fromDate) {
  const all = [];
  let after = null;
  for (let guard = 0; guard < 50; guard++) {
    const query = `accountId=${accountId}&dateFrom=${fromDate}` +
      (after ? `&after=${encodeURIComponent(after)}` : "");
    const data = await pluggyFetch(`/v2/transactions?${query}`, apiKey);
    all.push(...(data.results || []));
    if (!data.next) break;
    after = new URL(data.next, PLUGGY_API).searchParams.get("after");
    if (!after) break;
  }
  return all;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const missing = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET", "PLUGGY_ITEM_IDS", "FIREBASE_SERVICE_ACCOUNT", "SYNC_UID"]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: `Variáveis de ambiente faltando: ${missing.join(", ")}` });
  }

  try {
    const { apiKey } = await pluggyFetch("/auth", null, {
      method: "POST",
      body: JSON.stringify({
        clientId: process.env.PLUGGY_CLIENT_ID,
        clientSecret: process.env.PLUGGY_CLIENT_SECRET,
      }),
    });

    const fromDate = new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // coleta contas e transações de todos os itens conectados
    const itemIds = process.env.PLUGGY_ITEM_IDS.split(",").map((s) => s.trim()).filter(Boolean);
    const incoming = [];
    let bankBalance = null;
    for (const itemId of itemIds) {
      const { results: accounts = [] } = await pluggyFetch(`/accounts?itemId=${itemId}`, apiKey);
      for (const account of accounts) {
        const isCredit = String(account.type || "").toUpperCase().includes("CREDIT");
        if (!isCredit && typeof account.balance === "number") bankBalance = account.balance;
        const txs = await fetchAllTransactions(apiKey, account.id, fromDate);
        for (const tx of txs) {
          const expense = isCredit ? tx.amount > 0 : tx.amount < 0;
          // no cartão, ignora estornos/pagamento de fatura pra não duplicar
          // com o débito que já aparece na conta corrente
          if (isCredit && !expense) continue;
          incoming.push({
            fitid: `pluggy-${tx.id}`,
            date: String(tx.date).slice(0, 10),
            desc: String(tx.description || "Sem descrição").replace(/\s+/g, " ").trim(),
            value: Math.abs(tx.amount),
            type: expense ? "despesa" : "receita",
          });
        }
      }
    }

    const db = getDb();
    const uid = process.env.SYNC_UID;
    const txRef = db.doc(`users/${uid}/data/transactions`);
    const mapRef = db.doc(`users/${uid}/data/categoryMap`);
    const accRef = db.doc(`users/${uid}/data/accounts`);

    const [txSnap, mapSnap, accSnap] = await Promise.all([txRef.get(), mapRef.get(), accRef.get()]);
    const existing = txSnap.exists ? txSnap.data().value || [] : [];
    const categoryMap = mapSnap.exists ? mapSnap.data().value || {} : {};
    const knownFitids = new Set(existing.map((t) => t.fitid).filter(Boolean));

    const newTxs = incoming
      .filter((t) => !knownFitids.has(t.fitid))
      .map((t) => ({
        id: t.fitid,
        type: t.type,
        desc: t.desc,
        value: t.value,
        category: categoryMap[normalizeDesc(t.desc)] || suggestCategory(t.desc, t.type),
        date: t.date,
        account: "Inter",
        notes: "",
        fitid: t.fitid,
      }));

    if (newTxs.length) {
      await txRef.set({ value: [...existing, ...newTxs] });
    }

    // saldo da conta "Inter" espelha o saldo real do banco
    if (bankBalance !== null && accSnap.exists) {
      const accounts = accSnap.data().value || [];
      const inter = accounts.find((a) => a.name === "Inter");
      if (inter) {
        await accRef.set({
          value: accounts.map((a) => (a.name === "Inter" ? { ...a, balance: bankBalance } : a)),
        });
      } else {
        await accRef.set({
          value: [...accounts, { id: Date.now(), name: "Inter", color: "#ff7a00", balance: bankBalance }],
        });
      }
    }

    return res.status(200).json({
      ok: true,
      fetched: incoming.length,
      imported: newTxs.length,
      bankBalance,
    });
  } catch (err) {
    console.error("pluggy-sync error:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
