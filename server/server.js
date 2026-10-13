import express from 'express';
import cors from 'cors';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 5000;
const dataDirectory = process.env.NEXUS_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), 'data');
const accountsFile = join(dataDirectory, 'accounts.json');

mkdirSync(dataDirectory, { recursive: true });
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());

let accounts = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : [];
const sessions = new Map();
const loginFailures = new Map();
const sessionCookieName = 'nexus_session';

function saveAccounts() {
  const temporaryFile = `${accountsFile}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  renameSync(temporaryFile, accountsFile);
}

function publicAccount(account) {
  return { id: account.id, email: account.email, role: account.role, profile: account.profile };
}

function findSessionUser(req) {
  const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${sessionCookieName}=`));
  const token = cookie?.slice(sessionCookieName.length + 1);
  const session = token && sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return accounts.find(u => u.id === session.userId) || null;
}

function requireAuthentication(req, res, next) {
  const account = findSessionUser(req);
  if (!account) return res.status(401).json({ error: 'Sign in to continue.' });
  req.account = account;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.account.role)) return res.status(403).json({ error: 'Your account does not have access to this action.' });
    next();
  };
}

function createSession(account, res) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { userId: account.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookieName}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${secure}`);
}

function validCredentials(email, password) {
  return typeof email === 'string' && email.trim().length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    && typeof password === 'string' && password.length >= 10 && password.length <= 200;
}

function createEmployeeOperative(account) {
  const operative = {
    id: account.profile.employeeId, accountId: account.id,
    name: account.profile.name,
    callsign: account.profile.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 18),
    avatar: '', role: account.profile.jobTitle, tier: 'Employee', level: 1,
    allocatedCapacity: 0, maxCapacity: 100, stressIndex: 0,
    stats: { velocity: 0, codeQuality: 0, delivery: 0, collaboration: 0 },
    skills: account.profile.skills, assignedProjects: [], questLog: []
  };
  database.operatives.push(operative);
  return operative;
}

function updateAccountProfile(account, profile) {
  if (!profile || typeof profile !== 'object') return null;
  const name = typeof profile.name === 'string' ? profile.name.trim() : '';
  const jobTitle = typeof profile.jobTitle === 'string' ? profile.jobTitle.trim() : '';
  const department = typeof profile.department === 'string' ? profile.department.trim() : '';
  const phone = typeof profile.phone === 'string' ? profile.phone.trim() : '';
  const bio = typeof profile.bio === 'string' ? profile.bio.trim() : '';
  const skills = Array.isArray(profile.skills)
    ? profile.skills.filter(s => typeof s === 'string').map(s => s.trim()).filter(Boolean).slice(0, 30) : [];
  if (!name || name.length > 100 || jobTitle.length > 100 || department.length > 100 || phone.length > 40 || bio.length > 500 || skills.some(s => s.length > 60)) return null;
  account.profile = { ...account.profile, name, jobTitle, department, phone, bio, skills };
  const operative = database.operatives.find(o => o.accountId === account.id);
  if (operative) {
    operative.name = name;
    operative.callsign = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 18);
    operative.role = jobTitle || 'Employee';
    operative.skills = skills;
  }
  saveAccounts();
  return operative;
}

let database = {
  operatives: [
    { id: "OP-01", name: "Vance Sterling", callsign: "CYPHER", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", role: "Staff Cloud Architect", tier: "Level 48 Architect", level: 48, allocatedCapacity: 85, maxCapacity: 100, stressIndex: 28, stats: { velocity: 94, codeQuality: 98, delivery: 91, collaboration: 88 }, skills: ["AWS", "Kubernetes", "Terraform", "Rust", "Zero-Trust"], assignedProjects: ["PRJ-101"], questLog: ["Zero-Downtime EKS Switch", "Terraform Drift Guard v2"] },
    { id: "OP-02", name: "Dr. Elena Rostova", callsign: "NEURAL", avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80", role: "Principal AI Researcher", tier: "Level 52 Sage", level: 52, allocatedCapacity: 115, maxCapacity: 100, stressIndex: 78, stats: { velocity: 88, codeQuality: 99, delivery: 85, collaboration: 92 }, skills: ["Python", "PyTorch", "RAG", "LLMs", "Vector DBs", "TypeScript"], assignedProjects: ["PRJ-102", "PRJ-103"], questLog: ["Autonomous Agent Swarm", "Vector Context Compression"] },
    { id: "OP-03", name: "Kaelen Chen", callsign: "RAZOR", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", role: "Senior Full-Stack Operative", tier: "Level 39 Vanguard", level: 39, allocatedCapacity: 70, maxCapacity: 100, stressIndex: 18, stats: { velocity: 96, codeQuality: 90, delivery: 94, collaboration: 85 }, skills: ["React 19", "Next.js", "TypeScript", "Tailwind", "GraphQL"], assignedProjects: ["PRJ-102"], questLog: ["Cyber Glassmorphic HUD Build", "Wasm Audio Pipeline"] },
    { id: "OP-04", name: "Tariq Mansoor", callsign: "AEGIS", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80", role: "Cyber Defense Specialist", tier: "Level 44 Sentinel", level: 44, allocatedCapacity: 60, maxCapacity: 100, stressIndex: 12, stats: { velocity: 89, codeQuality: 96, delivery: 92, collaboration: 80 }, skills: ["Rust", "OAuth", "SOC2", "Kubernetes", "Linux Kernel"], assignedProjects: ["PRJ-104"], questLog: ["Quantum-Resistant Key Rotation", "BGP Hijack Mitigation"] },
    { id: "OP-05", name: "Mira Takahashi", callsign: "GHOST", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80", role: "High-Frequency Backend Lead", tier: "Level 46 Specialist", level: 46, allocatedCapacity: 90, maxCapacity: 100, stressIndex: 35, stats: { velocity: 98, codeQuality: 92, delivery: 95, collaboration: 79 }, skills: ["Go", "Kafka", "Docker", "gRPC", "Redis"], assignedProjects: ["PRJ-105"], questLog: ["Sub-Millisecond Order Matching", "Distributed WAL Engine"] },
    { id: "OP-06", name: "Devon Ward", callsign: "HYPERION", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80", role: "Infrastructure DevOps Lead", tier: "Level 41 Artificer", level: 41, allocatedCapacity: 50, maxCapacity: 100, stressIndex: 10, stats: { velocity: 91, codeQuality: 88, delivery: 90, collaboration: 94 }, skills: ["AWS", "GCP", "Terraform", "CI/CD", "Prometheus"], assignedProjects: ["PRJ-101"], questLog: ["Multi-Region Failover Canary", "Spot Fleet Cost Halver"] },
    { id: "OP-07", name: "Zoya Al-Hassan", callsign: "SYNAPSE", avatar: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80", role: "AI Data Platform Engineer", tier: "Level 35 Alchemist", level: 35, allocatedCapacity: 75, maxCapacity: 100, stressIndex: 22, stats: { velocity: 85, codeQuality: 94, delivery: 87, collaboration: 89 }, skills: ["Python", "Spark", "Kafka", "PostgreSQL", "Snowflake"], assignedProjects: ["PRJ-105"], questLog: ["Lakehouse Delta Optimization", "Feature Store Streamer"] },
    { id: "OP-08", name: "Lucas Drake", callsign: "VORTEX", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80", role: "Lead Systems Architect", tier: "Level 50 Strategist", level: 50, allocatedCapacity: 120, maxCapacity: 100, stressIndex: 82, stats: { velocity: 93, codeQuality: 97, delivery: 89, collaboration: 84 }, skills: ["C++", "Rust", "Distributed Systems", "Linux Kernel"], assignedProjects: ["PRJ-104", "PRJ-106"], questLog: ["Core Engine Memory Compaction", "NVMe Direct I/O Driver"] }
  ],
  projects: [
    { id: "PRJ-101", title: "Project Aegis: Orbital Cloud Migration", codename: "ORBITAL-MIGRATE", department: "Cloud Core Ops", difficulty: "Tier V - Legendary", priority: "CRITICAL", budget: "$420,000", deadline: "2026-12-15", requiredSkills: ["AWS", "Kubernetes", "Terraform", "Zero-Trust"], assignedOperativeIds: ["OP-01", "OP-06"], requiredSlots: 4, progress: 68 },
    { id: "PRJ-102", title: "Project Prometheus: Autonomous Multi-Agent RAG", codename: "PROMETHEUS-SWARM", department: "Applied AI Directorate", difficulty: "Tier IV - Mythic", priority: "HIGH", budget: "$550,000", deadline: "2027-01-30", requiredSkills: ["Python", "PyTorch", "RAG", "LLMs", "Vector DBs"], assignedOperativeIds: ["OP-02", "OP-03"], requiredSlots: 5, progress: 42 },
    { id: "PRJ-103", title: "Project Chronos: Cyberpunk Executive HUD v4", codename: "CHRONOS-HUD", department: "Design Systems & UI", difficulty: "Tier III - Elite", priority: "MEDIUM", budget: "$180,000", deadline: "2026-11-20", requiredSkills: ["React 19", "Next.js", "TypeScript", "Tailwind", "WebGL"], assignedOperativeIds: ["OP-02"], requiredSlots: 3, progress: 84 },
    { id: "PRJ-104", title: "Project Citadel: Quantum Zero-Trust Enclave", codename: "CITADEL-SHIELD", department: "Cyber Security Ops", difficulty: "Tier V - Legendary", priority: "CRITICAL", budget: "$620,000", deadline: "2027-03-01", requiredSkills: ["Rust", "Zero-Trust", "OAuth", "SOC2", "Linux Kernel"], assignedOperativeIds: ["OP-04", "OP-08"], requiredSlots: 3, progress: 30 }
  ],
  agentTelemetryLogs: [
    { agent: "Talent Scout Agent", action: "Vector Embeddings Refreshed", detail: "Indexed 8 operative skill profiles against active mission matrices.", time: "17:15:00", badge: "MATCH_READY" },
    { agent: "Capacity Balancer Agent", action: "Critical Workload Alarm", detail: "Dr. Elena Rostova is operating at 115% capacity across 2 Tier IV missions.", time: "17:15:04", badge: "OVERLOAD" }
  ]
};

for (const account of accounts) {
  const operative = database.operatives.find(o => o.accountId === account.id);
  if (!operative && account.role !== 'admin' && account.profile.employeeId) createEmployeeOperative(account);
}

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.get('/api/auth/setup-status', (req, res) => res.json({ setupRequired: accounts.length === 0 }));

app.post('/api/auth/setup-admin', (req, res) => {
  if (accounts.length > 0) return res.status(409).json({ error: 'Initial admin setup has already been completed.' });
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validCredentials(email, password))
    return res.status(400).json({ error: 'Provide a name, a valid email, and a password of at least 10 characters.' });
  const normalizedEmail = email.trim().toLowerCase();
  if (accounts.some(a => a.email === normalizedEmail)) return res.status(409).json({ error: 'An account already exists for this email.' });
  const salt = randomBytes(16).toString('hex');
  const account = { id: randomBytes(16).toString('hex'), email: normalizedEmail, role: 'admin', passwordSalt: salt, passwordHash: scryptSync(password, salt, 64).toString('hex'), profile: { employeeId: `EMP-${randomBytes(3).toString('hex').toUpperCase()}`, name: name.trim(), jobTitle: 'Administrator', department: '', phone: '', bio: '', skills: [] } };
  accounts.push(account);
  saveAccounts();
  createSession(account, res);
  res.status(201).json({ user: publicAccount(account) });
});

app.post('/api/auth/signup', (req, res) => {
  if (accounts.length === 0) return res.status(403).json({ error: 'The initial administrator must complete workspace setup before employees can register.' });
  const { name, email, password, jobTitle, department, phone, bio, skills } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validCredentials(email, password))
    return res.status(400).json({ error: 'Provide a name, a valid email, and a password of at least 10 characters.' });
  const normalizedEmail = email.trim().toLowerCase();
  if (accounts.some(a => a.email === normalizedEmail)) return res.status(409).json({ error: 'An account already exists for this email.' });
  const salt = randomBytes(16).toString('hex');
  const account = { id: randomBytes(16).toString('hex'), email: normalizedEmail, role: 'employee', passwordSalt: salt, passwordHash: scryptSync(password, salt, 64).toString('hex'), profile: { employeeId: `EMP-${randomBytes(3).toString('hex').toUpperCase()}`, name: name.trim(), jobTitle: typeof jobTitle === 'string' ? jobTitle.trim().slice(0, 100) : '', department: typeof department === 'string' ? department.trim().slice(0, 100) : '', phone: typeof phone === 'string' ? phone.trim().slice(0, 40) : '', bio: typeof bio === 'string' ? bio.trim().slice(0, 500) : '', skills: Array.isArray(skills) ? skills.filter(s => typeof s === 'string').map(s => s.trim()).filter(s => s && s.length <= 60).slice(0, 30) : [] } };
  accounts.push(account);
  const operative = createEmployeeOperative(account);
  saveAccounts();
  createSession(account, res);
  res.status(201).json({ user: publicAccount(account), operative });
});

app.post('/api/auth/login', (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > 200) return res.status(401).json({ error: 'Invalid email or password.' });
  const attemptKey = `${req.ip}:${email}`;
  const attempt = loginFailures.get(attemptKey);
  if (attempt && attempt.expiresAt > Date.now() && attempt.count >= 8) return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
  const account = accounts.find(u => u.email === email);
  const submittedHash = account ? scryptSync(password, account.passwordSalt, 64) : scryptSync(password, 'nexus-unknown-account-salt', 64);
  const validPassword = account && timingSafeEqual(submittedHash, Buffer.from(account.passwordHash, 'hex'));
  if (!validPassword) {
    const count = attempt && attempt.expiresAt > Date.now() ? attempt.count + 1 : 1;
    loginFailures.set(attemptKey, { count, expiresAt: Date.now() + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  loginFailures.delete(attemptKey);
  createSession(account, res);
  res.json({ user: publicAccount(account) });
});

app.post('/api/auth/logout', (req, res) => {
  const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${sessionCookieName}=`));
  if (cookie) sessions.delete(cookie.slice(sessionCookieName.length + 1));
  res.setHeader('Set-Cookie', `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
  res.json({ success: true });
});

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  return requireAuthentication(req, res, next);
});

app.get('/api/auth/me', requireAuthentication, (req, res) => res.json({ user: publicAccount(req.account) }));

app.put('/api/profile', (req, res) => {
  const operative = updateAccountProfile(req.account, req.body);
  if (!operative) return res.status(400).json({ error: 'Profile fields are invalid or exceed the allowed length.' });
  res.json({ user: publicAccount(req.account), operative });
});

app.get('/api/users', requireRole('admin'), (req, res) => {
  res.json({ users: accounts.map(a => ({ id: a.id, email: a.email, name: a.profile.name, role: a.role })) });
});

app.patch('/api/users/:id/role', requireRole('admin'), (req, res) => {
  const account = accounts.find(u => u.id === req.params.id);
  const { role } = req.body;
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  if (!['employee', 'hr'].includes(role)) return res.status(400).json({ error: 'Role must be employee or hr.' });
  if (account.id === req.account.id) return res.status(400).json({ error: 'You cannot change your own role.' });
  account.role = role;
  saveAccounts();
  res.json({ user: { id: account.id, email: account.email, name: account.profile.name, role: account.role } });
});

// ── HCM Data Routes ───────────────────────────────────────────────────────────

app.get('/api/state', (req, res) => {
  const employee = req.account.role === 'employee' ? database.operatives.find(o => o.accountId === req.account.id) : null;
  if (req.account.role === 'employee' && !employee) return res.status(404).json({ error: 'Your employee profile is unavailable.' });
  const operatives = employee ? [employee] : database.operatives;
  const visibleProjectIds = new Set(employee?.assignedProjects || database.projects.map(p => p.id));
  res.json({ status: "HEALTHY_ONLINE", operatives, projects: database.projects.filter(p => visibleProjectIds.has(p.id)), telemetry: employee ? [] : database.agentTelemetryLogs });
});

app.post('/api/matrix/toggle', requireRole('admin', 'hr'), (req, res) => {
  const { operativeId, projectId } = req.body;
  const op = database.operatives.find(o => o.id === operativeId);
  const prj = database.projects.find(p => p.id === projectId);
  if (!op || !prj) return res.status(404).json({ error: "Operative or Project not found." });
  const isAssigned = op.assignedProjects.includes(projectId);
  if (isAssigned) {
    op.assignedProjects = op.assignedProjects.filter(p => p !== projectId);
    prj.assignedOperativeIds = prj.assignedOperativeIds.filter(id => id !== operativeId);
    op.allocatedCapacity = Math.max(0, op.allocatedCapacity - 35);
  } else {
    op.assignedProjects.push(projectId);
    prj.assignedOperativeIds.push(operativeId);
    op.allocatedCapacity += 35;
  }
  op.stressIndex = Math.min(100, Math.round((op.allocatedCapacity / 100) * 45));
  const logEntry = { agent: "Capacity Balancer Agent", action: isAssigned ? "De-allocation Registered" : "Allocation Verified", detail: `${op.name} (${op.callsign}) updated for ${prj.codename}. Current Load: ${op.allocatedCapacity}%.`, time: new Date().toLocaleTimeString(), badge: op.allocatedCapacity > 100 ? "OVERLOAD" : "NOMINAL" };
  database.agentTelemetryLogs.unshift(logEntry);
  res.json({ success: true, operative: op, project: prj, log: logEntry });
});

app.post('/api/rag/query', requireRole('admin', 'hr'), (req, res) => {
  const { prompt } = req.body;
  const queryStr = (prompt || "").toLowerCase();
  const candidates = database.operatives.map(op => {
    let matchScore = 50;
    op.skills.forEach(skill => { if (queryStr.includes(skill.toLowerCase())) matchScore += 15; });
    if (op.allocatedCapacity <= 85) matchScore += 10;
    return { ...op, fitScore: Math.min(99, matchScore) };
  }).sort((a, b) => b.fitScore - a.fitScore);
  const topTeam = candidates.slice(0, 4);
  const overloadRisk = topTeam.some(c => c.allocatedCapacity > 100);
  const log1 = { agent: "Talent Scout Agent", action: "Semantic Fit Retrieval", detail: `Identified top squad fit (${topTeam[0]?.fitScore}%) for query: "${prompt}".`, time: new Date().toLocaleTimeString(), badge: "98% MATCH" };
  const log2 = { agent: "Capacity Balancer Agent", action: "Workload Constraint Verification", detail: overloadRisk ? "One candidate near threshold. Rebalancing applied." : "All 4 units cleared safe operational capacity.", time: new Date().toLocaleTimeString(), badge: "LOAD_BALANCED" };
  database.agentTelemetryLogs.unshift(log2, log1);
  res.json({ success: true, assembledTeam: topTeam, logs: [log1, log2] });
});

app.post('/api/hr-review', requireRole('admin', 'hr'), async (req, res) => {
  try {
    const response = await fetch('http://127.0.0.1:8000/hr/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    const result = await response.json();
    res.status(response.status).json(result);
  } catch (error) {
    console.error('HR review service request failed:', error);
    res.status(502).json({ error: 'HR review service is unavailable.' });
  }
});

app.post('/api/projects/forge', requireRole('admin'), (req, res) => {
  const { title, department, difficulty, budget, deadline, requiredSkills, requiredSlots } = req.body;
  const newPrj = { id: `PRJ-${Math.floor(100 + Math.random() * 900)}`, title: title || "Project Genesis", codename: (title || "GENESIS").toUpperCase().replace(/\s+/g, '-'), department: department || "Applied Research", difficulty: difficulty || "Tier IV - Mythic", priority: "HIGH", budget: budget || "$350,000", deadline: deadline || "2027-04-01", requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : (requiredSkills || "Rust, Kubernetes").split(',').map(s => s.trim()), assignedOperativeIds: [], requiredSlots: Number(requiredSlots) || 3, progress: 0 };
  database.projects.unshift(newPrj);
  res.json({ success: true, project: newPrj });
});

app.listen(PORT, () => console.log(`[NexusOps HCM API] Online on port ${PORT}`));
