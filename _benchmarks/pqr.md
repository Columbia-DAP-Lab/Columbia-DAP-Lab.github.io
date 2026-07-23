---
title: PQR
status: Released
domain: QA-agent failure discovery
tagline: Generating diverse and realistic user queries that are specifically useful for exposing QA-agent failures.
updated: May 2026
evaluation_unit: A generated user query and the failure it elicits
verification: QA outcome and failure analysis
availability: Paper available
languages: Question-answering agents
resources:
  - label: Paper
    url: https://arxiv.org/abs/2605.16551
    external: true
---

## Background

Average-case question sets can conceal important reliability problems. PQR focuses query generation on realistic questions that reveal where a deployed QA agent breaks.

## What it evaluates

- Diversity and realism of generated user queries
- Ability to uncover previously missed agent failures
- Coverage of difficult behaviors and edge cases
- Usefulness for iterative QA-agent improvement

## Evaluation methodology

Generated queries are run against a target QA agent and assessed by the failures they elicit, not simply by surface diversity.

## Representative task

> Generate a realistic query for a target QA system that probes a meaningful capability boundary and reveals an actionable failure.

## Results

The paper reports the generation framework, evaluation protocol, and comparative results.
