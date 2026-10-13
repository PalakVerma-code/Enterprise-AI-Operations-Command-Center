"""
NexusOps — Unified FastAPI Backend
Combines:
  • AgentSync IT Incident AI Engine  (LangGraph + Groq)
  • WDMS HR Agent Review System      (5 deterministic HR agents)
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from workflow.agent_workflow import run_agent_workflow
from config.settings import settings
from agents.hr_agents import analyze_employee
import uuid, time, sqlite3, os, glob, re
from datetime import datetime
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from utils.logging_config import setup_logger, global_metrics

logger = setup_logger("api")

# ─── In-memory stores ────────────────────────────────────────────────────────
workflow_jobs: Dict[str, Any] = {}
api_start_time: float = time.time()
total_requests: int = 0
total_errors: int = 0

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        settings.validate()
        logger.info("NexusOps API started successfully.")
    except ValueError as e:
        logger.warning(f"Startup Warning: {e}")
    yield

app = FastAPI(
    title="NexusOps Enterprise API",
    description="Unified REST API for NexusOps — HR Command Center + IT Incident Resolution Engine",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class WorkflowRequest(BaseModel):
    request_text: str

class WorkflowResponse(BaseModel):
    job_id: str
    status: str
    plan: str = ""
    investigation_results: str = ""
    analysis: str = ""
    decision: str = ""
    execution_metrics: Dict[str, Any] = {}
    errors: List[str] = []

class ChatMessage(BaseModel):
    message: str

class HRAnalyzeRequest(BaseModel):
    employee: Dict[str, Any]
    project: Optional[Dict[str, Any]] = None


# ═══════════════════════════════════════════════════════════════════════════════
# HR AGENT ENDPOINTS  (from WDMS / Workflow Decision Making System)
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/hr/health", tags=["HR Agents"])
async def hr_health():
    """Health check for the NexusOps HR Agent subsystem."""
    return {
        "status": "HEALTHY_ONLINE",
        "service": "NexusOps HR Agent Review System",
        "agents": [
            "Workload Agent",
            "Project Fit Agent",
            "Performance Agent",
            "Availability Agent",
            "Wellbeing Check-in Agent",
        ]
    }

@app.post("/hr/analyze", tags=["HR Agents"])
async def hr_analyze(req: HRAnalyzeRequest):
    """
    Run all 5 HR agents against an employee profile.
    Accepts: { employee: {...}, project?: {...} }
    Returns: workload, project-fit, performance, availability, and wellbeing assessments.
    """
    employee = req.employee
    if not isinstance(employee, dict) or not (
        isinstance(employee.get("id"), str) or isinstance(employee.get("name"), str)
    ):
        raise HTTPException(status_code=400, detail="An employee object with a string id or name is required.")
    project = req.project
    if project is not None and not isinstance(project, dict):
        raise HTTPException(status_code=400, detail="Project must be an object or null.")
    result = analyze_employee(employee, project)
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# IT INCIDENT WORKFLOW ENDPOINTS  (from AgentSync)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/workflow/run", response_model=WorkflowResponse, tags=["IT Workflow"])
async def run_workflow(req: WorkflowRequest):
    """Execute the 4-agent IT incident investigation workflow."""
    global total_requests, total_errors
    if not req.request_text or not req.request_text.strip():
        raise HTTPException(status_code=400, detail="request_text is required and cannot be blank.")
    total_requests += 1
    job_id = str(uuid.uuid4())
    workflow_jobs[job_id] = {"status": "Running", "started_at": datetime.utcnow().isoformat()}
    try:
        final_state = run_agent_workflow(req.request_text)
        response = WorkflowResponse(
            job_id=job_id,
            status=final_state.get("workflow_status", "Completed"),
            plan=final_state.get("plan", ""),
            investigation_results=final_state.get("investigation_results", ""),
            analysis=final_state.get("analysis", ""),
            decision=final_state.get("decision", ""),
            execution_metrics=final_state.get("execution_metadata", {}),
            errors=final_state.get("errors", [])
        )
        workflow_jobs[job_id] = {**response.model_dump(), "completed_at": datetime.utcnow().isoformat()}
        return response
    except Exception as e:
        total_errors += 1
        error_msg = f"Workflow failed: {str(e)}"
        workflow_jobs[job_id] = {"status": "Error", "errors": [error_msg], "completed_at": datetime.utcnow().isoformat()}
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/workflow/status/{job_id}", tags=["IT Workflow"])
async def get_workflow_status(job_id: str):
    job = workflow_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/workflow/jobs", tags=["IT Workflow"])
async def list_jobs():
    jobs_list = [
        {"job_id": jid, **{k: v for k, v in data.items() if k not in ("plan", "investigation_results")}}
        for jid, data in list(workflow_jobs.items())[-50:]
    ]
    return {"total": len(workflow_jobs), "jobs": jobs_list}

@app.post("/workflow/chat/{job_id}", tags=["IT Workflow"])
async def chat_followup(job_id: str, chat: ChatMessage):
    """Resolution Copilot — scoped follow-up chat for a specific incident job."""
    global total_requests
    total_requests += 1
    job = workflow_jobs.get(job_id)
    if job:
        context_str = f"Plan:\n{job.get('plan', '')}\n\nDecision:\n{job.get('decision', '')}"
    else:
        context_str = "No prior context available for this job."
    try:
        llm = ChatGroq(api_key=settings.GROQ_API_KEY, model=settings.DEFAULT_MODEL)
        system_msg = SystemMessage(content=f"""You are the Resolution Copilot for NexusOps. Your role is strictly to help the user follow up on their specific IT incident ticket.

