---
title: "SAGE"
subtitle: "A Top-Down Bottom-Up Knowledge-Grounded User Simulator for Multi-turn AGent Evaluation"
date: 2025-10-06
authors:
  - name: "Ryan Shea*"
  - name: "Yunan Lu*"
  - name: "Liang Qiu"
  - name: "Zhou Yu"
avatar: sage.png
tags:
  - "User Simulator"
  - "Agent Evaluation"
publications:
  - title: "SAGE: A Top-Down Bottom-Up Knowledge-Grounded User Simulator for Multi-turn AGent Evaluation"
    venue: "Under Submission"
    url: "https://arxiv.org/abs/2510.11997"
    year: 2025
---

## Description
Evaluating multi-turn interactive agents is challenging due to the need for human assessment. Evaluation with simulated users has been introduced as an alternative, however existing approaches typically model generic users and overlook the domain-specific principles required to capture realistic behavior. We propose SAGE, a novel user Simulation framework for multi-turn AGent Evaluation that integrates knowledge from business contexts. SAGE incorporates top-down knowledge rooted in business logic, such as ideal customer profiles, grounding user behavior in realistic customer personas. We further integrate bottom-up knowledge taken from business agent infrastructure (e.g., product catalogs, FAQs, and knowledge bases), allowing the simulator to generate interactions that reflect users' information needs and expectations in a company's target market. Through empirical evaluation, we find that this approach produces interactions that are more realistic and diverse, while also identifying up to 33% more agent errors, highlighting its effectiveness as an evaluation tool to support bug-finding and iterative agent improvement.