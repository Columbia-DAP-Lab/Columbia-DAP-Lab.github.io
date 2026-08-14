---
title: "SRE-Bench"
subtitle: "Contamination-Free Benchmark for Agentic Reverse Engineering"
date: 2026-08-01
authors:
  - name: "Jeremy Spence"
  - name: "Nicholas Assaderaghi"
  - name: "Jinhao Zhu"
  - name: "Nikil Ravi"
  - name: "Raluca Ada Popa"
  - name: "Guannan Wei"
  - name: "Yangruibo Ding"
  - name: "Zhuo Zhang"
tags:
  - Benchmark
  - Security
  - Agents
is_project: true
is_benchmark: true
links:
  paper: "https://arxiv.org/abs/2608.11469"
  leaderboard: "https://www.vals.ai/benchmarks/reverse_eng"
publications:
  - title: "The Next Challenge for Agentic Cybersecurity: A Realistic, Contamination-Free Reverse Engineering Benchmark"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2608.11469"
    year: 2026
---

AI agents are getting good at security tasks when they can read source code. But the software that matters most to security — malware, firmware, proprietary applications — ships as binaries. Working on those requires reverse engineering: recovering what a program means before you can reason about it at all.

Benchmarking that skill is harder than it looks. If a binary was built from source the model has already read, the agent can recognize the program instead of analyzing it, and the score measures memory rather than capability. Existing benchmarks either leak in this way or stay far below the size and anti-analysis hardening of real targets.

## The Benchmark

SRE-Bench is built from scratch to close both gaps. Reverse engineering experts spent over **5,000 hours** writing 19 private programs averaging 16,900 lines of code, then layered 44 in-house anti-analysis primitives on top — producing **262 binary instances** and **1,572 deterministically graded tasks** across six difficulty levels.

| Metric | Value |
|---|---|
| Private programs | 19 |
| Avg. lines of code | 16,900 |
| Anti-analysis primitives | 44 |
| Binary instances | 262 |
| Graded tasks | 1,572 |
| Best model score (per instance) | 61.4% |
| Best model full-solve rate | 31.5% |

## Key Findings

Across five frontier models, the task is far from solved. The strongest agent scores 61.4% per instance and fully solves 31.5% of programs. Agents also fail differently from humans: they are oddly insensitive to compiler optimization levels and static linking, suggesting they rely on pattern-matching over genuine semantic reasoning.

The leaderboard is live at [vals.ai](https://www.vals.ai/benchmarks/reverse_eng). In collaboration with [Vals AI](https://vals.ai) and UC Berkeley.
