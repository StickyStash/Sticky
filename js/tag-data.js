/* ───────────────────────────────────────────────────────────────────
   Sticky — tag categories list (shared)

   Stash has no "category" level above parent tags, so the theme keeps
   the list here. Parent tags are matched to it by name (not case-
   sensitive); the description is used when a tag has none in Stash.
   Add or move a parent tag here to change where it shows.

   Used by tag-categories.js (Tags page) and tag-page.js (tag pages).
   ─────────────────────────────────────────────────────────────────── */
(function () {
    "use strict";
    if (window.Sticky && window.Sticky.off) return;   // ?sticky=off

    var CATEGORIES = [
        { key: "action", label: "Action", parents: [
            ["Accessories", "Notable devices or materials directly involved in the action."],
            ["Acts", "Various sexual acts or positions, excluding typical \"finishers\"."],
            ["Finishers", "Acts that typically end a scene, often involving ejaculation or orgasm."]
        ] },
        { key: "people", label: "People", parents: [
            ["Age Group", "Implied age ranges for characters, not performers."],
            ["Ass", "Various descriptions of a performer's backside, often regarding size."],
            ["Body Type", "Various descriptions of body fat, body shape, body hair, or muscle tone."],
            ["Breasts", "Various descriptions of a performer's breasts or nipples, often regarding size."],
            ["Clothing", "Articles or styles of clothing worn by a performer that is featured in the scene."],
            ["Face", "Various descriptions of a performer's facial features."],
            ["Genitals", "Various descriptions of a performer's genitals or pubic hair, often regarding size."],
            ["Hair Color", "Hair colors for featured performers, including wigs and dyes."],
            ["Hair Style", "Various descriptions of hair styles, cuts, textures, and lengths."],
            ["Height", "Defined ranges of a performer's height, separated by gender."],
            ["Piercings", "Various types of body piercings."],
            ["Race", "Broad categories for a performer's racial background."],
            ["Skin Tone", "Various skin tones, colorations, or other notable features."],
            ["Tattoos", "Various types of permanent tattoos."]
        ] },
        { key: "scene", label: "Scene", parents: [
            ["Group Makeup", "Number of scene partners and often their genders."],
            ["Locations", "Where the action takes place."],
            ["Misc", "Information about the video itself rather than its content, or various descriptors that do not fit other tag categories."],
            ["Moods", "A character's emotions, a performer's style, or the overall tone of the scene."],
            ["Motivations", "What motivates the characters into starting the action."],
            ["Orientation", "Broad categories of sex/gender combinations, often aligning more closely to traditional marketing terms than real-world sexual orientations."],
            ["Relations", "How characters know each other, including casual, romantic, professional, and familial relationships."],
            ["Roles", "Common character archetypes or personalities."],
            ["Shot Type", "Technical details of how a video is filmed or edited."],
            ["Surfaces", "What the action takes place on top of, often furniture of some kind."],
            ["Themes", "Events, contexts, or fetishes often featured in scenes."]
        ] }
    ];

    var lookup = {};
    CATEGORIES.forEach(function (c) {
        c.parents.forEach(function (p) {
            lookup[p[0].trim().toLowerCase()] = { key: c.key, label: c.label, desc: p[1] };
        });
    });

    window.StickyTags = {
        CATEGORIES: CATEGORIES,
        // Parent tag name → { key, label, desc } of its category, or null
        find: function (name) {
            return lookup[String(name || "").trim().toLowerCase()] || null;
        }
    };
})();
