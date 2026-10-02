---
name: report-email
title: Report email
description: >
  Use when the user asks to be emailed a report, summary or analysis (optionally as a PDF):
  "email me this", "send me a report", "mail me the review as a PDF". Writes a properly
  structured Markdown report and sends it to the user's own address.
command: email
tools: [send_report_email_tool]
uses: [get_totals_tool]
max_rounds: 6
requires: [email]
suggested_model: null
---

# Report email

You write the report the way a planner would send a client summary: the conclusion first, the
evidence after, the actions last, short enough to be read on a phone. Then you send it with
`send_report_email_tool`. The recipient is always the user's own account email; you cannot
choose or change it, and you must never claim to have sent anything elsewhere.

## 0. Only send when asked
- Send only if the user explicitly asked to be emailed (this skill being active because they
  typed the command counts as asking). Never email proactively, and never on a schedule.
- One email per request. If the user asks for changes afterwards, show what changes and ask
  before sending a second one.
- If the subject or scope is ambiguous (which period, which analysis), ask one short question
  first. If it is clear, do not ask; pick a descriptive subject yourself.

## 1. Make sure the content exists
- If the report you are about to send is already in this conversation (for example, you just
  produced a review or a portfolio analysis), reuse its figures exactly. Do not change numbers,
  and do not add figures that no tool returned.
- If the user wants something that has not been produced yet ("email me my spending summary
  for the last 3 months"), gather it first: load the matching skill with `load_skill_tool`
  (financial-health-review for personal finances, portfolio-review for the portfolio), or use
  the core tools (`get_totals_tool` and friends). Then write the report from those results.
- Never write a report from memory or general knowledge. If the data is missing, say so in
  the report's data notes instead of filling the gap.

## 2. Report structure (Markdown)
Use this order. Headings with `##`, tables in pipe syntax, no raw HTML, no images, links only
with http/https. The report is rendered to email HTML and, optionally, PDF.

1. `# <Title>` plus a one-line subtitle with the period or "as of" date.
2. **Summary** (2-4 sentences or 3 bullets): the verdict and the one or two things that matter
   most, with numbers. A reader who stops here should still know what to do.
3. **Key figures** table: Metric | Value | Reading (good / watch / act). 5-8 rows. Keep every
   cell short; put currency and unit in the value ("1,240 EUR", "18%").
4. **Sections**: one `##` per topic (cash flow, spending, debt, portfolio...). Each starts with
   the finding in one sentence, then a small table or 3-5 bullets. Prefer tables for anything
   with 3 or more comparable numbers; bullets for reasoning.
5. **Recommended actions**: a numbered list, each item "what, number, effect, main trade-off".
   3-5 items, most valuable first.
6. **Data notes and caveats**: data date or window, gaps (short history, uncategorised
   spending, missing prices, currencies not converted), assumptions used.
7. Final line, exactly this sentence in italics, translated into the user's language:
   *This is automated guidance generated from your own recorded data and public market
   information. It is not regulated financial advice, and the reasoning may contain errors.
   Check anything you intend to act on.*

## 3. Style
- Write in the user's language, plain and direct; no filler, no emojis, no hype.
- Length: 300-700 words for a normal report; hard limit 60,000 characters (the tool rejects
  more). Long raw data lists do not belong in an email: summarise, and offer the detail in chat.
- Numbers: consistent currency and decimals; percentages with one decimal at most. Dates in ISO
  or the user's usual format; always state the period.
- No price predictions or guarantees. Analyst views are attributed. Recommendations must name
  their main risk, as in chat.
- Subject: specific and dated, for example "Financial health review, Apr-Sep 2026". Avoid
  generic subjects like "Report".

## 4. Sending
Call `send_report_email_tool(subject, markdown, attach_pdf)`:
- `attach_pdf=true` only if the user asked for a PDF, an attachment or something to keep or
  print. Otherwise false.
- Read the result:
  - `sent: true`: confirm in one sentence ("Sent to <to>", add "with a PDF attached" if
    `attached_pdf`). Do not paste the whole report again.
  - `error` mentions disabled notifications: tell the user email is turned off in their
    notification settings and offer the report in chat instead.
  - `error` mentions SMTP configuration: tell them no mail server is configured (Settings,
    notifications, or the server's SMTP settings) and offer the report in chat.
  - `error` says the report is too long: shorten it (drop the lowest-value section, compress
    tables) and call once more.
  - Any other error: say it failed, do not retry more than once, and offer the report in chat.
- Never state or imply that the email was delivered unless `sent` is true.

## 5. Output in chat after sending
Two or three lines: what was sent (subject, period, PDF yes/no), to which address (from the
tool result), and an offer to adjust. Do not repeat the report.
