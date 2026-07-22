# Cursor Marketplace submission — OniPin

**Date:** 2026-07-22  
**Submitter:** deivys1224-ctrl \<deivys1224@gmail.com\>  
**Repository (public, MIT):** https://github.com/deivys1224-ctrl/onipin-mcp  
**Homepage:** https://onnivers.store  
**Remote MCP:** https://onnivers.store/mcp  
**Privacy:** https://onnivers.com/privacidad  

## What it does

OniPin MCP connects Cursor agents to the OniPin business network. Agents can:

- Discover businesses by `onp_` pin, `@username`, website URL, category, city, phone, or trade name
- Chat with a business AI (and continue when a human takes over)
- List catalog products/services
- Create booking and order requests

No API token is required for the public MCP. Pass the business pin in conversation.

## Manifest

- `.cursor-plugin/plugin.json` — name `onipin`, logo `assets/logo.png`
- `.mcp.json` — HTTP MCP `https://onnivers.store/mcp`
- Already listed on community directory: https://cursor.com/directory (search `onipin`) / https://cursor.directory/?q=onipin

## Review notes

- Open source (MIT) — this repo is the thin MCP client only
- Production traffic goes to the public OniPin API on onnivers.store
- Logo: `assets/logo.png` (512×512)

## Submit channels

1. Form: https://cursor.com/marketplace/publish  
2. Email (documented by Cursor plugin template): kniparko@anysphere.com  

Please list **onipin** in the official Cursor Marketplace / Customize search after review.
