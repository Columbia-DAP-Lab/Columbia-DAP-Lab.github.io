---
title: Coherence Collapse
status: Released
domain: Coding-agent failure analysis
tagline: Diagnosing why coding agents fail even after reaching the correct region of a codebase.
updated: March 2026
evaluation_unit: An agent trajectory on a real coding task
verification: Trajectory diagnosis and task outcome
availability: Paper available
languages: Software-engineering agent traces
resources:
  - label: Paper
    url: https://arxiv.org/abs/2603.24631
    external: true
---

## Background

Reaching the right file or code region does not guarantee that a coding agent will finish successfully. This benchmark and analysis framework studies how initially useful reasoning can lose coherence across later actions.

## What it evaluates

- Whether an agent reaches relevant code
- How reasoning and edits evolve after localization
- Failure patterns across long action trajectories
- The gap between local progress and final task success

## Evaluation methodology

Agent trajectories are analyzed alongside final task outcomes to distinguish failures of localization from failures of maintaining a coherent solution.

## Representative task

> Follow a coding-agent trajectory that reaches the relevant code and determine where its reasoning or edits diverge from a successful resolution.

## Results

The paper reports the diagnostic framework and observed failure patterns.
