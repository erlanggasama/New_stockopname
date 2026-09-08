---
name: Stock dual storage
description: Durable data flow for stock transactions and spreadsheet mirroring.
---

The server database is the durable source for stock transaction records. Google Sheets remains the operational mirror for monitoring, and every record carries an idempotent client ID plus a spreadsheet sync status so retries do not create duplicate rows on the server.

**Why:** A spreadsheet outage must not lose a stock transaction, while the existing spreadsheet workflow still needs to remain available for monitoring.

**How to apply:** New stock writes should go through the server API first. Keep spreadsheet delivery and retry status visible rather than treating a spreadsheet failure as a failed server save.