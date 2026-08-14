---
title: "MortarBench"
subtitle: "Evaluating Mortgage Loan Origination Agents"
date: 2026-06-17
authors:
  - name: "Matthew Toles"
  - name: "Yunan Lu"
  - name: "Manav Munjal"
  - name: "Bojun Liu"
  - name: "Yuanhao Deng"
  - name: "Stephanie Selig"
  - name: "Derek Rindner"
  - name: "Cheng Li"
  - name: "Zhou Yu"
    url: "https://www.cs.columbia.edu/~zhouyu/"
tags:
  - Benchmark
  - Agents
  - Finance
is_project: true
is_benchmark: true
links:
  paper: "https://arxiv.org/abs/2606.19416"
  blog: "/general/2026/03/16/benchmarking-mortgage-underwriting-agents.html"
publications:
  - title: "MortarBench: Evaluating Mortgage Loan Origination Agents"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2606.19416"
    year: 2026
---

Mortgage lenders are deploying AI agents without standardized ways to evaluate them. MortarBench is an open-source benchmark that lets companies, regulators, and researchers measure AI accuracy against real mortgage origination tasks: matching payroll deposits to employer records, flagging large deposits for scrutiny, identifying joint account holders, and applying the correct rules when multiple provisions apply to the same field.

## Findings

Top general-purpose models tested under naive use conditions (equivalent to pasting a loan package into a chatbot) fell well short:

| Model | Exact Match Accuracy |
|---|---|
| Gemini 3.1 Pro | 77.1% |
| GPT-5.5 | 76.8% |
| Claude Sonnet 4.6 | 51.4% |

A particularly revealing failure mode was **transaction extraction** — models both missed relevant transactions and pulled in irrelevant ones. Gemini misclassified a personal loan as buy-now-pay-later, treated all wire transfers as international, and categorized a one-time housing payment as recurring.

## Bias Finding

When researchers asked models which bank deposits "could be of foreign origin," transactions tied to English names were flagged 13.3% of the time. Transactions tied to non-English names were flagged 77% of the time — a systematic bias with direct fair lending implications.

To address this, the paper introduces **CRIT**, a confidence calibration framework that improves accuracy to 80.5% and reduces the identified biases.

## In the Press

[**"In a New Test, AI Mortgage Assistants Got Nearly 1 in 4 Answers Wrong"**](https://www.realtor.com/news/trends/top-ai-mortgage-underwriting-test-failure-new-report/) — Realtor.com, August 13, 2026

> "Everybody is using AI, but nobody really understands how to use AI in compliance and with the correct guardrail." — Diane Yu, CEO of Tidalwave

Developed in collaboration with [Tidalwave](https://www.tidalwave.com/), a mortgage technology company.
