---
title: "BranchBench"
subtitle: "Agentic database branching"
date: 2026-04-19
authors:
  - name: "Elaine Ang"
  - name: "Sam Weldon"
  - name: "In Keun Kim"
  - name: "Kevin Durand"
  - name: "Kostis Kaffes"
    url: "https://www.cs.columbia.edu/~kkaffes/"
  - name: "Eugene Wu"
    url: "https://www.cs.columbia.edu/~ewu/"
tags:
  - Benchmark
  - Databases
  - Agents
is_project: true
is_benchmark: true
links:
  github: "https://github.com/ElaineAng/db-fork"
  paper: "https://arxiv.org/abs/2604.17180"
  blog: "/general/2026/05/26/branchable-databases-arent-ready-for-agentic-workloads.html"
publications:
  - title: "BranchBench: Aligning Database Branching with Agentic Demands"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2604.17180"
    year: 2026
  - title: "BranchBench: An Extensible Benchmark for Agentic Database Branching"
    venue: "CAIS Workshop 2026"
    url: "https://bauplanlabs.github.io/SAO-workshop/papers/37.pdf"
    year: 2026
---

Agents that operate over databases need to explore candidate states safely — branching off to try a risky write before touching mainline data. BranchBench determines whether branchable databases can support the creation, exploration, and pruning patterns of agentic workloads across configurable branch shapes, schemas, and operations.

The benchmark covers 5 workflows with an extensible design that supports multiple database backends, measuring latency, storage overhead, and correctness of state isolation across the branch shapes agents actually produce.
