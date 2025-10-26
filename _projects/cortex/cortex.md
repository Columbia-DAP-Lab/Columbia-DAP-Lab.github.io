---
title: "Cortex"  # Project Title You want to show on the index page
subtitle: "Workflow-Aware Resource Pooling and Scheduling for Agentic Serving"
date: 2025-10-13
authors:
  - name: "Nikos Pagonas"
  - name: "Yeounoh Chung"
  - name: "Kostis Kaffes"
  - name: "Arvind Krishnamurthy"
avatar: cortex.png  # Optional, if wanted, put the image file in the same directory
tags: 
  - "Workflow-awareness"
  - "Agentic orchestration"
  - "Stage isolation"
links:  # Optional, but if needed, only these 4 keys are allowed for now
publications:  # Optional, can list multiple publications
  - title: "Cortex: Workflow-Aware Resource Pooling and Scheduling for Agentic Serving"
    venue: "1st Workshop on Systems for Agentic AI (SAA 2025)"
    url: "https://saa2025.github.io/papers/Cortex%20-%20Workflow-Aware%20Resource%20Pooling%20and%20Scheduling%20for%20Agentic%20Serving.pdf"
    year: 2025
---

Cortex is a prototype workflow-aware serving platform designed for agentic workloads. The core principle of Cortex is stage isolation: it provisions dedicated resource pools for each distinct stage of an agentic workflow. This simple yet powerful strategy mitigates inter-stage interference in compute and memory, leading to better KV cache utilization, higher throughput, and more predictable performance. By customizing resource allocation and scheduling within each distinct stage of agentic workflows, Cortex lays the groundwork for more advanced, agent-native serving paradigms, including malleable resource management, speculative execution of workflow branches, and a shared, multi-tiered cache for "agentic state."
