---
title: ScarfBench
status: Released
domain: Enterprise application migration
tagline: Evaluating whether coding agents can migrate enterprise Java applications across frameworks while preserving behavior.
updated: May 2026
evaluation_unit: A cross-framework application-migration task
verification: Build, tests, and behavioral correctness
availability: Paper available
languages: Enterprise Java
resources:
  - label: Paper
    url: https://arxiv.org/abs/2605.06754
    external: true
---

## Background

Framework migration requires coordinated changes across an application rather than an isolated patch. ScarfBench measures whether agents can carry those changes through while preserving externally visible behavior.

## What it evaluates

- Understanding an existing enterprise application
- Translating framework-specific components and configuration
- Coordinating changes across files and layers
- Preserving buildability and behavior

## Evaluation methodology

Agent submissions are evaluated as complete migrated applications using executable build and correctness checks.

## Representative task

> Migrate a working Java application from its current framework to a specified target framework while retaining its required behavior and passing the validation suite.

## Results

The paper describes the task set, evaluation harness, and baseline performance.
