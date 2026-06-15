---
title: "LakeAgent"
subtitle: "Deep Research over Data Lakes"
date: 2025-11-01
authors:
  - name: "Haonan Wang*"
  - name: "Jiaxiang Liu*"
  - name: "Yurong Liu"
  - name: "Austin Senna Wijaya"
  - name: "Tianle Zhou"
  - name: "Eden Wu"
  - name: "Yijia Chen"
  - name: "Wanting You"
  - name: "Reya Vir"
  - name: "Daniela Pinto Veizaga"
  - name: "Grace Fan"
  - name: "Yusen Zhang"
  - name: "Juliana Freire"
  - name: "Eugene Wu"
avatar: image.png
tags:
  - "Agents"
is_project: true
is_software: true
links:
  github: "https://github.com/lakeagent/datalake-qa"
  leaderboard: "https://lakeqa-bench.github.io/"
publications:
  - title: "SANA: What Matters for QA Agents over Massive Data Lakes?"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2606.13904"
    year: 2026
  - title: "LakeQA: An Exploratory QA Benchmark over a Million-Scale Data Lake"
    venue: "ICML"
    url: "https://arxiv.org/pdf/2606.10460v1"
    year: 2026
  - title: "Suna: Scalable Causal Confounder Discovery over Relational Data"
    venue: "VLDB"
    url: "https://www.vldb.org/pvldb/vol18/p4158-liu.pdf"
    year: 2025
  - title: "DynoClass: A Dynamic Table-Class Detection System Without the Need for Predefined Ontologies"
    venue: "TRL@NeurIPS"
    url: "https://openreview.net/pdf?id=r45TbawHl8"
    year: 2024
---

One of the most exciting LLM applications has been deep research agents that search web and unstructured information to synthesize answers. Unfortunately, current deep research agents ignore the abundant tabular datasets in public and enterprise data lakes, leaving them unable to answer analytic questions requiring enumeration, aggregation, or causal reasoning. We propose LakeAgent, a system that builds the missing infrastructure for deep-research agents to operate over terabytes of structured and unstructured data. Given a natural language question, the system automatically discovers relevant datasets, integrates heterogeneous sources, and produces verifiable answers with explicit provenance. For instance, estimating “How likely is Magnus Carlsen to win the next world championship cycle?” requires structured data (match histories, opponent pools) and unstructured data (participation intent, interviews).