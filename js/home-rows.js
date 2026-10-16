/* ───────────────────────────────────────────────────────────────────
   Sticky — home page rows that scroll natively

   Stash draws each home row as a react-slick carousel. Slick isn't
   scrolling: it follows a drag with JavaScript, then on release
   ignores how fast you were going and slides to the nearest card in
   300ms — no momentum, which is why a swipe "locked in" — and it
   doesn't listen for scroll events, so a trackpad's two-finger swipe
   did nothing.

   FilteredRecommendationRow (patchable) builds the row as usual —
   Stash still fetches and draws every card — and this swaps the
   not-yet-drawn Slider for a plain strip holding the same cards. The
   browser does the scrolling: momentum and rubber-banding on a
   phone, trackpad swipes on a Mac. Desktop gets two chevrons that
   page by whole cards. No dots, and no endless loop: a strip stops at
   its ends.

   If anything here throws, the row falls back to Stash's carousel.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;

    var React = api.React;
    var h = React.createElement;

    function Strip(props) {
        var ref = React.useRef(null);
        var state = React.useState({ start: true, end: true });
        var ends = state[0], setEnds = state[1];

        // Which arrows make sense: none at the start, none at the end.
        var update = React.useCallback(function () {
            var el = ref.current;
            if (!el) return;
            var start = el.scrollLeft <= 1;
            var end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
            setEnds(function (o) {
                return o.start === start && o.end === end ? o : { start: start, end: end };
            });
        }, []);

        // Re-checked after every render (the cards replace the loading
        // placeholders) and whenever the strip is resized.
        React.useEffect(update);
        React.useEffect(function () {
            var el = ref.current;
            if (!el || !window.ResizeObserver) return update();
            var ro = new ResizeObserver(update);
            ro.observe(el);
            update();
            return function () { ro.disconnect(); };
        }, [update]);

        // One page: the first card cut off at the right edge becomes
        // the first card on the left, or back the other way. Positions
        // are where a card sits when it is the first one shown: its
        // left edge less its margin and the strip's own padding.
        function page(dir) {
            var el = ref.current;
            if (!el) return;
            var cs = getComputedStyle(el);
            var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
            var view = el.clientWidth - padL - padR;
            var pos = function (c) {
                return c.offsetLeft - (parseFloat(getComputedStyle(c).marginLeft) || 0) - padL;
            };
            var cards = el.children, left = el.scrollLeft, target = null, i;
            for (i = 0; i < cards.length && target === null; i++) {
                var p = pos(cards[i]);
                if (dir > 0 ? p + cards[i].offsetWidth > left + view + 1 : p >= left - view - 1) target = p;
            }
            if (target === null) target = dir > 0 ? el.scrollWidth : 0;
            el.scrollTo({ left: target, behavior: "smooth" });
        }

        function arrow(dir, hidden) {
            return h("button", {
                type: "button",
                className: "sticky-row__arrow sticky-row__arrow--" + (dir > 0 ? "next" : "prev"),
                "aria-label": dir > 0 ? "Next" : "Previous",
                hidden: hidden,
                onClick: function () { page(dir); }
            });
        }

        return h("div", { className: "sticky-row" },
            h("div", { ref: ref, className: "sticky-row__strip", onScroll: update }, props.children),
            arrow(-1, ends.start),
            arrow(1, ends.end));
    }

    api.patch.instead("FilteredRecommendationRow", function () {
        var args = Array.prototype.slice.call(arguments);
        var original = args.pop();
        var props = args[0] || {};
        var row = original.apply(null, args);
        try {
            if (!row || !row.props) return row;            // empty row: null
            // Stash keys every loading placeholder "_undefined", so
            // when the cards arrive React can't tell the placeholders
            // apart and leaves all but one on the page (slick re-keyed
            // its slides, which hid this). Keying the whole set by
            // loading state swaps placeholders for cards in one go.
            return React.cloneElement(row, null, h(Strip, null,
                h(React.Fragment, { key: props.loading ? "loading" : "cards" }, props.children)));
        } catch (e) {
            console.warn("[Sticky] home row patch failed, using Stash's carousel", e);
            return row;
        }
    });
})();
