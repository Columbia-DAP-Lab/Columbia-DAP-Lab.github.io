---
layout: post
color: '#6e9857ff'
title: "Vibe Coding Needs Policy Enforcement"
date: 2026-01-10
categories: [general]
tags: [test]
authors:
  - name: "Jenny Ma"
    url: "https://jennygzma.github.io/"
excerpt: "Why vibe-coding agents need policy enforcement to behave reliably, with practical enforcement patterns."
slug: "vibe-coding-needs-policy-enforcement"
---

As [Reya’s post]({% link _posts/2026-01-07-why-vibe-coding-fails-and-how-to-fix-it.md %}) post showed, building applications isn’t just about producing outputs that look correct — it’s about enforcing policies. Modern coding agents can generate code that runs, and features that appear complete, while silently violating critical constraints. These violations are hard to see, but they’re exactly what lead to fragile systems, hidden bugs, and endless vibe-debugging. The problem isn’t that agents don’t know what to do – it’s that the rules they’re given are not binding. To make agents behave, we need systems that treat policies as first-class. This boils down to a simple pattern:

<p class="post-subtitle">Propose → Extract → Enforce.</p>

Agents can propose plans and solutions, but they must also extract the relevant policies — execution steps, coding conventions, clarification requirements — and enforce them for the agent to actually align with user intent. 

## The 4 Agent Behaviors that Cause Vibe-Coding Failures

Reya’s post surveys vibe-coding failures across many agents. Here, I focus on Cline (powered by Claude Sonnet 4-5), a vibe-coding tool I'm very familiar with, as a concrete case. I isolated 4 recurring agent behaviors behind most vibe-coding failures: 

![problem behaviors]({{ site.baseurl }}/files/images/blog/2026-1-10-vibe-coding-needs-policy-enforcement/teaser.png)
Here, I visualize a Cline interaction and highlight specific sequences where the agent deviates from intended behavior—skipping steps, ignoring conventions and style, making incorrect assumptions, or optimizing locally.

- **Skipping steps**: The agent confidently says it will do something (“I’ll build the backend and the frontend!”) and then it will only build half. It claims it followed its own plan but quietly skips steps and forgets entire chunks of functionality; the policy exists implicitly, but isn’t enforced.
- **Ignoring conventions and style**: Even with clear patterns in my codebase — and even with explicit rules — the AI can still go rogue. It adds docstrings when I never use them, rearranges my file structures, overengineers components, and generally doesn’t always code the way I code. The proper policies aren’t extracted and enforced.
