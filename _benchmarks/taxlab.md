---
title: TaxLab
status: Under review
domain: Interactive U.S. federal tax filing
tagline: An AI tax-filing benchmark built on field-level operationalization of tax law.
updated: October 2026
stats:
  - value: "3,142"
    label: Source-grounded rules
  - value: "63"
    label: Tax issues covered
  - value: "55"
    label: CPA-reviewed scenarios
  - value: "64.0%"
    label: Best perfect filing accuracy
evaluation_unit: A taxpayer scenario and its CPA-reviewed gold return
verification: Field-by-field comparison against rule-derived gold returns
availability: Paper under review; open-source release planned
languages: U.S. federal individual income tax, tax year 2025
project: taxbench
share_with_project: true
card_image: /files/images/benchmarks/taxlab/card.png
---

<style>
.taxlab-figure { margin: 1.5rem 0 2rem; }
.taxlab-figure img { display: block; width: 100%; height: auto; }
.taxlab-figure-narrow img { max-width: 620px; margin: 0 auto; }
.taxlab-figure figcaption { color: #667; font-size: 0.88rem; margin-top: 0.5rem; text-align: center; }
</style>

## Background

AI agents are increasingly capable of completing complex, multi-step tasks. This makes high-stakes applications, such as automated tax preparation, a promising direction. Evaluating tax-filing agents, however, remains difficult. It is hard to determine what range of tax situations a benchmark covers and how diverse those situations are. It is also hard to determine where an agent's mistakes originate when a completed return is incorrect.

We introduce **TaxLab**, a benchmark for interactive U.S. federal individual tax filing. TaxLab is built on *field-level operationalization of tax law*. This representation provides a common foundation for constructing gold returns, measuring benchmark coverage and diversity, and tracing filing errors back to the rules and sources involved.

<figure class="taxlab-figure">
  <img src="/files/images/benchmarks/taxlab/benchmark-pipeline.png" alt="TaxLab pipeline: rule-system development, scenario generation, and agent evaluation">
  <figcaption>TaxLab's end-to-end pipeline for benchmark construction and evaluation.</figcaption>
</figure>

## TaxLab-Rule

We construct **TaxLab-Rule**, an executable, source-grounded rule system. It comprises **3,142 rules** covering **63 tax issues** in U.S. individual federal income tax. Its design follows two principles:

- Each rule connects a tax form field to a specific official source.
- Its logic is readable enough for a CPA to review.

Each rule declares the taxpayer facts and computed fields it depends on, the condition under which it applies, its effect on a single target field, and its supporting source. Rules compose through explicit field dependencies. Executing them over a scenario produces the completed return, together with the path from taxpayer facts to reported fields and their sources. A CPA validated every rule against its cited authority.

<figure class="taxlab-figure">
  <img src="/files/images/benchmarks/taxlab/rule-example.png" alt="Two TaxLab-Rule rules for the Schedule A medical expense deduction, linked to IRC section 213(a) and the form lines">
  <figcaption>Two source-grounded rules for Schedule A medical and dental expenses.</figcaption>
</figure>

## Dataset

We construct 55 tax-year-2025 scenarios through a CPA-guided, coverage-driven process:

- A CPA designs 10 representative seed cases.
- An LLM generates taxpayer facts that exercise a broad range of rules.
- We execute the rule system on each case to derive its gold return and rule trace.
- A CPA reviews all 55 cases and gold returns.

All scenarios are synthetic and contain no real taxpayer data. Because each case has a rule trace, coverage and diversity are measured rather than assumed. All 63 tax issues are covered. A typical pair of cases overlaps on only about one fifth of the issues or rules in their combined traces.

<figure class="taxlab-figure taxlab-figure-narrow">
  <img src="/files/images/benchmarks/taxlab/case-issue-map.png" alt="Matrix of 55 cases by 63 tax issues showing which issues each case exercises">
  <figcaption>Tax-issue coverage of TaxLab. Each column is a case; each row is a tax issue.</figcaption>
</figure>

## Evaluation methodology

We evaluate each agent in an interactive tax-filing environment. Each scenario's facts are partitioned into *present information* and *hold-back information*. The agent receives:

- the present information
- a fixed offline collection of IRS guidance
- an empty tax-return workbook
- tools for inspecting and editing the workbook

Hold-back information is available only through a simulated taxpayer, accessed over MCP. The taxpayer answers only the specific question asked. This tests whether the agent recognizes missing information and asks for it, rather than hallucinating facts. Each case has a 30-minute limit.

We report three accuracy metrics:

- **Final Return Accuracy (FRA):** the final Form 1040 outcome matches the gold return.
- **Compliance Field Accuracy (CFA):** accuracy over CPA-labeled anchor fields.
- **Perfect Filing Accuracy (PFA):** all anchor fields in a case are correct.

## Results

We evaluate nine models. Tax filing remains challenging even for the strongest models. Claude Opus 5.5 achieves the highest PFA (64.0%). Fable 5.1 achieves the highest FRA (81.8%) and CFA (91.9%).

<figure class="taxlab-figure">
  <img src="/files/images/benchmarks/taxlab/results-table.png" alt="Results table for nine models with accuracy and efficiency metrics">
  <figcaption>Tax-filing agent evaluation results, ranked by PFA.</figcaption>
</figure>

Each anchor field is linked to the tax issue and rules that produce it. This lets us diagnose *where* errors surface. Stronger models concentrate their remaining errors in a few issues. For example, Claude Opus 5.5 reaches 5.2× its average error rate on the medical and dental deduction. Weaker models fail more broadly. Access to IRS documents also helps: it improves GPT-6 Astra's PFA by 7.3 percentage points.

<figure class="taxlab-figure">
  <img src="/files/images/benchmarks/taxlab/issue-heatmap.png" alt="Heatmap of issue-level error rates per model relative to each model's average">
  <figcaption>Issue-level error diagnosis across models, normalized by each model's average.</figcaption>
</figure>

## Release status

The benchmark is complete, and the paper is under review. The benchmark and evaluation environment will be released as open source once final data cleanup is complete. The release will include the cases, gold returns, tax-return templates and scoring scripts.
