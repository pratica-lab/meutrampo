
import React, { useState, useEffect, useRef } from "react"
import { initializeApp } from "firebase/app"
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth"
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore"

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCTuxqxxEBqCEJUrDotSf84rswLjuZB6HA",
  authDomain: "meu-trampo-1ce40.firebaseapp.com",
  projectId: "meu-trampo-1ce40",
  storageBucket: "meu-trampo-1ce40.firebasestorage.app",
  messagingSenderId: "404459212042",
  appId: "1:404459212042:web:394d6ce6eb0f4003f97ef3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── 1. Funções Utilitárias ───────────────────────────────────────────────────
const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    osc.connect(ctx.destination)
    osc.frequency.value = 600
    osc.start()
    setTimeout(() => {
      osc.stop()
      const osc2 = ctx.createOscillator()
      osc2.connect(ctx.destination)
      osc2.frequency.value = 800
      osc2.start()
      setTimeout(() => { osc2.stop(); ctx.close() }, 200)
    }, 150)
  } catch (e) { console.log("Audio not supported") }
}

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

const todayStr = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzoffset).toISOString().split("T")[0];
}

const tomorrowStr = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzoffset + 86400000).toISOString().split("T")[0];
}

const isPast = (d) => d && d < todayStr()

const checkIsToday = (t) => (t.myDay || t.plannedDate === todayStr() || (t.plannedDate && t.plannedDate < todayStr()) || t.deadline === todayStr());
const checkIsTomorrow = (t) => (!checkIsToday(t) && (t.plannedDate === tomorrowStr() || t.deadline === tomorrowStr()));

// ─── 2. Hooks de Sistema & Firebase Sync ──────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])
  return isMobile
}

function useAppAssets() {
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap"
    document.head.appendChild(link)

    let favicon = document.querySelector('link[rel="icon"]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.appendChild(favicon)
    }
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#22c55e"/><path d="M28 52l14 14l30-30" stroke="white" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M45 65l-5 22l24-12l-6-10" fill="#f97316"/></svg>`
    favicon.href = `data:image/svg+xml,${encodeURIComponent(svgIcon)}`

    return () => document.head.removeChild(link)
  }, [])
}

// Custom hook para sincronizar automaticamente os estados locais com o Firestore
function useSyncedState(collectionName, initialData, user) {
  const [state, setState] = useState(initialData);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', 'meu-trampo', 'users', user.uid, 'appData', collectionName);
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setState(snapshot.data().items);
      } else {
        setState(initialData);
      }
      setLoaded(true);
    }, (error) => {
      console.error("Erro na sincronização:", error);
      if (error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
        window.dispatchEvent(new Event('db-permission-error'));
      }
      setLoaded(true);
    });
    return unsub;
  }, [user, collectionName]);

  const setSyncedState = (action) => {
    setState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (user && loaded) {
        const docRef = doc(db, 'artifacts', 'meu-trampo', 'users', user.uid, 'appData', collectionName);
        setDoc(docRef, { items: next }, { merge: true }).catch(err => {
          console.error(err);
          if (err.code === 'permission-denied' || err.message.includes('Missing or insufficient permissions')) {
            window.dispatchEvent(new Event('db-permission-error'));
          }
        });
      }
      return next;
    });
  };

  return [state, setSyncedState, loaded];
}

