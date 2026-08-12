# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Sandro, the sole user — Finanzia is strictly personal, not shared or household finance. Nobody else views or uses this data.

## Product Purpose

Finanzia is a local personal finance tracker covering the full loop: cash/bank accounts, credit cards, transactions, savings goals, recurring bills and loans, and a unified payment calendar. Confirmed with the user: no single job (avoiding missed payments, saving with discipline, understanding spending) is the priority — all three matter equally, and future work should not over-index on one at the expense of the others.

## Positioning

100% local: all data lives in a JSON file on the user's own computer (`data.json`), with no cloud account and no third-party backend. The only external integration is a personal Telegram bot used for due-date reminders. This is the deliberate difference from typical cloud-based fintech apps (bank apps, Mint/YNAB-style tools).

## Operating Context

- Peru-specific: soles currency (S/), real Peruvian institutions already in live use (BCP, Interbank as accounts; Sedapal as a utility), Spanish-language UI throughout.
- Runs as a local Node/Express server (`localhost:4173`), reachable from desktop and phone over the same WiFi; no hosting, no internet-facing deployment.
- Used as the user's actual day-to-day financial record, not a demo — `data.json` already holds real accounts, transactions, and debts (e.g. a BBVA personal loan, a Sedapal water bill).
- Telegram bot sends payment/installment/savings-behind reminders; it is a notification channel, not an account system.

## Capabilities and Constraints

- Frontend is a single vanilla JS/HTML/CSS file (`public/index.html`) — no build step, no framework.
- Backend is Node/Express (`server/`): `server/finance.js` holds business logic over an in-memory store, `server/db.js` loads/saves `data.json`, `server/bot.js` runs the Telegram integration.
- Core modules: Panel (dashboard), Transacciones, Billetera (accounts), Tarjeta (credit cards + billing cycles), Chanchito (savings pockets with monthly targets, optional linked real account, auto-growth rate, behind-schedule Telegram alerts), Deudas (recurring variable-amount services plus personal loans with interest/installments), Calendario (unified calendar + list view of all due dates, with pay/edit per day).
- Single user, no login/auth system — the trust model is "runs on my own machine," not a multi-tenant product.

## Brand Commitments

Name "Finanzia" is established and already used throughout the product (title, sidebar brand mark). No additional brand documentation beyond current in-app usage.

## Evidence on Hand

`data.json` contains real, live user data (not samples) — e.g. BCP/Interbank accounts, a Sedapal bill, a BBVA personal loan. Treat existing categories, labels, and currency formatting as real product content to preserve, not placeholders to invent over.

## Product Principles

1. Treat avoiding missed payments, saving with discipline, and understanding spending as equally important — confirmed by the user as "a little of everything equally," not one dominant job.
2. Preserve locality as a hard constraint: never introduce a requirement for cloud accounts, external analytics, or third-party storage; the app must keep working fully offline except the optional Telegram notifications.
3. Design for a single, already-fluent daily user: no onboarding funnel, permission system, or multi-tenant consideration is needed — optimize for daily-use efficiency over first-time discoverability.
4. Keep interaction patterns consistent across modules (selectable row + detail panel, color-by-type, delete-lives-inside-edit) rather than inventing new ones per tab.
5. Spanish-language, Peru-specific context (soles, local banks/utilities) is a fixed product fact, not a locale to genericize.
