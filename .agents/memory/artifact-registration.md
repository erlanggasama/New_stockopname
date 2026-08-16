---
name: Uploaded app registration
description: Platform behavior when an application is supplied as an uploaded ZIP rather than already registered.
---

When an uploaded application contains a runnable artifact but that artifact is not yet registered in the workspace, copying its source files alone does not create a managed preview workflow. Register the artifact first, then restore the uploaded source while preserving the generated artifact metadata.

**Why:** The workflow configuration is managed separately from the source directory and is only available after artifact registration.

**How to apply:** Check the registered artifacts before verifying a ZIP-based app; if its workflow is missing, register the app before restarting or screenshotting its preview.