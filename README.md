# NexusOps — Enterprise AI Operations Command Center

NexusOps is a **unified platform** combining two enterprise AI systems into one complete project:

| Module | Origin | What it does |
|---|---|---|
| 🚨 **IT Incident Engine** | AgentSync | Autonomous 4-agent LangGraph pipeline for IT incident triage and resolution |
| 👥 **HR Command Center** | Workflow Decision Making System | Real-time allocation matrix + 5 HR agents for employee review |

---

## Architecture

```
NexusOps
├── FastAPI Python (port 8000)   ← IT Incident AI + HR Agent endpoints
├── Node.js Express (port 5000)  ← Auth + HCM data (employees, projects, allocation)
└── React 19 Vite (port 5173)    ← Unified dashboard
```

### IT Incident AI Pipeline (LangGraph + Groq)
```
User Request → Planner → Investigation (ReAct + 6 Tools) → Analysis → Risk Eval → Decision → Ticket
                                                                              ↑
                                                                     Long-Term SQLite Memory
```

### HR Agent System (Deterministic, no LLM)
```
Employee Profile → Workload Agent → Project Fit Agent → Performance Agent → Availability Agent → Wellbeing Agent
```

---

## Quick Start

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- A **Groq API key** from [console.groq.com](https://console.groq.com)

### 2. Environment Setup
```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your GROQ_API_KEY
```

### 3. Install Dependencies
```bash
npm run install:all
pip install -r requirements.txt
```

### 4. Seed Databases
```bash
python setup_db.py
```

### 5. Run Everything
```bash
npm run dev
```

This starts all 3 services concurrently:
- **Frontend**: http://localhost:5173
- **Node.js HCM API**: http://localhost:5000
- **FastAPI IT Engine**: http://localhost:8000 (docs at /docs)

### 6. First Login
On first visit, you'll be prompted to create an Admin account. Then:
- Employees can register themselves
- Admin can promote users to HR role from Settings

---

## Features

### Dashboard
- Combined platform telemetry
- IT Agent Fleet status (4 LLM agents)
- HR Agent Fleet status (5 rule-based agents)
- Live HCM telemetry feed

### IT Incident Resolution Center
- Submit an IT incident in plain English
- 4-agent autonomous pipeline: Plan → Investigate (6 tools) → Analyze → Decide
- Tabbed results: Plan / Investigation / Analysis / Decision
- Resolution Copilot chat for follow-up questions
- Auto-generates escalation tickets for unmonitored services

### HR Command Center
- Real-time Allocation Matrix (click to toggle assignments)
- Overload alerts (>100% capacity)
- Multi-Agent RAG Team Builder
- HR Agent Review: run 5 HR agents on any employee

### Incident Tickets
- All auto-generated incident tickets
- Historical ITSM records
- AI-investigated incidents from workflow memory

### Agent Fleet Console
- All 9 agents visible with roles, capabilities, and type (IT vs HR)

---

## Tech Stack

| Layer | Technology |
|---|---|
| IT AI Engine | Python 3.10+, FastAPI, LangGraph, LangChain, Groq (llama3-8b-8192) |
| HR Agent API | Python (deterministic, no LLM required) |
| HCM Auth Backend | Node.js, Express, scrypt auth |
| Frontend | React 19, Vite, Lucide Icons, ReactMarkdown |
| Databases | SQLite (enterprise_mock.db, agentsync_memory.db) |
| Testing | Pytest |

---

## Test Suite
```bash
pytest tests/ -v
```

---

## Project Origins

This project was created by merging:
1. **AI-Agent-Coordination-Decision-Engine** — HR/HCM system with allocation matrix and rule-based HR agents
2. **AgentSync** — LLM-powered multi-agent IT incident resolution engine with LangGraph

Both are now unified into a single enterprise platform under the **NexusOps** brand.
