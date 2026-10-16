/* ───────────────────────────────────────────────────────────────────
   Sticky — the switch and the shared signal

   This file loads before the rest of the theme and does two jobs.

   1. The off switch.
      Add ?sticky=off to any Stash address and the theme stands down
      for that tab: our stylesheet is disabled and every other script
      returns without doing anything, so you get Stash exactly as it
      ships. It sticks while the tab is open, so you can click around
      with the theme off. ?sticky=on brings it back.

      That makes "is this the theme's doing?" a five-second question
      instead of unticking the plugin and reloading.

   2. One navigation signal for the whole theme.
      Stash is a single page: the address changes without the page
      reloading. Several of our scripts need to know when that
      happens, and each used to watch the whole app for changes or
      re-read the address on a timer. Now the address itself tells us
      — we listen to the browser's own history calls once, here, and
      everything else subscribes:

          window.Sticky.onNavigate(fn)   → fn(path) on every move
          window.Sticky.pageKey(path)    → "scenes", "markers", "home"…

   Nothing here draws anything.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";

    var KEY = "sticky.off";

    // The id Stash installed the theme under, which is the name of its
    // .yml file: "sticky" from the plugin source or a copy dropped in by
    // hand, but a renamed copy still works. Stash serves our scripts
    // from /plugin/<id>/javascript and our styles from /plugin/<id>/css,
    // so the id is read off this script's own address while it loads —
    // nothing below has to assume one name or the other.
    var PLUGIN_ID = (function () {
        var src = (document.currentScript && document.currentScript.src) || "";
        var m = src.match(/\/plugin\/([^/?#]+)\/javascript/);
        return m ? decodeURIComponent(m[1]).toLowerCase() : "sticky";
    })();
    var CSS_MATCH = "/plugin/" + PLUGIN_ID + "/css";

    /* ── 1. The off switch ────────────────────────────────────────── */
    // ?sticky=off turns the theme off for this tab, ?sticky=on brings
    // it back.
    var off = false;
    try {
        var params = new URLSearchParams(window.location.search);
        var asked = params.get("sticky");
        if (asked === "off") window.sessionStorage.setItem(KEY, "1");
        else if (asked === "on") window.sessionStorage.removeItem(KEY);
        off = window.sessionStorage.getItem(KEY) === "1";
    } catch (e) {
        // Private browsing can refuse sessionStorage; fall back to the
        // address alone, so ?sticky=off still works for that page.
        off = /[?&]sticky=off\b/.test(window.location.search);
    }

    // Setting link.disabled before the file has finished downloading
    // doesn't hold — the browser attaches the stylesheet anyway when it
    // arrives. Pointing the link at a media type that never matches
    // does hold, so that is the one that counts; disabled is set too,
    // for anything that reads it.
    function stopTheCss() {
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        var found = false;
        [].forEach.call(links, function (link) {
            if ((link.getAttribute("href") || "").indexOf(CSS_MATCH) !== -1) {
                if (link.media !== "not all") link.media = "not all";
                link.disabled = true;
                found = true;
            }
        });
        return found;
    }

    if (off) {
        document.documentElement.classList.add("sticky-disabled");
        stopTheCss();
        // Keep applying it briefly: the link may not be in the page on
        // the first try, and it may finish loading after we get there.
        var tries = 0;
        var again = window.setInterval(function () {
            stopTheCss();
            if (++tries > 60) window.clearInterval(again);
        }, 50);
        window.addEventListener("load", stopTheCss);
        console.info("[Sticky] theme off for this tab (?sticky=on to bring it back)");
    }

    /* ── 2. The navigation signal ─────────────────────────────────── */
    var listeners = [];
    var last = window.location.pathname;

    function announce() {
        var path = window.location.pathname;
        if (path === last) return;
        last = path;
        listeners.slice().forEach(function (fn) {
            try { fn(path); } catch (e) { console.warn("[Sticky] navigation listener failed", e); }
        });
    }

    // Stash's router moves by calling these; we pass the call straight
    // through and only take note afterwards.
    ["pushState", "replaceState"].forEach(function (name) {
        var original = window.history[name];
        if (typeof original !== "function") return;
        window.history[name] = function () {
            var result = original.apply(this, arguments);
            announce();
            return result;
        };
    });
    window.addEventListener("popstate", announce);

    function pageKey(path) {
        var clean = String(path == null ? window.location.pathname : path)
            .replace(/\/+$/, "") || "/";
        if (clean === "/") return "home";
        if (clean === "/scenes/markers" || clean.indexOf("/scenes/markers/") === 0) return "markers";
        return (clean.split("/")[1] || "").toLowerCase();
    }

    /* ── 3. GraphQL ───────────────────────────────────────────────── */
    // One small helper for the few scripts that ask Stash for data the
    // page doesn't already hold. Resolves to the parsed response.
    function gql(query, variables) {
        return fetch("/graphql", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: query, variables: variables || {} })
        }).then(function (r) { return r.json(); });
    }

    /* ── 4. Watching a detail page ────────────────────────────────── */
    // The performer, tag and group page scripts redraw their header
    // whenever Stash changes the page under them. Each gets one watcher
    // that is connected only while you're on its kind of page and
    // disconnected when you leave, so other pages pay nothing for it;
    // changes inside the script's own elements (opts.ours) are ignored.
    function watchPage(opts) {
        var watching = false;
        var observer = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var t = records[i].target;
                var node = t.nodeType === 1 ? t : t.parentElement;
                if (node && !node.closest(opts.ours)) { opts.onChange(); return; }
            }
        });
        var config = { subtree: true, childList: true, characterData: true };
        if (opts.classes) { config.attributes = true; config.attributeFilter = ["class"]; }

        function sync() {
            var wanted = opts.path.test(window.location.pathname);
            if (wanted === watching) return;
            watching = wanted;
            if (wanted) {
                observer.observe(document.getElementById("root") || document.body, config);
                opts.onChange();
            } else {
                observer.disconnect();
                if (opts.onLeave) opts.onLeave();
            }
        }
        listeners.push(sync);
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
        else sync();
    }

    window.Sticky = {
        off: off,
        gql: gql,
        watchPage: watchPage,
        pluginId: PLUGIN_ID,
        pageKey: pageKey,
        onNavigate: function (fn) {
            listeners.push(fn);
            return function () {
                var i = listeners.indexOf(fn);
                if (i !== -1) listeners.splice(i, 1);
            };
        }
    };
})();
