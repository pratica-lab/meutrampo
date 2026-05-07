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

const parseTime = (str) => {
  if (!str) return 0;
  const [h, m] = str.split(':').map(Number);
  return (h * 60) + m;
}

const formatTimeMins = (mins) => {
  if (mins < 0) return "--:--";
  const h = Math.floor(mins / 60) % 24; 
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const formatBalance = (mins) => {
  const sign = mins < 0 ? '-' : '+';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const isWeekend = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

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
    
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6"/>
          <stop offset="100%" stop-color="#a855f7"/>
        </linearGradient>
        <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#f3f4f6"/>
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="url(#bg)"/>
      <rect x="20" y="30" width="16" height="40" rx="6" fill="url(#card)" opacity="0.9"/>
      <rect x="42" y="20" width="16" height="60" rx="6" fill="url(#card)" opacity="0.95"/>
      <rect x="64" y="40" width="16" height="30" rx="6" fill="url(#card)" opacity="0.8"/>
      <circle cx="50" cy="50" r="14" fill="#f97316" stroke="#ffffff" stroke-width="3"/>
      <path d="M44 50 L48 54 L56 46" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
    favicon.href = `data:image/svg+xml,${encodeURIComponent(svgIcon)}`

    return () => document.head.removeChild(link)
  }, [])
}

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
    <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", flex: 1 }}>
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
  { id: "tasks",        label: "Tarefas",      fullLabel: "Minhas Tarefas",     icon: "✅", color: "#f97316" },
  { id: "productivity", label: "Foco",         fullLabel: "Produtividade",      icon: "⚡", color: "#22c55e" },
  { id: "timeclock",    label: "Ponto",        fullLabel: "Controle de Ponto",  icon: "⏱️", color: "#14b8a6" },
  { id: "indicators",   label: "Indicadores",  fullLabel: "Indicadores",        icon: "📊", color: "#3b82f6" },
  { id: "notes",        label: "Notas",        fullLabel: "Notas",              icon: "📝", color: "#a855f7" },
]

const PRIORITY_COLORS = { Urgente: "#ef4444", Alta: "#f97316", Média: "#eab308", Baixa: "#22c55e", Baixíssima: "#6b7280" }

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

const INIT_TASKS = []
const INIT_INDICATORS = []
const INIT_NOTES = { meetings: [], feedbacks: [], changes: [], others: [] }
const INIT_TIMESHEET = { days: {}, adjustments: [] }

