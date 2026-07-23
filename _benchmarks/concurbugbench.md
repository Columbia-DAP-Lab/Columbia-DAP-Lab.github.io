---
title: ConcurBugBench
status: In progress
domain: Concurrency bug discovery and repair
tagline: Can AI agents find, trigger, and correctly repair real bugs caused by thread interactions and timing?
updated: July 2026
stats:
  - value: "~200"
    label: Real-world bugs
  - value: "4"
    label: Languages
  - value: "3"
    label: Evaluation stages
evaluation_unit: One real concurrency bug and its bug-specific oracle
verification: Reproduction and repair oracles
availability: In development
languages: Go, Rust, C, and C++
---

## Background

Concurrency failures are rarely confined to one suspicious line. They emerge only under particular interactions among threads, goroutines, timing, and shared state. An agent must reason across execution paths, trigger the right interleaving, and eliminate the failure without introducing deadlocks or new correctness problems.

## What it evaluates

- Localizing a concurrency bug across interacting execution paths
- Constructing a reliable reproducer for a difficult interleaving
- Producing a repair that removes the faulty behavior
- Preserving liveness and correctness after the change

## Dataset

ConcurBugBench contains nearly 200 real-world bugs drawn from Go, Rust, C, and C++ programs. Each item packages the buggy program state, relevant context, and a bug-specific oracle.

## Evaluation methodology

Evaluation separates discovery, reproduction, and repair. Unlike memory-safety benchmarks, concurrency bugs do not share a universal crash or sanitizer signal. Each item therefore uses a purpose-built oracle to determine whether the faulty behavior was triggered and whether a proposed repair actually eliminates it.

## Representative task

> Diagnose a nondeterministic failure, create a test or workload that reliably exposes it, and submit a patch that passes both the original correctness suite and the concurrency-specific oracle.

## Release status

The team is validating oracles and finalizing the set of bugs included in the first release.
