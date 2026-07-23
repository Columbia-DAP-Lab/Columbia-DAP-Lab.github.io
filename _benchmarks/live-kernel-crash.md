---
title: Live Kernel Crash Resolution
status: Released
domain: Post-cutoff software repair
tagline: A live benchmark of whether agents can diagnose and resolve newly reported Linux kernel crashes.
updated: February 2026
stats:
  - value: "Live"
    label: Task stream
  - value: "ICML 2026"
    label: Publication
evaluation_unit: A newly reported kernel crash and submitted repair
verification: Reproduction plus patch validation
availability: Paper available
languages: Linux kernel, C
resources:
  - label: Project
    url: /projects/kagent/
  - label: Paper
    url: https://arxiv.org/abs/2602.02690
    external: true
---

## Background

Static software benchmarks eventually leak into model training data. This benchmark continuously incorporates newly reported Linux kernel crashes, making task freshness part of the evaluation design.

## What it evaluates

- Crash diagnosis from real reports and execution evidence
- Reproduction of newly reported failures
- Kernel-level patch generation
- Validation of candidate repairs

## Dataset and tasks

Tasks are drawn from post-cutoff kernel failures rather than a permanently frozen set. Each task requires work across bug understanding, experimentation, and code repair.

## Evaluation methodology

Agents must reproduce the failure and produce a patch that resolves it under the associated validation environment. The live design reduces the chance that success comes from memorizing a public fix.

## Representative task

> Given a newly reported crash, reproduce it in the supplied environment, identify the root cause, and submit a patch that eliminates the failure without breaking the validation suite.

## Results

Current results, the live-benchmark design, and limitations are reported in the ICML 2026 paper.
