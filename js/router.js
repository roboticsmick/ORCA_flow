/**
 * ORCA Flow - Orthogonal channel router
 *
 * Purpose: Routes connections between nodes as PCB-style orthogonal traces.
 *          Every horizontal run owns a track inside a row gap, every vertical
 *          run owns a track inside a free corridor, and no two wires overlap.
 *
 * This module is pure. It touches no DOM and no globals, so it runs under node
 * for unit tests and in the browser for rendering.
 *
 * Model
 * -----
 * A section is rows 1..R of nodes separated by gaps 1..R-1.
 *
 *   Row band    The vertical extent of one row of nodes. A wire travelling
 *               between two gaps must cross it through a free interval.
 *   Gap band    The space between two rows. Holds horizontal tracks.
 *   Free        A maximal X span inside a row band that no node occupies,
 *   interval    widened by a clearance margin.
 *
 * Every net becomes an alternating sequence: stub, H, V, H, ..., H, drop.
 *
 * Allocation
 * ----------
 * Horizontal tracks use the left-edge algorithm: sort runs by left endpoint,
 * give each the lowest track whose occupied spans do not overlap it. Vertical
 * crossings of one row band all span that band's full height, so each takes a
 * track of its own.
 *
 * What is guaranteed
 * ------------------
 * Two horizontal runs in one gap never overlap, and two vertical crossings of
 * one row band never share a column. Verticals that meet inside a gap band,
 * such as a stub and a drop from nodes stacked one above the other, are pushed
 * apart by a relaxation pass instead, which is bounded and can run out of room
 * on a node edge too crowded to hold its ports. That is the one case where an
 * overlap can survive, so callers should run findOverlaps() on the result
 * rather than assume it is clean.
 *
 * A corridor must also be wide enough for its crossings. planSection() reports
 * the content width it needs as requiredContentWidth, and a caller that ignores
 * it will get compressed, visually merged verticals.
 *
 * Author: ORCA Flow Project
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.OrcaRouter = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // =========================================================================
    // 1. DEFAULTS AND LIMITS
    // =========================================================================

    /**
     * Default geometry. Every value is in pixels. Callers override by passing
     * a partial geometry object to planSection().
     */
    const DEFAULT_GEOMETRY = {
        nodeHeight: 40,       // Vertical extent of a row band.
        clearance: 10,        // Minimum space between a wire and a node edge.
        hTrackPitch: 15,      // Space between horizontal tracks in a gap.
        vTrackPitch: 14,      // Minimum space between vertical tracks in a corridor.
        vTrackPitchMax: 48,   // Most a corridor will spread its tracks apart.
        portPitch: 12,        // Least space between ports on one node edge.
        portPitchMax: 30,     // Most a node edge will spread its ports apart.
        portInset: 6,         // Keep ports this far inside the node outline.
        arrowClearance: 10,   // Room below the last track for an arrowhead.
        cornerRadius: 4       // Radius of a trace corner.
    };

    /** Guards against pathological inputs producing unbounded loops. */
    const MAX_ROWS = 512;
    const MAX_NETS = 4096;

    /** Two X values closer than this are treated as the same position. */
    const EPSILON = 0.5;

    // =========================================================================
    // 2. SMALL HELPERS
    // =========================================================================

    /**
     * @brief Asserts a condition, throwing with context when it fails.
     * @param {boolean} condition - Must be truthy.
     * @param {string} message - Explanation used in the thrown Error.
     * @returns {void}
     */
    function assert(condition, message) {
        if (!condition) {
            throw new Error('OrcaRouter: ' + message);
        }
    }

    /**
     * @brief Clamps a value into an inclusive range.
     * @param {number} value - Value to clamp.
     * @param {number} low - Lower bound.
     * @param {number} high - Upper bound.
     * @returns {number} Value constrained to [low, high].
     */
    function clamp(value, low, high) {
        if (value < low) return low;
        if (value > high) return high;
        return value;
    }

    /**
     * @brief Tests whether two closed intervals overlap by more than a margin.
     *
     * The margin is the separation the two intervals must keep, so with a
     * non-zero margin two runs that merely touch still conflict. Only with a
     * margin of zero may runs sharing a single endpoint share a track.
     *
     * @param {number} aLow - Start of the first interval.
     * @param {number} aHigh - End of the first interval.
     * @param {number} bLow - Start of the second interval.
     * @param {number} bHigh - End of the second interval.
     * @param {number} margin - Required separation between the intervals.
     * @returns {boolean} True when the intervals conflict.
     */
    function intervalsConflict(aLow, aHigh, bLow, bHigh, margin) {
        return aLow < bHigh + margin && bLow < aHigh + margin;
    }

    // =========================================================================
    // 3. ROW BANDS AND FREE INTERVALS
    // =========================================================================

    /**
     * @brief Builds the free intervals of one row band.
     *
     * Each node blocks its own width plus a clearance margin on both sides.
     * What remains between and outside those blocks is where a vertical trace
     * may cross the row.
     *
     * @pre nodes must each carry numeric centreX and width.
     *
     * @param {Array} nodes - Nodes in the row, any order.
     * @param {number} minX - Left edge of the routable area.
     * @param {number} maxX - Right edge of the routable area.
     * @param {number} clearance - Margin held around each node.
     * @returns {Array} Free intervals as { x0, x1, width, crossings: [] },
     *                  ordered left to right. Always at least one entry.
     */
    function buildFreeIntervals(nodes, minX, maxX, clearance) {
        assert(maxX > minX, 'row band has no routable width');

        const blocks = nodes
            .map(node => ({
                low: node.centreX - node.width / 2 - clearance,
                high: node.centreX + node.width / 2 + clearance
            }))
            .sort((a, b) => a.low - b.low);

        // Merge blocks that touch or overlap, so gaps between them are genuine.
        const merged = [];
        for (const block of blocks) {
            const last = merged[merged.length - 1];
            if (last && block.low <= last.high) {
                last.high = Math.max(last.high, block.high);
            } else {
                merged.push({ low: block.low, high: block.high });
            }
        }

        const intervals = [];
        let cursor = minX;
        for (const block of merged) {
            if (block.low > cursor) {
                intervals.push({ x0: cursor, x1: block.low });
            }
            cursor = Math.max(cursor, block.high);
        }
        if (maxX > cursor) {
            intervals.push({ x0: cursor, x1: maxX });
        }

        // A row of nodes wide enough to fill the section leaves nothing free.
        // Fall back to the margins outside the outermost nodes.
        if (intervals.length === 0) {
            intervals.push({ x0: minX, x1: minX });
            intervals.push({ x0: maxX, x1: maxX });
        }

        return intervals.map(iv => ({
            x0: iv.x0,
            x1: iv.x1,
            width: iv.x1 - iv.x0,
            centre: (iv.x0 + iv.x1) / 2,
            crossings: []
        }));
    }

    /**
     * @brief Chooses which free interval a crossing should use.
     *
     * Picks the usable interval whose centre is nearest the wire's ideal X, so
     * a trace detours as little as possible. An interval too narrow for a
     * single track is skipped unless no wider one exists.
     *
     * @param {Array} intervals - Free intervals of the row band.
     * @param {number} idealX - Where the wire would cross if nodes allowed it.
     * @param {number} minWidth - Width needed to hold one vertical track.
     * @returns {Object} The chosen free interval.
     */
    function chooseFreeInterval(intervals, idealX, minWidth) {
        assert(intervals.length > 0, 'row band has no free interval');

        let best = null;
        let bestCost = Infinity;
        for (const interval of intervals) {
            if (interval.width < minWidth) continue;
            const cost = Math.abs(interval.centre - idealX);
            if (cost < bestCost) {
                bestCost = cost;
                best = interval;
            }
        }
        if (best) return best;

        // Nothing is wide enough. Take the widest interval and let the vertical
        // tracks share it at a compressed pitch.
        return intervals.reduce((widest, iv) => (iv.width > widest.width ? iv : widest), intervals[0]);
    }

    // =========================================================================
    // 4. NET DECOMPOSITION
    // =========================================================================

    /**
     * @brief Works out which gaps a net uses and which row bands it crosses.
     *
     * Row indices are zero based positions in the rows array, not DSL row
     * numbers. Gap g lies between row band g and row band g + 1.
     *
     * @param {number} sourceRow - Zero based row index of the source.
     * @param {number} targetRow - Zero based row index of the target.
     * @param {number} rowCount - Total number of rows in the section.
     * @returns {Object} { direction, gaps, crossedRows, sourceEdge, targetEdge }
     *                   where gaps and crossedRows are ordered along the path.
     */
    function decomposeNet(sourceRow, targetRow, rowCount) {
        assert(rowCount > 0, 'section has no rows');

        if (sourceRow === targetRow) {
            // Same row. Both ends leave the bottom edge and the wire runs down,
            // across and back up through the gap below the row. The last row
            // has no gap under it, so the section grows a trailing one.
            return {
                direction: 'same',
                gaps: [sourceRow],
                crossedRows: [],
                sourceEdge: 'bottom',
                targetEdge: 'bottom'
            };
        }

        const down = targetRow > sourceRow;
        const first = Math.min(sourceRow, targetRow);
        const last = Math.max(sourceRow, targetRow);

        // Gaps first..last-1 lie between the two rows.
        const gapRange = [];
        for (let g = first; g <= last - 1; g++) {
            gapRange.push(g);
        }
        // Row bands strictly between the two rows must be crossed.
        const crossRange = [];
        for (let r = first + 1; r <= last - 1; r++) {
            crossRange.push(r);
        }

        return {
            direction: down ? 'down' : 'up',
            gaps: down ? gapRange : gapRange.slice().reverse(),
            crossedRows: down ? crossRange : crossRange.slice().reverse(),
            sourceEdge: down ? 'bottom' : 'top',
            targetEdge: down ? 'top' : 'bottom'
        };
    }

    // =========================================================================
    // 5. PORT ASSIGNMENT
    // =========================================================================

    /**
     * @brief Spreads ports evenly across one edge of a node.
     *
     * Ports are ordered by the X each wire heads toward, which is what stops
     * wires crossing each other the moment they leave the node. All incoming
     * unidirectional wires of a merge bus arrive through a single shared port.
     *
     * Ports use as much of the edge as they can, up to portPitchMax, so a node
     * with several wires fans them out instead of emitting a tight bundle that
     * has to spread again immediately below.
     *
     * @param {Object} node - Node carrying centreX and width.
     * @param {Array} attachments - Entries as { key, idealX }, one per port.
     * @param {Object} geometry - Geometry settings.
     * @returns {Object} Map from attachment key to port X in pixels.
     */
    function assignPorts(node, attachments, geometry) {
        const result = {};
        const count = attachments.length;
        if (count === 0) return result;

        const ordered = attachments.slice().sort((a, b) => {
            if (Math.abs(a.idealX - b.idealX) > EPSILON) return a.idealX - b.idealX;
            return String(a.key) < String(b.key) ? -1 : 1;
        });

        const usable = Math.max(0, node.width - 2 * geometry.portInset);
        const even = count > 1 ? usable / (count - 1) : 0;
        const pitch = count > 1
            ? Math.max(Math.min(even, geometry.portPitchMax), Math.min(geometry.portPitch, even))
            : 0;
        const span = pitch * (count - 1);
        const left = node.centreX - span / 2;

        ordered.forEach((attachment, index) => {
            result[attachment.key] = left + index * pitch;
        });

        return result;
    }

    // =========================================================================
    // 6. VERTICAL TRACK ALLOCATION
    // =========================================================================

    /**
     * @brief Places vertical tracks inside one free interval.
     *
     * Every crossing of a row band spans that band's whole height, so no two
     * crossings may share a track. Tracks are centred in the corridor and use
     * as much of its width as they can, up to vTrackPitchMax, because a handful
     * of traces bunched at the minimum pitch reads as a smear rather than as
     * separate wires. A corridor too narrow for the minimum pitch compresses.
     *
     * Crossings are ordered by the mean of the X the wire comes from and the X
     * it heads to, which keeps traces from swapping sides inside the corridor.
     *
     * @param {Object} interval - Free interval with a populated crossings list.
     * @param {Object} geometry - Geometry settings.
     * @returns {number} Width the interval would need at the minimum pitch.
     */
    function placeVerticalTracks(interval, geometry) {
        const count = interval.crossings.length;
        if (count === 0) return 0;

        interval.crossings.sort((a, b) => {
            const aKey = (a.fromX + a.toX) / 2;
            const bKey = (b.fromX + b.toX) / 2;
            if (Math.abs(aKey - bKey) > EPSILON) return aKey - bKey;
            if (Math.abs(a.toX - b.toX) > EPSILON) return a.toX - b.toX;
            return String(a.netId) < String(b.netId) ? -1 : 1;
        });

        const required = (count + 1) * geometry.vTrackPitch;
        const even = interval.width / (count + 1);

        // WHY: vTrackPitch was documented as a minimum but only ever used as a
        // cap, so a narrow corridor stacked wires 2px apart under a 2px stroke
        // and read as one smear. It is a floor whenever the corridor can hold
        // it; when it cannot, planSection has already asked for a wider
        // section, and spreading evenly is the safe fallback.
        const pitch = interval.width >= required
            ? Math.max(geometry.vTrackPitch, Math.min(geometry.vTrackPitchMax, even))
            : even;

        const span = pitch * (count - 1);
        const left = interval.centre - span / 2;

        interval.crossings.forEach((crossing, index) => {
            crossing.x = clamp(left + index * pitch, interval.x0, interval.x1);
        });

        return required;
    }

    /**
     * @brief Pushes apart vertical traces that would run down the same column.
     *
     * Inside a gap band three kinds of vertical appear: a stub leaving a source
     * node, a drop entering a target node, and the through portion of a wire
     * crossing to the next gap. A stub and a drop collide whenever one node
     * sits directly above another, which is common and is what makes a diagram
     * look tangled.
     *
     * Ports may slide along their own node edge, so the pass relaxes them apart
     * in proportion to the room each one has. Crossings are pinned, because
     * moving one would push it into a node.
     *
     * The loop is bounded. Entries with nowhere left to go are left where they
     * are rather than looping forever.
     *
     * @param {Array} entries - { x, minX, maxX, movable, commit } records.
     * @param {number} minSeparation - Column spacing to achieve.
     * @returns {void}
     */
    function separateGapVerticals(entries, minSeparation) {
        const MAX_PASSES = 32;
        if (entries.length < 2) return;

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            entries.sort((a, b) => a.x - b.x);
            let moved = false;

            for (let i = 0; i + 1 < entries.length; i++) {
                const left = entries[i];
                const right = entries[i + 1];
                const deficit = minSeparation - (right.x - left.x);
                if (deficit <= EPSILON) continue;

                const leftRoom = left.movable ? Math.max(0, left.x - left.minX) : 0;
                const rightRoom = right.movable ? Math.max(0, right.maxX - right.x) : 0;
                const total = leftRoom + rightRoom;
                if (total <= EPSILON) continue;

                left.x -= Math.min(deficit * (leftRoom / total), leftRoom);
                right.x += Math.min(deficit * (rightRoom / total), rightRoom);
                moved = true;
            }

            if (!moved) break;
        }

        for (const entry of entries) {
            if (entry.movable) entry.commit(entry.x);
        }
    }

    // =========================================================================
    // 7. HORIZONTAL TRACK ALLOCATION
    // =========================================================================

    /**
     * @brief Assigns horizontal tracks in one gap using the left-edge algorithm.
     *
     * Runs are sorted by left endpoint and each takes the lowest track index
     * whose occupied spans do not conflict with it. This is the classic channel
     * routing allocation and uses the minimum number of tracks for the given
     * ordering, with the guarantee that two runs on one track never overlap.
     *
     * Runs belonging to the same merge bus arrive here already combined into a
     * single run, so a bus occupies exactly one track.
     *
     * @param {Array} runs - Entries as { low, high, ... }; mutated with .track.
     * @param {number} margin - Required separation between runs on one track.
     * @returns {number} Number of tracks used.
     */
    function assignHorizontalTracks(runs, margin) {
        if (runs.length === 0) return 0;

        const ordered = runs.slice().sort((a, b) => {
            if (Math.abs(a.low - b.low) > EPSILON) return a.low - b.low;
            return b.high - a.high;  // Longer runs first on a tie.
        });

        const tracks = [];  // tracks[i] holds the runs already placed on track i.

        for (const run of ordered) {
            let placed = false;
            for (let t = 0; t < tracks.length && !placed; t++) {
                const conflict = tracks[t].some(other =>
                    intervalsConflict(run.low, run.high, other.low, other.high, margin));
                if (!conflict) {
                    tracks[t].push(run);
                    run.track = t;
                    placed = true;
                }
            }
            if (!placed) {
                run.track = tracks.length;
                tracks.push([run]);
            }
        }

        return tracks.length;
    }

    // =========================================================================
    // 8. SECTION PLANNING
    // =========================================================================

    /**
     * @brief Plans every connection in a section into track space.
     *
     * The plan holds track indices and X pixels but no Y pixels, because row Y
     * positions depend on the uniform gap height chosen across the whole
     * diagram. Call emitSection() once those are known.
     *
     * A box edge is routed the same way a node is. A level whose boxes are
     * sections gives the router one row per box, and reaches the level's own
     * outer edge through a boundary row: a row of one node that spans the
     * bounds, carries boundary: true and has zero height. Ports along it are
     * then spread by the same assignPorts() that fans out a node edge, and a
     * wire ending there gets neither an arrowhead nor a place in a merge bus,
     * because the wire continues at the level above. A connection carrying
     * continuesFrom or continuesTo is treated the same way at that end, which
     * is how a level marks a wire that carries on inside a child box.
     *
     * @pre spec.rows must be a non-empty array of rows, each with a nodes array.
     * @pre Every node must carry a unique id, a numeric centreX and a width.
     * @pre spec.bounds must give minX and maxX with maxX greater than minX.
     * @pre A boundary row must be the first or the last row, never between.
     *
     * @param {Object} spec - { rows, connections, bounds, geometry }.
     * @returns {Object} Plan with:
     *   - nets: routed nets carrying runs, crossings, ports and bus membership
     *   - geometry: the settings used, after defaults were filled in
     *   - rows: the rows as given
     *   - rowBands: free interval data, kept for diagnostics and tests
     *   - buses: merge buses by key, each with its shared run
     *   - gapRuns: horizontal runs by gap index
     *   - gapTrackCounts: tracks used per gap
     *   - maxGapTracks: largest gap track count in this section
     *   - hasTrailingGap: true when a same-row wire needs a gap below the last
     *     row, so the caller must reserve height for it
     *   - requiredContentWidth: content width at which every corridor can hold
     *     its crossings at the minimum pitch. A caller that gets back a larger
     *     value than it asked for should widen and plan again.
     *   - requiredWidths: width each row band would need at the minimum pitch
     */
    function planSection(spec) {
        assert(spec && Array.isArray(spec.rows), 'planSection needs a rows array');
        assert(spec.rows.length > 0 && spec.rows.length <= MAX_ROWS, 'row count out of range');
        assert(spec.bounds && spec.bounds.maxX > spec.bounds.minX, 'bounds must have positive width');

        const geometry = Object.assign({}, DEFAULT_GEOMETRY, spec.geometry || {});
        const connections = spec.connections || [];
        assert(connections.length <= MAX_NETS, 'connection count out of range');

        const rows = spec.rows;
        const rowCount = rows.length;
        const minX = spec.bounds.minX;
        const maxX = spec.bounds.maxX;

        // Index every node and remember which row band holds it.
        const nodeIndex = {};
        rows.forEach((row, rowIdx) => {
            for (const node of row.nodes) {
                assert(typeof node.centreX === 'number', 'node ' + node.id + ' has no centreX');
                assert(typeof node.width === 'number', 'node ' + node.id + ' has no width');
                nodeIndex[node.id] = { node: node, rowIdx: rowIdx };
            }
        });

        // Free intervals per row band, where vertical traces may cross.
        const rowBands = rows.map(row => ({
            nodes: row.nodes,
            intervals: buildFreeIntervals(row.nodes, minX, maxX, geometry.clearance)
        }));

        // ---------------------------------------------------------------------
        // 8.1 Build nets and discard connections the section cannot route.
        // ---------------------------------------------------------------------
        const nets = [];
        connections.forEach((conn, index) => {
            const source = nodeIndex[conn.from];
            const target = nodeIndex[conn.to];
            if (!source || !target) return;

            const shape = decomposeNet(source.rowIdx, target.rowIdx, rowCount);
            if (shape.gaps.length === 0 || shape.gaps[0] < 0) return;
            if (shape.gaps[shape.gaps.length - 1] > rowCount - 1) return;

            nets.push({
                id: conn.id !== undefined ? conn.id : 'net' + index,
                from: conn.from,
                to: conn.to,
                type: conn.type || 'unidirectional',
                dashed: !!conn.dashed,
                continuesFrom: !!conn.continuesFrom,
                continuesTo: !!conn.continuesTo,
                source: source.node,
                target: target.node,
                sourceRow: source.rowIdx,
                targetRow: target.rowIdx,
                direction: shape.direction,
                gaps: shape.gaps,
                crossedRows: shape.crossedRows,
                sourceEdge: shape.sourceEdge,
                targetEdge: shape.targetEdge,
                crossings: [],
                runs: []
            });
        });

        // ---------------------------------------------------------------------
        // 8.2 Group merge buses. Unidirectional nets sharing a target and an
        //     arrival edge share one final track and one drop into the node.
        // ---------------------------------------------------------------------
        const buses = {};
        for (const net of nets) {
            if (net.type === 'bidirectional') continue;
            // Wires reaching a box edge each continue somewhere different at
            // the level above, or inside the box, so they must keep their own
            // port and never merge into one bar.
            if (net.target.boundary || net.continuesTo) continue;
            const key = net.to + '|' + net.targetEdge;
            if (!buses[key]) {
                buses[key] = { key: key, target: net.target, edge: net.targetEdge, members: [] };
            }
            buses[key].members.push(net);
            net.busKey = key;
        }
        for (const key in buses) {
            if (buses[key].members.length < 2) {
                buses[key].members[0].busKey = null;
                delete buses[key];
            }
        }

        // ---------------------------------------------------------------------
        // 8.3 Assign ports on every node edge.
        //
        // A net's ideal X is the far end it is heading toward, so ports end up
        // in the same left to right order as the wires leaving them.
        // ---------------------------------------------------------------------
        const edgeAttachments = {};  // "nodeId|edge" -> [{ key, idealX }]

        /**
         * @brief Records one attachment on a node edge, de-duplicating buses.
         * @param {string} nodeId - Node the attachment sits on.
         * @param {string} edge - Either "top" or "bottom".
         * @param {string} key - Identity of the attachment.
         * @param {number} idealX - X the wire heads toward.
         * @returns {void}
         */
        function addAttachment(nodeId, edge, key, idealX) {
            const edgeKey = nodeId + '|' + edge;
            if (!edgeAttachments[edgeKey]) edgeAttachments[edgeKey] = [];
            const existing = edgeAttachments[edgeKey].find(a => a.key === key);
            if (existing) {
                // A shared bus port sits at the mean of its members' approaches.
                existing.idealX = (existing.idealX * existing.count + idealX) / (existing.count + 1);
                existing.count += 1;
                return;
            }
            edgeAttachments[edgeKey].push({ key: key, idealX: idealX, count: 1 });
        }

        for (const net of nets) {
            addAttachment(net.from, net.sourceEdge, 'out:' + net.id, net.target.centreX);
            const inKey = net.busKey ? 'bus:' + net.busKey : 'in:' + net.id;
            addAttachment(net.to, net.targetEdge, inKey, net.source.centreX);
        }

        const portX = {};  // "nodeId|edge|key" -> pixel X
        for (const edgeKey in edgeAttachments) {
            const nodeId = edgeKey.split('|')[0];
            const assigned = assignPorts(nodeIndex[nodeId].node, edgeAttachments[edgeKey], geometry);
            for (const key in assigned) {
                portX[edgeKey + '|' + key] = assigned[key];
            }
        }

        for (const net of nets) {
            net.sourceX = portX[net.from + '|' + net.sourceEdge + '|out:' + net.id];
            const inKey = net.busKey ? 'bus:' + net.busKey : 'in:' + net.id;
            net.targetX = portX[net.to + '|' + net.targetEdge + '|' + inKey];
        }

        // ---------------------------------------------------------------------
        // 8.4 Choose a free interval for every row band crossing, then place
        //     the vertical tracks. This fixes the X of each crossing, which the
        //     horizontal allocation below needs.
        // ---------------------------------------------------------------------
        const minIntervalWidth = 2 * geometry.vTrackPitch;

        for (const net of nets) {
            const steps = net.crossedRows.length;
            for (let i = 0; i < steps; i++) {
                const rowIdx = net.crossedRows[i];
                // Interpolate between the two ends to find where the wire would
                // cross if no node were in the way.
                const fraction = (i + 1) / (steps + 1);
                const idealX = net.sourceX + (net.targetX - net.sourceX) * fraction;
                const interval = chooseFreeInterval(rowBands[rowIdx].intervals, idealX, minIntervalWidth);

                const crossing = {
                    netId: net.id,
                    rowIdx: rowIdx,
                    interval: interval,
                    fromX: i === 0 ? net.sourceX : idealX,
                    toX: net.targetX,
                    idealX: idealX,
                    x: idealX,
                    track: 0
                };
                interval.crossings.push(crossing);
                net.crossings.push(crossing);
            }
        }

        // Place the tracks, and work out how much wider the section would have
        // to be for every corridor to hold its crossings at the minimum pitch.
        //
        // Nodes in a row of n sit at pitch contentWidth / n, so an interior
        // corridor grows by dW / n and an edge corridor by dW / (2n). Taking
        // the edge factor covers both.
        let requiredContentWidth = maxX - minX;

        const requiredWidths = rowBands.map((band, rowIdx) => {
            const nodeCount = Math.max(1, rows[rowIdx].nodes.length);
            let widest = 0;
            let worstDeficit = 0;

            for (const interval of band.intervals) {
                const needed = placeVerticalTracks(interval, geometry);
                widest = Math.max(widest, needed);
                if (interval.crossings.length > 0) {
                    worstDeficit = Math.max(worstDeficit, needed - interval.width);
                }
            }

            if (worstDeficit > 0) {
                requiredContentWidth = Math.max(
                    requiredContentWidth,
                    (maxX - minX) + worstDeficit * 2 * nodeCount
                );
            }
            return widest;
        });

        // ---------------------------------------------------------------------
        // 8.4b Separate verticals that would share a column inside a gap.
        //
        // Track Y values are not known yet, so the pass treats any two
        // verticals in one gap as conflicting. That over-separates slightly and
        // never under-separates, which is the safe direction.
        // ---------------------------------------------------------------------

        /**
         * @brief Allowed X range for a port sliding along a node edge.
         *
         * A zero-width boundary node is a port the level above has already
         * fixed, so it may not slide at all.
         *
         * @param {Object} node - Node the port belongs to.
         * @returns {Object} { minX, maxX } in pixels.
         */
        function portRange(node) {
            if (node.boundary && node.width === 0) {
                return { minX: node.centreX, maxX: node.centreX };
            }
            return {
                minX: node.centreX - node.width / 2 + geometry.portInset,
                maxX: node.centreX + node.width / 2 - geometry.portInset
            };
        }

        const gapVerticals = {};

        /**
         * @brief Adds one vertical to a gap's separation set.
         * @param {number} gapIdx - Gap the vertical runs through.
         * @param {Object} entry - Record accepted by separateGapVerticals().
         * @returns {void}
         */
        function addVertical(gapIdx, entry) {
            if (gapIdx < 0 || gapIdx > rowCount - 1) return;
            if (!gapVerticals[gapIdx]) gapVerticals[gapIdx] = [];
            gapVerticals[gapIdx].push(entry);
        }

        for (const net of nets) {
            const firstGap = net.gaps[0];
            const lastGap = net.gaps[net.gaps.length - 1];

            const sourceRange = portRange(net.source);
            addVertical(firstGap, {
                x: net.sourceX,
                minX: sourceRange.minX,
                maxX: sourceRange.maxX,
                movable: true,
                commit: function (x) { net.sourceX = x; }
            });

            // A bus shares one drop, so only the first member registers it.
            const busOwner = net.busKey ? buses[net.busKey] : null;
            if (!busOwner || busOwner.members[0] === net) {
                const targetRange = portRange(net.target);
                addVertical(lastGap, {
                    x: net.targetX,
                    minX: targetRange.minX,
                    maxX: targetRange.maxX,
                    movable: true,
                    commit: function (x) {
                        if (busOwner) {
                            for (const member of busOwner.members) member.targetX = x;
                        } else {
                            net.targetX = x;
                        }
                    }
                });
            }

            // A crossing occupies a column in the gap above and below it.
            //
            // WHY: crossings used to be pinned here. Vertical tracks are placed
            // per row band, so a crossing of band r and one of band r + 1 could
            // be given the same X, and both being pinned meant the separation
            // pass had to leave them coincident in the gap between the bands.
            // They may now slide anywhere inside their own corridor, which is
            // clear of nodes by construction.
            net.crossings.forEach(crossing => {
                const pinned = {
                    x: crossing.x,
                    minX: crossing.interval.x0,
                    maxX: crossing.interval.x1,
                    movable: true,
                    commit: function (x) { crossing.x = x; }
                };
                // WHY: a row band is bounded by the gap above it and the gap
                // below it whichever way the wire travels. Deriving the pair
                // from the direction put upward crossings in gaps that do not
                // touch them, so they were never de-conflicted and collided
                // with stubs from the row above.
                addVertical(crossing.rowIdx - 1, pinned);
                addVertical(crossing.rowIdx, pinned);
            });
        }

        for (const gapIdx in gapVerticals) {
            separateGapVerticals(gapVerticals[gapIdx], geometry.portPitch);
        }

        // ---------------------------------------------------------------------
        // 8.5 Build the horizontal runs. A net has one run per gap it uses,
        //     stretching between consecutive X positions along its path.
        // ---------------------------------------------------------------------
        const gapRuns = {};  // gap index -> array of runs

        for (const net of nets) {
            const xs = [net.sourceX];
            for (const crossing of net.crossings) xs.push(crossing.x);
            xs.push(net.targetX);

            assert(xs.length === net.gaps.length + 1, 'net ' + net.id + ' path length mismatch');

            net.gaps.forEach((gapIdx, i) => {
                const startX = xs[i];
                const endX = xs[i + 1];
                const run = {
                    netId: net.id,
                    gapIdx: gapIdx,
                    startX: startX,
                    endX: endX,
                    low: Math.min(startX, endX),
                    high: Math.max(startX, endX),
                    track: 0
                };
                net.runs.push(run);
                if (!gapRuns[gapIdx]) gapRuns[gapIdx] = [];
                gapRuns[gapIdx].push(run);
            });
        }

        // ---------------------------------------------------------------------
        // 8.6 Merge each bus's final runs into one combined run, so the bus
        //     takes a single track and its members share the drop into the node.
        // ---------------------------------------------------------------------
        for (const key in buses) {
            const bus = buses[key];
            const finals = bus.members.map(net => net.runs[net.runs.length - 1]);
            const gapIdx = finals[0].gapIdx;

            // Only runs landing in the same gap can share a track.
            const sameGap = finals.filter(run => run.gapIdx === gapIdx);
            if (sameGap.length < 2) continue;

            const low = Math.min.apply(null, sameGap.map(r => r.low));
            const high = Math.max.apply(null, sameGap.map(r => r.high));

            const combined = {
                netId: 'bus:' + key,
                busKey: key,
                targetRow: bus.members[0].targetRow,
                gapIdx: gapIdx,
                startX: low,
                endX: high,
                low: low,
                high: high,
                isBus: true,
                members: sameGap,
                dropX: bus.members[0].targetX,
                track: 0
            };

            // Replace the members' individual runs with the shared one.
            const remaining = gapRuns[gapIdx].filter(run => sameGap.indexOf(run) === -1);
            remaining.push(combined);
            gapRuns[gapIdx] = remaining;

            for (const run of sameGap) {
                run.busRun = combined;
            }
            bus.run = combined;
        }

        // ---------------------------------------------------------------------
        // 8.7 Allocate horizontal tracks per gap.
        // ---------------------------------------------------------------------
        // Gap rowCount - 1 is the trailing gap below the last row. It exists
        // only when a same-row wire in that row needs it.
        const hasTrailingGap = (gapRuns[rowCount - 1] || []).length > 0;
        const gapCount = hasTrailingGap ? rowCount : Math.max(0, rowCount - 1);

        const gapTrackCounts = [];
        for (let gapIdx = 0; gapIdx < gapCount; gapIdx++) {
            const runs = gapRuns[gapIdx] || [];
            const used = assignHorizontalTracks(runs, geometry.clearance);
            gapTrackCounts.push(used);
            // A bus run's track belongs to every member run too.
            for (const run of runs) {
                if (run.isBus) {
                    for (const member of run.members) member.track = run.track;
                }
            }
        }

        const maxGapTracks = gapTrackCounts.reduce((a, b) => Math.max(a, b), 0);

        return {
            geometry: geometry,
            rows: rows,
            rowBands: rowBands,
            nets: nets,
            buses: buses,
            gapRuns: gapRuns,
            hasTrailingGap: hasTrailingGap,
            requiredContentWidth: requiredContentWidth,
            gapTrackCounts: gapTrackCounts,
            maxGapTracks: maxGapTracks,
            requiredWidths: requiredWidths
        };
    }

    // =========================================================================
    // 9. PIXEL EMISSION
    // =========================================================================

    /**
     * @brief Computes the gap height that holds a given number of tracks.
     *
     * The first track sits one pitch below the row above, the last track sits
     * one pitch plus the arrow clearance above the row below, so arrowheads
     * never touch a trace.
     *
     * @param {number} trackCount - Tracks the gap must hold.
     * @param {Object} geometry - Geometry settings.
     * @returns {number} Gap height in pixels.
     */
    function gapHeightForTracks(trackCount, geometry) {
        const settings = Object.assign({}, DEFAULT_GEOMETRY, geometry || {});
        const tracks = Math.max(1, trackCount);
        return (tracks + 1) * settings.hTrackPitch + settings.arrowClearance;
    }

    /**
     * @brief Emits pixel geometry for a planned section.
     *
     * Row Y positions come from the caller so every section in the diagram can
     * share one uniform gap height, which is what makes rows line up.
     *
     * Row thickness is per row, because a level whose rows are boxes rather
     * than nodes has rows of different heights, and a boundary row has none at
     * all. Omit rowHeights and every row takes geometry.nodeHeight, which is
     * what a section of uniform node boxes wants.
     *
     * @pre rowTops.length must equal the number of rows in the plan.
     * @pre rowHeights, when given, must have one entry per row.
     *
     * @param {Object} plan - Result of planSection().
     * @param {Array} rowTops - Pixel Y of the top edge of each row band.
     * @param {Array} rowHeights - Optional pixel height of each row band.
     * @returns {Object} With:
     *   - polylines: one { netId, points, dashed } per drawn wire. This is what
     *                callers render; pathData() turns points into SVG.
     *   - segments: the same geometry split into single
     *               { netId, orientation, x1, y1, x2, y2, dashed } runs, for
     *               findOverlaps() and findNodeCollisions().
     *   - junctions: { x, y, busKey } dots where a wire joins a merge bus.
     *   - arrows: { netId, x, y, direction } arrowheads.
     */
    function emitSection(plan, rowTops, rowHeights) {
        assert(plan && Array.isArray(plan.nets), 'emitSection needs a plan');
        assert(Array.isArray(rowTops) && rowTops.length === plan.rows.length,
            'rowTops must have one entry per row');
        assert(!rowHeights || rowHeights.length === plan.rows.length,
            'rowHeights must have one entry per row');

        const geometry = plan.geometry;
        const segments = [];
        const junctions = [];
        const arrows = [];

        /**
         * @brief Pixel height of one row band.
         * @param {number} rowIdx - Zero based row index.
         * @returns {number} Height in pixels.
         */
        function rowHeight(rowIdx) {
            if (!rowHeights) return geometry.nodeHeight;
            return rowHeights[rowIdx];
        }

        /**
         * @brief Pixel Y of a horizontal track inside a gap.
         * @param {number} gapIdx - Index of the gap.
         * @param {number} track - Zero based track index.
         * @returns {number} Pixel Y.
         */
        function trackY(gapIdx, track) {
            const gapTop = rowTops[gapIdx] + rowHeight(gapIdx);
            return gapTop + (track + 1) * geometry.hTrackPitch;
        }

        /**
         * @brief Records a segment, dropping ones of zero length.
         * @param {string} netId - Owning net.
         * @param {number} x1 - Start X.
         * @param {number} y1 - Start Y.
         * @param {number} x2 - End X.
         * @param {number} y2 - End Y.
         * @param {boolean} dashed - Whether the wire is dashed.
         * @returns {void}
         */
        function addSegment(netId, x1, y1, x2, y2, dashed) {
            if (Math.abs(x1 - x2) < EPSILON && Math.abs(y1 - y2) < EPSILON) return;
            segments.push({
                netId: netId,
                orientation: Math.abs(y1 - y2) < EPSILON ? 'h' : 'v',
                x1: x1, y1: y1, x2: x2, y2: y2,
                dashed: dashed
            });
        }

        const polylines = [];

        /**
         * @brief Records a polyline and the segments it is made of.
         * @param {string} netId - Owning net or bus.
         * @param {Array} points - Ordered { x, y } points.
         * @param {boolean} dashed - Whether the wire is dashed.
         * @returns {void}
         */
        function addPolyline(netId, points, dashed) {
            const kept = [];
            for (const point of points) {
                const last = kept[kept.length - 1];
                if (last && Math.abs(last.x - point.x) < EPSILON && Math.abs(last.y - point.y) < EPSILON) {
                    continue;
                }
                kept.push(point);
            }
            if (kept.length < 2) return;

            polylines.push({ netId: netId, points: kept, dashed: dashed });
            for (let i = 0; i + 1 < kept.length; i++) {
                addSegment(netId, kept[i].x, kept[i].y, kept[i + 1].x, kept[i + 1].y, dashed);
            }
        }

        // WHY: a member sitting at either end of a bus bar meets it at a corner,
        // not a T. Emitting the bar separately from that member's vertical left
        // the corner square and earned it a junction dot it had not earned, so
        // C2 -> D1 in the dense fixture read as a join that is not there. The
        // end members draw the bar themselves, which rounds the corner and
        // leaves only the genuine mid-bar joins to be dotted.
        const busEnds = {};
        for (const key in plan.buses) {
            const bus = plan.buses[key];
            const run = bus.run;
            if (!run) continue;

            const dropX = run.dropX;
            const farEnd = (dropX - run.low) >= (run.high - dropX) ? run.low : run.high;
            const nearEnd = farEnd === run.low ? run.high : run.low;
            const targetTop = rowTops[run.targetRow];

            busEnds[key] = {
                dropX: dropX,
                farEnd: farEnd,
                nearEnd: nearEnd,
                y: trackY(run.gapIdx, run.track),
                targetY: bus.edge === 'top' ? targetTop : targetTop + rowHeight(run.targetRow),
                edge: bus.edge,
                farOwned: false,
                nearOwned: false
            };
        }

        for (const net of plan.nets) {
            const dashed = net.dashed;
            const sourceTop = rowTops[net.sourceRow];
            const sourceY = net.sourceEdge === 'bottom'
                ? sourceTop + rowHeight(net.sourceRow)
                : sourceTop;
            const targetTop = rowTops[net.targetRow];
            const targetY = net.targetEdge === 'top'
                ? targetTop
                : targetTop + rowHeight(net.targetRow);

            // Walk the path: leave the source edge, alternate horizontal runs
            // and vertical crossings, then drop into the target edge.
            const points = [{ x: net.sourceX, y: sourceY }];
            let joinsBus = false;

            for (let i = 0; i < net.runs.length; i++) {
                const run = net.runs[i];
                const y = trackY(run.gapIdx, run.track);
                points.push({ x: run.startX, y: y });

                const isFinal = i === net.runs.length - 1;
                if (isFinal && run.busRun) {
                    // The shared bus draws the rest of the way into the node,
                    // unless this member sits at one end of the bar, in which
                    // case it carries the bar on so the corner comes out round.
                    joinsBus = true;
                    const ends = busEnds[run.busRun.busKey];
                    if (ends && !ends.farOwned && Math.abs(run.startX - ends.farEnd) < EPSILON) {
                        ends.farOwned = true;
                        points.push({ x: ends.dropX, y: ends.y });
                        points.push({ x: ends.dropX, y: ends.targetY });
                        arrows.push({
                            netId: net.id,
                            x: ends.dropX,
                            y: ends.targetY,
                            direction: ends.edge === 'top' ? 'down' : 'up'
                        });
                    } else if (ends && !ends.nearOwned
                        && Math.abs(run.startX - ends.nearEnd) < EPSILON
                        && Math.abs(ends.nearEnd - ends.dropX) > EPSILON) {
                        ends.nearOwned = true;
                        points.push({ x: ends.dropX, y: ends.y });
                    }
                    break;
                }
                points.push({ x: run.endX, y: y });
            }

            if (!joinsBus) {
                points.push({ x: net.targetX, y: targetY });
                // A boundary end is a hand-off to the level above, not an
                // arrival, so it carries no arrowhead.
                if (!net.target.boundary && !net.continuesTo) {
                    arrows.push({
                        netId: net.id,
                        x: net.targetX,
                        y: targetY,
                        direction: net.targetEdge === 'top' ? 'down' : 'up'
                    });
                }
            }

            addPolyline(net.id, points, dashed);

            if (net.type === 'bidirectional' && !net.source.boundary && !net.continuesFrom) {
                arrows.push({
                    netId: net.id,
                    x: net.sourceX,
                    y: sourceY,
                    direction: net.sourceEdge === 'bottom' ? 'up' : 'down'
                });
            }
        }

        // A merge bus is a T: one bar along the track, one drop into the node.
        // Drawing it as an elbow plus a stub rounds the corner that readers
        // actually follow.
        for (const key in plan.buses) {
            const bus = plan.buses[key];
            const run = bus.run;
            if (!run) continue;

            const busId = 'bus:' + key;
            const ends = busEnds[key];
            const y = ends.y;
            const targetY = ends.targetY;
            const dropX = ends.dropX;

            // Whatever no end member took, the bus still has to draw. The far
            // leg carries the drop into the node, so it also carries the arrow.
            if (!ends.farOwned) {
                addPolyline(busId, [
                    { x: ends.farEnd, y: y },
                    { x: dropX, y: y },
                    { x: dropX, y: targetY }
                ], false);
                arrows.push({
                    netId: busId,
                    x: dropX,
                    y: targetY,
                    direction: bus.edge === 'top' ? 'down' : 'up'
                });
            }

            if (!ends.nearOwned && Math.abs(ends.nearEnd - dropX) > EPSILON) {
                addPolyline(busId, [{ x: dropX, y: y }, { x: ends.nearEnd, y: y }], false);
            }

            // A dot marks a wire joining the middle of the bar. The drop point
            // and the two ends are corners, and a corner is not a join.
            for (const member of run.members) {
                if (Math.abs(member.startX - dropX) < EPSILON) continue;
                if (Math.abs(member.startX - ends.farEnd) < EPSILON) continue;
                if (Math.abs(member.startX - ends.nearEnd) < EPSILON) continue;
                junctions.push({ x: member.startX, y: y, busKey: key });
            }
        }

        return {
            segments: segments,
            polylines: polylines,
            junctions: junctions,
            arrows: arrows
        };
    }

    // =========================================================================
    // 10. VERIFICATION
    // =========================================================================

    /**
     * @brief Finds segments of different nets that overlap rather than cross.
     *
     * Two parallel segments conflict when they share an orientation, sit on the
     * same line within a tolerance, and their spans overlap. Perpendicular
     * segments crossing at a point are correct and are not reported.
     *
     * This exists so the no-overlap property is checked rather than assumed.
     *
     * @param {Array} segments - Segments from emitSection().
     * @param {number} tolerance - How close two lines must be to count as one.
     * @returns {Array} Conflicts as { a, b, orientation, overlap }.
     */
    function findOverlaps(segments, tolerance) {
        const limit = tolerance === undefined ? 1.0 : tolerance;
        const conflicts = [];

        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const a = segments[i];
                const b = segments[j];
                if (a.orientation !== b.orientation) continue;
                if (a.netId === b.netId) continue;

                if (a.orientation === 'h') {
                    if (Math.abs(a.y1 - b.y1) > limit) continue;
                    const aLow = Math.min(a.x1, a.x2);
                    const aHigh = Math.max(a.x1, a.x2);
                    const bLow = Math.min(b.x1, b.x2);
                    const bHigh = Math.max(b.x1, b.x2);
                    const overlap = Math.min(aHigh, bHigh) - Math.max(aLow, bLow);
                    if (overlap > limit) {
                        conflicts.push({ a: a, b: b, orientation: 'h', overlap: overlap });
                    }
                } else {
                    if (Math.abs(a.x1 - b.x1) > limit) continue;
                    const aLow = Math.min(a.y1, a.y2);
                    const aHigh = Math.max(a.y1, a.y2);
                    const bLow = Math.min(b.y1, b.y2);
                    const bHigh = Math.max(b.y1, b.y2);
                    const overlap = Math.min(aHigh, bHigh) - Math.max(aLow, bLow);
                    if (overlap > limit) {
                        conflicts.push({ a: a, b: b, orientation: 'v', overlap: overlap });
                    }
                }
            }
        }

        return conflicts;
    }

    /**
     * @brief Finds segments that pass through a node outline.
     *
     * @param {Array} segments - Segments from emitSection().
     * @param {Array} nodeBoxes - Entries as { id, x0, y0, x1, y1 }.
     * @param {number} inset - Shrink each box by this much before testing, so a
     *                         trace touching an edge to connect is not a hit.
     * @returns {Array} Hits as { segment, nodeId }.
     */
    function findNodeCollisions(segments, nodeBoxes, inset) {
        const shrink = inset === undefined ? 1.0 : inset;
        const hits = [];

        for (const segment of segments) {
            const sx0 = Math.min(segment.x1, segment.x2);
            const sx1 = Math.max(segment.x1, segment.x2);
            const sy0 = Math.min(segment.y1, segment.y2);
            const sy1 = Math.max(segment.y1, segment.y2);

            for (const box of nodeBoxes) {
                const bx0 = box.x0 + shrink;
                const bx1 = box.x1 - shrink;
                const by0 = box.y0 + shrink;
                const by1 = box.y1 - shrink;
                if (bx1 <= bx0 || by1 <= by0) continue;
                if (sx0 < bx1 && bx0 < sx1 && sy0 < by1 && by0 < sy1) {
                    hits.push({ segment: segment, nodeId: box.id });
                }
            }
        }

        return hits;
    }

    // =========================================================================
    // 11. PATH RENDERING
    // =========================================================================

    /**
     * @brief Joins a net's segments into one SVG path with rounded corners.
     *
     * Consecutive segments share an endpoint, so the path is emitted as a
     * polyline whose corners are replaced by quadratic arcs of the configured
     * radius. A corner is only rounded when both adjoining segments are long
     * enough to give up the radius.
     *
     * @param {Array} points - Ordered path points as { x, y }.
     * @param {number} radius - Corner radius in pixels.
     * @returns {string} An SVG path data string, empty when fewer than 2 points.
     */
    function pathData(points, radius) {
        if (!points || points.length < 2) return '';
        const r = radius === undefined ? DEFAULT_GEOMETRY.cornerRadius : radius;
        if (r <= 0 || points.length === 2) {
            return 'M ' + points.map(p => p.x + ' ' + p.y).join(' L ');
        }

        let d = 'M ' + points[0].x + ' ' + points[0].y;

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const here = points[i];
            const next = points[i + 1];

            const inLen = Math.hypot(here.x - prev.x, here.y - prev.y);
            const outLen = Math.hypot(next.x - here.x, next.y - here.y);
            const cut = Math.min(r, inLen / 2, outLen / 2);

            if (cut < 0.5) {
                d += ' L ' + here.x + ' ' + here.y;
                continue;
            }

            const inX = here.x - (here.x - prev.x) / inLen * cut;
            const inY = here.y - (here.y - prev.y) / inLen * cut;
            const outX = here.x + (next.x - here.x) / outLen * cut;
            const outY = here.y + (next.y - here.y) / outLen * cut;

            d += ' L ' + inX + ' ' + inY;
            d += ' Q ' + here.x + ' ' + here.y + ' ' + outX + ' ' + outY;
        }

        const last = points[points.length - 1];
        d += ' L ' + last.x + ' ' + last.y;
        return d;
    }

    // =========================================================================
    // 12. PUBLIC INTERFACE
    // =========================================================================

    return {
        DEFAULT_GEOMETRY: DEFAULT_GEOMETRY,
        planSection: planSection,
        emitSection: emitSection,
        gapHeightForTracks: gapHeightForTracks,
        pathData: pathData,
        findOverlaps: findOverlaps,
        findNodeCollisions: findNodeCollisions,
        // Exposed for unit tests.
        _internal: {
            buildFreeIntervals: buildFreeIntervals,
            chooseFreeInterval: chooseFreeInterval,
            decomposeNet: decomposeNet,
            assignPorts: assignPorts,
            assignHorizontalTracks: assignHorizontalTracks,
            placeVerticalTracks: placeVerticalTracks,
            separateGapVerticals: separateGapVerticals
        }
    };
}));
