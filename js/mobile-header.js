/* ───────────────────────────────────────────────────────────────────
   Sticky — page header for phones

       Scenes  ⌄            ← the page, and its view options

   On a phone the view buttons (grid, list, wall, tagger, and
   Categories on the tags page) ate most of the toolbar for something
   you change rarely. They move into the menu behind the chevron, and
   the toolbar keeps only what you actually reach for: search, sort,
   filters, saved, and the … menu.

   Stash lets plugins wrap each list component, so this is drawn as
   part of the page rather than pushed into the DOM afterwards — no
   watcher, no timer, nothing to put back when React redraws.

   The menu doesn't reimplement the views: it reads Stash's own view
   buttons out of the toolbar, names them by their icon, and clicks
   the real one. So a view we've never heard of still works, and a
   page with no views (Groups) simply gets a title and no chevron.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;
    var React = api.React;
    var h = React.createElement;

    var PHONE_MQ = "(max-width: 767.98px)";

    // Stash's list components, and what the page is called
    var LISTS = {
        "FilteredSceneList": "Scenes",
        "FilteredImageList": "Images",
        "FilteredGalleryList": "Galleries",
        "FilteredPerformerList": "Performers",
        "FilteredStudioList": "Studios",
        "FilteredTagList": "Tags",
        "FilteredGroupList": "Groups",
        "FilteredSceneMarkerList": "Markers"
    };

    // The view buttons, named by the icon Stash puts in them
    var VIEW_NAMES = {
        "table-cells-large": "Grid",
        "list": "List",
        "square": "Wall",
        "tags": "Tagger"
    };

    // Only the library's own list pages. The same components draw the
    // tabs on a performer's or a group's page, where the page already
    // has a title of its own.
    var TOP_LEVEL = /^\/(scenes|images|galleries|performers|studios|tags|groups)\/?$|^\/scenes\/markers\/?$/;

    /* ── Two small hooks ──────────────────────────────────────────── */
    function usePhone() {
        var mq = window.matchMedia ? window.matchMedia(PHONE_MQ) : null;
        var pair = React.useState(!!(mq && mq.matches));
        var set = pair[1];
        React.useEffect(function () {
            if (!mq) return undefined;
            var onChange = function () { set(mq.matches); };
            set(mq.matches);
            if (mq.addEventListener) mq.addEventListener("change", onChange);
            else mq.addListener(onChange);
            return function () {
                if (mq.removeEventListener) mq.removeEventListener("change", onChange);
                else mq.removeListener(onChange);
            };
        }, []);
        return pair[0];
    }

    function usePath() {
        var pair = React.useState(window.location.pathname);
        var set = pair[1];
        React.useEffect(function () {
            var update = function () { set(window.location.pathname); };
            update();
            return window.Sticky && window.Sticky.onNavigate
                ? window.Sticky.onNavigate(update) : undefined;
        }, []);
        return pair[0];
    }

    /* ── Reading Stash's view buttons ─────────────────────────────── */
    function readViews() {
        var toolbar = document.querySelector(".filtered-list-toolbar");
        if (!toolbar) return [];
        var out = [];
        [].forEach.call(toolbar.querySelectorAll(".btn"), function (button) {
            var svg = button.querySelector("svg");
            var name = svg && VIEW_NAMES[svg.getAttribute("data-icon")];
            if (!name) return;
            out.push({ name: name, active: button.classList.contains("active"), node: button });
        });
        // Sticky's own Categories view, on the tags page. While it is
        // showing, Stash still marks whichever of its own views it
        // would fall back to — so Categories takes precedence and the
        // menu highlights one thing, not two.
        var categories = toolbar.querySelector(".sticky-tc-toggle");
        if (categories) {
            var on = categories.classList.contains("active");
            if (on) out.forEach(function (v) { v.active = false; });
            out.push({ name: "Categories", active: on, node: categories });
        }
        return out;
    }

    // A cheap comparison, so a class change that means nothing to us
    // doesn't cause a re-render.
    function signature(views) {
        return (views || []).map(function (v) {
            return v.name + (v.active ? "*" : "");
        }).join("|");
    }

    /* ── The header ───────────────────────────────────────────────── */
    function Header(props) {
        var openState = React.useState(false);
        var open = openState[0], setOpen = openState[1];
        var viewState = React.useState([]);
        var views = viewState[0], setViews = viewState[1];

        // What views this page offers, so we know whether to draw the
        // chevron at all. We sit beside Stash's toolbar rather than
        // inside it, and the toolbar only appears once the list has
        // its first results — so one read on mount is too early. Three
        // tries, then we stop: a short schedule, not a standing timer.
        React.useEffect(function () {
            var timers = [];
            function attempt(delays) {
                var found = readViews();
                if (found.length) { setViews(found); return; }
                if (!delays.length) { setViews(found); return; }
                timers.push(window.setTimeout(function () {
                    attempt(delays.slice(1));
                }, delays[0]));
            }
            var start = function () { attempt([250, 700, 1500]); };
            start();

            // Which view is showing can change without us: you can pick
            // one from Stash's own toolbar, or the Categories view can
            // switch itself off. Two things keep the name beside the
            // title honest, both event-driven rather than polled.
            //
            // One: a watcher on the pane the toolbar sits in — the pane
            // rather than the toolbar itself, because switching view
            // makes React build a new toolbar and a watcher on the old
            // one would be left holding a dead element.
            var watcher = new MutationObserver(function () { refresh(); });
            function refresh() {
                var found = readViews();
                setViews(function (previous) {
                    return signature(found) === signature(previous) ? previous : found;
                });
            }
            function watch() {
                var toolbar = document.querySelector(".filtered-list-toolbar");
                var pane = toolbar && toolbar.parentNode;
                if (!pane) return;
                watcher.disconnect();
                watcher.observe(pane, {
                    subtree: true, childList: true,
                    attributes: true, attributeFilter: ["class"]
                });
            }
            watch();

            // Two: a click anywhere in the toolbar is the moment a view
            // usually changes, so re-read just after one.
            var onClick = function (e) {
                if (!e.target.closest) return;
                if (!e.target.closest(".filtered-list-toolbar") &&
                    !e.target.closest(".sticky-mh")) return;
                timers.push(window.setTimeout(function () { watch(); refresh(); }, 350));
            };
            document.addEventListener("click", onClick, true);

            var stop = window.Sticky && window.Sticky.onNavigate
                ? window.Sticky.onNavigate(start) : null;
            return function () {
                timers.forEach(window.clearTimeout);
                watcher.disconnect();
                document.removeEventListener("click", onClick, true);
                if (stop) stop();
            };
        }, []);

        // Close when you tap anywhere else
        React.useEffect(function () {
            if (!open) return undefined;
            var close = function (e) {
                if (!e.target.closest || !e.target.closest(".sticky-mh")) setOpen(false);
            };
            document.addEventListener("click", close, true);
            return function () { document.removeEventListener("click", close, true); };
        }, [open]);

        function toggle() {
            var now = readViews();
            setViews(now);
            if (now.length) setOpen(!open);
        }

        var current = views.filter(function (v) { return v.active; })[0];

        return h("div", { className: "sticky-mh" },
            h("button", {
                type: "button",
                className: "sticky-mh__title" + (open ? " is-open" : "") +
                    (views.length ? "" : " is-plain"),
                onClick: toggle
            }, props.title),
            open ? h("div", { className: "sticky-mh__menu dropdown-menu" },
                views.length
                    ? views.map(function (view) {
                        return h("button", {
                            key: view.name,
                            type: "button",
                            className: "dropdown-item" + (view.active ? " active" : ""),
                            onClick: function () {
                                setOpen(false);
                                if (view.node && view.node.click) view.node.click();
                            }
                        }, view.name);
                    })
                    : h("div", { className: "sticky-mh__empty" }, "No other views")
            ) : null,
            current && !open ? h("span", { className: "sticky-mh__view" }, current.name) : null
        );
    }

    /* ── The home page ────────────────────────────────────────────
       "Welcome back! ⌄  Sticky": the same header as the list pages, so the
       home page doesn't start bare, but with nothing behind the
       chevron — the theme's name sits where a list shows its view. */
    function HomeHeader() {
        return h("div", { className: "sticky-mh sticky-mh--home" },
            h("span", { className: "sticky-mh__title" }, "Welcome back!"),
            h("span", { className: "sticky-mh__view" }, "Sticky"));
    }
    api.patch.after("FrontPage", function () {
        var result = arguments[arguments.length - 1];
        var phone = usePhone();
        if (!phone) return result;
        return h(React.Fragment, null, h(HomeHeader, { key: "sticky-mh" }), result);
    });

    /* ── Wrapping each list ───────────────────────────────────────── */
    Object.keys(LISTS).forEach(function (name) {
        api.patch.after(name, function () {
            var args = Array.prototype.slice.call(arguments);
            var result = args.pop();

            // Hooks first, unconditionally.
            var phone = usePhone();
            var path = usePath();

            if (!phone || !TOP_LEVEL.test(path)) return result;
            try {
                return h(React.Fragment, null,
                    h(Header, { key: "sticky-mh", title: LISTS[name] }),
                    result);
            } catch (e) {
                console.warn("[Sticky] page header failed, leaving the page as it is", e);
                return result;
            }
        });
    });
})();
