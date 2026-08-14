---
title: "ConcurBugBench"
subtitle: "Concurrency bug discovery and repair"
date: 2026-07-01
tags:
  - Benchmark
  - Agents
  - Systems
  - Security
is_project: true
is_benchmark: true
---

ConcurBugBench tests agent capabilities to locate, reproduce, and fix authentic concurrency bugs where failures stem from specific thread interactions, timing, and shared state dynamics. Each bug includes a validation mechanism for both reproduction and repair.

- **~200** real bugs sourced from production codebases
- Languages: Go, Rust, C, C++
- Bug-specific oracles for deterministic validation
