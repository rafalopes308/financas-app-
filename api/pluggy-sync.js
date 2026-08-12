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

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { suggestCategory, normalizeDesc } from "../src/ofxParser.js";

const PLUGGY_API = "https://api.pluggy.ai";
const SYNC_WINDOW_DAYS = 45;

// esperar o refresh do item leva dezenas de segundos
export const config = { maxDuration: 60 };

function getDb() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(sa) });
  }
  return getFirestore();
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sem isso a Pluggy devolve o último snapshot, que pode ter dias de atraso.
// PATCH /items/{id} manda buscar dados novos no banco; o item fica em UPDATING
// até terminar, então esperamos (com teto de ~50s pra não estourar a função).
async function refreshItem(apiKey, itemId) {
  try {
    await pluggyFetch(`/items/${itemId}`, apiKey, { method: "PATCH", body: "{}" });
  } catch (err) {
    return `PATCH_FAILED: ${err.message}`;
  }
  for (let i = 0; i < 20; i++) {
    await sleep(2500);
    const item = await pluggyFetch(`/items/${itemId}`, apiKey);
    if (item.status !== "UPDATING") return item.status;
  }
  return "TIMEOUT";
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
    const refreshStatus = {};
    const investments = [];
    for (const itemId of itemIds) {
      refreshStatus[itemId] = await refreshItem(apiKey, itemId);

      // carteira: só o que ainda tem saldo (os resgatados voltam zerados)
      const { results: invs = [] } = await pluggyFetch(`/investments?itemId=${itemId}`, apiKey);
      for (const inv of invs) {
        const value = Number(inv.balance ?? 0);
        if (value > 0) investments.push({ name: inv.name || inv.code || "Investimento", value, type: inv.type || "" });
      }

      const { results: accounts = [] } = await pluggyFetch(`/accounts?itemId=${itemId}`, apiKey);
      for (const account of accounts) {
        const isCredit = String(account.type || "").toUpperCase().includes("CREDIT");
        if (!isCredit && typeof account.balance === "number") bankBalance = account.balance;
        const txs = await fetchAllTransactions(apiKey, account.id, fromDate);
        for (const tx of txs) {
          const expense = isCredit ? tx.amount > 0 : tx.amount < 0;
          // no cartão, ignora estornos e o crédito do pagamento da fatura
          if (isCredit && !expense) continue;
          const desc = String(tx.description || "Sem descrição").replace(/\s+/g, " ").trim();
          // o pagamento da fatura sai da conta corrente, mas as compras do cartão
          // já entram uma a uma — contar os dois dobraria a despesa do mês
          if (!isCredit && /pagamento.*fatura|fatura.*cart/i.test(desc)) continue;
          incoming.push({
            fitid: `pluggy-${tx.id}`,
            date: String(tx.date).slice(0, 10),
            desc,
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

    // carteira do banco fica num doc só dela: o app escreve os investimentos
    // manuais em outro doc, então um não sobrescreve o outro
    await db.doc(`users/${uid}/data/investmentsBank`).set({
      value: {
        total: investments.reduce((s, i) => s + i.value, 0),
        items: investments.sort((a, b) => b.value - a.value),
        updatedAt: new Date().toISOString(),
      },
    });

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
      refreshStatus,
    });
  } catch (err) {
    console.error("pluggy-sync error:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
