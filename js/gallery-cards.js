/* ───────────────────────────────────────────────────────────────────
   Sticky — gallery card additions

   There's no gallery-specific card hook, but every card is built on
   Stash's general GridCard, which is patchable. For gallery cards only
   (every other card passes straight through), laid out like a scene
   card, from data Stash has already handed the card (no requests):
     cover        Stash's counts (images, scenes…) bottom right
     studio logo · "Sep 2020"
     title, always two lines tall
     "Performer One, Performer Two +3"
     description, 2 lines
     tag pills (first 2 + "+N")
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
    var pills = C.pills, formatDate = C.formatDate;
    function safe(fn) { return C.safe(fn, "gallery card"); }
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
        if (!/\bgallery-card\b/.test(props.className || "")) return original.apply(null, args);

        try {
            // Stash usually hands the card's parts the whole gallery
            // object; read everything from that when it's there, and
            // fall back to the individual props otherwise.
            var parts = [props.details, props.popovers, props.overlays, props.image];
            var gallery = props.gallery || findProp(parts, "gallery") || {};
            var performers = gallery.performers || findProp(props.popovers, "performers");
            var tags = gallery.tags || findProp(props.popovers, "tags");
            var studio = gallery.studio || findProp(props.overlays, "studio");
            var rawDate = gallery.date;
            if (!rawDate) {
                var dateNode = findByClass(props.details, "gallery-card__date");
                rawDate = dateNode && dateNode.props.children;
            }
            var date = formatDate(rawDate);

            var next = Object.assign({}, props, {
                details: h(React.Fragment, null,
                    C.topLine(studio, date),
                    C.names(performers, isPhone),
                    props.details),
                // Only when a count other than tags/performers (shown
                // in full on the card) will be in it.
                overlays: h(React.Fragment, null, props.overlays,
                    gallery.image_count || (gallery.scenes || []).length || gallery.organized
                        ? C.thumbCounts(props.popovers) : null),
                popovers: h("div", { className: "sticky-card-footer" },
                    pills(tags, MAX_TAGS, "tag", "/tags/"))
            });
            return original.apply(null, [next].concat(args.slice(1)));
        } catch (e) {
            console.warn("[Sticky] gallery card patch failed, using Stash's default", e);
            return original.apply(null, args);
        }
    });
})();
