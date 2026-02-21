# Regex Search

A Chrome extension that augments the native `Cmd+F` / `Ctrl+F` in-page search with full regex support.

The native browser find only supports literal string matching. This extension lets you search any webpage using JavaScript regular expressions, with all the features you'd expect: highlighting, match counting, and keyboard navigation.

## Features

- **Regex matching** — search with patterns like `\d{3}-\d{4}`, `https?://\S+`, `colou?r`
- **Highlight all matches** — yellow for all matches, orange for the current one
- **Match navigation** — prev/next buttons and `Enter` / `Shift+Enter` to jump between matches
- **Match counter** — shows "x of y" like native search
- **Case-insensitive by default** — toggle with the `Aa` button
- **Cross-element matching** — finds matches even when text is split across inline HTML elements (e.g. `<b>Chat</b>GPT`)
- **Shadow DOM isolation** — the search bar won't interfere with page styles

## Install

1. Clone or download this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the repo directory

## Usage

Press `Cmd+Shift+F` (Mac) or `Ctrl+Shift+F` (Windows/Linux) to toggle the search bar.

| Action | Shortcut |
|---|---|
| Open / close search | `Cmd+Shift+F` / `Ctrl+Shift+F` |
| Next match | `Enter` |
| Previous match | `Shift+Enter` |
| Close search | `Escape` |
| Toggle case sensitivity | Click `Aa` button |

> **Note:** If the keyboard shortcut doesn't work, go to `chrome://extensions/shortcuts` and manually assign it. Chrome may skip the suggested binding if another extension already uses it.

## Files

```
manifest.json   — Extension config (Manifest V3)
background.js   — Service worker, forwards shortcut command to content script
content.js      — Core logic: search bar UI, regex matching, highlighting
content.css     — Highlight styles for matches
```
