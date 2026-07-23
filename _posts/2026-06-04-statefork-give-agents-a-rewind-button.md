---
layout: post
title: "StateFork: Give Agents a Rewind Button"
date: 2026-06-04
categories: [general]
authors:
  - name: "Alex Jiakai Xu"
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
excerpt: "Agents need to branch mid-task across the full environment—not just the database. We're releasing StateFork and Waypoint to make that possible."
slug: "statefork-give-agents-a-rewind-button"
---

<style>
  .post-body .highlight {
    background: #0d1117;
    border-radius: 8px;
    margin: 1.5rem 0;
    border: 1px solid #30363d;
    overflow: hidden;
  }
  .post-body .highlight pre {
    background: transparent;
    padding: 1.25rem 1.5rem;
    margin: 0;
    overflow-x: auto;
    color: #e6edf3;
    font-size: 0.875rem;
    line-height: 1.65;
  }
  .post-body code {
    font-family: ui-monospace, 'Cascadia Code', 'Fira Code', Consolas, monospace;
  }
  /* inline code */
  .post-body p code, .post-body li code {
    background: #f0f3f6;
    color: #0550ae;
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.875em;
  }
</style>

*This is the third post in our series on [Agentic Data Environments]({{ '/general/2026/05/21/the-need-for-agentic-data-environments.html' | relative_url }}).*

In the [previous post]({{ '/general/2026/05/26/branchable-databases-arent-ready-for-agentic-workloads.html' | relative_url }}), we looked at branchable databases: systems that let an agent try risky database operations on a branch before touching mainline state. While necessary, it is not sufficient for computer-use, web, and automation agents. Even a data agent goes beyond the database when it installs packages, edits files, runs terminal commands, launches processes, and caches intermediate results — all of this accumulates changes to the environment's local state. After a few steps, the state has expanded beyond database tables and into the broader computing environment.

To address this, we are releasing two open-source systems that make general computer-use environments branchable and restorable quickly and scalably:

