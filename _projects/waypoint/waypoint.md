---
title: "Waypoint"
subtitle: "Fast checkpoint/restore for branchable terminal environments."
date: 2026-06-01
authors:
  - name: "Jiakai Xu"
    url:  "https://alex-xjk.github.io/"
  - name: "Tianle Zhou"
    url:  "https://dale1213.github.io/minimal-mistakes/"
  - name: "Danielle Gillai"
  - name: "Ruizhe Fu"
    url:  "https://frzno1.github.io/"
  - name: "Georgios Liargkovas"
    url:  "https://liargkovas.com/"
  - name: "Patrick Shen"
  - name: "Kostis Kaffes"
    url:  "https://www.cs.columbia.edu/~kkaffes/"
  - name: "Eugene Wu"
    url:  "https://www.cs.columbia.edu/~ewu/"
avatar: waypoint-project-logo.png
tags:
  - "Checkpoint"
  - "Systems"
  - "AI"
is_project: true
is_software: true
links:
  github: "https://github.com/Alex-XJK/waypoint"
  blog: "https://daplab.cs.columbia.edu/general/2026/06/04/statefork-give-agents-a-rewind-button.html"
publications:
  - title: "Toward Systems Foundations for Agentic Exploration"
    venue: "Systems for Agentic AI Workshop at SOSP'25"
    url: "https://arxiv.org/abs/2510.05556"
    year: 2025
---

`Waypoint`, formerly `Checkpoint-lite`, is a lightweight checkpoint/restore system for stateful terminal-based workloads. It lets users and AI agents save a live execution session, explore alternative actions, and restore previous states without rebuilding the environment or replaying the full command history.

`Waypoint` is designed for agentic computer-use tasks where the important state is not only in files. A useful branch point may also include running processes, in-memory state, shell context, background jobs, activated environments, and terminal-session state. `Waypoint` captures this broader execution state while remaining much lighter-weight than full virtual-machine snapshots.

## Key Features

* **Session-level checkpointing.** `Waypoint` checkpoints the live terminal environment, including filesystem changes, process state, memory state, and persistent shell/session context.

* **Fast branching and rollback.** Users can create named checkpoints, try alternative execution paths, and restore earlier states quickly.

* **Agent-ready interface.** `Waypoint` can be used directly through its CLI or as a backend for [StateFork, our abstraction for branchable agent environments](https://github.com/Alex-XJK/StateFork).

* **Lightweight design.** `Waypoint` combines OverlayFS-based filesystem deltas with CRIU-based process checkpointing, avoiding the cost of full VM snapshots while preserving more state than filesystem-only approaches.

* **Research-oriented extensibility.** The system is designed to support experiments with search-based agents, rollback-driven debugging, benchmark evaluation, and alternative checkpoint/restore backends.

## Why Waypoint?

Many existing mechanisms preserve only part of what an agent needs. Filesystem snapshots capture modified files but miss running services, shell state, and process memory. Containers are optimized for packaging and deployment, not repeated fine-grained branching inside a live task. VM snapshots are more complete, but often too heavyweight for frequent exploration.

`Waypoint` targets the middle ground: fast, faithful checkpoint/restore at the terminal-session boundary. This makes it practical to branch from meaningful intermediate states, rather than restarting each attempt from scratch.

In our agent-exploration experiments, `Waypoint` reaches Pass@20-level performance in under 10 minutes and ultimately exceeds repeated independent runs by enabling tree-structured exploration from saved intermediate states.

## Relationship to StateFork

`Waypoint` is the fast local checkpoint/restore backend used by StateFork. StateFork provides a common interface for building environments, executing commands, taking snapshots, restoring states, and cleaning up resources across different backends. `Waypoint` provides the specialized backend for efficient local terminal-session branching.
