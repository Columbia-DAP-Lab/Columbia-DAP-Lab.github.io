---
title: "kGym & kAgent : A Platform and Agent to patch Linux kernel bugs"
layout: project
date: 2025-10-26
authors:
  - name: Alex Mathai*
  - name: Chenxi Huang*
  - name: Petros Maniatis
  - name: Aleksandr Nogikh
  - name: Franjo Ivančić
  - name: Junfeng Yang
  - name: Baishakhi Ray
avatar: Kernel_Agent_Sharp.png
tags:
  - Linux Kernel
  - LLM Agents
  - Automated Crash Repair
  - Systems
publications:
  - title: "CrashFixer: A crash resolution agent for the Linux kernel"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2504.20412"
    year: 2025
  - title: "kGym: A Platform and Dataset to Benchmark Large Language Models on Linux Kernel Crash Resolution"
    venue: "NeurIPS"
    url: "https://proceedings.neurips.cc/paper_files/paper/2024/hash/8e9ed2a28af7d9085180e3817b2c9a57-Abstract-Datasets_and_Benchmarks_Track.html"
    year: 2024
---

## Overview

Debugging the **Linux kernel** remains one of the most challenging problems in systems software. With over **20 million lines of code**, thousands of contributors, and hardware-level concurrency,
crashes can be subtle, nondeterministic, and cryptic to interpret. Traditional debugging techniques often fail to scale across this diversity and complexity.

To address this, we built an **agentic framework** that leverages
**Large Language Models (LLMs)** to reason about, reproduce, and fix kernel-level bugs.  This ecosystem — **kBench**, **kGym**, and **kAgent** — integrates structured datasets,
experimental automation, and intelligent reasoning to close the loop between bug observation and repair.

---

## Components

| **Component** | **Description** |
|----------------|-----------------|
| **kBench** | A curated benchmark of Linux kernel bugs, each paired with developer-provided fixes and deterministic reproduction scripts. Enables systematic evaluation of patching strategies. |
| **kGym** | A sandboxed, large-scale **kernel experimentation platform** capable of booting and testing thousands of kernel configurations in parallel. Provides execution traces, crash states, and verification environments for patches. |
| **kAgent** | A specialized LLM-based **autonomous agent** that runs experiments in kGym, interprets crash logs, hypothesizes code changes, and iteratively validates patches until a verified fix is achieved. |

---

## Approach

The system adopts a **hypothesis-driven debugging workflow**:

1. Observe a kernel crash and extract structured traces and logs.  
2. Generate hypotheses for potential fault locations using LLM reasoning.  
3. Propose and apply plausible patches to the codebase.  
4. Validate candidate patches within kGym until the crash is fully resolved.

Through iterative feedback between execution results and model reasoning, **kAgent** narrows its search space,
reducing spurious edits and improving both precision and convergence speed.

---

## Impact

This platform demonstrates the first **end-to-end LLM-based repair loop** for real Linux kernel failures.  
It shows that structured experimentation and domain-specific agent design can overcome
limitations of general-purpose code models in system-level debugging.

**Key outcomes:**
- Reproducing complex kernel bugs *automatically and deterministically*.  
- Validating LLM-proposed patches *at scale* within kGym.  
- Reducing incorrect edit rates via structured, state-aware search.  
- Providing a reproducible benchmark for future research on *agentic debugging*.

---