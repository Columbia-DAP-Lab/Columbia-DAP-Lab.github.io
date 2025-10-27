---
title: "LumOS: LLM Agents for Always‑On OS Tuning"
subtitle: "Safe, explainable control loops that continuously optimize Linux in real time"
date: 2025-10-13
tags: [Operating Systems, LLM Agents, Scheduling, Auto‑tuning, MCP]
avatar: LumOS.png
authors:
  - name: "Georgios Liargkovas"
  - name: "Vahab Jabrayilov"
  - name: "Kostis Kaffes"
publications:
  - title: "An Expert in Residence: LLM Agents for Always-On Operating System Tuning"
    venue: "NeurIPS'25 MLForSys"
    url: https://liargkovas.com/assets/pdf/Liargkovas_ML4Sys_NeurIPS25.pdf
    year: 2025
  - title: "Set It and Forget It: Zero‑Mod ML Magic for Linux Tuning"
    venue: "PACMI'25"
    url: https://dl.acm.org/doi/abs/10.1145/3766882.3767175
    year: 2025
  - title: "Speculative Actions: A Lossless Framework for Faster AI Agents"
    venue: "Preprint"
    url: https://arxiv.org/abs/2510.04371
    year: 2025
---

### Overview
**LumOS** builds an *expert‑in‑residence* agent that **safely tunes Linux kernel schedulers online**. The agent reasons over live telemetry, proposes settings, and applies changes with guards (transactional apply/commit/revert, approvals), delivering **faster convergence and lower tail latency** than classical tuners or manual tuning, and adapting quickly to workload shifts.

![Architecture](/_projects/lumos/architecture.svg)


### Why it matters
Traditional BO/RL tuners often explore blindly, need brittle reward engineering, and adapt slowly. By **emulating human expert reasoning**, the agent interprets system state, chooses safe steps, and **explains** what it’s doing—making OS auto‑tuning *governable* and *auditable* in production environments.

### What’s new here
- **LLM‑guided control loop**: An LLM proposes scheduler settings (e.g., `min_granularity_ns`, `latency_ns`) from structured telemetry and trend summaries; host‑side guardrails ensure safety (typed tools, policy, approval gates, apply/commit/revert).

- **Zero‑mod deployment path**: A *userspace* agent learns from **existing** counters (`perf`, `/proc`, `/sys`)—**no app changes** and no kernel patches. It avoids brittle single‑metric proxies by using **pairwise ranking** and archetype selection for robust decisions across contexts. 

- **Latency‑aware speculation (optional)**: A fast speculator makes immediate, **reversible** OS adjustments while the slower actor deliberates, improving reaction time without sacrificing correctness (last‑write‑wins).

### Results at a glance
- **Beats classical tuners & human expert** on Linux CFS tuning  
  – **−5.0%** p99 vs. Bayesian (1‑param), **−7.1%** vs. Bayesian (2‑param), and **−2.98%** vs. a kernel‑savvy human overall; converges faster and adapts smoothly to rate changes. 
- **Robust with zero app instrumentation**  
  – Single‑metric proxies (e.g., IPC) are brittle across workloads; **pairwise ranking over diversified counters** stays predictive even under noise and antagonists.
- **Faster reaction via speculation**  
  – During recovery, **p95 latency ~37.9 ms** with actor+speculator vs. **54.0 ms** actor‑only (untuned ~103 ms); convergence in ~10–15 s vs. ~200 s for actor‑only.

### How it works
1. **Observe**: Collect a compact performance signature from system counters (CPU/core, scheduler, memory/VM, LLC, I/O, network).
2. **Reason**:  
   - *LLM expert*: summarizes trends, proposes safe next settings; guardrails (MCP‑style tool schemas, policy, approvals) keep actions auditable and reversible.
   - *Zero‑mod ML*: if app metrics are absent, a **pairwise ranker** selects better configs based on the signature; archetype gating picks a specialized ranker or falls back to a global one.
3. **Act**: Apply **staged** changes, measure, and **commit/rollback**; optionally let a **fast speculator** react every second while the actor finalizes. 

### Safety & governance
We adopt **MCP‑style interfaces**: discoverable, typed tools; semantic validation (units/ranges/cross‑field checks); **two‑phase apply–commit–revert**; policy/approval gates; and structured audit logs for forensics and replay.

### Broader thrusts
Beyond OS control, we generalize **speculative actions** to agentic environments (gameplay, e‑commerce, web QA): a fast model predicts likely next steps while authoritative components verify. This **lossless** pattern yields substantial wall‑clock savings—up to ~30% time reduction in end‑to‑end agent runs under representative settings—and integrates cleanly with tool- and human‑in‑the‑loop pipelines.

