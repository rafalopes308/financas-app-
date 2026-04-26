import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (err) {
      setErro("E-mail ou senha incorretos.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#fafafa",fontFamily:"'DM Sans', sans-serif"}}>
      <div style={{background:"#fff",border:"1px solid #e5e9e2",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:380,boxShadow:"0 4px 24px rgba(0,0,0,0.06)"}}>
        <h2 style={{margin:"0 0 8px",fontSize:22,color:"#333"}}>Finanças</h2>
        <p style={{margin:"0 0 28px",color:"#888",fontSize:14}}>Faça login para continuar</p>
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:13,color:"#555",marginBottom:6}}>E-mail</label>
            <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="seu@email.com" required style={{width:"100%",padding:"11
cat > ~/financas-app/src/main.jsx << 'EOF'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
