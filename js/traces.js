/**
 * ORCA Flow - Trace grouping and colouring
 *
 * Purpose: Decides which wires are one trace and gives each trace a colour,
 *          for the opt-in `line-theme` palettes.
 *
 * This module is pure. It touches no DOM and no globals, so it runs under node
 * for unit tests and in the browser for rendering.
 *
 * Model
 * -----
 * Connections are numbered in the order the nodes block declares them. Every
 * piece a connection splits into across box levels carries that one number,
 * so pieces need no joining here. Wires that share a merge bus draw as one
 * line where they meet, so each bus links its members into one trace.
 *
 * Traces take palette colours in order of their first connection, so adding
 * a wire never recolours the ones above it. An override on any member colours
 * the whole trace.
 *
 * Author: ORCA Flow Project
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.OrcaTraces = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // =========================================================================
    // 1. LIMITS
    // =========================================================================

    /** Most connections one diagram may colour. */
    const MAX_CONNECTIONS = 100000;

    /** A colour an override may name, `#rgb` or `#rrggbb`. */
    const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    // =========================================================================
    // 2. GROUPING
    // =========================================================================

    /**
     * @brief Tells whether a string is a hex colour safe to write into SVG.
     * @param {string} value - Candidate colour.
     * @returns {boolean} True for `#rgb` or `#rrggbb`.
     */
    function isHexColour(value) {
        return typeof value === 'string' && HEX_COLOUR.test(value);
    }

    /**
     * @brief Unions connections into traces.
     *
     * Union-find with path halving, so every find is bounded by the number of
     * connections rather than by recursion depth.
     *
     * @pre count must be a non-negative integer no larger than MAX_CONNECTIONS.
     *
     * @param {number} count - Number of connections, numbered 0..count-1.
     * @param {Array} links - [a, b] pairs of connection indices that must share
     *                        a colour, such as two members of one bus.
     * @returns {Array} Trace id per connection. A trace id is the smallest
     *                  connection index in the trace.
     */
    function groupTraces(count, links) {
        console.assert(Number.isInteger(count) && count >= 0 && count <= MAX_CONNECTIONS,
            'groupTraces needs a bounded connection count');
        const parent = [];
        for (let i = 0; i < count; i++) parent.push(i);

        function find(i) {
            for (let step = 0; step < count && parent[i] !== i; step++) {
                parent[i] = parent[parent[i]];
                i = parent[i];
            }
            return i;
        }

        for (const [a, b] of links) {
            if (!(a >= 0 && a < count && b >= 0 && b < count)) continue;
            const ra = find(a);
            const rb = find(b);
            // The smaller index stays the root, so a trace id is its first wire.
            if (ra < rb) parent[rb] = ra;
            else if (rb < ra) parent[ra] = rb;
        }

        const traces = [];
        for (let i = 0; i < count; i++) traces.push(find(i));
        return traces;
    }

    // =========================================================================
    // 3. COLOURING
    // =========================================================================

    /**
     * @brief Gives every connection the colour of its trace.
     *
     * A trace takes palette[rank % length], where rank orders traces by their
     * first connection. An override colours its whole trace. Two different
     * overrides on one trace conflict, the lower connection index wins and the
     * other is reported.
     *
     * @pre palette must hold at least one colour.
     *
     * @param {Array} traces - Output of groupTraces().
     * @param {Array} palette - Colours to cycle through.
     * @param {Object} overrides - Connection index -> hex colour. Values that
     *                             are not hex colours are ignored.
     * @returns {Object} { colours, conflicts } where colours has one entry per
     *                   connection and a conflict is { connection, kept, dropped }.
     */
    function assignColours(traces, palette, overrides) {
        console.assert(Array.isArray(palette) && palette.length > 0, 'a palette needs colours');

        const chosen = {};      // trace id -> override colour
        const conflicts = [];
        const indices = Object.keys(overrides || {}).map(Number).sort((a, b) => a - b);
        for (const index of indices) {
            const colour = overrides[index];
            if (!isHexColour(colour) || !(index >= 0 && index < traces.length)) continue;
            const trace = traces[index];
            if (chosen[trace] === undefined) {
                chosen[trace] = colour;
            } else if (chosen[trace].toLowerCase() !== colour.toLowerCase()) {
                conflicts.push({ connection: index, kept: chosen[trace], dropped: colour });
            }
        }

        const rank = {};        // trace id -> order of first appearance
        let next = 0;
        const colours = traces.map(trace => {
            if (rank[trace] === undefined) rank[trace] = next++;
            if (chosen[trace] !== undefined) return chosen[trace];
            return palette[rank[trace] % palette.length];
        });

        return { colours: colours, conflicts: conflicts };
    }

    return {
        isHexColour: isHexColour,
        groupTraces: groupTraces,
        assignColours: assignColours
    };
}));
