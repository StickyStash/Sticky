/* ───────────────────────────────────────────────────────────────────
   Sticky — group card additions

   Groups have no card hook of their own, so this patches Stash's
   general GridCard and steps aside for every other kind of card.
   Laid out like a scene card, from the data Stash already hands the
   card (no extra requests):

     cover          Stash's counts (scenes, sub-groups, O-count)
                    bottom right, still hoverable and clickable
     studio logo · "Dec 2024"
     title, always two lines tall
     synopsis, 2 lines
     tag pills (2, then "+N" to show the rest)

   No performers line: a group record has no performers of its own
   (only a performer_count, which the card isn't given), and building
   one from its scenes would cost a request per card.

   The "+N" opens the remaining tags on the card, which makes it
   taller — and, since cards share a row, its neighbours too. Tapping
   the "−" puts them away again.

   If anything here throws, the card falls back to Stash's original.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;

    var React = api.React;
    var h = React.createElement;

    // Shared card pieces (sticky-cards.js): links, pill rows with
    // their "+N" popover, dates, the studio tile, and the safety net.
    var C = window.Sticky && window.Sticky.cards;
    if (!C) return;
    var link = C.link, formatDate = C.formatDate;
    function safe(fn) { return C.safe(fn, "group card"); }
    var MAX_TAGS = 2;

    // Looks through the parts Stash passes to the card (not yet drawn)
    // for a given prop, e.g. the group record itself.
    function findProp(node, name, depth) {
        depth = depth || 0;
        if (!node || depth > 8) return null;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) {
                var found = findProp(node[i], name, depth + 1);
                if (found != null) return found;
            }
            return null;
        }
        if (typeof node !== "object" || !node.props) return null;
        if (node.props[name] != null) return node.props[name];
        return findProp(node.props.children, name, depth + 1);
    }
    function findByClass(node, cls, depth) {
        depth = depth || 0;
        if (!node || depth > 8) return null;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) {
                var found = findByClass(node[i], cls, depth + 1);
                if (found) return found;
            }
            return null;
        }
        if (typeof node !== "object" || !node.props) return null;
        if (typeof node.props.className === "string" &&
            node.props.className.split(" ").indexOf(cls) !== -1) return node;
        return findByClass(node.props.children, cls, depth + 1);
    }

    // Tag pills: the first two, then "+N" to show the rest on the card
    function TagPills(props) {
        var state = React.useState(false);
        var open = state[0], setOpen = state[1];
        var tags = props.tags || [];
        if (!tags.length) return null;

        var shown = open ? tags : tags.slice(0, MAX_TAGS);
        var hidden = tags.length - shown.length;
        var items = shown.map(function (tag) {
            return link("/tags/" + tag.id, {
                key: tag.id,
                className: "sticky-pill sticky-pill--tag",
                title: tag.name
            }, tag.name);
        });

        function toggle(e) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(!open);
        }
        if (hidden > 0) {
            items.push(h("button", {
                key: "more",
                type: "button",
                className: "sticky-pill sticky-pill--more",
                title: tags.slice(MAX_TAGS).map(function (t) { return t.name; }).join(", "),
                onClick: toggle
            }, "+" + hidden));
        } else if (open && tags.length > MAX_TAGS) {
            items.push(h("button", {
                key: "less",
                type: "button",
                className: "sticky-pill sticky-pill--more",
                title: "Show fewer tags",
                onClick: toggle
            }, "−"));
        }
        return h("div", { className: "sticky-pills sticky-pills--tag" + (open ? " is-open" : "") }, items);
    }

    /* Stash doesn't pass the group record down to the general card it
       builds, so the group card's own component is wrapped and the
       record added to what it hands down. (Setting it aside in a
       variable doesn't work: React draws the inner card later, by
       which time the variable has moved on to the next card.) */
    api.patch.instead("GroupCard", function () {
        var args = Array.prototype.slice.call(arguments);
        var original = args.pop();
        var props = args[0] || {};
        var result = original.apply(null, args);
        var group = props.group || props.movie;
        try {
            return group && result && result.props
                ? React.cloneElement(result, { stickyGroup: group })
                : result;
        } catch (e) {
            console.warn("[Sticky] group card: couldn't pass the group down", e);
            return result;
        }
    });

    api.patch.instead("GridCard", function () {
        var args = Array.prototype.slice.call(arguments);
        var original = args.pop();
        var props = args[0] || {};
        if (!/\bgroup-card\b|\bmovie-card\b/.test(props.className || "")) {
            return original.apply(null, args);
        }

        try {
            var parts = [props.details, props.popovers, props.overlays, props.image];
            var group = props.stickyGroup || props.group || props.movie ||
                findProp(parts, "group") || findProp(parts, "movie") || {};
            var tags = group.tags || findProp(props.popovers, "tags");
            var studio = group.studio || findProp(props.overlays, "studio");

            var rawDate = group.date;
            if (!rawDate) {
                var dateNode = findByClass(props.details, "group-card__date");
                rawDate = dateNode && dateNode.props.children;
            }
            var date = formatDate(rawDate);

            // Stash's popovers arrive already built: a "Scene #N" /
            // containing-group note, a divider, and the count buttons.
            // The buttons go on the cover, minus the tag count (the
            // pills say it); the note stays in the body.
            var counts = null, note = null;
            var buttons = findByClass(props.popovers, "card-popovers");
            if (buttons) {
                var kept = React.Children.toArray(buttons.props.children)
                    .filter(function (c) { return !findByClass(c, "tag-count"); });
                if (kept.length) counts = React.cloneElement(buttons, null, kept);
                note = React.Children.toArray(props.popovers.props.children)
                    .filter(function (c) { return c.type !== "hr" && !findByClass(c, "card-popovers"); });
            }

            var next = Object.assign({}, props, {
                details: h(React.Fragment, null,
                    C.topLine(studio, date),
                    props.details,
                    note && note.length ? h("div", { className: "sticky-gc-note" }, note) : null),
                overlays: h(React.Fragment, null, props.overlays, C.thumbCounts(counts)),
                popovers: h("div", { className: "sticky-card-footer" },
                    h(TagPills, { tags: tags }))
            });
            delete next.stickyGroup;      // not Stash's prop; don't pass it on
            return original.apply(null, [next].concat(args.slice(1)));
        } catch (e) {
            console.warn("[Sticky] group card patch failed, using Stash's default", e);
            return original.apply(null, args);
        }
    });
})();
