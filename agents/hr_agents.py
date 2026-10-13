"""Evidence-based HR agents for employee workload and project-fit reviews.
Moved from the Workflow Decision Making System (WDMS) into NexusOps.
These are deterministic rule-based agents — no LLM required.
"""

from datetime import datetime, timezone
from math import isfinite


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if isfinite(result) else None


def _skills(value):
    if not isinstance(value, list):
        return []
    return [skill.strip() for skill in value if isinstance(skill, str) and skill.strip()]


def _result(agent, status, summary, recommendations, evidence):
    return {
        "agent": agent,
        "status": status,
        "summary": summary,
        "recommendations": recommendations,
        "evidence": evidence,
    }


def workload_agent(employee):
    """Identify workload thresholds from the supplied capacity snapshot."""
    name = employee.get("name") or employee.get("id") or "Employee"
    capacity = _number(employee.get("allocatedCapacity"))
    maximum = _number(employee.get("maxCapacity"))
    stress = _number(employee.get("stressIndex"))

    if capacity is None or capacity < 0 or maximum is None or maximum <= 0:
        return _result(
            "Workload Agent", "DATA_NEEDED",
            "Valid allocated and maximum capacity figures are required to assess workload.",
            ["Confirm the employee's current allocated capacity and positive maximum capacity."], [],
        )

    load_percent = round(capacity / maximum * 100)
    evidence = [f"Reported allocation: {capacity:g} of {maximum:g} capacity ({load_percent}%)."]
    if stress is not None:
        evidence.append(f"Reported stress index: {stress:g}/100 (system indicator only).")

    if load_percent > 100:
        status = "OVER_CAPACITY"
        summary = f"{name} is assigned above stated capacity ({load_percent}%)."
        recommendations = [
            "Review assignments and deadlines with the employee and manager.",
            "Rebalance work before accepting additional assignments.",
        ]
    elif load_percent > 85:
        status = "ELEVATED"
        summary = f"{name} has limited remaining capacity ({load_percent}% assigned)."
        recommendations = ["Check near-term deadlines and planned work before making new assignments."]
    else:
        status = "WITHIN_REPORTED_CAPACITY"
        summary = f"Reported allocation is {load_percent}% of stated capacity."
        recommendations = ["Review again when assignments or availability change."]

    if stress is not None and stress >= 70:
        recommendations.append(
            "The reported stress indicator is elevated; check in directly rather than treating it as a diagnosis."
        )
    return _result("Workload Agent", status, summary, recommendations, evidence)


def project_fit_agent(employee, project=None):
    """Compare listed employee skills with one selected project's requirements."""
    employee_skills = _skills(employee.get("skills"))
    if not project:
        return _result(
            "Project Fit Agent", "PROJECT_NOT_SELECTED",
            "Select a project to compare its required skills with this employee's listed skills.",
            [],
            [f"Listed employee skills: {', '.join(employee_skills)}"] if employee_skills else ["No employee skills were provided."],
        )

    required = _skills(project.get("requiredSkills"))
    employee_by_name = {skill.casefold(): skill for skill in employee_skills}
    matched = [skill for skill in required if skill.casefold() in employee_by_name]
    missing = [skill for skill in required if skill.casefold() not in employee_by_name]
    title = project.get("title") or project.get("id") or "Selected project"

    if not required:
        return _result(
            "Project Fit Agent", "DATA_NEEDED",
            f"{title} has no listed required skills, so skill alignment cannot be assessed.",
            ["Confirm the project's required skills with its owner."], [],
        )

    fit_percent = round(len(matched) / len(required) * 100)
    status = "SKILL_MATCH" if not missing else "PARTIAL_MATCH"
    recommendations = []
    if missing:
        recommendations.append("Discuss the unlisted skills and any support or onboarding needed before assignment.")
    else:
        recommendations.append("Confirm interest, availability, and role expectations with the employee.")
    return _result(
        "Project Fit Agent", status,
        f"{fit_percent}% of {title}'s listed required skills match the employee profile.",
        recommendations,
        [
            f"Matched skills: {', '.join(matched) if matched else 'none listed'}.",
            f"Skills not listed on profile: {', '.join(missing) if missing else 'none'}.",
        ],
    )


