/* ───────────────────────────────────────────────────────────────────
   Sticky — group page header

   Stash has no hook for this page, so (like the tag and performer
   pages) the theme draws its own header inside Stash's and the CSS
   hides Stash's original while ours is there:

       Group title
       AKA …
       ★★★★★                          ← Stash's own stars, untouched
       Duration      Released      Studio
       Director      Performers    Part of
       synopsis, 3 lines, then "More"
       tag pills
       ···  Edit  │  links            ← page-actions.js

   Everything shown comes from ONE request for the group's record, so
   nothing depends on how Stash prints its header. The DOM is used
   only for the controls we click (Edit, Delete) and to leave Stash's
   rating stars exactly where they are, so rating still works.

   Empty facts are left out. While you're editing, Stash's own header
   comes back and ours steps aside. If anything fails, you get Stash's
   standard page.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    var A = window.Sticky.actions;
    if (!A) return;                                 // page-actions.js missing

    var HEAD_CLASS = "sticky-gp-head";
    var BODY_CLASS = "sticky-gp";
    var OURS = "." + HEAD_CLASS + ", ." + BODY_CLASS;
    var EDITING_CLASS = "sticky-gp-editing";
    var SYNOPSIS_LINES = 3;

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
    function groupIdFromPath() {
        var m = window.location.pathname.match(/^\/groups\/(\d+)\/?/);
        return m ? m[1] : null;
    }

    // In-app navigation: Stash's router follows the browser's own event
    function go(href, e) {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
        if (e) e.preventDefault();
        window.history.pushState(null, "", href);
        window.dispatchEvent(new PopStateEvent("popstate"));
    }
    function link(href, className, children) {
        var a = el("a", className, children);
        a.href = href;
        a.addEventListener("click", function (e) { go(href, e); });
        return a;
    }

    /* ── The group's record (one request, kept per group) ─────────── */
    var cache = {};
    var loading = {};

    var QUERY = "query ($id: ID!) { findGroup(id: $id) { " +
        "id name aliases date duration director synopsis urls " +
        "studio { id name } tags { id name } " +
        "scene_count performer_count sub_group_count " +
        "containing_groups { group { id name } } } }";

    function load(id) {
        if (loading[id]) return;
        loading[id] = true;
        window.Sticky.gql(QUERY, { id: id }).then(function (res) {
            cache[id] = (res && res.data && res.data.findGroup) || null;
            schedule();
        }).catch(function (e) {
            console.warn("[Sticky] group page: couldn't load the group", e);
        });
    }

    /* ── Formatting ───────────────────────────────────────────────── */
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function formatDate(date) {
        if (!date) return null;
        var parts = String(date).split("-");
        var month = parseInt(parts[1], 10);
        return parts.length > 1 && month >= 1 && month <= 12
            ? MONTHS[month - 1] + " " + parts[0]
            : parts[0];
    }
    // 2433 → "40:33", 7325 → "2:02:05"
    function duration(total) {
        if (!total) return null;
        total = Math.floor(total);
        var hrs = Math.floor(total / 3600);
        var min = Math.floor((total % 3600) / 60);
        var sec = total % 60;
        var pad = function (n) { return (n < 10 ? "0" : "") + n; };
        return hrs ? hrs + ":" + pad(min) + ":" + pad(sec) : min + ":" + pad(sec);
    }
    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

    /* ── Pieces ───────────────────────────────────────────────────── */
    function fact(label, value) {
        if (value == null || value === "") return null;
        return el("div", "sticky-gp-fact", [
            el("div", "sticky-gp-fact__label", label),
            el("div", "sticky-gp-fact__value", value)
        ]);
    }

    function facts(g) {
        var length = duration(g.duration);
        var scenes = g.scene_count ? plural(g.scene_count, "scene") : null;
        var lengthLine = length && scenes ? length + " · " + scenes : (length || scenes);
        var parent = (g.containing_groups || [])[0];
        var items = [
            fact("Duration", lengthLine),
            fact("Released", formatDate(g.date)),
            fact("Studio", g.studio ? link("/studios/" + g.studio.id, "sticky-gp-link", g.studio.name) : null),
            fact("Director", g.director
                ? link("/groups?c=(%22type%22:%22director%22,%22modifier%22:%22EQUALS%22,%22value%22:%22" +
                    encodeURIComponent(g.director) + "%22)", "sticky-gp-link", g.director)
                : null),
            fact("Performers", g.performer_count ? String(g.performer_count) : null),
            fact("Sub-groups", g.sub_group_count ? String(g.sub_group_count) : null),
            fact("Part of", parent && parent.group
                ? link("/groups/" + parent.group.id, "sticky-gp-link", parent.group.name) : null)
        ].filter(Boolean);
        return items.length ? el("div", "sticky-gp-facts", items) : null;
    }

    // Synopsis: three lines, then "More" (same look as "+N more" on
    // the tags page)
    function synopsis(value) {
        if (!value) return null;
        var body = el("p", "sticky-gp-synopsis", value);
        var wrap = el("div", "sticky-gp-synopsis-wrap", body);
        var more = el("button", "sticky-gp-more", "More");
        more.type = "button";
        more.addEventListener("click", function () {
            var open = wrap.classList.toggle("is-open");
            more.textContent = open ? "Less" : "More";
        });
        // Only offer "More" when the text is actually cut off
        window.requestAnimationFrame(function () {
            if (body.scrollHeight - body.clientHeight > 2) wrap.appendChild(more);
        });
        return wrap;
    }

    function tagPills(tags) {
        if (!tags || !tags.length) return null;
        return el("div", "sticky-gp-pills", tags.map(function (t) {
            return link("/tags/" + t.id, "sticky-pill sticky-pill--tag", t.name);
        }));
    }

    /* ── Building ─────────────────────────────────────────────────── */
    function buildHead(g) {
        return el("div", HEAD_CLASS, [
            el("h1", "sticky-gp-name", g.name || ""),
            A.aka(A.splitAliases(g.aliases))
        ]);
    }

    // ··· (Delete) · Edit │ the link icons Stash draws beside the name
    function buildActions(g, header) {
        var edit = header.querySelector(".details-edit button.edit");
        var del = header.querySelector(".details-edit button.delete");
        var icons = A.icons(header.querySelector(".group-head .name-icons"));
        var items = del ? [{ label: "Delete", danger: true, onClick: function () { del.click(); } }] : [];
        // Only if the link icons couldn't be built do the addresses go
        // in the ··· menu instead
        var urls = icons ? [] : (g.urls || []).filter(Boolean);
        if (urls.length) {
            if (items.length) items.push({ divider: true });
            urls.forEach(function (url) {
                var href = /^https?:/i.test(url) ? url : "https://" + url;
                items.push({ label: href.replace(/^https?:\/\//i, "").replace(/\/$/, ""), href: href });
            });
        }
        return A.bar([
            items.length ? A.menu("···", items, "sticky-act-icon", "More") : null,
            edit ? A.button("Edit", function () {
                header.classList.add(EDITING_CLASS);
                edit.click();
            }) : null
        ], icons, "sticky-gp-actions");
    }

    function buildBody(g, header) {
        return el("div", BODY_CLASS, [
            facts(g),
            synopsis(g.synopsis),
            tagPills(g.tags),
            buildActions(g, header)
        ]);
    }

    /* ── Keeping it in step with Stash ────────────────────────────── */
    var pending = false;
    var lastSignature = null;

    function render() {
        pending = false;
        var id = groupIdFromPath();
        if (!id) return;
        var header = document.querySelector(".detail-header");
        var head = header && header.querySelector(".group-head");
        if (!header || !head) return;

        // Editing: Stash swaps the details for a form and its Edit
        // button becomes "Cancel"
        var editButton = header.querySelector(".details-edit button.edit");
        var viewing = !!editButton && !/cancel/i.test(text(editButton)) &&
            !header.querySelector("form, input:not([type='checkbox']), textarea, select");
        header.classList.toggle(EDITING_CLASS, !viewing);
        if (!viewing) return;

        load(id);
        var g = cache[id];
        if (!g) return;                 // Stash's own header stays until it lands

        var signature = [id, g.name, g.aliases, g.synopsis, g.date, g.duration,
            (g.tags || []).length, (g.urls || []).length].join("|");
        if (head.querySelector(":scope > ." + BODY_CLASS) && signature === lastSignature) return;
        lastSignature = signature;

        head.querySelectorAll(":scope > ." + HEAD_CLASS + ", :scope > ." + BODY_CLASS)
            .forEach(function (n) { n.remove(); });

        // Our title goes above Stash's rating stars and the rest below,
        // so the stars keep working exactly as they are.
        var stars = head.querySelector(":scope > .rating-stars");
        var ours = buildHead(g);
        var body = buildBody(g, header);
        if (stars) {
            head.insertBefore(ours, stars);
            stars.after(body);
        } else {
            head.insertBefore(ours, head.firstChild);
            ours.after(body);
        }
    }

    function schedule() {
        if (pending) return;
        pending = true;
        queueMicrotask(function () {
            try { render(); }
            catch (e) { console.warn("[Sticky] group page header failed, using Stash's default", e); }
        });
    }

    // Redraw whenever Stash changes the page, only while on a group page
    window.Sticky.watchPage({
        path: /^\/groups\/\d+/,
        ours: OURS,
        onChange: schedule,
        onLeave: function () { lastSignature = null; }
    });
})();
