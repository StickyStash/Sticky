/* ───────────────────────────────────────────────────────────────────
   Sticky — results line + page switcher

   Uses Stash's official hooks (PluginApi.patch) to redraw:
     • PaginationIndex  "1-40 of 94 (1D 15h 18m - 27.9 GiB)"
                        → "94 scenes · 39h 18m · 27.9 GiB"
     • Pagination       « ‹ 1 2 3 › »  →  ‹ 1 of 3 ›
                        ("1 of 3" is a page picker: click it to jump
                        to any page)
   The wording adapts to the page (scenes, images, performers…).
   Also keeps the sidebar's Saved filters section open (see below).
   If Stash's data isn't what's expected, or anything throws, Stash's
   original is shown instead.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;

    var React = api.React;
    var h = React.createElement;

    // Wraps a patch so any error falls back to Stash's original
    function safe(fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            var original = args.pop();
            var renderOriginal = function () { return original.apply(null, args); };
            try {
                var result = fn(args[0] || {});
                return result === undefined ? renderOriginal() : result;
            } catch (e) {
                console.warn("[Sticky] toolbar patch failed, using Stash's default", e);
                return renderOriginal();
            }
        };
    }

    /* ── Results line ─────────────────────────────────────────────── */

    // What the list is called, from the address: /scenes, /images,
    // /performers/12/scenes, /scenes/markers …
    var NOUNS = {
        scenes: ["scene", "scenes"], images: ["image", "images"],
        galleries: ["gallery", "galleries"], performers: ["performer", "performers"],
        studios: ["studio", "studios"], tags: ["tag", "tags"],
        groups: ["group", "groups"], movies: ["group", "groups"],
        markers: ["marker", "markers"]
    };
    // A detail page's address with no tab on the end (/galleries/1)
    // shows that page's default list, which isn't the thing named in
    // the address: a gallery lists its images, and the other detail
    // pages open on their scenes. Reading the address as-is labelled a
    // gallery's 37 images "37 galleries".
    var DEFAULT_LIST = { galleries: "images" };
    function noun(count) {
        var parts = window.location.pathname.split("/").filter(Boolean);
        if (parts.length === 2 && /^\d+$/.test(parts[1]) && NOUNS[parts[0]]) {
            var list = DEFAULT_LIST[parts[0]] || "scenes";
            return NOUNS[list][count === 1 ? 0 : 1];
        }
        for (var i = parts.length - 1; i >= 0; i--) {
            if (NOUNS[parts[i]]) return NOUNS[parts[i]][count === 1 ? 0 : 1];
        }
        return count === 1 ? "result" : "results";
    }

    // All the text inside a React element, e.g. " (1D 15h 18m - 27.9 GiB)".
    // Some numbers (e.g. the images' megapixel total) are drawn by a
    // number-formatting component that only has a `value`, no text, so
    // that value is read and formatted here too.
    function textOf(node) {
        if (node == null || typeof node === "boolean") return "";
        if (typeof node === "string" || typeof node === "number") return String(node);
        if (Array.isArray(node)) return node.map(textOf).join("");
        if (!node.props) return "";
        if (node.props.children == null && typeof node.props.value === "number") {
            return node.props.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
        }
        return textOf(node.props.children);
    }

    // "1D 15h 18m" → "39h 18m"; anything that isn't a duration is kept
    function hoursFirst(part) {
        var units = { d: 86400, h: 3600, m: 60, s: 1 };
        var tokens = part.match(/\d+\s*[dhms]/gi);
        if (!tokens || tokens.join(" ").replace(/\s/g, "") !== part.replace(/\s/g, "")) return part;
        var seconds = tokens.reduce(function (sum, t) {
            return sum + parseInt(t, 10) * units[t.slice(-1).toLowerCase()];
        }, 0);
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        if (!hours) return minutes + "m";
        // Minutes get their own span so phones can hide them ("39h")
        return [hours + "h", h("span", { key: "m", className: "sticky-minutes" }, " " + minutes + "m")];
    }

    /* "40 per page": the label sits right after the number, so the
       select's width follows how many digits the chosen size has
       (--pp-digits). This used to be worked out in CSS with
       :has(option:checked …), but Chrome can't track :checked inside
       :has() cheaply: with those two rules present, adding any element
       anywhere cost a style recalculation of the whole page (~85ms on
       the home page), which made every render slower. The number is
       now written here, after each render of the results line and
       whenever the select changes. */
    function syncPageSize() {
        document.querySelectorAll(".filtered-list-toolbar > .page-size-selector").forEach(function (box) {
            var select = box.querySelector("select");
            var digits = select ? String(select.value).length : 2;
            if (box.style.getPropertyValue("--pp-digits") !== String(digits)) {
                box.style.setProperty("--pp-digits", String(digits));
            }
        });
    }
    document.addEventListener("change", function (e) {
        if (e.target && e.target.closest && e.target.closest(".page-size-selector")) syncPageSize();
    });

    api.patch.instead("PaginationIndex", safe(function (props) {
        if (typeof props.totalItems !== "number") return undefined;
        window.requestAnimationFrame(syncPageSize);
        var total = props.totalItems;

        // Stash's extra stats (duration, size) → separate parts
        var extras = textOf(props.metadataByline)
            .replace(/[()]/g, "")
            .split(" - ")
            .map(function (s) { return s.replace(/\u00a0/g, " ").trim(); })
            .filter(Boolean)
            .map(hoursFirst);

        var line = h("span", { className: "sticky-results" },
            h("strong", null, total.toLocaleString() + " " + noun(total)),
            extras.map(function (part, i) {
                return h("span", { key: i, className: "sticky-results-extra" }, part);
            })
        );

        // Nothing found: Stash draws no grid at all, so the page below
        // the toolbar is blank apart from this line in the corner —
        // which reads as "still loading" rather than "that search
        // found nothing". This is the one component Stash still
        // renders in that case, and it is already handed the count,
        // so the message goes here: no extra element to find, no
        // watcher, and it disappears the moment a result comes back.
        if (total !== 0) return line;

        return h(React.Fragment, null,
            line,
            h("div", { className: "sticky-empty" },
                h("svg", { className: "sticky-empty__icon", viewBox: "0 0 24 24",
                           width: 44, height: 44, "aria-hidden": true },
                    h("circle", { cx: 11, cy: 11, r: 6.5, fill: "none",
                                  stroke: "currentColor", "stroke-width": 1.6 }),
                    h("path", { d: "M16 16l5 5", fill: "none", stroke: "currentColor",
                                "stroke-width": 1.6, "stroke-linecap": "round" }),
                    h("path", { d: "M8.6 8.6l4.8 4.8M13.4 8.6l-4.8 4.8", fill: "none",
                                stroke: "currentColor", "stroke-width": 1.6,
                                "stroke-linecap": "round" })),
                h("p", { className: "sticky-empty__title" }, "No " + noun(0) + " found"),
                h("p", { className: "sticky-empty__hint" },
                    "Nothing here matches the search and filters above."))
        );
    }));

    /* ── Saved filters: keep the sidebar section open ───────────────
       Stash only builds this section's contents while it's open, and
       the theme hides its header (so it can't be toggled). If it's
       found closed, click its header once. Each section element is
       only ever clicked once, so this can never fight the user. */
    var openedSections = new WeakSet();

    // true once the section has been found (and opened, if it was
    // closed); false while it isn't on the page yet.
    function openSavedFilters() {
        var section = document.querySelector(".sidebar-saved-filters");
        if (!section) return false;
        if (openedSections.has(section)) return true;
        openedSections.add(section);
        if (!section.querySelector(".collapse.show")) {
            var header = section.querySelector(".collapse-button");
            if (header) header.click();
        }
        return true;
    }

    // The sidebar is built with the list page, so the section is there
    // within a render or two of arriving on one. A few decreasing-odds
    // tries after each page change replaces a timer that was waking up
    // twice a second for the life of the tab; if the section never
    // appears (a page with no sidebar) the tries simply run out.
    function findSavedFilters() {
        var delays = [0, 250, 700, 1500];
        (function attempt(i) {
            if (i >= delays.length) return;
            setTimeout(function () {
                if (!openSavedFilters()) attempt(i + 1);
            }, delays[i]);
        })(0);
    }

    findSavedFilters();
    if (window.Sticky && window.Sticky.onNavigate) window.Sticky.onNavigate(findSavedFilters);

    /* ── Page switcher ────────────────────────────────────────────── */

    function chevron(d) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, "aria-hidden": true },
            h("path", { d: d, fill: "none", stroke: "currentColor", "stroke-width": 2.2,
                        "stroke-linecap": "round", "stroke-linejoin": "round" }));
    }

    api.patch.instead("Pagination", safe(function (props) {
        var current = props.currentPage;
        var perPage = props.itemsPerPage;
        var total = props.totalItems;
        var go = props.onChangePage;
        if (typeof current !== "number" || typeof perPage !== "number" ||
            typeof total !== "number" || typeof go !== "function") return undefined;

        var pages = Math.max(1, Math.ceil(total / perPage));
        if (pages <= 1) return null;

        var options = [];
        for (var p = 1; p <= pages; p++) {
            options.push(h("option", { key: p, value: p }, "Page " + p.toLocaleString()));
        }

        return h("div", { className: "sticky-pager" },
            h("button", {
                type: "button", className: "sticky-pager-step", "aria-label": "Previous page",
                disabled: current <= 1, onClick: function () { go(current - 1); }
            }, chevron("M15 6l-6 6 6 6")),
            h("label", { className: "sticky-pager-picker" },
                h("span", { "aria-hidden": true },
                    current.toLocaleString() + " of " + pages.toLocaleString()),
                h("select", {
                    "aria-label": "Page", value: current,
                    onChange: function (e) { go(parseInt(e.target.value, 10)); }
                }, options)
            ),
            h("button", {
                type: "button", className: "sticky-pager-step", "aria-label": "Next page",
                disabled: current >= pages, onClick: function () { go(current + 1); }
            }, chevron("M9 6l6 6-6 6"))
        );
    }));
})();
