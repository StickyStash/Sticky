/* ───────────────────────────────────────────────────────────────────
   Sticky — scene card additions

   Uses Stash's card hooks (PluginApi.patch) and the data each card
   already has, so no extra requests. Top to bottom:
     thumbnail   duration top right; Stash's counts (markers, O-count,
                 galleries…) bottom right, still hoverable and
                 clickable; within a group, the scene's number as a
                 white disc top left
     studio logo · "Aug 2021"
     title, always two lines tall
     "Performer One, Performer Two +3"
     synopsis, 2 lines
     tag pills (first 2 + "+N")

   Stash's own content is always rendered too, so nothing is lost, and
   the CSS only hides the old pieces once these additions exist.
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
    var pills = C.pills, formatDate = C.formatDate;
    function safe(fn) { return C.safe(fn, "scene card"); }
    var MAX_TAGS = 2;

    // Title is drawn by GridCard; this adds the row above it (pulled
    // up with order:-1 in cards.css — nothing React owns is moved),
    // the performers under it, then Stash's own details (synopsis;
    // its date is hidden by CSS).
    api.patch.instead("SceneCard.Details", safe(function (props, renderOriginal) {
        var scene = props.scene || {};
        var isPhone = C.useIsPhone();
        return h(React.Fragment, null,
            C.topLine(scene.studio, formatDate(scene.date)),
            C.names(scene.performers, isPhone),
            renderOriginal()
        );
    }));

    /* ── Scene number within a group ──────────────────────────────
       Stash writes "Scene #1" as a line of text in the footer. On a
       card that already carries a studio, a date, performers and
       tags, that line reads as another fact rather than as the
       scene's place in the group. The same number as a disc in the
       thumbnail's top-left corner says it at a glance and costs the
       card no height. Overlays is Stash's own slot inside the
       thumbnail, so nothing is positioned by hand. */
    function sceneNumber(props) {
        var groupId = props.fromGroupId;
        if (!groupId) return undefined;
        var groups = (props.scene && props.scene.groups) || [];
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].group && groups[i].group.id === groupId) {
                return groups[i].scene_index == null
                    ? undefined : groups[i].scene_index;
            }
        }
        return undefined;
    }

    api.patch.instead("SceneCard.Overlays", safe(function (props, renderOriginal) {
        var n = sceneNumber(props);
        if (n === undefined) return renderOriginal();   // not in a group
        return h(React.Fragment, null,
            renderOriginal(),
            h("span", { className: "sticky-scene-no", "aria-label": "Scene " + n }, n)
        );
    }));

    // Stash's counts go onto the thumbnail and the footer becomes the
    // tag row. Done on GridCard, which receives the counts as a
    // not-yet-drawn element, so they are placed, not moved.
    api.patch.instead("GridCard", function () {
        var args = Array.prototype.slice.call(arguments);
        var original = args.pop();
        var props = args[0] || {};
        var scene = props.popovers && props.popovers.props && props.popovers.props.scene;
        if (!scene || !/\bscene-card\b/.test(props.className || "")) {
            return original.apply(null, args);
        }
        try {
            var tags = pills(scene.tags, MAX_TAGS, "tag", "/tags/");
            // The tag and performer counts stay hidden (the card shows
            // both in full), so the badge is drawn only when one of the
            // others will show.
            var hasCounts = (scene.groups || []).length || (scene.scene_markers || []).length ||
                scene.o_counter || (scene.galleries || []).length || scene.organized;
            var next = Object.assign({}, props, {
                overlays: h(React.Fragment, null, props.overlays,
                    hasCounts ? C.thumbCounts(props.popovers) : null),
                // Drawn even with no tags: empty, it only closes the card.
                popovers: h("div", { className: "sticky-card-footer" }, tags)
            });
            return original.apply(null, [next].concat(args.slice(1)));
        } catch (e) {
            console.warn("[Sticky] scene card patch failed, using Stash's default", e);
            return original.apply(null, args);
        }
    });
})();
