---
title: LAKEQA
status: Released
domain: Exploratory question answering over data lakes
tagline: Evaluating whether deep-research agents can discover, integrate, and reason over relevant datasets at million-table scale.
updated: June 2026
stats:
  - value: "1M+"
    label: Data lake scale
  - value: "ICML 2026"
    label: Publication
evaluation_unit: An exploratory question with answer and provenance
verification: Reference answers and explicit provenance
availability: Paper, code, and leaderboard available
languages: Structured and unstructured data
resources:
  - label: Project
    url: /projects/lakeagent/
  - label: Leaderboard
    url: https://lakeqa-bench.github.io/
    external: true
  - label: Paper
    url: https://arxiv.org/abs/2606.10460
    external: true
---

## Background

Deep-research agents typically search the web while ignoring the structured data stored in public and enterprise data lakes. LAKEQA targets analytic questions that require discovering relevant datasets, combining heterogeneous evidence, and showing where an answer came from.

## What it evaluates

- Dataset discovery at million-table scale
- Cross-source integration and analytic reasoning
- Enumeration, aggregation, and evidence synthesis
- Answer provenance

## Dataset and tasks

Tasks are exploratory rather than simple fact lookup: the relevant sources are not handed to the agent in advance, and a successful answer may require several structured and unstructured datasets.

## Evaluation methodology

Submissions are assessed for answer quality and provenance. The benchmark is designed to expose failures at each stage—from finding the right datasets to integrating them and producing a supported final answer.

## Representative task

> Answer an analytic question whose evidence is distributed across a large data lake, identify the relevant sources, and return a verifiable answer with provenance.

## Results

The paper and public leaderboard provide current benchmark results and evaluation details.
