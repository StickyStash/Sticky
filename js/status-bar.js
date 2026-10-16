/* ───────────────────────────────────────────────────────────────────
   Sticky — phone status bar

   Small jobs in <head>:
     • theme-color: the browser's own bar around the page takes the
       theme's blue instead of white or black.
     • Added to the home screen (iOS), the page runs under the status
       bar, so the blue reaches the very top of the screen. The CSS
       (mobile-chrome.css) keeps the content clear of the clock.
     • The theme's icon (assets/, served by Stash at
       /plugin/<id>/assets/) replaces Stash's on the browser tab and
       on the home screen. Stash's own <link> tags are repointed
       rather than doubled up, so the browser has one icon to pick.
       iPhone reads apple-touch-icon when you choose "Add to Home
       Screen", so an icon added before this keeps the old one until
       it's removed and added again.

   Stash redraws <head> on every page change (react-helmet swaps the
   title and its own tags), which can take ours with it, so the tags
   are re-checked whenever <head> actually changes rather than on a
   timer. Nothing else on the page is touched.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var THEME_COLOUR = "#1f3350";      // --gradient-top, the blue at the top of the page

    function meta(name, content) {
        var node = document.head.querySelector("meta[name='" + name + "']");
        if (!node) {
            node = document.createElement("meta");
            node.setAttribute("name", name);
            document.head.appendChild(node);
        }
        if (node.getAttribute("content") !== content) node.setAttribute("content", content);
    }

    // Stash's links are favicon.ico and apple-touch-icon.png;
    // pointing them at our files is enough for both.
    var id = (window.Sticky && window.Sticky.pluginId) || "sticky";
    var ASSETS = "/plugin/" + id + "/assets/";
    // Browsers hold on to an icon by its address for a long time, so a
    // new icon under the same file name kept showing the old one. Bump
    // this whenever the files in assets/ change.
    var ICON_V = "?v=2";
    function icon(rel, href, sizes, type) {
        var node = document.head.querySelector("link[rel='" + rel + "']");
        if (!node) {
            node = document.createElement("link");
            node.setAttribute("rel", rel);
            document.head.appendChild(node);
        }
        if (node.getAttribute("href") !== href) node.setAttribute("href", href);
        if (sizes && node.getAttribute("sizes") !== sizes) node.setAttribute("sizes", sizes);
        if (type && node.getAttribute("type") !== type) node.setAttribute("type", type);
    }

    function apply() {
        try {
            // 32px for a tab at 2x, 64px wherever the browser wants more
            icon("shortcut icon", ASSETS + "favicon-64.png" + ICON_V, "64x64", "image/png");
            icon("icon", ASSETS + "favicon-32.png" + ICON_V, "32x32", "image/png");
            icon("apple-touch-icon", ASSETS + "apple-touch-icon.png" + ICON_V, "180x180");
            meta("theme-color", THEME_COLOUR);
            meta("apple-mobile-web-app-capable", "yes");
            meta("apple-mobile-web-app-status-bar-style", "black-translucent");
            var viewport = document.head.querySelector("meta[name='viewport']");
            if (viewport) {
                var content = viewport.getAttribute("content") || "";
                if (content.indexOf("viewport-fit") === -1) {
                    viewport.setAttribute("content", content + ", viewport-fit=cover");
                }
            }
        } catch (e) {
            console.warn("[Sticky] couldn't set the status bar colour", e);
        }
    }

    apply();

    // Watch <head> instead of polling it. apply() only writes when a
    // tag is missing or holds the wrong value, so the writes it makes
    // here produce no further mutations and the observer can't feed
    // itself. Cost while nothing changes: nothing at all, against a
    // wake-up every two seconds for the life of the tab.
    try {
        new MutationObserver(apply).observe(document.head, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["content", "href"]
        });
    } catch (e) {
        console.warn("[Sticky] couldn't watch <head>", e);
    }
})();
