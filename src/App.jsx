import { useAuth } from "./AuthContext";
import Login from "./Login";
import { useState, useEffect, useRef } from "react";

// ─── helpers ───────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TODAY = new Date();

const CATEGORIES = {
  despesa:     ["Alimentação","Moradia","Transporte","Saúde","Lazer","Educação","Roupas","Assinaturas","Ferramentas","Esporte","Outros"],
  receita:     ["Salário","Freelance","Aluguel recebido","Dividendos","Outros"],
  investimento:["Tesouro Direto","Ações","Fundos","Cripto","Poupança","Previdência","Outros"],
};

const ICONS = {
  "Alimentação":"🍽️","Moradia":"🏠","Transporte":"🚗","Saúde":"💊","Lazer":"🎮",
  "Educação":"📚","Roupas":"👕","Assinaturas":"📱","Ferramentas":"🛠️","Esporte":"💚","Salário":"💼","Freelance":"💻",
  "Aluguel recebido":"🏢","Dividendos":"💰","Tesouro Direto":"🏛️","Ações":"📈",
  "Fundos":"🏦","Cripto":"₿","Poupança":"🐷","Previdência":"🔒","Outros":"📌",
};

const TYPE_CONFIG = {
  receita:     { color: "#16a34a", light: "#f0fdf4", label: "Receita",      icon: "⬆️" },
  despesa:     { color: "#dc2626", light: "#fef2f2", label: "Despesa",      icon: "⬇️" },
  investimento:{ color: "#7c3aed", light: "#f5f3ff", label: "Investimento", icon: "📈" },
};

const useLS = (key, def) => {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
};

