/* ───────────────────────────────────────────────────────────────────
   Sticky — performer page details panel

   Stash has no hook for the performer page header, so this script:
     • READS the details Stash has already printed (.detail-item rows),
       so there's no extra request for them, and any field a performer
       has (male/female-specific ones, custom fields) is picked up;
     • DRAWS a read-only panel from them: facts grid, tattoos and
       piercings with a body map, tags, bio, other details, external
       IDs, plus "…" and Edit buttons that simply click Stash's own
       (hidden) buttons.
   Nothing is re-implemented that changes data: favourite, rating,
   links, Edit, Merge, Delete… all remain Stash's own controls.
   It also moves the alias line up under the name and puts the
   O-count next to the heart (both small nodes of our own).

   The CSS only hides Stash's original list while this panel exists,
   so if anything here fails, the standard page shows instead.
   No requests are made: everything comes from the page.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (!window.Sticky || window.Sticky.off) return;   // ?sticky=off

    var A = window.Sticky.actions;
    if (!A) return;                                 // page-actions.js missing

    var PANEL_CLASS = "sticky-pp";
    var MAP_CLASS = "sticky-pp-map";
    var EXTRA_CLASS = "sticky-pp-extra";          // alias line, O-count chip
    var OURS = "." + PANEL_CLASS + ", ." + MAP_CLASS + ", ." + EXTRA_CLASS;

    /* ── Tiny DOM helpers ─────────────────────────────────────────── */

    function el(tag, className, children) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        [].concat(children || []).forEach(function (child) {
            if (child == null || child === false) return;
            node.appendChild(typeof child === "string" || typeof child === "number"
                ? document.createTextNode(String(child)) : child);
        });
        return node;
    }
    function text(node) {
        return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
    }

    /* ── Reading Stash's details ──────────────────────────────────── */

    // Every .detail-item → { key, label, value (text), node }
    function readDetails(head) {
        var items = {};
        head.querySelectorAll(".detail-item").forEach(function (item) {
            if (item.closest("." + PANEL_CLASS)) return;
            var key = [].slice.call(item.classList).filter(function (c) { return c !== "detail-item"; })[0];
            if (!key) return;
            var title = item.querySelector(".detail-item-title");
            var value = item.querySelector(".detail-item-value");
            items[key] = {
                key: key,
                label: text(title).replace(/:$/, ""),
                value: text(value),
                node: value
            };
        });
        return items;
    }

    /* ── Formatting ───────────────────────────────────────────────── */

    var GENDER_ICONS = {
        "male": "male", "female": "female", "transgender male": "trans-male",
        "transgender female": "trans-female", "intersex": "intersex", "non-binary": "non-binary"
    };

    // "1988-06-25" → "25 Jun 1988"; partial dates are left as they are.
    // Fixed three-letter months (some locales write "Sept" or "June").
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function formatDate(iso) {
        var p = (iso || "").split("-").map(Number);
        if (p.length === 3 && !p.some(isNaN) && p[1] >= 1 && p[1] <= 12) {
            return p[2] + " " + MONTHS[p[1] - 1] + " " + p[0];
        }
        return iso;
    }

    function tidyCareer(value) {
        return value
            .replace(/\s*[-–—]\s*(present|now|current)?\s*$/i, "–")
            .replace(/\s*[-–—]\s*/g, "–");
    }

    /* ── Tattoos & piercings: parsing and body map ────────────────────
       "Left foot, Arabic script; Inside left wrist" → entries of
       { location, description }. Locations are matched against body
       parts to place numbered dots on a front/back figure. Anything
       not recognised is still listed, just without a dot. */

    function parseMarks(value) {
        return value.split(";").map(function (part) {
            part = part.trim();
            if (!part) return null;
            var comma = part.indexOf(",");
            return comma === -1
                ? { location: part, description: "" }
                : { location: part.slice(0, comma).trim(), description: part.slice(comma + 1).trim() };
        }).filter(Boolean);
    }

    // Body regions: [pattern, region, view]. Checked in order, so more
    // specific phrases ("shoulder blade", "forearm", "lower abdomen")
    // come before the general ones they contain.
    var REGIONS = [
        [/shoulder ?blades?/, "shoulderblade", "back"],
        [/lower back/, "lowerback", "back"],
        [/(middle|mid) back/, "midback", "back"],
        [/upper back|\bback\b/, "upperback", "back"],
        [/\bnape\b/, "nape", "back"],
        [/butt(ock)?s?\b|glutes?\b/, "buttock", "back"],
        [/tricep/, "triceps", "back"],
        [/\bcal(f|ves)\b/, "calf", "back"],
        [/\blips?\b|mouth|tongue/, "lip", "front"],
        [/septum/, "septum", "front"],
        [/nostrils?|\bnose\b/, "nose", "front"],
        [/eyebrows?|\bbrows?\b/, "eyebrow", "front"],
        [/\bears?\b|helix|lobes?|tragus/, "ear", "front"],
        [/\bneck\b|throat/, "neck", "front"],
        [/forearms?/, "forearm", "front"],
        [/upper arms?|biceps?/, "biceps", "front"],
        [/shoulders?/, "shoulder", "front"],
        [/nipples?/, "nipple", "front"],
        [/\bpecs?\b|pectorals?|chest|breasts?/, "chest", "front"],
        [/\bribs?\b/, "ribs", "front"],
        [/navel|belly ?button/, "navel", "front"],
        [/lower abdomen|pelvi\w*|groin|\bhips?\b/, "hip", "front"],
        [/side of (the )?(torso|body)|\bflanks?\b/, "flank", "front"],
        [/\babs?\b|abdomen|stomach|belly|torso/, "abs", "front"],
        [/elbows?/, "elbow", "front"],
        [/wrists?/, "wrist", "front"],
        [/fingers?|thumbs?|knuckles?/, "finger", "front"],
        [/\bhands?\b|palms?/, "hand", "front"],
        [/\barms?\b/, "biceps", "front"],
        [/thighs?|upper (left |right )?legs?/, "thigh", "front"],
        [/knees?/, "knee", "front"],
        [/shins?|lower (left |right )?legs?|\blegs?\b/, "shin", "front"],
        [/ankles?/, "ankle", "front"],
        [/\bfoot\b|\bfeet\b|\btoes?\b/, "foot", "front"],
        [/\bface\b|cheeks?|forehead|\bhead\b/, "face", "front"]
    ];

    // Points on a 60×120 figure, for the performer's RIGHT side as seen
    // on that view. `null` x-mirror means the region is in the middle.
    var POINTS = {
        front: {
            face: [30, 10, true], lip: [30, 14, true], septum: [30, 12, true], nose: [30, 11, true],
            eyebrow: [27, 7], ear: [22.5, 10], neck: [30, 18, true],
            shoulder: [18, 23], chest: [24, 28], nipple: [24, 31], ribs: [21, 38], flank: [19.5, 44],
            navel: [30, 46, true], abs: [26, 43], hip: [23, 54],
            biceps: [12, 30], elbow: [12, 41], forearm: [12, 48], wrist: [12, 57], hand: [12, 61], finger: [12, 64],
            thigh: [24, 71], knee: [24, 85], shin: [24, 96], ankle: [24, 107], foot: [24, 112]
        },
        back: {
            nape: [30, 18, true], upperback: [30, 28, true], midback: [30, 40, true], lowerback: [30, 52, true],
            shoulderblade: [37, 30], triceps: [48, 33], buttock: [36, 62], calf: [36, 95]
        }
    };
    var PAIRED_PLURALS = /\b(ears|nipples|calves|knees|wrists|feet|hands|shoulders|hips|forearms|ankles|elbows|thighs|legs|arms|shins|pecs|flanks|sides|buttocks|glutes|shoulder ?blades|eyebrows|lips|nostrils)\b/;

    // Location text → list of { view, x, y }
    function locate(location) {
        var loc = " " + location.toLowerCase().replace(/shoulderblade/g, "shoulder blade") + " ";
        var both = /\b(each|both)\b/.test(loc) || PAIRED_PLURALS.test(loc);
        var side = /\bleft\b/.test(loc) ? "left" : /\bright\b/.test(loc) ? "right" : null;
        var spots = [];
        REGIONS.forEach(function (r) {
            var m = loc.match(r[0]);
            if (!m) return;
            loc = loc.replace(r[0], " ");            // don't match the same words twice
            var p = POINTS[r[2]][r[1]];
            if (!p) return;
            if (p[2]) { spots.push({ view: r[2], x: p[0], y: p[1] }); return; }
            // On the front view the performer's right is on the viewer's
            // left; on the back view it's on the viewer's right.
            var rightX = p[0];
            var leftX = 60 - rightX;
            var sides = both ? ["right", "left"] : [side || "right"];
            sides.forEach(function (s) {
                spots.push({ view: r[2], x: s === "right" ? rightX : leftX, y: p[1] });
            });
        });
        return spots.slice(0, 4);
    }

    var SVG_NS = "http://www.w3.org/2000/svg";
    function svg(tag, attrs, children) {
        var node = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        (children || []).forEach(function (c) { node.appendChild(c); });
        return node;
    }

    function figure(view, markers) {
        var body = [
            svg("circle", { cx: 30, cy: 10, r: 7.5 }),
            svg("rect", { x: 18, y: 20, width: 24, height: 39, rx: 5 }),
            svg("rect", { x: 8.5, y: 21, width: 7.5, height: 42, rx: 3.75 }),
            svg("rect", { x: 44, y: 21, width: 7.5, height: 42, rx: 3.75 }),
            svg("rect", { x: 19, y: 61, width: 10, height: 53, rx: 4.5 }),
            svg("rect", { x: 31, y: 61, width: 10, height: 53, rx: 4.5 })
        ];
        var group = svg("g", { class: "sticky-pp-body" }, body);
        var dots = [];
        var used = {};
        markers.filter(function (m) { return m.view === view; }).forEach(function (m) {
            // Nudge dots that land on the same spot so both stay visible
            var key = Math.round(m.x) + "," + Math.round(m.y);
            var nudge = (used[key] = (used[key] || 0) + 1) - 1;
            var x = m.x + nudge * 5.5, y = m.y;
            var circle = svg("circle", { cx: x, cy: y, r: 4.4, class: "sticky-pp-dot sticky-pp-dot--" + m.kind });
            var label = svg("text", { x: x, y: y + 1.75, class: "sticky-pp-dot-label sticky-pp-dot-label--" + m.kind });
            label.textContent = m.label;
            dots.push(svg("g", {}, [circle, label]));
        });
        var art = svg("svg", { viewBox: "0 -2 60 120", "aria-hidden": "true" }, [group].concat(dots));
        return el("figure", "sticky-pp-figure", [art, el("figcaption", null, view === "front" ? "Front" : "Back")]);
    }

    /* ── O-count chip, next to the heart ──────────────────────────── */

    var O_ICON = "M22.855.758L7.875 7.024l12.537 9.733c2.633 2.224 6.377 2.937 9.77 1.518c4.826-2.018 7.096-7.576 5.072-12.413C33.232 1.024 27.68-1.261 22.855.758zm-9.962 17.924L2.05 10.284L.137 23.529a7.993 7.993 0 0 0 2.958 7.803a8.001 8.001 0 0 0 9.798-12.65zm15.339 7.015l-8.156-4.69l-.033 9.223c-.088 2 .904 3.98 2.75 5.041a5.462 5.462 0 0 0 7.479-2.051c1.499-2.644.589-6.013-2.04-7.523z";

    // Stash prints the O-count beside the rating stars (or, on some
    // versions, as a detail row); read whichever is there.
    function buildOCount(head, details) {
        var key = Object.keys(details).filter(isOCount)[0];
        var source = key ? details[key].value : "";
        if (!source) {
            var beside = head.querySelector(".quality-group > :not(.rating-stars)");
            if (beside) {
                beside.classList.add("sticky-pp-ocount-source");   // hidden by CSS once our chip exists
                source = text(beside);
            }
        }
        var value = source.replace(/[^\d]/g, "");
        if (!value) return null;
        var icon = svg("svg", { viewBox: "0 0 36 36", width: "1em", height: "1em", "aria-hidden": "true" },
            [svg("path", { fill: "currentColor", d: O_ICON })]);
        var chip = el("span", "sticky-pp-ocount " + EXTRA_CLASS, [value]);
        chip.insertBefore(icon, chip.firstChild);
        chip.title = "O-count";
        return chip;
    }

    /* ── Building the panel ───────────────────────────────────────── */

    // Keys placed in a specific section; everything else (including
    // custom fields) goes to "Other details".
    var PLACED = ["gender", "age", "birthdate", "death_date", "country", "ethnicity", "career_length",
        "height", "hair_color", "eye_color", "measurements", "fake_tits", "weight", "penis_length",
        "circumcised", "tattoos", "piercings", "tags", "details", "stash_ids", "aliases", "urls", "rating"];
    function isOCount(key) { return /^o[_-]?count(er)?$/i.test(key); }

    function field(label, valueNodes, extraClass) {
        return el("div", "sticky-pp-field" + (extraClass ? " " + extraClass : ""), [
            el("div", "sticky-pp-label", label),
            el("div", "sticky-pp-value", valueNodes)
        ]);
    }
    function muted(str) { return el("span", "sticky-pp-muted", str); }

    // Stash prints measurements as two spans, e.g. <span class="weight-metric">45 kg</span>
    // <span class="weight-imperial">99 lb</span>. Show them as "45 kg · 99 lb".
    function measure(item) {
        var node = item.node;
        var metric = text(node && node.querySelector('[class$="-metric"]'));
        var imperial = text(node && node.querySelector('[class$="-imperial"]'));
        if (!metric) return item.value;
        return [metric, imperial ? dot() : null, imperial ? muted(imperial) : null];
    }
    function dot() { return el("span", "sticky-pp-dot-sep", "·"); }

    function build(head, details) {
        var d = details;
        var panel = el("div", PANEL_CLASS);
        var marks = [];

        // Section 1: identity
        var identity = [];
        if (d.gender) {
            var g = GENDER_ICONS[d.gender.value.toLowerCase()];
            identity.push(field("Gender", [g ? el("span", "sticky-gender sticky-gender--" + g) : null, d.gender.value], "sticky-pp-inline"));
        }
        if (d.country) {
            var flag = d.country.node && d.country.node.querySelector(".fi");
            var code = flag ? ([].slice.call(flag.classList).filter(function (c) { return /^fi-..$/.test(c); })[0] || "") : "";
            var name = d.country.value;
            try {
                if (code) name = new Intl.DisplayNames(undefined, { type: "region" }).of(code.slice(3).toUpperCase()) || name;
            } catch (e) { /* keep Stash's name */ }
            identity.push(field("Country", [code ? el("span", "fi " + code) : null, name], "sticky-pp-inline"));
        }
        if (d.age) {
            var ageNode = d.age.node;
            var years = text(ageNode && ageNode.querySelector(".age")) || d.age.value.split(" ")[0];
            var birth = text(ageNode && ageNode.querySelector(".birthdate")).replace(/[()]/g, "").trim();
            var dead = !!d.death_date;
            identity.push(field(dead ? "Born" : "Born", [
                birth ? formatDate(birth) : null,
                birth ? dot() : null,
                muted(years + " yrs" + (dead ? " †" : ""))
            ]));
        }
        if (d.ethnicity) identity.push(field("Ethnicity", d.ethnicity.value));
        if (d.career_length) identity.push(field("Career", tidyCareer(d.career_length.value)));
        if (identity.length) panel.appendChild(el("div", "sticky-pp-section sticky-pp-grid", identity));

        // Section 2: body
        var body = [];
        if (d.height) body.push(field("Height", measure(d.height)));
        if (d.weight) body.push(field("Weight", measure(d.weight)));
        if (d.hair_color) body.push(field("Hair", d.hair_color.value));
        if (d.eye_color) body.push(field("Eyes", d.eye_color.value));
        if (d.measurements) body.push(field("Measurements", d.measurements.value));
        if (d.fake_tits) {
            var v = d.fake_tits.value;
            body.push(field("Breasts", /^fake$/i.test(v) ? "Enhanced" : v));
        }
        if (d.penis_length) body.push(field("Penis length", measure(d.penis_length)));
        if (d.circumcised) body.push(field("Circumcised", d.circumcised.value));
        if (body.length) panel.appendChild(el("div", "sticky-pp-section sticky-pp-grid", body));

        // Section 3: tattoos & piercings
        function markList(kind, heading, value, labelFor) {
            var entries = parseMarks(value);
            if (!entries.length) return null;
            var list = el("ol", "sticky-pp-marks");
            entries.forEach(function (entry, i) {
                var label = labelFor(i);
                locate(entry.location).forEach(function (spot) {
                    marks.push({ view: spot.view, x: spot.x, y: spot.y, label: label, kind: kind });
                });
                list.appendChild(el("li", null, [
                    el("span", "sticky-pp-mark-label sticky-pp-mark-label--" + kind, label),
                    el("span", "sticky-pp-mark-where", entry.location),
                    entry.description ? dot() : null,
                    entry.description ? el("span", "sticky-pp-mark-what", entry.description) : null
                ]));
            });
            return el("div", "sticky-pp-marks-group sticky-pp-marks-group--" + kind, [
                el("div", "sticky-pp-marks-heading", [
                    el("span", "sticky-pp-key sticky-pp-key--" + kind), heading, muted(" · " + entries.length)
                ]),
                list
            ]);
        }
        var tattoos = d.tattoos && markList("tattoo", "Tattoos", d.tattoos.value, function (i) { return String(i + 1); });
        var piercings = d.piercings && markList("piercing", "Piercings", d.piercings.value, function (i) {
            return String.fromCharCode(65 + (i % 26));
        });
        if (tattoos || piercings) panel.appendChild(el("div", "sticky-pp-section sticky-pp-marks-wrap", [tattoos, piercings]));

        // Tags (links copied from Stash's own tag list)
        if (d.tags && d.tags.node) {
            var tagLinks = [].slice.call(d.tags.node.querySelectorAll("a[href]"));
            if (tagLinks.length) {
                panel.appendChild(el("div", "sticky-pp-section", [
                    el("div", "sticky-pp-label", "Tags"),
                    el("div", "sticky-pills sticky-pp-tags", tagLinks.map(function (a) {
                        var pill = el("a", "sticky-pill sticky-pill--tag", text(a));
                        pill.href = a.getAttribute("href");
                        return pill;
                    }))
                ]));
            }
        }

        // Bio
        if (d.details && d.details.value) {
            panel.appendChild(el("div", "sticky-pp-section", [
                el("div", "sticky-pp-label", "About"),
                el("p", "sticky-pp-bio", d.details.value)
            ]));
        }

        // Other details (custom fields and anything else), collapsible
        var others = Object.keys(d).filter(function (k) {
            return PLACED.indexOf(k) === -1 && !isOCount(k) && d[k].value;
        });
        if (others.length) {
            var otherGrid = el("div", "sticky-pp-grid sticky-pp-other-grid",
                others.map(function (k) { return field(d[k].label || k, d[k].value); }));
            var toggle = el("button", "sticky-pp-toggle", ["Other details", muted(" · " + others.length)]);
            toggle.type = "button";
            toggle.setAttribute("aria-expanded", "false");
            toggle.addEventListener("click", function () {
                var open = toggle.getAttribute("aria-expanded") !== "true";
                toggle.setAttribute("aria-expanded", String(open));
                otherGrid.hidden = !open;
            });
            otherGrid.hidden = true;
            panel.appendChild(el("div", "sticky-pp-section", [toggle, otherGrid]));
        }

        // Footer: ··· (Stash's other actions) · Meta IDs · Edit │ icons
        var footer = el("div", "sticky-pp-footer");
        var stashButtons = [].slice.call(head.querySelectorAll(".details-edit button"));
        var editBtn = stashButtons.filter(function (b) { return b.classList.contains("edit"); })[0];

        var idLinks = d.stash_ids && d.stash_ids.node
            ? [].slice.call(d.stash_ids.node.querySelectorAll(".stash-id-pill")) : [];
        var actions = A.bar([
            A.more(stashButtons.filter(function (b) { return b !== editBtn; })),
            A.metaIds(idLinks.map(function (pill) {
                var a = pill.querySelector("a[href]");
                var source = text(pill.querySelector("span"));
                return a ? { label: source || a.hostname || "Link", href: a.href } : null;
            })),
            editBtn ? A.button("Edit", function () { editBtn.click(); }) : null
        ], A.icons(head.querySelector(".name-icons"), [buildOCount(head, details)]));
        footer.appendChild(actions);
        panel.appendChild(footer);

        return { panel: panel, marks: marks };
    }

    /* ── Keeping it in sync with Stash ────────────────────────────── */

    var lastSignature = null;
    var lastHadOCount = false;
    var pending = false;

    function performerIdFromUrl() {
        var m = window.location.pathname.match(/^\/performers\/(\d+)/);
        return m ? m[1] : null;
    }

    function render() {
        pending = false;
        if (!performerIdFromUrl()) {
            if (lastSignature !== null) {
                document.querySelectorAll(OURS).forEach(function (n) { n.remove(); });
                lastSignature = null;
            }
            return;
        }
        var header = document.querySelector(".detail-header");
        var head = header && header.querySelector(".performer-head");
        var id = performerIdFromUrl();
        var group = head && head.querySelector(":scope > .detail-group");

        // Not a performer page, or Stash is in edit mode: remove the panel
        // (the CSS then shows Stash's own layout again).
        if (!head || !id || !group) {
            document.querySelectorAll(OURS).forEach(function (n) { n.remove(); });
            lastSignature = null;
            return;
        }

        var signature = id + "|" + text(group) + "|" + text(head.querySelector(".alias-head"));
        var existing = head.querySelector(":scope > ." + PANEL_CLASS);
        var aliasSource = head.querySelector(".alias-head");
        // Rebuild if the details changed, or if Stash re-drew part of the
        // header and took our alias line or O-count chip with it.
        var extrasMissing =
            (aliasSource && text(aliasSource) && !head.querySelector(":scope > .sticky-pp-aliases")) ||
            (lastHadOCount && !head.querySelector(".sticky-pp-ocount"));
        if (existing && signature === lastSignature && !extrasMissing) {
            A.sync(existing);           // favourite toggled: follow it
            return;
        }
        lastSignature = signature;

        var details = readDetails(head);
        var built = build(head, details);
        if (existing) existing.replaceWith(built.panel);
        else head.insertBefore(built.panel, group);

        // AKA line straight under the name
        head.querySelectorAll(":scope > .sticky-pp-aliases").forEach(function (n) { n.remove(); });
        var aliasLine = A.aka(A.splitAliases(text(head.querySelector(".alias-head"))),
            "sticky-pp-aliases " + EXTRA_CLASS);
        var nameRow = head.querySelector(":scope > h2");
        if (aliasLine && nameRow) nameRow.after(aliasLine);

        // O-count: it rides with the heart in the footer's icons; only
        // if those couldn't be built does it go beside Stash's heart
        var inFooter = built.panel.querySelector(".sticky-act-icons");
        head.querySelectorAll(".name-icons .sticky-pp-ocount").forEach(function (n) { n.remove(); });
        var heart = head.querySelector(".name-icons .favorite-button");
        var chip = inFooter ? null : buildOCount(head, details);
        lastHadOCount = !!(chip && heart);
        if (chip && heart) heart.after(chip);

        // Body map under the photo
        var imageBox = header.querySelector(".detail-header-image");
        var oldMap = header.querySelector("." + MAP_CLASS);
        if (oldMap) oldMap.remove();
        if (imageBox && built.marks.length) {
            imageBox.appendChild(el("div", MAP_CLASS, [figure("front", built.marks), figure("back", built.marks)]));
        }

    }

    // Runs right after Stash updates the page but before the browser
    // paints, so Stash's plain layout never flashes up first.
    function schedule() {
        if (pending) return;
        pending = true;
        queueMicrotask(render);
    }

    // Redraw whenever Stash changes the page, only while on a performer page
    window.Sticky.watchPage({
        path: /^\/performers\/\d+/,
        ours: OURS,
        classes: true,                  // the favourite button's state
        onChange: schedule,
        onLeave: function () { lastSignature = null; }
    });
})();
