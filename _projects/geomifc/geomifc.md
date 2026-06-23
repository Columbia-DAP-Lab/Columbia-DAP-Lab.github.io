---
title: "Information Flow Control"
subtitle: "GIF: Locally sound geometric IFC for LLM agents"
date: 2026-02-15
authors:
  - name: "Adam Storek"
  - name: "Nikolaus Holzer"
  - name: "Zhuo Zhang"
  - name: "Suman Jana"
avatar: geomifc.png
is_project: true
tags:
  - "Agents"
  - "Security"
  - "Privacy"
  - "Information Flow Control"
links:
  website: "https://geomifc.github.io/"
publications:
  - title: "GIF: Locally Sound Geometric Information Flow Control for LLMs"
    venue: "arXiv"
    url: "https://arxiv.org/abs/2606.23277"
    year: 2026
---

<style>
/* Wide motivation figure — render it a bit larger on this page only */
.project-avatar-large { max-width: 820px; }
</style>

Large language models increasingly sit between sensitive data, untrusted inputs, and privileged actions in agentic systems, creating security and privacy risks that range from prompt injection manipulating downstream tool use to the leakage of confidential information through model outputs. Information Flow Control (IFC) offers a principled defense, but because any input token can influence any output token in an autoregressive LLM, coarse trusted/untrusted labels suffer from severe taint explosion. **Geometric Information Flow (GIF)** is a quantitative semantics that measures how strongly a span of input tokens actually influences a downstream output, tool argument, or memory update. GIF uses the LLM Jacobian and local output geometry to upper-bound the Shannon mutual information between perturbed input spans and model outputs, yielding a scalable measure computable on large models via automatic differentiation and low-rank approximation — backed by a fully mechanized Lean 4 proof of local geometric soundness. Across prompt-injection and privacy-leakage benchmarks, GIF achieves near-perfect recall even without a downstream declassifier, and when paired with lightweight LLM declassifiers it matches or exceeds GPT-5.5 (xhigh reasoning) LLM-as-judge baselines at up to 81× lower token cost. GIF flows estimated on small surrogate models even transfer to models up to 200× larger and to other model families, suggesting the possibility of black-box deployment without gradient access.
