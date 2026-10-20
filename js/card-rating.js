/* ───────────────────────────────────────────────────────────────────
   Sticky — rating pill on card thumbnails

   Stash marks a rated card with a coloured ribbon across the
   thumbnail's top-left corner ("Rating: 4"). Sticky shows it instead
   as a small "★ 4.5" pill in the thumbnail's bottom-left corner, level
   with the counts badge in the bottom-right.

   Scene, gallery, group, studio and image cards. Performer cards
   already show their rating after the name (performer-cards.js).

   The number follows your own rating system (Settings → Interface →
   Editing): stars at your chosen precision, or decimal out of 10.

   Each card's own component is wrapped and the pill added to the
   thumbnail's overlays, which Stash draws inside the thumbnail —
   nothing is positioned by hand and nothing React owns is changed.
   Stash's ribbon is only hidden once this script is running (a class
   on <body>), so if it ever fails, the ribbon is still there.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;
    var React = api.React;
    var h = React.createElement;

    /* ── Your rating system ───────────────────────────────────────
       Kept in the browser so the first paint is right, then checked
       against Stash once per page load. */
    var LS_KEY = "sticky.rating";
    var system = { type: "stars", starPrecision: "full" };
    try {
        var saved = JSON.parse(window.localStorage.getItem(LS_KEY) || "null");
        if (saved && saved.type) system = saved;
    } catch (e) { /* private mode */ }

    var listeners = [];
    var asked = false;
    function ask() {
        if (asked || !window.Sticky.gql) return;
        asked = true;
        window.Sticky.gql("query { configuration { ui } }").then(function (json) {
            var ui = json && json.data && json.data.configuration && json.data.configuration.ui;
            var opts = ui && ui.ratingSystemOptions;
            if (!opts || !opts.type) opts = { type: "stars", starPrecision: "full" };
            if (opts.type === system.type && opts.starPrecision === system.starPrecision) return;
            system = { type: opts.type, starPrecision: opts.starPrecision || "full" };
            try { window.localStorage.setItem(LS_KEY, JSON.stringify(system)); } catch (e) { /* ignore */ }
            listeners.slice().forEach(function (set) { set(system); });
        }).catch(function (e) {
            console.warn("[Sticky] couldn't read the rating system, showing stars", e);
        });
    }

    function useSystem() {
        var pair = React.useState(system);
        var set = pair[1];
        React.useEffect(function () {
            listeners.push(set);
            ask();
            return function () {
                var i = listeners.indexOf(set);
                if (i !== -1) listeners.splice(i, 1);
            };
        }, []);
        return pair[0];
    }

    // The same sums Stash uses (convertToRatingFormat): rating100 out
    // of 10 for decimal, out of 5 for stars, rounded to the precision.
    var STEP = { full: 1, half: 0.5, quarter: 0.25, tenth: 0.1 };
    function label(rating100, sys) {
        if (typeof rating100 !== "number" || rating100 <= 0) return null;
        var decimal = sys.type === "decimal";
        var step = decimal ? 0.1 : (STEP[sys.starPrecision] || 1);
        var value = Math.round((rating100 / (decimal ? 10 : 20)) / step) * step;
        // Trim floating-point noise (4.3000000001) and trailing zeros
        return String(parseFloat(value.toFixed(2)));
    }

    function RatingPill(props) {
        var sys = useSystem();
        var text = label(props.rating, sys);
        if (!text) return null;
        return h("span", {
            className: "sticky-thumb-rating",
            title: "Rating " + text + (sys.type === "decimal" ? " out of 10" : " out of 5")
        }, text);
    }

    /* ── Adding it to each card ───────────────────────────────────── */
    var CARDS = [
        ["SceneCard", "scene"],
        ["GalleryCard", "gallery"],
        ["GroupCard", "group"],
        ["StudioCard", "studio"],
        ["ImageCard", "image"]
    ];

    CARDS.forEach(function (pair) {
        var name = pair[0], field = pair[1];
        api.patch.after(name, function () {
            var args = Array.prototype.slice.call(arguments);
            var result = args.pop();
            try {
                var props = args[0] || {};
                var item = props[field] || (field === "group" ? props.movie : null);
                if (!item || !item.rating100 || !React.isValidElement(result)) return result;
                return React.cloneElement(result, {
                    overlays: h(React.Fragment, null,
                        result.props.overlays,
                        h(RatingPill, { key: "sticky-thumb-rating", rating: item.rating100 }))
                });
            } catch (e) {
                console.warn("[Sticky] rating pill: leaving the " + field + " card as it is", e);
                return result;
            }
        });
    });

    function mark() { document.body.classList.add("sticky-card-rating"); }
    if (document.body) mark();
    else document.addEventListener("DOMContentLoaded", mark);
})();
