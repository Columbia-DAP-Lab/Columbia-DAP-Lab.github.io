---
title: Twin-2K-500
status: Released
domain: Digital twin fidelity
tagline: A large dataset for building and evaluating digital twins based on the responses of real people.
updated: 2025
stats:
  - value: "2,000+"
    label: Participants
  - value: "500+"
    label: Questions
  - value: "19"
    label: Evaluation domains
evaluation_unit: A digital twin's prediction of an individual's response
verification: Comparison with held-out human responses
availability: Dataset and publications available
languages: Human survey responses and persona context
resources:
  - label: Project
    url: /projects/digitaltwins/
  - label: Paper
    url: https://pubsonline.informs.org/doi/10.1287/mksc.2025.0262
    external: true
---

## Background

Digital twins aim to simulate the behavior and preferences of specific people. Twin-2K-500 supports large-scale study of when these simulations preserve genuine individual variation and when they collapse toward stereotypes or population averages.

## What it evaluates

- Individual-level response prediction
- Relative heterogeneity across people
- Fidelity across different subject domains
- Bias introduced by richer persona descriptions

## Dataset

The dataset contains responses from more than 2,000 people to more than 500 questions. Follow-on evaluation spans 19 domains.

## Evaluation methodology

A model receives persona information and predicts held-out responses for the corresponding participant. Analysis compares aggregate accuracy with the more demanding goal of preserving individual-level behavior and variation.

## Representative task

> Given a participant’s available background and prior responses, predict how that same participant will answer a held-out question.

## Results

Published findings show that digital twins can capture relative heterogeneity but still struggle with precise individual prediction and systematic persona-induced bias.
