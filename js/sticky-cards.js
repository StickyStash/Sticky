/* ───────────────────────────────────────────────────────────────────
   Sticky — the pieces every card is built from

   Scene, performer, gallery, image, marker and group cards all drew
   the same things, and each script carried its own copy: five copies
   of the pill row, six of the date, nine of the in-app link. So a fix
   landed on one card type and quietly missed the other five — which
   is exactly what happened when "+N" gained its popover.

   They live here now, once:

       Sticky.cards.link(to, props, children)   in-app link
       Sticky.cards.pills(items, max, kind, path)
                                               first N as pills, then
                                               "+N" with the rest in a
                                               hover popover
       Sticky.cards.safe(fn, label)             a patch that falls back
                                               to Stash's own card if
                                               anything throws
       Sticky.cards.formatDate("2021-08-11")    → "Aug 2021"
       Sticky.cards.studioLogo(studio, extra?)   the studio's logo tile
       Sticky.cards.useIsPhone()                 phone-width, live
       Sticky.cards.peopleLine(people, date, phone)
                                               performers + date: two
                                               rows on a desktop, one
                                               line on a phone (image
                                               cards)
       Sticky.cards.topLine(studio, date)       logo · "Aug 2021"
       Sticky.cards.names(people, phone)        "One, Two +3"
       Sticky.cards.thumbCounts(popovers)       Stash's counts, moved
                                               onto the thumbnail

   Loaded before the card scripts; each of them stands down if this
   file is missing, so the worst case is Stash's own cards.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.React) return;

    var React = api.React;
    var h = React.createElement;
    var router = api.libraries && api.libraries.ReactRouterDOM;
    var Link = router && router.Link;

    /* ── Links ────────────────────────────────────────────────────── */
    // Stash's router link when it's there, a plain one otherwise, so a
    // click never reloads the whole app.
    function link(to, props, children) {
        return Link
            ? h(Link, Object.assign({ to: to }, props), children)
            : h("a", Object.assign({ href: to }, props), children);
    }

    /* ── Pills, and the "+N" popover ──────────────────────────────── */
    // Stash's own popover component. Looked up when a card is drawn,
    // not when this file loads: Stash registers its components after
    // the plugin scripts run, so reading it up front gets undefined.
    function hoverPopover() {
        return api.components && api.components.HoverPopover;
    }

    // label: what to hover over; defaults to a dashed "+N" pill.
    function morePill(rest, kind, pathBase, label) {
        label = label || h("span", { className: "sticky-pill sticky-pill--more" }, "+" + rest.length);
        var HoverPopover = hoverPopover();
        if (!HoverPopover) {
            // No popover available: fall back to a plain tooltip.
            return h("span", {
                key: "more",
                title: rest.map(function (i) { return i.name; }).join(", ")
            }, label);
        }
        return h(HoverPopover, {
            key: "more",
            className: "sticky-more-wrap",
            placement: "top",
            content: h("div", { className: "sticky-popover-list" }, rest.map(function (item) {
                return link(pathBase + item.id, {
                    key: item.id,
                    className: "sticky-pill sticky-pill--" + kind
                }, item.name);
            }))
        }, label);
    }

    // The first `max` items as pills, then "+N" for the rest.
    function pills(items, max, kind, pathBase) {
        if (!items || !items.length) return null;
        var out = items.slice(0, max).map(function (item) {
            return link(pathBase + item.id, {
                key: item.id,
                className: "sticky-pill sticky-pill--" + kind,
                title: item.name
            }, item.name);
        });
        var rest = items.slice(max);
        if (rest.length) out.push(morePill(rest, kind, pathBase));
        return h("div", { className: "sticky-pills sticky-pills--" + kind }, out);
    }

    /* ── Phone layout ─────────────────────────────────────────────
       Several cards lay their body out differently on a phone, and
       the difference isn't something CSS alone can do (the pills stop
       being links and gain a tap target). This reports the viewport
       and re-renders the cards when it changes, so turning the phone
       on its side is enough to swap layouts. */
    var PHONE = "(max-width: 767.98px)";
    function useIsPhone() {
        var mq = window.matchMedia(PHONE);
        var state = React.useState(mq.matches);
        var isPhone = state[0], setIsPhone = state[1];
        React.useEffect(function () {
            function onChange(e) { setIsPhone(e.matches); }
            mq.addEventListener("change", onChange);
            if (mq.matches !== isPhone) setIsPhone(mq.matches);
            return function () { mq.removeEventListener("change", onChange); };
        }, []);
        return isPhone;
    }

    /* ── A bubble that opens on tap ───────────────────────────────
       Stash's HoverPopover listens for onMouseEnter and onMouseLeave
       only, so on a touch screen it either never opens or opens on a
       stray synthetic hover and then won't close. react-bootstrap's
       OverlayTrigger (which Stash already ships, and exposes through
       PluginApi.libraries.Bootstrap) does open on a tap and closes
       when you tap elsewhere. The bubble carries Stash's own
       hover-popover-content class, so it is themed by the same rules
       as the "+N" popover on a desktop. */
    function tapPopover(items, kind, pathBase, child, className) {
        var B = api.libraries && api.libraries.Bootstrap;
        var wrapped = h("div", { className: className }, child);
        if (!B || !B.OverlayTrigger || !B.Popover || !items || !items.length) {
            return wrapped;
        }
        return h(B.OverlayTrigger, {
            trigger: "click",
            rootClose: true,
            placement: "bottom",
            overlay: h(B.Popover, {
                id: "sticky-tap-popover",
                className: "hover-popover-content sticky-tap-popover"
            }, h("div", { className: "sticky-popover-list" }, items.map(function (item) {
                return link(pathBase + item.id, {
                    key: item.id,
                    className: "sticky-pill sticky-pill--" + kind
                }, item.name);
            })))
        }, wrapped);
    }

    /* ── Performers and date, one line ────────────────────────────
       On a desktop these are two rows of the card body, as before —
       the wrapper is a column and looks exactly as it did. On a
       phone the wrapper turns into a row: the performers take the
       space they need and the date sits at its end.

       The phone version shows every performer rather than two and a
       "+N", and lets the row be cut off by the card's width, fading
       at the cut (cards.css). The pills there are not links — the
       whole row is one tap target that opens the bubble listing
       everyone — because a row that is deliberately cut short can't
       also be a set of individually tappable links without the last,
       half-visible one becoming a trap. */
    function peopleLine(performers, date, isPhone) {
        var people = performers || [];
        var row;
        if (isPhone && people.length) {
            row = tapPopover(people, "performer", "/performers/",
                h("div", { className: "sticky-pills sticky-pills--performer" },
                    people.map(function (p) {
                        return h("span", {
                            key: p.id,
                            className: "sticky-pill sticky-pill--performer"
                        }, p.name);
                    })),
                "sticky-pills-tap");
        } else {
            row = pills(people, 2, "performer", "/performers/");
        }
        if (!row && !date) return null;
        return h("div", { className: "sticky-card-line" },
            row,
            date ? h("span", { className: "sticky-date" }, date) : null);
    }

    /* ── The card's first row: studio logo · date ─────────────────
       Always drawn, even with neither, so every title in a row of
       cards starts at the same height. */
    function topLine(studio, date) {
        var logo = studioLogo(studio, "sticky-studio--top");
        return h("div", { className: "sticky-card-top" },
            logo,
            logo && date ? h("span", { className: "sticky-card-top__dot", "aria-hidden": true }, "\u00b7") : null,
            date ? h("span", { className: "sticky-date" }, date) : null);
    }

    /* ── Performers as text: "Name One, Name Two +3" ──────────────
       The first two as links, then "+N" listing the rest — a hover
       popover on a desktop, a tap one on a phone (HoverPopover is
       mouse-only). One line; a long name is cut with an ellipsis and
       "+N" always stays visible. */
    function names(people, isPhone) {
        if (!people || !people.length) return null;
        var list = people.slice(0, 2).map(function (p, i) {
            return h(React.Fragment, { key: p.id }, i ? ", " : null,
                link("/performers/" + p.id, { className: "sticky-names__name" }, p.name));
        });
        var rest = people.slice(2), more = null;
        if (rest.length) {
            var label = h("span", { className: "sticky-names__more" }, "+" + rest.length);
            more = isPhone
                ? tapPopover(rest, "performer", "/performers/", label, "sticky-names__tap")
                : morePill(rest, "performer", "/performers/", label);
        }
        return h("div", { className: "sticky-names" },
            h("span", { className: "sticky-names__list" }, list), more);
    }

    /* ── Stash's counts, over the thumbnail ───────────────────────
       GridCard draws `overlays` inside the thumbnail but outside its
       link, so the count buttons placed there keep their own hover
       popovers and clicks, and never open the card by accident. */
    function thumbCounts(counts) {
        return counts ? h("div", { className: "sticky-thumb-counts" }, counts) : null;
    }

    /* ── Dates ────────────────────────────────────────────────────── */
    // Fixed three-letter months: some locales write "Sept" or "June".
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // "2021-08-11" / "2021-08" → "Aug 2021"; "2021" stays "2021".
    function formatDate(date) {
        if (!date) return null;
        var parts = String(date).split("-");
        var month = parseInt(parts[1], 10);
        return parts.length > 1 && month >= 1 && month <= 12
            ? MONTHS[month - 1] + " " + parts[0]
            : parts[0];
    }

    /* ── Studio logo ──────────────────────────────────────────────── */
    // extra: an optional second class, e.g. "sticky-studio--top" for a
    // logo that sits above a card's title rather than in its footer.
    function studioLogo(studio, extra) {
        if (!studio || !studio.image_path) return null;
        return link("/studios/" + studio.id, {
            className: "sticky-studio" + (extra ? " " + extra : ""),
            title: studio.name
        }, h("img", { src: studio.image_path, alt: studio.name, loading: "lazy" }));
    }

    /* ── Safety net ───────────────────────────────────────────────── */
    // Wraps a patch so anything thrown inside it falls back to the part
    // of the card Stash would have drawn.
    //
    // A patch that returns nothing gets the same treatment. React
    // treats an undefined return from a component as a hard error and
    // blanks the whole page ("Something went wrong"), which is a
    // brutal outcome for a patch that simply had nothing to add for
    // this particular card — so "nothing to add" is read here as
    // "leave Stash's version alone". To render genuinely nothing, a
    // patch returns null.
    function safe(fn, label) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            var original = args.pop();
            var renderOriginal = function () { return original.apply(null, args); };
            try {
                var result = fn(args[0] || {}, renderOriginal);
                return result === undefined ? renderOriginal() : result;
            } catch (e) {
                console.warn("[Sticky] " + (label || "card") +
                    " patch failed, using Stash's default", e);
                return renderOriginal();
            }
        };
    }

    /* ── Add-on pills for performer cards ─────────────────────────
       Components pushed here are drawn after the career pill on every
       performer card, each given { performer }. It lets an optional
       file add to the card without the card knowing it exists. */
    var performerPills = [];

    window.Sticky = window.Sticky || {};
    window.Sticky.cards = {
        performerPills: performerPills,
        h: h,
        link: link,
        pills: pills,
        morePill: morePill,
        tapPopover: tapPopover,
        useIsPhone: useIsPhone,
        peopleLine: peopleLine,
        topLine: topLine,
        names: names,
        thumbCounts: thumbCounts,
        formatDate: formatDate,
        studioLogo: studioLogo,
        safe: safe,
        MONTHS: MONTHS
    };
})();
