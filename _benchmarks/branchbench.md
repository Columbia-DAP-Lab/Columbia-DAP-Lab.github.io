---
title: BranchBench
status: Released
domain: Agentic database branching
tagline: Measuring whether branchable databases can sustain the branching patterns created by exploratory AI agents.
updated: April 2026
stats:
  - value: "5"
    label: Ready-to-run workflows
  - value: "4+"
    label: Database backends
evaluation_unit: A parameterized branch workflow on a database backend
verification: Workload completion, latency, and correctness
availability: Open-source benchmark and paper
languages: SQL, protobuf workload configuration
resources:
  - label: Code
    url: https://github.com/ElaineAng/db-fork
    external: true
  - label: Paper
    url: https://arxiv.org/abs/2604.17180
    external: true
  - label: Blog
    url: /general/2026/05/26/branchable-databases-arent-ready-for-agentic-workloads.html
---

## Background

Exploratory agents create, mutate, compare, and discard many speculative states. BranchBench asks whether today’s branchable databases can handle that workload shape efficiently and reliably.

## What it evaluates

- Branch creation, switching, connection, and deletion
- Deep and wide speculative branch structures
- Reads, joins, mutations, and schema changes on branch-local state
- Pruning behavior and concurrent exploration

## Dataset and task taxonomy

The benchmark includes five ready-to-run workflows with configurable branch depth, fanout, mutation type, schemas, and query templates. New workflows and database backends can be added through protobuf configuration.

## Evaluation methodology

Workloads report operation-level and end-to-end performance while checking whether each backend completes the requested workflow correctly. Parameters can be scaled to locate failure and timeout boundaries.

## Representative task

> Create a configurable tree of speculative database branches, execute branch-local analytic and mutation workloads, prune losing branches, and report latency and successful completion.

## Results

The paper and accompanying blog discuss results across systems including Neon and Dolt.