// ─── main app ──────────────────────────────────────────────────────────────
export default function App() {
  const { user, logout } = useAuth();
  if (!user) return <Login />;
  const [transactions, setTransactions] = useLS("fin_transactions", []);
  const [accounts, setAccounts]         = useLS("fin_accounts", []);
  const [recurrings, setRecurrings]     = useLS("fin_recurrings", []);
  const [page, setPage]                 = useState("dashboard");
  const [month, setMonth]               = useState(TODAY.getMonth());
  const [year]                          = useState(TODAY.getFullYear());
  const [modal, setModal]               = useState(null); // null | "add" | "edit" | "account"
  const [editingId, setEditingId]       = useState(null);
  const [hideValues, setHideValues]     = useState(false);
  const [toast, setToast]               = useState(null);
  const [form, setForm]                 = useState(emptyForm());
  const [accountForm, setAccountForm]   = useState({ name: "", balance: "", color: "#22c55e" });
  const [recurringForm, setRecurringForm] = useState({ type: "despesa", desc: "", value: "", category: "", account: "", notes: "", day: "1" });
  const [editingRecurringId, setEditingRecurringId] = useState(null);

  function emptyForm() {
    return { type: "despesa", desc: "", value: "", category: "", date: today(), account: "", notes: "", recurring: false, reminderDay: "", reminderPaidMonth: "" };
  }
  function today() { return TODAY.toISOString().split("T")[0]; }

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // limpa duplicatas de recorrentes que possam ter sido criadas pelo bug de timezone
  useEffect(() => {
    setTransactions((prev) => {
      const seen = new Set();
      return prev.filter((t) => {
        if (!t.recurringId) return true;
        const d = new Date(t.date + "T12:00:00");
        const key = `${t.recurringId}-${d.getFullYear()}-${d.getMonth()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }, []);

  // inject recurrings for current month
  useEffect(() => {
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    recurrings.forEach((r) => {
      const dateForMonth = `${ym}-${String(r.day).padStart(2, "0")}`;
      setTransactions((prev) => {
        const alreadyExists = prev.some((t) => {
          if (t.recurringId !== r.id) return false;
          if (t.recurringMonth) return t.recurringMonth === ym;
          const d = new Date(t.date + "T12:00:00");
          return d.getMonth() === month && d.getFullYear() === year;
        });
        if (alreadyExists) return prev;
        return [...prev, { ...r, id: Date.now() + Math.random(), recurringId: r.id, date: dateForMonth, recurringMonth: ym }];
      });
    });
  }, [month, recurrings]);

  const monthTx = transactions.filter((t) => {
    const d = new Date(t.date + "T12:00:00");
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const sum = (type) => monthTx.filter((t) => t.type === type).reduce((s, t) => s + t.value, 0);
  const totalReceita     = sum("receita");
  const totalDespesa     = sum("despesa");
  const totalInvestimento= sum("investimento");
  const saldoGeral       = accounts.reduce((s, a) => s + a.balance, 0);
  const saldoMensal      = totalReceita - totalDespesa;
  const masked           = (v) => hideValues ? "R$ ••••••" : fmt(v);

  // ── save transaction ──────────────────────────────────────────────────────
  const saveTransaction = () => {
    if (!form.desc || !form.value || !form.category || !form.date) return showToast("Preencha todos os campos!", "error");
    const val = parseFloat(String(form.value).replace(",", "."));
    if (isNaN(val) || val <= 0) return showToast("Valor inválido!", "error");

    if (form.recurring) {
      const day = String(new Date(form.date + "T12:00:00").getDate()).padStart(2, "0");
      const rec = { id: Date.now(), type: form.type, desc: form.desc, value: val, category: form.category, account: form.account, notes: form.notes, day };
      setRecurrings((prev) => [...prev, rec]);
      showToast("Lançamento recorrente criado! 🔁");
      setForm(emptyForm());
      setModal(null);
      setEditingId(null);
      return;
    }

    if (editingId) {
      const old = transactions.find((t) => t.id === editingId);
      setTransactions((prev) => prev.map((t) => t.id === editingId ? { ...t, ...form, value: val } : t));
      setAccounts((prev) => prev.map((a) => {
        if (a.name === old.account && a.name !== form.account) {
          // reverter conta antiga
          return { ...a, balance: old.type === "receita" ? a.balance - old.value : a.balance + old.value };
        }
        if (a.name === form.account && a.name !== old.account) {
          // aplicar na conta nova
          return { ...a, balance: form.type === "receita" ? a.balance + val : a.balance - val };
        }
        if (a.name === old.account && a.name === form.account) {
          // mesma conta: reverter antigo e aplicar novo
          const reversed = old.type === "receita" ? a.balance - old.value : a.balance + old.value;
          return { ...a, balance: form.type === "receita" ? reversed + val : reversed - val };
        }
        return a;
      }));
      showToast("Lançamento atualizado! ✏️");
    } else {
      const newT = { id: Date.now(), ...form, value: val };
      setTransactions((prev) => [...prev, newT]);
      if (form.account) {
        setAccounts((prev) => prev.map((a) => a.name === form.account
          ? { ...a, balance: form.type === "receita" ? a.balance + val : a.balance - val }
          : a));
      }
      showToast(form.type === "receita" ? "Receita adicionada! 💚" : form.type === "investimento" ? "Investimento registrado! 📈" : "Despesa registrada! 🔴");
    }

    setForm(emptyForm());
    setModal(null);
    setEditingId(null);
  };

  const openEdit = (t) => {
    setForm({ type: t.type, desc: t.desc, value: String(t.value), category: t.category, date: t.date, account: t.account || "", notes: t.notes || "", recurring: false });
    setEditingId(t.id);
    setModal("add");
  };

  const deleteTx = (id) => {
    const t = transactions.find((x) => x.id === id);
    if (t?.account) {
      setAccounts((prev) => prev.map((a) => a.name === t.account
        ? { ...a, balance: t.type === "receita" ? a.balance - t.value : a.balance + t.value }
        : a));
    }
    setTransactions((prev) => prev.filter((x) => x.id !== id));
    showToast("Lançamento removido");
  };

  const saveAccount = () => {
    if (!accountForm.name) return;
    setAccounts((prev) => [...prev, { id: Date.now(), name: accountForm.name, color: accountForm.color, balance: parseFloat(accountForm.balance) || 0 }]);
    setAccountForm({ name: "", balance: "", color: "#22c55e" });
    setModal(null);
    showToast("Conta adicionada! 🏦");
  };

  const dismissReminder = (id) => {
    const currentYM = `${year}-${String(month + 1).padStart(2, "0")}`;
    setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, reminderPaidMonth: currentYM } : t));
    showToast("Marcado como pago ✓");
  };

  const deleteRecurring = (id) => {
    setRecurrings((prev) => prev.filter((r) => r.id !== id));
    showToast("Recorrente removido");
  };

  const openEditRecurring = (r) => {
    setRecurringForm({ type: r.type, desc: r.desc, value: String(r.value), category: r.category, account: r.account || "", notes: r.notes || "", day: r.day });
    setEditingRecurringId(r.id);
    setModal("editRecurring");
  };

  const saveRecurring = () => {
    if (!recurringForm.desc || !recurringForm.value || !recurringForm.category) return showToast("Preencha todos os campos!", "error");
    const val = parseFloat(String(recurringForm.value).replace(",", "."));
    if (isNaN(val) || val <= 0) return showToast("Valor inválido!", "error");
    setRecurrings((prev) => prev.map((r) => r.id === editingRecurringId ? { ...r, ...recurringForm, value: val } : r));
    setModal(null);
    setEditingRecurringId(null);
    showToast("Recorrente atualizado! ✏️");
  };

  const greet = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

  // ── 6-month chart data ────────────────────────────────────────────────────
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = (month - 5 + i + 12) % 12;
    const y = month - 5 + i < 0 ? year - 1 : year;
    const txs = transactions.filter((t) => { const d = new Date(t.date + "T12:00:00"); return d.getMonth() === m && d.getFullYear() === y; });
    return {
      label: MONTHS[m],
      receita: txs.filter((t) => t.type === "receita").reduce((s, t) => s + t.value, 0),
      despesa: txs.filter((t) => t.type === "despesa").reduce((s, t) => s + t.value, 0),
      investimento: txs.filter((t) => t.type === "investimento").reduce((s, t) => s + t.value, 0),
    };
  });

  // ── comparativo mês anterior ──────────────────────────────────────────────
  const prevMonth = (month - 1 + 12) % 12;
  const prevYear  = month === 0 ? year - 1 : year;
  const prevTx    = transactions.filter((t) => { const d = new Date(t.date + "T12:00:00"); return d.getMonth() === prevMonth && d.getFullYear() === prevYear; });
  const prevCats  = prevTx.filter((t) => t.type === "despesa").reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.value; return acc; }, {});
  const currCats  = monthTx.filter((t) => t.type === "despesa").reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.value; return acc; }, {});
  const comparativo = Object.keys({ ...prevCats, ...currCats }).map((cat) => {
    const prev = prevCats[cat] || 0; const curr = currCats[cat] || 0;
    const diff = prev > 0 ? ((curr - prev) / prev) * 100 : null;
    return { cat, prev, curr, diff };
  }).filter((x) => x.curr > 0 || x.prev > 0).sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));

  const gastosPorCat = monthTx.filter((t) => t.type === "despesa").reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.value; return acc; }, {});
  const maxCat = Math.max(...Object.values(gastosPorCat), 1);
  const topGastos = [...monthTx.filter((t) => t.type === "despesa")].sort((a, b) => b.value - a.value).slice(0, 5);

  const todayStr = TODAY.toISOString().split("T")[0];
  const currentYM = `${year}-${String(month + 1).padStart(2, "0")}`;
  const lembretes = transactions
    .filter((t) => t.reminderDay && t.reminderPaidMonth !== currentYM)
    .map((t) => {
      const reminderDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(t.reminderDay).padStart(2, "0")}`;
      const diff = Math.ceil((new Date(reminderDate + "T12:00:00") - new Date(todayStr + "T12:00:00")) / 86400000);
      return { ...t, diff, reminderDate };
    })
    .sort((a, b) => a.diff - b.diff);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#f2f4f1", minHeight: "100vh", color: "#1a1a1a" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "error" ? "#991b1b" : "#14532d", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", animation: "slideIn .3s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 224, background: "#fff", borderRight: "1px solid #e5e9e2", display: "flex", flexDirection: "column", zIndex: 100 }}>
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid #e5e9e2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#22c55e,#15803d)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>💰</div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#15803d", letterSpacing: -0.3 }}>FinançasPro</span>
          </div>
        </div>
        <nav style={{ flex: 1, padding: "12px 0" }}>
          {[
            { id: "dashboard",    icon: "🏠", label: "Dashboard"    },
            { id: "lancamentos",  icon: "📋", label: "Lançamentos"  },
            { id: "recorrentes",  icon: "🔁", label: "Recorrentes"  },
            { id: "contas",       icon: "🏦", label: "Contas"       },
            { id: "relatorios",   icon: "📊", label: "Relatórios"   },
          ].map((item) => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: 11, width: "100%",
              padding: "11px 20px", background: page === item.id ? "#f0fdf4" : "transparent",
              border: "none", borderLeft: `3px solid ${page === item.id ? "#22c55e" : "transparent"}`,
              cursor: "pointer", fontSize: 14, fontWeight: page === item.id ? 600 : 400,
              color: page === item.id ? "#15803d" : "#555", textAlign: "left", transition: "all .15s",
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e9e2", fontSize: 11, color: "#bbb", textAlign: "center" }}>
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </aside>

      {/* Main */}
      <main style={{ marginLeft: 224, padding: "32px 40px", minHeight: "100vh" }}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{greet()}</p>
            <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
              {{ dashboard: "Visão Geral", lancamentos: "Lançamentos", recorrentes: "Recorrentes", contas: "Contas", relatorios: "Relatórios" }[page]}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => setMonth((m) => (m - 1 + 12) % 12)} style={navBtnStyle}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 600, minWidth: 90, textAlign: "center" }}>{MONTHS[month]} {year}</span>
            <button onClick={() => setMonth((m) => (m + 1) % 12)} style={navBtnStyle}>›</button>
            <button onClick={() => setHideValues(!hideValues)} style={{ ...navBtnStyle, marginLeft: 6 }} title="Ocultar valores">{hideValues ? "👁️" : "🙈"}</button>
            <div style={{ position: "relative", marginLeft: 2 }}>
              <button onClick={() => setPage("dashboard")} style={{ ...navBtnStyle }} title="Lembretes">🔔</button>
              {lembretes.length > 0 && (
                <span style={{ position: "absolute", top: -5, right: -5, background: lembretes.some((l) => l.diff <= 0) ? "#dc2626" : "#f59e0b", color: "#fff", borderRadius: "50%", width: 17, height: 17, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  {lembretes.length}
                </span>
              )}
            </div>
            <button onClick={() => { setForm(emptyForm()); setEditingId(null); setModal("add"); }} style={{ marginLeft: 6, padding: "9px 18px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
              + Lançamento
            </button>
          </div>
        </header>

        {page === "dashboard"   && <Dashboard totalReceita={totalReceita} totalDespesa={totalDespesa} totalInvestimento={totalInvestimento} saldoGeral={saldoGeral} saldoMensal={saldoMensal} accounts={accounts} topGastos={topGastos} gastosPorCat={gastosPorCat} maxCat={maxCat} masked={masked} setModal={setModal} setForm={setForm} emptyForm={emptyForm} comparativo={comparativo} chartData={chartData} monthTx={monthTx} month={month} MONTHS={MONTHS} lembretes={lembretes} dismissReminder={dismissReminder} />}
        {page === "lancamentos" && <Lancamentos monthTx={monthTx} masked={masked} deleteTx={deleteTx} openEdit={openEdit} />}
        {page === "recorrentes" && <Recorrentes recurrings={recurrings} deleteRecurring={deleteRecurring} openEditRecurring={openEditRecurring} masked={masked} />}
        {page === "contas"      && <Contas accounts={accounts} setAccounts={setAccounts} masked={masked} setModal={setModal} />}
        {page === "relatorios"  && <Relatorios monthTx={monthTx} totalReceita={totalReceita} totalDespesa={totalDespesa} totalInvestimento={totalInvestimento} masked={masked} gastosPorCat={gastosPorCat} maxCat={maxCat} chartData={chartData} comparativo={comparativo} month={month} MONTHS={MONTHS} />}
      </main>

      {/* Modal Add/Edit */}
      {(modal === "add") && (
        <Overlay onClose={() => { setModal(null); setEditingId(null); setForm(emptyForm()); }}>
          <h2 style={{ margin: "0 0 20px", fontSize: 19, fontWeight: 700 }}>{editingId ? "✏️ Editar Lançamento" : "➕ Novo Lançamento"}</h2>

          {/* Type tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={() => setForm((f) => ({ ...f, type: key, category: "" }))} style={{
                flex: 1, padding: "9px 4px", border: `2px solid ${form.type === key ? cfg.color : "#e5e7eb"}`,
                borderRadius: 10, background: form.type === key ? cfg.light : "#fafafa",
                color: form.type === key ? cfg.color : "#888", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}>{cfg.icon} {cfg.label}</button>
            ))}
          </div>

          <input placeholder="Descrição *" value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} style={inputSt} />
          <input type="number" placeholder="Valor (R$) *" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} style={inputSt} />
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={inputSt}>
            <option value="">Categoria *</option>
            {CATEGORIES[form.type]?.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={inputSt} />
          <select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} style={inputSt}>
            <option value="">Conta (opcional)</option>
            {accounts.map((a) => <option key={a.id}>{a.name}</option>)}
          </select>
          <textarea placeholder="Notas / observações (ex: parcelado em 3x)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ ...inputSt, resize: "vertical", minHeight: 64 }} />

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.reminderDay} onChange={(e) => setForm((f) => ({ ...f, reminderDay: e.target.checked ? "10" : "", reminderPaidMonth: "" }))} style={{ width: 16, height: 16, accentColor: "#f59e0b" }} />
              <span>🔔 Lembrete mensal de pagamento</span>
            </label>
            {form.reminderDay && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 10, padding: "10px 14px" }}>
                <span style={{ fontSize: 14, color: "#92400e", whiteSpace: "nowrap" }}>Todo dia</span>
                <input type="number" min="1" max="31" value={form.reminderDay} onChange={(e) => setForm((f) => ({ ...f, reminderDay: e.target.value }))} style={{ width: 64, padding: "6px 10px", border: "1px solid #f59e0b", borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: "center", outline: "none", background: "#fff" }} />
                <span style={{ fontSize: 14, color: "#92400e", whiteSpace: "nowrap" }}>do mês</span>
              </div>
            )}
          </div>

          {!editingId && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={form.recurring} onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#22c55e" }} />
              <span>🔁 Lançamento recorrente (todo mês)</span>
            </label>
          )}

          <button onClick={saveTransaction} style={{ width: "100%", padding: 13, background: TYPE_CONFIG[form.type].color, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans',sans-serif", marginBottom: 8 }}>
            {editingId ? "Salvar alterações" : `Adicionar ${TYPE_CONFIG[form.type].label}`}
          </button>
          <button onClick={() => { setModal(null); setEditingId(null); setForm(emptyForm()); }} style={{ width: "100%", padding: 11, background: "transparent", border: "1px solid #e5e7eb", borderRadius: 10, cursor: "pointer", fontSize: 14, color: "#888", fontFamily: "'DM Sans',sans-serif" }}>Cancelar</button>
        </Overlay>
      )}

      {/* Modal Edit Recurring */}
      {modal === "editRecurring" && (
        <Overlay onClose={() => { setModal(null); setEditingRecurringId(null); }}>
          <h2 style={{ margin: "0 0 20px", fontSize: 19, fontWeight: 700 }}>✏️ Editar Recorrente</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={() => setRecurringForm((f) => ({ ...f, type: key, category: "" }))} style={{
                flex: 1, padding: "9px 4px", border: `2px solid ${recurringForm.type === key ? cfg.color : "#e5e7eb"}`,
                borderRadius: 10, background: recurringForm.type === key ? cfg.light : "#fafafa",
                color: recurringForm.type === key ? cfg.color : "#888", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}>{cfg.icon} {cfg.label}</button>
            ))}
          </div>
          <input placeholder="Descrição *" value={recurringForm.desc} onChange={(e) => setRecurringForm((f) => ({ ...f, desc: e.target.value }))} style={inputSt} />
          <input type="number" placeholder="Valor (R$) *" value={recurringForm.value} onChange={(e) => setRecurringForm((f) => ({ ...f, value: e.target.value }))} style={inputSt} />
          <select value={recurringForm.category} onChange={(e) => setRecurringForm((f) => ({ ...f, category: e.target.value }))} style={inputSt}>
            <option value="">Categoria *</option>
            {CATEGORIES[recurringForm.type]?.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 14, color: "#555", whiteSpace: "nowrap" }}>Todo dia</label>
            <input type="number" min="1" max="31" value={recurringForm.day} onChange={(e) => setRecurringForm((f) => ({ ...f, day: e.target.value }))} style={{ ...inputSt, marginBottom: 0, width: 80 }} />
          </div>
          <select value={recurringForm.account} onChange={(e) => setRecurringForm((f) => ({ ...f, account: e.target.value }))} style={inputSt}>
            <option value="">Conta (opcional)</option>
            {accounts.map((a) => <option key={a.id}>{a.name}</option>)}
          </select>
          <textarea placeholder="Notas / observações" value={recurringForm.notes} onChange={(e) => setRecurringForm((f) => ({ ...f, notes: e.target.value }))} style={{ ...inputSt, resize: "vertical", minHeight: 64 }} />
          <button onClick={saveRecurring} style={{ width: "100%", padding: 13, background: TYPE_CONFIG[recurringForm.type].color, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans',sans-serif", marginBottom: 8 }}>Salvar alterações</button>
          <button onClick={() => { setModal(null); setEditingRecurringId(null); }} style={{ width: "100%", padding: 11, background: "transparent", border: "1px solid #e5e7eb", borderRadius: 10, cursor: "pointer", fontSize: 14, color: "#888", fontFamily: "'DM Sans',sans-serif" }}>Cancelar</button>
        </Overlay>
      )}

      {/* Modal Account */}
      {modal === "account" && (
        <Overlay onClose={() => setModal(null)}>
          <h2 style={{ margin: "0 0 20px", fontSize: 19, fontWeight: 700 }}>🏦 Nova Conta</h2>
          <input placeholder="Nome da conta *" value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} style={inputSt} />
          <input type="number" placeholder="Saldo inicial" value={accountForm.balance} onChange={(e) => setAccountForm((f) => ({ ...f, balance: e.target.value }))} style={inputSt} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <label style={{ fontSize: 14, color: "#555" }}>Cor:</label>
            <input type="color" value={accountForm.color} onChange={(e) => setAccountForm((f) => ({ ...f, color: e.target.value }))} style={{ width: 48, height: 36, border: "none", borderRadius: 8, cursor: "pointer" }} />
          </div>
          <button onClick={saveAccount} style={{ width: "100%", padding: 13, background: "#22c55e", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans',sans-serif", marginBottom: 8 }}>Adicionar Conta</button>
          <button onClick={() => setModal(null)} style={{ width: "100%", padding: 11, background: "transparent", border: "1px solid #e5e7eb", borderRadius: 10, cursor: "pointer", fontSize: 14, color: "#888", fontFamily: "'DM Sans',sans-serif" }}>Cancelar</button>
        </Overlay>
      )}

      <LoganMascot />

      <style>{`
        @keyframes slideIn  { from { transform:translateX(16px);opacity:0 } to { transform:translateX(0);opacity:1 } }
        @keyframes fadeUp   { from { transform:translateY(14px);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes loganBob { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-5px) } }
        @keyframes popIn    { from { transform:scale(.82);opacity:0 } to { transform:scale(1);opacity:1 } }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:5px } ::-webkit-scrollbar-thumb { background:#d1d5db;border-radius:3px }
      `}</style>
    </div>
  );
}

// ─── overlay ───────────────────────────────────────────────────────────────
function Overlay({ children, onClose }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200 }}>
      <div style={{ position:"relative",background:"#fff",borderRadius:20,padding:32,width:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.22)" }}>
        <button onClick={onClose} style={{ position:"absolute",top:16,right:16,background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#bbb",lineHeight:1,padding:4,borderRadius:6 }}>✕</button>
        {children}
      </div>
    </div>
  );
}

// ─── card ──────────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background:"#fff",borderRadius:16,padding:"20px 22px",border:"1px solid #e5e9e2",...style }}>{children}</div>;
}

function SectionTitle({ color="#22c55e", children }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
      <div style={{ width:4,height:18,background:color,borderRadius:2 }} />
      <span style={{ fontWeight:700,fontSize:15 }}>{children}</span>
    </div>
  );
}

// ─── summary card ──────────────────────────────────────────────────────────
function SCard({ title, value, color, bg }) {
  return (
    <div style={{ background:bg,borderRadius:16,padding:"18px 20px" }}>
      <p style={{ margin:"0 0 6px",fontSize:11,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:.8 }}>{title}</p>
      <p style={{ margin:0,fontSize:22,fontWeight:700,color,fontFamily:"'DM Mono',monospace" }}>{value}</p>
    </div>
  );
}

// ─── tx row ────────────────────────────────────────────────────────────────
function TxRow({ t, masked, deleteTx, openEdit }) {
  const cfg = TYPE_CONFIG[t.type];
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #f3f4f6" }}>
      <div style={{ display:"flex",alignItems:"center",gap:12 }}>
        <div style={{ width:40,height:40,borderRadius:12,background:cfg.light,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>
          {ICONS[t.category] || "📌"}
        </div>
        <div>
          <p style={{ margin:0,fontWeight:600,fontSize:14 }}>{t.desc}</p>
          <p style={{ margin:0,fontSize:11,color:"#aaa" }}>
            {t.category} · {t.account || "—"} · {new Date(t.date+"T12:00:00").toLocaleDateString("pt-BR")}
            {t.recurringId && <span style={{ marginLeft:6,background:"#f0fdf4",color:"#15803d",padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:600 }}>🔁 recorrente</span>}
          </p>
          {t.notes && <p style={{ margin:"2px 0 0",fontSize:11,color:"#888",fontStyle:"italic" }}>📝 {t.notes}</p>}
        </div>
      </div>
      <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
        <span style={{ fontWeight:700,fontFamily:"'DM Mono',monospace",fontSize:14,color:cfg.color }}>
          {t.type === "receita" ? "+" : "-"}{masked(t.value)}
        </span>
        <button onClick={() => openEdit(t)} style={iconBtn} title="Editar">✏️</button>
        <button onClick={() => deleteTx(t.id)} style={iconBtn} title="Excluir">🗑️</button>
      </div>
    </div>
  );
}

// ─── donut chart ──────────────────────────────────────────────────────────
const DONUT_COLORS = ["#ef4444","#f97316","#eab308","#16a34a","#06b6d4","#6366f1","#ec4899","#8b5cf6","#14b8a6","#f59e0b","#84cc16"];
const CATEGORY_COLOR_OVERRIDES = { "Esporte": "#86efac" };

function DonutChart({ gastosPorCat, totalDespesa, masked }) {
  const entries = Object.entries(gastosPorCat).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p style={{ color:"#ccc",fontSize:14,textAlign:"center",padding:"30px 0" }}>Sem gastos no período</p>;
  }
  const r = 80, cx = 100, cy = 100, circ = 2 * Math.PI * r;
  let cum = 0;
  const slices = entries.map(([cat, val], i) => {
    const pct = val / totalDespesa;
    const len = pct * circ;
    const s = { cat, val, pct, dashArray: `${len} ${circ}`, dashOffset: circ / 4 - cum, color: CATEGORY_COLOR_OVERRIDES[cat] ?? DONUT_COLORS[i % DONUT_COLORS.length] };
    cum += len;
    return s;
  });
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"center",marginBottom:18 }}>
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="26" />
          {slices.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={s.color} strokeWidth="26"
              strokeDasharray={s.dashArray}
              strokeDashoffset={s.dashOffset}
            />
          ))}
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize="11" fill="#bbb" fontFamily="'DM Sans',sans-serif" fontWeight="600">DESPESAS</text>
          <text x={cx} y={cy + 11} textAnchor="middle" fontSize="13" fill="#1a1a1a" fontFamily="'DM Mono',monospace" fontWeight="700">{masked(totalDespesa)}</text>
        </svg>
      </div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
        {slices.map((s) => (
          <div key={s.cat} style={{ background:s.color,borderRadius:10,padding:"7px 12px",display:"flex",alignItems:"center",gap:8,flex:"1 1 auto",minWidth:120 }}>
            <span style={{ fontSize:16 }}>{ICONS[s.cat]||"📌"}</span>
            <div>
              <p style={{ margin:0,fontSize:11,fontWeight:700,color:"#fff",lineHeight:1.3 }}>{s.cat}</p>
              <p style={{ margin:0,fontSize:10,color:"rgba(255,255,255,0.8)",fontFamily:"'DM Mono',monospace" }}>{(s.pct*100).toFixed(0)}% · {masked(s.val)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── mini bar chart ────────────────────────────────────────────────────────
function BarChart({ data }) {
  const maxVal = Math.max(...data.flatMap((d) => [d.receita, d.despesa, d.investimento]), 1);
  return (
    <div style={{ display:"flex",alignItems:"flex-end",gap:12,height:120,padding:"0 4px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3 }}>
          <div style={{ width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:96 }}>
            {[
              { val:d.receita,      color:"#22c55e" },
              { val:d.despesa,      color:"#ef4444" },
              { val:d.investimento, color:"#7c3aed" },
            ].map((bar, j) => (
              <div key={j} style={{ flex:1,height:`${(bar.val/maxVal)*100}%`,background:bar.color,borderRadius:"3px 3px 0 0",minHeight:bar.val>0?3:0,transition:"height .6s ease",opacity:.85 }} />
            ))}
          </div>
          <span style={{ fontSize:10,color:"#aaa",fontWeight:500 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── pages ─────────────────────────────────────────────────────────────────
function Dashboard({ totalReceita, totalDespesa, totalInvestimento, saldoGeral, saldoMensal, accounts, topGastos, gastosPorCat, maxCat, masked, setModal, setForm, emptyForm, comparativo, chartData, monthTx, month, MONTHS, lembretes, dismissReminder }) {
  return (
    <div style={{ animation:"fadeUp .4s ease",display:"flex",flexDirection:"column",gap:20 }}>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16 }}>
        <SCard title="Receitas" value={masked(totalReceita)} color="#16a34a" bg="#f0fdf4" />
        <SCard title="Despesas" value={masked(totalDespesa)} color="#dc2626" bg="#fef2f2" />
        <SCard title="Investimentos" value={masked(totalInvestimento)} color="#7c3aed" bg="#f5f3ff" />
        <SCard title="Saldo do mês" value={masked(saldoMensal)} color={saldoMensal>=0?"#15803d":"#dc2626"} bg="#fff" />
      </div>

      {/* quick actions */}
      <Card>
        <SectionTitle>Acesso Rápido</SectionTitle>
        <div style={{ display:"flex",gap:12 }}>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <button key={key} onClick={() => { setForm({ ...emptyForm(), type: key }); setModal("add"); }} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 8px",background:cfg.light,border:`1px solid ${cfg.color}22`,borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,color:cfg.color,fontFamily:"'DM Sans',sans-serif" }}>
              <span style={{ fontSize:22 }}>{cfg.icon}</span>{cfg.label}
            </button>
          ))}
          <button onClick={() => setModal("account")} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 8px",background:"#f8fafc",border:"1px solid #e5e7eb",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,color:"#555",fontFamily:"'DM Sans',sans-serif" }}>
            <span style={{ fontSize:22 }}>🏦</span>Nova Conta
          </button>
        </div>
      </Card>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
        {/* donut chart */}
        <Card>
          <SectionTitle color="#ef4444">Gastos por Categoria</SectionTitle>
          <DonutChart gastosPorCat={gastosPorCat} totalDespesa={totalDespesa} masked={masked} />
        </Card>

        {/* top gastos */}
        <Card>
          <SectionTitle color="#ef4444">Maiores Gastos</SectionTitle>
          {topGastos.length === 0
            ? <p style={{ color:"#ccc",fontSize:14,textAlign:"center",padding:"20px 0" }}>Sem gastos no período</p>
            : topGastos.map((t) => (
              <div key={t.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f3f4f6" }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:18 }}>{ICONS[t.category]||"📌"}</span>
                  <div>
                    <p style={{ margin:0,fontSize:13,fontWeight:600 }}>{t.desc}</p>
                    <p style={{ margin:0,fontSize:11,color:"#aaa" }}>{t.category}</p>
                  </div>
                </div>
                <span style={{ fontWeight:700,color:"#dc2626",fontFamily:"'DM Mono',monospace",fontSize:13 }}>{masked(t.value)}</span>
              </div>
            ))
          }
        </Card>
      </div>

      {/* chart */}
      <Card>
        <SectionTitle color="#6366f1">Evolução dos Últimos 6 Meses</SectionTitle>
        <BarChart data={chartData} />
        <div style={{ display:"flex",gap:16,marginTop:10,justifyContent:"center" }}>
          {[{ color:"#22c55e",label:"Receitas" },{ color:"#ef4444",label:"Despesas" },{ color:"#7c3aed",label:"Investimentos" }].map((l) => (
            <div key={l.label} style={{ display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#888" }}>
              <div style={{ width:10,height:10,borderRadius:2,background:l.color }} />{l.label}
            </div>
          ))}
        </div>
      </Card>

      {/* lembretes */}
      {lembretes.length > 0 && (
        <Card>
          <SectionTitle color="#f59e0b">🔔 Lembretes de Pagamento</SectionTitle>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {lembretes.map((t) => {
              const overdue = t.diff < 0;
              const today   = t.diff === 0;
              const color   = overdue ? "#dc2626" : today ? "#d97706" : "#2563eb";
              const bg      = overdue ? "#fef2f2"  : today ? "#fffbeb" : "#eff6ff";
              const label   = overdue ? `Vencido há ${Math.abs(t.diff)} dia${Math.abs(t.diff)>1?"s":""}` : today ? "Vence hoje!" : `Em ${t.diff} dia${t.diff>1?"s":""}`;
              return (
                <div key={t.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:bg,borderRadius:12,border:`1px solid ${color}22` }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <span style={{ fontSize:20 }}>{ICONS[t.category]||"📌"}</span>
                    <div>
                      <p style={{ margin:0,fontWeight:600,fontSize:14 }}>{t.desc}</p>
                      <p style={{ margin:0,fontSize:11,color:"#aaa" }}>{t.category} · Vence dia {t.reminderDay} todo mês</p>
                    </div>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <span style={{ fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:20,background:color,color:"#fff" }}>{label}</span>
                    <span style={{ fontWeight:700,fontFamily:"'DM Mono',monospace",fontSize:13,color }}>{fmt(t.value)}</span>
                    <button onClick={() => dismissReminder(t.id)} title="Marcar como pago" style={{ background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,cursor:"pointer",fontSize:13,padding:"4px 10px",color:"#15803d",fontWeight:600,fontFamily:"'DM Sans',sans-serif" }}>✓ Pago</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* comparativo */}
      {comparativo.length > 0 && (
        <Card>
          <SectionTitle color="#f59e0b">Comparativo com {MONTHS[(month-1+12)%12]}</SectionTitle>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {comparativo.slice(0,5).map(({ cat, prev, curr, diff }) => (
              <div key={cat} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"#fafafa",borderRadius:10 }}>
                <span style={{ fontSize:13,fontWeight:500 }}>{ICONS[cat]||"📌"} {cat}</span>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <span style={{ fontSize:12,color:"#aaa" }}>{fmt(prev)}</span>
                  <span style={{ fontSize:16 }}>→</span>
                  <span style={{ fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace" }}>{fmt(curr)}</span>
                  {diff !== null && (
                    <span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,background:diff>0?"#fef2f2":"#f0fdf4",color:diff>0?"#dc2626":"#16a34a" }}>
                      {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Lancamentos({ monthTx, masked, deleteTx, openEdit }) {
  const sorted = [...monthTx].sort((a, b) => new Date(b.date) - new Date(a.date));
  const [filter, setFilter] = useState("todos");
  const filtered = filter === "todos" ? sorted : sorted.filter((t) => t.type === filter);
  return (
    <div style={{ animation:"fadeUp .4s ease" }}>
      <div style={{ display:"flex",gap:8,marginBottom:20 }}>
        {[{ v:"todos",l:"Todos" }, ...Object.entries(TYPE_CONFIG).map(([k,c])=>({ v:k,l:c.label }))].map(({ v,l }) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding:"7px 16px",borderRadius:20,border:`1px solid ${filter===v?"#22c55e":"#e5e7eb"}`,background:filter===v?"#f0fdf4":"#fff",color:filter===v?"#15803d":"#555",fontWeight:filter===v?600:400,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>{l}</button>
        ))}
      </div>
      <Card>
        {filtered.length === 0
          ? <p style={{ textAlign:"center",color:"#ccc",padding:40 }}>Nenhum lançamento</p>
          : filtered.map((t) => <TxRow key={t.id} t={t} masked={masked} deleteTx={deleteTx} openEdit={openEdit} />)
        }
      </Card>
    </div>
  );
}

function Recorrentes({ recurrings, deleteRecurring, openEditRecurring, masked }) {
  return (
    <div style={{ animation:"fadeUp .4s ease" }}>
      <Card>
        <SectionTitle color="#22c55e">Lançamentos Recorrentes</SectionTitle>
        {recurrings.length === 0
          ? <p style={{ textAlign:"center",color:"#ccc",padding:40 }}>Nenhum lançamento recorrente.<br/><span style={{ fontSize:13 }}>Marque "Recorrente" ao criar um lançamento.</span></p>
          : recurrings.map((r) => {
            const cfg = TYPE_CONFIG[r.type];
            return (
              <div key={r.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #f3f4f6" }}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <div style={{ width:40,height:40,borderRadius:12,background:cfg.light,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>{ICONS[r.category]||"📌"}</div>
                  <div>
                    <p style={{ margin:0,fontWeight:600,fontSize:14 }}>{r.desc}</p>
                    <p style={{ margin:0,fontSize:11,color:"#aaa" }}>{r.category} · Todo dia {r.day}</p>
                  </div>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontWeight:700,fontFamily:"'DM Mono',monospace",fontSize:14,color:cfg.color }}>{masked(r.value)}</span>
                  <button onClick={() => openEditRecurring(r)} style={iconBtn} title="Editar">✏️</button>
                  <button onClick={() => deleteRecurring(r.id)} style={iconBtn} title="Remover">🗑️</button>
                </div>
              </div>
            );
          })
        }
      </Card>
    </div>
  );
}

function Contas({ accounts, setAccounts, masked, setModal }) {
  return (
    <div style={{ animation:"fadeUp .4s ease" }}>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
        {accounts.map((a) => (
          <Card key={a.id} style={{ borderTop:`4px solid ${a.color}` }}>
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
              <div style={{ width:48,height:48,borderRadius:14,background:a.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#fff",fontWeight:700 }}>{a.name[0]}</div>
              <div>
                <p style={{ margin:0,fontWeight:700,fontSize:16 }}>{a.name}</p>
                <p style={{ margin:0,fontSize:12,color:"#aaa" }}>Conta manual</p>
              </div>
            </div>
            <p style={{ margin:0,fontSize:12,color:"#aaa" }}>Saldo atual</p>
            <p style={{ margin:"4px 0 0",fontSize:24,fontWeight:700,fontFamily:"'DM Mono',monospace",color:a.balance>=0?"#15803d":"#dc2626" }}>{masked(a.balance)}</p>
          </Card>
        ))}
        <div onClick={() => setModal("account")} style={{ border:"2px dashed #e5e7eb",borderRadius:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,minHeight:140,transition:"border-color .15s" }}
          onMouseEnter={(e)=>e.currentTarget.style.borderColor="#22c55e"}
          onMouseLeave={(e)=>e.currentTarget.style.borderColor="#e5e7eb"}
        >
          <span style={{ fontSize:28 }}>🏦</span>
          <span style={{ fontSize:14,color:"#aaa",fontWeight:500 }}>Adicionar conta</span>
        </div>
      </div>
    </div>
  );
}

function Relatorios({ monthTx, totalReceita, totalDespesa, totalInvestimento, masked, gastosPorCat, maxCat, chartData, comparativo, month, MONTHS }) {
  const saldo = totalReceita - totalDespesa - totalInvestimento;
  const savingsRate = totalReceita > 0 ? (((totalReceita - totalDespesa) / totalReceita) * 100).toFixed(0) : 0;
  const investRate  = totalReceita > 0 ? ((totalInvestimento / totalReceita) * 100).toFixed(0) : 0;
  return (
    <div style={{ animation:"fadeUp .4s ease",display:"flex",flexDirection:"column",gap:20 }}>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16 }}>
        <SCard title="Receitas" value={masked(totalReceita)} color="#16a34a" bg="#f0fdf4" />
        <SCard title="Despesas" value={masked(totalDespesa)} color="#dc2626" bg="#fef2f2" />
        <SCard title="Investimentos" value={masked(totalInvestimento)} color="#7c3aed" bg="#f5f3ff" />
        <SCard title="Taxa de poupança" value={`${savingsRate}%`} color="#0891b2" bg="#f0f9ff" />
      </div>

      <Card>
        <SectionTitle color="#6366f1">Evolução 6 Meses</SectionTitle>
        <BarChart data={chartData} />
        <div style={{ display:"flex",gap:16,marginTop:10,justifyContent:"center" }}>
          {[{ color:"#22c55e",label:"Receitas" },{ color:"#ef4444",label:"Despesas" },{ color:"#7c3aed",label:"Investimentos" }].map((l) => (
            <div key={l.label} style={{ display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#888" }}>
              <div style={{ width:10,height:10,borderRadius:2,background:l.color }} />{l.label}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
        <Card>
          <SectionTitle color="#ef4444">Gastos por Categoria</SectionTitle>
          {Object.keys(gastosPorCat).length === 0
            ? <p style={{ color:"#ccc",fontSize:14,textAlign:"center",padding:20 }}>Sem despesas</p>
            : Object.entries(gastosPorCat).sort((a,b)=>b[1]-a[1]).map(([cat,val]) => {
              const pct = totalDespesa > 0 ? ((val/totalDespesa)*100).toFixed(1) : 0;
              return (
                <div key={cat} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                    <span style={{ fontSize:13,fontWeight:500 }}>{ICONS[cat]||"📌"} {cat}</span>
                    <div><span style={{ fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#dc2626" }}>{fmt(val)}</span><span style={{ fontSize:11,color:"#bbb",marginLeft:6 }}>{pct}%</span></div>
                  </div>
                  <div style={{ height:6,background:"#f3f4f6",borderRadius:3 }}><div style={{ height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#ef4444,#f97316)",borderRadius:3,transition:"width .7s ease" }} /></div>
                </div>
              );
            })
          }
        </Card>

        <Card>
          <SectionTitle color="#f59e0b">Comparativo {MONTHS[(month-1+12)%12]} → {MONTHS[month]}</SectionTitle>
          {comparativo.length === 0
            ? <p style={{ color:"#ccc",fontSize:14,textAlign:"center",padding:20 }}>Sem dados para comparar</p>
            : comparativo.map(({ cat,prev,curr,diff }) => (
              <div key={cat} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"#fafafa",borderRadius:10,marginBottom:8 }}>
                <span style={{ fontSize:13,fontWeight:500 }}>{ICONS[cat]||"📌"} {cat}</span>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:11,color:"#aaa" }}>{fmt(prev)}</span>
                  <span style={{ fontSize:14 }}>→</span>
                  <span style={{ fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace" }}>{fmt(curr)}</span>
                  {diff !== null && <span style={{ fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:20,background:diff>0?"#fef2f2":"#f0fdf4",color:diff>0?"#dc2626":"#16a34a" }}>{diff>0?"▲":"▼"}{Math.abs(diff).toFixed(0)}%</span>}
                </div>
              </div>
            ))
          }
        </Card>
      </div>

      <Card>
        <SectionTitle color="#0891b2">Resumo do Mês</SectionTitle>
        <div style={{ display:"flex",gap:16 }}>
          {[
            { label:"Receitas",val:totalReceita,color:"#16a34a",bg:"#f0fdf4" },
            { label:"Despesas",val:totalDespesa,color:"#dc2626",bg:"#fef2f2" },
            { label:"Investimentos",val:totalInvestimento,color:"#7c3aed",bg:"#f5f3ff" },
            { label:"Saldo livre",val:saldo,color:saldo>=0?"#16a34a":"#dc2626",bg:saldo>=0?"#f0fdf4":"#fef2f2" },
          ].map((item) => (
            <div key={item.label} style={{ flex:1,textAlign:"center",padding:16,background:item.bg,borderRadius:12 }}>
              <p style={{ margin:"0 0 6px",fontSize:12,color:"#888" }}>{item.label}</p>
              <p style={{ margin:0,fontSize:18,fontWeight:700,color:item.color,fontFamily:"'DM Mono',monospace" }}>{fmt(item.val)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── logan mascot ──────────────────────────────────────────────────────────
const LOGAN_QUOTES = [
  "You are not\nserious people.",
  "BOAR ON\nTHE FLOOR!",
  "I win.",
  "You can't make a Tomlette without\nbreaking some Greggs.",
  "Makes the\nblood flow.",
  "My plan was always to hand over the reins.\nJust not to any of you.",
  "Nothing is a line.\nEverything is always moving.",
  "Go on. Get.\nYou're not good enough.",
  "No real person involved.",
  "I'm not going to apologize\nfor what I am.",
  "Son, the world isn't\ngoing to miss a beat.",
  "I love you.\nBut you are not serious people.",
];

function LoganMascot() {
  const [idx, setIdx] = useState(0);
  const [bubbleKey, setBubbleKey] = useState(0);

  const next = () => { setIdx((i) => (i + 1) % LOGAN_QUOTES.length); setBubbleKey((k) => k + 1); };

  useEffect(() => { const t = setInterval(next, 30000); return () => clearInterval(t); }, []);

  return (
    <div style={{ position:"fixed",bottom:24,right:24,zIndex:500,display:"flex",flexDirection:"column",alignItems:"center",gap:6,userSelect:"none" }}>
      {/* speech bubble */}
      <div key={bubbleKey} onClick={next} style={{
        position:"relative", background:"#fff", border:"2.5px solid #111",
        borderRadius:14, padding:"10px 13px", maxWidth:185, fontSize:11, fontWeight:700,
        lineHeight:1.6, cursor:"pointer", textAlign:"center", color:"#111",
        boxShadow:"3px 3px 0 #111", animation:"popIn .22s ease",
        fontFamily:"'DM Mono',monospace", whiteSpace:"pre-line", letterSpacing:.2,
      }}>
        "{LOGAN_QUOTES[idx]}"
        <div style={{ position:"absolute",bottom:-12,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"8px solid transparent",borderRight:"8px solid transparent",borderTop:"12px solid #111" }}/>
        <div style={{ position:"absolute",bottom:-8,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:"9px solid #fff" }}/>
      </div>

      {/* pixel art character */}
      <div onClick={next} title="Click for Logan wisdom" style={{ cursor:"pointer",animation:"loganBob 1.6s ease-in-out infinite" }}>
        <svg width="56" height="70" viewBox="0 0 16 20" style={{ imageRendering:"pixelated",display:"block" }}>
          {/* sparse hair top */}
          <rect x="3" y="0" width="10" height="1" fill="#ccc"/>
          {/* side hair (gray) */}
          <rect x="2" y="1" width="2" height="3" fill="#aaa"/>
          <rect x="12" y="1" width="2" height="3" fill="#aaa"/>
          {/* face */}
          <rect x="3" y="1" width="10" height="6" fill="#d4956a"/>
          {/* furrowed eyebrows */}
          <rect x="4" y="2" width="3" height="1" fill="#555"/>
          <rect x="9" y="2" width="3" height="1" fill="#555"/>
          {/* eyes - small and stern */}
          <rect x="4" y="3" width="2" height="1" fill="#2d1a0e"/>
          <rect x="10" y="3" width="2" height="1" fill="#2d1a0e"/>
          {/* nose */}
          <rect x="7" y="4" width="2" height="1" fill="#b8784a"/>
          {/* frown */}
          <rect x="5" y="6" width="6" height="1" fill="#8b4513"/>
          <rect x="4" y="5" width="1" height="1" fill="#8b4513"/>
          <rect x="11" y="5" width="1" height="1" fill="#8b4513"/>
          {/* neck */}
          <rect x="6" y="7" width="4" height="1" fill="#d4956a"/>
          {/* white collar */}
          <rect x="5" y="7" width="6" height="2" fill="#f0f0f0"/>
          {/* suit body */}
          <rect x="2" y="8" width="12" height="8" fill="#1c2340"/>
          {/* white shirt front */}
          <rect x="6" y="8" width="4" height="8" fill="#f0f0f0"/>
          {/* red power tie */}
          <rect x="7" y="8" width="2" height="6" fill="#cc0000"/>
          <rect x="7" y="14" width="2" height="2" fill="#990000"/>
          {/* lapels */}
          <rect x="6" y="8" width="2" height="4" fill="#1c2340"/>
          <rect x="8" y="8" width="2" height="4" fill="#1c2340"/>
          {/* arms */}
          <rect x="0" y="8" width="2" height="7" fill="#1c2340"/>
          <rect x="14" y="8" width="2" height="7" fill="#1c2340"/>
          {/* hands */}
          <rect x="0" y="15" width="2" height="1" fill="#d4956a"/>
          <rect x="14" y="15" width="2" height="1" fill="#d4956a"/>
          {/* legs */}
          <rect x="3" y="16" width="4" height="3" fill="#111"/>
          <rect x="9" y="16" width="4" height="3" fill="#111"/>
          {/* shoes */}
          <rect x="2" y="18" width="5" height="2" fill="#000"/>
          <rect x="9" y="18" width="5" height="2" fill="#000"/>
        </svg>
      </div>
      <span style={{ fontSize:8,fontWeight:800,letterSpacing:2,color:"#888",textTransform:"uppercase",fontFamily:"'DM Mono',monospace" }}>LOGAN ROY</span>
    </div>
  );
}

// ─── shared styles ─────────────────────────────────────────────────────────
const navBtnStyle = { background:"#fff",border:"1px solid #e5e9e2",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:16,color:"#555" };
const inputSt = { width:"100%",padding:"11px 14px",marginBottom:12,border:"1px solid #e5e7eb",borderRadius:10,fontSize:14,outline:"none",fontFamily:"'DM Sans',sans-serif",background:"#fafafa" };
const iconBtn = { background:"none",border:"none",cursor:"pointer",fontSize:15,color:"#ccc",padding:4,transition:"color .15s",fontFamily:"'DM Sans',sans-serif" };
