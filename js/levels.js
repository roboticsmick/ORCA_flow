/**
 * ORCA Flow - Layout levels and net decomposition
 *
 * Purpose: Turns the layout tree into a tree of routing levels, and splits
 *          each connection into the pieces that each level has to route.
 *
 * This module is pure. It touches no DOM and no globals, so it runs under node
 * for unit tests and in the browser for rendering.
 *
 * Model
 * -----
 * A level is a box that routes among its direct children. A leaf box is a
 * section, whose children are nodes and whose routing is what planSection()
 * already does. Every other box is a container, whose children are boxes and
 * whose gutter is routed the same way with sections standing in for nodes.
 *
 * Levels are one per container, not two. The layout is a tree of arbitrary
 * depth, so a wire from a node in `sensors` to a node in `ground` under
 * `[USV[sensors][control]][ROV[...]]/[ground]` leaves `sensors`, crosses the
 * gutter inside `USV`, leaves `USV`, then crosses the gutter at the root.
 *
 * Decomposition
 * -------------
 * A net is split against the path between its endpoints in this tree. Let L be
 * the lowest common ancestor of the two endpoint boxes. The net becomes:
 *
 *   - one piece inside each box on the way up from endpoint A to L, carrying
 *     A to a boundary port on that box's edge,
 *   - one piece inside L, between L's two children that contain A and B,
 *   - the mirror of the first group on the B side.
 *
 * A piece's endpoint is either a node, when it is the original endpoint inside
 * its own section, or a box, when the wire enters or leaves through an edge.
 * Boundary ports are allocated later, by the same assignPorts() that fans out
 * a node edge, so two wires leaving one box cannot collide.
 *
 * A section-to-section wire such as `USV <> ROV` is the degenerate case where
 * both endpoints are already boxes at the same level, so it yields one piece
 * and needs no boundary ports at all.
 *
 * Author: ORCA Flow Project
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.OrcaLevels = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // =========================================================================
    // 1. LIMITS
    // =========================================================================

    /** Largest number of layout tree nodes walked when building the levels. */
    const MAX_LAYOUT_NODES = 4096;

    /** Deepest layout nesting a net may be decomposed across. */
    const MAX_LEVEL_DEPTH = 64;

    // =========================================================================
    // 2. LEVEL TREE
    // =========================================================================

    /**
     * @brief Builds the tree of routing levels from a parsed layout tree.
     *
     * Anonymous containers, which the layout parser creates when a `/` splits a
     * row, are kept as levels. They own a real gutter, so they have to route.
     *
     * Walked with an explicit stack rather than by recursion, per P10 rule 1.
     *
     * @pre sectionKeys must hold every key present in nodesData.sections.
     *
     * @param {Object} layoutTree - Parsed layout tree, may be null.
     * @param {Array} sectionKeys - Section keys that carry nodes.
     * Every box keeps a reference to the layout node it came from, which is
     * how the renderer finds a container's level while it walks the layout.
     *
     * @returns {Object} { root, boxes, bySection, byName, byNode } where boxes
     *                   is a map of box id to box, bySection maps a section key
     *                   to its leaf box, byName maps a segment name to its box,
     *                   and byNode is a Map from layout node to box.
     */
    function buildLevelTree(layoutTree, sectionKeys) {
        console.assert(Array.isArray(sectionKeys), 'sectionKeys must be an array');

        const boxes = {};
        const bySection = {};
        const byName = {};
        const byNode = new Map();
        if (!layoutTree) {
            return {
                root: null, boxes: boxes, bySection: bySection,
                byName: byName, byNode: byNode
            };
        }

        const known = new Set(sectionKeys);
        let nextId = 0;

        /**
         * @brief Chooses the section key a leaf segment owns.
         *
         * Mirrors the renderer, which prefers the parent-qualified key and
         * falls back to the bare name.
         *
         * @param {string} name - Segment name.
         * @param {string} parentName - Enclosing segment name, or null.
         * @returns {string|null} The owned section key, or null if none.
         */
        function sectionKeyFor(name, parentName) {
            const qualified = parentName ? parentName + ':' + name : name;
            if (known.has(qualified)) return qualified;
            if (known.has(name)) return name;
            return null;
        }

        const rootBox = {
            id: 'box0',
            name: layoutTree.name || null,
            kind: 'container',
            direction: layoutTree.direction || 'row',
            sectionKey: null,
            parent: null,
            depth: 0,
            node: layoutTree,
            children: []
        };
        nextId = 1;
        boxes[rootBox.id] = rootBox;
        byNode.set(layoutTree, rootBox);
        if (rootBox.name) byName[rootBox.name] = rootBox;

        const stack = [{ node: layoutTree, box: rootBox, parentName: layoutTree.name || null }];
        let guard = 0;

        while (stack.length > 0 && guard < MAX_LAYOUT_NODES) {
            guard++;
            const item = stack.pop();
            const children = item.node.children || [];

            for (const child of children) {
                const hasChildren = child.children && child.children.length > 0;
                const isLeaf = child.type === 'segment' && !hasChildren;

                const box = {
                    id: 'box' + nextId,
                    name: child.name || null,
                    kind: isLeaf ? 'leaf' : 'container',
                    direction: child.direction || 'row',
                    sectionKey: isLeaf ? sectionKeyFor(child.name, item.parentName) : null,
                    parent: item.box,
                    depth: item.box.depth + 1,
                    node: child,
                    children: []
                };
                nextId++;

                boxes[box.id] = box;
                byNode.set(child, box);
                item.box.children.push(box);
                if (box.name && !byName[box.name]) byName[box.name] = box;
                if (box.sectionKey) bySection[box.sectionKey] = box;

                if (!isLeaf) {
                    const childParentName = child.type === 'segment' ? child.name : item.parentName;
                    stack.push({ node: child, box: box, parentName: childParentName });
                }
            }
        }

        console.assert(guard < MAX_LAYOUT_NODES, 'level tree walk hit its bound');
        return {
            root: rootBox, boxes: boxes, bySection: bySection,
            byName: byName, byNode: byNode
        };
    }

    // =========================================================================
    // 3. NET DECOMPOSITION
    // =========================================================================

    /**
     * @brief Lists a box and its ancestors, innermost first.
     * @param {Object} box - Starting box.
     * @returns {Array} Boxes from the given one up to the root.
     */
    function ancestryOf(box) {
        const chain = [];
        let current = box;
        let guard = 0;
        while (current && guard < MAX_LEVEL_DEPTH) {
            guard++;
            chain.push(current);
            current = current.parent;
        }
        console.assert(guard < MAX_LEVEL_DEPTH, 'layout nesting is deeper than MAX_LEVEL_DEPTH');
        return chain;
    }

    /**
     * @brief Resolves one connection endpoint to the box that holds it.
     *
     * @param {Object} endpoint - { kind: 'node'|'section', id, sectionKey }.
     * @param {Object} tree - Output of buildLevelTree().
     * @returns {Object|null} { box, node } where node is null for a box
     *                        endpoint, or null when the endpoint is unplaced.
     */
    function locateEndpoint(endpoint, tree) {
        console.assert(endpoint && endpoint.kind, 'endpoint must carry a kind');

        if (endpoint.kind === 'section') {
            const box = tree.byName[endpoint.id] || tree.bySection[endpoint.id] || null;
            return box ? { box: box, node: null } : null;
        }
        const box = tree.bySection[endpoint.sectionKey] || null;
        return box ? { box: box, node: endpoint.id } : null;
    }

    /**
     * @brief Splits one connection into the pieces each level has to route.
     *
     * The returned pieces are independent nets. Each names the box whose level
     * routes it and the two things it joins there, which are boxes except where
     * a piece touches the original node inside its own section.
     *
     * Returns an empty list when the two endpoints sit in the same leaf box,
     * because that is an ordinary in-section net and planSection already has it.
     *
     * @pre Both endpoints must be placed, which locateEndpoint() reports.
     *
     * @param {Object} from - Source endpoint { kind, id, sectionKey }.
     * @param {Object} to - Target endpoint { kind, id, sectionKey }.
     * @param {Object} tree - Output of buildLevelTree().
     * @returns {Object} { pieces, error } where a piece is
     *                   { levelId, from, to }. An end is { kind, id } with
     *                   kind 'node' for the original node inside its section,
     *                   'box' for a child box at that level, or 'boundary' for
     *                   a port on the level's own outer edge.
     */
    function decomposeNet(from, to, tree) {
        const a = locateEndpoint(from, tree);
        const b = locateEndpoint(to, tree);

        if (!a) return { pieces: [], error: "'" + from.id + "' is not placed by the layout." };
        if (!b) return { pieces: [], error: "'" + to.id + "' is not placed by the layout." };
        if (a.box === b.box && a.node && b.node) return { pieces: [], error: null };
        if (a.box === b.box) {
            return {
                pieces: [],
                error: "'" + from.id + "' and '" + to.id + "' resolve to the same box, "
                    + 'so there is no boundary between them to route across.'
            };
        }

        const upA = ancestryOf(a.box);
        const upB = ancestryOf(b.box);
        const inB = new Set(upB.map(box => box.id));

        let lca = null;
        for (const box of upA) {
            if (inB.has(box.id)) { lca = box; break; }
        }
        console.assert(lca, 'two placed boxes must share the root');
        if (!lca) return { pieces: [], error: 'The layout has no common ancestor for these endpoints.' };

        // WHY: a box joined to something inside itself has no edge between
        // the two to cross. Decomposing it anyway left a piece whose end was
        // the level's own box, which no level could route, so half the wire
        // drew and the other half vanished without a word.
        if ((lca === a.box && !a.node) || (lca === b.box && !b.node)) {
            const outer = lca === a.box && !a.node ? from.id : to.id;
            const inner = outer === from.id ? to.id : from.id;
            return {
                pieces: [],
                error: "'" + outer + "' contains '" + inner + "', so there is no box edge "
                    + 'between them to route across.'
            };
        }

        const pieces = [];

        /**
         * @brief Adds the pieces carrying one endpoint out to the shared level.
         *
         * Walks from the endpoint's own box up to the level below the common
         * ancestor. Each step is a net inside one box, from whatever the wire
         * is at that point to the edge of the box it is leaving.
         *
         * Pieces on the target side point inward, from the boundary to the
         * node, so every piece keeps the connection's own direction and a
         * unidirectional arrow lands on the real target.
         *
         * @param {Object} side - { box, node } from locateEndpoint().
         * @param {Array} chain - That side's ancestry, innermost first.
         * @param {boolean} inward - True on the target side.
         * @returns {Object} The child of the common ancestor on this side.
         */
        function climb(side, chain, inward) {
            let carried = side.node
                ? { kind: 'node', id: side.node }
                : { kind: 'box', id: side.box.id };

            for (const box of chain) {
                if (box === lca) break;
                if (box === side.box && !side.node) continue;

                // Inside this box, carry the wire to the edge it leaves by.
                const edge = { kind: 'boundary', id: box.id };
                pieces.push({
                    levelId: box.id,
                    from: inward ? edge : carried,
                    to: inward ? carried : edge
                });
                carried = { kind: 'box', id: box.id };
            }
            return carried;
        }

        const endA = climb(a, upA, false);
        const endB = climb(b, upB, true);

        pieces.push({ levelId: lca.id, from: endA, to: endB });

        return { pieces: pieces, error: null };
    }

    return {
        buildLevelTree: buildLevelTree,
        decomposeNet: decomposeNet,
        // Exposed for unit tests.
        _internal: {
            ancestryOf: ancestryOf,
            locateEndpoint: locateEndpoint
        }
    };
}));
