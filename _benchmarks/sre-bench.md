---
title: SRE-Bench
status: In progress
domain: Software reverse engineering
tagline: Can AI agents understand and analyze real software when source code is unavailable?
updated: July 2026
stats:
  - value: "262"
    label: Binaries
  - value: "1,572"
    label: Verifiable tasks
  - value: "5"
    label: Scenarios
  - value: "18K"
    label: Avg. lines of code
evaluation_unit: A binary-analysis task with a verifiable target
verification: Task-specific deterministic checks
availability: In development
languages: Compiled binaries without source access
---

## Background

Source code is often unavailable in malware analysis, firmware inspection, vulnerability research, and proprietary-software assessment. SRE-Bench measures whether an agent can recover genuine understanding from executable artifacts rather than from familiar source repositories or memorized examples.

## What it evaluates

- Identifying program behavior and structure from binaries
- Recovering facts needed to answer targeted analysis questions
- Working through realistic anti-analysis protections
- Completing multi-step reverse-engineering workflows with verifiable outcomes

## Dataset

The benchmark contains 262 programs built from scratch to reduce the risk of training-data contamination. Together they support 1,572 tasks across five real-world scenarios. Programs average roughly 18,000 lines of source before compilation and are hardened using a modern anti-analysis suite; more than half of the included protections currently have no public implementation.

## Evaluation methodology

Agents receive executable artifacts and analysis tools, but not source code. Each task has a concrete target and a task-specific verifier. Scores are intended to reflect successful analysis rather than plausible-sounding explanations.

## Representative task

> Given a protected binary and an analysis environment, recover a specified piece of program behavior or hidden state and provide the artifact or answer required by the verifier.

## Release status

Scenario definitions, task packaging, and the reporting protocol are being finalized.