// ─── Componente LoginScreen ───────────────────────────────────────────────────
function LoginScreen({ onLoginGoogle, onLoginAnon, onLoginEmail, onRegisterEmail, error }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  const handleGoogle = async () => { setLoading(true); await onLoginGoogle(); setLoading(false); };
  const handleAnon = async () => { setLoading(true); await onLoginAnon(); setLoading(false); };
  const handleEmailSubmit = async (e) => {
    e.preventDefault(); if (!email || !password) return;
    setLoading(true);
    if (isRegister) await onRegisterEmail(email, password);
    else await onLoginEmail(email, password);
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0b0f', color: '#e8eaf0', fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ background: '#12141a', padding: "40px 30px", borderRadius: 20, border: '1px solid #1e2130', textAlign: 'center', maxWidth: 400, width: "90%", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, #22c55e, #f97316)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>⚡</div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, margin: "0 0 8px", fontWeight: 800 }}>Meu Trampo</h1>
        <p style={{ color: '#9ca3af', marginBottom: 24, fontSize: 13, lineHeight: 1.5 }}>Faça login para sincronizar suas tarefas.</p>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 20, padding: 12, background: "#ef444422", borderRadius: 8, textAlign: "left", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{error}</div>}
        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <input type="email" placeholder="Seu E-mail" value={email} onChange={e => setEmail(e.target.value)} required style={C.input} />
          <input type="password" placeholder="Sua Senha" value={password} onChange={e => setPassword(e.target.value)} required style={C.input} />
          <button type="submit" disabled={loading} style={{ ...C.btn("#3b82f6"), width: "100%", padding: "12px", fontSize: 14 }}>{loading ? 'Aguarde...' : (isRegister ? 'Criar Conta' : 'Entrar com E-mail')}</button>
        </form>
        <button onClick={() => setIsRegister(!isRegister)} type="button" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", textDecoration: "underline", marginBottom: 20 }}>{isRegister ? "Já tenho conta. Fazer Login." : "Não tem conta? Crie uma aqui."}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "#1e2130" }} />
          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>OU</span>
          <div style={{ flex: 1, height: 1, background: "#1e2130" }} />
        </div>
        <button onClick={handleGoogle} disabled={loading} style={{ background: '#fff', color: '#000', padding: '12px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google
        </button>
        <button onClick={handleAnon} disabled={loading} style={{ background: 'transparent', color: '#9ca3af', padding: '12px 20px', borderRadius: 10, border: '1px solid #2a2f40', fontWeight: 600, fontSize: 13, cursor: 'pointer', width: "100%" }}>Entrar como Visitante</button>
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
                  {sortedMembers.map(m => <span key={m.id} style={{ ...C.tag(color), fontSize: 10 }}>{m.name} {m.role ? `(${m.role})` : ""}</span>)}
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
               {filteredItems.length === 0 ? <p style={{ color: "#4b5563", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhuma RT cadastrada.</p> : (
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
                                      <input type="date" value={featForm.startDate} onChange={e => setFeatForm({...featForm, startDate: e.target.value})} style={{ ...C.input, flex: 1 }} />
                                      <input type="date" value={featForm.endDate} onChange={e => setFeatForm({...featForm, endDate: e.target.value})} style={{ ...C.input, flex: 1 }} />
                                    </div>
                                    <textarea placeholder="Observações..." value={featForm.note} onChange={e => setFeatForm({...featForm, note: e.target.value})} style={{ ...C.input, minHeight: 60, marginBottom: 8 }} />
                                    <div style={{ display: "flex", gap: 8 }}>
                                      <button onClick={() => addFeature(rt.id)} style={C.btn(color)}>Salvar</button>
                                      <button onClick={() => setAddingFeatRtId(null)} style={C.btn("transparent")}>Cancelar</button>
                                    </div>
                                  </div>
                                )}
                                {feats.length === 0 ? <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", margin: 0 }}>Nenhuma feature cadastrada nesta RT.</p> : (
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
              
              {filteredItems.length === 0 ? <p style={{ color: "#4b5563", fontSize: 13, textAlign: "center", padding: "20px 0" }}>{itemSearch ? "Nenhum resultado." : "Nenhum item adicionado."}</p> : filteredItems.map(item => (
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
                              {item.text} {item.details && <span style={{ color: "#6b7280", fontSize: 11, marginLeft: 6 }}>📝</span>}
                            </span>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{(item.tags||[]).map((t, idx) => <span key={idx} style={{ ...C.tag("#6b7280"), fontSize: 9, padding: "1px 6px" }}>{t}</span>)}</div>
                          </div>
                          <span style={{ fontSize: 10, color: "#4b5563", flexShrink: 0 }}>{item.createdAt}</span>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: "0 4px" }}>{expandedItemId === item.id ? "▲" : "▼"}</button>
                            <button onClick={() => startEditItem(item)} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: "0 4px" }}>✏️</button>
                            <button onClick={() => removeItem(activeTab.field, item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, padding: "0 4px" }}>✕</button>
                          </div>
                        </div>
                        {expandedItemId === item.id && item.details && <div style={{ marginLeft: 30, background: "#0a0b0f", padding: "8px 12px", borderRadius: 8, fontSize: 12, color: "#9ca3af", whiteSpace: "pre-wrap" }}>{item.details}</div>}
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
      <ModuleHeader title="Gestão de Equipes" subtitle="Squads, backlogs, RTs e pendências" color={color} isMobile={isMobile} action={<button onClick={() => setShowForm(!showForm)} style={C.btn(color)}>+ Novo Squad</button>} />
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

      {teams.length === 0 ? <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 40 }}>Nenhum time cadastrado</div> : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(270px,1fr))", gap: 12 }}>
            {teams.map(t => {
              const sortedMembersCount = t.members.length;
              return (
                <div key={t.id} onClick={() => setSelected(t.id)} style={{ ...C.card, cursor: "pointer", borderLeft: `4px solid ${color}`, transition: "transform 0.15s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)" }} onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}>
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
        )}
    </div>
  )
}

// ─── 6. Módulo Tarefas ────────────────────────────────────────────────────────
function SubtaskPanel({ task, onAdd, onToggle, onDelete, onEditSub, color, onUpdateNotes }) {
  const [inp, setInp] = useState("")
  const [notes, setNotes] = useState(task.notes || "")
  const [editingSubId, setEditingSubId] = useState(null)
  const [subEditText, setSubEditText] = useState("")

  useEffect(() => { setNotes(task.notes || "") }, [task.notes])

  const startEditSub = (sub) => { setEditingSubId(sub.id); setSubEditText(sub.text) }
  const saveEditSub = (subId) => { if (subEditText.trim()) onEditSub(subId, subEditText.trim()); setEditingSubId(null) }

  return (
    <div style={{ marginTop: 10, marginLeft: 30, padding: 12, background: "#0a0b0f", borderRadius: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
           <span style={{ ...C.lbl, display: "flex", justifyContent: "space-between", alignItems: "center" }}>📝 Anotações da Tarefa</span>
           <textarea placeholder="Detalhes, links ou observações..." value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => onUpdateNotes(task.id, notes)} style={{ ...C.input, minHeight: 60, fontSize: 12, resize: "vertical" }} />
        </div>
        <div>
          <span style={C.lbl}>Subtarefas ({task.subtasks.filter(s => s.done).length}/{task.subtasks.length})</span>
          {task.subtasks.map(sub => (
            <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <Checkbox checked={sub.done} onChange={() => onToggle(sub.id)} color={color} />
              {editingSubId === sub.id ? (
                <input value={subEditText} onChange={e => setSubEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEditSub(sub.id)} onBlur={() => saveEditSub(sub.id)} autoFocus style={{ ...C.input, padding: "4px 8px", fontSize: 12, flex: 1 }} />
              ) : (
                <>
                  <span style={{ fontSize: 12, color: sub.done ? "#4b5563" : "#9ca3af", textDecoration: sub.done ? "line-through" : "none", flex: 1 }}>{sub.text}</span>
                  <button onClick={() => startEditSub(sub)} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: "2px 5px", fontSize: 12 }}>✏️</button>
                  <button onClick={() => onDelete(sub.id)} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", padding: "2px 5px" }}>✕</button>
                </>
              )}
            </div>
          ))}
          <input placeholder="Nova subtarefa (Enter)" value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && inp.trim()) { onAdd(inp.trim()); setInp("") } }} style={{ ...C.input, fontSize: 12, marginTop: 8, padding: "6px 10px" }} />
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
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [taskEditForm, setTaskEditForm] = useState({})
  const [form, setForm] = useState({ title: "", deadline: "", priority: "Média", delegable: false, tags: "", myDay: false, forTomorrow: false, notes: "" })

  const [draggedTaskId, setDraggedTaskId] = useState(null)

  const overdueCount  = tasks.filter(t => isPast(t.deadline) && t.status !== "done").length
  const myDayCount    = tasks.filter(t => checkIsToday(t) && t.status !== "done").length
  const tomorrowCount = tasks.filter(t => checkIsTomorrow(t) && t.status !== "done").length
  const doneCount     = tasks.filter(t => t.status === "done").length

  const addTask = () => {
    if (!form.title.trim()) return
    const plannedDate = form.forTomorrow ? tomorrowStr() : form.myDay ? todayStr() : ""
    setTasks(prev => [...prev, { id: Date.now(), ...form, plannedDate, tags: form.tags.split(",").map(s => s.trim()).filter(Boolean), subtasks: [], status: "todo", dueDate: todayStr() }])
    setForm({ title: "", deadline: "", priority: "Média", delegable: false, tags: "", myDay: false, forTomorrow: false, notes: "" }); setShowForm(false)
  }

  const startEditTask = (task) => { setTaskEditForm({ ...task, tags: (task.tags||[]).join(", ") }); setEditingTaskId(task.id) }
  const saveTaskEdit = () => {
    setTasks(prev => prev.map(t => t.id === editingTaskId ? { ...t, title: taskEditForm.title, deadline: taskEditForm.deadline, priority: taskEditForm.priority, tags: taskEditForm.tags.split(",").map(s => s.trim()).filter(Boolean), delegable: taskEditForm.delegable } : t))
    setEditingTaskId(null)
  }

  const toggleDone = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t))
  const toggleMyDay = (id) => setTasks(prev => prev.map(t => { if (t.id === id) { if (checkIsToday(t)) return { ...t, myDay: false, plannedDate: null }; return { ...t, myDay: true, plannedDate: todayStr() }; } return t; }));
  const toggleTomorrow = (id) => setTasks(prev => prev.map(t => { if (t.id === id) { if (checkIsTomorrow(t)) return { ...t, plannedDate: null }; return { ...t, myDay: false, plannedDate: tomorrowStr() }; } return t; }));
  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id))
  const addSubtask = (id, text) => setTasks(prev => prev.map(t => t.id === id ? { ...t, subtasks: [...t.subtasks, { id: Date.now(), text, done: false }] } : t))
  const toggleSubtask = (tid, sid) => setTasks(prev => prev.map(t => t.id === tid ? { ...t, subtasks: t.subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) } : t))
  const delSubtask = (tid, sid) => setTasks(prev => prev.map(t => t.id === tid ? { ...t, subtasks: t.subtasks.filter(s => s.id !== sid) } : t))
  const editSubtask = (tid, sid, newText) => setTasks(prev => prev.map(t => t.id === tid ? { ...t, subtasks: t.subtasks.map(s => s.id === sid ? { ...s, text: newText } : s) } : t))
  const updateTaskNotes = (id, newNotes) => setTasks(prev => prev.map(t => t.id === id ? { ...t, notes: newNotes } : t))

  const handleDragStart = (e, id) => {
    setDraggedTaskId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetId) return;
    
    const newTasks = [...tasks];
    const draggedIdx = newTasks.findIndex(t => t.id === draggedTaskId);
    const targetIdx = newTasks.findIndex(t => t.id === targetId);

    const [draggedTask] = newTasks.splice(draggedIdx, 1);
    newTasks.splice(targetIdx, 0, draggedTask);

    setTasks(newTasks);
    setDraggedTaskId(null);
  };

  const ORDER = { Urgente: 0, Alta: 1, Média: 2, Baixa: 3, Baixíssima: 4 }
  let visible = tasks.filter(t => {
    if (t.status === "done") return view === "done"
    if (view === "today")    return checkIsToday(t)
    if (view === "tomorrow") return checkIsTomorrow(t)
    if (view === "overdue")  return isPast(t.deadline)
    if (view === "done")     return false 
    return true
  })

  if (filterText) visible = visible.filter(t => t.title.toLowerCase().includes(filterText.toLowerCase()) || (t.tags && t.tags.some(tag => tag.toLowerCase().includes(filterText.toLowerCase()))))
  if (filterPri)  visible = visible.filter(t => t.priority === filterPri)
  if (filterDate) visible = visible.filter(t => t.deadline === filterDate || t.plannedDate === filterDate)
  if (sortBy === "priority") visible.sort((a, b) => (ORDER[a.priority] ?? 5) - (ORDER[b.priority] ?? 5))
  if (sortBy === "deadline") visible.sort((a, b) => (a.deadline || "9999-99-99").localeCompare(b.deadline || "9999-99-99"))

  const tabs = [
    { id: "backlog",  label: `Backlog (${tasks.filter(t=>t.status!=="done").length})` },
    { id: "tomorrow", label: `🌅 Amanhã (${tomorrowCount})` },
    { id: "today",    label: `☀️ Hoje (${myDayCount})` },
    { id: "overdue",  label: `⚠️ Vencidas (${overdueCount})` },
    { id: "done",     label: `✅ Concluídas (${doneCount})` },
  ]

  return (
    <div>
      <ModuleHeader title="Minhas Tarefas" subtitle="Planejamento do dia e gestão do backlog" color={color} isMobile={isMobile} action={<button onClick={() => setShowForm(!showForm)} style={C.btn(color)}>+ Nova</button>} />
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Buscar tag ou título..." value={filterText} onChange={e => setFilterText(e.target.value)} style={{ ...C.input, flex: 1, minWidth: 150 }} />
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...C.input, width: "auto" }} title="Buscar por data" />
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)} style={{ ...C.input, width: "auto", minWidth: 130 }}><option value="">Todas Prioridades</option>{Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}</select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...C.input, width: "auto", minWidth: 130 }}><option value="manual">Ordem Manual</option><option value="priority">Por Prioridade</option><option value="deadline">Por Vencimento</option></select>
      </div>

      {showForm && (
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            <input placeholder="Título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={C.input} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} style={C.input} />
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ ...C.input, appearance: "none" }}>{Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}</select>
            </div>
            <input placeholder="Tags (vírgula)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} style={C.input} />
            <textarea placeholder="Anotações Iniciais (Opcional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...C.input, minHeight: 60, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}><input type="checkbox" checked={form.delegable} onChange={e => setForm({ ...form, delegable: e.target.checked })} /> Delegável</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}><input type="checkbox" checked={form.myDay} onChange={e => setForm({ ...form, myDay: e.target.checked, forTomorrow: e.target.checked ? false : form.forTomorrow })} /> Hoje</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}><input type="checkbox" checked={form.forTomorrow} onChange={e => setForm({ ...form, forTomorrow: e.target.checked, myDay: e.target.checked ? false : form.myDay })} /> Amanhã</label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addTask} style={C.btn(color)}>Salvar</button>
            <button onClick={() => setShowForm(false)} style={C.btn("#1e2130")}>Cancelar</button>
          </div>
        </div>
      )}

      <ScrollTabs tabs={tabs} active={view} onSelect={setView} color={view === "overdue" && overdueCount > 0 ? "#ef4444" : color} />

      {visible.length === 0 && <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 36 }}>{filterText || filterPri || filterDate ? "Nenhuma tarefa corresponde ao filtro." : view === "today" ? "☀️ Nenhuma tarefa para hoje" : view === "tomorrow" ? "🌅 Nada programado para amanhã" : view === "overdue" ? "🎉 Sem vencidas!" : view === "done" ? "Ainda não há tarefas concluídas" : "Nenhuma tarefa"}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((task) => {
          const pc = PRIORITY_COLORS[task.priority] || color
          const overdue = isPast(task.deadline) && task.status !== "done"
          const isToday = checkIsToday(task)
          const isTomorrow = checkIsTomorrow(task)
          
          if (editingTaskId === task.id) {
            return (
              <div key={task.id} style={{ background: "#0a0b0f", padding: 12, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${pc}` }}>
                <input value={taskEditForm.title} onChange={e => setTaskEditForm({...taskEditForm, title: e.target.value})} style={C.input} placeholder="Título" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input type="date" value={taskEditForm.deadline || ""} onChange={e => setTaskEditForm({...taskEditForm, deadline: e.target.value})} style={C.input} />
                  <select value={taskEditForm.priority} onChange={e => setTaskEditForm({...taskEditForm, priority: e.target.value})} style={C.input}>{Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}</select>
                </div>
                <input value={taskEditForm.tags} onChange={e => setTaskEditForm({...taskEditForm, tags: e.target.value})} style={C.input} placeholder="Tags (vírgula)" />
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#9ca3af" }}><input type="checkbox" checked={taskEditForm.delegable} onChange={e => setTaskEditForm({...taskEditForm, delegable: e.target.checked})} /> Delegável</label>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={saveTaskEdit} style={C.btn(pc)}>Atualizar</button>
                  <button onClick={() => setEditingTaskId(null)} style={C.btn("transparent")}>Cancelar</button>
                </div>
              </div>
            )
          }

          return (
            <div key={task.id} 
                 style={{ ...C.card, borderLeft: `4px solid ${pc}`, opacity: task.status === "done" ? 0.65 : 1, transition: "transform 0.15s, box-shadow 0.15s", transform: draggedTaskId === task.id ? "scale(1.02)" : "scale(1)", boxShadow: draggedTaskId === task.id ? "0 10px 20px rgba(0,0,0,0.5)" : "none" }}
                 draggable={sortBy === "manual"}
                 onDragStart={(e) => handleDragStart(e, task.id)}
                 onDragOver={handleDragOver}
                 onDrop={(e) => handleDrop(e, task.id)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                {sortBy === "manual" && (
                  <div style={{ cursor: "grab", color: "#4b5563", fontSize: 18, display: "flex", alignItems: "center", padding: "0 4px" }} title="Arraste para reordenar">⋮⋮</div>
                )}
                <div style={{ paddingTop: 1, flexShrink: 0 }}><Checkbox checked={task.status === "done"} onChange={() => toggleDone(task.id)} color={pc} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 6px", textDecoration: task.status === "done" ? "line-through" : "none", color: task.status === "done" ? "#6b7280" : "#e8eaf0", wordBreak: "break-word" }}>{task.title}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                    <span style={C.tag(pc)}>{task.priority}</span>
                    {task.delegable && <span style={C.tag("#3b82f6")}>↗ Deleg.</span>}
                    {task.deadline  && <span style={C.tag(overdue ? "#ef4444" : "#6b7280")}>{overdue ? "⚠️ " : ""}{task.deadline}</span>}
                    {task.tags?.map((t, i) => <span key={i} style={C.tag()}>{t}</span>)}
                    {(task.notes || task.subtasks.length > 0) && <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>{task.subtasks.length > 0 && `📋 ${task.subtasks.filter(s=>s.done).length}/${task.subtasks.length} `}{task.notes && `📝 Anot.`}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => toggleTomorrow(task.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: isTomorrow ? 1 : 0.2, padding: "2px 3px", transition: "opacity 0.2s" }} title={isTomorrow ? "Remover do Amanhã" : "Programar para Amanhã"}>🌅</button>
                  <button onClick={() => toggleMyDay(task.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: isToday ? 1 : 0.2, padding: "2px 3px", transition: "opacity 0.2s" }} title={isToday ? "Remover do Hoje" : "Adicionar ao Hoje"}>☀️</button>
                  <button onClick={() => setExpanded(expanded === task.id ? null : task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 12, padding: "2px 4px" }}>{expanded === task.id ? "▲" : "▼"}</button>
                  <button onClick={() => startEditTask(task)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", fontSize: 12, padding: "2px 3px" }} title="Editar Tarefa">✏️</button>
                  <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: 13, padding: "2px 3px" }}>✕</button>
                </div>
              </div>
              {expanded === task.id && <SubtaskPanel task={task} color={pc} onAdd={(text) => addSubtask(task.id, text)} onToggle={(sid) => toggleSubtask(task.id, sid)} onDelete={(sid) => delSubtask(task.id, sid)} onEditSub={(sid, txt) => editSubtask(task.id, sid, txt)} onUpdateNotes={updateTaskNotes} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 7. Módulo Produtividade ──────────────────────────────────────────────────
function ProductivityModule({ researchItems, setResearchItems, tasks, setTasks, isMobile, pomo, setPomo, events, setEvents, alerts, setAlerts }) {
  const color = "#22c55e"
  
  const [customPomo, setCustomPomo] = useState("")

  // Checklist de Aprendizado
  const [resTab, setResTab] = useState("pending")
  const [researchText, setResearchText] = useState("")
  const [researchAction, setResearchAction] = useState("Pesquisar")
  
  const [editingResId, setEditingResId] = useState(null)
  const [resEditForm, setResEditForm] = useState({ text: "", action: "", resultNote: "" })

  const [calDate, setCalDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [newEvent, setNewEvent] = useState("")
  const [newEventTags, setNewEventTags] = useState("")
  const [calSearch, setCalSearch] = useState("")

  const [alertForm, setAlertForm] = useState({ text: "", date: todayStr(), time: "" })

  const pomoProgress = pomo.isBreak ? ((5*60 - pomo.seconds)/(5*60))*100 : ((pomo.initialSec - pomo.seconds)/(pomo.initialSec))*100
  const R = 54, CIRCUM = 2 * Math.PI * R

  // Funções do Checklist de Aprendizado
  const addResearch = () => {
    if (!researchText.trim()) return
    const newItem = { id: Date.now(), text: researchText, action: researchAction, done: false, resultNote: "", createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }
    setResearchItems(prev => [newItem, ...prev])
    setResearchText(""); setResearchAction("Pesquisar");
  }

  const toggleRes = (id) => setResearchItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i))
  const deleteRes = (id) => setResearchItems(prev => prev.filter(i => i.id !== id)) 

  const startEditRes = (item) => {
    setResEditForm({ text: item.text, action: item.action, resultNote: item.resultNote || "" })
    setEditingResId(item.id)
  }

  const saveEditRes = (id) => {
    if (!resEditForm.text.trim()) return
    setResearchItems(prev => prev.map(i => i.id === id ? { ...i, text: resEditForm.text, action: resEditForm.action, resultNote: resEditForm.resultNote } : i))
    setEditingResId(null)
  }

  const turnIntoTask = (id) => {
    const item = researchItems.find(i => i.id === id)
    if (!item) return
    setTasks(prev => [{ id: Date.now(), title: `${item.action}: ${item.text}`, priority: "Média", tags: ["Estudo"], status: "todo", myDay: false, plannedDate: "", delegable: false, subtasks: [], dueDate: todayStr() }, ...prev])
    deleteRes(id)
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

  const sortedResearch = [...researchItems].sort((a,b) => b.id - a.id)
  const visibleRes = sortedResearch.filter(i => resTab === "pending" ? !i.done : i.done)

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
          <circle cx="65" cy="65" r={R} fill="none" stroke={pomo.isBreak ? "#3b82f6" : color} strokeWidth="7" strokeDasharray={CIRCUM} strokeDashoffset={CIRCUM * (1 - pomoProgress / 100)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 800, color: pomo.isBreak ? "#3b82f6" : color, lineHeight: 1 }}>{fmtTime(pomo.seconds)}</span>
          <span style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{pomo.cycles} ciclos</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
        <button onClick={() => setPomo(p => ({ ...p, running: !p.running }))} style={C.btn(pomo.running ? "#4b5563" : color)}>{pomo.running ? "⏸" : "▶"} {pomo.running ? "Pausar" : "Iniciar"}</button>
        <button onClick={() => { setPomo(p => ({ ...p, running: false, seconds: 25*60, initialSec: 25*60, isBreak: false, cycles: 0 })) }} style={C.btn("#1e2130")}>↺</button>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        {[["25m", 25*60, false], ["5m", 5*60, true], ["15m", 15*60, true]].map(([lbl, sec, isBreak]) => (
          <button key={lbl} onClick={() => { setPomo(p => ({ ...p, running: false, isBreak, seconds: sec, initialSec: sec })) }} style={{ ...C.btn("#1e2130"), fontSize: 11, padding: "4px 8px" }}>{lbl}</button>
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
                      <span style={{ color: "#a855f7" }}>•</span> <span style={{ color: "#6b7280", fontSize: 10 }}>[{e.date.split('-').reverse().join('/')}]</span> <span style={{ wordBreak: "break-word", fontWeight: 600 }}>{e.title}</span>
                    </div>
                    {e.tags && e.tags.length > 0 && <div style={{ display: "flex", gap: 4, marginLeft: 12, marginTop: 4 }}>{e.tags.map((t, idx) => <span key={idx} style={{ ...C.tag("#a855f7"), fontSize: 9, padding: "1px 5px" }}>{t}</span>)}</div>}
                 </div>
              ))}
           </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <button onClick={handlePrevMonth} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}>&lt;</button>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, margin: 0, textTransform: "capitalize" }}>{calDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
              <button onClick={handleNextMonth} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}>&gt;</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, textAlign: "center" }}>
              {["D","S","T","Q","Q","S","S"].map((d, i) => <span key={i} style={{ fontSize: 9, color: "#4b5563", fontWeight: 700, padding: "2px 0" }}>{d}</span>)}
              {Array.from({ length: firstDay }).map((_, i) => <span key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const dateStr = `${calDate.getFullYear()}-${String(calDate.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
                const isToday = dateStr === todayStr(); const hasEvt = filteredEvents.some(e => e.date === dateStr); const isSel = selectedDate === dateStr
                return (
                  <div key={d} style={{ position: "relative", cursor: "pointer", height: 24 }} onClick={() => setSelectedDate(isSel ? null : dateStr)}>
                    <div style={{ padding: "3px 1px", background: isSel ? "#4b5563" : isToday ? color : "transparent", borderRadius: 4, color: isToday ? "#000" : isSel ? "#fff" : "#9ca3af", fontSize: 10, fontWeight: isToday ? 700 : 400, zIndex: 2, position: "relative" }}>{d}</div>
                    <div style={{ position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2, zIndex: 1 }}>{hasEvt && <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#a855f7" }} />}</div>
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
                        <div style={{ display: "flex", gap: 5 }}><span style={{ color: "#a855f7" }}>•</span><span style={{ wordBreak: "break-word" }}>{e.title}</span></div>
                        {e.tags && e.tags.length > 0 && <div style={{ display: "flex", gap: 4, marginLeft: 12, marginTop: 2 }}>{e.tags.map((t, idx) => <span key={idx} style={{ ...C.tag("#a855f7"), fontSize: 9, padding: "1px 5px" }}>{t}</span>)}</div>}
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

  const RES_TABS = [
    { id: "pending", label: `Pendentes (${sortedResearch.filter(i => !i.done).length})` },
    { id: "done", label: `Concluídos (${sortedResearch.filter(i => i.done).length})` }
  ]

  return (
    <div>
      <ModuleHeader title="Produtividade" subtitle="Mantenha o foco e capture aprendizados" color={color} isMobile={isMobile} />

      <Pomodoro />

      <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
        <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📚 Checklist de Aprendizado</p>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
          <select value={researchAction} onChange={e => setResearchAction(e.target.value)} style={{ ...C.input, width: isMobile ? "100%" : 130 }}>
            <option value="Pesquisar">Pesquisar</option>
            <option value="Estudar">Estudar</option>
            <option value="Entender">Entender</option>
          </select>
          <input placeholder="Termo, conceito, tecnologia..." value={researchText} onChange={e => setResearchText(e.target.value)} onKeyDown={e => e.key === "Enter" && !isMobile && addResearch()} style={{ ...C.input, flex: 1 }} />
          <button onClick={addResearch} style={C.btn(color)}>Adicionar</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", gap: 20 }}>
        <div>
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
             <ScrollTabs tabs={RES_TABS} active={resTab} onSelect={setResTab} color={color} />
           </div>

           <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleRes.length === 0 ? <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 32 }}>Nenhum termo nesta lista.</div> : visibleRes.map(item => (
                <div key={item.id} style={{...C.card, borderLeft: `4px solid ${item.done ? '#4b5563' : color}`, opacity: item.done ? 0.6 : 1 }}>
                    {editingResId === item.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row" }}>
                                <select value={resEditForm.action} onChange={e => setResEditForm({...resEditForm, action: e.target.value})} style={{ ...C.input, width: isMobile ? "100%" : 130 }}>
                                    <option value="Pesquisar">Pesquisar</option>
                                    <option value="Estudar">Estudar</option>
                                    <option value="Entender">Entender</option>
                                </select>
                                <input placeholder="Termo..." value={resEditForm.text} onChange={e => setResEditForm({...resEditForm, text: e.target.value})} style={{ ...C.input, flex: 1 }} />
                            </div>
                            <textarea placeholder="Adicione a resposta ou anotação do seu aprendizado aqui..." value={resEditForm.resultNote} onChange={e => setResEditForm({...resEditForm, resultNote: e.target.value})} style={{ ...C.input, minHeight: 70, resize: "vertical" }} />
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                <button onClick={() => saveEditRes(item.id)} style={C.btn(color)}>Salvar Edição</button>
                                <button onClick={() => setEditingResId(null)} style={C.btn("transparent")}>Cancelar</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ marginTop: 2 }}><Checkbox checked={item.done} onChange={() => toggleRes(item.id)} color={color} /></div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                    <span style={{ ...C.tag(item.done ? "#6b7280" : color), padding: "2px 6px", fontSize: 9 }}>{item.action}</span>
                                    <span style={{ fontSize: 10, color: "#6b7280" }}>{item.createdAt}</span>
                                </div>
                                <p style={{ fontWeight: 600, margin: 0, fontSize: 14, textDecoration: item.done ? "line-through" : "none", color: item.done ? "#6b7280" : "#e8eaf0", wordBreak: "break-word" }}>{item.text}</p>
                                
                                {item.resultNote && (
                                    <div style={{ marginTop: 8, background: "#0a0b0f", padding: "8px 12px", borderRadius: 8, fontSize: 12, color: "#9ca3af", whiteSpace: "pre-wrap", borderLeft: `2px solid ${color}44` }}>
                                        {item.resultNote}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                {!item.done && <button onClick={() => turnIntoTask(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f97316", padding: "0 4px", fontSize: 12 }} title="Transformar em Tarefa">↗️ Tarefa</button>}
                                <button onClick={() => startEditRes(item)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", padding: "0 4px", fontSize: 12 }}>✏️</button>
                                <button onClick={() => deleteRes(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "0 4px", fontSize: 13 }}>✕</button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
           </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

// ─── 7.5. Módulo Controlador de Ponto ─────────────────────────────────────────
function TimeclockModule({ timesheet, setTimesheet, isMobile }) {
  const color = "#14b8a6";
  const [nowDate, setNowDate] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNowDate(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [retroForm, setRetroForm] = useState({ date: todayStr(), time: "" });
  const [adjForm, setAdjForm] = useState({ date: todayStr(), hours: "", minutes: "", type: "subtract", obs: "" });
  const [showAdj, setShowAdj] = useState(false);
  const [absenceForm, setAbsenceForm] = useState({ startDate: todayStr(), endDate: todayStr(), type: "Férias", description: "" });
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr().substring(0, 7));

  const calcDay = (dateStr, punches, isHoliday) => {
    let workedMins = 0; let expectedEnd = null; let isRunning = punches.length % 2 !== 0;
    for (let i = 0; i < punches.length; i += 2) {
      let start = parseTime(punches[i]); let end = punches[i+1] ? parseTime(punches[i+1]) : null;
      if (end !== null) workedMins += (end - start);
      else if (dateStr === todayStr()) { let nowMins = nowDate.getHours() * 60 + nowDate.getMinutes(); workedMins += (nowMins - start); }
    }
    let reqMins = (isWeekend(dateStr) || isHoliday || dateStr > todayStr()) ? 0 : 480;
    let balance = workedMins - reqMins;
    if (isRunning && reqMins > 0) {
      let lastStart = parseTime(punches[punches.length - 1]); let fixedWorked = 0;
      for (let i = 0; i < punches.length - 1; i += 2) fixedWorked += (parseTime(punches[i+1]) - parseTime(punches[i]));
      let remaining = reqMins - fixedWorked;
      if (remaining > 0) expectedEnd = lastStart + remaining;
    }
    return { workedMins, balance, expectedEnd, isRunning, reqMins };
  }

  const punchCurrent = () => {
    const d = todayStr(); const h = String(nowDate.getHours()).padStart(2, '0'); const m = String(nowDate.getMinutes()).padStart(2, '0');
    addPunch(d, `${h}:${m}`);
  }

  const addPunch = (date, time) => {
    if (!time) return;
    setTimesheet(prev => {
      const day = prev.days[date] || { punches: [], isHoliday: false, obs: "" };
      const newPunches = [...day.punches, time].sort();
      return { ...prev, days: { ...prev.days, [date]: { ...day, punches: newPunches } } };
    });
    setRetroForm({ date: todayStr(), time: "" });
  }

  const removePunch = (date, idx) => {
    setTimesheet(prev => {
      const day = prev.days[date]; const newPunches = day.punches.filter((_, i) => i !== idx);
      return { ...prev, days: { ...prev.days, [date]: { ...day, punches: newPunches } } };
    });
  }

  const toggleHoliday = (date) => {
    setTimesheet(prev => {
      const day = prev.days[date] || { punches: [], isHoliday: false, obs: "" };
      return { ...prev, days: { ...prev.days, [date]: { ...day, isHoliday: !day.isHoliday } } };
    });
  }

  const updateDayObs = (date, obs) => {
    setTimesheet(prev => {
        const day = prev.days[date] || { punches: [], isHoliday: false, obs: "" };
        return { ...prev, days: { ...prev.days, [date]: { ...day, obs } } };
    });
  }

  const addAbsences = () => {
    if (!absenceForm.startDate || !absenceForm.endDate) return;
    let current = new Date(absenceForm.startDate + "T12:00:00"); const end = new Date(absenceForm.endDate + "T12:00:00");
    if (current > end) return; 
    setTimesheet(prev => {
        const newDays = { ...prev.days }; let loopDate = new Date(current);
        while (loopDate <= end) {
            const dateStr = loopDate.toISOString().split("T")[0];
            const existingDay = newDays[dateStr] || { punches: [], isHoliday: false, obs: "" };
            newDays[dateStr] = { ...existingDay, isHoliday: true, obs: existingDay.obs ? `${existingDay.obs}\n${absenceForm.type}: ${absenceForm.description}` : `${absenceForm.type}${absenceForm.description ? ' - ' + absenceForm.description : ''}` };
            loopDate.setDate(loopDate.getDate() + 1);
        }
        return { ...prev, days: newDays };
    });
    setAbsenceForm({ startDate: todayStr(), endDate: todayStr(), type: "Férias", description: "" });
    setShowAbsenceForm(false);
  }

  const saveAdjustment = () => {
    const h = parseInt(adjForm.hours || "0", 10); const m = parseInt(adjForm.minutes || "0", 10);
    if (h === 0 && m === 0) return;
    let totalMins = (h * 60) + m; if (adjForm.type === "subtract") totalMins = -totalMins;
    const newAdj = { id: Date.now(), date: adjForm.date, minutes: totalMins, obs: adjForm.obs };
    setTimesheet(prev => ({ ...prev, adjustments: [newAdj, ...(prev.adjustments || [])] }));
    setAdjForm({ date: todayStr(), hours: "", minutes: "", type: "subtract", obs: "" }); setShowAdj(false);
  }

  const removeAdjustment = (id) => setTimesheet(prev => ({ ...prev, adjustments: prev.adjustments.filter(a => a.id !== id) }));

  let globalBalance = 0; const allDatesSet = new Set([todayStr().substring(0, 7)]);
  Object.keys(timesheet.days).forEach(date => {
    const day = timesheet.days[date]; const calc = calcDay(date, day.punches, day.isHoliday); globalBalance += calc.balance; allDatesSet.add(date.substring(0, 7));
  });
  (timesheet.adjustments || []).forEach(adj => { globalBalance += adj.minutes; allDatesSet.add(adj.date.substring(0, 7)); });
  const uniqueMonths = [...allDatesSet].sort((a,b) => b.localeCompare(a));

  let initialMonthBalance = 0; let currentMonthNetBalance = 0;
  Object.keys(timesheet.days).forEach(date => {
    const calc = calcDay(date, timesheet.days[date].punches, timesheet.days[date].isHoliday); const mStr = date.substring(0, 7);
    if (date < selectedMonth + "-01") initialMonthBalance += calc.balance;
    else if (mStr === selectedMonth) currentMonthNetBalance += calc.balance;
  });
  (timesheet.adjustments || []).forEach(adj => {
    const mStr = adj.date.substring(0, 7);
    if (adj.date < selectedMonth + "-01") initialMonthBalance += adj.minutes;
    else if (mStr === selectedMonth) currentMonthNetBalance += adj.minutes;
  });
  const finalMonthBalance = initialMonthBalance + currentMonthNetBalance;

  const daysInMonth = Object.keys(timesheet.days).filter(date => date.startsWith(selectedMonth)).sort((a,b) => b.localeCompare(a));
  const todayData = timesheet.days[todayStr()] || { punches: [], isHoliday: false, obs: "" };
  const todayCalc = calcDay(todayStr(), todayData.punches, todayData.isHoliday);

  return (
    <div>
      <ModuleHeader title="Controle de Ponto" subtitle="Registro de horas, saldo e previsão de saída" color={color} isMobile={isMobile} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ ...C.card, borderTop: `4px solid ${color}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
           <h3 style={{ margin: "0 0 5px", fontSize: 14, color: "#9ca3af" }}>{nowDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
           <div style={{ fontSize: 48, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "#fff", lineHeight: 1, marginBottom: 20, fontVariantNumeric: "tabular-nums" }}>
             {String(nowDate.getHours()).padStart(2, '0')}:{String(nowDate.getMinutes()).padStart(2, '0')}<span style={{ fontSize: 24, color: "#6b7280" }}>:{String(nowDate.getSeconds()).padStart(2, '0')}</span>
           </div>
           <button onClick={punchCurrent} style={{ background: todayCalc.isRunning ? "#ef4444" : color, color: "#fff", border: "none", borderRadius: 30, padding: "16px 32px", fontSize: 16, fontWeight: 800, cursor: "pointer", transition: "all 0.2s", boxShadow: `0 4px 14px ${todayCalc.isRunning ? '#ef444466' : color+'66'}`, marginBottom: 24 }}>
             {todayCalc.isRunning ? "SAÍDA / PAUSA (Bater Ponto)" : "ENTRADA (Bater Ponto)"}
           </button>
           <div style={{ display: "flex", width: "100%", gap: 10, justifyContent: "space-between", background: "#0a0b0f", padding: 14, borderRadius: 10 }}>
              <div><p style={{ ...C.lbl, marginBottom: 2 }}>Trabalhado Hoje</p><p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: color }}>{formatTimeMins(todayCalc.workedMins)}</p></div>
              <div style={{ textAlign: "right" }}><p style={{ ...C.lbl, marginBottom: 2 }}>Previsão de Saída (8h)</p><p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: todayCalc.expectedEnd ? "#e8eaf0" : "#6b7280" }}>{todayCalc.expectedEnd ? formatTimeMins(todayCalc.expectedEnd) : "--:--"}</p></div>
           </div>
        </div>

        <div style={{ ...C.card, borderTop: `4px solid #3b82f6` }}>
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
             <p style={{ ...C.lbl, fontSize: 13 }}>Banco de Horas Geral</p>
             <button onClick={() => setShowAdj(!showAdj)} style={{ ...C.btn("#3b82f6"), padding: "6px 12px", fontSize: 11 }}>+ Lançar Ajuste</button>
           </div>
           <div style={{ fontSize: 38, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: globalBalance >= 0 ? color : "#ef4444", marginBottom: 16 }}>
             {formatBalance(globalBalance)} <span style={{ fontSize: 16, fontWeight: 600, color: "#9ca3af" }}>acumuladas</span>
           </div>
           {showAdj && (
             <div style={{ background: "#0a0b0f", padding: 12, borderRadius: 8, marginBottom: 16, border: "1px solid #1e2130" }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 10px", color: "#e8eaf0" }}>Novo Lançamento Manual</p>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                   <input type="date" value={adjForm.date} onChange={e => setAdjForm({...adjForm, date: e.target.value})} style={{ ...C.input, flex: 1 }} />
                   <select value={adjForm.type} onChange={e => setAdjForm({...adjForm, type: e.target.value})} style={{ ...C.input, flex: 1 }}><option value="subtract">Debitar (-) Saída antecipada, Atraso...</option><option value="add">Creditar (+) Hora extra por fora...</option></select>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                   <input type="number" placeholder="Horas" value={adjForm.hours} onChange={e => setAdjForm({...adjForm, hours: e.target.value})} style={{ ...C.input, width: 80 }} />
                   <input type="number" placeholder="Min" value={adjForm.minutes} onChange={e => setAdjForm({...adjForm, minutes: e.target.value})} style={{ ...C.input, width: 80 }} />
                   <input placeholder="Observação (obrigatória)" value={adjForm.obs} onChange={e => setAdjForm({...adjForm, obs: e.target.value})} style={{ ...C.input, flex: 1 }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                   <button onClick={saveAdjustment} disabled={!adjForm.obs.trim()} style={{ ...C.btn("#3b82f6"), opacity: !adjForm.obs.trim() ? 0.5 : 1 }}>Salvar Ajuste</button>
                   <button onClick={() => setShowAdj(false)} style={C.btn("transparent")}>Cancelar</button>
                </div>
             </div>
           )}
           <div>
              <p style={{ ...C.lbl, fontSize: 10, borderBottom: "1px solid #1e2130", paddingBottom: 6, marginBottom: 8 }}>Histórico de Ajustes Manuais</p>
              {(timesheet.adjustments || []).length === 0 ? <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>Nenhum ajuste manual lançado.</p> : (
                <div style={{ maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {(timesheet.adjustments || []).map(adj => (
                    <div key={adj.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0b0f", padding: "6px 10px", borderRadius: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                           <span style={{ fontSize: 12, fontWeight: 700, color: adj.minutes >= 0 ? color : "#ef4444" }}>{formatBalance(adj.minutes)}</span>
                           <span style={{ fontSize: 10, color: "#9ca3af" }}>{adj.date.split('-').reverse().join('/')}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: "#e8eaf0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{adj.obs}</p>
                      </div>
                      <button onClick={() => removeAdjustment(adj.id)} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>
      </div>

      <div style={C.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
           <p style={{ ...C.lbl, fontSize: 13, margin: 0 }}>Histórico de Marcações</p>
           <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
               <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0a0b0f", padding: 6, borderRadius: 8, border: "1px solid #1e2130" }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, paddingLeft: 4 }}>+ Retroativo:</span>
                  <input type="date" value={retroForm.date} onChange={e => setRetroForm({...retroForm, date: e.target.value})} style={{ ...C.input, padding: "4px 8px", fontSize: 11, width: "auto" }} />
                  <input type="time" value={retroForm.time} onChange={e => setRetroForm({...retroForm, time: e.target.value})} style={{ ...C.input, padding: "4px 8px", fontSize: 11, width: 90 }} />
                  <button onClick={() => addPunch(retroForm.date, retroForm.time)} style={{ ...C.btn(color), padding: "4px 10px", fontSize: 11 }}>Add</button>
               </div>
               <button onClick={() => setShowAbsenceForm(!showAbsenceForm)} style={{ ...C.btn(showAbsenceForm ? "#1e2130" : "#a855f7"), padding: "6px 12px", fontSize: 11 }}>✈️ Planejar Ausência</button>
           </div>
        </div>

        {showAbsenceForm && (
            <div style={{ background: "#0a0b0f", padding: 12, borderRadius: 8, border: "1px solid #a855f744", marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 10px", color: "#e8eaf0" }}>Planejar Ausências (Férias, Feriados, Licenças)</p>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <input type="date" value={absenceForm.startDate} onChange={e => setAbsenceForm({...absenceForm, startDate: e.target.value})} style={{ ...C.input, flex: 1, minWidth: 120 }} title="Data de Início" />
                    <span style={{ color: "#6b7280", alignSelf: "center", fontSize: 12 }}>até</span>
                    <input type="date" value={absenceForm.endDate} onChange={e => setAbsenceForm({...absenceForm, endDate: e.target.value})} style={{ ...C.input, flex: 1, minWidth: 120 }} title="Data de Fim" />
                    <select value={absenceForm.type} onChange={e => setAbsenceForm({...absenceForm, type: e.target.value})} style={{ ...C.input, width: "auto" }}><option value="Férias">Férias</option><option value="Feriado">Feriado</option><option value="Licença">Licença</option><option value="Folga">Folga</option></select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Descrição opcional..." value={absenceForm.description} onChange={e => setAbsenceForm({...absenceForm, description: e.target.value})} style={{ ...C.input, flex: 1 }} />
                    <button onClick={addAbsences} style={{...C.btn("#a855f7"), padding: "8px 16px"}}>Salvar Período</button>
                </div>
            </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#12141a", border: "1px solid #1e2130", borderRadius: 8, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
           <div style={{ flex: 1, minWidth: 100 }}>
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Saldo Inicial</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: initialMonthBalance >= 0 ? color : "#ef4444", margin: 0 }}>{formatBalance(initialMonthBalance)}</p>
           </div>
           <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...C.input, width: "auto", flex: "1 1 150px", textAlign: "center", fontWeight: 700, fontSize: 14, background: "#0a0b0f" }}>
              {uniqueMonths.map(m => {
                 const [y, mo] = m.split("-"); const dateObj = new Date(y, mo - 1, 1);
                 const label = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                 return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>
              })}
           </select>
           <div style={{ flex: 1, minWidth: 100, textAlign: "right" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Saldo Final</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: finalMonthBalance >= 0 ? color : "#ef4444", margin: 0 }}>{formatBalance(finalMonthBalance)}</p>
           </div>
        </div>

        {daysInMonth.length === 0 ? <p style={{ textAlign: "center", color: "#6b7280", padding: 30 }}>Nenhuma marcação registrada neste mês.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {daysInMonth.map(date => {
               const dayObj = timesheet.days[date]; const calc = calcDay(date, dayObj.punches, dayObj.isHoliday); const isFutureDay = date > todayStr();
               return (
                 <div key={date} style={{ background: "#0a0b0f", border: "1px solid #1e2130", borderRadius: 8, padding: 12, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: isMobile ? "stretch" : "flex-start" }}>
                   <div style={{ width: 100, flexShrink: 0 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: date === todayStr() ? color : (isFutureDay ? "#a855f7" : "#e8eaf0") }}>{date.split('-').reverse().join('/')}</p>
                      <p style={{ margin: "0 0 6px", fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{new Date(date+"T12:00:00").toLocaleDateString('pt-BR', { weekday: 'short' })}{isFutureDay && <span style={{ color: "#a855f7", display: "block", marginTop: 2 }}>(Previsão)</span>}</p>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#9ca3af", cursor: "pointer" }}><input type="checkbox" checked={dayObj.isHoliday} onChange={() => toggleHoliday(date)} /> Feriado</label>
                   </div>
                   <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      {dayObj.punches.length === 0 ? <span style={{ fontSize: 12, color: "#4b5563", fontStyle: "italic" }}>Sem marcações</span> : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {dayObj.punches.map((p, idx) => (
                             <div key={idx} style={{ display: "flex", alignItems: "center", background: "#1e2130", padding: "4px 8px", borderRadius: 6, gap: 6, border: `1px solid ${idx % 2 === 0 ? color+'44' : '#ef444444'}` }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: idx % 2 === 0 ? color : "#ef4444" }}>{p}</span>
                                <button onClick={() => removePunch(date, idx)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 10, cursor: "pointer", padding: 0 }}>✕</button>
                             </div>
                          ))}
                        </div>
                      )}
                      {calc.isRunning && <p style={{ fontSize: 11, color: "#ef4444", margin: "0", fontWeight: 600 }}>Ponto Aberto - Trabalhando agora...</p>}
                      <textarea placeholder="Comentários/Observações (ex: motivo de hora extra, atestado, folga, etc)..." value={dayObj.obs || ""} onChange={(e) => updateDayObs(date, e.target.value)} style={{ ...C.input, minHeight: 40, fontSize: 11, resize: "vertical", background: "#12141a", padding: "6px 10px", border: "1px dashed #2a2f40", color: "#9ca3af" }} />
                   </div>
                   <div style={{ width: isMobile ? "100%" : 180, display: "flex", flexDirection: "column", gap: 6, borderLeft: isMobile ? "none" : "1px solid #1e2130", paddingTop: isMobile ? 10 : 0, paddingLeft: isMobile ? 0 : 16, borderTop: isMobile ? "1px solid #1e2130" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: "#9ca3af" }}>Trabalhado:</span><span style={{ fontSize: 12, fontWeight: 700 }}>{formatTimeMins(calc.workedMins)}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: "#9ca3af" }}>Meta Diária:</span><span style={{ fontSize: 12, fontWeight: 700 }}>{formatTimeMins(calc.reqMins)} {calc.reqMins === 0 && <span style={{fontSize:9, color:"#a855f7"}}>(100% Extra)</span>}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", background: calc.balance > 0 ? `${color}18` : calc.balance < 0 ? "#ef444418" : "#1e2130", padding: "4px 8px", borderRadius: 4 }}><span style={{ fontSize: 11, fontWeight: 600, color: calc.balance > 0 ? color : calc.balance < 0 ? "#ef4444" : "#e8eaf0" }}>Saldo Dia:</span><span style={{ fontSize: 12, fontWeight: 800, color: calc.balance > 0 ? color : calc.balance < 0 ? "#ef4444" : "#e8eaf0" }}>{formatBalance(calc.balance)}</span></div>
                   </div>
                 </div>
               )
            })}
          </div>
        )}
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

  const openNew = () => { setForm({ name: "", category: tab, value: 0, target: 100, unit: "%" }); setEditingId(null); setShowForm(true) }
  const openEdit = (ind) => { setForm({ name: ind.name, category: ind.category, value: ind.value, target: ind.target, unit: ind.unit }); setEditingId(ind.id); setShowForm(true) }
  
  const saveForm = () => {
    if (!form.name.trim()) return
    if (editingId) setIndicators(prev => prev.map(i => i.id === editingId ? { ...i, ...form, value: Number(form.value), target: Number(form.target) } : i))
    else setIndicators(prev => [...prev, { ...form, id: Date.now(), value: Number(form.value), target: Number(form.target), history: [] }])
    setShowForm(false)
  }

  const updateIndicator = (id) => {
    const d = updateVals[id] || {}; const newVal = Number(d.value); const hasNewVal = d.value !== undefined && d.value !== "" && !isNaN(newVal); const hasNote = d.note && d.note.trim() !== ""
    if (!hasNewVal && !hasNote) return
    const updateDate = d.date || todayStr()
    setIndicators(prev => prev.map(i => {
      if (i.id === id) {
        const finalVal = hasNewVal ? newVal : i.value; const diff = finalVal - i.value;
        const histItem = { id: Date.now(), date: updateDate, value: finalVal, diff, note: d.note || "" }
        return { ...i, value: finalVal, history: [histItem, ...(i.history || [])] }
      }
      return i
    }))
    setUpdateVals(prev => ({ ...prev, [id]: { value: "", date: "", note: "" } }))
  }

  const updateLocalVal = (id, field, val) => setUpdateVals(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: val } }))
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
      <ModuleHeader title="Indicadores" subtitle="KPIs e acompanhamento de metas" color={color} isMobile={isMobile} action={<button onClick={openNew} style={C.btn(color)}>+ KPI</button>} />
      <ScrollTabs tabs={CATS.map(c => ({ id: c, label: c }))} active={tab} onSelect={(id) => { setTab(id); setShowForm(false) }} color={color} />

      {showForm && (
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            <input placeholder="Nome do indicador *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={C.input} />
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 10 }}>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...C.input, appearance: "none" }}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
              <input placeholder="Unidade (%...)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={C.input} title="Unidade" />
              <input type="number" placeholder="Valor atual" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} style={C.input} title="Valor Atual" />
              <input type="number" placeholder="Meta" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} style={C.input} title="Meta" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={saveForm} style={C.btn(color)}>Salvar</button><button onClick={() => setShowForm(false)} style={C.btn("#1e2130")}>Cancelar</button></div>
        </div>
      )}

      {currentInds.length === 0 ? <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 36 }}>Nenhum indicador em {tab}</div> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px,1fr))", gap: 12 }}>
          {currentInds.map(ind => {
            const pct = Math.min(100, Math.round((ind.value / ind.target) * 100)); const status = getStatus(ind.value, ind.target); const upData = updateVals[ind.id] || {}
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
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}><span style={{ fontSize: 24, fontWeight: 800, color: status.color }}>{ind.value}</span><span style={{ color: "#4b5563", fontSize: 12 }}>/ {ind.target} {ind.unit}</span></div>
                <div style={{ height: 7, background: "#1e2130", borderRadius: 4, marginBottom: 8 }}><div style={{ height: "100%", width: `${pct}%`, background: status.color, borderRadius: 4, transition: "width 0.5s ease" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p style={{ fontSize: 10, color: "#6b7280", margin: 0 }}>{pct}% da meta</p>
                  <button onClick={() => setShowHistory(showHistory === ind.id ? null : ind.id)} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 10, cursor: "pointer", padding: 0 }}>{showHistory === ind.id ? "Ocultar Histórico" : "Ver Histórico"}</button>
                </div>
                {showHistory === ind.id && (
                  <div style={{ background: "#0a0b0f", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                    <span style={C.lbl}>Histórico de Avanços</span>
                    {(ind.history || []).length === 0 ? <p style={{ fontSize: 11, color: "#4b5563", margin: "4px 0" }}>Nenhum registro.</p> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
                        {ind.history.map(h => (
                           <div key={h.id} style={{ display: "flex", flexDirection: "column", fontSize: 11, borderBottom: "1px solid #1e2130", paddingBottom: 6 }}>
                             <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af" }}>{h.date.split("-").reverse().join("/")}</span><span style={{ fontWeight: 600 }}>Valor: {h.value} <span style={{ color: h.diff >= 0 ? "#22c55e" : "#ef4444" }}>({h.diff > 0 ? '+' : ''}{h.diff})</span></span></div>
                             {h.note && <span style={{ color: "#6b7280", marginTop: 3, fontStyle: "italic", whiteSpace: "pre-wrap" }}>{h.note}</span>}
                           </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#1e2130", padding: 8, borderRadius: 8 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" placeholder="Novo valor (Opcional)" value={upData.value ?? ""} onChange={e => updateLocalVal(ind.id, 'value', e.target.value)} onKeyDown={e => e.key === 'Enter' && updateIndicator(ind.id)} style={{ ...C.input, width: 130, padding: "5px 8px", fontSize: 11 }} />
                    <input type="date" value={upData.date ?? ""} onChange={e => updateLocalVal(ind.id, 'date', e.target.value)} style={{ ...C.input, flex: 1, padding: "5px 8px", fontSize: 11 }} />
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
const ICONS = ['📄', '📊', '🤝', '💡', '📌', '🚀', '🛠️', '📝', '📁', '⚙️', '📅', '📞', '🔍', '📦', '🎯', '💰'];

function NotesModule({ notes, setNotes, teams, isMobile, noteSettings, setNoteSettings }) {
  const color = "#a855f7"
  const [tab, setTab] = useState("meetings")
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  const [manageMode, setManageMode] = useState(null) 
  const [typeForm, setTypeForm] = useState({ name: "", icon: "📄", fields: [] })

  const [searchQ, setSearchQ] = useState("")
  const [form, setForm] = useState({ title: "", content: "", date: new Date().toLocaleDateString("pt-BR"), team: "", tags: "", person: "", type: "Recebido", customFields: {} })

  const SECS = [
    { id: "meetings",   label: "📅 Reuniões"    },
    { id: "feedbacks",  label: "💬 Feedbacks"   },
    { id: "changes",    label: "🚀 Changes"     },
    { id: "others",     label: "📝 Geral"       },
    ...(noteSettings?.customTypes || []).map(ct => ({ id: ct.id, label: `${ct.icon} ${ct.label}`, isCustom: true }))
  ]

  const currentCustomType = (noteSettings?.customTypes || []).find(ct => ct.id === tab);

  const openNew = () => {
    setForm({ title: "", content: "", date: todayStr().split('-').reverse().join('/'), team: "", tags: "", person: "", type: "Recebido", customFields: {} })
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (note) => {
    setForm({ title: note.title, content: note.content, date: note.date, team: note.team || "", person: note.person || "", type: note.type || "Recebido", tags: (note.tags||[]).join(", "), customFields: note.customFields || {} })
    setEditingId(note.id)
    setShowForm(true)
  }

  const saveNote = () => {
    let finalTitle = form.title;
    if (currentCustomType) {
      const firstFieldId = currentCustomType.fields[0]?.id;
      finalTitle = form.customFields[firstFieldId] || "Sem título definido";
    }

    if (!finalTitle.trim() && !currentCustomType) return
    if (currentCustomType && (!form.customFields[currentCustomType.fields[0]?.id] || !form.customFields[currentCustomType.fields[0]?.id].trim())) return;

    const tagsArr = form.tags.split(",").map(t => t.trim()).filter(Boolean)
    const newNote = { ...form, title: finalTitle, tags: tagsArr }
    
    if (editingId) setNotes(prev => ({ ...prev, [tab]: (prev[tab]||[]).map(n => n.id === editingId ? { ...n, ...newNote } : n) }))
    else setNotes(prev => ({ ...prev, [tab]: [{ id: Date.now(), ...newNote }, ...(prev[tab]||[])] }))
    
    setShowForm(false)
  }

  const saveNewType = () => {
    const fieldsToSave = typeForm.fields.filter(f => f.name.trim());
    if (!typeForm.name.trim() || fieldsToSave.length === 0) return;

    const newType = { id: typeForm.id || ("custom_" + Date.now()), label: typeForm.name, icon: typeForm.icon, fields: fieldsToSave };
    
    setNoteSettings(prev => {
       const exists = (prev.customTypes || []).find(t => t.id === newType.id);
       if (exists) return { ...prev, customTypes: prev.customTypes.map(t => t.id === newType.id ? newType : t) };
       return { ...prev, customTypes: [...(prev.customTypes || []), newType] };
    });
    setManageMode('list');
  }

  const moveField = (index, direction) => {
    const newFields = [...typeForm.fields];
    if (index + direction < 0 || index + direction >= newFields.length) return;
    const temp = newFields[index];
    newFields[index] = newFields[index + direction];
    newFields[index + direction] = temp;
    setTypeForm({...typeForm, fields: newFields});
  };
  
  const deleteNote = (id) => setNotes(prev => ({ ...prev, [tab]: prev[tab].filter(n => n.id !== id) }))
  
  const rawCurrent = notes[tab] || []
  const current = rawCurrent.filter(n => {
    if(!searchQ.trim()) return true
    const q = searchQ.toLowerCase()
    let matchesCustom = false;
    if (n.customFields) matchesCustom = Object.values(n.customFields).some(val => String(val).toLowerCase().includes(q))
    return (n.title && n.title.toLowerCase().includes(q)) || (n.content && n.content.toLowerCase().includes(q)) || (n.tags && n.tags.some(t => t.toLowerCase().includes(q))) || (n.team && n.team.toLowerCase().includes(q)) || (n.person && n.person.toLowerCase().includes(q)) || matchesCustom
  })

  return (
    <div>
      <ModuleHeader title="Notas & Docs" subtitle="Reuniões, feedbacks, templates e anotações gerais" color={color} isMobile={isMobile} action={<button onClick={openNew} style={C.btn(color)}>+ Novo Documento</button>} />

      <div style={{ marginBottom: 16 }}>
         <input placeholder="Busca inteligente (título, conteúdo, campos customizados ou tags)..." value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ ...C.input, background: "#12141a" }} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
         <ScrollTabs tabs={SECS} active={tab} onSelect={(id) => { setTab(id); setShowForm(false); setManageMode(null) }} color={color} />
         <button onClick={() => setManageMode('list')} style={{ ...C.btn("#1e2130"), fontSize: 11, padding: "8px 12px", height: 35 }}>⚙️ Gerenciar Tipos</button>
      </div>

      {manageMode === 'form' && (
         <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16, background: "#1a1d26" }}>
           <span style={C.lbl}>1. Escolha um Ícone</span>
           <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {ICONS.map(ic => (
                 <button key={ic} onClick={() => setTypeForm({...typeForm, icon: ic})} style={{ background: typeForm.icon === ic ? color : "#1e2130", border: "none", borderRadius: 8, padding: "8px", fontSize: 18, cursor: "pointer", transition: "0.2s" }}>{ic}</button>
              ))}
           </div>
           
           <span style={C.lbl}>2. Nome da Aba/Tipo</span>
           <input placeholder="ex: Ata de Reunião, 1:1, Relatório..." value={typeForm.name} onChange={e => setTypeForm({...typeForm, name: e.target.value})} style={{ ...C.input, marginBottom: 16 }} />

           <span style={C.lbl}>3. Campos do Documento (O primeiro será usado como Título)</span>
           {typeForm.fields.map((f, i) => (
              <div key={f.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <div style={{ width: 24, textAlign: "center", color: "#6b7280", fontSize: 12 }}>{i + 1}.</div>
                <input placeholder="Nome do campo" value={f.name} onChange={e => {
                   const newFields = [...typeForm.fields]; newFields[i].name = e.target.value; setTypeForm({...typeForm, fields: newFields});
                }} style={{...C.input, flex: 1}} />
                
                <select value={f.type || 'text'} onChange={e => {
                   const newFields = [...typeForm.fields]; newFields[i].type = e.target.value; setTypeForm({...typeForm, fields: newFields});
                }} style={{ ...C.input, width: isMobile ? 110 : 130 }}>
                   <option value="text">Texto Curto</option>
                   <option value="textarea">Descrição</option>
                   <option value="number">Numérico</option>
                   <option value="date">Data</option>
                </select>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", justifyContent: "center" }}>
                   <button onClick={() => moveField(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: i === 0 ? "#4b5563" : "#9ca3af", cursor: i === 0 ? "default" : "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>▲</button>
                   <button onClick={() => moveField(i, 1)} disabled={i === typeForm.fields.length - 1} style={{ background: "none", border: "none", color: i === typeForm.fields.length - 1 ? "#4b5563" : "#9ca3af", cursor: i === typeForm.fields.length - 1 ? "default" : "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>▼</button>
                </div>

                <button onClick={() => setTypeForm({...typeForm, fields: typeForm.fields.filter(field => field.id !== f.id)})} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
           ))}
           <button onClick={() => setTypeForm({...typeForm, fields: [...typeForm.fields, { id: Date.now(), name: "", type: "text" }]})} style={{ ...C.btn("transparent"), fontSize: 11, marginBottom: 16, padding: "6px 0" }}>+ Adicionar mais um campo</button>
           
           <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid #2a2f40" }}>
              <button onClick={saveNewType} style={C.btn(color)}>Salvar Tipo</button>
              <button onClick={() => setManageMode('list')} style={C.btn("transparent")}>Voltar</button>
           </div>
         </div>
      )}

      {manageMode === 'list' && (
         <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16, background: "#1a1d26" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
               <span style={{...C.lbl, margin: 0}}>Gerenciar Tipos de Notas</span>
               <button onClick={() => { setTypeForm({ name: "", icon: ICONS[0], fields: [{ id: Date.now(), name: "Título / Nome do Documento", type: "text" }] }); setManageMode('form'); }} style={{ ...C.btn(color), fontSize: 11, padding: "6px 12px" }}>+ Novo Tipo</button>
            </div>
            {(noteSettings?.customTypes || []).length === 0 ? <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>Nenhum tipo personalizado criado ainda.</p> : (
               <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(noteSettings?.customTypes || []).map(ct => (
                     <div key={ct.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0b0f", padding: "10px 14px", borderRadius: 8, border: "1px solid #2a2f40" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                           <span style={{ fontSize: 20 }}>{ct.icon}</span>
                           <div>
                              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e8eaf0" }}>{ct.label}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>{ct.fields?.length || 0} campos</p>
                           </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                           <button onClick={() => { setTypeForm({ id: ct.id, name: ct.label, icon: ct.icon, fields: ct.fields }); setManageMode('form'); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, padding: "0 4px" }}>✏️</button>
                           <button onClick={() => {
                              if (window.confirm(`Tem certeza que deseja excluir o tipo "${ct.label}"?\nAs notas antigas desse tipo ficarão inacessíveis nesta aba.`)) {
                                 setNoteSettings(prev => ({...prev, customTypes: prev.customTypes.filter(t => t.id !== ct.id)}));
                                 if (tab === ct.id) setTab('meetings');
                              }
                           }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, padding: "0 4px" }}>🗑</button>
                        </div>
                     </div>
                  ))}
               </div>
            )}
            <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid #2a2f40" }}>
               <button onClick={() => setManageMode(null)} style={C.btn("#1e2130")}>Fechar Configurações</button>
            </div>
         </div>
      )}

      {showForm && !manageMode && (
        <div style={{ ...C.card, borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {currentCustomType ? (
               <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {currentCustomType.fields.map((f, idx) => (
                     <div key={f.id}>
                        <span style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, display: "block" }}>{f.name} {idx === 0 && <span style={{color: color}}>(Título da Nota) *</span>}</span>
                        {f.type === 'textarea' ? (
                            <textarea placeholder={`Preencha o campo '${f.name}'...`} value={form.customFields[f.id] || ""} onChange={e => setForm({...form, customFields: {...form.customFields, [f.id]: e.target.value}})} style={{ ...C.input, minHeight: 60, resize: "vertical" }} />
                        ) : (
                            <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} placeholder={`Preencha o campo '${f.name}'...`} value={form.customFields[f.id] || ""} onChange={e => setForm({...form, customFields: {...form.customFields, [f.id]: e.target.value}})} style={C.input} />
                        )}
                     </div>
                  ))}
                  <div>
                     <span style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, display: "block" }}>Tags para busca</span>
                     <input placeholder="Ex: importante, projeto X, aprovado..." value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} style={C.input} />
                  </div>
               </div>
            ) : 
            tab === "changes" ? (
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
                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ ...C.input, width: isMobile ? "100%" : 140 }}><option value="Recebido">Recebido</option><option value="Dado">Dado</option></select>
                    <input placeholder="Nome da pessoa relacionada *" value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} style={{ ...C.input, flex: 1 }} />
                  </div>
               </div>
            ) : (
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                <input placeholder="Título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ ...C.input, flex: 1 }} />
                <input placeholder="Data (DD/MM/AAAA)" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ ...C.input, width: isMobile ? "100%" : 140 }} />
              </div>
            )}
            
            {!currentCustomType && (
               <>
                 <input placeholder="Tags para busca (separadas por vírgula)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} style={C.input} />
                 <textarea placeholder={tab === "changes" ? "Itens entregues..." : tab === "feedbacks" ? "Pontos fortes e oportunidades detalhadas..." : "Conteúdo detalhado..."} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} style={{ ...C.input, minHeight: 100, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
               </>
            )}
            
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveNote} style={C.btn(color)}>Salvar Documento</button>
              <button onClick={() => setShowForm(false)} style={C.btn("#1e2130")}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {!manageMode && (
         <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
           {current.length === 0 ? <div style={{ ...C.card, textAlign: "center", color: "#4b5563", padding: 36 }}>Nenhum documento encontrado nesta aba.</div> : current.map(note => (
               <div key={note.id} style={{ ...C.card, borderLeft: `4px solid ${color}` }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                   <div>
                     <h4 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, margin: "0 0 4px", fontSize: 15, wordBreak: "break-word" }}>{note.title}</h4>
                     <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                       {!currentCustomType && <span style={C.tag(color)}>{note.date}</span>}
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

                 {currentCustomType ? (
                    <div style={{ marginTop: 10, borderTop: "1px solid #1e2130", paddingTop: 10 }}>
                      {currentCustomType.fields.map((f, idx) => {
                         if (idx === 0) return null;
                         return note.customFields && note.customFields[f.id] ? (
                          <div key={f.id} style={{ marginBottom: 12 }}>
                            <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.name}</span>
                            <p style={{ fontSize: 13, color: "#e8eaf0", margin: "2px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                               {f.type === 'date' ? note.customFields[f.id].split('-').reverse().join('/') : note.customFields[f.id]}
                            </p>
                          </div>
                        ) : null
                      })}
                    </div>
                 ) : (
                    note.content && <p style={{ fontSize: 13, color: "#9ca3af", margin: "10px 0 0", lineHeight: 1.7, whiteSpace: "pre-wrap", borderTop: "1px solid #1e2130", paddingTop: 10 }}>{note.content}</p>
                 )}
               </div>
             ))
           }
         </div>
      )}
    </div>
  )
}

// ─── 10. Main App Wrapper (Autenticação + Sincronização) ──────────────────────
function MainApp({ user }) {
  const isMobile = useIsMobile()
  const [activeModule, setActiveModule] = useState("timeclock")
  
  const [teams, setTeams, tLoaded] = useSyncedState("teams", INIT_TEAMS, user);
  const [tasks, setTasks, tkLoaded] = useSyncedState("tasks", INIT_TASKS, user);
  const [researchItems, setResearchItems, resLoaded] = useSyncedState("researchItems", [], user);
  const [notes, setNotes, nLoaded] = useSyncedState("notes", INIT_NOTES, user);
  const [indicators, setIndicators, indLoaded] = useSyncedState("indicators", INIT_INDICATORS, user);
  const [events, setEvents, evLoaded] = useSyncedState("events", [], user);
  const [alerts, setAlerts, altLoaded] = useSyncedState("alerts", [], user);
  const [timesheet, setTimesheet, tsLoaded] = useSyncedState("timesheet", INIT_TIMESHEET, user);
  const [noteSettings, setNoteSettings, nsLoaded] = useSyncedState("noteSettings", { customTypes: [] }, user);

  const [pomo, setPomo] = useState({ running: false, seconds: 25 * 60, initialSec: 25 * 60, isBreak: false, cycles: 0 })
  const [activeAlert, setActiveAlert] = useState(null)
  const [dbError, setDbError] = useState(false)

  const allLoaded = tLoaded && tkLoaded && resLoaded && nLoaded && indLoaded && evLoaded && altLoaded && tsLoaded && nsLoaded;

  useEffect(() => {
    const handleDbError = () => setDbError(true);
    window.addEventListener('db-permission-error', handleDbError);
    return () => window.removeEventListener('db-permission-error', handleDbError);
  }, []);

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

  useEffect(() => {
    if (!allLoaded) return;
    const interval = setInterval(() => {
      const now = new Date(); const currDate = todayStr(); const currTime = fmtTime(now.getHours() * 60 + now.getMinutes());
      setAlerts(prev => {
        let triggeredAny = false;
        const next = prev.map(a => {
           if (!a.triggered && a.date === currDate && a.time === currTime) {
             triggeredAny = true; playBeep(); setActiveAlert(a); return { ...a, triggered: true };
           }
           return a;
        });
        return triggeredAny ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [allLoaded, setAlerts]);

  if (!allLoaded) return <div style={{ background: "#0a0b0f", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", color: "#6b7280", fontFamily: "'Manrope',sans-serif" }}>Sincronizando seus dados...</div>;

  const acMod        = MODULES.find(m => m.id === activeModule)
  const overdueCount = tasks.filter(t => isPast(t.deadline) && t.status !== "done").length
  const myDayCount   = tasks.filter(t => checkIsToday(t) && t.status !== "done").length
  const today        = new Date()

  const handleLogout = () => signOut(auth);

  const sharedProps = { teams, setTeams, tasks, setTasks, researchItems, setResearchItems, notes, setNotes, indicators, setIndicators, timesheet, setTimesheet, isMobile, pomo, setPomo, events, setEvents, alerts, setAlerts, noteSettings, setNoteSettings }

  return (
    <div style={{ fontFamily: "'Manrope',sans-serif", background: "#0a0b0f", color: "#e8eaf0", minHeight: "100vh", position: "relative" }}>
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
                <button key={m.id} onClick={() => setActiveModule(m.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 18px", border: "none", background: isActive ? `${m.color}14` : "transparent", color: isActive ? m.color : "#6b7280", borderLeft: `3px solid ${isActive ? m.color : "transparent"}`, cursor: "pointer", fontSize: 13, fontWeight: isActive ? 600 : 400, textAlign: "left", transition: "all 0.15s" }}>
                  <span style={{ fontSize: 14 }}>{m.icon}</span>
                  <span style={{ flex: 1 }}>{m.fullLabel}</span>
                  {badge && <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{badge}</span>}
                </button>
              )
            })}
          </nav>
          <div style={{ padding: "12px 18px", borderTop: "1px solid #1a1d27" }}>
            <p style={{ fontSize: 11, color: "#4b5563", margin: "0 0 2px", fontWeight: 600, textTransform: "capitalize" }}>{today.toLocaleDateString("pt-BR", { weekday: "long" })}</p>
            <p style={{ fontSize: 10, color: "#374151", margin: "0 0 10px" }}>{today.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</p>
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
              {pomo.running && <div style={{ width: "100%", height: 38, marginTop: 4 }}><MiniPomoHeader pomo={pomo} /></div>}
            </div>
            <button onClick={handleLogout} style={{ ...C.btn("transparent"), color: "#ef4444", fontSize: 12, marginTop: 10, width: "100%", padding: "8px" }}>🚪 Sair da Conta</button>
          </div>
        </aside>
      )}

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

      <main style={{ marginLeft: isMobile ? 0 : 228, paddingTop:  isMobile ? 64 : 0, paddingBottom: isMobile ? 74 : 0, padding: isMobile ? "64px 14px 74px" : "28px 32px", maxWidth: isMobile ? "100%" : `calc(100vw - 228px)`, boxSizing: "border-box", minHeight: "100vh" }}>
        {activeModule === "teams"        && <TeamsModule        {...sharedProps} />}
        {activeModule === "tasks"        && <TasksModule        {...sharedProps} />}
        {activeModule === "productivity" && <ProductivityModule {...sharedProps} />}
        {activeModule === "timeclock"    && <TimeclockModule    {...sharedProps} />}
        {activeModule === "indicators"   && <IndicatorsModule   {...sharedProps} />}
        {activeModule === "notes"        && <NotesModule        {...sharedProps} />}
      </main>

      {isMobile && (
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "#0c0e14", borderTop: "1px solid #1a1d27", display: "flex", alignItems: "stretch", height: 64 }}>
          {MODULES.map(m => {
            const isActive = activeModule === m.id
            const badge = m.id === "tasks" && overdueCount > 0 ? overdueCount : null
            return (
              <button key={m.id} onClick={() => setActiveModule(m.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", background: "transparent", cursor: "pointer", padding: "6px 2px", position: "relative", borderTop: `2px solid ${isActive ? m.color : "transparent"}`, transition: "all 0.15s" }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
                <span style={{ fontSize: 9, color: isActive ? m.color : "#6b7280", fontWeight: isActive ? 700 : 400, letterSpacing: "0.2px" }}>{m.label}</span>
                {badge && <div style={{ position: "absolute", top: 6, right: "50%", marginRight: -18, background: "#ef4444", color: "#fff", borderRadius: 8, padding: "0px 4px", fontSize: 9, fontWeight: 700, lineHeight: "14px" }}>{badge}</div>}
              </button>
            )
          })}
        </nav>
      )}

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

      {dbError && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, backdropFilter: "blur(4px)", padding: 20 }}>
          <div style={{ background: "#12141a", border: "2px solid #ef4444", padding: "30px 20px", borderRadius: 16, maxWidth: 500, width: "100%", boxShadow: "0 10px 40px rgba(239, 68, 68, 0.3)" }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", color: "#ef4444", margin: "0 0 16px", fontSize: 22, fontWeight: 800, textAlign: "center" }}>⚠️ Erro de Permissão no Banco de Dados</h2>
            <p style={{ fontSize: 14, color: "#e8eaf0", marginBottom: 16, lineHeight: 1.6 }}>O Firebase bloqueou o acesso ao seu Firestore. Por padrão, ele vem bloqueado por segurança.</p>
            <p style={{ fontSize: 14, color: "#e8eaf0", marginBottom: 10, lineHeight: 1.6, fontWeight: "bold" }}>Siga estes 3 passos rápidos para resolver:</p>
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

export default function App() {
  useAppAssets();
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoaded(true); });
    return unsub;
  }, []);

  const loginWithEmail = async (email, password) => {
    try { setLoginError(""); await signInWithEmailAndPassword(auth, email, password); } 
    catch (error) { if (error.code === 'auth/invalid-credential') setLoginError("E-mail ou senha incorretos."); else setLoginError("Erro no login: " + error.message); }
  };

  const registerWithEmail = async (email, password) => {
    try { setLoginError(""); await createUserWithEmailAndPassword(auth, email, password); } 
    catch (error) {
      if (error.code === 'auth/email-already-in-use') setLoginError("Este e-mail já está em uso.");
      else if (error.code === 'auth/weak-password') setLoginError("A senha deve ter pelo menos 6 caracteres.");
      else if (error.code === 'auth/admin-restricted-operation') setLoginError("⚠️ Você precisa ativar o provedor 'E-mail/Senha' no painel do Firebase > Authentication > Sign-in method.");
      else setLoginError("Erro ao registrar: " + error.message);
    }
  };

  const loginWithGoogle = async () => {
    try { setLoginError(""); await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (error) { if (error.code === 'auth/unauthorized-domain') { setLoginError("⚠️ Domínio não autorizado pelo Firebase.\n\nPara usar o Google Login neste ambiente de pré-visualização, prefira entrar com E-mail e Senha (lembre-se de ativar no Firebase)."); } else { setLoginError("Erro ao fazer login: " + error.message); } }
  };

  const loginAnonymously = async () => {
    try { setLoginError(""); await signInAnonymously(auth); } 
    catch (error) { if (error.code === 'auth/admin-restricted-operation') { setLoginError("⚠️ Login Anônimo Desativado.\n\nAcesse seu painel Firebase > Authentication > Sign-in method e ative a opção 'Anonymous' (Anônimo)."); } else { setLoginError("Erro no login anônimo: " + error.message); } }
  };

  if (!authLoaded) return <div style={{ background: "#0a0b0f", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", color: "#6b7280", fontFamily: "'Manrope',sans-serif" }}>Verificando autenticação...</div>;
  if (!user) return <LoginScreen onLoginGoogle={loginWithGoogle} onLoginAnon={loginAnonymously} onLoginEmail={loginWithEmail} onRegisterEmail={registerWithEmail} error={loginError} />;
  return <MainApp user={user} />;
}