// ─── 3. Componentes Compartilhados ────────────────────────────────────────────
function ModuleHeader({ title, subtitle, color, action, isMobile }) {
  return (
    <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 4, height: isMobile ? 32 : 38, background: color, borderRadius: 4, flexShrink: 0 }} />
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>{title}</h2>
          {!isMobile && <p style={{ color: "#6b7280", fontSize: 12, margin: "3px 0 0" }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function Checkbox({ checked, onChange, color }) {
  return (
    <button onClick={onChange} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? color : "#4b5563"}`, background: checked ? color : "transparent", cursor: "pointer", flexShrink: 0, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {checked && <span style={{ color: "#fff", fontSize: 14, fontWeight: "bold" }}>✓</span>}
    </button>
  )
}

function ScrollTabs({ tabs, active, onSelect, color }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)}
          style={{ ...C.btn(active === t.id ? color : "#1e2130"), flexShrink: 0, fontSize: 12 }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function MiniPomoHeader({ pomo }) {
  if (!pomo || !pomo.running) return null;
  const color = pomo.isBreak ? "#3b82f6" : "#22c55e";
  return (
    <div style={{ background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 6, padding: "5px 8px", display: "flex", alignItems: "center", gap: 6, height: "100%", boxSizing: "border-box" }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>{pomo.isBreak ? "☕" : "🍅"}</span>
      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: color, width: 38, textAlign: "center", lineHeight: 1 }}>{fmtTime(pomo.seconds)}</span>
    </div>
  )
}

// ─── 4. Constantes e Dados Iniciais ───────────────────────────────────────────
const MODULES = [
  { id: "teams",        label: "Equipes",      fullLabel: "Gestão de Equipes",  icon: "👥", color: "#ef4444" },
  { id: "tasks",        label: "Tarefas",      fullLabel: "Minhas Tarefas",      icon: "✅", color: "#f97316" },
  { id: "productivity", label: "Foco",         fullLabel: "Produtividade",        icon: "⚡", color: "#22c55e" },
  { id: "indicators",   label: "Indicadores",  fullLabel: "Indicadores",          icon: "📊", color: "#3b82f6" },
  { id: "notes",        label: "Notas",        fullLabel: "Notas",                icon: "📝", color: "#a855f7" },
]

const PRIORITY_COLORS = { Urgente: "#ef4444", Alta: "#f97316", Média: "#eab308", Baixa: "#22c55e", Baixíssima: "#6b7280" }

const TRIAGE_OPTIONS = [
  { id: "delegate", label: "Delegar",              icon: "👥", color: "#3b82f6" },
  { id: "meeting",  label: "Pauta Reunião",        icon: "📅", color: "#a855f7" },
  { id: "register", label: "Registrar",            icon: "📋", color: "#6b7280" },
  { id: "urgent",   label: "Resolver Hoje",        icon: "🔥", color: "#ef4444" },
]

const C = {
  card:  { background: "#12141a", border: "1px solid #1e2130", borderRadius: 12, padding: 16 },
  input: { background: "#1a1d26", border: "1px solid #2a2f40", borderRadius: 8, padding: "9px 12px", color: "#e8eaf0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" },
  btn:   (bg) => ({ background: bg, border: "none", borderRadius: 8, padding: "9px 14px", color: bg === "#1e2130" || bg === "transparent" ? "#9ca3af" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, transition: "opacity 0.2s" }),
  tag:   (c = "#3b82f6") => ({ background: `${c}22`, color: c, border: `1px solid ${c}44`, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }),
  lbl:   { fontSize: 11, color: "#6b7280", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 5, display: "block" },
}

const INIT_TEAMS = [{
  id: 1, name: "Open Finance Core", description: "Squad de consentimento de dados",
  members: [{ id: 1, name: "Ana Silva", role: "Dev Backend" }, { id: 2, name: "Carlos Lima", role: "QA" }],
  backlog:  [{ id: 1, text: "Implementar endpoint de revogação", tags: ["API"], details: "Precisa validar a regra de negócio com PO.", status: "open", createdAt: "24/04" }],
  risks:    [{ id: 1, text: "Ambiente de HML instável", tags: ["Infra"], details: "Testes falhando por timeout.", status: "open", createdAt: "25/04" }],
  blocks:   [], 
  changes:  [{ id: 1, text: "Aguardando aprovação PO", tags: [], details: "", status: "open", createdAt: "22/04" }],
  rts:      [{ id: 1, name: "RT 05 - Open Finance", startDate: "2026-05-01", endDate: "2026-06-30", features: [] }]
}]

const INIT_TASKS = [
  { id: 1, title: "Revisar especificação técnica", subtasks: [], notes: "Focar nos endpoints /auth e /revoke", deadline: todayStr(), priority: "Alta", delegable: false, tags: ["API"], status: "todo", myDay: true, plannedDate: "", dueDate: todayStr() },
]

const INIT_INDICATORS = [
  { id: 1, name: "Tarefas concluídas no mês",     category: "Pessoal",     value: 12, target: 20,  unit: "tasks", history: [] },
]

const INIT_NOTES = {
  meetings:   [{ id: 1, title: "Sprint Planning", date: "28/04/2026", tags: ["planning"], content: "Comprometimento de 34 pontos." }],
  feedbacks:  [{ id: 1, title: "Avaliação Trimestral", person: "João Silva", type: "Dado", date: "29/04/2026", tags: ["avaliação"], content: "Feedback estruturado sobre evolução." }],
  changes:    [],
  others:     [{ id: 1, title: "Ideias para o App", tags: ["brainstorm"], date: "29/04/2026", content: "Implementar modo escuro e novos módulos." }],
}

// ─── Componente LoginScreen ───────────────────────────────────────────────────
function LoginScreen({ onLoginGoogle, onLoginAnon, onLoginEmail, onRegisterEmail, error }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    await onLoginGoogle();
    setLoading(false);
  };

  const handleAnon = async () => {
    setLoading(true);
    await onLoginAnon();
    setLoading(false);
  };
  
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    if (isRegister) {
      await onRegisterEmail(email, password);
    } else {
      await onLoginEmail(email, password);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0b0f', color: '#e8eaf0', fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ background: '#12141a', padding: "40px 30px", borderRadius: 20, border: '1px solid #1e2130', textAlign: 'center', maxWidth: 400, width: "90%", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, #22c55e, #f97316)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>⚡</div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, margin: "0 0 8px", fontWeight: 800 }}>Meu Trampo</h1>
        <p style={{ color: '#9ca3af', marginBottom: 24, fontSize: 13, lineHeight: 1.5 }}>Faça login para sincronizar suas tarefas.</p>
        
        {error && (
          <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 20, padding: 12, background: "#ef444422", borderRadius: 8, textAlign: "left", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <input type="email" placeholder="Seu E-mail" value={email} onChange={e => setEmail(e.target.value)} required style={C.input} />
          <input type="password" placeholder="Sua Senha" value={password} onChange={e => setPassword(e.target.value)} required style={C.input} />
          <button type="submit" disabled={loading} style={{ ...C.btn("#3b82f6"), width: "100%", padding: "12px", fontSize: 14 }}>
            {loading ? 'Aguarde...' : (isRegister ? 'Criar Conta' : 'Entrar com E-mail')}
          </button>
        </form>
        
        <button onClick={() => setIsRegister(!isRegister)} type="button" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", textDecoration: "underline", marginBottom: 20 }}>
          {isRegister ? "Já tenho conta. Fazer Login." : "Não tem conta? Crie uma aqui."}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "#1e2130" }} />
          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>OU</span>
          <div style={{ flex: 1, height: 1, background: "#1e2130" }} />
        </div>

        <button onClick={handleGoogle} disabled={loading} style={{ background: '#fff', color: '#000', padding: '12px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google
        </button>

        <button onClick={handleAnon} disabled={loading} style={{ background: 'transparent', color: '#9ca3af', padding: '12px 20px', borderRadius: 10, border: '1px solid #2a2f40', fontWeight: 600, fontSize: 13, cursor: 'pointer', width: "100%" }}>
          Entrar como Visitante
        </button>
      </div>
    </div>
  );
}

// ─── 5. Módulo Equipes ────────────────────────────────────────────────────────
function TeamsModule({ teams, setTeams, isMobile }) {
  const color = "#ef4444"
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTeam, setEditingTeam] = useState(false)
  const [form, setForm] = useState({ name: "", description: "" })
  const [tab, setTab] = useState("backlog")
  
  const [newItem, setNewItem] = useState("")
  const [newItemTags, setNewItemTags] = useState("")
  const [itemSearch, setItemSearch] = useState("")
  const [newMember, setNewMember] = useState({ name: "", role: "" })

  const [expandedItemId, setExpandedItemId] = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)
  const [itemEditForm, setItemEditForm] = useState({ text: "", tags: "", details: "" })

  const [rtForm, setRtForm] = useState({ name: "", startDate: "", endDate: "" })
  const [addingFeatRtId, setAddingFeatRtId] = useState(null)
  const [featForm, setFeatForm] = useState({ text: "", startDate: "", endDate: "", note: "" })

  const team = teams.find(t => t.id === selected)

  const addTeam = () => {
    if (!form.name.trim()) return
    setTeams(prev => [...prev, { id: Date.now(), ...form, members: [], backlog: [], risks: [], blocks: [], changes: [], rts: [] }])
    setForm({ name: "", description: "" }); setShowForm(false)
  }
  const saveEditTeam = () => {
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, name: form.name, description: form.description } : t))
    setEditingTeam(false)
  }
  const removeTeam = (id) => {
    setTeams(prev => prev.filter(t => t.id !== id))
    setSelected(null)
  }
  const addMember = () => {
    if (!newMember.name.trim()) return
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, members: [...t.members, { ...newMember, id: Date.now() }] } : t))
    setNewMember({ name: "", role: "" })
  }
  const removeMember = (mId) => {
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, members: t.members.filter(m => m.id !== mId) } : t))
  }
  
  const addItem = (field) => {
    if (!newItem.trim()) return
    const tagsArr = newItemTags.split(",").map(t => t.trim()).filter(Boolean)
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, [field]: [{ id: Date.now(), text: newItem, tags: tagsArr, details: "", status: "open", createdAt: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }, ...(t[field]||[])] } : t))
    setNewItem(""); setNewItemTags("")
  }
  const toggleItem = (field, itemId) => {
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, [field]: t[field].map(i => i.id === itemId ? { ...i, status: i.status === "open" ? "done" : "open" } : i) } : t))
  }
  const removeItem = (field, itemId) => {
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, [field]: t[field].filter(i => i.id !== itemId) } : t))
  }

  const startEditItem = (item) => {
    setItemEditForm({ text: item.text, tags: (item.tags||[]).join(", "), details: item.details || "" })
    setEditingItemId(item.id)
  }

  const saveEditItem = (field, id) => {
    const tagsArr = itemEditForm.tags.split(",").map(t => t.trim()).filter(Boolean)
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, [field]: t[field].map(i => i.id === id ? { ...i, text: itemEditForm.text, tags: tagsArr, details: itemEditForm.details } : i) } : t))
    setEditingItemId(null)
  }

  const addRt = () => {
    if (!rtForm.name.trim()) return
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, rts: [{ id: Date.now(), ...rtForm, features: [] }, ...(t.rts||[])] } : t))
    setRtForm({ name: "", startDate: "", endDate: "" })
  }
  const deleteRt = (rtId) => {
    setTeams(prev => prev.map(t => t.id === selected ? { ...t, rts: (t.rts||[]).filter(r => r.id !== rtId) } : t))
  }
  const addFeature = (rtId) => {
    if (!featForm.text.trim()) return
    setTeams(prev => prev.map(t => t.id === selected ? {
      ...t, rts: (t.rts||[]).map(r => r.id === rtId ? { ...r, features: [...(r.features||[]), { id: Date.now(), ...featForm, done: false }] } : r)
    } : t))
    setAddingFeatRtId(null)
    setFeatForm({ text: "", startDate: "", endDate: "", note: "" })
  }
  const toggleFeature = (rtId, featId) => {
    setTeams(prev => prev.map(t => t.id === selected ? {
      ...t, rts: (t.rts||[]).map(r => r.id === rtId ? { ...r, features: r.features.map(f => f.id === featId ? { ...f, done: !f.done } : f) } : r)
    } : t))
  }
  const deleteFeature = (rtId, featId) => {
    setTeams(prev => prev.map(t => t.id === selected ? {
      ...t, rts: (t.rts||[]).map(r => r.id === rtId ? { ...r, features: r.features.filter(f => f.id !== featId) } : r)
    } : t))
  }

  const TAB_MAP = [
    { id: "backlog",  label: "Backlog",        field: "backlog"  },
    { id: "rts",      label: "🚀 RTs",         field: "rts"      },
    { id: "risks",    label: "⚠️ Riscos",       field: "risks"    },
    { id: "blocks",   label: "🚫 Blocks",       field: "blocks"   },
    { id: "changes",  label: "🔄 Pendências",   field: "changes"  },
  ]

  if (team) {
    const activeTab = TAB_MAP.find(t => t.id === tab)
    const rawItems = team[activeTab.field] || []
    
    const filteredItems = activeTab.field === "rts" ? rawItems : rawItems.filter(i => {
      const q = itemSearch.toLowerCase()
      if (!q) return true
      return i.text.toLowerCase().includes(q) || (i.details && i.details.toLowerCase().includes(q)) || (i.tags && i.tags.some(tag => tag.toLowerCase().includes(q)))
    })

    const sortedMembers = [...team.members].sort((a, b) => {
      const rA = (a.role || "").toLowerCase(); const rB = (b.role || "").toLowerCase();
      if (!rA && rB) return 1; if (rA && !rB) return -1;
      if (rA !== rB) return rA.localeCompare(rB);
      return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
    });

    return (
      <div>
        <button onClick={() => { setSelected(null); setEditingTeam(false); setItemSearch(""); setExpandedItemId(null); setEditingItemId(null) }} style={{ ...C.btn("#1e2130"), marginBottom: 16, fontSize: 12 }}>← Voltar</button>
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          {editingTeam ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              <span style={C.lbl}>Editar Dados do Time</span>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={C.input} placeholder="Nome do time" />
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} style={C.input} placeholder="Descrição" />
              
              <div style={{ background: "#0a0b0f", padding: 12, borderRadius: 8, marginTop: 8 }}>
                <span style={C.lbl}>Gerenciar Membros</span>
                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, marginBottom: 12 }}>
                  <input placeholder="Nome do membro" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} style={C.input} />
                  <input placeholder="Função" value={newMember.role} onChange={e => setNewMember({ ...newMember, role: e.target.value })} onKeyDown={e => e.key === 'Enter' && addMember()} style={C.input} />
                  <button onClick={addMember} style={C.btn(color)}>+ Add Membro</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {sortedMembers.map(m => (
                    <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "#1e2130", borderRadius: 8, padding: "5px 10px", border: "1px solid #2a2f40" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
                      {m.role && <span style={{ fontSize: 10, color: color }}>({m.role})</span>}
                      <button onClick={() => removeMember(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "0 2px", fontSize: 12 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveEditTeam} style={C.btn(color)}>Salvar Edição</button>
                <button onClick={() => setEditingTeam(false)} style={C.btn("transparent")}>Concluir</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>{team.name}</h3>
                <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 12px" }}>{team.description}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sortedMembers.map(m => (
                    <span key={m.id} style={{ ...C.tag(color), fontSize: 10 }}>{m.name} {m.role ? `(${m.role})` : ""}</span>
                  ))}
                  {sortedMembers.length === 0 && <span style={{ fontSize: 11, color: "#6b7280" }}>Sem membros vinculados.</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => { setForm({ name: team.name, description: team.description }); setEditingTeam(true) }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, padding: 0 }}>✏️ Editar</button>
                <button onClick={() => removeTeam(team.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, padding: 0 }}>🗑</button>
              </div>
            </div>
          )}
        </div>

        <ScrollTabs tabs={TAB_MAP} active={tab} onSelect={(id) => { setTab(id); setExpandedItemId(null); setEditingItemId(null) }} color={color} />

        <div style={C.card}>
          {activeTab.field === "rts" ? (
            <div>
               <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, marginBottom: 20 }}>
                 <input placeholder="Nome da Release Train (RT)..." value={rtForm.name} onChange={e => setRtForm({...rtForm, name: e.target.value})} style={{ ...C.input, flex: 1 }} />
                 <div style={{ display: "flex", gap: 8 }}>
                    <input type="date" value={rtForm.startDate} onChange={e => setRtForm({...rtForm, startDate: e.target.value})} style={{ ...C.input, width: 140 }} title="Data de Início" />
                    <input type="date" value={rtForm.endDate} onChange={e => setRtForm({...rtForm, endDate: e.target.value})} style={{ ...C.input, width: 140 }} title="Data de Fim" />
                 </div>
                 <button onClick={addRt} style={C.btn(color)}>+ Criar RT</button>
               </div>

               {filteredItems.length === 0 ? (
                 <p style={{ color: "#4b5563", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhuma RT cadastrada.</p>
               ) : (
                 <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                   {filteredItems.map(rt => {
                      const feats = rt.features || []
                      const doneCount = feats.filter(f => f.done).length
                      const isExpanded = expandedItemId === rt.id

                      return (
                        <div key={rt.id} style={{ background: "#0a0b0f", border: "1px solid #1e2130", borderRadius: 8, padding: 12 }}>
                           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpandedItemId(isExpanded ? null : rt.id)}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e8eaf0" }}>{rt.name}</h4>
                                  <span style={{ fontSize: 10, color: "#6b7280" }}>({doneCount}/{feats.length} concluídas)</span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  {rt.startDate && <span style={C.tag("#3b82f6")}>Início: {rt.startDate.split('-').reverse().join('/')}</span>}
                                  {rt.endDate && <span style={C.tag("#a855f7")}>Fim: {rt.endDate.split('-').reverse().join('/')}</span>}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14 }}>{isExpanded ? "▲" : "▼"}</button>
                                <button onClick={(e) => { e.stopPropagation(); deleteRt(rt.id); }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                              </div>
                           </div>

                           {isExpanded && (
                             <div style={{ marginTop: 16, borderTop: "1px solid #1e2130", paddingTop: 16 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                  <span style={C.lbl}>Features da RT</span>
                                  <button onClick={(e) => { e.stopPropagation(); setAddingFeatRtId(rt.id) }} style={{ ...C.btn("#1e2130"), fontSize: 11, padding: "4px 8px" }}>+ Add Feature</button>
                                </div>

                                {addingFeatRtId === rt.id && (
                                  <div style={{ background: "#12141a", padding: 12, borderRadius: 8, marginBottom: 16, border: "1px solid #2a2f40" }}>
                                    <input placeholder="Nome da Feature *" value={featForm.text} onChange={e => setFeatForm({...featForm, text: e.target.value})} style={{ ...C.input, marginBottom: 8 }} />
                                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                      <input type="date" value={featForm.startDate} onChange={e => setFeatForm({...featForm, startDate: e.target.value})} style={{ ...C.input, flex: 1 }} title="Início Previsto" />
                                      <input type="date" value={featForm.endDate} onChange={e => setFeatForm({...featForm, endDate: e.target.value})} style={{ ...C.input, flex: 1 }} title="Fim Previsto" />
                                    </div>
                                    <textarea placeholder="Observações..." value={featForm.note} onChange={e => setFeatForm({...featForm, note: e.target.value})} style={{ ...C.input, minHeight: 60, marginBottom: 8 }} />
                                    <div style={{ display: "flex", gap: 8 }}>
                                      <button onClick={() => addFeature(rt.id)} style={C.btn(color)}>Salvar</button>
                                      <button onClick={() => setAddingFeatRtId(null)} style={C.btn("transparent")}>Cancelar</button>
                                    </div>
                                  </div>
                                )}

                                {feats.length === 0 ? (
                                  <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", margin: 0 }}>Nenhuma feature cadastrada nesta RT.</p>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {feats.map(f => (
                                      <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#12141a", padding: 10, borderRadius: 6, opacity: f.done ? 0.6 : 1 }}>
                                        <div style={{ marginTop: 2 }}><Checkbox checked={f.done} onChange={() => toggleFeature(rt.id, f.id)} color={color} /></div>
                                        <div style={{ flex: 1 }}>
                                          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, textDecoration: f.done ? "line-through" : "none", color: f.done ? "#6b7280" : "#e8eaf0" }}>{f.text}</p>
                                          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                                            {f.startDate && <span style={{ fontSize: 10, color: "#9ca3af" }}>Início: {f.startDate.split('-').reverse().join('/')}</span>}
                                            {f.endDate && <span style={{ fontSize: 10, color: "#9ca3af" }}>Fim: {f.endDate.split('-').reverse().join('/')}</span>}
                                          </div>
                                          {f.note && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", whiteSpace: "pre-wrap" }}>{f.note}</p>}
                                        </div>
                                        <button onClick={() => deleteFeature(rt.id, f.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                             </div>
                           )}
                        </div>
                      )
                   })}
                 </div>
               )}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                 <input placeholder={`Buscar em ${activeTab.label} (texto, detalhes ou tags)...`} value={itemSearch} onChange={e => setItemSearch(e.target.value)} style={{ ...C.input, background: "#0a0b0f" }} />
              </div>

              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, marginBottom: 14 }}>
                <input placeholder={`Adicionar item rápido em ${activeTab.label}...`} value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem(activeTab.field)} style={C.input} />
                <input placeholder="Tags (vírgula)" value={newItemTags} onChange={e => setNewItemTags(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem(activeTab.field)} style={{ ...C.input, width: isMobile ? "100%" : 160 }} />
                <button onClick={() => addItem(activeTab.field)} style={C.btn(color)}>+</button>
              </div>
              
              {filteredItems.length === 0
                ? <p style={{ color: "#4b5563", fontSize: 13, textAlign: "center", padding: "20px 0" }}>{itemSearch ? "Nenresultado." : "Nenhum item adicionado."}</p>
                : filteredItems.map(item => (
                  <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", borderBottom: "1px solid #1e2130" }}>
                    
                    {editingItemId === item.id ? (
                      <div style={{ background: "#0a0b0f", padding: 12, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                        <input value={itemEditForm.text} onChange={e => setItemEditForm({...itemEditForm, text: e.target.value})} style={C.input} placeholder="Texto principal" />
                        <input value={itemEditForm.tags} onChange={e => setItemEditForm({...itemEditForm, tags: e.target.value})} style={C.input} placeholder="Tags (separadas por vírgula)" />
                        <textarea value={itemEditForm.details} onChange={e => setItemEditForm({...itemEditForm, details: e.target.value})} style={{...C.input, minHeight: 60, resize: "vertical"}} placeholder="Detalhes (Opcional)..." />
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <button onClick={() => saveEditItem(activeTab.field, item.id)} style={C.btn(color)}>Salvar</button>
                          <button onClick={() => setEditingItemId(null)} style={C.btn("transparent")}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ marginTop: 2 }}><Checkbox checked={item.status === "done"} onChange={() => toggleItem(activeTab.field, item.id)} color={color} /></div>
                          <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}>
                            <span style={{ fontSize: 13, textDecoration: item.status === "done" ? "line-through" : "none", color: item.status === "done" ? "#4b5563" : "#e8eaf0", display: "block", wordBreak: "break-word", marginBottom: 4 }}>
                              {item.text}
                              {item.details && <span style={{ color: "#6b7280", fontSize: 11, marginLeft: 6 }}>📝</span>}
                            </span>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {(item.tags||[]).map((t, idx) => <span key={idx} style={{ ...C.tag("#6b7280"), fontSize: 9, padding: "1px 6px" }}>{t}</span>)}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, color: "#4b5563", flexShrink: 0 }}>{item.createdAt}</span>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: "0 4px" }}>{expandedItemId === item.id ? "▲" : "▼"}</button>
                            <button onClick={() => startEditItem(item)} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: "0 4px" }}>✏️</button>
                            <button onClick={() => removeItem(activeTab.field, item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, padding: "0 4px" }}>✕</button>
                          </div>
                        </div>
                        {expandedItemId === item.id && item.details && (
                          <div style={{ marginLeft: 30, background: "#0a0b0f", padding: "8px 12px", borderRadius: 8, fontSize: 12, color: "#9ca3af", whiteSpace: "pre-wrap" }}>
                            {item.details}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <ModuleHeader title="Gestão de Equipes" subtitle="Squads, backlogs, RTs e pendências" color={color} isMobile={isMobile}
        action={<button onClick={() => setShowForm(!showForm)} style={C.btn(color)}>+ Novo Squad</button>} />

      {showForm && (
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            <input placeholder="Nome do time *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={C.input} />
            <input placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={C.input} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addTeam} style={C.btn(color)}>Criar</button>
            <button onClick={() => setShowForm(false)} style={C.btn("#1e2130")}>Cancelar</button>
          </div>
        </div>
      )}

      {teams.length === 0
        ? <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 40 }}>Nenhum time cadastrado</div>
        : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(270px,1fr))", gap: 12 }}>
            {teams.map(t => {
              const sortedMembersCount = t.members.length;
              return (
                <div key={t.id} onClick={() => setSelected(t.id)}
                  style={{ ...C.card, cursor: "pointer", borderLeft: `4px solid ${color}`, transition: "transform 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)" }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}>
                  <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, margin: "0 0 4px", fontSize: 15 }}>{t.name}</h3>
                  <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>{t.description}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span style={C.tag(color)}>{sortedMembersCount} membros</span>
                    <span style={C.tag("#6b7280")}>{t.backlog.length} backlog</span>
                    {t.rts && t.rts.length > 0 && <span style={C.tag("#a855f7")}>🚀 {t.rts.length} RTs</span>}
                    {t.risks.filter(r => r.status === "open").length > 0 && <span style={C.tag("#eab308")}>⚠️ {t.risks.filter(r => r.status === "open").length} riscos</span>}
                    {(t.blocks||[]).filter(r => r.status === "open").length > 0 && <span style={C.tag("#ef4444")}>🚫 {(t.blocks||[]).filter(r => r.status === "open").length} blocks</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

// ─── 6. Módulo Tarefas ────────────────────────────────────────────────────────
function SubtaskPanel({ task, onAdd, onToggle, onDelete, color, onUpdateNotes }) {
  const [inp, setInp] = useState("")
  const [notes, setNotes] = useState(task.notes || "")

  useEffect(() => { setNotes(task.notes || "") }, [task.notes])

  return (
    <div style={{ marginTop: 10, marginLeft: 30, padding: 12, background: "#0a0b0f", borderRadius: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
           <span style={{ ...C.lbl, display: "flex", justifyContent: "space-between", alignItems: "center" }}>📝 Anotações da Tarefa</span>
           <textarea placeholder="Detalhes, links ou observações..." value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => onUpdateNotes(task.id, notes)}
             style={{ ...C.input, minHeight: 60, fontSize: 12, resize: "vertical" }} />
        </div>
        <div>
          <span style={C.lbl}>Subtarefas ({task.subtasks.filter(s => s.done).length}/{task.subtasks.length})</span>
          {task.subtasks.map(sub => (
            <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <Checkbox checked={sub.done} onChange={() => onToggle(sub.id)} color={color} />
              <span style={{ fontSize: 12, color: sub.done ? "#4b5563" : "#9ca3af", textDecoration: sub.done ? "line-through" : "none", flex: 1 }}>{sub.text}</span>
              <button onClick={() => onDelete(sub.id)} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", padding: "2px 5px" }}>✕</button>
            </div>
          ))}
          <input placeholder="Nova subtarefa (Enter)" value={inp} onChange={e => setInp(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && inp.trim()) { onAdd(inp.trim()); setInp("") } }}
            style={{ ...C.input, fontSize: 12, marginTop: 8, padding: "6px 10px" }} />
        </div>
      </div>
    </div>
  )
}

function TasksModule({ tasks, setTasks, isMobile }) {
  const color = "#f97316"
  const [view, setView] = useState("today")
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState(null)
  
  const [filterText, setFilterText] = useState("")
  const [filterDate, setFilterDate] = useState("")
  const [filterPri, setFilterPri] = useState("")
  const [sortBy, setSortBy] = useState("manual") 

  const [form, setForm] = useState({ title: "", deadline: "", priority: "Média", delegable: false, tags: "", myDay: true, forTomorrow: false, notes: "" })

  const overdueCount  = tasks.filter(t => isPast(t.deadline) && t.status !== "done").length
  const myDayCount    = tasks.filter(t => checkIsToday(t) && t.status !== "done").length
  const tomorrowCount = tasks.filter(t => checkIsTomorrow(t) && t.status !== "done").length

  const addTask = () => {
    if (!form.title.trim()) return
    const plannedDate = form.forTomorrow ? tomorrowStr() : form.myDay ? todayStr() : ""
    setTasks(prev => [...prev, { id: Date.now(), ...form, plannedDate, tags: form.tags.split(",").map(s => s.trim()).filter(Boolean), subtasks: [], status: "todo", dueDate: todayStr() }])
    setForm({ title: "", deadline: "", priority: "Média", delegable: false, tags: "", myDay: true, forTomorrow: false, notes: "" })
    setShowForm(false)
  }

  const toggleDone = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t))
  const toggleMyDay = (id) => setTasks(prev => prev.map(t => {
    if (t.id === id) {
       if (checkIsToday(t)) return { ...t, myDay: false, plannedDate: null };
       return { ...t, myDay: true, plannedDate: todayStr() };
    }
    return t;
  }));
  const toggleTomorrow = (id) => setTasks(prev => prev.map(t => {
    if (t.id === id) {
       if (checkIsTomorrow(t)) return { ...t, plannedDate: null };
       return { ...t, myDay: false, plannedDate: tomorrowStr() };
    }
    return t;
  }));
  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id))
  const addSubtask = (id, text) => setTasks(prev => prev.map(t => t.id === id ? { ...t, subtasks: [...t.subtasks, { id: Date.now(), text, done: false }] } : t))
  const toggleSubtask = (tid, sid) => setTasks(prev => prev.map(t => t.id === tid ? { ...t, subtasks: t.subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) } : t))
  const delSubtask = (tid, sid) => setTasks(prev => prev.map(t => t.id === tid ? { ...t, subtasks: t.subtasks.filter(s => s.id !== sid) } : t))
  const updateTaskNotes = (id, newNotes) => setTasks(prev => prev.map(t => t.id === id ? { ...t, notes: newNotes } : t))

  const moveTask = (id, direction) => {
    const idx = tasks.findIndex(t => t.id === id)
    if (idx < 0) return
    const newTasks = [...tasks]
    let targetIdx = idx + direction
    while (targetIdx >= 0 && targetIdx < newTasks.length) {
       const t = newTasks[targetIdx]
       const inView = (view === "today" && checkIsToday(t) && t.status !== "done") ||
                      (view === "tomorrow" && checkIsTomorrow(t) && t.status !== "done") ||
                      (view === "overdue" && isPast(t.deadline) && t.status !== "done") ||
                      (view === "backlog")
       if (inView) {
         [newTasks[idx], newTasks[targetIdx]] = [newTasks[targetIdx], newTasks[idx]]
         setTasks(newTasks)
         break
       }
       targetIdx += direction
    }
  }

  const ORDER = { Urgente: 0, Alta: 1, Média: 2, Baixa: 3, Baixíssima: 4 }
  
  let visible = tasks.filter(t => {
    if (view === "today")    return checkIsToday(t) && t.status !== "done"
    if (view === "tomorrow") return checkIsTomorrow(t) && t.status !== "done"
    if (view === "overdue")  return isPast(t.deadline) && t.status !== "done"
    return true
  })

  if (filterText) visible = visible.filter(t => t.title.toLowerCase().includes(filterText.toLowerCase()) || (t.tags && t.tags.some(tag => tag.toLowerCase().includes(filterText.toLowerCase()))))
  if (filterPri)  visible = visible.filter(t => t.priority === filterPri)
  if (filterDate) visible = visible.filter(t => t.deadline === filterDate || t.plannedDate === filterDate)

  if (sortBy === "priority") visible.sort((a, b) => (ORDER[a.priority] ?? 5) - (ORDER[b.priority] ?? 5))
  if (sortBy === "deadline") visible.sort((a, b) => (a.deadline || "9999-99-99").localeCompare(b.deadline || "9999-99-99"))

  const tabs = [
    { id: "backlog",  label: `Backlog (${tasks.length})` },
    { id: "tomorrow", label: `🌅 Amanhã (${tomorrowCount})` },
    { id: "today",    label: `☀️ Hoje (${myDayCount})` },
    { id: "overdue",  label: `⚠️ Vencidas (${overdueCount})` },
  ]

  return (
    <div>
      <ModuleHeader title="Minhas Tarefas" subtitle="Planejamento do dia e gestão do backlog" color={color} isMobile={isMobile}
        action={<button onClick={() => setShowForm(!showForm)} style={C.btn(color)}>+ Nova</button>} />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Buscar tag ou título..." value={filterText} onChange={e => setFilterText(e.target.value)} style={{ ...C.input, flex: 1, minWidth: 150 }} />
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...C.input, width: "auto" }} title="Buscar por data" />
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)} style={{ ...C.input, width: "auto", minWidth: 130 }}>
          <option value="">Todas Prioridades</option>
          {Object.keys(PRIORITY_COLORS).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...C.input, width: "auto", minWidth: 130 }}>
          <option value="manual">Ordem Manual</option>
          <option value="priority">Por Prioridade</option>
          <option value="deadline">Por Vencimento</option>
        </select>
      </div>

      {showForm && (
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            <input placeholder="Título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={C.input} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} style={C.input} />
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ ...C.input, appearance: "none" }}>
                {Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <input placeholder="Tags (vírgula)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} style={C.input} />
            <textarea placeholder="Anotações Iniciais (Opcional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...C.input, minHeight: 60, resize: "vertical" }} />
            
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}>
                <input type="checkbox" checked={form.delegable} onChange={e => setForm({ ...form, delegable: e.target.checked })} /> Delegável
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}>
                <input type="checkbox" checked={form.myDay} onChange={e => setForm({ ...form, myDay: e.target.checked, forTomorrow: e.target.checked ? false : form.forTomorrow })} /> Hoje
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}>
                <input type="checkbox" checked={form.forTomorrow} onChange={e => setForm({ ...form, forTomorrow: e.target.checked, myDay: e.target.checked ? false : form.myDay })} /> Amanhã
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addTask} style={C.btn(color)}>Salvar</button>
            <button onClick={() => setShowForm(false)} style={C.btn("#1e2130")}>Cancelar</button>
          </div>
        </div>
      )}

      <ScrollTabs tabs={tabs} active={view} onSelect={setView} color={view === "overdue" && overdueCount > 0 ? "#ef4444" : color} />

      {visible.length === 0 && (
        <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 36 }}>
          {filterText || filterPri || filterDate ? "Nenhuma tarefa corresponde ao filtro." : view === "today" ? "☀️ Nenhuma tarefa para hoje" : view === "tomorrow" ? "🌅 Nada programado para amanhã" : view === "overdue" ? "🎉 Sem vencidas!" : "Nenhuma tarefa"}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((task) => {
          const pc = PRIORITY_COLORS[task.priority] || color
          const overdue = isPast(task.deadline) && task.status !== "done"
          const isToday = checkIsToday(task)
          const isTomorrow = checkIsTomorrow(task)
          
          return (
            <div key={task.id} style={{ ...C.card, borderLeft: `4px solid ${pc}`, opacity: task.status === "done" ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                {sortBy === "manual" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button onClick={() => moveTask(task.id, -1)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, padding: 0 }}>↑</button>
                    <button onClick={() => moveTask(task.id, 1)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, padding: 0 }}>↓</button>
                  </div>
                )}
                <div style={{ paddingTop: sortBy === "manual" ? 4 : 1, flexShrink: 0 }}>
                  <Checkbox checked={task.status === "done"} onChange={() => toggleDone(task.id)} color={pc} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 6px", textDecoration: task.status === "done" ? "line-through" : "none", color: task.status === "done" ? "#4b5563" : "#e8eaf0", wordBreak: "break-word" }}>
                    {task.title}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                    <span style={C.tag(pc)}>{task.priority}</span>
                    {task.delegable && <span style={C.tag("#3b82f6")}>↗ Deleg.</span>}
                    {task.deadline  && <span style={C.tag(overdue ? "#ef4444" : "#6b7280")}>{overdue ? "⚠️ " : ""}{task.deadline}</span>}
                    {task.tags?.map((t, i) => <span key={i} style={C.tag()}>{t}</span>)}
                    {(task.notes || task.subtasks.length > 0) && (
                      <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>
                        {task.subtasks.length > 0 && `📋 ${task.subtasks.filter(s=>s.done).length}/${task.subtasks.length} `}
                        {task.notes && `📝 Anot.`}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0, paddingTop: sortBy === "manual" ? 4 : 0 }}>
                  <button onClick={() => toggleTomorrow(task.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: isTomorrow ? 1 : 0.2, padding: "2px 3px", transition: "opacity 0.2s" }} title={isTomorrow ? "Remover do Amanhã" : "Programar para Amanhã"}>🌅</button>
                  <button onClick={() => toggleMyDay(task.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: isToday ? 1 : 0.2, padding: "2px 3px", transition: "opacity 0.2s" }} title={isToday ? "Remover do Hoje" : "Adicionar ao Hoje"}>☀️</button>
                  <button onClick={() => setExpanded(expanded === task.id ? null : task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 12, padding: "2px 4px" }}>
                    {expanded === task.id ? "▲" : "▼"}
                  </button>
                  <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: 13, padding: "2px 3px" }}>✕</button>
                </div>
              </div>
              {expanded === task.id && (
                <SubtaskPanel task={task} color={pc}
                  onAdd={(text) => addSubtask(task.id, text)}
                  onToggle={(sid) => toggleSubtask(task.id, sid)}
                  onDelete={(sid) => delSubtask(task.id, sid)}
                  onUpdateNotes={updateTaskNotes} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 7. Módulo Produtividade ──────────────────────────────────────────────────
function ProductivityModule({ interruptions, setInterruptions, tasks, setTasks, isMobile, pomo, setPomo, events, setEvents, alerts, setAlerts }) {
  const color = "#22c55e"
  
  const [customPomo, setCustomPomo] = useState("")

  const [captureText, setCaptureText] = useState("")
  const [capturePriority, setCapturePriority] = useState("Média")
  const [captureTriage, setCaptureTriage] = useState("")
  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({ text: "", priority: "Média", triage: "" })
  const [inboxSort, setInboxSort] = useState("priority") 

  const [calDate, setCalDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [newEvent, setNewEvent] = useState("")
  const [newEventTags, setNewEventTags] = useState("")
  const [calSearch, setCalSearch] = useState("")

  const [alertForm, setAlertForm] = useState({ text: "", date: todayStr(), time: "" })

  const pomoProgress = pomo.isBreak ? ((5*60 - pomo.seconds)/(5*60))*100 : ((pomo.initialSec - pomo.seconds)/(pomo.initialSec))*100
  const R = 54, CIRCUM = 2 * Math.PI * R

  const capture = () => {
    if (!captureText.trim()) return
    const newItem = { id: Date.now(), text: captureText, priority: capturePriority, triage: captureTriage || null, done: false, createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }
    setInterruptions(prev => [newItem, ...prev])
    setCaptureText(""); setCapturePriority("Média"); setCaptureTriage("");
  }

  const saveEdit = (id) => {
    setInterruptions(prev => prev.map(i => i.id === id ? { ...i, text: editForm.text, priority: editForm.priority, triage: editForm.triage || null } : i))
    setEditingItem(null)
  }

  const toggleInt = (id) => setInterruptions(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i))
  const deleteInt = (id) => setInterruptions(prev => prev.filter(i => i.id !== id)) 

  const turnIntoTask = (id) => {
    const item = interruptions.find(i => i.id === id)
    if (!item) return
    setTasks(prev => [{ id: Date.now(), title: item.text, priority: item.priority, tags: ["Inbox"], status: "todo", myDay: false, plannedDate: "", delegable: false, subtasks: [], dueDate: todayStr() }, ...prev])
    deleteInt(id)
  }

  const startCustomPomo = () => {
    const mins = parseInt(customPomo, 10)
    if (isNaN(mins) || mins <= 0) return
    setPomo(p => ({ ...p, running: false, isBreak: false, seconds: mins * 60, initialSec: mins * 60 }))
    setCustomPomo("")
  }

  const addAlert = () => {
    if (!alertForm.text || !alertForm.date || !alertForm.time) return
    setAlerts(prev => [...prev, { id: Date.now(), ...alertForm, triggered: false }])
    setAlertForm({ text: "", date: todayStr(), time: "" })
  }
  const deleteAlert = (id) => setAlerts(prev => prev.filter(a => a.id !== id))

  const addEventForDate = () => {
    if (!newEvent.trim() || !selectedDate) return
    const tagsArr = newEventTags.split(",").map(t => t.trim()).filter(Boolean)
    setEvents(prev => [...prev, { id: Date.now(), date: selectedDate, title: newEvent, tags: tagsArr }])
    setNewEvent(""); setNewEventTags("")
  }

  const sortedInbox = [...interruptions].sort((a,b) => {
     if (inboxSort === "priority") {
       const o = { Urgente: 1, Alta: 2, Média: 3, Baixa: 4, Baixíssima: 5 }
       return (o[a.priority] || 9) - (o[b.priority] || 9)
     }
     return b.id - a.id // mais recentes
  })

  const firstDay = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate()
  
  const handlePrevMonth = () => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))
  const handleNextMonth = () => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))

  const Pomodoro = () => (
    <div style={{ ...C.card, textAlign: "center", marginBottom: 20 }}>
      <p style={{ ...C.lbl, textAlign: "center", marginBottom: 2 }}>{pomo.isBreak ? "☕ Intervalo" : "🍅 Foco"}</p>
      <p style={{ color: "#4b5563", fontSize: 10, margin: "0 0 14px" }}>Ciclo {pomo.cycles + 1}</p>
      <div style={{ position: "relative", width: 130, height: 130, margin: "0 auto 14px" }}>
        <svg width="130" height="130" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
          <circle cx="65" cy="65" r={R} fill="none" stroke="#1e2130" strokeWidth="7" />
          <circle cx="65" cy="65" r={R} fill="none" stroke={pomo.isBreak ? "#3b82f6" : color} strokeWidth="7"
            strokeDasharray={CIRCUM} strokeDashoffset={CIRCUM * (1 - pomoProgress / 100)}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 800, color: pomo.isBreak ? "#3b82f6" : color, lineHeight: 1 }}>{fmtTime(pomo.seconds)}</span>
          <span style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{pomo.cycles} ciclos</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
        <button onClick={() => setPomo(p => ({ ...p, running: !p.running }))} style={C.btn(pomo.running ? "#4b5563" : color)}>
          {pomo.running ? "⏸" : "▶"} {pomo.running ? "Pausar" : "Iniciar"}
        </button>
        <button onClick={() => { setPomo(p => ({ ...p, running: false, seconds: 25*60, initialSec: 25*60, isBreak: false, cycles: 0 })) }} style={C.btn("#1e2130")}>↺</button>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        {[["25m", 25*60, false], ["5m", 5*60, true], ["15m", 15*60, true]].map(([lbl, sec, isBreak]) => (
          <button key={lbl} onClick={() => { setPomo(p => ({ ...p, running: false, isBreak, seconds: sec, initialSec: sec })) }}
            style={{ ...C.btn("#1e2130"), fontSize: 11, padding: "4px 8px" }}>{lbl}</button>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 10 }}>
           <input type="number" placeholder="Min" value={customPomo} onChange={e => setCustomPomo(e.target.value)} onKeyDown={e => e.key === 'Enter' && startCustomPomo()} style={{ ...C.input, width: 50, padding: "4px 6px", fontSize: 11 }} />
           <button onClick={startCustomPomo} style={{ ...C.btn("#1e2130"), fontSize: 11, padding: "4px 8px" }}>▶</button>
        </div>
      </div>
    </div>
  )

  const MiniCal = () => {
    const filteredEvents = events.filter(e => {
       if(!calSearch.trim()) return true
       const q = calSearch.toLowerCase()
       return e.title.toLowerCase().includes(q) || (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
    }).sort((a, b) => a.date.localeCompare(b.date))
    
    const hasSearch = calSearch.trim().length > 0;

    return (
      <div style={C.card}>
        <p style={{ ...C.lbl, marginBottom: 8 }}>📅 Calendário</p>
        
        <div style={{ marginBottom: 12 }}>
          <input placeholder="Busca global de eventos..." value={calSearch} onChange={e => setCalSearch(e.target.value)} style={{ ...C.input, fontSize: 12, padding: "6px 10px", background: "#0a0b0f" }} />
        </div>

        {hasSearch ? (
           <div style={{ background: "#0a0b0f", padding: 10, borderRadius: 8 }}>
              <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>Resultados da busca:</p>
              {filteredEvents.length === 0 && <p style={{ fontSize: 11, color: "#4b5563", fontStyle: "italic", margin: "0 0 8px" }}>Nenhum evento.</p>}
              {filteredEvents.map(e => (
                 <div key={e.id} style={{ fontSize: 12, marginBottom: 10, display: "flex", flexDirection: "column", borderBottom: "1px solid #1e2130", paddingBottom: 6 }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={{ color: "#a855f7" }}>•</span> 
                      <span style={{ color: "#6b7280", fontSize: 10 }}>[{e.date.split('-').reverse().join('/')}]</span>
                      <span style={{ wordBreak: "break-word", fontWeight: 600 }}>{e.title}</span>
                    </div>
                    {e.tags && e.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginLeft: 12, marginTop: 4 }}>
                        {e.tags.map((t, idx) => <span key={idx} style={{ ...C.tag("#a855f7"), fontSize: 9, padding: "1px 5px" }}>{t}</span>)}
                      </div>
                    )}
                 </div>
              ))}
           </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <button onClick={handlePrevMonth} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}>&lt;</button>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, margin: 0, textTransform: "capitalize" }}>
                {calDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </p>
              <button onClick={handleNextMonth} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}>&gt;</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, textAlign: "center" }}>
              {["D","S","T","Q","Q","S","S"].map((d, i) => <span key={i} style={{ fontSize: 9, color: "#4b5563", fontWeight: 700, padding: "2px 0" }}>{d}</span>)}
              {Array.from({ length: firstDay }).map((_, i) => <span key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const dateStr = `${calDate.getFullYear()}-${String(calDate.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
                const isToday = dateStr === todayStr()
                const hasEvt  = filteredEvents.some(e => e.date === dateStr)
                const isSel   = selectedDate === dateStr
                
                return (
                  <div key={d} style={{ position: "relative", cursor: "pointer", height: 24 }} onClick={() => setSelectedDate(isSel ? null : dateStr)}>
                    <div style={{ padding: "3px 1px", background: isSel ? "#4b5563" : isToday ? color : "transparent", borderRadius: 4, color: isToday ? "#000" : isSel ? "#fff" : "#9ca3af", fontSize: 10, fontWeight: isToday ? 700 : 400, zIndex: 2, position: "relative" }}>{d}</div>
                    <div style={{ position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2, zIndex: 1 }}>
                      {hasEvt && <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#a855f7" }} />}
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div style={{ marginTop: 16, borderTop: "1px solid #1e2130", paddingTop: 10 }}>
              {selectedDate && (
                <div style={{ background: "#0a0b0f", padding: 10, borderRadius: 8 }}>
                  <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>Eventos de {selectedDate.split('-').reverse().join('/')}:</p>
                  
                  {filteredEvents.filter(e => e.date === selectedDate).length === 0 && <p style={{ fontSize: 11, color: "#4b5563", fontStyle: "italic", margin: "0 0 8px" }}>Sem eventos.</p>}
                  
                  {filteredEvents.filter(e => e.date === selectedDate).map(e => (
                     <div key={e.id} style={{ fontSize: 12, marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 5 }}>
                          <span style={{ color: "#a855f7" }}>•</span> 
                          <span style={{ wordBreak: "break-word" }}>{e.title}</span>
                        </div>
                        {e.tags && e.tags.length > 0 && (
                          <div style={{ display: "flex", gap: 4, marginLeft: 12, marginTop: 2 }}>
                            {e.tags.map((t, idx) => <span key={idx} style={{ ...C.tag("#a855f7"), fontSize: 9, padding: "1px 5px" }}>{t}</span>)}
                          </div>
                        )}
                     </div>
                  ))}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                    <input value={newEvent} onChange={e => setNewEvent(e.target.value)} placeholder="Novo evento..." style={{ ...C.input, padding: "5px 8px", fontSize: 12 }} />
                    <div style={{ display: "flex", gap: 5 }}>
                      <input value={newEventTags} onChange={e => setNewEventTags(e.target.value)} onKeyDown={e => e.key==='Enter' && addEventForDate()} placeholder="Tags (vírgula)" style={{ ...C.input, padding: "5px 8px", fontSize: 12, flex: 1 }} />
                      <button onClick={addEventForDate} style={{ ...C.btn("#a855f7"), padding: "5px 10px", fontSize: 12 }}>+ Add</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <ModuleHeader title="Produtividade" subtitle="Mantenha o foco e capture demandas" color={color} isMobile={isMobile} />

      {/* Pomodoro at Top */}
      <Pomodoro />

      {/* Quick Capture */}
      <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
        <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>⚡ Captura Rápida (Inbox)</p>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
          <input placeholder="O que é / O que aconteceu?" value={captureText} onChange={e => setCaptureText(e.target.value)} onKeyDown={e => e.key === "Enter" && !isMobile && capture()} style={{ ...C.input, flex: 1 }} />
          <select value={captureTriage} onChange={e => setCaptureTriage(e.target.value)} style={{ ...C.input, width: isMobile ? "100%" : 150 }} title="Tag Opcional">
             <option value="">Sem Tag</option>
             {TRIAGE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
          <select value={capturePriority} onChange={e => setCapturePriority(e.target.value)} style={{ ...C.input, width: isMobile ? "100%" : 130 }}>
            {Object.keys(PRIORITY_COLORS).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={capture} style={C.btn(color)}>Capturar</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", gap: 20 }}>
        {/* Inbox List */}
        <div>
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
             <span style={C.lbl}>Lista de Interrupções ({sortedInbox.length})</span>
             <select value={inboxSort} onChange={e => setInboxSort(e.target.value)} style={{ ...C.input, width: "auto", padding: "4px 8px", fontSize: 11 }}>
                <option value="priority">Por Prioridade</option>
                <option value="date">Mais Recentes</option>
             </select>
           </div>

           <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedInbox.length === 0
              ? <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 32 }}>Nenhum item na caixa de entrada! 🎉</div>
              : sortedInbox.map(item => {
                  const tOpt = TRIAGE_OPTIONS.find(o => o.id === item.triage);
                  return (
                    <div key={item.id} style={{...C.card, borderLeft: `4px solid ${PRIORITY_COLORS[item.priority]}`, opacity: item.done ? 0.5 : 1 }}>
                      {editingItem === item.id ? (
                         <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                           <input value={editForm.text} onChange={e => setEditForm({...editForm, text: e.target.value})} style={C.input} />
                           <div style={{ display: "flex", gap: 8 }}>
                             <select value={editForm.triage} onChange={e => setEditForm({...editForm, triage: e.target.value})} style={{ ...C.input, flex: 1 }}>
                               <option value="">Sem Tag</option>
                               {TRIAGE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                             </select>
                             <select value={editForm.priority} onChange={e => setEditForm({...editForm, priority: e.target.value})} style={{ ...C.input, flex: 1 }}>
                               {Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}
                             </select>
                           </div>
                           <div style={{ display: "flex", gap: 6 }}>
                             <button onClick={() => saveEdit(item.id)} style={C.btn(color)}>Salvar</button>
                             <button onClick={() => setEditingItem(null)} style={C.btn("transparent")}>Cancelar</button>
                           </div>
                         </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ marginTop: 2 }}><Checkbox checked={item.done} onChange={() => toggleInt(item.id)} color={PRIORITY_COLORS[item.priority]} /></div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 13, textDecoration: item.done ? "line-through" : "none", color: item.done ? "#6b7280" : "#e8eaf0", wordBreak: "break-word" }}>{item.text}</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
                              <span style={{ ...C.tag(PRIORITY_COLORS[item.priority]), padding: "2px 6px", fontSize: 9 }}>{item.priority}</span>
                              {tOpt && <span style={{ ...C.tag(tOpt.color), padding: "2px 6px", fontSize: 9 }}>{tOpt.icon} {tOpt.label}</span>}
                              <span style={{ fontSize: 10, color: "#6b7280", alignSelf: "center", marginLeft: 4 }}>{item.createdAt}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => turnIntoTask(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f97316", padding: "0 4px", fontSize: 12 }} title="Transformar em Tarefa">↗️ Tarefa</button>
                            <button onClick={() => { setEditForm({ text: item.text, priority: item.priority, triage: item.triage || "" }); setEditingItem(item.id) }} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", padding: "0 4px", fontSize: 12 }}>✏️</button>
                            <button onClick={() => deleteInt(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "0 4px", fontSize: 13 }}>✕</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
              })
            }
          </div>
        </div>

        {/* Right Column: Alerts & Calendar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          
          {/* Alerts Panel */}
          <div style={C.card}>
            <span style={{ ...C.lbl, color: "#ef4444" }}>⏰ Alertas Programados</span>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              <input placeholder="Descrição do alerta..." value={alertForm.text} onChange={e => setAlertForm({...alertForm, text: e.target.value})} style={{ ...C.input, fontSize: 12 }} />
              <div style={{ display: "flex", gap: 6 }}>
                <input type="date" value={alertForm.date} onChange={e => setAlertForm({...alertForm, date: e.target.value})} style={{ ...C.input, fontSize: 11, flex: 1 }} />
                <input type="time" value={alertForm.time} onChange={e => setAlertForm({...alertForm, time: e.target.value})} style={{ ...C.input, fontSize: 11, width: 85 }} />
              </div>
              <button onClick={addAlert} style={{ ...C.btn("#ef4444"), fontSize: 11, padding: "6px" }}>+ Criar Alerta</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
               {alerts.length === 0 && <p style={{ fontSize: 11, color: "#4b5563", textAlign: "center", margin: "4px 0" }}>Nenhum alerta ativo.</p>}
               {alerts.map(a => (
                 <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0b0f", padding: 8, borderRadius: 6, opacity: a.triggered ? 0.5 : 1 }}>
                   <div style={{ minWidth: 0, flex: 1 }}>
                     <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 600, wordBreak: "break-word", textDecoration: a.triggered ? "line-through" : "none" }}>{a.text}</p>
                     <p style={{ margin: 0, fontSize: 10, color: "#ef4444" }}>{a.date.split('-').reverse().join('/')} - {a.time}</p>
                   </div>
                   <button onClick={() => deleteAlert(a.id)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: "0 4px" }}>✕</button>
                 </div>
               ))}
            </div>
          </div>

          <MiniCal />
        </div>
      </div>
    </div>
  )
}

// ─── 8. Módulo Indicadores ────────────────────────────────────────────────────
function IndicatorsModule({ indicators, setIndicators, isMobile }) {
  const color = "#3b82f6"
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState("Pessoal")
  const [editingId, setEditingId] = useState(null)
  const [showHistory, setShowHistory] = useState(null)
  
  const [form, setForm] = useState({ name: "", category: "Pessoal", value: 0, target: 100, unit: "%" })
  const [updateVals, setUpdateVals] = useState({})

  const CATS = ["Pessoal", "Regulatório", "Squad"]

  const openNew = () => {
    setForm({ name: "", category: tab, value: 0, target: 100, unit: "%" })
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (ind) => {
    setForm({ name: ind.name, category: ind.category, value: ind.value, target: ind.target, unit: ind.unit })
    setEditingId(ind.id)
    setShowForm(true)
  }

  const saveForm = () => {
    if (!form.name.trim()) return
    if (editingId) {
      setIndicators(prev => prev.map(i => i.id === editingId ? { ...i, ...form, value: Number(form.value), target: Number(form.target) } : i))
    } else {
      setIndicators(prev => [...prev, { ...form, id: Date.now(), value: Number(form.value), target: Number(form.target), history: [] }])
    }
    setShowForm(false)
  }

  const updateIndicator = (id) => {
    const d = updateVals[id] || {}
    const newVal = Number(d.value)
    
    // Check se enviou um novo valor numérico
    const hasNewVal = d.value !== undefined && d.value !== "" && !isNaN(newVal)
    // Check se enviou uma nota
    const hasNote = d.note && d.note.trim() !== ""

    if (!hasNewVal && !hasNote) return // Nada a atualizar
    
    const updateDate = d.date || todayStr()

    setIndicators(prev => prev.map(i => {
      if (i.id === id) {
        // Se preencheu valor novo usa ele, senão mantém o valor atual
        const finalVal = hasNewVal ? newVal : i.value;
        const diff = finalVal - i.value;
        const histItem = { id: Date.now(), date: updateDate, value: finalVal, diff, note: d.note || "" }
        return { ...i, value: finalVal, history: [histItem, ...(i.history || [])] }
      }
      return i
    }))
    setUpdateVals(prev => ({ ...prev, [id]: { value: "", date: "", note: "" } }))
  }

  const updateLocalVal = (id, field, val) => {
    setUpdateVals(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: val } }))
  }

  const deleteInd = (id) => setIndicators(prev => prev.filter(i => i.id !== id))

  const getStatus = (value, target) => {
    const pct = (value / target) * 100
    if (pct >= 90) return { color: "#22c55e", label: "🟢 No prazo / OK" }
    if (pct >= 60) return { color: "#eab308", label: "🟡 Atenção"  }
    return              { color: "#ef4444", label: "🔴 Crítico"  }
  }

  const currentInds = indicators.filter(i => i.category === tab)

  return (
    <div>
      <ModuleHeader title="Indicadores" subtitle="KPIs e acompanhamento de metas" color={color} isMobile={isMobile}
        action={<button onClick={openNew} style={C.btn(color)}>+ KPI</button>} />

      <ScrollTabs tabs={CATS.map(c => ({ id: c, label: c }))} active={tab} onSelect={(id) => { setTab(id); setShowForm(false) }} color={color} />

      {showForm && (
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            <input placeholder="Nome do indicador *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={C.input} />
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 10 }}>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...C.input, appearance: "none" }}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="Unidade (%...)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={C.input} title="Unidade" />
              <input type="number" placeholder="Valor atual" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} style={C.input} title="Valor Atual" />
              <input type="number" placeholder="Meta" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} style={C.input} title="Meta" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveForm} style={C.btn(color)}>Salvar</button>
            <button onClick={() => setShowForm(false)} style={C.btn("#1e2130")}>Cancelar</button>
          </div>
        </div>
      )}

      {currentInds.length === 0 ? (
        <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 36 }}>Nenhum indicador em {tab}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px,1fr))", gap: 12 }}>
          {currentInds.map(ind => {
            const pct    = Math.min(100, Math.round((ind.value / ind.target) * 100))
            const status = getStatus(ind.value, ind.target)
            const upData = updateVals[ind.id] || {}
            
            return (
              <div key={ind.id} style={{ ...C.card, borderLeft: `4px solid ${status.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: 14, flex: 1, paddingRight: 8 }}>{ind.name}</p>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => openEdit(ind)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", fontSize: 12, padding: 0 }}>✏️</button>
                    <button onClick={() => deleteInd(ind.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: 13, padding: 0 }}>✕</button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: status.color, margin: "0 0 12px" }}>{status.label}</p>
                
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: status.color }}>{ind.value}</span>
                  <span style={{ color: "#4b5563", fontSize: 12 }}>/ {ind.target} {ind.unit}</span>
                </div>
                
                <div style={{ height: 7, background: "#1e2130", borderRadius: 4, marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: status.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p style={{ fontSize: 10, color: "#6b7280", margin: 0 }}>{pct}% da meta</p>
                  <button onClick={() => setShowHistory(showHistory === ind.id ? null : ind.id)} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 10, cursor: "pointer", padding: 0 }}>
                    {showHistory === ind.id ? "Ocultar Histórico" : "Ver Histórico"}
                  </button>
                </div>

                {showHistory === ind.id && (
                  <div style={{ background: "#0a0b0f", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                    <span style={C.lbl}>Histórico de Avanços</span>
                    {(ind.history || []).length === 0 ? (
                      <p style={{ fontSize: 11, color: "#4b5563", margin: "4px 0" }}>Nenhum registro.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
                        {ind.history.map(h => (
                           <div key={h.id} style={{ display: "flex", flexDirection: "column", fontSize: 11, borderBottom: "1px solid #1e2130", paddingBottom: 6 }}>
                             <div style={{ display: "flex", justifyContent: "space-between" }}>
                               <span style={{ color: "#9ca3af" }}>{h.date.split("-").reverse().join("/")}</span>
                               <span style={{ fontWeight: 600 }}>Valor: {h.value} <span style={{ color: h.diff >= 0 ? "#22c55e" : "#ef4444" }}>({h.diff > 0 ? '+' : ''}{h.diff})</span></span>
                             </div>
                             {h.note && <span style={{ color: "#6b7280", marginTop: 3, fontStyle: "italic", whiteSpace: "pre-wrap" }}>{h.note}</span>}
                           </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#1e2130", padding: 8, borderRadius: 8 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" placeholder="Novo valor (Opcional)" value={upData.value ?? ""} onChange={e => updateLocalVal(ind.id, 'value', e.target.value)} onKeyDown={e => e.key === 'Enter' && updateIndicator(ind.id)}
                           style={{ ...C.input, width: 130, padding: "5px 8px", fontSize: 11 }} />
                    <input type="date" value={upData.date ?? ""} onChange={e => updateLocalVal(ind.id, 'date', e.target.value)}
                           style={{ ...C.input, flex: 1, padding: "5px 8px", fontSize: 11 }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input placeholder="Apenas Observação/Entrega (Opcional)" value={upData.note ?? ""} onChange={e => updateLocalVal(ind.id, 'note', e.target.value)} onKeyDown={e => e.key === 'Enter' && updateIndicator(ind.id)} style={{ ...C.input, flex: 1, padding: "5px 8px", fontSize: 11 }} />
                    <button onClick={() => updateIndicator(ind.id)} style={{ ...C.btn(status.color), padding: "5px 10px", fontSize: 11 }}>Salvar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 9. Módulo Notas ──────────────────────────────────────────────────────────
function NotesModule({ notes, setNotes, teams, isMobile }) {
  const color = "#a855f7"
  const [tab, setTab] = useState("meetings")
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  const [searchQ, setSearchQ] = useState("")
  const [form, setForm] = useState({ title: "", content: "", date: new Date().toLocaleDateString("pt-BR"), team: "", tags: "", person: "", type: "Recebido" })

  const SECS = [
    { id: "meetings",   label: "📅 Reuniões"    },
    { id: "feedbacks",  label: "💬 Feedbacks"   },
    { id: "changes",    label: "🚀 Changes"     },
    { id: "others",     label: "📝 Geral"       },
  ]

  const openNew = () => {
    setForm({ title: "", content: "", date: todayStr().split('-').reverse().join('/'), team: "", tags: "", person: "", type: "Recebido" })
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (note) => {
    setForm({ title: note.title, content: note.content, date: note.date, team: note.team || "", person: note.person || "", type: note.type || "Recebido", tags: (note.tags||[]).join(", ") })
    setEditingId(note.id)
    setShowForm(true)
  }

  const saveNote = () => {
    if (!form.title.trim()) return
    const tagsArr = form.tags.split(",").map(t => t.trim()).filter(Boolean)
    const newNote = { ...form, tags: tagsArr }
    
    if (editingId) {
      setNotes(prev => ({ ...prev, [tab]: prev[tab].map(n => n.id === editingId ? { ...n, ...newNote } : n) }))
    } else {
      setNotes(prev => ({ ...prev, [tab]: [{ id: Date.now(), ...newNote }, ...(prev[tab]||[])] }))
    }
    setShowForm(false)
  }
  
  const deleteNote = (id) => setNotes(prev => ({ ...prev, [tab]: prev[tab].filter(n => n.id !== id) }))
  
  const rawCurrent = notes[tab] || []
  
  const current = rawCurrent.filter(n => {
    if(!searchQ.trim()) return true
    const q = searchQ.toLowerCase()
    return n.title.toLowerCase().includes(q) || 
           (n.content && n.content.toLowerCase().includes(q)) ||
           (n.tags && n.tags.some(t => t.toLowerCase().includes(q))) ||
           (n.team && n.team.toLowerCase().includes(q)) ||
           (n.person && n.person.toLowerCase().includes(q))
  })

  return (
    <div>
      <ModuleHeader title="Notas & Docs" subtitle="Reuniões, feedbacks e anotações gerais" color={color} isMobile={isMobile}
        action={<button onClick={openNew} style={C.btn(color)}>+ Novo</button>} />

      <div style={{ marginBottom: 16 }}>
         <input placeholder="Busca inteligente (título, conteúdo, pessoa ou tags)..." value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ ...C.input, background: "#12141a" }} />
      </div>

      <ScrollTabs tabs={SECS} active={tab} onSelect={(id) => { setTab(id); setShowForm(false) }} color={color} />

      {showForm && (
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tab === "changes" ? (
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                <input placeholder="Número da Change (ex: CHG-123) *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ ...C.input, flex: 1 }} />
                <select value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} style={{ ...C.input, flex: 1 }}>
                   <option value="">Nenhum Time Associado</option>
                   {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                <input placeholder="Data (DD/MM/AAAA)" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ ...C.input, width: isMobile ? "100%" : 140 }} />
              </div>
            ) : tab === "feedbacks" ? (
               <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                    <input placeholder="Tópico do Feedback *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ ...C.input, flex: 1 }} />
                    <input placeholder="Data (DD/MM/AAAA)" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ ...C.input, width: isMobile ? "100%" : 140 }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ ...C.input, width: isMobile ? "100%" : 140 }}>
                      <option value="Recebido">Recebido</option>
                      <option value="Dado">Dado</option>
                    </select>
                    <input placeholder="Nome da pessoa relacionada *" value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} style={{ ...C.input, flex: 1 }} />
                  </div>
               </div>
            ) : (
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                <input placeholder="Título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ ...C.input, flex: 1 }} />
                <input placeholder="Data (DD/MM/AAAA)" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ ...C.input, width: isMobile ? "100%" : 140 }} />
              </div>
            )}
            
            <input placeholder="Tags (separadas por vírgula)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} style={C.input} />

            <textarea placeholder={tab === "changes" ? "Itens entregues..." : tab === "feedbacks" ? "Pontos fortes e oportunidades detalhadas..." : "Conteúdo detalhado..."} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
              style={{ ...C.input, minHeight: 100, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
            
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveNote} style={C.btn(color)}>Salvar</button>
              <button onClick={() => setShowForm(false)} style={C.btn("#1e2130")}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {current.length === 0
          ? <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 36 }}>Nenhuma entrada encontrada.</div>
          : current.map(note => (
            <div key={note.id} style={{ ...C.card, borderLeft: `4px solid ${color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <h4 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, margin: "0 0 4px", fontSize: 15, wordBreak: "break-word" }}>{note.title}</h4>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    <span style={C.tag(color)}>{note.date}</span>
                    {note.team && <span style={C.tag("#3b82f6")}>Time: {note.team}</span>}
                    {note.person && <span style={C.tag("#eab308")}>{note.type}: {note.person}</span>}
                    {(note.tags || []).map((t, idx) => <span key={idx} style={{ ...C.tag("#6b7280"), color: "#9ca3af" }}>#{t}</span>)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(note)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", fontSize: 12, padding: 0 }}>✏️ Editar</button>
                  <button onClick={() => deleteNote(note.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, padding: "0 0 0 8px" }}>🗑</button>
                </div>
              </div>
              {note.content && <p style={{ fontSize: 13, color: "#9ca3af", margin: "10px 0 0", lineHeight: 1.7, whiteSpace: "pre-wrap", borderTop: "1px solid #1e2130", paddingTop: 10 }}>{note.content}</p>}
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── 10. Main App Wrapper (Autenticação + Sincronização) ──────────────────────
function MainApp({ user }) {
  const isMobile = useIsMobile()
  const [activeModule, setActiveModule] = useState("tasks")
  
  // Utilizando o hook inteligente para puxar os dados do Firebase, ou usar o padrão se novo
  const [teams, setTeams, tLoaded] = useSyncedState("teams", INIT_TEAMS, user);
  const [tasks, setTasks, tkLoaded] = useSyncedState("tasks", INIT_TASKS, user);
  const [interruptions, setInterruptions, intLoaded] = useSyncedState("interruptions", [], user);
  const [notes, setNotes, nLoaded] = useSyncedState("notes", INIT_NOTES, user);
  const [indicators, setIndicators, indLoaded] = useSyncedState("indicators", INIT_INDICATORS, user);
  const [events, setEvents, evLoaded] = useSyncedState("events", [], user);
  const [alerts, setAlerts, altLoaded] = useSyncedState("alerts", [], user);

  const [pomo, setPomo] = useState({ running: false, seconds: 25 * 60, initialSec: 25 * 60, isBreak: false, cycles: 0 })
  const [activeAlert, setActiveAlert] = useState(null)
  const [dbError, setDbError] = useState(false)

  const allLoaded = tLoaded && tkLoaded && intLoaded && nLoaded && indLoaded && evLoaded && altLoaded;

  useEffect(() => {
    const handleDbError = () => setDbError(true);
    window.addEventListener('db-permission-error', handleDbError);
    return () => window.removeEventListener('db-permission-error', handleDbError);
  }, []);

  // Pomodoro Tracker
  useEffect(() => {
    let interval;
    if (pomo.running) {
      interval = setInterval(() => {
        setPomo(p => {
          if (p.seconds <= 1) {
            playBeep()
            const goBreak = !p.isBreak
            return { ...p, running: false, isBreak: goBreak, seconds: goBreak ? 5 * 60 : 25 * 60, initialSec: goBreak ? 5 * 60 : 25 * 60, cycles: p.cycles + (p.isBreak ? 0 : 1) }
          }
          return { ...p, seconds: p.seconds - 1 }
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [pomo.running])

  // Alerts Watcher (Executa a cada 5 segundos para bater horário)
  useEffect(() => {
    if (!allLoaded) return;
    const interval = setInterval(() => {
      const now = new Date();
      const currDate = todayStr();
      const currTime = fmtTime(now.getHours() * 60 + now.getMinutes());

      setAlerts(prev => {
        let triggeredAny = false;
        const next = prev.map(a => {
           if (!a.triggered && a.date === currDate && a.time === currTime) {
             triggeredAny = true;
             playBeep();
             setActiveAlert(a);
             return { ...a, triggered: true };
           }
           return a;
        });
        return triggeredAny ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [allLoaded, setAlerts]);

  if (!allLoaded) {
    return <div style={{ background: "#0a0b0f", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", color: "#6b7280", fontFamily: "'Manrope',sans-serif" }}>Sincronizando seus dados...</div>;
  }

  const acMod        = MODULES.find(m => m.id === activeModule)
  const overdueCount = tasks.filter(t => isPast(t.deadline) && t.status !== "done").length
  const myDayCount   = tasks.filter(t => checkIsToday(t) && t.status !== "done").length
  const today        = new Date()

  const handleLogout = () => signOut(auth);

  const sharedProps = { teams, setTeams, tasks, setTasks, interruptions, setInterruptions, notes, setNotes, indicators, setIndicators, isMobile, pomo, setPomo, events, setEvents, alerts, setAlerts }

  return (
    <div style={{ fontFamily: "'Manrope',sans-serif", background: "#0a0b0f", color: "#e8eaf0", minHeight: "100vh", position: "relative" }}>

      {/* ── DESKTOP SIDEBAR ── */}
      {!isMobile && (
        <aside style={{ width: 228, background: "#0c0e14", borderRight: "1px solid #1a1d27", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
          <div style={{ padding: "20px 18px", borderBottom: "1px solid #1a1d27" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${acMod.color}cc, ${acMod.color}44)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{acMod.icon}</div>
              <div>
                <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, margin: 0 }}>Meu Trampo</h1>
                <p style={{ fontSize: 9, color: "#6b7280", margin: 0, letterSpacing: "1px" }}>VSO DASHBOARD</p>
              </div>
            </div>
          </div>

          <nav style={{ flex: 1, padding: "10px 0", overflowY: "auto" }}>
            {MODULES.map(m => {
              const isActive = activeModule === m.id
              const badge = m.id === "tasks" && overdueCount > 0 ? overdueCount : null
              return (
                <button key={m.id} onClick={() => setActiveModule(m.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 18px", border: "none",
                    background: isActive ? `${m.color}14` : "transparent",
                    color: isActive ? m.color : "#6b7280",
                    borderLeft: `3px solid ${isActive ? m.color : "transparent"}`,
                    cursor: "pointer", fontSize: 13, fontWeight: isActive ? 600 : 400, textAlign: "left", transition: "all 0.15s" }}>
                  <span style={{ fontSize: 14 }}>{m.icon}</span>
                  <span style={{ flex: 1 }}>{m.fullLabel}</span>
                  {badge && <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{badge}</span>}
                </button>
              )
            })}
          </nav>

          <div style={{ padding: "12px 18px", borderTop: "1px solid #1a1d27" }}>
            <p style={{ fontSize: 11, color: "#4b5563", margin: "0 0 2px", fontWeight: 600, textTransform: "capitalize" }}>
              {today.toLocaleDateString("pt-BR", { weekday: "long" })}
            </p>
            <p style={{ fontSize: 10, color: "#374151", margin: "0 0 10px" }}>
              {today.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <div style={{ flex: 1, background: "#f97316" + "22", borderRadius: 6, padding: "5px 8px", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f97316" }}>{myDayCount}</p>
                <p style={{ margin: 0, fontSize: 9, color: "#6b7280" }}>Hoje</p>
              </div>
              {overdueCount > 0 && (
                <div style={{ flex: 1, background: "#ef4444" + "22", borderRadius: 6, padding: "5px 8px", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#ef4444" }}>{overdueCount}</p>
                  <p style={{ margin: 0, fontSize: 9, color: "#6b7280" }}>Vencidas</p>
                </div>
              )}
              {pomo.running && (
                 <div style={{ width: "100%", height: 38, marginTop: 4 }}>
                   <MiniPomoHeader pomo={pomo} />
                 </div>
              )}
            </div>
            <button onClick={handleLogout} style={{ ...C.btn("transparent"), color: "#ef4444", fontSize: 12, marginTop: 10, width: "100%", padding: "8px" }}>🚪 Sair da Conta</button>
          </div>
        </aside>
      )}

      {/* ── MOBILE TOP HEADER ── */}
      {isMobile && (
        <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "#0c0e14", borderBottom: "1px solid #1a1d27", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: `linear-gradient(135deg, ${acMod.color}cc, ${acMod.color}44)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{acMod.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, margin: 0, color: acMod.color }}>{acMod.fullLabel}</h1>
            <p style={{ fontSize: 9, color: "#6b7280", margin: 0, letterSpacing: "0.8px" }}>MEU TRAMPO</p>
          </div>
          <div style={{ display: "flex", gap: 6, height: 32 }}>
            <MiniPomoHeader pomo={pomo} />
            <button onClick={handleLogout} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 18, padding: "0 6px" }}>🚪</button>
          </div>
        </header>
      )}

      {/* ── MAIN CONTENT ── */}
      <main style={{
        marginLeft: isMobile ? 0 : 228,
        paddingTop:  isMobile ? 64 : 0,
        paddingBottom: isMobile ? 74 : 0,
        padding: isMobile ? "64px 14px 74px" : "28px 32px",
        maxWidth: isMobile ? "100%" : `calc(100vw - 228px)`,
        boxSizing: "border-box",
        minHeight: "100vh",
      }}>
        {activeModule === "teams"        && <TeamsModule        {...sharedProps} />}
        {activeModule === "tasks"        && <TasksModule        {...sharedProps} />}
        {activeModule === "productivity" && <ProductivityModule {...sharedProps} />}
        {activeModule === "indicators"   && <IndicatorsModule   {...sharedProps} />}
        {activeModule === "notes"        && <NotesModule        {...sharedProps} />}
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      {isMobile && (
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "#0c0e14", borderTop: "1px solid #1a1d27", display: "flex", alignItems: "stretch", height: 64 }}>
          {MODULES.map(m => {
            const isActive = activeModule === m.id
            const badge = m.id === "tasks" && overdueCount > 0 ? overdueCount : null
            return (
              <button key={m.id} onClick={() => setActiveModule(m.id)}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", background: "transparent", cursor: "pointer", padding: "6px 2px", position: "relative",
                  borderTop: `2px solid ${isActive ? m.color : "transparent"}`, transition: "all 0.15s" }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
                <span style={{ fontSize: 9, color: isActive ? m.color : "#6b7280", fontWeight: isActive ? 700 : 400, letterSpacing: "0.2px" }}>{m.label}</span>
                {badge && (
                  <div style={{ position: "absolute", top: 6, right: "50%", marginRight: -18, background: "#ef4444", color: "#fff", borderRadius: 8, padding: "0px 4px", fontSize: 9, fontWeight: 700, lineHeight: "14px" }}>{badge}</div>
                )}
              </button>
            )
          })}
        </nav>
      )}

      {/* ── POPUP DE ALERTA GLOBAL ── */}
      {activeAlert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#12141a", border: "2px solid #ef4444", padding: "30px 20px", borderRadius: 16, textAlign: "center", maxWidth: 400, width: "90%", boxShadow: "0 10px 40px rgba(239, 68, 68, 0.2)" }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>⏰</div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", color: "#ef4444", margin: "0 0 8px", fontSize: 24, fontWeight: 800 }}>Alerta!</h2>
            <p style={{ fontSize: 16, color: "#e8eaf0", marginBottom: 24, lineHeight: 1.5 }}>{activeAlert.text}</p>
            <button onClick={() => setActiveAlert(null)} style={{ ...C.btn("#ef4444"), width: "100%", padding: "12px" }}>Ciente / Fechar</button>
          </div>
        </div>
      )}

      {/* ── POPUP DE ERRO DO FIRESTORE (PERMISSÕES) ── */}
      {dbError && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, backdropFilter: "blur(4px)", padding: 20 }}>
          <div style={{ background: "#12141a", border: "2px solid #ef4444", padding: "30px 20px", borderRadius: 16, maxWidth: 500, width: "100%", boxShadow: "0 10px 40px rgba(239, 68, 68, 0.3)" }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", color: "#ef4444", margin: "0 0 16px", fontSize: 22, fontWeight: 800, textAlign: "center" }}>⚠️ Erro de Permissão no Banco de Dados</h2>
            <p style={{ fontSize: 14, color: "#e8eaf0", marginBottom: 16, lineHeight: 1.6 }}>
              O Firebase bloqueou o acesso ao seu Firestore. Por padrão, ele vem bloqueado por segurança.
            </p>
            <p style={{ fontSize: 14, color: "#e8eaf0", marginBottom: 10, lineHeight: 1.6, fontWeight: "bold" }}>
              Siga estes 3 passos rápidos para resolver:
            </p>
            <ol style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20, lineHeight: 1.6, paddingLeft: 20 }}>
              <li>Abra o Console do seu Firebase e clique em <b>Firestore Database</b> no menu esquerdo.</li>
              <li>Vá na aba <b>Regras (Rules)</b>.</li>
              <li>Substitua todo o texto de lá pelo código abaixo e clique em <b>Publicar (Publish)</b>:</li>
            </ol>
            <div style={{ background: "#0a0b0f", padding: 12, borderRadius: 8, border: "1px solid #2a2f40", marginBottom: 20, fontFamily: "monospace", fontSize: 12, color: "#3b82f6", whiteSpace: "pre-wrap", overflowX: "auto" }}>
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => window.location.reload()} style={{ ...C.btn("#22c55e"), flex: 1, padding: "12px" }}>Recarregar App</button>
              <button onClick={() => setDbError(false)} style={{ ...C.btn("#1e2130"), flex: 1, padding: "12px" }}>Ignorar por enquanto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Entry Point do App: Gerencia Estado de Auth ──────────────────────────────
export default function App() {
  useAppAssets();
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthLoaded(true);
    });
    return unsub;
  }, []);

  const loginWithEmail = async (email, password) => {
    try {
      setLoginError("");
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/invalid-credential') setLoginError("E-mail ou senha incorretos.");
      else setLoginError("Erro no login: " + error.message);
    }
  };

  const registerWithEmail = async (email, password) => {
    try {
      setLoginError("");
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') setLoginError("Este e-mail já está em uso.");
      else if (error.code === 'auth/weak-password') setLoginError("A senha deve ter pelo menos 6 caracteres.");
      else if (error.code === 'auth/admin-restricted-operation') setLoginError("⚠️ Você precisa ativar o provedor 'E-mail/Senha' no painel do Firebase > Authentication > Sign-in method.");
      else setLoginError("Erro ao registrar: " + error.message);
    }
  };

  const loginWithGoogle = async () => {
    try {
      setLoginError("");
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError("⚠️ Domínio não autorizado pelo Firebase.\n\nPara usar o Google Login neste ambiente de pré-visualização, prefira entrar com E-mail e Senha (lembre-se de ativar no Firebase).");
      } else {
        setLoginError("Erro ao fazer login: " + error.message);
      }
    }
  };

  const loginAnonymously = async () => {
    try {
      setLoginError("");
      await signInAnonymously(auth);
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/admin-restricted-operation') {
        setLoginError("⚠️ Login Anônimo Desativado.\n\nAcesse seu painel Firebase > Authentication > Sign-in method e ative a opção 'Anonymous' (Anônimo).");
      } else {
        setLoginError("Erro no login anônimo: " + error.message);
      }
    }
  };

  if (!authLoaded) return <div style={{ background: "#0a0b0f", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", color: "#6b7280", fontFamily: "'Manrope',sans-serif" }}>Verificando autenticação...</div>;

  if (!user) return <LoginScreen onLoginGoogle={loginWithGoogle} onLoginAnon={loginAnonymously} onLoginEmail={loginWithEmail} onRegisterEmail={registerWithEmail} error={loginError} />;

  return <MainApp user={user} />;
}