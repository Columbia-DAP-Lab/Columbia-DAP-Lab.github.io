---
title: "checkpoint-lite"
subtitle: "A minimal checkpoint/restore tool using CRIU and OverlayFS for fast process state management."
date: 2025-08-03
authors:
  - name: "Alex Jiakai Xu"
  - name: "Tianle Zhou"
  - name: "Eugene Wu"
  - name: "Kostis Kaffes"
avatar: ckpt-icon.png
tags:
  - "Checkpoint"
  - "Systems"
  - "AI"
links:
  github: "https://github.com/Alex-XJK/checkpoint-lite"
publications:
  - title: "Toward Systems Foundations for Agentic Exploration"
    venue: "Systems for Agentic AI Workshop at SOSP'25"
    url: "https://arxiv.org/abs/2510.05556"
    year: 2025
---

`checkpoint-lite` provides a simple interface to checkpoint and restore running processes while capturing both their memory state and filesystem changes. Unlike heavyweight container solutions, this tool focuses on minimal overhead by directly orchestrating existing kernel features.

### Key Features
- **Hybrid State Capture**: Combines filesystem (OverlayFS) and memory (CRIU) checkpointing
- **Multi-Session Support**: Concurrent usage by multiple applications with isolated sessions
- **Minimal Overhead**: Direct system calls without unnecessary container abstractions
- **Simple CLI**: Straightforward command-line interface for checkpoint operations
- **Session Management**: Automatic cleanup and resource management