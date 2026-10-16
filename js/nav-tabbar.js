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

   Nothing here writes to anything React owns. The only two things
   written outside our own elements are a class on <body> (is Home in
   the bar?) and custom properties on <html> (how many page and
   utility rows the More panel holds, and the current page's name for
   the tablet bar) — none of them belongs to React.

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
        }).catch(function (e) {
            console.warn("[Sticky] couldn't read the tab bar setting, using the default", e);
        });
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
        if (!path) return "";
        return window.Sticky && window.Sticky.pageKey
            ? window.Sticky.pageKey(path)
            : (String(path).replace(/\/+$/, "").split("/")[1] || "home").toLowerCase();
    }

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

    function useChrome(homeInBar, overflow, here) {
        React.useEffect(function () {
            var root = document.documentElement;
            document.body.classList.toggle("sticky-no-home", !homeInBar);
            document.body.dataset.stickyPage = here;
            root.style.setProperty("--sticky-more-pages", String(overflow));
            root.style.setProperty("--sticky-page-title", JSON.stringify(titleFor(here)));
        }, [homeInBar, overflow, here]);
    }

    /* ── Marking the menu ─────────────────────────────────────────────
       "after" runs once every other plugin has had its turn, so pages
       they add are marked too. */
    api.patch.after("MainNavBar.MenuItems", function () {
        var args = Array.prototype.slice.call(arguments);
        var result = args.pop();

        // Hooks first, unconditionally, whatever happens below.
        var chosen = useChosen();
        var here = useHere();

        var homeInBar = chosen.indexOf("home") !== -1;
        var original = result && result.props ? result.props.children : null;
        var kids = original;
        var overflow = 0;

        try {
            kids = flatten(original, [], 0).map(function (child, i) {
                if (!child || !child.props) return child;
                var key = keyForPath(pathOf(child, 0));
                var place = key ? chosen.indexOf(key) : -1;
                // Home is the logo, not a menu item, so it never takes
                // one of the menu's places.
                var inBar = place !== -1 && key !== "home";
                var extra = {
                    "data-sticky-key": key,
                    className: (child.props.className || "") +
                        (inBar ? " sticky-tab" : " sticky-more") +
                        (key && key === here ? " sticky-current" : "")
                };
                if (child.key == null) extra.key = "sticky-item-" + i;
                if (inBar) {
                    extra["data-sticky-order"] = String(place);
                } else {
                    overflow++;
                    // Each More row carries its own number, so adding or
                    // removing a page can't shuffle the others.
                    extra.style = Object.assign({}, child.props.style,
                        { "--sticky-more-i": String(overflow) });
                }
                return React.cloneElement(child, extra);
            });
        } catch (e) {
            console.warn("[Sticky] tab bar: leaving Stash's menu as it is", e);
            kids = original;
            overflow = 0;
        }

        useChrome(homeInBar, overflow, here);

        return kids === original ? result : React.cloneElement(result, undefined, kids);
    });

    /* ── Counting the utility rows ────────────────────────────────────
       The More panel stacks the overflow pages above the utilities, so
       it needs to know how many utilities are drawn. That isn't fixed:
       Log out only exists with a login, Donate is hidden there, and
       another plugin may add its own. After each render of the utility
       group, count what is actually displayed and hand it to the CSS
       (--sticky-more-utils). Nothing of React's is changed. */
    var UTIL_ROWS = "nav.top-nav .navbar-collapse > .navbar-nav:nth-child(2) > *";
    function countUtilities() {
        var n = 0;
        document.querySelectorAll(UTIL_ROWS).forEach(function (el) {
            if (el.matches('a[href*="opencollective"]')) return;
            if (window.getComputedStyle(el).display !== "none") n++;
        });
        if (n) document.documentElement.style.setProperty("--sticky-more-utils", String(n));
    }
    api.patch.after("MainNavBar.UtilityItems", function () {
        React.useEffect(countUtilities);
        return arguments[arguments.length - 1];
    });
})();
