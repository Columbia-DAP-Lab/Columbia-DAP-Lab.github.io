---
title: VISTA
status: Released
domain: Interactive agent evaluation
tagline: A versatile user-simulation toolkit for evaluating agents through realistic multi-turn interaction.
updated: June 2026
evaluation_unit: A multi-turn interaction between an agent and simulated user
verification: Task outcomes and interaction-level evaluation
availability: Paper available
languages: Conversational agent environments
resources:
  - label: Related project
    url: /projects/sage/
  - label: Paper
    url: https://arxiv.org/abs/2606.11079
    external: true
---

## Background

Interactive agents cannot be evaluated fully with single-turn question answering. VISTA provides simulated users for repeatable evaluation of behavior that unfolds over several turns.

## What it evaluates

- Multi-turn task completion
- Agent adaptation to user behavior
- Robustness across user profiles and interaction paths
- Failures that static prompts do not expose

## Evaluation methodology

Agents interact with controlled user simulations, allowing researchers to repeat scenarios and compare behavior without requiring a human evaluator for every run.

## Representative task

> Complete a domain task through conversation with a simulated user whose goals, knowledge, and behavior affect what information becomes available.

## Results

The paper provides toolkit details and reported evaluations.
