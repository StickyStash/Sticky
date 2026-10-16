# Sticky

A deep-blue theme for [Stash](https://github.com/stashapp/stash).

Sticky restyles Stash from the navbar down: redesigned cards for every
kind of item, reworked detail pages, a single-row list toolbar, a themed
Settings area, and a phone layout with a floating bottom tab bar. It's a
UI plugin, so it changes how Stash looks and lays things out — never your
data — and it switches off cleanly.

## What's in it

- **Cards** — scenes, performers, galleries, images, markers, studios and
  groups, all on the same surface and rhythm. Scene, gallery, group and
  marker cards share one layout: the length and Stash's counts on the
  thumbnail, then studio logo · date, a title that always takes two lines,
  the performers as plain text ("One, Two +3"), the synopsis and a row of
  tags — each row the same distance from the next. Whatever doesn't fit
  shows on hover (or tap, on a phone).
- **Home page** — each row scrolls natively (momentum on a phone, a
  two-finger swipe on a trackpad), with arrows on a desktop that page by
  whole cards.
- **Detail pages** — scene, gallery and image pages share one layout;
  performer, studio, group and tag pages have their own headers.
- **List toolbar** — search, sort, filters and views on one centred row,
  a cleaner results line, a compact page switcher, and a proper message
  when nothing matches.
- **Phone layout** — a floating tab bar at the bottom (choose its four
  pages in the plugin settings), a page header with the view switcher,
  two performer cards to a row, and slimmer cards.
- **Tags** — a Categories view that groups tags under their parents.
- **App icon** — its own icon on the browser tab and, on iPhone, on the
  Home Screen.
- **Everything else** — Settings, dialogs, dropdowns, the date picker,
  toasts, tooltips, tables, the scrubber and the lightbox all follow the
  theme, and keyboard focus is always visible.

## Requirements

- Stash **v0.31** (built and tested on v0.31.1). Earlier versions haven't
  been tested.
- A current Chrome, Brave, Edge or Firefox, or Safari 16+ (including
  iPhone and iPad).

## Install

### From the plugin source (recommended)

1. In Stash, go to **Settings → Plugins → Available Plugins → Add Source**.
2. Name it `Sticky` and paste this as the source URL:

   ```
   https://stickystash.github.io/Sticky/index.yml
   ```

3. Open the new source, tick **Sticky**, and click **Install**.
4. Reload the page.

Installed this way, Stash shows you when a new version is available, like any other plugin.

### By hand

Copy this folder into your Stash `plugins` folder (for example
`~/.stash/plugins/sticky/`), then **Settings → Plugins → Reload plugins**
and reload the page.

## Settings

**Settings → Plugins → Sticky → Phone tab bar** — the four pages in the
phone tab bar, in order, separated by commas: for example
`home, scenes, images, performers`. Everything else goes in the More menu.

## Turning it off

- **For one tab:** add `?sticky=off` to any Stash address. The theme stands
  down for that tab until you add `?sticky=on` or close it — handy for
  checking whether something is Sticky's doing.
- **To compare with stock Stash:** Stash's **Troubleshooting mode** (at the
  bottom of the Settings menu) turns off every plugin, Custom CSS and
  Custom JavaScript until you reload.
- **Completely:** disable or uninstall it under Settings → Plugins.

## The login page (optional)

Stash's login page loads before any plugin does, so Sticky can't reach it.
It does load your Custom CSS, so a matching login page is one paste away:
copy [`extras/login.css`](extras/login.css) into **Settings → Interface →
Custom CSS** and tick **Custom CSS enabled**. Everything in it is scoped to
the login page, so it changes nothing else.

## Other plugins

Plugins that build their pages from Stash's standard pieces (cards,
buttons, dialogs, tables) pick up the theme automatically. Panels with
their own styling keep it.

A page another plugin adds to the navbar gets a place in the phone tab
bar's More menu.

If another plugin looks out of place under Sticky, please open an issue
with a screenshot.

## Known limitations

- **Setup wizard** — the first-run wizard appears before plugins load, so
  it keeps Stash's own look.
- **The Tagger** keeps Stash's own search fields and buttons on purpose:
  they're joined input groups that only look right in Stash's styling.
- **Grid cards briefly load wide** (about a tenth of a second) before
  settling. That's Stash measuring the page, and it happens with Sticky off
  too.
- **Home-screen web app on iPhone** — if you added Stash to your Home
  Screen before installing Sticky, remove and re-add it from Safari so iOS
  picks up the theme's icon and status-bar colour. Other browsers on iPhone
  (Firefox, for one) read the icon before Sticky loads, so they keep
  Stash's.
- **Favicon** — Sticky's icon replaces Stash's, including a custom
  `favicon.ico` you've put in your Stash config folder. A custom page
  title is left alone.

## How it was made

Sticky was built with extensive help from Claude, Anthropic's AI
assistant, which wrote much of the code under my direction. I reviewed
every change and tested it on a live Stash install on desktop and iPhone,
and I take responsibility for the code. Issues and pull requests are very
welcome.

## Development

- The plugin is plain JavaScript and CSS — no build step to run it. Drop
  the folder into `plugins/`, reload plugins, and edit in place.
- `sh build.sh` builds the plugin source (`_site/index.yml` and
  `_site/sticky.zip`). The GitHub Actions workflow in
  `.github/workflows/pages.yml` runs it and publishes `_site/` to GitHub
  Pages on every push to `main`.
- Each script and stylesheet opens with a comment explaining what it does
  and why; read those before patching anything.

## Licence

MIT — see [LICENSE](LICENSE).

Sticky isn't affiliated with the Stash project.
