/* ───────────────────────────────────────────────────────────────────
   Sticky — image card additions (Images page)
   (includes a named gallery pill in the footer, replacing the count)

   There's no image-specific card hook, but every card is built on
   Stash's general GridCard, which is patchable. For image cards only
   (every other card passes straight through), this adds, from data
   Stash has already handed the card, so no extra requests:
     • performer pills under the title (first 2 + "+N")
     • a friendlier date ("Sep 2020") above the description
     • tag pills under the description (first 2 + "+N")
     • a footer: studio logo tile, then Stash's counts
   Stash's own content is always rendered too; if anything throws, the
   card falls back to Stash's original.
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
    var link = C.link, pills = C.pills, formatDate = C.formatDate,
        studioLogo = C.studioLogo;
    function safe(fn) { return C.safe(fn, "image card"); }
    var MAX_PERFORMERS = 2;
    var MAX_TAGS = 2;

    // Looks through the parts Stash passes to the card (not yet drawn)
    // for a given prop, e.g. the performers list given to the
    // performers popup button, or the studio given to the logo.
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
        if (typeof node.props.className === "string" && node.props.className.split(" ").indexOf(cls) !== -1) return node;
        return findByClass(node.props.children, cls, depth + 1);
    }

    // "2020-09-12" / "2020-09" → "Sep 2020"; "2020" stays "2020".
    // Fixed three-letter months (some locales write "Sept" or "June").
    // A real image record: an object with an id, not a React element
    function findRecord(node, name, depth) {
        depth = depth || 0;
        if (!node || depth > 8) return null;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) {
                var found = findRecord(node[i], name, depth + 1);
                if (found) return found;
            }
            return null;
        }
        if (typeof node !== "object" || !node.props) return null;
        var value = node.props[name];
        if (value && typeof value === "object" && !value.$$typeof && "id" in value) return value;
        return findRecord(node.props.children, name, depth + 1);
    }

    // The gallery (or galleries) the image belongs to, named. Galleries
    // without a title are named after their folder or zip file.
    function galleryName(g) {
        if (g.title) return g.title;
        var path = (g.folder && g.folder.path) || (g.files && g.files[0] && g.files[0].path) || "";
        var base = path.split(/[\\/]/).filter(Boolean).pop();
        return base || "Gallery " + g.id;
    }
    function galleryPills(galleries) {
        if (!Array.isArray(galleries) || !galleries.length) return null;
        var first = galleries[0];
        // The name gets its own element: "…" only works on plain text,
        // not directly inside a flex layout
        var out = [link("/galleries/" + first.id, {
            key: first.id, className: "sticky-pill sticky-pill--gallery", title: galleryName(first)
        }, h("span", { className: "sticky-gallery-name" }, galleryName(first)))];
        if (galleries.length > 1) {
            out.push(h("span", {
                key: "more", className: "sticky-pill sticky-pill--more",
                title: galleries.slice(1).map(galleryName).join(", ")
            }, "+" + (galleries.length - 1)));
        }
        return h("div", { className: "sticky-pills sticky-pills--gallery" }, out);
    }

    api.patch.instead("GridCard", function () {
        var args = Array.prototype.slice.call(arguments);
        var original = args.pop();
        var props = args[0] || {};
        // Called before the card-type check below, so this patch uses
        // the same number of hooks on every GridCard render whatever
        // kind of card it turns out to be — React tracks hooks by
        // position, and a patch that sometimes skipped one would break
        // the moment a scene list and a gallery list reused the same
        // place in the tree.
        var isPhone = C.useIsPhone();
        if (!/\bimage-card\b/.test(props.className || "")) return original.apply(null, args);

        try {
            // Stash usually hands the card's parts the whole image
            // record; read everything from that when it's there, and
            // fall back to the individual props otherwise. (The card's
            // own `image` prop is its picture, not the record, so only
            // a real record with an id counts.)
            var parts = [props.details, props.popovers, props.overlays];
            var record = findRecord(parts, "image") || {};
            var performers = record.performers || findProp(props.popovers, "performers");
            var tags = record.tags || findProp(props.popovers, "tags");
            var studio = record.studio || findProp(props.overlays, "studio");
            var galleries = record.galleries || findProp(props.popovers, "galleries");
            var rawDate = record.date;
            if (!rawDate) {
                var dateNode = findByClass(props.details, "image-card__date");
                rawDate = dateNode && dateNode.props.children;
            }
            var date = formatDate(rawDate);

            // Above the title, as on a scene card. A card with no
            // studio still gets the empty slot, so titles line up
            // across a row.
            var logo = studioLogo(studio, "sticky-studio--top") ||
                h("span", { className: "sticky-studio sticky-studio--top", "aria-hidden": true });

            var next = Object.assign({}, props, {
                details: h(React.Fragment, null,
                    logo,
                    C.peopleLine(performers, date, isPhone),
                    props.details,
                    pills(tags, MAX_TAGS, "tag", "/tags/")),
                popovers: h("div", { className: "sticky-card-footer" },
                    galleryPills(galleries),
                    h("div", { className: "sticky-card-extras" }, props.popovers))
            });
            return original.apply(null, [next].concat(args.slice(1)));
        } catch (e) {
            console.warn("[Sticky] image card patch failed, using Stash's default", e);
            return original.apply(null, args);
        }
    });
})();
