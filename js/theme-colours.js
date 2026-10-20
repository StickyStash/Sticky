/* ───────────────────────────────────────────────────────────────────
   Sticky — background themes

   The "Theme" plugin setting (internal name "appearance", so Stash
   lists it first) holds one of four names; this puts the
   matching class on <html> and css/themes.css does the rest:

     Blue balls (default) · Blindfold · Extra virgin · Red light district

   The choice is kept in the browser's own store too, so the page is
   the right colour on its very first paint, then confirmed against
   Stash's copy.

   In Settings → Plugins → Sticky the setting is drawn as four tiles,
   each a swatch of its gradient with the name underneath, instead of
   Stash's text box. That's a patch on Stash's StringSetting for this
   one setting only: a tile hands its name to Stash's own onChange, so
   it's saved exactly as if it had been typed. Every other text
   setting is left to Stash.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    var THEMES = [
        { name: "Blue balls",         cls: "",                        swatch: "#1f3350, #122032 45%, #0d1520" },
        { name: "Blindfold",          cls: "sticky-theme-blindfold",  swatch: "#2e3034, #1b1c1f 45%, #121214" },
        { name: "Extra virgin",       cls: "sticky-theme-virgin",     swatch: "#143a2c, #0c251b 45%, #071510" },
        { name: "Red light district", cls: "sticky-theme-redlight",   swatch: "#42141c, #260b10 45%, #140608" }
    ];
    var ALL_CLASSES = THEMES.map(function (t) { return t.cls; }).filter(Boolean);
    var PLUGIN_ID = window.Sticky.pluginId || "sticky";
    var LS_KEY = "sticky.theme";

    // A name as typed, loosely: "red light district", "Red Light", "red"
    function find(value) {
        var v = String(value || "").trim().toLowerCase();
        if (!v) return THEMES[0];
        for (var i = 0; i < THEMES.length; i++) {
            var n = THEMES[i].name.toLowerCase();
            if (n === v || n.indexOf(v) === 0) return THEMES[i];
        }
        // Older and plain names still work ("Siren call" was the green's first name)
        var words = { blue: 0, grey: 1, gray: 1, green: 2, siren: 2, "siren call": 2, red: 3 };
        return words[v] != null ? THEMES[words[v]] : THEMES[0];
    }

    var current = THEMES[0];
    function apply(theme) {
        current = theme;
        var root = document.documentElement;
        ALL_CLASSES.forEach(function (c) { root.classList.toggle(c, c === theme.cls); });
        try { window.localStorage.setItem(LS_KEY, theme.name); } catch (e) { /* private mode */ }
        // The browser's bar colour follows the top of the gradient
        if (window.Sticky.refreshStatusBar) window.Sticky.refreshStatusBar();
    }

    // First paint: whatever this browser last used
    try { apply(find(window.localStorage.getItem(LS_KEY))); } catch (e) { apply(THEMES[0]); }

    // Then Stash's copy, which wins
    window.Sticky.gql("query { configuration { plugins } }").then(function (json) {
        var all = json && json.data && json.data.configuration && json.data.configuration.plugins;
        if (!all) return;
        Object.keys(all).forEach(function (k) {
            // Saved as "appearance"; "theme" is where it lived at first
            var mine = k.toLowerCase() === PLUGIN_ID.toLowerCase() && all[k];
            var value = mine && (typeof mine.appearance === "string" && mine.appearance.trim()
                ? mine.appearance : mine.theme);
            if (typeof value === "string") apply(find(value));
        });
    }).catch(function (e) {
        console.warn("[Sticky] couldn't read the theme setting", e);
    });

    window.Sticky.theme = { list: THEMES, current: function () { return current; }, set: apply };

    /* ── The tiles ─────────────────────────────────────────────────── */
    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;
    var React = api.React;
    var h = React.createElement;
    var SETTING_ID = "plugin-" + PLUGIN_ID + "-appearance";

    /* Sticky's settings first in Settings → Plugins. Stash lists
       plugins A–Z, which buries ours among everyone else's. The tiles
       live inside Sticky's group, so once they're drawn they lift that
       group to the top: the list of groups becomes a column and ours is
       ordered first, with the divider moved to match. Only style
       properties React doesn't set on those elements are touched (no
       markup is added or moved), and they're put back on unmount. A
       :has() rule in CSS did this before, but cost ~14ms of restyling
       on every change on every page. */
    function useLiftGroup(ref) {
        React.useLayoutEffect(function () {
            var group = ref.current && ref.current.closest(".setting-group");
            var list = group && group.parentElement;
            if (!group || !list || !list.closest(".setting-section")) return;
            var last = list.lastElementChild === group ? group.previousElementSibling : null;
            var saved = [
                [list, "display", list.style.display], [list, "flexDirection", list.style.flexDirection],
                [group, "order", group.style.order], [group, "borderBottom", group.style.borderBottom]
            ];
            if (last) saved.push([last, "borderBottom", last.style.borderBottom]);
            list.style.display = "flex";
            list.style.flexDirection = "column";
            group.style.order = "-1";
            group.style.borderBottom = "1px solid var(--border)";
            if (last) last.style.borderBottom = "0";
            return function () { saved.forEach(function (s) { s[0].style[s[1]] = s[2]; }); };
        }, []);
    }

    function Tiles(props) {
        var box = React.useRef(null);
        useLiftGroup(box);
        // Shown at once, before Stash's save comes back
        // Nothing saved under the new name yet: show what's on screen
        function initial() { return props.value ? find(props.value).name : current.name; }
        var pair = React.useState(initial);
        var chosen = pair[0], setChosen = pair[1];
        React.useEffect(function () { setChosen(initial()); }, [props.value]);

        return h("div", { className: "setting", id: props.id, ref: box },
            h("div", { className: "sticky-themes-setting" },
                h("h3", null, props.heading),
                props.subHeading ? h("div", { className: "sub-heading" }, props.subHeading) : null,
                h("div", { className: "sticky-themes", role: "group", "aria-label": props.heading },
                    THEMES.map(function (t) {
                        return h("button", {
                            key: t.name,
                            type: "button",
                            className: "sticky-themes__tile",
                            "aria-pressed": chosen === t.name ? "true" : "false",
                            onClick: function () {
                                setChosen(t.name);
                                apply(t);
                                if (props.onChange) props.onChange(t.name);
                            }
                        },
                            h("span", {
                                className: "sticky-themes__swatch",
                                style: { background: "linear-gradient(" + t.swatch + ")" }
                            }),
                            h("span", { className: "sticky-themes__name" }, t.name)
                        );
                    })
                )
            )
        );
    }

    // Instead patches get Stash's arguments plus the next function to
    // call last; it's called with the same arguments for Stash's box.
    api.patch.instead("StringSetting", function () {
        var args = Array.prototype.slice.call(arguments);
        var original = args.pop();
        var props = args[0] || {};
        if (props.id && String(props.id).toLowerCase() === SETTING_ID.toLowerCase()) {
            return h(Tiles, props);
        }
        return original.apply(null, args);
    });
})();
