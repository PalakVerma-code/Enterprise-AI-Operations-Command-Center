import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity, Play, Server, TerminalSquare, Clock, AlertTriangle,
  Layers, Search, LayoutDashboard, AlertCircle, Settings, History,
  MessageSquare, Send, CheckCircle2, Cpu, ShieldAlert, Database,
  Wrench, Zap, TrendingUp, RefreshCw, BookOpen, Globe, BarChart3,
  Package, CheckCircle, XCircle, Info, Ticket, Tag, Eye,
  Users, GitMerge, UserCheck, Heart, Target, Star, ChevronRight,
  ToggleLeft, ToggleRight, PlusCircle, LogOut, Shield
} from 'lucide-react';

const API_IT  = import.meta.env.VITE_API_URL  || 'http://127.0.0.1:8000'; // FastAPI
const API_HCM = import.meta.env.VITE_HCM_URL  || 'http://localhost:5000';  // Node.js

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color = '#58a6ff', trend }) {
  return (
    <div className="metric-box">
      <div className="metric-icon-wrap" style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div className="metric-val">{value}</div>
        <div className="metric-label">{label}</div>
        {trend && <div className="metric-trend">{trend}</div>}
      </div>
    </div>
  );
}

function CapBar({ pct }) {
  const cls = pct > 100 ? 'cap-over' : pct > 85 ? 'cap-warn' : 'cap-ok';
  return (
    <div className="capacity-bar-wrap">
      <div className="capacity-bar" style={{ width: `${Math.min(pct, 100)}%` }} />
      <style>{`.capacity-bar { background: var(--${cls === 'cap-ok' ? 'green' : cls === 'cap-warn' ? 'yellow' : 'pink'}); }`}</style>
    </div>
  );
}

