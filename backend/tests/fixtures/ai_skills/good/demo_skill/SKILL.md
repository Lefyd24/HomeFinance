---
name: demo-skill
title: Demo skill
description: >
  Use for demo work. Second line of the
  description.
command: demo
tools: [demo_lookup_tool, demo_mail_tool]
uses:
  - get_debts_tool
max_rounds: 20
requires: [email]
suggested_model: "acme/strong"
---

# Demo method

1. Look things up with demo_lookup_tool.
