---
layout: post
color: '#0c6a99'
title: "Columbia DAPLab at SOSP 2025"
date: 2025-10-13
categories: [general]
tags: [test]
---

<style>
  h3 {
    margin-top: 2em;
    font-family: "Raleway";
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 2px;
}
</style>


This October, the Data, Agents, and Processes Lab (DAPLab) at Columbia University will present a slate of new research at SOSP workshops, spanning agentic infrastructure and self-tuning kernels. Our work lays the foundation for a future agentic infrastructure that will enable the safe, reliable and efficient operation of LLM agents in real-world environments. Highlights below.


### ACM SIGOPS Strategic Workshop

**Towards Trustworthy AI Systems**  
Junfeng Yang

As AI models are increasingly deployed in critical applications, they often behave unpredictably on rare or unforeseen inputs. Traditional evaluation methods—like reporting overall test accuracy—miss these edge cases and obscure hidden failure modes. In this talk, I’ll argue that we must treat AI systems with the same rigor as traditional software, supporting their full lifecycle: testing, verification, repair, monitoring, and adaptation. Since AI models encode logic in millions of opaque parameters rather than explicit code, our tools and methodologies must be fundamentally reimagined. I’ll share insights from our work on developing such tools and highlight key challenges emerging at the intersection of systems, software engineering, and machine learning.

### PACMI Workshop

**[Set It and Forget It: Zero-Mod ML Magic for Linux Tuning](https://liargkovas.com/assets/pdf/Liargkovas_PACMI_25.pdf)**   
Georgios Liargkovas, Prabhpreet Singh Sodhi, Kostis Kaffes

Machine learning has long promised smarter operating systems—but most proposals require heavy instrumentation or radical kernel rewrites. This work proposes a pragmatic alternative: a zero-modification ML tuning framework that learns how to optimize Linux using only the system signals it already has. By reframing the problem from predicting absolute performance to learning relative rankings of configurations, the system avoids the brittleness of traditional ML approaches and generalizes across diverse workloads. The approach delivers robust, AI-driven OS optimizations without touching applications or breaking isolation.


### SAA Workshop

**[Toward Systems Foundations for Agentic Exploration](https://arxiv.org/abs/2510.05556)**  
Jiakai (Alex) Xu, Tianle Zhou, Eugene Wu, Kostis Kaffes


Digital environments are messy and stateful: every agent action perturbs hidden processes, files, and I/O, making single-shot execution brittle. Achieving high accuracy therefore requires exploration—trying alternatives, backtracking, and reusing partial progress. But exploration is only practical if agents can reliably roll environments forward and back, which in turn depends on fast, faithful state/restore primitives.

We show a fundamental trade-off: lightweight mechanisms are efficient but lose volatile state, while high-fidelity restores preserve consistency at substantial latency cost. To bridge this gap, we design a lean restoration tool that removes unnecessary bloat to accelerate snapshot/restore without sacrificing essential fidelity. Our results point to a simple conclusion: scaling agent exploration beyond benchmarks and into real deployments will require native, fork-like primitives that let agents branch, isolate, and rejoin execution cheaply and consistently.


**[Cortex: Workflow-Aware Resource Pooling and Scheduling for Agentic Serving](https://saa2025.github.io/papers/saa25-final5.pdf)**   
Nikos Pagonas, Yeounoh Chung, Kostis Kaffes 

In collaboration with Google, we introduce Cortex, a prototype workflow-aware serving platform designed for agentic workloads. The core principle of Cortex is stage isolation: it provisions dedicated resource pools for each distinct stage of an agentic workflow.
This simple yet powerful strategy mitigates inter-stage interference in compute and memory, leading to better KV cache utilization, higher throughput, and more predictable performance. By customizing resource allocation and scheduling within each distinct stage of agentic workflows, Cortex lays the groundwork for more advanced, agent-native serving paradigms, including malleable resource management, speculative execution of workflow branches, and a shared, multi-tiered cache for agentic state.