- **[StateFork](https://github.com/Alex-XJK/StateFork)** — a common abstraction for branchable computer-use environments
- **[Waypoint](https://github.com/Alex-XJK/waypoint)** — a fast OS backend for StateFork

The rest of this post describes the problem, both systems, and how we are using them to support safe and fast agent exploration.

<div style="background:linear-gradient(135deg,#f0f4ff 0%,#e8eef8 100%);border:1px solid #c5d0e8;border-radius:10px;padding:1.5rem 2rem;margin:1.75rem 0;text-align:center;">
  <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#012169;margin-bottom:0.6rem;">Open Source Release</div>
  <p style="margin:0 0 1.1rem;font-size:1.05rem;color:#222;font-weight:500;">StateFork and Waypoint are open-sourced. Want to use them, integrate them into your agent framework, or collaborate?</p>
  <a href="mailto:ax2155@columbia.edu" style="display:inline-block;background:#012169;color:white;padding:0.5rem 1.4rem;border-radius:5px;text-decoration:none;font-weight:600;font-size:0.9rem;">Reach out at ax2155@columbia.edu →</a>
</div>

## The Problem: Agents Need to Branch Mid-Task

Imagine an agent debugging a broken web application in a live development environment. It has cloned the repository, installed dependencies, launched the backend and frontend servers, authenticated to a staging service, reproduced the bug in a browser, and opened a terminal with logs streaming from several processes.

Now it wants to try several fixes:

- upgrade a dependency and migrate its configuration,
- modify backend code and restart the service,
- change frontend state handling and replay the browser interaction.

{% include blog-image.html file="exploration.png" alt="Agent exploration: states s1… with actions (upgrade, migrate, change frontend, replay) branching from an intermediate state, with the accepted final state marked with a checkmark" %}

This is where branching is useful. The agent has reached a valuable intermediate state where the bug is reproduced, services are warm, credentials and browser state are established, and logs and caches already contain useful context. Each attempted fix goes beyond changing files — it may replace installed packages, restart processes, rewrite configuration, mutate local databases, change browser state, or alter generated artifacts.

The branch point is a slice of the entire system state. This includes database state, filesystem changes, shell context, process memory, temporary files, configurations, caches, and tool state.

## StateFork: A Common Interface for Branchable Environments

StateFork is the interface layer for branchable agent environments. It gives developers and agent frameworks a common way to create an environment, execute commands, take snapshots, restore old states, and measure time and storage overheads.

With StateFork, the same agent can seamlessly run on Docker, Podman, CRIU, Podman+CRIU, Firecracker MicroVM, gVisor, or our new branchable backend Waypoint. The agent does not need to know whether the backend is a container, a VM, or a fast local branching system. The developer chooses a backend, and StateFork provides the same build, execute, snapshot, and restore primitives.

Conceptually, an agent loop looks like this:

```python
# Build a managed environment from a Dockerfile
env = create_env_manager(method="ckpt_build", dockerfile_dir="./task")

# Run commands inside the managed session
env.exec_command("conda activate myenv")
env.exec_command("python prepare_data.py")
env.exec_command("export MODE=debug")

# Try a path and restore
id = env.snapshot()
score_a = env.exec_command("python try_fix_a.py")
env.restore(id)

# Try another path
score_b = env.exec_command("python try_fix_b.py")
```

StateFork can be used directly by an agent, but it is also designed for agent frameworks. A framework can integrate StateFork once and then provide branching as a runtime capability to any agent it runs. This supports common execution patterns such as retrying failed steps from a clean state, exploring several candidate fixes, running speculative branches, preserving the best branch, and producing reproducible traces for evaluation.

This separation keeps the stack modular. Agent logic, framework orchestration, and checkpointing backends can evolve independently while sharing the same StateFork interface. It also makes backend comparisons cleaner: the same agent workload can run against different checkpoint/restore mechanisms without rewriting the agent.

## Why a New Branchable Backend for Agent Exploration?

Containers and VMs are the wrong abstractions for agent exploration.

Container runtimes such as Docker and Podman are optimized for packaging, reproducibility, isolation, and cross-machine portability. That is the right abstraction when the goal is to build an image, move it to another host, and run the same software there. It is not the right abstraction when the goal is to branch repeatedly inside one live task on one host. A container commit can preserve source edits, installed packages, generated artifacts, and configuration files, but it drops volatile state such as the active shell context, running services, background jobs, sockets, and terminal-backed behavior.

VM snapshots sit on the other side of the tradeoff. They can capture a much broader state because the whole guest machine is the unit of snapshotting. But for fine-grained agent exploration, the VM boundary is too heavy. Full OS isolation means preserving and managing a guest kernel, device model, memory image, and storage layer even when the agent only needs the task-facing execution session. The result is a coarser abstraction, larger state, slower branching, and more overhead than speculative local branches should pay.

The lack of a suitable backend is why the majority of sandboxing frameworks primarily support Pass@K-style agent execution, where the agent starts from a clean image, executes a trajectory to completion, and repeats K times — without being able to leverage information from intermediate states.

## Waypoint: The Fast Local Backend

Waypoint is the backend we developed for fine-grained local branching. It turns a task environment into a live session that can be checkpointed, restored, and explored repeatedly.

Waypoint is optimized for short-lived branches where the agent reaches an intermediate state, saves it, tries one path, rolls back, and tries another. Rather than restarting from a clean image for every attempt, the agent can continue from the state it has already built up.

This matters because useful task state accumulates across commands. During a terminal-based task, the agent may edit source files, generate artifacts, install dependencies, activate a virtual environment, export variables, start background processes, or leave services running. Waypoint captures this combination of filesystem, process, and shell/session state so the branch point reflects the actual working session.

Users can access Waypoint through the StateFork API, or use the Waypoint CLI directly for a branchable terminal session:

```bash
waypoint build ./task
waypoint exec <session> "python prepare_data.py"
waypoint snapshot <session> after_setup
waypoint exec <session> "python try_fix_a.py"
waypoint restore <session> after_setup
waypoint exec <session> "python try_fix_b.py"
```

Under the hood, Waypoint combines filesystem delta tracking, process checkpointing, and a persistent shell/PTY session. Most users do not need to think about these mechanisms. The important part is that the environment becomes a live, branchable workspace for exploring alternatives, recovering from mistakes, and preserving the branch that works.

## Preserving the Terminal Matters — And It's Hard

While variations of existing techniques, such as overlay filesystems and CRIU, could handle filesystem and memory snapshots, one thing we underestimated early on was how important the terminal is.

Many agents operate through iterative shell command loops, where later commands depend on prior shell context: current directories, exported variables, activated environments, and background jobs. Keeping that context alive across checkpoints is harder than it sounds. Interactive shells depend on attached TTY/PTY devices, so checkpointing the shell process alone is not enough; the terminal session it is attached to must also survive restoration correctly.

This is why running each command in a new terminal — the approach taken by most mainstream sandboxes — is not sufficient. In that case, the agent is not actually running in the same persistent environment. Waypoint treats the shell session as part of the branchable environment.

## Agent Tasks that are Faster and Better

StateFork and Waypoint let agent developers ask "where should the agent branch?" rather than "how do I reset the container?" For instance:

- A data agent may branch after schemas are inspected and temporary extracts are materialized,
- A coding agent may branch after dependencies are installed and tests are warmed up,
- An RL or search-based agent may branch after every promising intermediate state to grow an exploration tree.

While slow restores are simply costly, incomplete state capture can subtly corrupt the environment state so the agent can no longer trust that retries are actually correct. When we ran TerminalBench and plotted the time to run all benchmark tasks (x-axis) against the cumulative percentage of tasks correctly completed, we saw this directly:

{% include blog-image.html file="terminalbench_results.png" alt="TerminalBench results: cumulative task completion over time for Pass@20, Docker, Hybrid Podman, and Waypoint" %}

Pass@20 simply runs the agent 20 times and picks the best trajectory — its accuracy tops out at under 30% after 2+ hours. Using StateFork, we ran the same MCTS algorithm against several backends. Docker, which only captures the filesystem, is comparable to Pass@20. Hybrid Podman captures partial state (filesystem and process memory via CRIU) but performs *worse* because checkpoints take longer and missing terminal session state confuses the agent. In contrast, Waypoint reaches Pass@20's accuracy in under 10 minutes, and ultimately exceeds it by enabling real exploration.

We are also collaborating with our DAPLab partner [Veris.ai](https://veris.ai) to handle non-local states such as external web APIs and remote services, where local checkpointing alone is not sufficient.

## Try It Out!

We open-sourced these tools because we want more people to test this idea.

- **[Use StateFork](https://github.com/Alex-XJK/StateFork)** if you want a common interface for comparing environment backends or plugging branch/restore into an agent loop.
- **[Use Waypoint](https://github.com/Alex-XJK/waypoint)** if you want a lightweight local backend that preserves filesystem state, process state, and shell context without turning every branch into a new container image.
- **Bring your workloads** — data cleaning, computer-use, coding, debugging, simulation, RL environments, database-backed apps, or agent benchmarks with long setup phases.

> *What state does your agent need to continue as if it had never left?*

That is the real branching problem — and it is the question we want to answer together.

<div style="background:linear-gradient(135deg,#f0f4ff 0%,#e8eef8 100%);border:1px solid #c5d0e8;border-radius:10px;padding:1.5rem 2rem;margin:1.75rem 0;text-align:center;">
  <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#012169;margin-bottom:0.6rem;">Collaborate with us</div>
  <p style="margin:0 0 1.1rem;font-size:1.05rem;color:#222;font-weight:500;">Interested in using StateFork or Waypoint, integrating them into your stack, or working with us on the next set of problems?</p>
  <a href="mailto:ax2155@columbia.edu" style="display:inline-block;background:#012169;color:white;padding:0.5rem 1.4rem;border-radius:5px;text-decoration:none;font-weight:600;font-size:0.9rem;">Reach out at ax2155@columbia.edu →</a>
</div>

## What's Next?

In this and the [previous post]({{ '/general/2026/05/26/branchable-databases-arent-ready-for-agentic-workloads.html' | relative_url }}), we have argued for branching as a core primitive to support agent exploration — both during inference to protect state and during training to sample more useful trajectories.

BranchBench evaluates existing branchable databases, StateFork exposes a common interface for branchable environments, and Waypoint provides a fast backend for filesystem, memory, and terminal state. These releases already support sophisticated use cases and are used by research and industry partners.

Our roadmap includes:

- Supporting these capabilities at the OS and hardware level
- Supporting GUI applications, services, and natively branchable subsystems
- Expanding to richer agent tasks
- Supporting distributed and parallelized agent exploration
- Co-designing agent implementations and RL algorithms with these systems

Coming up in the series: **Data Flow Control (DFC)** — the missing safety primitive that neither access control nor LLM-based guardrails provide, and how provenance-based enforcement can deliver deterministic guarantees at near-zero overhead.

---

*This post is part of our ongoing series on [Agentic Data Environments]({{ '/general/2026/05/21/the-need-for-agentic-data-environments.html' | relative_url }}) from Columbia University's [DAPLab](http://dap.cs.columbia.edu).*
