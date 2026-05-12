---
title: "EDB"
subtitle: "The Ethereum Project Debugger"
date: 2025-04-01
avatar: edb.png
tags:
  - Smart Contracts
  - Blockchain
  - Security
  - Debugging
authors:
  - name: "Zhuo Zhang"
    url: "https://zzhang.xyz/"
is_software: true
links:
  github: https://github.com/edb-rs/edb
  website: https://edb.zzhang.xyz/
---

**EDB** is a source-level time-travel debugger for Ethereum smart contracts — the first Ethereum smart-contract debugger that can theoretically achieve 100% accurate source-to-bytecode mapping.

Rather than relying on fragile source maps to decode bytecode, EDB instruments Solidity contracts at the source code level, inserting strategic debugging hooks during compilation to enable contracts to report their state in high-level terms.

### Key Features
- **Source-Level Debugging**: Step through smart contract execution at the source code level, not bytecode
- **Local Variable Inspection**: Access and inspect variable values during execution
- **Custom Expression Evaluation**: Evaluate arbitrary expressions against the current execution state
- **Breakpoints & Watchpoints**: Fine-grained control over debugging flow
- **Browser UI & TUI**: Choose between a browser-based interface or a terminal user interface
