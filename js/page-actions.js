/* ───────────────────────────────────────────────────────────────────
   Sticky — the action row on detail pages

       ···   Meta IDs ▾   Edit   │   ♥  ✓  🔗  𝕏  ◎

   Performer, studio, group and tag pages all end their header with
   this one row: Stash's own actions on the left (other actions behind
   "···", the external IDs behind "Meta IDs", Edit), a hairline, then
   the icon buttons Stash puts beside the name (favourite, organised,
   links). Moving the icons down here is what keeps the name and the
   AKA line from being pushed about by however many links a page has.

   Nothing is re-implemented that changes data. Every button here
   clicks Stash's own (hidden) button; the link buttons read the
   addresses Stash's link buttons were given, and list them in the
   same themed menu as everything else. If those addresses can't be
   read, icons() gives up and the page keeps Stash's own icons.

   Used through window.Sticky.actions by the page scripts.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    function el(tag, className, children) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        [].concat(children == null ? [] : children).forEach(function (child) {
            if (child == null || child === false) return;
            node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
        });
        return node;
    }

    // One listener closes every open menu when you click elsewhere
    function closeAll(except) {
        document.querySelectorAll(".sticky-act-menu").forEach(function (m) {
            if (m !== except) m.hidden = true;
        });
    }
    document.addEventListener("click", function () { closeAll(null); });

    /* ── Buttons and menus ────────────────────────────────────────── */
    function button(label, onClick, className) {
        var node = el("button", "sticky-act-button" + (className ? " " + className : ""), label);
        node.type = "button";
        if (onClick) node.addEventListener("click", onClick);
        return node;
    }

    // items: { label, onClick } | { label, href } | { divider: true },
    // with danger: true for Delete and an optional className. `face` is
    // the button's text or a node (an icon); className is added to the
    // button; onOpen(list) runs each time the menu opens.
    function menu(face, items, className, title, onOpen) {
        var list = el("div", "sticky-act-menu dropdown-menu");
        list.hidden = true;
        items.forEach(function (item) {
            if (item.divider) { list.appendChild(el("div", "dropdown-divider")); return; }
            var node;
            if (item.href) {
                node = el("a", "dropdown-item", [item.label, el("span", "sticky-act-ext", "↗")]);
                node.href = item.href;
                node.target = "_blank";
                node.rel = "noopener noreferrer";
            } else {
                node = el("button", "dropdown-item" + (item.danger ? " sticky-act-danger" : "") +
                    (item.className ? " " + item.className : ""), item.label);
                node.type = "button";
                node.addEventListener("click", function (e) {
                    e.stopPropagation();
                    list.hidden = true;
                    item.onClick();
                });
            }
            list.appendChild(node);
        });
        var toggle = button(face, function (e) {
            e.stopPropagation();
            var opening = list.hidden;
            closeAll(list);
            list.hidden = !opening;
            if (opening) place(list, toggle);
            if (opening && onOpen) onOpen(list);
        }, className);
        if (title) toggle.title = title;
        return el("div", "sticky-act-menu-wrap", [toggle, list]);
    }

    // Stash's page header clips whatever runs past its bottom edge
    // (overflow: hidden, for its blurred backdrop), and the row sits at
    // the very bottom of it, so a menu opening downwards was cut off.
    // Open towards whichever side has more room inside the header, and
    // let a long list scroll within that room.
    function place(list, toggle) {
        var box = toggle.closest(".detail-header") || document.documentElement;
        var bounds = box.getBoundingClientRect();
        var at = toggle.getBoundingClientRect();
        var below = Math.min(bounds.bottom, window.innerHeight) - at.bottom - 12;
        var above = at.top - Math.max(bounds.top, 0) - 12;
        var up = above > below;
        list.classList.toggle("sticky-act-menu--up", up);
        list.style.maxHeight = Math.max(120, up ? above : below) + "px";
    }

    // "···" holding Stash's other buttons (Merge, Delete, Auto tag …),
    // then any extra items
    function more(stashButtons, extraItems, onOpen) {
        var items = stashButtons.map(function (b) {
            return {
                label: (b.textContent || "").trim().replace(/\.\.\.$|…$/, "…"),
                danger: b.classList.contains("delete") || b.classList.contains("btn-danger"),
                onClick: function () { b.click(); }
            };
        }).filter(function (i) { return i.label; });
        if (extraItems && extraItems.length) {
            if (items.length) items.push({ divider: true });
            items = items.concat(extraItems);
        }
        return items.length ? menu("···", items, "sticky-act-icon", "More", onOpen) : null;
    }

    // "Meta IDs ▾": StashDB and co. links: [{ label, href }]
    function metaIds(links) {
        links = (links || []).filter(function (l) { return l && l.href; });
        return links.length ? menu("Meta IDs", links, "sticky-act-caret") : null;
    }

    /* ── AKA line: first two, then "+N" (click for all) ───────────── */
    function aka(aliases, className) {
        aliases = (aliases || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
        if (!aliases.length) return null;
        var line = el("div", "sticky-aka" + (className ? " " + className : ""),
            ["AKA ", aliases.slice(0, 2).join(", ")]);
        if (aliases.length > 2) {
            var plus = el("button", "sticky-aka-more", "+" + (aliases.length - 2));
            plus.type = "button";
            plus.title = aliases.join(", ");
            plus.addEventListener("click", function () {
                line.textContent = "AKA " + aliases.join(", ");
            });
            line.appendChild(document.createTextNode(" "));
            line.appendChild(plus);
        }
        return line;
    }
    function splitAliases(textValue) {
        return String(textValue || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    }

    /* ── The icons Stash draws beside the name ────────────────────── */

    // The addresses a Stash link button was given, read from React's
    // record of its props (they're only put in the page when its menu
    // opens). null if they can't be found.
    function urlsOf(node) {
        var key = Object.keys(node).filter(function (k) { return k.indexOf("__reactFiber") === 0; })[0];
        var fiber = key ? node[key] : null;
        for (var i = 0; fiber && i < 12; i++, fiber = fiber.return) {
            var p = fiber.memoizedProps;
            if (p && Array.isArray(p.urls)) return p.urls.filter(Boolean).map(String);
        }
        return null;
    }
    function hrefOf(url) { return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : "https://" + url; }
    function labelOf(url) {
        return url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
    }
    // Outline icons in the same line weight as the tab bar's, in place
    // of Stash's solid ones (shapes after the ISC-licensed Lucide set).
    // Anything without one here keeps a copy of Stash's own icon.
    var OUTLINE = {
        heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
        organized: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
        link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
        twitter: '<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>',
        instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/>'
    };
    function outline(name) {
        var wrap = document.createElement("span");
        wrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' +
            'aria-hidden="true">' + OUTLINE[name] + "</svg>";
        return wrap.firstChild;
    }
    function iconOf(stashButton, name) {
        if (name && OUTLINE[name]) return outline(name);
        var svg = stashButton.querySelector("svg");
        return svg ? svg.cloneNode(true) : el("span", null, "•");
    }

    // A stand-in for one of Stash's toggles (favourite, organised): it
    // looks like the original, clicks the original, and sync() keeps
    // its on/off look in step.
    function proxy(original, className, title, iconName) {
        var node = button(iconOf(original, iconName), function (e) {
            e.stopPropagation();
            original.click();
        }, "sticky-act-icon sticky-act-toggle " + className);
        node.title = title || original.title || "";
        node._stickyOriginal = original;
        return node;
    }

    // Our row of icons for Stash's .name-icons, or null to leave
    // Stash's own in place. `extra` nodes (the O-count) follow the heart.
    function icons(nameIcons, extra) {
        if (!nameIcons) return null;
        var row = el("div", "sticky-act-icons");
        var ok = true;
        [].forEach.call(nameIcons.children, function (child) {
            if (!ok) return;
            if (child.matches(".favorite-button")) {
                row.appendChild(proxy(child, "sticky-act-heart", "Favourite", "heart"));
                [].concat(extra || []).forEach(function (n) { if (n) row.appendChild(n); });
            } else if (child.matches(".organized-button")) {
                row.appendChild(proxy(child, "sticky-act-organized", "Organised", "organized"));
            } else if (child.matches(".external-links-button")) {
                var stash = child.querySelector("button") || child;
                var urls = urlsOf(child);
                if (!urls) { ok = false; return; }
                if (!urls.length) return;
                var site = /twitter|instagram/.exec(stash.className);
                var kind = site ? site[0] : "link";
                var title = site ? site[0].charAt(0).toUpperCase() + site[0].slice(1) : "Links";
                if (urls.length === 1) {
                    var a = el("a", "sticky-act-button sticky-act-icon", iconOf(stash, kind));
                    a.href = hrefOf(urls[0]);
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    a.title = labelOf(urls[0]);
                    row.appendChild(a);
                } else {
                    row.appendChild(menu(iconOf(stash, kind), urls.map(function (u) {
                        return { label: labelOf(u), href: hrefOf(u) };
                    }), "sticky-act-icon", title));
                }
            } else if (child.matches("button")) {
                row.appendChild(proxy(child, "", child.title));
            }
        });
        return ok ? row : null;
    }

    // Mirror Stash's toggles' state onto our stand-ins
    function sync(root) {
        if (!root) return;
        root.querySelectorAll(".sticky-act-toggle").forEach(function (node) {
            var o = node._stickyOriginal;
            if (!o) return;
            var on = (o.classList.contains("favorite-button") && !o.classList.contains("not-favorite")) ||
                (o.classList.contains("organized-button") && !o.classList.contains("not-organized"));
            node.classList.toggle("is-on", on);
            node.setAttribute("aria-pressed", String(on));
        });
    }
    // A short fingerprint of the toggles' state, for a page's signature
    function state(nameIcons) {
        return nameIcons ? [].map.call(nameIcons.querySelectorAll("button"), function (b) {
            return b.className;
        }).join(",") : "";
    }

    /* ── The row ──────────────────────────────────────────────────── */
    // actions: nodes for the left (··· / Meta IDs / Edit), iconRow from
    // icons(); a hairline goes between the two when both are there.
    function bar(actions, iconRow, className) {
        var left = (actions || []).filter(Boolean);
        var parts = left.slice();
        if (iconRow && iconRow.children.length) {
            if (left.length) parts.push(el("span", "sticky-act-sep"));
            parts.push(iconRow);
        }
        var row = el("div", "sticky-act-bar" + (className ? " " + className : ""), parts);
        sync(row);
        return row;
    }

    window.Sticky.actions = {
        el: el, button: button, menu: menu, more: more, metaIds: metaIds,
        aka: aka, splitAliases: splitAliases, icons: icons, sync: sync,
        state: state, bar: bar
    };
})();
