---
title: "DAGR"
subtitle: "Diversity Helps Jailbreak Large Language Models"
date: 2026-06-11
authors:
  - name: "Weiliang Zhao*"
  - name: "Daniel Ben-Levi*"
  - name: "Wei Hao"
  - name: "Junfeng Yang"
    url: "https://www.cs.columbia.edu/~junfeng/"
  - name: "Chengzhi Mao"
avatar: dagr.png
tags:
  - "LLM Safety"
  - "Jailbreaking"
  - "Red Teaming"
publications:
  - title: "Diversity Helps Jailbreak Large Language Models"
    venue: "NAACL 2025"
    url: "https://arxiv.org/abs/2411.04223"
    year: 2025
---

## Description

We have uncovered a powerful jailbreak technique that leverages large language models' ability to diverge from prior context, enabling them to bypass safety constraints and generate harmful outputs. By simply instructing the LLM to deviate and obfuscate previous attacks, our method dramatically outperforms existing approaches, achieving up to a 62.83% higher success rate in compromising ten leading chatbots, including GPT-4, Gemini, and Llama, while using only 12.9% of the queries. This revelation exposes a critical flaw in current LLM safety training, suggesting that existing methods may merely mask vulnerabilities rather than eliminate them. Our findings sound an urgent alarm for the need to revolutionize testing methodologies to ensure robust and reliable LLM security.

DAGR cycles through four key steps until it either successfully jailbreaks the target model or exceeds a maximum search depth: (1) an attacker LLM armed with diversification attack strategies generates a novel adversarial prompt that is significantly different from prior attempts; (2) an on-topic evaluator regenerates the prompt until it relates to the goal, then the prompt is used to query the target model and scored for jailbreak success; (3) if unsuccessful, the diversified prompt is stored in memory and adjacent obfuscated prompts are generated to explore the local space; (4) these prompts are sent to the target model and evaluated, and the cycle continues.
