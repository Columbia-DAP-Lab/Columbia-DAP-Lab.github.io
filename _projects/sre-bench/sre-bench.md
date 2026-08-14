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
links:
  paper: "https://arxiv.org/abs/2608.11469"
  leaderboard: "https://www.vals.ai/benchmarks/reverse_eng"
publications:
  - title: "The Next Challenge for Agentic Cybersecurity: A Realistic, Contamination-Free Reverse Engineering Benchmark"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2608.11469"
    year: 2026
---

AI agents are getting good at security tasks when they can read source code. But the software that matters most to security ships as binaries — malware, firmware, proprietary applications — and working on those requires reverse engineering: recovering what a program means before you can reason about it.

Existing benchmarks either leak into model training data or stay far below the size and anti-analysis hardening of real targets. SRE-Bench closes both gaps. Reverse engineering experts spent over 5,000 hours writing 19 private programs averaging 16,900 lines of code, then layered 44 in-house anti-analysis primitives on top — producing 262 binary instances and 1,572 deterministically graded tasks. Across five frontier models, the task is far from solved: the strongest scores 61.4% per instance and fully solves 31.5% of them.
