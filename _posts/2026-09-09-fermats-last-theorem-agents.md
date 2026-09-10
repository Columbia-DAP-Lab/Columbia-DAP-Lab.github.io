---
layout: post
title: "Fermat's Last Theorem, Formalized by AI Agents"
date: 2026-09-09
categories: [general]
authors:
  - name: "Eugene Wu"
    url: "https://www.cs.columbia.edu/~ewu/"
excerpt: "DAPLab's Tianyi Peng and Shuze Chen, together with Henry Yuen and Kunal Marwaha, built the platform that enabled Claude to produce the first computer-verified proof of Fermat's Last Theorem."
slug: "fermats-last-theorem-agents"
---

We are excited to share that DAPLab's **Tianyi Peng** and **Shuze Chen**, together with **Henry Yuen** and **Kunal Marwaha**, built [Prove2Me](https://beta.prove2.me/) — the platform that made it possible for Claude to produce the first computer-verified proof of Fermat's Last Theorem. [Anthropic published the full account.](https://www.anthropic.com/research/formalizing-fermats-last-theorem)

The proof took 11 days, required proving 29,500 intermediate theorems, and produced 13 million lines of Lean 4 code — more than five times the size of Mathlib, the primary Lean proof library.

## What Prove2Me Does

A simple but key idea in Prove2Me is a unified tree of mathematical statements linked by Lean proofs. Formalization projects are organized as "missions" — structured proof obligations that humans and AI agents can tackle in parallel. The platform tracks theorem dependencies, optimizes Lean compilation, and supports natural-language search so contributors can find and reuse existing results rather than reprove them.

Without it, early attempts at the Fermat formalization failed. A proof of this scale is too large and interconnected for any single agent: without a shared dependency graph and coordination layer, agents lost state and duplicated work. Prove2Me gave the agents the environment they needed to compose their contributions into a complete proof.

## Why It Matters

Kevin Buzzard of Imperial College London, who reviewed the proof, noted that the project opens the door to "automatic formalization of the modern mathematical literature" — with implications for peer review and for verifying AI-generated mathematical results.

More broadly, Prove2Me is a demonstration of what structured agent infrastructure can unlock. The Fermat result is not just a milestone for AI in mathematics — it is evidence that the environments agents work in matter as much as the models themselves. Prove2Me is now open, with 186 missions spanning number theory, algebraic topology, combinatorics, and more.

We are so proud of what [Tianyi](https://tianyipeng.github.io/), [Shuze](https://shuzechen.github.io/), [Henry](https://www.henryyuen.net/), and [Kunal](https://kunalmarwaha.com/) and the Prove2Me community have built.

---

*Try it at [beta.prove2.me](https://beta.prove2.me/). The [paper](https://arxiv.org/abs/2608.28433) is on arXiv.*
