/* ───────────────────────────────────────────────────────────────────
   Sticky — performer card additions

   Uses Stash's official card hooks (PluginApi.patch) to add:
     • a facts line under the name: gender · age · flag + country
       (from the data each card already has)
     • a footer row: the career pill, then any add-on pills other
       files register, then Stash's own counts (scenes, O-count…)

   Stash's own content is always rendered too, and anything that
   throws falls back to Stash's original card.
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var api = window.PluginApi;
    if (!api || !api.patch || !api.React) return;

    var React = api.React;
    var h = React.createElement;

    // Shared card pieces (sticky-cards.js): links, pill rows with
    // their "+N" popover, dates, the studio tile, and the safety net.
    var C = window.Sticky && window.Sticky.cards;
    if (!C) return;
    var link = C.link, pills = C.pills, formatDate = C.formatDate,
        studioLogo = C.studioLogo;
    function safe(fn) { return C.safe(fn, "performer card"); }

    /* ── Facts line ───────────────────────────────────────────────── */

    // Stash's gender value → icon class (drawn in CSS) and label
    var GENDERS = {
        MALE: ["male", "Male"],
        FEMALE: ["female", "Female"],
        TRANSGENDER_MALE: ["trans-male", "Transgender male"],
        TRANSGENDER_FEMALE: ["trans-female", "Transgender female"],
        INTERSEX: ["intersex", "Intersex"],
        NON_BINARY: ["non-binary", "Non-binary"]
    };

    var regionNames = null;
    try { regionNames = new Intl.DisplayNames(undefined, { type: "region" }); } catch (e) { /* older browser */ }
    function countryName(code) {
        try { return (regionNames && regionNames.of(code.toUpperCase())) || code; } catch (e) { return code; }
    }

    // Whole years between birth and death (or today). Partial dates
    // ("1990" or "1990-05") count from the start of that year/month.
    function age(birthdate, deathdate) {
        if (!birthdate) return null;
        var b = birthdate.split("-").map(Number);
        var end;
        if (deathdate) {
            end = deathdate.split("-").map(Number);
        } else {
            var now = new Date();
            end = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
        }
        var years = end[0] - b[0];
        var bm = b[1] || 1, bd = b[2] || 1, em = end[1] || 1, ed = end[2] || 1;
        if (em < bm || (em === bm && ed < bd)) years--;
        return years >= 0 && !isNaN(years) ? years : null;
    }

    // Shorter names for phones, where the facts line is tight. Anything
    // not listed keeps its full name.
    var SHORT_COUNTRIES = {
        US: "USA", GB: "U.K.", AE: "UAE", KR: "S. Korea", KP: "N. Korea",
        ZA: "S. Africa", NZ: "N.Z.", DO: "Dom. Rep.", CD: "DR Congo",
        BA: "Bosnia", HK: "Hong Kong", MO: "Macau", CZ: "Czechia",
        CF: "C. African Rep.", PG: "P. New Guinea", TT: "Trinidad"
    };

    function countryHref(code) {
        return '/performers?c=("type":"country","modifier":"EQUALS","value":"' + code + '")&sortby=name';
    }

    function facts(performer) {
        var parts = [];
        var gender = GENDERS[performer.gender];
        if (gender) {
            parts.push(h("span", {
                key: "g", className: "sticky-gender sticky-gender--" + gender[0],
                title: gender[1], role: "img", "aria-label": gender[1]
            }));
        }
        var years = age(performer.birthdate, performer.death_date);
        if (years != null) {
            // Age at death, marked with a cross, for deceased performers
            // " yrs" is dropped on phones (performer-cards.css)
            parts.push(h("span", { key: "a" }, years,
                h("span", { className: "sticky-yrs" }, " yrs"),
                performer.death_date ? " †" : ""));
        }
        if (performer.country) {
            // Dot before the country whenever anything comes before it
            // (gender and/or age)
            if (parts.length) parts.push(h("span", { key: "d", className: "sticky-dot", "aria-hidden": true }, "·"));
            var code = performer.country.toUpperCase();
            var full = countryName(code);
            var short = SHORT_COUNTRIES[code];
            parts.push(link(countryHref(performer.country), { key: "c", className: "sticky-country", title: full }, [
                h("span", { key: "f", className: "fi fi-" + performer.country.toLowerCase() }),
                h("span", { key: "n", className: short ? "sticky-country-full" : null }, full),
                short ? h("span", { key: "s", className: "sticky-country-short" }, short) : null
            ]));
        }
        return parts.length ? h("div", { className: "sticky-performer-facts" }, parts) : null;
    }

    api.patch.instead("PerformerCard.Details", safe(function (props, renderOriginal) {
        return h(React.Fragment, null, facts(props.performer || {}), renderOriginal());
    }));

    /* ── Rating: ★ 4.5 after the name (replaces Stash's banner) ────── */

    // rating100 is out of 100; shown out of 5, like Stash's star rating
    function ratingLabel(rating100) {
        if (typeof rating100 !== "number" || rating100 <= 0) return null;
        return (Math.round(rating100 / 10) / 2).toString();
    }

    api.patch.instead("PerformerCard.Title", safe(function (props, renderOriginal) {
        var original = renderOriginal();
        var label = ratingLabel((props.performer || {}).rating100);
        if (!label) return original;
        var rating = h("span", { key: "sticky-rating", className: "sticky-rating", title: "Rating" }, label);
        // Stash's title is a <div> holding the name; add the rating inside
        // it so it sits on the same line.
        if (original && original.props && React.isValidElement(original)) {
            return React.cloneElement(original, null, original.props.children, rating);
        }
        return h(React.Fragment, null, original, rating);
    }));

    /* ── Gallery count ────────────────────────────────────────────── */
    // Shown straight after the scene count (placed by CSS), and like
    // Stash's own counts, only when there's at least one.

    var GALLERY_ICON = "M96 96c0-35.3 28.7-64 64-64l320 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64l-320 0c-35.3 0-64-28.7-64-64L96 96zM24 128c13.3 0 24 10.7 24 24l0 296c0 8.8 7.2 16 16 16l360 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L64 512c-35.3 0-64-28.7-64-64L0 152c0-13.3 10.7-24 24-24zm168 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm196.5 11.5c-4.4-7.1-12.1-11.5-20.5-11.5s-16.1 4.4-20.5 11.5l-56.3 92.1-24.5-30.6c-4.6-5.7-11.4-9-18.7-9s-14.2 3.3-18.7 9l-64 80c-5.8 7.2-6.9 17.1-2.9 25.4S174.8 352 184 352l272 0c8.7 0 16.7-4.7 20.9-12.3s4.1-16.8-.5-24.3l-88-144z";

    function galleryCount(performer) {
        if (typeof performer.gallery_count !== "number" || performer.gallery_count < 1) return null;
        var href = '/galleries?c=("type":"performers","modifier":"INCLUDES_ALL","value":("items":[("id":"' +
            performer.id + '","label":"' + String(performer.name || "").replace(/"/g, "") +
            '")],"excluded":[]))';
        return link(href, { className: "sticky-gallery-count", title: "Galleries" },
            h("span", { className: "btn btn-primary minimal" },
                h("svg", { viewBox: "0 0 576 512", width: "1em", height: "1em", "aria-hidden": true },
                    h("path", { fill: "currentColor", d: GALLERY_ICON })),
                h("span", null, performer.gallery_count)
            )
        );
    }

    /* ── Career length pill ───────────────────────────────────────── */
    // Stash's career field is free text ("2015 - 2020", "2015 -"); tidied
    // to "2015–2020" / "2015–" (still active). Newer Stash versions split it into
    // start and end years, which are handled too.
    function careerLabel(performer) {
        var text = performer.career_length;
        if (!text && (performer.career_start || performer.career_end)) {
            text = (performer.career_start || "?") + " - " + (performer.career_end || "");
        }
        if (!text || !String(text).trim()) return null;
        text = String(text).trim()
            .replace(/\s*[-–—]\s*(present|now|current)?\s*$/i, "–")
            .replace(/\s*[-–—]\s*/g, "–");
        return text;
    }

    /* ── Footer: pills row (career + any add-ons), then the counts ── */
    // Add-on pills come from Sticky.cards.performerPills (sticky-cards.js):
    // components that other files register, each given the performer.
    // With none registered, the career pill stands on its own.

    api.patch.instead("PerformerCard.Popovers", safe(function (props, renderOriginal) {
        var performer = props.performer || {};
        var career = careerLabel(performer);
        var extras = (C.performerPills || []).map(function (Pill, i) {
            return h(Pill, { key: "pill-" + i, performer: performer });
        });
        return h("div", { className: "sticky-card-footer" },
            h("div", { className: "sticky-performer-pills" },
                career ? h("span", { className: "sticky-pill sticky-pill--career", title: "Career" }, career) : null,
                extras
            ),
            h("div", { className: "sticky-card-extras" }, renderOriginal(), galleryCount(performer))
        );
    }));
})();
