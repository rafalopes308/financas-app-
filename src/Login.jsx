import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export default function Login() {
  const [modo, setModo] = useState("login"); // "login" ou "cadastro"
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");

    if (modo === "cadastro") {
      if (senha.length < 6) {
        setErro("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      if (senha !== confirmSenha) {
        setErro("As senhas não coincidem.");
        return;
      }
    }

    setCarregando(true);
    try {
      if (modo === "login") {
        await signInWithEmailAndPassword(auth, email, senha);
      } else {
        await createUserWithEmailAndPassword(auth, email, senha);
      }
    } catch (err) {
      const code = err.code || "";
      if (code === "auth/email-already-in-use") setErro("Este e-mail já está em uso.");
      else if (code === "auth/invalid-email") setErro("E-mail inválido.");
      else if (code === "auth/weak-password") setErro("Senha muito fraca (mínimo 6 caracteres).");
      else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") setErro("E-mail ou senha incorretos.");
      else setErro("Erro ao " + (modo === "login" ? "fazer login" : "criar conta") + ". Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  const trocarModo = () => {
    setModo(modo === "login" ? "cadastro" : "login");
    setErro("");
    setSenha("");
    setConfirmSenha("");
  };

  const inp = {
    width: "100%",
    padding: "14px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: 16,
    outline: "none",
    background: "#fff",
    color: "#1a1a1a",
    boxSizing: "border-box",
    fontFamily: "'DM Sans',sans-serif",
    WebkitTextFillColor: "#1a1a1a",
    WebkitAppearance: "none"
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", fontFamily: "'DM Sans',sans-serif", padding: 16, boxSizing: "border-box" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: "#fff", border: "1px solid #e5e9e2", borderRadius: 16, padding: "36px 28px", width: "100%", maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.06)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#1a1a1a", fontWeight: 700 }}>💰 Finanças</h2>
        <p style={{ margin: "0 0 28px", color: "#666", fontSize: 14 }}>
          {modo === "login" ? "Faça login para continuar" : "Crie sua conta gratuita"}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "#444", marginBottom: 6, fontWeight: 500 }}>E-mail</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required style={inp} />
          </div>

          <div style={{ marginBottom: modo === "cadastro" ? 16 : 24 }}>
            <label style={{ display: "block", fontSize: 13, color: "#444", marginBottom: 6, fontWeight: 500 }}>Senha</label>
            <input type="password" autoComplete={modo === "login" ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={modo === "cadastro" ? "Mínimo 6 caracteres" : "••••••••"} required style={inp} />
          </div>

          {modo === "cadastro" && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, color: "#444", marginBottom: 6, fontWeight: 500 }}>Confirmar senha</label>
              <input type="password" autoComplete="new-password" value={confirmSenha} onChange={(e) => setConfirmSenha(e.target.value)} placeholder="Digite a senha novamente" required style={inp} />
            </div>
          )}

          {erro && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 16, textAlign: "center" }}>{erro}</p>}

          <button type="submit" disabled={carregando} style={{ width: "100%", padding: "14px", background: "#15803d", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: "pointer", opacity: carregando ? 0.7 : 1, fontFamily: "'DM Sans',sans-serif", marginBottom: 16 }}>
            {carregando ? "Aguarde..." : (modo === "login" ? "Entrar" : "Criar conta")}
          </button>
        </form>

        <div style={{ textAlign: "center", paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            {modo === "login" ? "Ainda não tem conta?" : "Já tem uma conta?"}
          </p>
          <button type="button" onClick={trocarModo} style={{ background: "none", border: "none", color: "#15803d", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0", fontFamily: "'DM Sans',sans-serif" }}>
            {modo === "login" ? "Criar conta gratuita" : "Fazer login"}
          </button>
        </div>
      </div>
    </div>
  );
}
