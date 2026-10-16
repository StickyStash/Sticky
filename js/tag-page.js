/* ───────────────────────────────────────────────────────────────────
   Sticky — tag page header (parent tags and sub-tags)

   Stash has no hook for the tag page header, so, like the performer
   page, this script draws its own header inside Stash's and the CSS
   hides Stash's original while ours is there:

       Scene › Locations
       Tag Name                (parent tags: "Parent" badge)
       AKA Alias, Another Alias +5
       description
       Sub-tags · 10  (pills, most scenes first)     ← parent tags
       Often with     (top 5 fellow sub-tags)        ← sub-tags
       ···  Meta IDs  Edit  │  ♡                    ← page-actions.js

   Nothing that changes data is re-implemented: the heart, Edit and
   the "···" items (Auto tag, Merge, Delete, sub-tag content) click
   Stash's own hidden controls. While you're editing, Stash's header
   comes back and ours steps aside.

   Data: the name, aliases, description, parent and Stash IDs are read
   from the page. Two small requests add the sub-tag scene counts and
   "Often with" (counted from the tag's 50 most recent scenes).
   If anything here fails, Stash's standard header shows instead.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    var A = window.Sticky.actions;
    if (!A) return;                                 // page-actions.js missing

    var PANEL_CLASS = "sticky-tp";
    var OURS = "." + PANEL_CLASS;
    var EDITING_CLASS = "sticky-tp-editing";
    var PAIR_SCENES = 50;
    var PAIR_TOP = 5;

    /* ── Tiny DOM helpers ─────────────────────────────────────────── */
    function el(tag, className, children) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        [].concat(children || []).forEach(function (child) {
            if (child == null || child === false) return;
            node.appendChild(typeof child === "string" || typeof child === "number"
                ? document.createTextNode(String(child)) : child);
        });
        return node;
    }
    function text(node) {
        return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
    }
    function tagIdFromPath() {
        var m = window.location.pathname.match(/^\/tags\/(\d+)\/?/);
        return m ? m[1] : null;
    }
    function writeLS(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    // In-app navigation (no page reload): Stash's router follows the
    // browser's back/forward event, so we push the address and fire it.
    function go(href, e) {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
        if (e) e.preventDefault();
        window.history.pushState(null, "", href);
        window.dispatchEvent(new PopStateEvent("popstate"));
    }
    function link(href, className, children, beforeGo) {
        var a = el("a", className, children);
        a.href = href;
        a.addEventListener("click", function (e) {
            if (beforeGo) beforeGo();
            go(href, e);
        });
        return a;
    }

    /* ── Data (two small requests, cached per tag) ────────────────── */
    // Keyed by tag id + its sub-tag ids, so adding or removing a
    // sub-tag in Edit fetches fresh counts.
    var cache = {};      // key → { children: [...], paired: [...] }
    var loading = {};

    var gql = window.Sticky.gql;

    var CHILDREN_Q = "query ($id: ID!) { findTag(id: $id) { children { id name scene_count } } }";
    var PAIRED_Q = "query ($id: ID!) { findScenes(" +
        "scene_filter: { tags: { value: [$id], modifier: INCLUDES } }, " +
        "filter: { per_page: " + PAIR_SCENES + ", sort: \"date\", direction: DESC }) " +
        "{ scenes { tags { id name parents { id } } } } }";

    function load(key, id, isSubTag, hasChildren) {
        if (loading[key]) return;
        loading[key] = true;
        var entry = cache[key] = cache[key] || {};

        if (hasChildren) {
            gql(CHILDREN_Q, { id: id }).then(function (res) {
                var tag = res && res.data && res.data.findTag;
                entry.children = tag ? tag.children : [];
                schedule();
            }).catch(function (e) { console.warn("[Sticky] tag page: sub-tag counts failed", e); });
        }

        if (isSubTag) {
            gql(PAIRED_Q, { id: id }).then(function (res) {
                var scenes = (res && res.data && res.data.findScenes && res.data.findScenes.scenes) || [];
                var counts = {};
                scenes.forEach(function (scene) {
                    (scene.tags || []).forEach(function (t) {
                        // Fellow sub-tags only: not this tag, not parent tags
                        if (t.id === id || !t.parents || !t.parents.length) return;
                        var c = counts[t.id] = counts[t.id] || { id: t.id, name: t.name, scene_count: 0 };
                        c.scene_count++;
                    });
                });
                entry.paired = Object.keys(counts).map(function (k) { return counts[k]; })
                    .sort(byCount).slice(0, PAIR_TOP);
                schedule();
            }).catch(function (e) { console.warn("[Sticky] tag page: 'Often with' failed", e); });
        }
    }

    function byCount(a, b) {
        return (b.scene_count || 0) - (a.scene_count || 0) || a.name.localeCompare(b.name);
    }

    /* ── Reading Stash's header ───────────────────────────────────── */
    function tagLinks(node) {
        return node ? [].slice.call(node.querySelectorAll("a[href^='/tags/']")).map(function (a) {
            return { id: (a.getAttribute("href").match(/\/tags\/(\d+)/) || [])[1], name: text(a) };
        }).filter(function (t) { return t.id; }) : [];
    }

    function read(header) {
        var head = header.querySelector(".tag-head");
        if (!head) return null;
        return {
            name: text(head.querySelector(".tag-name")),
            aliases: text(head.querySelector(".alias-head")).split(",")
                .map(function (s) { return s.trim(); }).filter(Boolean),
            description: text(head.querySelector(".detail-item-value.description")),
            parents: tagLinks(head.querySelector(".detail-item-value.parent-tags")),
            children: tagLinks(head.querySelector(".detail-item-value.sub-tags")),
            stashIds: [].slice.call(head.querySelectorAll(".stash-id-pill")).map(function (pill) {
                var a = pill.querySelector("a");
                return { label: text(pill.querySelector("span")) || "Stash ID", href: a ? a.href : null };
            }).filter(function (s) { return s.href; }),
            nameIcons: head.querySelector(".name-icons"),
            buttons: [].slice.call(header.querySelectorAll(".details-edit button"))
        };
    }

    /* ── Pieces ───────────────────────────────────────────────────── */
    var CATEGORY_VIEW = function (key) {
        return function () {
            writeLS("sticky.tags.view", "categories");
            writeLS("sticky.tags.tab", key);
        };
    };

    function crumbs(d) {
        var tags = window.StickyTags;
        var parent = d.parents[0];
        var cat = tags ? tags.find(parent ? parent.name : d.name) : null;
        var items = [cat
            ? link("/tags", "sticky-tp-crumb", cat.label, CATEGORY_VIEW(cat.key))
            : link("/tags", "sticky-tp-crumb", "Unsorted", CATEGORY_VIEW("unsorted"))];
        if (parent) items.push(link("/tags/" + parent.id, "sticky-tp-crumb", parent.name));
        var nav = el("nav", "sticky-tp-crumbs");
        nav.setAttribute("aria-label", "Tag location");
        items.forEach(function (item, i) {
            if (i) nav.appendChild(el("span", "sticky-tp-crumb-sep", "›"));
            nav.appendChild(item);
        });
        return nav;
    }

    function pills(list, withCounts) {
        return el("div", "sticky-tp-pills", list.map(function (t) {
            var count = t.scene_count;
            var empty = withCounts && count === 0;
            return link("/tags/" + t.id, "sticky-tp-pill" + (empty ? " is-empty" : ""), [
                el("span", "sticky-tp-pill__name", t.name),
                withCounts && count != null ? el("span", "sticky-tp-pill__count", count) : null
            ]);
        }));
    }

    function section(label, body) {
        return el("div", "sticky-tp-section", [el("div", "sticky-tp-label", label), body]);
    }

    function subContentBox() { return document.getElementById("showSubContent"); }

    function syncMenu(scope) {
        var item = scope.querySelector(".sticky-tp-subcontent");
        if (!item) return;
        var box = subContentBox();
        item.hidden = !box;
        item.classList.toggle("is-on", !!(box && box.checked));
    }

    /* ── Building the header ──────────────────────────────────────── */
    function build(id, key, d, header) {
        var isSubTag = d.parents.length > 0;
        var tags = window.StickyTags;
        var isParent = d.children.length > 0 || !!(tags && !isSubTag && tags.find(d.name));
        var data = cache[key] || {};

        // Bottom row: ··· · Meta IDs · Edit │ heart
        var editBtn = d.buttons.filter(function (b) { return b.classList.contains("edit"); })[0];
        var actions = A.bar([
            A.more(d.buttons.filter(function (b) { return b !== editBtn; }), isParent ? [{
                label: "Include sub-tag content",
                className: "sticky-tp-subcontent",
                onClick: function () { var box = subContentBox(); if (box) box.click(); }
            }] : null, syncMenu),
            A.metaIds(d.stashIds),
            editBtn ? A.button("Edit", function () {
                header.classList.add(EDITING_CLASS);
                editBtn.click();
            }) : null
        ], A.icons(d.nameIcons), "sticky-tp-actions");

        // Name row, with a "Parent" badge on parent tags
        var title = el("div", "sticky-tp-title", [
            el("h1", "sticky-tp-name", d.name),
            isParent ? el("span", "sticky-tp-badge", "Parent") : null
        ]);

        var description = d.description ||
            (isParent && tags && tags.find(d.name) ? tags.find(d.name).desc : "");

        // Parent: its sub-tags (counts once loaded). Sub-tag: "Often with".
        var extra = null;
        if (d.children.length) {
            var kids = data.children
                ? data.children.slice().sort(byCount)
                : d.children;
            extra = section("Sub-tags · " + d.children.length, pills(kids, !!data.children));
        } else if (isSubTag && data.paired && data.paired.length) {
            extra = section("Often with", pills(data.paired, true));
        }

        var panel = el("div", PANEL_CLASS, [
            el("div", "sticky-tp-top", [crumbs(d)]),
            title,
            A.aka(d.aliases, "sticky-tp-aliases"),
            description ? el("p", "sticky-tp-desc", description) : null,
            extra,
            actions
        ]);
        panel.setAttribute("data-id", id);
        return panel;
    }

    /* ── Keeping it in step with Stash ────────────────────────────── */
    var pending = false;
    var lastSignature = null;
    var autoSubContent = {};   // tag ids we've already switched on

    function render() {
        pending = false;
        var id = tagIdFromPath();
        var header = id && document.querySelector(".detail-header");
        if (!header) return;
        var container = header.querySelector(".detail-container");
        if (!container) return;

        // Editing: Stash swaps the details for a form and its Edit button
        // becomes "Cancel" (same button, same class), so look for the
        // form's fields and the button's wording, not just the button.
        var editButton = header.querySelector(".details-edit button.edit");
        var viewing = !!editButton && !/cancel/i.test(text(editButton)) &&
            !header.querySelector("form, input:not([type='checkbox']), textarea, select");
        header.classList.toggle(EDITING_CLASS, !viewing);

        closeSidebars();
        if (!viewing) return;

        var d = read(header);
        if (!d || !d.name) return;
        var isParent = d.children.length > 0;
        var key = id + ":" + d.children.map(function (c) { return c.id; }).join(",");
        load(key, id, d.parents.length > 0, isParent);

        var data = cache[key] || {};
        var signature = [id, d.name, d.aliases.join(","), d.description,
            d.parents.map(function (p) { return p.id; }).join(","),
            d.children.map(function (c) { return c.id; }).join(","),
            d.stashIds.length, !!data.children, !!data.paired].join("|");

        var existing = container.querySelector(":scope > ." + PANEL_CLASS);
        if (!existing || signature !== lastSignature) {
            lastSignature = signature;
            var panel = build(id, key, d, header);
            if (existing) existing.replaceWith(panel);
            else container.insertBefore(panel, container.firstChild);
            existing = panel;
        }

        // Heart follows Stash's own favourite button
        A.sync(existing);

        // Parent tags: include sub-tag content by default (once per visit)
        if (isParent && !autoSubContent[id]) {
            var box = subContentBox();
            if (box) {
                autoSubContent[id] = true;
                if (!box.checked) box.click();
            }
        }
        if (!isParent) delete autoSubContent[id];
    }

    // Lists on tag pages (Scenes, Studios…) start with their filter
    // sidebar closed. Each list is closed once when it first appears;
    // opening it yourself afterwards is left alone.
    var seenPanes = typeof WeakSet === "function" ? new WeakSet() : null;
    function closeSidebars() {
        if (!seenPanes) return;
        document.querySelectorAll(".tab-content .sidebar-pane").forEach(function (pane) {
            if (seenPanes.has(pane)) return;
            seenPanes.add(pane);
            if (pane.classList.contains("hide-sidebar")) return;
            var toggle = pane.querySelector(".sidebar-toggle-button");
            if (toggle) toggle.click();
        });
    }

    // Leaving a tag page forgets the "switched on" note, so the next
    // visit switches it on again.
    var lastPath = window.location.pathname;
    function checkPath() {
        if (window.location.pathname !== lastPath) {
            lastPath = window.location.pathname;
            autoSubContent = {};
        }
    }

    // Runs right after Stash updates the page but before the browser
    // paints, so Stash's plain header never flashes up first.
    function schedule() {
        if (pending) return;
        pending = true;
        queueMicrotask(function () {
            try { checkPath(); render(); }
            catch (e) { console.warn("[Sticky] tag page header failed, using Stash's default", e); }
        });
    }

    // Redraw whenever Stash changes the page, only while on a tag page
    window.Sticky.watchPage({
        path: /^\/tags\/\d+/,
        ours: OURS,
        classes: true,
        onChange: schedule,
        onLeave: function () { lastSignature = null; }
    });
})();
