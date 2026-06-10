---
title: "Data Flow Control"
subtitle: "Empowering agents by controlling data flow"
date: 2025-08-05
authors:
  - name: "Charlie Summers"
  - name: "Eric Choi"
  - name: "Aayush Srivastava"
  - name: "Eugene Wu"
avatar: data-flow-control.png
tags:
  - "Agents"
  - "Governance"
  - "Privacy"
  - "Security"
is_project: true
is_software: true
links:
  github: "https://github.com/dataflowcontrol/data-flow-control"
  website: "https://dataflowcontrol.github.io/data-flow-control/"
publications:
  - title: "Data Flow Control: Data Safety Policies for AI Agents"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2606.05679"
    year: 2026
  - title: "Please Don't Kill My Vibe: Empowering Agents with Data Flow Control"
    venue: "CIDR"
    url: "https://arxiv.org/abs/2512.05374"
    year: 2026
---

The promise of Large Language Model (LLM) agents is to perform complex, stateful tasks. This promise is stunted by significant risks -— policy violations, process corruption, and prompt injection -— that stem from the lack of visibility and mechanisms to manage undesirable data flows produced by agent actions. Today, agent workflows are responsible for enforcing these policies in ad hoc ways. Just as data validation and access controls shifted from the application to the DBMS, freeing application developers from these concerns, we argue that systems should support Data Flow Controls (DFCs) and enforce DFC policies natively.