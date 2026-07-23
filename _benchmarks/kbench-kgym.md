---
title: kBench & kGym
status: Released
domain: Linux kernel debugging
tagline: A curated kernel-bug benchmark and execution platform for reproducible agent evaluation.
updated: 2024
stats:
  - value: "Real"
    label: Kernel bugs
  - value: "NeurIPS 2024"
    label: Publication
evaluation_unit: A kernel bug with reproducer and developer fix
verification: Deterministic reproduction and patch testing
availability: Project and paper available
languages: Linux kernel, C
resources:
  - label: Project
    url: /projects/kagent/
  - label: Paper
    url: https://proceedings.neurips.cc/paper_files/paper/2024/hash/8e9ed2a28af7d9085180e3817b2c9a57-Abstract-Datasets_and_Benchmarks_Track.html
    external: true
---

## Background

Kernel crashes are difficult to evaluate at scale because reproducing them requires the right kernel configuration, environment, and workload. kBench supplies curated bugs; kGym supplies the experimentation infrastructure needed to boot, execute, and validate them.

## What it evaluates

- Kernel crash reproduction
- Root-cause analysis
- Patch generation and iterative testing
- Use of execution evidence during debugging

## Dataset and environment

Each kBench item pairs a real Linux kernel bug with a developer-provided fix and deterministic reproduction script. kGym provides isolated environments, execution traces, crash states, and parallel testing across kernel configurations.

## Evaluation methodology

An agent is evaluated on whether it can reproduce the target failure and produce a patch that passes the task’s validation procedure.

## Representative task

> Reproduce a supplied kernel crash in kGym, analyze the resulting traces, propose a source patch, and validate the repair in a clean environment.

## Results

The NeurIPS paper describes the dataset, platform, and reported evaluation results.
