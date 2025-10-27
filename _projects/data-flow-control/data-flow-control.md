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
---

The promise of Large Language Model (LLM) agents is to perform complex, stateful tasks. This promise is stunted by significant risks -— policy violations, process corruption, and prompt injection -— that stem from the lack of visibility and mechanisms to manage undesirable data flows produced by agent actions. Today, agent workflows are responsible for enforcing these policies in ad hoc ways. Just as data validation and access controls shifted from the application to the DBMS, freeing application developers from these concerns, we argue that systems should support Data Flow Controls (DFCs) and enforce DFC policies natively.