def performance_agent(employee):
    """Summarize supplied performance metrics without treating them as a verdict."""
    stats = employee.get("stats")
    if not isinstance(stats, dict) or not stats:
        return _result(
            "Performance Agent", "DATA_NEEDED",
            "No performance metrics were provided for this employee.",
            ["Review role-specific goals and recent work examples with the employee."], [],
        )

    evidence = []
    for metric in ("velocity", "codeQuality", "delivery", "collaboration"):
        value = _number(stats.get(metric))
        if value is not None:
            label = {"codeQuality": "Code quality", "velocity": "Velocity", "delivery": "Delivery", "collaboration": "Collaboration"}[metric]
            evidence.append(f"{label}: {value:g}/100 (reported snapshot).")
    if not evidence:
        return _result(
            "Performance Agent", "DATA_NEEDED",
            "No recognized performance metrics were provided.",
            ["Review role-specific goals and recent work examples with the employee."], [],
        )

    return _result(
        "Performance Agent", "SNAPSHOT_ONLY",
        "Reported metrics are a snapshot, not a trend or an employment recommendation.",
        ["Interpret metrics against agreed role expectations, context, and recent examples."],
        evidence,
    )


def availability_agent(employee):
    """Report allocation headroom without implying calendar availability."""
    capacity = _number(employee.get("allocatedCapacity"))
    maximum = _number(employee.get("maxCapacity"))
    if capacity is None or capacity < 0 or maximum is None or maximum <= 0:
        return _result(
            "Availability Agent", "DATA_NEEDED",
            "Valid allocated and maximum capacity figures are required to estimate allocation headroom.",
            ["Confirm the employee's current allocated capacity and positive maximum capacity."], [],
        )

    headroom = maximum - capacity
    evidence = [f"Allocation headroom: {headroom:g} of {maximum:g} capacity units."]
    if headroom <= 0:
        return _result(
            "Availability Agent", "NO_RECORDED_HEADROOM",
            "The allocation matrix records no remaining capacity for new assignments.",
            ["Check the employee's actual schedule and discuss any proposed assignment before proceeding."],
            evidence,
        )
    return _result(
        "Availability Agent", "RECORDED_HEADROOM",
        f"The allocation matrix records {headroom:g} capacity units unallocated.",
        ["Confirm calendar availability, leave, and employee interest before scheduling work."],
        evidence,
    )


def employee_wellbeing_agent(employee):
    """Flag operational check-in prompts without making clinical conclusions."""
    capacity = _number(employee.get("allocatedCapacity"))
    stress = _number(employee.get("stressIndex"))
    flags = []
    if capacity is not None and capacity > 100:
        flags.append("allocation is above stated capacity")
    if stress is not None and stress >= 70:
        flags.append("the supplied stress indicator is elevated")

    if flags:
        summary = "A manager check-in may be useful: " + " and ".join(flags) + "."
        recommendations = [
            "Ask the employee privately about workload and support needs; do not infer a health condition from these indicators."
        ]
        status = "CHECK_IN_SUGGESTED"
    else:
        summary = "No wellbeing conclusion can be drawn from the supplied operational data."
        recommendations = [
            "Ask the employee directly about support needs; no attendance, leave, or self-reported wellbeing data was supplied."
        ]
        status = "MORE_CONTEXT_NEEDED"

    return _result(
        "Wellbeing Check-in Agent", status, summary, recommendations,
        ["Operational workload indicators are not a medical assessment."],
    )


def analyze_employee(employee, project=None):
    """Run all 5 HR agents and return their assessments and a readable activity log."""
    agents_results = [
        workload_agent(employee),
        project_fit_agent(employee, project),
        performance_agent(employee),
        availability_agent(employee),
        employee_wellbeing_agent(employee),
    ]
    now = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
    logs = [
        {
            "agent": result["agent"],
            "action": "Employee situation reviewed",
            "detail": result["summary"],
            "time": now,
            "badge": result["status"],
        }
        for result in agents_results
    ]
    return {
        "employee": {
            "id": employee.get("id"),
            "name": employee.get("name") or employee.get("id") or "Employee",
            "role": employee.get("role", ""),
        },
        "agents": agents_results,
        "logs": logs,
        "disclaimer": (
            "Decision support only. Assessments use the supplied profile snapshot, "
            "may be incomplete, and are not a substitute for employee discussion or "
            "professional HR judgment."
        ),
    }