Original Incident Context:
{context_str}

CRITICAL INSTRUCTION:
You MUST ONLY answer questions that are DIRECTLY related to the "Original Incident Context" above.
If the user asks about ANY system, issue, or topic that is NOT part of the original incident, you MUST reject the request.
If the request is unrelated, reply EXACTLY with:
"This is not a follow-up to the current incident. Please ask this independently as a new request."
Under no circumstances should you provide troubleshooting steps for an unrelated issue.""")
        response = llm.invoke([system_msg, HumanMessage(content=chat.message)])
        return {"reply": response.content}
    except Exception as e:
        return {"reply": f"**Error connecting to LLM**: {str(e)}"}


# ─── Agent Endpoints ──────────────────────────────────────────────────────────

@app.get("/agents", tags=["Agents"])
async def list_agents():
    """List all AI agents — both IT Incident agents and HR agents."""
    return {
        "agents": [
            # IT Incident Agents (LLM-powered via Groq + LangGraph)
            {"id": "planner", "name": "Planner Agent", "role": "Orchestration", "type": "IT",
             "description": "Breaks down incident requests into a structured execution plan.", "model": settings.DEFAULT_MODEL,
             "status": "Online", "capabilities": ["Plan generation", "Memory retrieval", "Workflow design"]},
            {"id": "investigation", "name": "Investigation Agent", "role": "Research", "type": "IT",
             "description": "Gathers evidence using enterprise tools — logs, health, history, runbooks.", "model": settings.DEFAULT_MODEL,
             "status": "Online", "capabilities": ["Log analysis", "Health checks", "Incident search", "Runbook retrieval", "External API probing"]},
            {"id": "analysis", "name": "Analysis Agent", "role": "Analytics", "type": "IT",
             "description": "Performs root cause analysis and identifies risk, severity and business impact.", "model": settings.DEFAULT_MODEL,
             "status": "Online", "capabilities": ["Root cause analysis", "Risk assessment", "Impact scoring", "Pattern recognition"]},
            {"id": "decision", "name": "Decision Agent", "role": "Decision Support", "type": "IT",
             "description": "Formulates final mitigation strategies. Auto-escalates unmonitored services.", "model": settings.DEFAULT_MODEL,
             "status": "Online", "capabilities": ["Resolution strategy", "Ticket creation", "Escalation logic", "Recommendation generation"]},
            # HR Agents (rule-based, no LLM)
            {"id": "workload", "name": "Workload Agent", "role": "HR Analysis", "type": "HR",
             "description": "Identifies workload thresholds from capacity snapshot. Detects over-allocation.", "model": "Rule-Based",
             "status": "Online", "capabilities": ["Capacity analysis", "Overload detection", "Stress index review"]},
            {"id": "project_fit", "name": "Project Fit Agent", "role": "HR Analysis", "type": "HR",
             "description": "Compares employee skills against project requirements for fit assessment.", "model": "Rule-Based",
             "status": "Online", "capabilities": ["Skill matching", "Gap analysis", "Assignment readiness"]},
            {"id": "performance", "name": "Performance Agent", "role": "HR Analysis", "type": "HR",
             "description": "Summarizes performance metrics snapshot without making employment verdicts.", "model": "Rule-Based",
             "status": "Online", "capabilities": ["Velocity review", "Code quality", "Delivery tracking", "Collaboration score"]},
            {"id": "availability", "name": "Availability Agent", "role": "HR Analysis", "type": "HR",
             "description": "Reports allocation headroom without inferring calendar availability.", "model": "Rule-Based",
             "status": "Online", "capabilities": ["Headroom calculation", "Capacity planning"]},
            {"id": "wellbeing", "name": "Wellbeing Check-in Agent", "role": "HR Analysis", "type": "HR",
             "description": "Flags when a manager check-in may be appropriate based on operational signals.", "model": "Rule-Based",
             "status": "Online", "capabilities": ["Stress flag detection", "Check-in suggestions"]},
        ]
    }


# ─── Incident History ─────────────────────────────────────────────────────────

@app.get("/incidents/history", tags=["Incidents"])
async def get_history(limit: int = 20, offset: int = 0):
    try:
        conn = sqlite3.connect("agentsync_memory.db")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_request, timestamp, decision FROM workflow_history ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )
        results = [dict(row) for row in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) FROM workflow_history")
        total = cursor.fetchone()[0]
        conn.close()
        return {"history": results, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        return {"history": [], "total": 0, "error": str(e)}

@app.get("/incidents/history/{record_id}", tags=["Incidents"])
async def get_history_detail(record_id: int):
    try:
        conn = sqlite3.connect("agentsync_memory.db")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_request, plan, research_results, analysis, decision, timestamp FROM workflow_history WHERE id = ?",
            (record_id,)
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Record not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Tickets ──────────────────────────────────────────────────────────────────

@app.get("/tickets", tags=["Tickets"])
async def list_tickets():
    tickets = []
    seen = set()
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tickets_dir = os.path.join(base_dir, "tickets")
    if os.path.exists(tickets_dir):
        for f in sorted(glob.glob(os.path.join(tickets_dir, "*.md")), reverse=True):
            ticket_id = os.path.basename(f).replace(".md", "")
            try:
                with open(f, "r", encoding="utf-8") as tf:
                    content = tf.read()
                req_match = re.search(r"\*\*Original User Request:\*\*\s*(.*)", content)
                user_req = req_match.group(1).strip() if req_match else "Unmonitored Service Ticket"
                mtime = os.path.getmtime(f)
                ts_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
                tickets.append({"ticket_id": ticket_id, "title": user_req, "status": "Escalated",
                                 "severity": "High", "type": "Unmonitored System", "timestamp": ts_str,
                                 "source": "Escalation File", "content": content})
                seen.add(ticket_id)
            except Exception as e:
                logger.error(f"Error reading ticket {f}: {e}")
    try:
        conn = sqlite3.connect("enterprise_mock.db")
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT incident_id, service, description, resolution FROM historical_incidents")
        for row in cur.fetchall():
            tid = row["incident_id"]
            if tid not in seen:
                tickets.append({"ticket_id": tid, "title": f"{row['service']}: {row['description']}",
                                 "status": "Resolved", "severity": "Medium", "type": "ITSM Record",
                                 "timestamp": "Historical", "source": "Enterprise DB",
                                 "content": f"**Service:** {row['service']}\n\n**Description:** {row['description']}\n\n**Resolution:** {row['resolution']}"})
                seen.add(tid)
        conn.close()
    except Exception as e:
        logger.error(f"Error fetching enterprise tickets: {e}")
    try:
        conn = sqlite3.connect("agentsync_memory.db")
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT id, user_request, decision, timestamp FROM workflow_history ORDER BY id DESC")
        for row in cur.fetchall():
            dec = row["decision"] or ""
            matches = re.findall(r"(INC-[A-Za-z0-9]+)", dec)
            for m in matches:
                if m not in seen and m.upper() not in ["INC-XXXX", "INC-YYYY"]:
                    status = "Open"
                    if "outside of our monitored systems" in dec:
                        status = "Escalated"
                    elif "resolved" in dec.lower() or "mitigation" in dec.lower():
                        status = "In Progress"
                    tickets.append({"ticket_id": m, "title": row["user_request"], "status": status,
                                     "severity": "High" if "critical" in dec.lower() or "P1" in dec else "Medium",
                                     "type": "AI Investigation", "timestamp": row["timestamp"],
                                     "source": "Workflow Memory",
                                     "content": f"**Incident Request:** {row['user_request']}\n\n**Agent Decision:**\n{dec}"})
                    seen.add(m)
        conn.close()
    except Exception as e:
        logger.error(f"Error reading workflow tickets: {e}")
    return {"total": len(tickets), "tickets": tickets}

@app.get("/tickets/{ticket_id}", tags=["Tickets"])
async def get_ticket_detail(ticket_id: str):
    resp = await list_tickets()
    for t in resp.get("tickets", []):
        if t["ticket_id"].lower() == ticket_id.lower():
            return t
    raise HTTPException(status_code=404, detail="Ticket not found")


# ─── Tools ────────────────────────────────────────────────────────────────────

@app.get("/tools", tags=["Tools"])
async def list_tools():
    return {
        "tools": [
            {"id": "analyze_logs", "name": "Log Analyzer", "description": "Analyzes service logs for errors or anomalies within a given time range.",
             "category": "Observability", "data_source": "enterprise_mock.db / service_logs", "parameters": ["service", "time_range"]},
            {"id": "check_health", "name": "Service Health Check", "description": "Checks the current health status, latency, and error rate of a monitored service.",
             "category": "Observability", "data_source": "enterprise_mock.db / service_health", "parameters": ["service"]},
            {"id": "search_incident_history", "name": "Incident History Search", "description": "Searches historical incidents for similar issues and their past resolutions.",
             "category": "Knowledge", "data_source": "enterprise_mock.db / historical_incidents", "parameters": ["query"]},
            {"id": "search_runbooks", "name": "Knowledge Base / Runbooks", "description": "Retrieves troubleshooting runbooks and step-by-step procedures.",
             "category": "Knowledge", "data_source": "enterprise_mock.db / service_runbooks", "parameters": ["query"]},
            {"id": "manage_incident", "name": "ITSM Incident Manager", "description": "Creates, escalates, or resolves incident tickets in the ITSM system.",
             "category": "Action", "data_source": "ITSM System (Mock)", "parameters": ["action", "details"]},
            {"id": "check_external_service_status", "name": "External Service Probe", "description": "Makes a live HTTP GET request to check if an external dependency is reachable.",
             "category": "Action", "data_source": "Internet / External APIs", "parameters": ["service_url"]},
        ]
    }


# ─── Metrics & Health ─────────────────────────────────────────────────────────

@app.get("/metrics", tags=["Monitoring"])
async def get_metrics():
    uptime_seconds = round(time.time() - api_start_time)
    hours, remainder = divmod(uptime_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    uptime_str = f"{hours:02d}h {minutes:02d}m {seconds:02d}s"
    try:
        conn = sqlite3.connect("agentsync_memory.db")
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM workflow_history")
        total_workflows = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM workflow_history WHERE timestamp >= datetime('now', '-24 hours')")
        workflows_today = cursor.fetchone()[0]
        conn.close()
    except Exception:
        total_workflows = 0
        workflows_today = 0
    active_jobs = sum(1 for j in workflow_jobs.values() if j.get("status") == "Running")
    error_jobs = sum(1 for j in workflow_jobs.values() if j.get("status") == "Error")
    completed_jobs = sum(1 for j in workflow_jobs.values() if j.get("status") not in ("Running", "Error"))
    durations = [j.get("execution_metrics", {}).get("duration_seconds", 0) for j in workflow_jobs.values() if isinstance(j.get("execution_metrics"), dict)]
    avg_duration = round(sum(durations) / len(durations), 2) if durations else 0
    return {
        "platform": {"name": "NexusOps", "version": "1.0.0", "uptime": uptime_str, "uptime_seconds": uptime_seconds, "status": "Operational"},
        "agents": {"total": 9, "it_agents": 4, "hr_agents": 5, "model": settings.DEFAULT_MODEL},
        "workflows": {"total_all_time": total_workflows, "workflows_last_24h": workflows_today,
                      "session_total": len(workflow_jobs), "session_active": active_jobs,
                      "session_completed": completed_jobs, "session_errors": error_jobs,
                      "avg_duration_seconds": avg_duration},
        "tools": {"total": 6, "categories": ["Observability", "Knowledge", "Action"]},
        "api": {"total_requests_session": total_requests, "total_errors_session": total_errors}
    }

@app.get("/health", tags=["Monitoring"])
async def health_check():
    db_ok = True
    try:
        conn = sqlite3.connect("agentsync_memory.db")
        conn.execute("SELECT 1")
        conn.close()
    except Exception:
        db_ok = False
    llm_ok = bool(settings.GROQ_API_KEY)
    return {
        "status": "healthy" if db_ok else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "components": {
            "api": "ok",
            "database": "ok" if db_ok else "error",
            "llm_provider": "ok" if llm_ok else "standby",
            "it_agents": "online",
            "hr_agents": "online"
        }
    }