const SAMPLE_INCIDENTS = [
  'The Payment API is returning 500 errors. DB connection timeouts observed.',
  'Auth Service showing 35% JWT validation failure rate. Possible SSL cert issue.',
  'Web Frontend experiencing intermittent slowness. CDN latency spikes suspected.',
];

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('dashboard');

  // ── Auth state ──
  const [authUser, setAuthUser]       = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode]       = useState('login'); // login | signup | setup
  const [authForm, setAuthForm]       = useState({ name:'', email:'', password:'', jobTitle:'', skills:'' });
  const [authError, setAuthError]     = useState('');

  // ── HCM state ──
  const [hcmState, setHcmState]             = useState(null);
  const [hcmLoading, setHcmLoading]         = useState(false);
  const [matrixToggling, setMatrixToggling] = useState(null);
  const [ragPrompt, setRagPrompt]           = useState('');
  const [ragResult, setRagResult]           = useState(null);
  const [ragLoading, setRagLoading]         = useState(false);
  const [selectedOp, setSelectedOp]         = useState(null);
  const [hrReview, setHrReview]             = useState(null);
  const [hrReviewLoading, setHrReviewLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');

  // ── IT Incident state ──
  const [requestText, setRequestText]             = useState('');
  const [itLoading, setItLoading]                 = useState(false);
  const [itResult, setItResult]                   = useState(null);
  const [jobId, setJobId]                         = useState(null);
  const [activeTab, setActiveTab]                 = useState('plan');
  const [chatMessages, setChatMessages]           = useState([]);
  const [chatInput, setChatInput]                 = useState('');
  const [isChatting, setIsChatting]               = useState(false);
  const chatEndRef = useRef(null);

  // ── Shared state ──
  const [agents, setAgents]             = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [history, setHistory]           = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metrics, setMetrics]           = useState(null);
  const [apiHealth, setApiHealth]       = useState(null);
  const [tools, setTools]               = useState([]);
  const [tickets, setTickets]           = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // ── Auth bootstrap ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const setupRes = await axios.get(`${API_HCM}/api/auth/setup-status`);
        if (setupRes.data.setupRequired) { setAuthMode('setup'); setAuthLoading(false); return; }
        const meRes = await axios.get(`${API_HCM}/api/auth/me`, { withCredentials: true });
        setAuthUser(meRes.data.user);
      } catch { /* not logged in */ }
      setAuthLoading(false);
    })();
  }, []);

  // ── Fetch HCM data ──────────────────────────────────────────────────────────

  const fetchHcm = useCallback(async () => {
    if (!authUser) return;
    setHcmLoading(true);
    try {
      const res = await axios.get(`${API_HCM}/api/state`, { withCredentials: true });
      setHcmState(res.data);
    } catch (e) { console.error(e); }
    finally { setHcmLoading(false); }
  }, [authUser]);

  useEffect(() => { if (authUser && (view === 'hr_matrix' || view === 'hr_review' || view === 'dashboard')) fetchHcm(); }, [authUser, view, fetchHcm]);

  // ── Fetch IT data ───────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try { const r = await axios.get(`${API_IT}/agents`); setAgents(r.data.agents || []); } catch {}
    finally { setAgentsLoading(false); }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { const r = await axios.get(`${API_IT}/incidents/history`); setHistory(r.data.history || []); } catch {}
    finally { setHistoryLoading(false); }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const [m, h] = await Promise.all([axios.get(`${API_IT}/metrics`), axios.get(`${API_IT}/health`)]);
      setMetrics(m.data); setApiHealth(h.data);
    } catch {}
  }, []);

  const fetchTools = useCallback(async () => {
    try { const r = await axios.get(`${API_IT}/tools`); setTools(r.data.tools || []); } catch {}
  }, []);

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    try { const r = await axios.get(`${API_IT}/tickets`); setTickets(r.data.tickets || []); } catch {}
    finally { setTicketsLoading(false); }
  }, []);

  useEffect(() => {
    if (view === 'dashboard') { fetchMetrics(); fetchHcm(); }
    if (view === 'incidents') fetchAgents();
    if (view === 'agent_fleet') fetchAgents();
    if (view === 'history') fetchHistory();
    if (view === 'tools') fetchTools();
    if (view === 'tickets') fetchTickets();
  }, [view]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAuth = async (e) => {
    e.preventDefault(); setAuthError('');
    try {
      const skills = authForm.skills.split(',').map(s => s.trim()).filter(Boolean);
      if (authMode === 'setup') {
        await axios.post(`${API_HCM}/api/auth/setup-admin`, { name: authForm.name, email: authForm.email, password: authForm.password }, { withCredentials: true });
      } else if (authMode === 'signup') {
        await axios.post(`${API_HCM}/api/auth/signup`, { ...authForm, skills }, { withCredentials: true });
      } else {
        await axios.post(`${API_HCM}/api/auth/login`, { email: authForm.email, password: authForm.password }, { withCredentials: true });
      }
      const meRes = await axios.get(`${API_HCM}/api/auth/me`, { withCredentials: true });
      setAuthUser(meRes.data.user);
    } catch (e) { setAuthError(e.response?.data?.error || 'Authentication failed.'); }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API_HCM}/api/auth/logout`, {}, { withCredentials: true }); } catch {}
    setAuthUser(null); setAuthMode('login');
  };

  const handleMatrixToggle = async (operativeId, projectId) => {
    const key = `${operativeId}-${projectId}`;
    setMatrixToggling(key);
    try { await axios.post(`${API_HCM}/api/matrix/toggle`, { operativeId, projectId }, { withCredentials: true }); fetchHcm(); } catch {}
    finally { setMatrixToggling(null); }
  };

  const handleRag = async () => {
    if (!ragPrompt.trim()) return;
    setRagLoading(true);
    try { const r = await axios.post(`${API_HCM}/api/rag/query`, { prompt: ragPrompt }, { withCredentials: true }); setRagResult(r.data); } catch {}
    finally { setRagLoading(false); }
  };

  const handleHrReview = async () => {
    if (!selectedOp) return;
    setHrReviewLoading(true); setHrReview(null);
    try {
      const op = hcmState?.operatives?.find(o => o.id === selectedOp);
      const proj = selectedProject ? hcmState?.projects?.find(p => p.id === selectedProject) : null;
      const r = await axios.post(`${API_HCM}/api/hr-review`, { employee: op, project: proj }, { withCredentials: true });
      setHrReview(r.data);
    } catch {}
    finally { setHrReviewLoading(false); }
  };

  const handleRunWorkflow = async () => {
    if (!requestText.trim()) return;
    setItLoading(true); setItResult(null); setChatMessages([]); setActiveTab('plan');
    try {
      const r = await axios.post(`${API_IT}/workflow/run`, { request_text: requestText });
      setItResult(r.data); setJobId(r.data.job_id);
    } catch (e) { setItResult({ error: e.response?.data?.detail || 'Workflow failed.' }); }
    finally { setItLoading(false); }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !jobId) return;
    const msg = chatInput; setChatInput(''); setIsChatting(true);
    setChatMessages(m => [...m, { role: 'user', content: msg }]);
    try {
      const r = await axios.post(`${API_IT}/workflow/chat/${jobId}`, { message: msg });
      setChatMessages(m => [...m, { role: 'bot', content: r.data.reply }]);
    } catch { setChatMessages(m => [...m, { role: 'bot', content: 'Error connecting to LLM.' }]); }
    finally { setIsChatting(false); }
  };

  // ── Auth screen ──────────────────────────────────────────────────────────────

  if (authLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16 }}>
      <div className="spinner" style={{ width:32, height:32, borderWidth:3 }} />
      <div style={{ color:'var(--text-secondary)', fontSize:13 }}>Connecting to NexusOps…</div>
    </div>
  );

  if (!authUser) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-base)' }}>
      <div style={{ width:420, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, padding:36 }}>
        <div style={{ marginBottom:28, textAlign:'center' }}>
          <div style={{ fontSize:22, fontWeight:800, background:'linear-gradient(135deg, #58a6ff, #a371f7)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>NexusOps</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:4 }}>Enterprise AI Operations Command Center</div>
        </div>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:20, color:'var(--text-primary)' }}>
          {authMode === 'setup' ? '🔧 Initial Admin Setup' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
        </div>
        {authError && <div style={{ background:'rgba(248,81,73,0.1)', border:'1px solid rgba(248,81,73,0.3)', borderRadius:8, padding:'10px 14px', color:'var(--pink)', fontSize:13, marginBottom:16 }}>{authError}</div>}
        <form onSubmit={handleAuth}>
          {(authMode === 'setup' || authMode === 'signup') && (
            <div className="form-group">
              <div className="input-label">Full Name</div>
              <input className="input" value={authForm.name} onChange={e => setAuthForm(f => ({...f, name:e.target.value}))} placeholder="Your name" required />
            </div>
          )}
          <div className="form-group">
            <div className="input-label">Email</div>
            <input className="input" type="email" value={authForm.email} onChange={e => setAuthForm(f => ({...f, email:e.target.value}))} placeholder="you@company.com" required />
          </div>
          <div className="form-group">
            <div className="input-label">Password (min 10 chars)</div>
            <input className="input" type="password" value={authForm.password} onChange={e => setAuthForm(f => ({...f, password:e.target.value}))} placeholder="••••••••••" required />
          </div>
          {authMode === 'signup' && (
            <>
              <div className="form-group">
                <div className="input-label">Job Title</div>
                <input className="input" value={authForm.jobTitle} onChange={e => setAuthForm(f => ({...f, jobTitle:e.target.value}))} placeholder="e.g. Senior Engineer" />
              </div>
              <div className="form-group">
                <div className="input-label">Skills (comma-separated)</div>
                <input className="input" value={authForm.skills} onChange={e => setAuthForm(f => ({...f, skills:e.target.value}))} placeholder="Python, React, AWS" />
              </div>
            </>
          )}
          <button type="submit" className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'10px', marginTop:8 }}>
            {authMode === 'setup' ? 'Create Admin Account' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>
        {authMode !== 'setup' && (
          <div style={{ marginTop:14, textAlign:'center', fontSize:13, color:'var(--text-secondary)' }}>
            {authMode === 'login' ? (
              <>No account? <span style={{ color:'var(--blue)', cursor:'pointer', fontWeight:600 }} onClick={() => setAuthMode('signup')}>Register</span></>
            ) : (
              <>Have an account? <span style={{ color:'var(--blue)', cursor:'pointer', fontWeight:600 }} onClick={() => setAuthMode('login')}>Sign in</span></>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Nav helpers ──────────────────────────────────────────────────────────────

  const isAdmin = authUser.role === 'admin';
  const isHR = authUser.role === 'hr' || isAdmin;
  const isItOnline = Boolean(apiHealth && (apiHealth.status === 'healthy' || apiHealth.status === 'degraded' || apiHealth.components?.api === 'ok'));

  // ── View: Dashboard ──────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div>
      <div className="metric-grid">
        <StatCard icon={Cpu} value="9" label="Active Agents" color="#58a6ff" trend="4 IT + 5 HR" />
        <StatCard icon={Activity} value={metrics?.workflows?.total_all_time ?? '—'} label="Total Incidents" color="#a371f7" />
        <StatCard icon={Users} value={hcmState?.operatives?.length ?? '—'} label="Operatives" color="#3fb950" />
        <StatCard icon={Layers} value={hcmState?.projects?.length ?? '—'} label="Active Projects" color="#f78166" />
        <StatCard icon={Ticket} value={metrics?.workflows?.session_total ?? '—'} label="Session Workflows" color="#e3b341" />
        <StatCard icon={CheckCircle2} value={isItOnline ? 'Online' : 'Offline'} label="Platform Status" color={isItOnline ? '#3fb950' : '#f85149'} />
      </div>

      <div className="two-col">
        {/* IT Agent Status */}
        <div className="card">
          <div className="section-header">
            <div><div className="section-title"><ShieldAlert size={16} />IT Agent Fleet</div><div className="section-sub">LLM-powered via Groq + LangGraph</div></div>
          </div>
          {['Planner Agent','Investigation Agent','Analysis Agent','Decision Agent'].map((name, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i<3 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--green)' }} />
              <span style={{ fontSize:13, color:'var(--text-primary)', fontWeight:600 }}>{name}</span>
              <span className="badge badge-online" style={{ marginLeft:'auto', fontSize:10 }}>Online</span>
            </div>
          ))}
        </div>
        {/* HR Agent Status */}
        <div className="card">
          <div className="section-header">
            <div><div className="section-title"><UserCheck size={16} />HR Agent Fleet</div><div className="section-sub">Rule-based deterministic agents</div></div>
          </div>
          {['Workload Agent','Project Fit Agent','Performance Agent','Availability Agent','Wellbeing Check-in Agent'].map((name, i, arr) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i<arr.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--purple)' }} />
              <span style={{ fontSize:13, color:'var(--text-primary)', fontWeight:600 }}>{name}</span>
              <span className="badge" style={{ marginLeft:'auto', fontSize:10, background:'rgba(163,113,247,0.15)', color:'var(--purple)' }}>Online</span>
            </div>
          ))}
        </div>
      </div>

      {/* Telemetry */}
      {hcmState?.telemetry?.length > 0 && (
        <div className="card" style={{ marginTop:18 }}>
          <div className="section-title" style={{ marginBottom:14 }}><Activity size={15} />Live Telemetry</div>
          {hcmState.telemetry.slice(0,5).map((log, i) => (
            <div key={i} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom: i < Math.min(hcmState.telemetry.length,5)-1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', minWidth:60 }}>{log.time}</span>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--blue)', minWidth:140 }}>{log.agent}</span>
              <span style={{ fontSize:12, color:'var(--text-secondary)', flex:1 }}>{log.detail}</span>
              <span className={`badge badge-${log.badge}`} style={{ fontSize:10 }}>{log.badge}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── View: HR Allocation Matrix ────────────────────────────────────────────────

  const renderHrMatrix = () => {
    const ops = hcmState?.operatives || [];
    const projs = hcmState?.projects || [];
    return (
      <div>
        <div className="card" style={{ marginBottom:20 }}>
          <div className="section-header">
            <div><div className="section-title"><GitMerge size={16} />Real-Time Allocation Matrix</div><div className="section-sub">Click a cell to toggle assignment (HR/Admin only)</div></div>
            <button className="btn btn-secondary btn-sm" onClick={fetchHcm}><RefreshCw size={13} />Refresh</button>
          </div>
          <div style={{ overflowX:'auto' }}>
            {/* Header */}
            <div style={{ display:'grid', gridTemplateColumns:`220px repeat(${projs.length}, 110px)`, gap:8, marginBottom:8 }}>
              <div />
              {projs.map(p => (
                <div key={p.id} style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textAlign:'center', textTransform:'uppercase', letterSpacing:0.5 }}>
                  {p.codename?.slice(0,12) || p.id}<br />
                  <span style={{ color:'var(--text-secondary)', fontWeight:400 }}>{p.priority}</span>
                </div>
              ))}
            </div>
            {/* Rows */}
            {ops.map(op => {
              const pct = op.maxCapacity > 0 ? (op.allocatedCapacity / op.maxCapacity) * 100 : 0;
              return (
                <div key={op.id} style={{ display:'grid', gridTemplateColumns:`220px repeat(${projs.length}, 110px)`, gap:8, marginBottom:10, alignItems:'center' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {op.avatar && <img src={op.avatar} alt={op.name} style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', border:'1px solid var(--border)' }} />}
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--blue)', letterSpacing:0.5 }}>{op.callsign}</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>{op.name}</div>
                      </div>
                    </div>
                    <div style={{ marginTop:6 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color: pct>100 ? 'var(--pink)' : pct>85 ? 'var(--yellow)' : 'var(--text-muted)' }}>
                        <span>{op.allocatedCapacity}/{op.maxCapacity}</span>
                        <span style={{ fontWeight:700 }}>{Math.round(pct)}%</span>
                      </div>
                      <div className="capacity-bar-wrap" style={{ marginTop:3 }}>
                        <div style={{ height:'100%', borderRadius:3, transition:'width 0.4s', width:`${Math.min(pct,100)}%`, background: pct>100 ? 'var(--pink)' : pct>85 ? 'var(--yellow)' : 'var(--green)' }} />
                      </div>
                    </div>
                  </div>
                  {projs.map(prj => {
                    const assigned = op.assignedProjects?.includes(prj.id);
                    const key = `${op.id}-${prj.id}`;
                    const toggling = matrixToggling === key;
                    return (
                      <button key={prj.id} disabled={!isHR || toggling}
                        onClick={() => handleMatrixToggle(op.id, prj.id)}
                        className={`matrix-cell ${assigned ? 'assigned' : 'available'}`}
                        style={{ cursor: isHR ? 'pointer' : 'default' }}>
                        {toggling ? <div className="spinner" style={{ width:14, height:14, borderWidth:2 }} /> : assigned ? <CheckCircle size={14} /> : <span style={{ color:'var(--text-muted)' }}>—</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* RAG Team Builder */}
        {isHR && (
          <div className="card">
            <div className="section-title" style={{ marginBottom:14 }}><Search size={15} />Multi-Agent Team Builder (RAG)</div>
            <div style={{ display:'flex', gap:10 }}>
              <input className="input" value={ragPrompt} onChange={e => setRagPrompt(e.target.value)} placeholder='e.g. "Python ML engineer for RAG project"' onKeyDown={e => e.key === 'Enter' && handleRag()} style={{ flex:1 }} />
              <button className="btn btn-primary" onClick={handleRag} disabled={ragLoading}>
                {ragLoading ? <div className="spinner" style={{ width:14, height:14, borderWidth:2 }} /> : <><Search size={14} />Find Team</>}
              </button>
            </div>
            {ragResult?.assembledTeam && (
              <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:12 }}>
                {ragResult.assembledTeam.map(op => (
                  <div key={op.id} style={{ background:'var(--bg-base)', border:'1px solid var(--border)', borderRadius:8, padding:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      {op.avatar && <img src={op.avatar} alt={op.name} style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }} />}
                      <div>
                        <div style={{ fontSize:11, color:'var(--blue)', fontWeight:700 }}>{op.callsign}</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>{op.name}</div>
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:'var(--green)', fontWeight:700 }}>Fit Score: {op.fitScore}%</div>
                    <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:4 }}>{op.role}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── View: HR Agent Review ─────────────────────────────────────────────────────

  const renderHrReview = () => {
    const ops = hcmState?.operatives || [];
    const projs = hcmState?.projects || [];
    return (
      <div>
        <div className="card" style={{ marginBottom:18 }}>
          <div className="section-title" style={{ marginBottom:14 }}><UserCheck size={15} />HR Agent Review</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:12, alignItems:'end' }}>
            <div>
              <div className="input-label">Select Employee</div>
              <select className="input" value={selectedOp || ''} onChange={e => { setSelectedOp(e.target.value); setHrReview(null); }}>
                <option value="">— Select operative —</option>
                {ops.map(op => <option key={op.id} value={op.id}>{op.name} ({op.role})</option>)}
              </select>
            </div>
            <div>
              <div className="input-label">Project for Fit Analysis (optional)</div>
              <select className="input" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                <option value="">— No project —</option>
                {projs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <button className="btn btn-purple" onClick={handleHrReview} disabled={!selectedOp || hrReviewLoading}>
              {hrReviewLoading ? <div className="spinner" style={{ width:14, height:14, borderWidth:2, borderTopColor:'#fff' }} /> : <><UserCheck size={14} />Run 5 HR Agents</>}
            </button>
          </div>
        </div>

        {hrReview && (
          <div>
            <div className="card" style={{ marginBottom:18 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>{hrReview.employee?.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-secondary)' }}>{hrReview.employee?.role} — HR Review Results</div>
                </div>
              </div>
              <div style={{ background:'rgba(163,113,247,0.08)', border:'1px solid rgba(163,113,247,0.2)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--text-secondary)', marginBottom:16 }}>
                ⚠️ {hrReview.disclaimer}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14 }}>
                {hrReview.agents?.map((agent, i) => (
                  <div key={i} style={{ background:'var(--bg-base)', border:'1px solid var(--border)', borderRadius:8, padding:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{agent.agent}</div>
                      <span className={`badge badge-${agent.status}`} style={{ fontSize:10 }}>{agent.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>{agent.summary}</div>
                    {agent.evidence?.map((ev, j) => <div key={j} style={{ fontSize:11, color:'var(--text-muted)', padding:'3px 0', borderTop:'1px solid var(--border)' }}>• {ev}</div>)}
                    {agent.recommendations?.map((r, j) => <div key={j} style={{ fontSize:11, color:'var(--blue)', padding:'3px 0', marginTop:6 }}>→ {r}</div>)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── View: IT Incident Resolution ─────────────────────────────────────────────

  const renderIncidents = () => (
    <div>
      <div className="card" style={{ marginBottom:18 }}>
        <div className="section-title" style={{ marginBottom:14 }}><AlertCircle size={16} />Submit IT Incident</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
          {SAMPLE_INCIDENTS.map((s, i) => (
            <button key={i} className="btn btn-secondary btn-sm" onClick={() => setRequestText(s)}>{s.slice(0,40)}…</button>
          ))}
        </div>
        <textarea className="textarea" value={requestText} onChange={e => setRequestText(e.target.value)}
          placeholder="Describe the IT incident in detail…" style={{ minHeight:100, marginBottom:12 }} />
        <button className="btn btn-primary" onClick={handleRunWorkflow} disabled={itLoading || !requestText.trim()}>
          {itLoading ? <><div className="spinner" style={{ width:14, height:14, borderWidth:2, borderTopColor:'#fff' }} />Running 4-Agent Pipeline…</> : <><Play size={15} />Run Incident Investigation</>}
        </button>
      </div>

      {itLoading && (
        <div className="card" style={{ marginBottom:18 }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:16, color:'var(--text-primary)' }}>Investigation Pipeline Running…</div>
          {[['Planner Agent', 'Generating investigation plan', true],
            ['Investigation Agent', 'Gathering diagnostics via ReAct tools', true],
            ['Analysis Agent', 'Performing root cause analysis', false],
            ['Decision Agent', 'Formulating resolution strategy', false]].map(([name, sub, active], i) => (
            <div key={i} className="stage-row">
              <div className={`stage-icon ${active ? 'stage-active' : 'stage-pending'}`}>
                {active ? <div className="spinner" style={{ width:14, height:14, borderWidth:2, borderTopColor:'var(--blue)' }} /> : <Cpu size={14} color="var(--text-muted)" />}
              </div>
              <div>
                <div className="stage-label">{name}</div>
                <div className="stage-sub">{sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {itResult && !itResult.error && (
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>Investigation Complete</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)' }}>Status: {itResult.status} · Duration: {itResult.execution_metrics?.duration_seconds}s · LLM Calls: {itResult.execution_metrics?.llm_calls}</div>
            </div>
            <span className="status-chip status-online">✓ Completed</span>
          </div>
          <div className="tabs">
            {['plan','investigation_results','analysis','decision'].map(t => (
              <div key={t} className={`tab ${activeTab===t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {t === 'plan' ? 'Plan' : t === 'investigation_results' ? 'Investigation' : t === 'analysis' ? 'Analysis' : 'Decision'}
              </div>
            ))}
            {jobId && <div className={`tab ${activeTab==='copilot' ? 'active' : ''}`} onClick={() => setActiveTab('copilot')}>💬 Copilot</div>}
          </div>
          {activeTab !== 'copilot' ? (
            <div className="md-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{itResult[activeTab] || '*No content.*'}</ReactMarkdown>
            </div>
          ) : (
            <div>
              <div style={{ minHeight:200, maxHeight:320, overflowY:'auto', marginBottom:12 }}>
                {chatMessages.map((m, i) => (
                  <div key={i} className={`chat-msg ${m.role==='user' ? 'chat-user' : 'chat-bot'}`}>
                    <div className={`chat-bubble ${m.role==='user' ? 'chat-bubble-user' : 'chat-bubble-bot'}`}>
                      <div className="md-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-row">
                <input className="input" value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isChatting && handleChat()}
                  placeholder="Ask a follow-up question about this incident…" />
                <button className="btn btn-primary" onClick={handleChat} disabled={isChatting || !chatInput.trim()}>
                  {isChatting ? <div className="spinner" style={{ width:14, height:14, borderWidth:2, borderTopColor:'#fff' }} /> : <Send size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {itResult?.error && (
        <div style={{ background:'rgba(248,81,73,0.1)', border:'1px solid rgba(248,81,73,0.3)', borderRadius:10, padding:16, color:'var(--pink)' }}>
          <strong>Error:</strong> {itResult.error}
        </div>
      )}
    </div>
  );

  // ── View: Agent Fleet ────────────────────────────────────────────────────────

  const renderAgentFleet = () => (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
        {agentsLoading && <div style={{ color:'var(--text-secondary)', padding:20 }}>Loading agents…</div>}
        {agents.map(agent => (
          <div key={agent.id} className="card" style={{ borderColor: agent.type==='HR' ? 'rgba(163,113,247,0.2)' : 'rgba(88,166,255,0.2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:1, color: agent.type==='HR' ? 'var(--purple)' : 'var(--blue)', marginBottom:4 }}>{agent.type} AGENT · {agent.role}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>{agent.name}</div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>Model: {agent.model}</div>
              </div>
              <span className="badge badge-online">{agent.status}</span>
            </div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12, lineHeight:1.5 }}>{agent.description}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {agent.capabilities?.map((c, i) => (
                <span key={i} className="skill-chip" style={{ color: agent.type==='HR' ? 'var(--purple)' : 'var(--blue)', background: agent.type==='HR' ? 'rgba(163,113,247,0.1)' : 'rgba(88,166,255,0.1)', borderColor: agent.type==='HR' ? 'rgba(163,113,247,0.2)' : 'rgba(88,166,255,0.2)' }}>{c}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── View: Tickets ────────────────────────────────────────────────────────────

  const renderTickets = () => (
    <div className="two-col" style={{ alignItems:'start' }}>
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div className="section-title"><Ticket size={15} />Incident Tickets ({tickets.length})</div>
          <button className="btn btn-secondary btn-sm" onClick={fetchTickets}><RefreshCw size={12} />Refresh</button>
        </div>
        {ticketsLoading && <div style={{ color:'var(--text-secondary)', padding:20 }}>Loading tickets…</div>}
        {tickets.map(t => (
          <div key={t.ticket_id} className="ticket-card" onClick={() => setSelectedTicket(t)}
            style={{ borderColor: selectedTicket?.ticket_id===t.ticket_id ? 'var(--blue)' : 'var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--blue)', fontFamily:'var(--font-mono)' }}>{t.ticket_id}</span>
              <span className={`badge ${t.status==='Escalated' ? 'badge-OVER_CAPACITY' : t.status==='Resolved' ? 'badge-WITHIN_REPORTED_CAPACITY' : 'badge-ELEVATED'}`} style={{ fontSize:10 }}>{t.status}</span>
            </div>
            <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight:500, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
            <div style={{ display:'flex', gap:8, fontSize:11, color:'var(--text-muted)' }}>
              <span>{t.type}</span>·<span>{t.severity}</span>·<span>{t.source}</span>
            </div>
          </div>
        ))}
      </div>
      {selectedTicket && (
        <div className="card" style={{ position:'sticky', top:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, fontFamily:'var(--font-mono)', color:'var(--blue)' }}>{selectedTicket.ticket_id}</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>{selectedTicket.timestamp}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTicket(null)}>✕</button>
          </div>
          <div className="md-content" style={{ maxHeight:500, overflowY:'auto' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedTicket.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );

  // ── View: History ────────────────────────────────────────────────────────────

  const renderHistory = () => (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div className="section-title"><History size={15} />Investigations Log ({history.length})</div>
        <button className="btn btn-secondary btn-sm" onClick={fetchHistory}><RefreshCw size={12} />Refresh</button>
      </div>
      {historyLoading && <div style={{ color:'var(--text-secondary)', padding:20 }}>Loading history…</div>}
      {history.map(h => (
        <div key={h.id} className="card" style={{ marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontSize:12, fontWeight:700, fontFamily:'var(--font-mono)', color:'var(--blue)' }}>#{h.id}</span>
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{h.timestamp}</span>
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:8 }}>{h.user_request}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.decision?.slice(0,120)}…</div>
        </div>
      ))}
    </div>
  );

  // ── View: Tools Registry ──────────────────────────────────────────────────────

  const renderTools = () => (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:16 }}>
      {tools.map(t => (
        <div key={t.id} className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>{t.name}</div>
            <span style={{ background: t.category==='Observability' ? 'rgba(88,166,255,0.15)' : t.category==='Knowledge' ? 'rgba(163,113,247,0.15)' : 'rgba(63,185,80,0.15)', color: t.category==='Observability' ? 'var(--blue)' : t.category==='Knowledge' ? 'var(--purple)' : 'var(--green)', border:`1px solid ${t.category==='Observability' ? 'rgba(88,166,255,0.3)' : t.category==='Knowledge' ? 'rgba(163,113,247,0.3)' : 'rgba(63,185,80,0.3)'}`, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{t.category}</span>
          </div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10, lineHeight:1.5 }}>{t.description}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>Source: {t.data_source}</div>
          <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:4 }}>
            {t.parameters?.map((p, i) => <span key={i} style={{ background:'rgba(255,255,255,0.06)', color:'var(--cyan)', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:'var(--font-mono)' }}>{p}</span>)}
          </div>
        </div>
      ))}
    </div>
  );

  // ── View: Settings ───────────────────────────────────────────────────────────

  const renderSettings = () => (
    <div style={{ maxWidth:600 }}>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title" style={{ marginBottom:16 }}><Shield size={15} />Account</div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'linear-gradient(135deg, var(--blue), var(--purple))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff' }}>{authUser.profile?.name?.charAt(0)}</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>{authUser.profile?.name}</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)' }}>{authUser.email}</div>
            <span className="badge badge-online" style={{ fontSize:10, marginTop:4 }}>{authUser.role?.toUpperCase()}</span>
          </div>
        </div>
        <button className="btn btn-danger" onClick={handleLogout}><LogOut size={14} />Sign Out</button>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title" style={{ marginBottom:14 }}><Database size={15} />API Configuration</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-secondary)', lineHeight:2 }}>
          <div><span style={{ color:'var(--text-muted)' }}>IT Engine (FastAPI):</span> {API_IT}</div>
          <div><span style={{ color:'var(--text-muted)' }}>HCM API (Node.js):</span> {API_HCM}</div>
          <div><span style={{ color:'var(--text-muted)' }}>API Status:</span> <span style={{ color: isItOnline ? 'var(--green)' : 'var(--pink)' }}>{isItOnline ? 'Online' : (apiHealth?.status ?? 'Offline')}</span></div>
          <div><span style={{ color:'var(--text-muted)' }}>Active Model:</span> {metrics?.agents?.model ?? '—'}</div>
          <div><span style={{ color:'var(--text-muted)' }}>Total Agents:</span> {metrics?.agents?.total ?? '9'} (IT: 4 + HR: 5)</div>
        </div>
      </div>
      <div className="card">
        <div className="section-title" style={{ marginBottom:14 }}><BookOpen size={15} />Documentation</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <a href={`${API_IT}/docs`} target="_blank" rel="noopener" style={{ color:'var(--blue)', fontSize:13 }}>FastAPI Auto Docs (IT Engine) →</a>
          <a href={`${API_IT}/redoc`} target="_blank" rel="noopener" style={{ color:'var(--blue)', fontSize:13 }}>ReDoc API Reference →</a>
        </div>
      </div>
    </div>
  );

  // ── Sidebar Nav ──────────────────────────────────────────────────────────────

  const navIt = [
    { id:'incidents', label:'Incident Resolution', icon:AlertCircle },
    { id:'tickets', label:'Incident Tickets', icon:Ticket },
    { id:'history', label:'Investigations Log', icon:History },
    { id:'tools', label:'Tools Registry', icon:Wrench },
    { id:'agent_fleet', label:'Agent Fleet', icon:Cpu },
  ];

  const navHr = [
    { id:'hr_matrix', label:'Allocation Matrix', icon:GitMerge },
    { id:'hr_review', label:'HR Agent Review', icon:UserCheck },
  ];

  const VIEW_LABELS = { dashboard:'Dashboard', incidents:'Incident Resolution', tickets:'Incident Tickets', history:'Investigations Log', tools:'Enterprise Tools', agent_fleet:'Agent Fleet (9 Agents)', hr_matrix:'Resource Allocation Matrix', hr_review:'HR Agent Review', settings:'Settings' };

  // ── Shell ────────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-title"><span className="logo-dot-blue">Nexus</span><span className="logo-dot-purple">Ops</span></div>
          <div className="logo-sub">Enterprise AI Command</div>
        </div>

        {/* Main */}
        <div className="sidebar-section">Platform</div>
        <div className={`nav-item ${view==='dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
          <LayoutDashboard size={16} />Dashboard
        </div>

        {/* IT Section */}
        <div className="sidebar-section">IT Incident Engine</div>
        {navIt.map(n => (
          <div key={n.id} className={`nav-item ${view===n.id ? 'active' : ''}`} onClick={() => setView(n.id)}>
            <n.icon size={16} />{n.label}
          </div>
        ))}

        {/* HR Section */}
        <div className="sidebar-section">HR Command Center</div>
        {navHr.map(n => (
          <div key={n.id} className={`nav-item ${view===n.id ? 'active-hr' : ''}`} onClick={() => setView(n.id)}>
            <n.icon size={16} />{n.label}
            {!isHR && n.id==='hr_matrix' && <span className="nav-badge badge-orange" title="Admin/HR only">HR</span>}
          </div>
        ))}

        {/* Footer */}
        <div style={{ marginTop:'auto', padding:'12px 8px 8px' }}>
          <div className={`nav-item ${view==='settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
            <Settings size={16} />Settings
          </div>
        </div>
      </nav>

      {/* Main area */}
      <div className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div>
            <div className="topbar-title">{VIEW_LABELS[view] || 'NexusOps'}</div>
            <div className="topbar-sub">{new Date().toLocaleString()}</div>
          </div>
          <div className="topbar-right">
            <div className={`status-chip ${isItOnline ? 'status-online' : 'status-offline'}`}>
              <span className="pulse" />
              {isItOnline ? 'IT Engine Online' : 'IT Engine Offline'}
            </div>
            <div className="status-chip status-online" style={{ background:'rgba(163,113,247,0.12)', color:'var(--purple)', borderColor:'rgba(163,113,247,0.2)' }}>
              <span className="pulse" style={{ background:'var(--purple)' }} />
              HR Engine Online
            </div>
            <div style={{ fontSize:13, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg, var(--blue), var(--purple))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>{authUser.profile?.name?.charAt(0)}</div>
              {authUser.profile?.name?.split(' ')[0]}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="content">
          {view==='dashboard'    && renderDashboard()}
          {view==='hr_matrix'    && renderHrMatrix()}
          {view==='hr_review'    && renderHrReview()}
          {view==='incidents'    && renderIncidents()}
          {view==='agent_fleet'  && renderAgentFleet()}
          {view==='tickets'      && renderTickets()}
          {view==='history'      && renderHistory()}
          {view==='tools'        && renderTools()}
          {view==='settings'     && renderSettings()}
        </main>
      </div>
    </div>
  );
}
