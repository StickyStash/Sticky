/* ───────────────────────────────────────────────────────────────────
   Sticky — marker card additions

   Uses Stash's official SceneMarkerCard hooks to add, from the data
   each card already has (no extra requests):
     • a "15:37 – 16:47" time badge on the thumbnail (bottom left);
       the marker's length moves to the top right
     • "Performer One, Performer Two +3" under the title
     • a "From [scene title]" line, linking to the scene
     • a footer of tag pills (primary tag first, then the others)
   The title is always two lines tall, as on every other card. There
   is no studio · date row: a marker's scene comes without either.
   Stash's own count buttons are only performers and tags, which the
   card shows in full, so none go on the thumbnail.

   Stash's own content is still rendered, and the CSS only hides the
   old time / scene line once these additions exist. If anything here
   throws, the card falls back to Stash's original.
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
    var link = C.link, pills = C.pills;
    function safe(fn) { return C.safe(fn, "marker card"); }

    var MAX_TAGS = 2;

    // 937 → "15:37", 3725 → "1:02:05"
    function timestamp(total) {
        total = Math.max(0, Math.floor(total));
        var hrs = Math.floor(total / 3600);
        var min = Math.floor((total % 3600) / 60);
        var sec = total % 60;
        var pad = function (n) { return (n < 10 ? "0" : "") + n; };
        return hrs ? hrs + ":" + pad(min) + ":" + pad(sec) : min + ":" + pad(sec);
    }

    function timeRange(marker) {
        if (typeof marker.seconds !== "number") return null;
        var start = timestamp(marker.seconds);
        return typeof marker.end_seconds === "number" && marker.end_seconds > marker.seconds
            ? start + " – " + timestamp(marker.end_seconds)
            : start;
    }

    // Primary tag first, then the rest, without repeats
    function allTags(marker) {
        var seen = {};
        return [marker.primary_tag].concat(marker.tags || []).filter(function (t) {
            if (!t || seen[t.id]) return false;
            seen[t.id] = true;
            return true;
        });
    }

    // Thumbnail: Stash's preview + duration, plus the time badge
    api.patch.instead("SceneMarkerCard.Image", safe(function (props, renderOriginal) {
        var marker = props.marker || {};
        var time = timeRange(marker);
        return h(React.Fragment, null,
            renderOriginal(),
            time ? h("span", { className: "sticky-marker-time" }, time) : null
        );
    }));

    // Under the title: performers, then "From [scene]", then Stash's
    // own details (hidden by CSS once these are showing)
    api.patch.instead("SceneMarkerCard.Details", safe(function (props, renderOriginal) {
        var isPhone = C.useIsPhone();      // first: hooks must run every render
        var marker = props.marker || {};
        var scene = marker.scene || {};
        var from = scene.id
            ? h("div", { className: "sticky-marker-from" },
                h("span", { className: "sticky-marker-from__label" }, "From"),
                link("/scenes/" + scene.id, {
                    className: "sticky-marker-from__scene",
                    title: scene.title || ""
                }, scene.title || "Untitled scene"))
            : null;
        return h(React.Fragment, null,
            C.names(scene.performers, isPhone),
            from,
            renderOriginal()
        );
    }));

    // Footer: tag pills. Stash's buttons here are only the performer
    // and tag counts, which the card already shows in full.
    api.patch.instead("SceneMarkerCard.Popovers", safe(function (props) {
        return h("div", { className: "sticky-card-footer" },
            pills(allTags(props.marker || {}), MAX_TAGS, "tag", "/tags/"));
    }));
})();
