/* ───────────────────────────────────────────────────────────────────
   Sticky — phone tab bar

   Stash hands plugins its page menu through the MainNavBar.MenuItems
   hook, so nothing here watches the page or relabels anything any
   more. We take the menu React is about to draw, mark each item with
   the page it points to, and hand it straight back:

     .sticky-tab    → one of the four in the bar, in your chosen order
     .sticky-more   → everything else, listed in the More panel

   Which four is a plugin setting (Settings → Plugins → Sticky), given
   as page names, e.g. "home, scenes, images, performers". Home is
   Stash's own logo and always sits first in the bar; your other three
   follow it. An unknown name is ignored, and any page you leave out
   goes to More — so the bar can't jumble, whatever Stash draws.

   Other plugins add their own pages here too, and they wrap the menu
   in groups when they do (Stash's items in one group, theirs in
   another). So we look through the groups
   for the items rather than assuming a flat list, and we find each
   item's page from the address React already has on it.

   Nothing here writes to anything React owns. Outside our own
   elements we only write a class on <body> (is Home in the bar?),
   custom properties on <html> (how many utility and plugin-button
   rows the More panel holds, and the current page's name for the
   tablet bar), and a class and row number on buttons other plugins
   drop into the bar themselves — none of them belongs to React.

   The CSS does all the drawing. If any of this fails, you get Stash's
   own menu, untouched.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;
    var React = api.React;

    // The id Stash installed us under ("sticky" from the plugin source,
    // "sticky" for a hand-installed copy), worked out by sticky.js. The
    // setting is stored under it.
    var PLUGIN_ID = (window.Sticky && window.Sticky.pluginId) || "sticky";
    var LS_KEY = "sticky.tabbar";
    var DEFAULT = "home, scenes, images, performers";
    var MAX_DEPTH = 5;

    /* ── The setting ──────────────────────────────────────────────────
       Read from the browser's own store first, so the bar is right on
       the very first paint, then confirmed against Stash's copy. */
    var raw = DEFAULT;
    try { raw = window.localStorage.getItem(LS_KEY) || DEFAULT; } catch (e) { /* private mode */ }

    var listeners = [];
    var asked = false;

    function ask() {
        if (asked) return;
        asked = true;
        window.Sticky.gql("query { configuration { plugins } }").then(function (json) {
            var all = json && json.data && json.data.configuration && json.data.configuration.plugins;
            if (!all) return;
            var mine = null;
            Object.keys(all).forEach(function (k) {
                if (k.toLowerCase() === PLUGIN_ID) mine = all[k];
            });
            var value = mine && mine.tabBar;
            if (typeof value !== "string" || !value.trim() || value.trim() === raw) return;
            raw = value.trim();
            try { window.localStorage.setItem(LS_KEY, raw); } catch (e) { /* ignore */ }
            listeners.slice().forEach(function (set) { set(raw); });
            markLoose();
        }).catch(function (e) {
            console.warn("[Sticky] couldn't read the tab bar setting, using the default", e);
        });
    }

    // Used by the chips in Settings: the bar follows a tap at once,
    // before Stash's save comes back.
    function setRaw(value) {
        raw = String(value || "").trim() || DEFAULT;
        try { window.localStorage.setItem(LS_KEY, raw); } catch (e) { /* ignore */ }
        listeners.slice().forEach(function (set) { set(raw); });
        if (typeof markLoose === "function") markLoose();
    }

    // The setting as a list of page names, kept up to date
    function useChosen() {
        var pair = React.useState(raw);
        var set = pair[1];
        React.useEffect(function () {
            listeners.push(set);
            ask();
            return function () {
                var i = listeners.indexOf(set);
                if (i !== -1) listeners.splice(i, 1);
            };
        }, []);
        return pair[0].split(",").map(function (s) { return s.trim().toLowerCase(); })
            .filter(Boolean).slice(0, 4);
    }

    /* ── Reading the menu ─────────────────────────────────────────── */

    // Groups (React fragments) are see-through: a menu of
    // [[Scenes, Images, …], [Roles]] is really one row of items.
    function flatten(children, out, depth) {
        React.Children.forEach(children, function (child) {
            if (!child) return;
            if (depth < MAX_DEPTH && child.type === React.Fragment && child.props) {
                flatten(child.props.children, out, depth + 1);
            } else {
                out.push(child);
            }
        });
        return out;
    }

    // The address an item points to. Stash puts it on the item itself;
    // another plugin may put it on the link inside.
    function pathOf(node, depth) {
        if (!node || !node.props || depth > MAX_DEPTH) return "";
        var props = node.props;
        var candidates = [props.eventKey, props.to, props.href];
        for (var i = 0; i < candidates.length; i++) {
            if (typeof candidates[i] === "string" && candidates[i].charAt(0) === "/") {
                return candidates[i];
            }
        }
        var found = "";
        React.Children.forEach(props.children, function (child) {
            if (!found) found = pathOf(child, depth + 1);
        });
        return found;
    }

    function keyForPath(path) {
        // Only an in-app address: "javascript:void(0)" or "#" (a link that
        // opens its page from a click handler) isn't one.
        if (!path || String(path).charAt(0) !== "/") return "";
        // Plugin pages usually live under /plugin/… or /plugins/…, so
        // the first part of the address alone would give every one of
        // them the same name (and light them all up as the current
        // page). Theirs carries the next part too: "plugin-dupfilemanager".
        var parts = String(path).split(/[?#]/)[0].replace(/\/+$/, "").split("/");
        if (/^plugins?$/i.test(parts[1] || "") && parts[2]) {
            return ("plugin-" + parts[2]).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        }
        return window.Sticky && window.Sticky.pageKey
            ? window.Sticky.pageKey(path)
            : (parts[1] || "home").toLowerCase();
    }

    // A page with no address to go by (its link opens it from a click
    // handler) is named by its label instead: "page-ascension".
    function keyForLabel(text) {
        var slug = String(text || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        return slug ? "page-" + slug : "";
    }
    function keyForItem(el) {
        var a = el.matches("a") ? el : el.querySelector("a, button");
        var key = a ? keyForPath(a.getAttribute("href")) : "";
        return key || keyForLabel((a && a.getAttribute("title")) || el.textContent);
    }

    // Stash's own pages, which have an icon in Sticky's set. Anything
    // else is a plugin's page and keeps the plugin's own icon.
    var OWN = ["home", "scenes", "images", "galleries", "performers", "studios",
        "tags", "groups", "movies", "markers"];

    // Which page we're on. sticky.js tells us when it changes, so there
    // is no timer and nothing watching the page for us.
    function useHere() {
        var pair = React.useState(keyForPath(window.location.pathname));
        var set = pair[1];
        React.useEffect(function () {
            var update = function () { set(keyForPath(window.location.pathname)); };
            update();
            return window.Sticky && window.Sticky.onNavigate
                ? window.Sticky.onNavigate(update) : undefined;
        }, []);
        return pair[0];
    }

    /* ── The two things that live outside React ───────────────────── */
    // The page's name for the tablet bar: its label in the menu, or
    // for pages that aren't in it (Settings, Statistics …) its address
    // with a capital letter.
    function titleFor(here) {
        if (here === "home") return "Home";
        var item = document.querySelector("nav.top-nav .navbar-collapse > .navbar-nav:first-child > .sticky-current");
        var text = item ? item.textContent.trim() : "";
        return text || (here.charAt(0).toUpperCase() + here.slice(1));
    }

    function useChrome(homeInBar, here) {
        React.useEffect(function () {
            var root = document.documentElement;
            document.body.classList.toggle("sticky-no-home", !homeInBar);
            document.body.dataset.stickyPage = here;
            root.style.setProperty("--sticky-page-title", JSON.stringify(titleFor(here)));
        }, [homeInBar, here]);
    }

    /* ── Items that hide their address ────────────────────────────────
       Some plugins draw their menu item with a component of their own
       that works out its link inside and throws away anything we pass
       it, so it can't be marked or moved. Those are wrapped in a box we
       own (div.sticky-probe): after it's drawn, the box reads the link
       inside it, remembers the page, and from then on carries the same
       classes and order as any other item. On wider screens the box is
       display: contents, so the menu looks exactly as Stash drew it. */
    var h = React.createElement;
    var probed = {};       // menu slot → page key, read from the drawn link
    function Probe(props) {
        var ref = React.useRef(null);
        var pair = React.useState(probed[props.slot] || "");
        var key = pair[0], setKey = pair[1];
        React.useLayoutEffect(function () {
            var box = ref.current;
            var k = box && box.firstElementChild ? keyForItem(box.firstElementChild) : "";
            if (k && k !== key) { probed[props.slot] = k; setKey(k); }
        });
        var place = key ? props.chosen.indexOf(key) : -1;
        var inBar = place !== -1 && key !== "home";
        return h("div", {
            ref: ref,
            className: "sticky-probe" + (inBar ? " sticky-tab" : " sticky-more") +
                (key && OWN.indexOf(key) === -1 ? " sticky-plugin" : "") +
                (key && key === props.here ? " sticky-current" : ""),
            "data-sticky-key": key || undefined,
            "data-sticky-order": inBar ? String(place) : undefined
        }, props.children);
    }

    /* ── Marking the menu ─────────────────────────────────────────────
       Our "after" has to run once every other plugin has had its turn,
       so the pages they add are marked too. "after" patches run in the
       order they were registered, and plugins load in an order we don't
       choose, so registering ours as this file loads would put it before
       any plugin that loads after Sticky. Stash draws nothing until every
       plugin's script has loaded, so ours is registered at the first
       draw of the menu instead, from a "before" patch: by then every
       plugin has registered its own, and Stash reads the list of "after"
       patches only once the "before" ones have run, so ours is last from
       that very first draw. */
    var markerAdded = false;
    api.patch.before("MainNavBar.MenuItems", function () {
        if (!markerAdded) {
            markerAdded = true;
            api.patch.after("MainNavBar.MenuItems", markMenu);
        }
        return Array.prototype.slice.call(arguments);
    });

    function markMenu() {
        var args = Array.prototype.slice.call(arguments);
        var result = args.pop();

        // Hooks first, unconditionally, whatever happens below.
        var chosen = useChosen();
        var here = useHere();

        var homeInBar = chosen.indexOf("home") !== -1;
        var original = result && result.props ? result.props.children : null;
        var kids = original;
        
        try {
            kids = flatten(original, [], 0).map(function (child, i) {
                if (!child || !child.props) return child;
                var key = keyForPath(pathOf(child, 0));
                // No address on the item: a plugin's own component that
                // works its link out inside. It gets a box of ours to sit
                // in, which reads the address once it's drawn.
                if (!key) {
                    return h(Probe, { key: child.key != null ? child.key : "sticky-probe-" + i,
                        slot: i, chosen: chosen, here: here }, child);
                }
                var place = key ? chosen.indexOf(key) : -1;
                // Home is the logo, not a menu item, so it never takes
                // one of the menu's places.
                var inBar = place !== -1 && key !== "home";
                var extra = {
                    "data-sticky-key": key,
                    className: (child.props.className || "") +
                        (inBar ? " sticky-tab" : " sticky-more") +
                        (OWN.indexOf(key) === -1 ? " sticky-plugin" : "") +
                        (key && key === here ? " sticky-current" : "")
                };
                if (child.key == null) extra.key = "sticky-item-" + i;
                if (inBar) {
                    extra["data-sticky-order"] = String(place);
                }
                // The More rows are numbered and counted by the CSS from
                // what is actually in the menu, so a page another plugin
                // draws without our markings still gets its own row.
                return React.cloneElement(child, extra);
            });
        } catch (e) {
            console.warn("[Sticky] tab bar: leaving Stash's menu as it is", e);
            kids = original;
        }

        useChrome(homeInBar, here);
        React.useEffect(function () { queueCount(); });

        return kids === original ? result : React.cloneElement(result, undefined, kids);
    }

    /* ── Counting the utility rows, and plugin buttons ───────────────
       The More panel stacks the overflow pages above the utilities, so
       it needs to know how many utilities are drawn. That isn't fixed:
       Log out only exists with a login, Donate is hidden there, and
       another plugin may add its own. Count what is actually displayed
       and hand it to the CSS (--sticky-more-utils).

       Some plugins don't use Stash's menu at all: they drop their own
       button straight into the bar's right-hand group (Random, SFW
       Switch, Theme Switch, Accessibility …). On a phone that group is
       only the More button, so those buttons are listed at the bottom
       of the More panel instead. They're told apart from Stash's own
       items because React never drew them: a node React drew carries
       React's own property, a plugin's node doesn't. Each one gets a
       class and a row number; the count goes to the CSS as
       --sticky-more-extras. Only nodes React doesn't own are touched.

       Plugins add these whenever they like (often after a delay), so a
       light observer watches the navbar for added or removed elements
       and recounts on the next frame. */
    var UTIL_ROWS = "nav.top-nav .navbar-collapse > .navbar-nav:nth-child(2) > *";
    var EXTRA_ROWS = "nav.top-nav .navbar-buttons > *";

    function drawnByReact(el) {
        for (var k in el) {
            if (k.indexOf("__reactFiber") === 0 || k.indexOf("__reactInternalInstance") === 0) return true;
        }
        return false;
    }

    /* Pages a plugin adds to the menu itself, after React has drawn it
       (Ascension does this). React never saw them, so the menu patch
       can't mark them; but they aren't React's either, so they're marked
       here directly, the same way, from the current setting. */
    var MENU_ITEMS = "nav.top-nav .navbar-collapse > .navbar-nav:first-child > *";
    function markLoose() {
        var chosen = raw.split(",").map(function (x) { return x.trim().toLowerCase(); })
            .filter(Boolean).slice(0, 4);
        document.querySelectorAll(MENU_ITEMS).forEach(function (el) {
            if (drawnByReact(el)) return;
            var key = keyForItem(el);
            if (!key) return;
            var place = chosen.indexOf(key);
            var inBar = place !== -1 && key !== "home";
            if (el.getAttribute("data-sticky-key") !== key) el.setAttribute("data-sticky-key", key);
            el.classList.toggle("sticky-tab", inBar);
            el.classList.toggle("sticky-more", !inBar);
            el.classList.add("sticky-plugin");
            if (inBar) el.setAttribute("data-sticky-order", String(place));
            else el.removeAttribute("data-sticky-order");
        });
    }

    function countRows() {
        markLoose();
        var root = document.documentElement;
        // Pages waiting in More: every menu item that isn't one of the
        // bar's tabs, whoever drew it
        var pages = 0;
        document.querySelectorAll(MENU_ITEMS).forEach(function (el) {
            if (!el.classList.contains("sticky-tab")) pages++;
        });
        root.style.setProperty("--sticky-more-pages", String(pages));
        var n = 0;
        document.querySelectorAll(UTIL_ROWS).forEach(function (el) {
            if (el.matches('a[href*="opencollective"]')) return;
            if (window.getComputedStyle(el).display !== "none") n++;
        });
        if (n) root.style.setProperty("--sticky-more-utils", String(n));

        var extras = 0;
        document.querySelectorAll(EXTRA_ROWS).forEach(function (el) {
            if (el.classList.contains("navbar-toggler") || drawnByReact(el)) return;
            extras++;
            el.classList.add("sticky-extra");
            el.style.setProperty("--sticky-extra-i", String(extras));
        });
        root.style.setProperty("--sticky-more-extras", String(extras));
    }

    var queued = false;
    function queueCount() {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(function () { queued = false; countRows(); });
    }

    var watching = null;
    function watchNav() {
        var nav = document.querySelector("nav.top-nav");
        if (!nav || nav === watching || !window.MutationObserver) return;
        watching = nav;
        new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                if (records[i].addedNodes.length || records[i].removedNodes.length) {
                    queueCount();
                    return;
                }
            }
        }).observe(nav, { childList: true, subtree: true });
    }

    /* ── Closing More after a plugin's page opens ─────────────────────
       Stash's own pages close the menu when you pick one; a plugin's
       link usually doesn't know to, so the panel stayed open over the
       page you'd just opened. When the address changes and the menu is
       still open (the toggle lacks Stash's "collapsed" class), press
       the toggle once — the same thing a tap would do, so React stays
       in charge of the state. */
    if (window.Sticky.onNavigate) {
        window.Sticky.onNavigate(function () {
            window.setTimeout(function () {
                var toggle = document.querySelector("nav.top-nav .navbar-toggler");
                if (toggle && !toggle.classList.contains("collapsed") &&
                    window.getComputedStyle(toggle).display !== "none") {
                    toggle.click();
                }
            }, 0);
        });
    }

    api.patch.after("MainNavBar.UtilityItems", function () {
        React.useEffect(function () { countRows(); watchNav(); });
        return arguments[arguments.length - 1];
    });

    /* ── The setting as chips (Settings → Plugins → Sticky) ───────────
       Instead of typing page names, every page in the menu is a chip:
       Stash's own and any a plugin adds. Tap up to four in the order you
       want them; each shows its place (1–4), and a second tap takes it
       out. The pages are read from the menu as drawn (it's on screen in
       Settings too), so pages a plugin adds after the fact are included.
       A page whose item threw our markings away (the plugin draws it with
       its own code) can't move into the bar, so its chip says so instead
       of doing nothing. Saved through Stash's own onChange, as typed
       text ("home, scenes, plugin-insights, performers"), so the text box
       still works if this doesn't. */
    var TABBAR_ID = "plugin-" + PLUGIN_ID + "-tabbar";

    function readPages() {
        var pages = [{ key: "home", label: "Home", ok: true }];
        var seen = { home: true };
        document.querySelectorAll("nav.top-nav .navbar-collapse > .navbar-nav:first-child > *").forEach(function (el) {
            var key = el.getAttribute("data-sticky-key") || keyForItem(el);
            // Items React drew carry our marks; ones a plugin added to the
            // page itself are marked by markLoose(). Either can move.
            var marked = el.hasAttribute("data-sticky-key") || !drawnByReact(el);
            if (!key || seen[key]) return;
            seen[key] = true;
            // Its name: a title if it has one, else its text without any
            // icon-font glyph ("★Charlie" → "Charlie")
            var titled = el.querySelector("[title]");
            var copy = el.cloneNode(true);
            copy.querySelectorAll("svg, img, i").forEach(function (n) { n.remove(); });
            var label = (copy.textContent || "").trim() ||
                (titled && titled.getAttribute("title")) || key;
            pages.push({ key: key, label: label, ok: marked });
        });
        return pages;
    }

    function Chips(props) {
        var pagesPair = React.useState(readPages);
        var pages = pagesPair[0], setPages = pagesPair[1];
        var listPair = React.useState(function () {
            return String(props.value || raw).split(",").map(function (x) { return x.trim().toLowerCase(); })
                .filter(Boolean).slice(0, 4);
        });
        var list = listPair[0], setList = listPair[1];
        var notePair = React.useState("");
        var note = notePair[0], setNote = notePair[1];

        // The menu may still be drawing when Settings opens, and plugins
        // add theirs late: look again a few times, then stop.
        React.useEffect(function () {
            var timers = [250, 700, 1500, 3000].map(function (ms) {
                return window.setTimeout(function () { setPages(readPages()); }, ms);
            });
            return function () { timers.forEach(window.clearTimeout); };
        }, []);

        function save(next) {
            setList(next);
            var text = next.join(", ");
            setRaw(text);
            if (props.onChange) props.onChange(text);
        }

        function tap(page) {
            var at = list.indexOf(page.key);
            if (at !== -1) {
                setNote("");
                save(list.filter(function (k) { return k !== page.key; }));
            } else if (!page.ok) {
                setNote(page.label + " is drawn by its plugin in a way the bar can't move, so it stays in More.");
            } else if (list.length >= 4) {
                setNote("That’s all it can take. Pull one out to make room.");
            } else {
                setNote("");
                save(list.concat(page.key));
            }
        }

        // A page in the setting that isn't in the menu (a plugin since
        // removed) still shows, so it can be taken out.
        var shown = pages.slice();
        list.forEach(function (k) {
            if (!shown.some(function (p) { return p.key === k; })) shown.push({ key: k, label: k, ok: true, gone: true });
        });

        return h("div", { className: "setting", id: props.id },
            h("div", { className: "sticky-themes-setting" },
                h("h3", null, props.heading),
                props.subHeading ? h("div", { className: "sub-heading" }, props.subHeading) : null,
                h("div", { className: "sticky-tabpick", role: "group", "aria-label": props.heading },
                    shown.map(function (p) {
                        var at = list.indexOf(p.key);
                        return h("button", {
                            key: p.key,
                            type: "button",
                            className: "sticky-tabpick__chip" + (p.ok ? "" : " sticky-tabpick__chip--fixed") +
                                (p.gone ? " sticky-tabpick__chip--gone" : ""),
                            "aria-pressed": at !== -1 ? "true" : "false",
                            title: p.gone ? "Not in the menu any more" : undefined,
                            onClick: function () { tap(p); }
                        },
                            at !== -1 ? h("span", { className: "sticky-tabpick__num" }, String(at + 1)) : null,
                            h("span", { className: "sticky-tabpick__label" }, p.label)
                        );
                    })
                ),
                note ? h("div", { className: "sticky-tabpick__note", role: "status" }, note) : null
            )
        );
    }

    api.patch.instead("StringSetting", function () {
        var args = Array.prototype.slice.call(arguments);
        var original = args.pop();
        var props = args[0] || {};
        if (props.id && String(props.id).toLowerCase() === TABBAR_ID) {
            return h(Chips, props);
        }
        return original.apply(null, args);
    });
})();
