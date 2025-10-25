---
title: "Proj1"
subtitle: "My First Project"
date: 2025-07-29
authors:
  - name: "Alex Jiakai Xu"
tags:
  - "Tracing"
  - "Systems"
  - "Python"
links:
  github: "https://github.com/Alex-XJK/stracetools"
publications:
  - title: "stracetools"
    venue: "PyPI"
    url: "https://pypi.org/project/stracetools/"
    year: 2025
featured: true
status: "active"
---

System debugging and performance analysis often rely on [strace](https://strace.io/) to understand application behavior. However, existing tools typically fall short:

- **Limited scope**: Most tools only provide basic statistics or file access lists
- **No programmability**: Fixed output formats with no API for custom analysis
- **Poor multi-threading support**: Difficult to analyze concurrent syscall execution
- **No visualization**: Raw text output is hard to interpret for complex applications

**StraceTools bridges these gaps** by providing:
- ✨ **Comprehensive parsing** with full syscall detail extraction
- 🔧 **Programmable API** for custom analysis workflows
- 📊 **Interactive visualizations** for timeline and process analysis
- 🧵 **Multi-threading support** with process relationship tracking