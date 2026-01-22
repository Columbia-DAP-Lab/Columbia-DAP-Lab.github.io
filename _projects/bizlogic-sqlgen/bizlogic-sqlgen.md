---
title: "BusinessLogic-Text2SQL-Synthesis"
subtitle: "Business Logic-Driven Text-to-SQL Data Synthesis for Business Intelligence"
date: 2026-01-20
authors:
  - name: "Jinhui Liu"
  - name: "Ximeng Zhang"
  - name: "Yanbo Ai"
  - name: "Zhou Yu"
avatar: BIGEN_framework.png
tags:
  - "Business Intelligence"
  - "Text-to-SQL"
  - "Agent Evaluation"
  - "Data Synthesis"
publications:
  - title: "Business Logic-Driven Text-to-SQL Data Synthesis for Business Intelligence"
    venue: "Under Submission"
    url: "https://arxiv.org/abs/2601.14518"
    year: 2026
---

## Description
Evaluating Text-to-SQL agents in private business intelligence (BI) settings is challenging due to the scarcity of realistic, domain-specific data. While synthetic evaluation data offers a scalable solution, existing generation methods fail to capture business realism--whether questions reflect realistic business logic and workflows. We propose a Business Logic-Driven Data Synthesis framework that generates data grounded in business personas, work scenarios, and workflows. In addition, we improve the data quality by imposing a business reasoning complexity control strategy that diversifies the analytical reasoning steps required to answer the questions. Experiments on a production-scale Salesforce database show that our synthesized data achieves high business realism (98.44%), substantially outperforming OmniSQL (+19.5%) and SQL-Factory (+54.7%), while maintaining strong question-SQL alignment (98.59%). Our synthetic data also reveals that state-of-the-art Text-to-SQL models still have significant performance gaps, achieving only 42.86% execution accuracy on the most complex business queries.