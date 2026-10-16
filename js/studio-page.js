/* ───────────────────────────────────────────────────────────────────
   Sticky — studio page

   [ logo ]   Studio Name
              AKA Alias, Another Alias +2
              ★★★★★
              Studio about it all.
              ──────────────────────────────────────
              Parent studio      Tags
              Parent Studio      (Tag)
              ──────────────────────────────────────
              Custom fields
              label  value    label  value
              ──────────────────────────────────────
                  ···  Meta IDs  Edit  │  ♥  ✓  🔗

   Stash gives plugins the studio's details panel (StudioDetailsPanel),
   so that is a straight replacement of what goes inside it — drawn by
   React from the studio's own record. The logo, title and stars are
   Stash's own markup, restyled in studio-page.css.

   The AKA line and the action row (page-actions.js, as on the
   performer, group and tag pages) are added to the page around the
   panel: Auto tag and Delete go behind "···", the StashDB-style IDs
   behind "Meta IDs", and the favourite, organised and link icons
   move down beside Edit. They click Stash's own hidden controls.
   Stash's URL list is dropped from the panel: the link icons hold
   the same addresses.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;
    var React = api.React;
    var h = React.createElement;

    var C = window.Sticky && window.Sticky.cards;
    if (!C) return;                                  // sticky-cards.js missing
    var link = C.link;

    /* ── Pieces ───────────────────────────────────────────────────── */
    function fact(label, value) {
        if (value == null || value === "" ||
            (Array.isArray(value) && !value.length)) return null;
        return h("div", { className: "sticky-sp-fact", key: label },
            h("div", { className: "sticky-sp-fact__label" }, label),
            h("div", { className: "sticky-sp-fact__value" }, value));
    }

    function tagPills(tags) {
        if (!tags || !tags.length) return null;
        return h("div", { className: "sticky-sp-pills" }, tags.map(function (t) {
            return link("/tags/" + t.id, {
                key: t.id, className: "sticky-pill sticky-pill--tag"
            }, t.name);
        }));
    }

    function facts(studio) {
        var parent = studio.parent_studio;
        var items = [
            fact("Parent studio", parent
                ? link("/studios/" + parent.id, { className: "sticky-sp-link" }, parent.name)
                : null),
            fact("Tags", tagPills(studio.tags))
        ].filter(Boolean);
        return items.length ? h("div", { className: "sticky-sp-facts" }, items) : null;
    }

    // custom_fields is a plain object of whatever the user has added
    function customFields(values) {
        if (!values) return null;
        var keys = Object.keys(values).filter(function (k) {
            var v = values[k];
            return v !== null && v !== undefined && String(v) !== "";
        });
        if (!keys.length) return null;
        return h("div", { className: "sticky-sp-custom" },
            h("h3", { className: "sticky-sp-custom__head" },
                "Custom fields",
                h("span", { className: "sticky-sp-count" }, keys.length)),
            h("div", { className: "sticky-sp-facts" }, keys.map(function (k) {
                return fact(k, String(values[k]));
            })));
    }

    /* ── The panel ────────────────────────────────────────────────── */
    api.patch.instead("StudioDetailsPanel", C.safe(function (props) {
        var studio = props.studio || {};
        var body = [
            studio.details ? h("p", { className: "sticky-sp-desc", key: "d" }, studio.details) : null,
            facts(studio),
            customFields(studio.custom_fields)
        ].filter(Boolean);
        // The IDs ride along (hidden) for the action row to read
        idsByStudio[studio.id] = (studio.stash_ids || []).map(function (s) {
            var host = String(s.endpoint || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
            return {
                label: host || "external",
                href: String(s.endpoint || "").replace(/\/graphql\/?$/, "") + "/studios/" + s.stash_id
            };
        });
        schedule();
        // Always drawn, even with nothing in it: the page's layout is
        // keyed to its presence (studio-page.css)
        return h("div", { className: "detail-group sticky-sp" +
            (body.length ? "" : " sticky-sp--empty") }, body);
    }, "studio page"));

    /* ── AKA line and action row ──────────────────────────────────── */
    var A = window.Sticky.actions;
    var X = "sticky-sp-x";                          // our nodes in Stash's header
    var idsByStudio = {};
    var lastSignature = null;
    var pending = false;

    function studioId() {
        var m = window.location.pathname.match(/^\/studios\/(\d+)/);
        return m ? m[1] : null;
    }
    function clear() {
        document.querySelectorAll("." + X).forEach(function (n) { n.remove(); });
        lastSignature = null;
    }

    function render() {
        pending = false;
        var id = studioId();
        var head = id && document.querySelector(".detail-header .studio-head");
        var edit = head && head.querySelector(":scope > .details-edit button.edit");
        // Not on a studio, or editing (Edit has become Cancel): Stash's own
        if (!A || !head || !edit || /cancel/i.test(edit.textContent) ||
            head.querySelector("form, input:not([type='checkbox']), textarea")) {
            clear();
            return;
        }
        var nameIcons = head.querySelector("h2 .name-icons");
        var aliasText = (head.querySelector(".alias-head") || {}).textContent || "";
        var buttons = [].slice.call(head.querySelectorAll(":scope > .details-edit button"));
        var signature = [id, aliasText, nameIcons ? nameIcons.children.length : 0,
            buttons.map(function (b) { return b.textContent; }).join(","),
            (idsByStudio[id] || []).length].join("|");
        var bar = head.querySelector(":scope > .sticky-act-bar." + X);
        if (bar && signature === lastSignature) {
            A.sync(bar);
            return;
        }
        clear();
        lastSignature = signature;

        var line = A.aka(A.splitAliases(aliasText), "sticky-sp-aka " + X);
        var h2 = head.querySelector(":scope > h2");
        if (line && h2) h2.after(line);

        head.appendChild(A.bar([
            A.more(buttons.filter(function (b) { return b !== edit; })),
            A.metaIds(idsByStudio[id]),
            A.button("Edit", function () { edit.click(); })
        ], A.icons(nameIcons), "sticky-sp-actions " + X));
    }

    function schedule() {
        if (pending) return;
        pending = true;
        queueMicrotask(function () {
            try { render(); }
            catch (e) { console.warn("[Sticky] studio page actions failed, using Stash's own", e); }
        });
    }

    window.Sticky.watchPage({
        path: /^\/studios\/\d+/,
        ours: "." + X,
        classes: true,                  // favourite / organised state
        onChange: schedule,
        onLeave: clear
    });
})();
