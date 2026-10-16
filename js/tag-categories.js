/* ───────────────────────────────────────────────────────────────────
   Sticky — Tags page "Categories" view

   Adds a "Categories" button after the grid / list / tagger buttons.
   When it's on, the page shows every tag grouped as:

       category (Action / People / Scene, from the list below)
         └ parent tag  (links to its page · description · "4 tags")
             └ sub-tag pills, most scenes first

   plus a greyed "Unsorted" tab for tags with no parent, and a
   sidebar that jumps to each parent tag (a sideways row of chips on
   phones). The toolbar search filters the pills as you type.

   Stash only loads one page of tags at a time, so this view asks
   Stash for all tags in one request when it opens. Stash's own views
   stay exactly as they were; this button just hides them while it's
   on. If anything here fails, the button and view simply don't show.

   Remembered in this browser: whether the view is on, and the tab.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React || !api.ReactDOM || !api.ReactDOM.createPortal) return;

    var React = api.React;
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var createPortal = api.ReactDOM.createPortal;
    var router = api.libraries && api.libraries.ReactRouterDOM;
    var Link = router && router.Link;

    var BODY_CLASS = "sticky-tc-on";
    var PAGE_CLASS = "sticky-tc-page";        // on the tags list, whichever view
    var TIGHT_CLASS = "sticky-tc-tight";      // phones: header shrunk while scrolling down
    var PHONE_MQ = "(max-width: 767.98px)";
    var ROWS_CAP = 6;                        // rows shown per section on phones
        ".filtered-list-toolbar input[type='text'], .filtered-list-toolbar input[type='search']";
    var SEARCH_PLACEHOLDER = "Find a tag";
    var KEY_VIEW = "sticky.tags.view";
    var KEY_TAB = "sticky.tags.tab";
    var UNCAT = "unsorted";

    /* Categories list: lives in tag-data.js (shared with tag pages).
       Without it, every tag simply shows under "Unsorted". */
    var CATEGORIES = (window.StickyTags && window.StickyTags.CATEGORIES) || [];

    /* ── Small helpers ────────────────────────────────────────────── */
    function norm(s) { return String(s || "").trim().toLowerCase(); }

    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
    function pluralCat(n) { return n + (n === 1 ? " category" : " categories"); }

    function readLS(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeLS(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    function link(to, props, children) {
        return Link
            ? h(Link, Object.assign({ to: to }, props), children)
            : h("a", Object.assign({ href: to }, props), children);
    }

    function isTagsList() {
        return /^\/tags\/?$/.test(window.location.pathname);
    }

    /* ── Data ─────────────────────────────────────────────────────────
       One request: every tag with its parents, sub-tags and plain
       scene count (shown on the sub-tag pills). */
    var QUERY = "{ findTags(filter: { per_page: -1 }) { tags { " +
        "id name description parents { id } children { id } scenes: scene_count } } }";

    var gql = window.Sticky.gql;

    function loadTags() {
        return gql(QUERY).then(function (res) {
            if (res && res.data && res.data.findTags) return res.data.findTags.tags;
            throw new Error("findTags failed");
        });
    }

    function bySubTag(a, b) {
        return (b.scenes || 0) - (a.scenes || 0) || a.name.localeCompare(b.name);
    }
    function byParent(a, b) {
        return b.children.length - a.children.length ||
            a.tag.name.localeCompare(b.tag.name);
    }

    // How busy a tag is compared with the rest of the library: the
    // busiest ~15% of sub-tags read brightest, the quietest ~30% are
    // dimmed. Worked out from your own counts, so it fits any library.
    function tierScale(tags) {
        var counts = tags
            .filter(function (t) { return t.parents && t.parents.length; })
            .map(function (t) { return t.scenes || 0; })
            .sort(function (a, b) { return a - b; });
        if (!counts.length) return function () { return "mid"; };
        var at = function (q) { return counts[Math.min(counts.length - 1, Math.floor(counts.length * q))]; };
        var quiet = at(0.3);
        var busy = at(0.85);
        return function (n) {
            if (!n || n <= quiet) return "low";
            return n >= busy ? "top" : "mid";
        };
    }

    // Turns Stash's flat tag list into categories → parents → sub-tags
    function buildModel(tags) {
        var tier = tierScale(tags);
        tags.forEach(function (t) { t.tier = tier(t.scenes || 0); });
        var byId = {};
        tags.forEach(function (t) { byId[t.id] = t; });

        var lookup = {};
        var cats = CATEGORIES.map(function (c, i) {
            c.parents.forEach(function (p) { lookup[norm(p[0])] = { cat: i, desc: p[1] }; });
            return { key: c.key, label: c.label, parents: [] };
        });

        var loose = [];          // no parent, no sub-tags, not a known parent
        var otherParents = [];   // has sub-tags but isn't in the list above

        tags.forEach(function (t) {
            if (t.parents && t.parents.length) return;   // a sub-tag: shown under its parent
            var children = (t.children || [])
                .map(function (c) { return byId[c.id]; })
                .filter(Boolean)
                .sort(bySubTag);
            var known = lookup[norm(t.name)];
            var entry = { tag: t, children: children, desc: t.description || (known && known.desc) || "" };
            if (known) cats[known.cat].parents.push(entry);
            else if (children.length) otherParents.push(entry);
            else loose.push(t);
        });

        cats.forEach(function (c) {
            c.parents.sort(byParent);
            c.count = c.parents.reduce(function (n, p) { return n + p.children.length; }, 0);
        });
        otherParents.sort(byParent);
        loose.sort(bySubTag);

        var uncat = {
            key: UNCAT,
            label: "Unsorted",
            loose: loose,
            parents: otherParents,
            count: loose.length + otherParents.reduce(function (n, p) { return n + p.children.length; }, 0)
        };
        return { cats: cats, uncat: uncat };
    }

    // Search: a parent whose name matches keeps all its sub-tags;
    // otherwise only the sub-tags whose names match are kept.
    function filterParents(parents, term) {
        if (!term) return parents;
        return parents.map(function (p) {
            if (norm(p.tag.name).indexOf(term) !== -1) return p;
            var kids = p.children.filter(function (c) { return norm(c.name).indexOf(term) !== -1; });
            return kids.length ? Object.assign({}, p, { children: kids }) : null;
        }).filter(Boolean);
    }

    /* ── Pieces ───────────────────────────────────────────────────── */
    function Pill(props) {
        var t = props.tag;
        return link("/tags/" + t.id, { className: "sticky-tc-pill", title: t.name },
            [
                h("span", { key: "n", className: "sticky-tc-pill__name" }, t.name),
                h("span", { key: "c", className: "sticky-tc-pill__count" }, t.scenes || 0)
            ]);
    }

    function Pills(props) {
        if (!props.tags.length) {
            return h("p", { className: "sticky-tc-empty" }, props.emptyText || "No sub-tags yet");
        }
        return h("div", { className: "sticky-tc-pills" },
            props.tags.map(function (t) { return h(Pill, { key: t.id, tag: t }); }));
    }

    function parentMeta(p) {
        return plural(p.children.length, "tag");
    }

    // Phones: two columns of rows, capped, with "+N more"
    function Rows(props) {
        var s = useState(false), open = s[0], setOpen = s[1];
        var tags = props.tags;
        if (!tags.length) {
            return h("p", { className: "sticky-tc-empty" }, props.emptyText || "No sub-tags yet");
        }
        var all = open || tags.length <= ROWS_CAP + 1;   // one over the cap: just show it
        var shown = all ? tags : tags.slice(0, ROWS_CAP);
        return h(React.Fragment, null,
            h("div", { className: "sticky-tc-rows" }, shown.map(function (t) {
                return link("/tags/" + t.id, {
                    key: t.id,
                    className: "sticky-tc-row",
                    "data-tier": t.tier || "mid",
                    title: t.name
                }, [
                    h("span", { key: "n", className: "sticky-tc-row__name" }, t.name),
                    h("span", { key: "c", className: "sticky-tc-row__count" }, t.scenes || 0)
                ]);
            })),
            all ? null : h("button", {
                type: "button",
                className: "sticky-tc-more",
                onClick: function () { setOpen(true); }
            }, "+" + (tags.length - ROWS_CAP) + " more"));
    }

    function ParentSection(props) {
        var p = props.parent;
        var phone = props.phone;
        return h("section", { className: "sticky-tc-parent", id: "sticky-tc-" + p.tag.id, "data-tc-id": p.tag.id },
            h("div", { className: "sticky-tc-parent__head" },
                h("h3", { className: "sticky-tc-parent__name" },
                    link("/tags/" + p.tag.id, { title: "Open " + p.tag.name }, p.tag.name)),
                phone
                    ? link("/tags/" + p.tag.id, { className: "sticky-tc-meta sticky-tc-open" }, parentMeta(p))
                    : h("span", { className: "sticky-tc-meta" }, parentMeta(p))),
            p.desc ? h("p", { className: "sticky-tc-parent__desc" }, p.desc) : null,
            phone ? h(Rows, { tags: p.children }) : h(Pills, { tags: p.children })
        );
    }

    function CategoryBlock(props) {
        var c = props.cat;
        var tagCount = c.parents.reduce(function (n, p) { return n + p.children.length; }, 0);
        return h("div", { className: "sticky-tc-cat" },
            props.showHeading
                ? h("div", { className: "sticky-tc-cat__head" },
                    h("h2", { className: "sticky-tc-cat__name" }, c.label),
                    h("span", { className: "sticky-tc-meta" },
                        plural(tagCount, "tag") + " · " + pluralCat(c.parents.length)))
                : null,
            c.parents.map(function (p) {
                return h(ParentSection, { key: p.tag.id, parent: p, phone: props.phone });
            })
        );
    }

    // True while the screen is phone-sized
    function usePhone() {
        var mq = window.matchMedia ? window.matchMedia(PHONE_MQ) : null;
        var s = useState(!!(mq && mq.matches)), phone = s[0], set = s[1];
        useEffect(function () {
            if (!mq) return undefined;
            var fn = function () { set(mq.matches); };
            fn();
            if (mq.addEventListener) mq.addEventListener("change", fn);
            else if (mq.addListener) mq.addListener(fn);
            return function () {
                if (mq.removeEventListener) mq.removeEventListener("change", fn);
                else if (mq.removeListener) mq.removeListener(fn);
            };
        }, []);
        return phone;
    }

    function jumpTo(id) {
        var el = document.getElementById("sticky-tc-" + id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function Sidebar(props) {
        return h("nav", { className: "sticky-tc-side", "aria-label": "Jump to a parent tag" },
            props.cats.map(function (c) {
                return h("div", { key: c.key, className: "sticky-tc-side__group" },
                    h("div", { className: "sticky-tc-side__label" },
                        h("span", null, c.label),
                        h("span", { className: "sticky-tc-side__count" }, c.count)),
                    c.parents.map(function (p) {
                        var active = props.active === p.tag.id;
                        return h("button", {
                            key: p.tag.id,
                            type: "button",
                            className: "sticky-tc-side__item" + (active ? " is-active" : ""),
                            onClick: function () { jumpTo(p.tag.id); }
                        },
                            h("span", { className: "sticky-tc-side__name" }, p.tag.name),
                            h("span", { className: "sticky-tc-side__count" }, p.children.length));
                    }));
            }));
    }

    // Phones: the same jumps as a sideways-scrolling row of chips
    function JumpChips(props) {
        var items = [];
        props.cats.forEach(function (c) { items = items.concat(c.parents); });
        if (!items.length) return null;
        return h("div", { className: "sticky-tc-jump" },
            items.map(function (p) {
                return h("button", {
                    key: p.tag.id,
                    type: "button",
                    className: "sticky-tc-jump__chip" + (props.active === p.tag.id ? " is-active" : ""),
                    onClick: function () { jumpTo(p.tag.id); }
                }, p.tag.name);
            }));
    }

    function Tabs(props) {
        var m = props.model;
        var total = m.cats.reduce(function (n, c) { return n + c.count; }, 0);
        var tabs = [{ key: "all", label: "All", count: total }]
            .concat(m.cats.map(function (c) { return { key: c.key, label: c.label, count: c.count }; }))
            .concat([{ key: UNCAT, label: m.uncat.label, count: m.uncat.count, muted: true }]);
        return h("div", { className: "sticky-tc-tabs", role: "tablist" },
            tabs.map(function (t) {
                var active = props.tab === t.key;
                return h("button", {
                    key: t.key,
                    type: "button",
                    role: "tab",
                    "aria-selected": active,
                    disabled: t.key !== "all" && !t.count,
                    className: "sticky-tc-tab" + (active ? " is-active" : "") + (t.muted ? " is-muted" : ""),
                    onClick: function () { props.onTab(t.key); }
                },
                    h("span", null, t.label),
                    h("span", { className: "sticky-tc-tab__count" }, t.count));
            }));
    }

    /* ── The view ─────────────────────────────────────────────────── */
    function CategoriesView() {
        var s1 = useState(null), tags = s1[0], setTags = s1[1];
        var s2 = useState(false), failed = s2[0], setFailed = s2[1];
        var s3 = useState(readLS(KEY_TAB) || "all"), tab = s3[0], setTab = s3[1];
        var s4 = useState(""), query = s4[0], setQuery = s4[1];
        var term = norm(query);
        var s5 = useState(null), active = s5[0], setActive = s5[1];
        var rootRef = useRef(null);
        var phone = usePhone();

        // Load all tags when the view opens, with two retries.
        // Stash keeps everything in one SQLite file, and on a cold page
        // load a write can hold it just long enough for the first read
        // to come back "database is locked" — which used to leave this
        // view showing its error until you refreshed by hand.
        useEffect(function () {
            var live = true;
            var timer = null;
            var attempt = function (left) {
                loadTags().then(function (t) { if (live) setTags(t); })
                    .catch(function (e) {
                        if (!live) return;
                        if (left > 0) {
                            timer = window.setTimeout(function () { attempt(left - 1); }, 600);
                            return;
                        }
                        console.warn("[Sticky] couldn't load tags for the Categories view", e);
                        setFailed(true);
                    });
            };
            attempt(2);
            return function () { live = false; if (timer) window.clearTimeout(timer); };
        }, []);

        // Phones: the title and search shrink into one row while you
        // scroll down into the sections, and open up again on the way back.
        useEffect(function () {
            if (!phone) return undefined;
            var last = window.scrollY;
            var onScroll = function () {
                var y = window.scrollY;
                if (y < 40 || y < last - 6) document.body.classList.remove(TIGHT_CLASS);
                else if (y > last + 6) document.body.classList.add(TIGHT_CLASS);
                last = y;
            };
            window.addEventListener("scroll", onScroll, { passive: true });
            return function () {
                window.removeEventListener("scroll", onScroll);
                document.body.classList.remove(TIGHT_CLASS);
            };
        }, [phone]);

        // Sidebar highlight: the parent section nearest the top of the screen
        useEffect(function () {
            var root = rootRef.current;
            if (!root || !window.IntersectionObserver) return undefined;
            var obs = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) setActive(e.target.getAttribute("data-tc-id"));
                });
            }, { rootMargin: "-120px 0px -65% 0px" });
            root.querySelectorAll("[data-tc-id]").forEach(function (el) { obs.observe(el); });
            return function () { obs.disconnect(); };
        });

        if (failed) return h("div", { className: "sticky-tc sticky-tc--message" }, "Couldn't load your tags. Try refreshing the page.");
        if (!tags) return h("div", { className: "sticky-tc sticky-tc--message" }, "Loading tags…");

        var model = buildModel(tags);
        var validTabs = ["all", UNCAT].concat(model.cats.map(function (c) { return c.key; }));
        var current = validTabs.indexOf(tab) === -1 ? "all" : tab;
        var onTab = function (key) { setTab(key); writeLS(KEY_TAB, key); };

        var body;
        if (current === UNCAT) {
            var looseShown = term
                ? model.uncat.loose.filter(function (t) { return norm(t.name).indexOf(term) !== -1; })
                : model.uncat.loose;
            var others = filterParents(model.uncat.parents, term);
            body = h("div", { className: "sticky-tc-body sticky-tc-body--single" },
                h("div", { className: "sticky-tc-main", ref: rootRef },
                    h("div", { className: "sticky-tc-cat" },
                        h("div", { className: "sticky-tc-cat__head" },
                            h("h2", { className: "sticky-tc-cat__name" }, "Unsorted"),
                            h("span", { className: "sticky-tc-meta" }, plural(looseShown.length, "tag"))),
                        h("p", { className: "sticky-tc-parent__desc" }, "Tags without a parent tag."),
                        h(phone ? Rows : Pills, {
                            tags: looseShown,
                            emptyText: term ? "No tags match your search." : "Every tag has a parent tag."
                        }),
                        others.map(function (p) {
                            return h(ParentSection, { key: p.tag.id, parent: p, phone: phone });
                        }))));
        } else {
            var shown = model.cats
                .filter(function (c) { return current === "all" || c.key === current; })
                .map(function (c) { return Object.assign({}, c, { parents: filterParents(c.parents, term) }); })
                .filter(function (c) { return c.parents.length; });

            body = shown.length
                ? h("div", { className: "sticky-tc-body" + (phone ? " sticky-tc-body--single" : "") },
                    phone ? null : h(Sidebar, { cats: shown, active: active }),
                    h("div", { className: "sticky-tc-main", ref: rootRef },
                        phone ? h(JumpChips, { cats: shown, active: active }) : null,
                        shown.map(function (c) {
                            return h(CategoryBlock, {
                                key: c.key, cat: c, phone: phone, showHeading: current === "all"
                            });
                        })))
                : h("p", { className: "sticky-tc-empty sticky-tc-empty--page" },
                    term ? "No tags match your search." : "No tags in this category yet.");
        }

        // Tabs and search sit on one row on a wide screen, the search
        // to the right of the categories; on a phone they stack, with
        // the search above, where a thumb reaches it.
        return h("div", { className: "sticky-tc" },
            h("div", { className: "sticky-tc-controls" },
                h(Tabs, { model: model, tab: current, onTab: onTab }),
                h("div", { className: "sticky-tc-search" },
                    h("input", {
                        type: "search",
                        className: "sticky-tc-search__input",
                        placeholder: SEARCH_PLACEHOLDER,
                        value: query,
                        "aria-label": SEARCH_PLACEHOLDER,
                        onChange: function (e) { setQuery(e.target.value); }
                    }))),
            body);
    }

    /* ── Hooking it into the Tags page ────────────────────────────────
       The button and the view are drawn by React but placed into the
       toolbar / list area with portals, so no Stash element is moved
       or rebuilt. */
    // Stash's view switcher, found by the grid button inside it rather
    // than by "the button group that isn't the sort control and hasn't
    // got the filter button in it" — which would pick the wrong group
    // the day Stash adds another one.
    function viewGroup() {
        var icon = document.querySelector(
            '.filtered-list-toolbar .btn-group .btn svg[data-icon="table-cells-large"]');
        return icon && icon.closest ? icon.closest(".btn-group") : null;
    }

    // A home in Stash's toolbar for the Categories button. This is the
    // one place the theme still reaches into Stash's own markup: the
    // toolbar has no plugin hook, so the button is drawn by React into
    // a node of ours that we put there. It used to be re-placed every
    // 700ms in case React had redrawn the toolbar; a watcher on the
    // toolbar now says when that actually happens.
    function useToggleSlot(enabled, onStashView) {
        var s = useState(null), slot = s[0], setSlot = s[1];
        var ref = useRef(null);
        var cbRef = useRef(onStashView);
        cbRef.current = onStashView;

        useEffect(function () {
            if (!enabled) return undefined;
            if (!ref.current) {
                var created = document.createElement("span");
                created.className = "sticky-tc-slot";
                ref.current = created;
            }
            var node = ref.current;
            var boundGroup = null;
            var watching = null;
            var timers = [];
            var onGroupClick = function (e) {
                if (e.target.closest && e.target.closest(".btn")) cbRef.current();
            };
            var observer = new MutationObserver(function () { place(); });

            function place() {
                var toolbar = document.querySelector(".filtered-list-toolbar");
                if (!toolbar) return false;
                var group = viewGroup();
                if (group && node.previousElementSibling !== group) group.after(node);
                else if (!group && node.parentNode !== toolbar) toolbar.appendChild(node);
                if (group !== boundGroup) {
                    if (boundGroup) boundGroup.removeEventListener("click", onGroupClick);
                    if (group) group.addEventListener("click", onGroupClick);
                    boundGroup = group;
                }
                if (watching !== toolbar) {
                    observer.disconnect();
                    observer.observe(toolbar, { childList: true });
                    if (toolbar.parentNode) observer.observe(toolbar.parentNode, { childList: true });
                    watching = toolbar;
                }
                return true;
            }

            // The toolbar arrives with the list's first results, so the
            // first try can be too early. A short schedule, then stop.
            function tryPlace(delays) {
                if (place() || !delays.length) return;
                timers.push(window.setTimeout(function () {
                    tryPlace(delays.slice(1));
                }, delays[0]));
            }
            tryPlace([200, 600, 1400]);
            setSlot(node);

            return function () {
                timers.forEach(window.clearTimeout);
                observer.disconnect();
                if (boundGroup) boundGroup.removeEventListener("click", onGroupClick);
                node.remove();
            };
        }, [enabled]);

        return slot;
    }

    function TagCategories() {
        var enabled = isTagsList();
        var phone = usePhone();
        var s = useState(readLS(KEY_VIEW) === "categories"), on = s[0], setOn = s[1];
        var set = function (value) {
            setOn(value);
            writeLS(KEY_VIEW, value ? "categories" : "");
        };
        var slot = useToggleSlot(enabled, function () { set(false); });

        useEffect(function () {
            document.body.classList.toggle(BODY_CLASS, enabled && on);
            document.body.classList.toggle(PAGE_CLASS, enabled);
            return function () {
                document.body.classList.remove(BODY_CLASS);
                document.body.classList.remove(PAGE_CLASS);
            };
        }, [enabled, on]);

        if (!enabled || !slot) return null;

        var button = h("button", {
            type: "button",
            className: "btn btn-secondary sticky-tc-toggle" + (on ? " active" : ""),
            title: "Show tags by category",
            "aria-pressed": on,
            onClick: function () { set(!on); }
        }, h("span", { className: "sticky-tc-toggle__label" }, "Categories"));

        // The phone title and its view menu used to live here, which
        // gave the Tags page a header no other page had — and two of
        // them once every page got one. mobile-header.js draws it for
        // the whole library now, and finds this view's button in the
        // toolbar like any other, so Categories is simply one more
        // option in that menu.
        // The view itself is no longer pushed into Stash's page: it is
        // drawn here, inside the component Stash gave us, so there is
        // nothing to keep putting back when React redraws.
        return h(React.Fragment, null,
            createPortal(button, slot),
            on ? h(CategoriesView) : null);
    }

    // If the view itself hits an error while drawing, show nothing
    // rather than taking the Tags page down with it.
    function Guard(props) {
        React.Component.call(this, props);
        this.state = { failed: false };
    }
    Guard.prototype = Object.create(React.Component.prototype);
    Guard.prototype.constructor = Guard;
    Guard.getDerivedStateFromError = function () { return { failed: true }; };
    Guard.prototype.componentDidCatch = function (e) {
        console.warn("[Sticky] Categories view failed, hiding it", e);
        document.body.classList.remove(BODY_CLASS);
    };
    Guard.prototype.render = function () { return this.state.failed ? null : this.props.children; };

    function safe(fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            var original = args.pop();
            try {
                return fn(args[0] || {}, function () { return original.apply(null, args); });
            } catch (e) {
                console.warn("[Sticky] tags page patch failed, using Stash's default", e);
                return original.apply(null, args);
            }
        };
    }

    api.patch.instead("FilteredTagList", safe(function (props, renderOriginal) {
        return h(React.Fragment, null, renderOriginal(), h(Guard, null, h(TagCategories)));
    }));
})();
