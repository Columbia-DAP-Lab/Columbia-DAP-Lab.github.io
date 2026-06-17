---
title: "Orchard"
subtitle: "Open-Source Agentic Modeling Framework"
date: 2026-05-01
authors:
  - name: "Baolin Peng"
  - name: "Wenlin Yao"
  - name: "Qianhui Wu"
  - name: "Hao Cheng"
  - name: "Xiao Yu"
  - name: "Ruiyi Yang"
  - name: "Tao Ge"
  - name: "Alessandro Sordoni"
  - name: "Xingdi Yuan"
  - name: "Yelong Shen"
  - name: "Pengcheng He"
  - name: "Tong Zhang"
  - name: "Zhou Yu"
    url: "https://www.cs.columbia.edu/~zhouyu/"
  - name: "Jianfeng Gao"
tags:
  - Agents
  - Training
  - Framework
is_project: true
is_software: true
links:
  github: "https://github.com/microsoft/Orchard"
  paper: "https://www.microsoft.com/en-us/research/publication/orchard-an-open-source-agentic-modeling-framework/"
publications:
  - title: "Orchard: An Open-Source Agentic Modeling Framework"
    venue: "arXiv"
    url: "https://www.microsoft.com/en-us/research/publication/orchard-an-open-source-agentic-modeling-framework/"
    year: 2026
---

Orchard is an open-source framework for training LLM-based agents across diverse task domains. It provides reusable agentic data, training recipes, and evaluations — covering coding, GUI navigation, and personal assistant tasks — through a harness-agnostic design that separates environment management from training logic.

Orchard Env provides lightweight sandbox lifecycle management. Three specialized recipes demonstrate the framework's reach:

- **Orchard-SWE** (coding agents): 67.5% on SWE-bench Verified with Qwen3-30B via SFT+RL
- **Orchard-GUI** (vision-language agents): 74.1% on WebVoyager with a 4B model
- **Orchard-Claw** (personal assistants): 73.9% pass@3 on Claw-Eval
