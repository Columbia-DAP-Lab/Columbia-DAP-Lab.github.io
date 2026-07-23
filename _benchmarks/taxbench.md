---
title: TaxBench
status: In progress
domain: Faithful tax preparation
tagline: Can AI agents prepare tax returns accurately, request missing information, and apply governing rules in the correct order?
updated: July 2026
stats:
  - value: "500+"
    label: Rules (target)
  - value: "50+"
    label: Scenarios (target)
  - value: "2025"
    label: Tax year
evaluation_unit: A taxpayer scenario and its reference return
verification: Deterministic field-level comparison
availability: In development
languages: U.S. federal tax rules and official guidance
---

## Background

Tax preparation combines rule-following, numerical accuracy, information gathering, and faithful handling of exceptions. A useful agent must do more than answer isolated tax questions: it must determine what information is missing, select the applicable rule, and produce a return whose fields agree with the governing law.

## What it evaluates

- Requesting missing information from a taxpayer
- Selecting the correct rule when provisions overlap
- Applying explicit rule-precedence relationships
- Calculating tax-return fields deterministically
- Producing a complete return that matches a reviewed reference

## Dataset

TaxBench is being built around a structured rule system extracted from tax laws and official guidance for tax year 2025. The initial release targets more than 500 rules and more than 50 realistic taxpayer scenarios. Each scenario distinguishes information initially provided to the agent from information it must request.

## Evaluation methodology

Each rule maps specified inputs to a particular tax-return field. Explicit precedence relationships determine which rule governs when several could apply. Agent-produced returns are compared field by field with reference returns, enabling error analysis by rule selection, missing information, and calculation.

## Representative task

> Review the taxpayer’s initial materials, ask only for information required to complete the return, and produce the specified 2025 return fields with supporting rule provenance.

## Release status

Rule extraction, scenario construction, and domain-expert review are ongoing. Counts will be finalized before release.
