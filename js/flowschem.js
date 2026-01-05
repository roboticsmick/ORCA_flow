/**
 * FlowSchem - Schematic Diagram Generator
 * 
 * Purpose: Main application JavaScript for handling UI interactions, parsing
 *          the FlowSchem DSL, and rendering SVG diagrams.
 * 
 * Run: Open index.html in a web browser
 * 
 * Author: FlowSchem Project
 */

// =============================================================================
// 1. APPLICATION STATE
// =============================================================================

const AppState = {
    styleConfig: {},
    layoutTree: null,
    nodes: [],
    connections: [],
    diagramGenerated: false,
    zoom: {
        level: 1,
        minLevel: 0.1,
        maxLevel: 3,
        step: 0.1
    }
};

// =============================================================================
// 2. DOM ELEMENT REFERENCES
// =============================================================================

const Elements = {
    // Input textareas
    styleInput: document.getElementById('style-input'),
    layoutInput: document.getElementById('layout-input'),
    nodesInput: document.getElementById('nodes-input'),
    
    // Buttons
    btnGenerate: document.getElementById('btn-generate'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnExportPng: document.getElementById('btn-export-png'),
    btnExportFlow: document.getElementById('btn-export-flow'),
    btnLoadFlow: document.getElementById('btn-load-flow'),
    fileInput: document.getElementById('file-input'),
    
    // Preview area
    previewPlaceholder: document.getElementById('preview-placeholder'),
    previewCanvas: document.getElementById('preview-canvas'),
    
    // Status bar
    statusMessage: document.getElementById('status-message'),
    statusInfo: document.getElementById('status-info'),
    
    // Modal
    modalOverlay: document.getElementById('modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalClose: document.getElementById('modal-close'),
    modalOk: document.getElementById('modal-ok'),
    
    // Section headers for collapse functionality
    sectionHeaders: document.querySelectorAll('.section-header'),

    // Zoom controls
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomFit: document.getElementById('btn-zoom-fit'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    zoomLevel: document.getElementById('zoom-level'),
    previewContainer: document.querySelector('.preview-container')
};

// =============================================================================
// 3. DEFAULT STYLE CONFIGURATION
// =============================================================================

const DefaultStyle = {
    'section-radius': 8,
    'section-border': 2,
    'node-radius': 6,
    'node-border': 2,
    'line-thickness': 2,
    'font': 'Roboto Mono',
    'font-weight': 500,
    'font-size': 14,
    'hint-font': 'Roboto Mono',
    'hint-weight': 300,
    'hint-size': 11,
    'section-padding': '20 16 20 16',
    'node-padding': '10 14 10 14',
    'flow': 'down',
    'uppercase': true,
    'theme': 'engineering',
    'line-theme': true,
    'page-size': 'A4',
    'page-orientation': 'landscape',
    'page-margin': '10 10 10 10',
    'node-min-width': 120,
    'node-min-height': 60,
    'node-uniform': true
};

// =============================================================================
// 4. COLOUR THEMES
// =============================================================================

const Themes = {
    default: [
        '#3498db', '#e74c3c', '#2ecc71', '#9b59b6', 
        '#f39c12', '#1abc9c', '#e91e63', '#00bcd4'
    ],
    monochrome: [
        '#333333', '#555555', '#777777', '#999999',
        '#444444', '#666666', '#888888', '#aaaaaa'
    ],
    engineering: [
        '#2980b9', '#34495e', '#7f8c8d', '#2c3e50',
        '#3498db', '#95a5a6', '#1a5276', '#566573'
    ],
    warm: [
        '#e74c3c', '#e67e22', '#f1c40f', '#d35400',
        '#c0392b', '#f39c12', '#e74c3c', '#e67e22'
    ],
    cool: [
        '#3498db', '#2ecc71', '#9b59b6', '#1abc9c',
        '#2980b9', '#27ae60', '#8e44ad', '#16a085'
    ],
    'high-contrast': [
        '#ff0000', '#00ff00', '#0000ff', '#ffff00',
        '#ff00ff', '#00ffff', '#ff8800', '#8800ff'
    ]
};

// =============================================================================
// 5. LINE STYLE PATTERNS (for accessibility)
// =============================================================================

const LinePatterns = [
    '',                     // Solid
    '10,5',                 // Dashed (long)
    '5,5',                  // Dashed (short)
    '2,3',                  // Dotted
    '10,3,3,3',             // Dash-dot
    '10,3,3,3,3,3'          // Dash-dot-dot
];

// =============================================================================
// 6. UTILITY FUNCTIONS
// =============================================================================

/**
 * Updates the status bar with a message.
 * 
 * @param {string} message - The status message to display.
 * @param {string} type - Message type: 'info', 'success', or 'error'.
 * @param {string} info - Optional additional info text.
 */
function setStatus(message, type = 'info', info = '') {
    Elements.statusMessage.textContent = message;
    Elements.statusMessage.className = type;
    Elements.statusInfo.textContent = info;
}

/**
 * Shows the modal dialog with a message.
 * 
 * @param {string} title - Modal title.
 * @param {string} message - Modal body message.
 */
function showModal(title, message) {
    Elements.modalTitle.textContent = title;
    Elements.modalMessage.textContent = message;
    Elements.modalOverlay.style.display = 'flex';
}

/**
 * Hides the modal dialog.
 */
function hideModal() {
    Elements.modalOverlay.style.display = 'none';
}

/**
 * Downloads content as a file.
 * 
 * @param {string} content - File content.
 * @param {string} filename - Name of the file.
 * @param {string} mimeType - MIME type of the file.
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// =============================================================================
// 7. PARSER FUNCTIONS
// =============================================================================

/**
 * Parses the style block from input text.
 * 
 * @param {string} input - Raw style input text.
 * @returns {Object} Parsed style configuration.
 */
function parseStyle(input) {
    const config = { ...DefaultStyle };
    
    if (!input || !input.trim()) {
        return config;
    }
    
    const lines = input.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines, comments, and @style header
        if (!trimmed || trimmed.startsWith('#') || trimmed === '@style') {
            continue;
        }
        
        // Parse key: value pairs
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
            const key = trimmed.substring(0, colonIndex).trim();
            let value = trimmed.substring(colonIndex + 1).trim();
            
            // Convert value types
            if (value === 'true') {
                value = true;
            } else if (value === 'false') {
                value = false;
            } else if (!isNaN(value) && value !== '') {
                value = parseFloat(value);
            }
            
            config[key] = value;
        }
    }
    
    return config;
}

/**
 * Parses the layout block from input text.
 * 
 * @param {string} input - Raw layout input text.
 * @returns {Object|null} Parsed layout tree or null if invalid.
 */
function parseLayout(input) {
    if (!input || !input.trim()) {
        return null;
    }
    
    // Extract the layout definition (remove @layout prefix if present)
    let layoutStr = input.trim();
    if (layoutStr.startsWith('@layout')) {
        layoutStr = layoutStr.substring(7).trim();
    }
    
    // Remove any lines that don't start with [ (comments, examples, etc.)
    const lines = layoutStr.split('\n');
    layoutStr = lines.find(line => line.trim().startsWith('[')) || '';
    
    if (!layoutStr) {
        return null;
    }
    
    // Parse the bracket notation into a tree structure
    try {
        return parseLayoutBrackets(layoutStr.trim());
    } catch (e) {
        console.error('Layout parse error:', e);
        return null;
    }
}

/**
 * Recursively parses bracket notation into a tree structure.
 * 
 * @param {string} str - Bracket notation string.
 * @returns {Object} Layout tree node.
 */
function parseLayoutBrackets(str) {
    const result = {
        type: 'container',
        direction: 'row',
        children: []
    };
    
    let i = 0;
    let currentSegments = [];
    
    while (i < str.length) {
        if (str[i] === '[') {
            // Find matching closing bracket
            let depth = 1;
            let j = i + 1;
            while (j < str.length && depth > 0) {
                if (str[j] === '[') depth++;
                if (str[j] === ']') depth--;
                j++;
            }
            
            const content = str.substring(i + 1, j - 1);
            
            // Check if this is a named segment with children
            const firstBracket = content.indexOf('[');
            if (firstBracket > 0) {
                // Named parent with children
                const namepart = content.substring(0, firstBracket);
                const childrenPart = content.substring(firstBracket);
                
                // Parse name and optional colour key
                const [name, colorKey] = parseNameAndColor(namepart);
                
                const childNode = parseLayoutBrackets(childrenPart);
                childNode.name = name;
                childNode.colorKey = colorKey;
                childNode.type = 'segment';
                currentSegments.push(childNode);
            } else if (firstBracket === -1) {
                // Leaf segment (no children)
                const [name, colorKey] = parseNameAndColor(content);
                currentSegments.push({
                    type: 'segment',
                    name: name,
                    colorKey: colorKey,
                    children: []
                });
            } else {
                // Anonymous container
                const childNode = parseLayoutBrackets(content);
                currentSegments.push(childNode);
            }
            
            i = j;
        } else if (str[i] === '/') {
            // Vertical separator - need to wrap current segments and change direction
            if (currentSegments.length > 0) {
                if (currentSegments.length === 1) {
                    result.children.push(currentSegments[0]);
                } else {
                    result.children.push({
                        type: 'container',
                        direction: 'row',
                        children: currentSegments
                    });
                }
                currentSegments = [];
            }
            result.direction = 'column';
            i++;
        } else {
            i++;
        }
    }
    
    // Add remaining segments
    if (currentSegments.length > 0) {
        if (result.direction === 'column' || currentSegments.length > 1) {
            if (currentSegments.length === 1) {
                result.children.push(currentSegments[0]);
            } else {
                result.children.push({
                    type: 'container',
                    direction: 'row',
                    children: currentSegments
                });
            }
        } else {
            result.children = currentSegments;
        }
    }
    
    // Simplify single-child containers
    if (result.children.length === 1 && result.type === 'container') {
        const child = result.children[0];
        if (child.type === 'container') {
            return child;
        }
    }
    
    return result;
}

/**
 * Parses a segment name and optional colour key.
 * 
 * @param {string} str - Name string, possibly with :colorKey suffix.
 * @returns {Array} [name, colorKey] tuple.
 */
function parseNameAndColor(str) {
    const parts = str.split(':');
    const name = parts[0].trim();
    const colorKey = parts.length > 1 ? parts[1].trim() : null;
    return [name, colorKey];
}

/**
 * Parses the nodes block from input text.
 * Supports section-qualified names like "USV:sensors-1" for disambiguation.
 *
 * @param {string} input - Raw nodes input text.
 * @returns {Object} Object containing nodes, connections, and sections.
 */
function parseNodes(input) {
    const result = {
        nodes: [],
        connections: [],
        sections: {},
        nodeMap: {}  // Quick lookup by ID
    };

    if (!input || !input.trim()) {
        return result;
    }

    const lines = input.split('\n');
    let currentSection = null;
    let currentRow = 0;
    let currentParent = null;  // For parent:section-row format

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines, comments, and @nodes header
        if (!trimmed || trimmed.startsWith('#') || trimmed === '@nodes') {
            continue;
        }

        // Check for section-row header with optional parent qualifier
        // Formats: "sensors-1" or "USV:sensors-1"
        const sectionMatch = trimmed.match(/^(?:([a-zA-Z_][a-zA-Z0-9_]*):)?([a-zA-Z_][a-zA-Z0-9_ ]*)-(\d+)$/);
        if (sectionMatch) {
            currentParent = sectionMatch[1] || null;
            currentSection = sectionMatch[2];
            currentRow = parseInt(sectionMatch[3]);

            // Create full section key with parent if specified
            const sectionKey = currentParent ? `${currentParent}:${currentSection}` : currentSection;

            if (!result.sections[sectionKey]) {
                result.sections[sectionKey] = {
                    rows: {},
                    maxRow: 0,
                    parent: currentParent
                };
            }
            if (!result.sections[sectionKey].rows[currentRow]) {
                result.sections[sectionKey].rows[currentRow] = [];
            }
            result.sections[sectionKey].maxRow = Math.max(result.sections[sectionKey].maxRow, currentRow);
            continue;
        }

        // Parse node definitions
        if (currentSection) {
            const sectionKey = currentParent ? `${currentParent}:${currentSection}` : currentSection;
            const parsed = parseNodeLine(trimmed, sectionKey, currentRow);

            if (parsed) {
                // Add or update source node
                if (!result.nodeMap[parsed.sourceId]) {
                    const sourceNode = {
                        id: parsed.sourceId,
                        name: parsed.sourceName,
                        hint: parsed.sourceHint,
                        section: sectionKey,
                        row: currentRow,
                        column: null,  // Calculated later
                        connectionsOut: [],
                        connectionsIn: []
                    };
                    result.nodes.push(sourceNode);
                    result.nodeMap[parsed.sourceId] = sourceNode;
                    result.sections[sectionKey].rows[currentRow].push(parsed.sourceId);
                } else {
                    // Node exists (was a target before) - update section/row if not set
                    const existingNode = result.nodeMap[parsed.sourceId];
                    if (existingNode.section === null) {
                        existingNode.section = sectionKey;
                        existingNode.row = currentRow;
                        result.sections[sectionKey].rows[currentRow].push(parsed.sourceId);
                    }
                    // Update hint if provided
                    if (parsed.sourceHint && !existingNode.hint) {
                        existingNode.hint = parsed.sourceHint;
                    }
                }

                // Add connections and target nodes
                for (const target of parsed.targets) {
                    // For 'from' type (<, <-), swap direction: target connects TO source
                    const isFromType = parsed.connectionType === 'from';
                    const fromId = isFromType ? target.id : parsed.sourceId;
                    const toId = isFromType ? parsed.sourceId : target.id;

                    // Normalize connection type for rendering (both 'to' and 'from' become 'to')
                    const normalizedType = isFromType ? 'to' : parsed.connectionType;

                    // Ensure the target node exists BEFORE creating the connection
                    // (needed because for '<' operator, fromId is the target.id)
                    if (!result.nodeMap[target.id]) {
                        const targetNode = {
                            id: target.id,
                            name: target.name,
                            hint: target.hint,
                            section: null,
                            row: null,
                            column: null,
                            connectionsOut: [],
                            connectionsIn: []
                        };
                        result.nodes.push(targetNode);
                        result.nodeMap[target.id] = targetNode;
                    } else if (target.hint && !result.nodeMap[target.id].hint) {
                        // Update hint if target has one and existing node doesn't
                        result.nodeMap[target.id].hint = target.hint;
                    }

                    const connection = {
                        from: fromId,
                        to: toId,
                        type: normalizedType,
                        dashed: parsed.dashed
                    };
                    result.connections.push(connection);

                    // Track connections on nodes (based on actual direction)
                    result.nodeMap[fromId].connectionsOut.push(connection);

                    // Track incoming connection on the actual destination node
                    result.nodeMap[toId].connectionsIn.push(connection);
                }
            }
        }
    }

    return result;
}

/**
 * Parses a single node definition line.
 *
 * @param {string} line - The line to parse.
 * @param {string} section - Current section name.
 * @param {number} row - Current row number.
 * @returns {Object|null} Parsed node data or null if standalone.
 */
function parseNodeLine(line, section, row) {
    // Connection symbols: > < <> -> <- <->
    const connectionPatterns = [
        { pattern: /<->/, type: 'bidirectional', dashed: true },
        { pattern: /<>/, type: 'bidirectional', dashed: false },
        { pattern: /->/, type: 'to', dashed: true },
        { pattern: /<-/, type: 'from', dashed: true },
        { pattern: />/, type: 'to', dashed: false },
        { pattern: /</, type: 'from', dashed: false }
    ];

    for (const { pattern, type, dashed } of connectionPatterns) {
        const parts = line.split(pattern);
        if (parts.length >= 2) {
            const sourceStr = parts[0].trim();
            const targetStr = parts.slice(1).join('').trim();

            const source = parseNodeName(sourceStr);
            const targets = targetStr.split(',').map(t => parseNodeName(t.trim()));

            // Use section-qualified IDs for consistency (same section for all within a section block)
            return {
                sourceId: generateNodeId(source.name, section),
                sourceName: source.name,
                sourceHint: source.hint,
                targets: targets.map(t => ({
                    id: generateNodeId(t.name, section),
                    name: t.name,
                    hint: t.hint
                })),
                connectionType: type,
                dashed: dashed
            };
        }
    }

    // Standalone node (no connection)
    const node = parseNodeName(line);
    return {
        sourceId: generateNodeId(node.name, section),
        sourceName: node.name,
        sourceHint: node.hint,
        targets: [],
        connectionType: null,
        dashed: false
    };
}

/**
 * Parses a node name with optional hint.
 * 
 * @param {string} str - Node string (e.g., "NodeName/hint text").
 * @returns {Object} { name, hint }.
 */
function parseNodeName(str) {
    const parts = str.split('/');
    return {
        name: parts[0].trim(),
        hint: parts.length > 1 ? parts[1].trim() : null
    };
}

/**
 * Generates a unique node ID.
 * 
 * @param {string} name - Node name.
 * @param {string} section - Optional section context.
 * @returns {string} Generated ID.
 */
function generateNodeId(name, section = '') {
    const baseName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return section ? `${section}_${baseName}` : baseName;
}

// =============================================================================
// 8. NODE LAYOUT CALCULATION
// =============================================================================

/**
 * @brief Calculates node positions within a section.
 *
 * Nodes are positioned in rows with even column spacing using the formula:
 *   column = (2k - 1) / (2n) for k in [1..n]
 *
 * This produces evenly distributed positions:
 *   - 1 node: 0.5 (centered)
 *   - 2 nodes: 0.25, 0.75
 *   - 3 nodes: 0.167, 0.5, 0.833
 *   - 4 nodes: 0.125, 0.375, 0.625, 0.875
 *
 * Exit positions are the vertical corridors between nodes where wires can
 * travel without intersecting nodes. For n nodes, there are n+1 exit positions:
 *   exitPosition(e, n) = e / (n + 1) for e in [0, 1, ..., n]
 *
 * Grid heights between rows are calculated based on the number of
 * routing channels needed (with channel sharing optimization).
 *
 * @pre nodesData must contain sections[sectionKey] with nodes
 * @pre Each section must have at least one node
 *
 * @param {Object} nodesData - Parsed nodes data with sections and nodeMap.
 * @param {string} sectionKey - The section name to calculate layout for.
 * @returns {Object} Layout object with:
 *   - rows: Array of { rowNum, nodes, nodeCount, exitPositions } where each node has column position
 *   - gridHeights: Array of grid heights between adjacent rows
 *   Returns null if section not found or empty.
 */
function calculateSectionLayout(nodesData, sectionKey) {
    const section = nodesData.sections[sectionKey];
    if (!section) return null;

    const layout = {
        rows: [],
        maxColumns: 0,
        gridHeights: []  // Height (in grid units) between each row pair
    };

    // Build row data with nodes
    for (let rowNum = 1; rowNum <= section.maxRow; rowNum++) {
        const nodeIds = section.rows[rowNum] || [];
        const rowNodes = nodeIds.map(id => nodesData.nodeMap[id]).filter(n => n);

        // Calculate column positions: (2k-1)/(2n) for k=1 to n
        const nodeCount = rowNodes.length;
        rowNodes.forEach((node, index) => {
            node.column = nodeCount > 0 ? (2 * (index + 1) - 1) / (2 * nodeCount) : 0.5;

            // Initialize port arrays for each node
            // Ports will be populated during connection routing
            node.ports = {
                top: [],     // Ports on top edge (incoming from above, outgoing upward)
                bottom: []   // Ports on bottom edge (outgoing downward, incoming from same row)
            };
        });

        // Calculate exit positions for this row: e/n for e in [0..n]
        // These are the vertical corridors between/outside nodes for wire routing
        // For n=2 nodes at columns 0.25 and 0.75, exits should be at 0, 0.5, 1.0
        const exitPositions = [];
        for (let e = 0; e <= nodeCount; e++) {
            exitPositions.push(nodeCount > 0 ? e / nodeCount : (e === 0 ? 0 : 1));
        }

        layout.rows.push({
            rowNum,
            nodes: rowNodes,
            nodeCount: rowNodes.length,
            exitPositions: exitPositions
        });

        layout.maxColumns = Math.max(layout.maxColumns, nodeCount);
    }

    // Build set of all node IDs in this section for filtering
    const sectionNodeIds = new Set();
    for (let rowNum = 1; rowNum <= section.maxRow; rowNum++) {
        const nodeIds = section.rows[rowNum] || [];
        nodeIds.forEach(id => sectionNodeIds.add(id));
    }

    // Calculate grid heights between rows
    for (let i = 0; i < layout.rows.length - 1; i++) {
        const rowAbove = layout.rows[i];
        const rowBelow = layout.rows[i + 1];
        const gridHeight = calculateGridHeight(rowAbove, rowBelow, nodesData, sectionNodeIds);
        layout.gridHeights.push(gridHeight);
    }

    return layout;
}

/**
 * @brief Finds the largest exit position less than or equal to target centreline.
 *
 * Used when routing wires to targets on the LEFT of the source node.
 * The wire should use an exit position that doesn't cross over the target.
 *
 * @param {number} targetCentreline - Target node's centreline position (0 to 1).
 * @param {number} rowNodeCount - Number of nodes in the row being traversed.
 * @returns {number} Exit position value (0 to 1).
 */
function getFloorExitPosition(targetCentreline, rowNodeCount) {
    const n = rowNodeCount;
    if (n === 0) return 0;

    // Check exit positions from right to left: n/n=1, (n-1)/n, ..., 0
    for (let e = n; e >= 0; e--) {
        const exitPos = e / n;
        if (exitPos <= targetCentreline) {
            return exitPos;
        }
    }
    return 0;  // Leftmost exit
}

/**
 * @brief Finds the smallest exit position greater than or equal to target centreline.
 *
 * Used when routing wires to targets on the RIGHT of the source node.
 * The wire should use an exit position that doesn't cross over the target.
 *
 * @param {number} targetCentreline - Target node's centreline position (0 to 1).
 * @param {number} rowNodeCount - Number of nodes in the row being traversed.
 * @returns {number} Exit position value (0 to 1).
 */
function getCeilExitPosition(targetCentreline, rowNodeCount) {
    const n = rowNodeCount;
    if (n === 0) return 1;

    // Check exit positions from left to right: 0, 1/n, 2/n, ..., n/n=1
    for (let e = 0; e <= n; e++) {
        const exitPos = e / n;
        if (exitPos >= targetCentreline) {
            return exitPos;
        }
    }
    return 1.0;  // Rightmost exit
}

/**
 * @brief Calculates the effective position for port ordering.
 *
 * For targets in the same row or adjacent row, uses the target's centreline.
 * For targets beyond the adjacent row, calculates the exit position the wire
 * will use when passing through the adjacent row.
 *
 * This ensures ports are ordered by where their wires will actually travel,
 * minimizing wire crossings.
 *
 * @param {Object} source - Source node with row and column properties.
 * @param {Object} target - Target node with row and column properties.
 * @param {Object} sectionLayout - Layout object with rows array containing exitPositions.
 * @returns {number} Effective position for sorting (0 to 1).
 */
function calculateEffectivePosition(source, target, sectionLayout) {
    const rowDiff = Math.abs(target.row - source.row);

    // Same row or adjacent row: use target centreline directly
    if (rowDiff <= 1) {
        return target.column;
    }

    // Multi-row: calculate which exit position the wire will use in the adjacent row
    const goingDown = target.row > source.row;
    const adjacentRowIndex = goingDown ? source.row : source.row - 2;  // 0-indexed

    // Bounds check
    if (adjacentRowIndex < 0 || adjacentRowIndex >= sectionLayout.rows.length) {
        return target.column;  // Fallback to target centreline
    }

    const adjacentRow = sectionLayout.rows[adjacentRowIndex];
    const nodeCount = adjacentRow ? adjacentRow.nodeCount : 1;

    // Choose exit position based on target direction relative to source
    if (target.column <= source.column) {
        // Target is to the LEFT - use floor exit position
        return getFloorExitPosition(target.column, nodeCount);
    } else {
        // Target is to the RIGHT - use ceil exit position
        return getCeilExitPosition(target.column, nodeCount);
    }
}

/**
 * @brief Sorts port entries using the 5-set algorithm for optimal port ordering.
 *
 * The 5-set algorithm minimizes wire crossings by ordering ports from left to right
 * based on their destinations:
 *
 * Set A: Same row, LEFT of source → leftmost ports
 * Set B: Different row, LEFT of source (by effective position)
 * Set C: Aligned with source (same centreline)
 * Set D: Same row, RIGHT of source
 * Set E: Different row, RIGHT of source (by effective position) → rightmost ports
 *
 * Final order: [A, B, C, D, E]
 *
 * @param {Object} sourceNode - The source node with row and column properties.
 * @param {Array} portEntries - Array of port entries with targetCol/sourceCol and target/source refs.
 * @param {Object} sectionLayout - Layout object for effective position calculation.
 * @param {string} direction - 'outgoing' (uses targetCol) or 'incoming' (uses sourceCol).
 * @returns {Array} Sorted port entries in optimal left-to-right order.
 */
function sortPortsUsing5SetAlgorithm(sourceNode, portEntries, sectionLayout, direction) {
    const TOLERANCE = 0.01;
    const sourceCol = sourceNode.column;
    const sourceRow = sourceNode.row;

    // Partition into 5 sets
    const setA = [];  // Same row, left
    const setB = [];  // Different row, left
    const setC = [];  // Aligned
    const setD = [];  // Same row, right
    const setE = [];  // Different row, right

    for (const entry of portEntries) {
        // Get target info based on direction
        let targetCol, targetRow, target;
        if (direction === 'outgoing') {
            targetCol = entry.targetCol;
            target = entry.target;
            targetRow = target ? target.row : sourceRow;
        } else {
            // For incoming, the "target" is actually the source of the connection
            targetCol = entry.sourceCol;
            target = entry.source;
            targetRow = target ? target.row : sourceRow;
        }

        const sameRow = targetRow === sourceRow;
        const rowDist = Math.abs(targetRow - sourceRow);

        // Calculate effective position for multi-row
        let effectivePos = targetCol;
        if (!sameRow && target && sectionLayout) {
            effectivePos = calculateEffectivePosition(sourceNode, target, sectionLayout);
        }

        // Classify into sets
        if (Math.abs(effectivePos - sourceCol) <= TOLERANCE) {
            // Set C: Aligned
            setC.push({ entry, effectivePos, rowDist, sortKey: rowDist });
        } else if (effectivePos < sourceCol) {
            // Left side
            if (sameRow) {
                // Set A: Same row, left
                setA.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            } else {
                // Set B: Different row, left
                setB.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            }
        } else {
            // Right side
            if (sameRow) {
                // Set D: Same row, right
                setD.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            } else {
                // Set E: Different row, right
                setE.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            }
        }
    }

    // Sort each set
    // A: by effective position ascending
    setA.sort((a, b) => a.sortKey - b.sortKey);
    // B: by effective position ascending, then row distance
    setB.sort((a, b) => a.sortKey - b.sortKey || a.rowDist - b.rowDist);
    // C: by row distance ascending (closest first)
    setC.sort((a, b) => a.sortKey - b.sortKey);
    // D: by effective position ascending
    setD.sort((a, b) => a.sortKey - b.sortKey);
    // E: by effective position ascending, then row distance
    setE.sort((a, b) => a.sortKey - b.sortKey || a.rowDist - b.rowDist);

    // Combine in order: [A, B, C, D, E]
    const sorted = [...setA, ...setB, ...setC, ...setD, ...setE];

    // Return just the entries in sorted order
    return sorted.map(item => item.entry);
}

/**
 * @brief Sorts edge port entries using the 5-set algorithm.
 *
 * This is a wrapper around sortPortsUsing5SetAlgorithm that works with
 * the edge port entry format used in calculateRoutes().
 *
 * Port entries have: { routeIndices, otherCol, otherNode, type, isShared }
 *
 * The algorithm classifies ports by where their "other" node is relative
 * to the center node, using the 5-set ordering:
 *   [A, B, C, D, E] = [same-row-left, diff-row-left, aligned, same-row-right, diff-row-right]
 *
 * Shared ports (no otherNode) are sorted by otherCol position only.
 *
 * @param {Object} centerNode - The node whose edge we're sorting.
 * @param {Array} portEntries - Edge port entries with otherCol/otherNode.
 * @param {Object} sectionLayout - Layout data for effective position calculation.
 * @returns {Array} Sorted port entries in left-to-right order.
 */
function sortPortsForEdge(centerNode, portEntries, sectionLayout) {
    const TOLERANCE = 0.01;
    const centerCol = centerNode.column;
    const centerRow = centerNode.row;

    // Partition into 5 sets
    const setA = [];  // Same row, left
    const setB = [];  // Different row, left
    const setC = [];  // Aligned
    const setD = [];  // Same row, right
    const setE = [];  // Different row, right

    for (const entry of portEntries) {
        const otherNode = entry.otherNode;
        const otherCol = entry.otherCol;

        // For shared ports without a specific other node, use column only
        if (!otherNode) {
            // Classify by column position relative to center
            // Check isDifferentRow flag to determine same-row vs different-row sets
            const isDifferentRow = entry.isDifferentRow === true;

            if (Math.abs(otherCol - centerCol) <= TOLERANCE) {
                setC.push({ entry, effectivePos: otherCol, rowDist: 0, sortKey: 0 });
            } else if (otherCol < centerCol) {
                // Left side: Set A (same-row) or Set B (different-row)
                if (isDifferentRow) {
                    setB.push({ entry, effectivePos: otherCol, rowDist: 1, sortKey: otherCol });
                } else {
                    setA.push({ entry, effectivePos: otherCol, rowDist: 0, sortKey: otherCol });
                }
            } else {
                // Right side: Set D (same-row) or Set E (different-row)
                if (isDifferentRow) {
                    setE.push({ entry, effectivePos: otherCol, rowDist: 1, sortKey: otherCol });
                } else {
                    setD.push({ entry, effectivePos: otherCol, rowDist: 0, sortKey: otherCol });
                }
            }
            continue;
        }

        const otherRow = otherNode.row;
        const sameRow = otherRow === centerRow;
        const rowDist = Math.abs(otherRow - centerRow);

        // Calculate effective position for multi-row connections
        let effectivePos = otherCol;
        if (!sameRow && sectionLayout) {
            effectivePos = calculateEffectivePosition(centerNode, otherNode, sectionLayout);
        }

        // Classify into sets
        if (Math.abs(effectivePos - centerCol) <= TOLERANCE) {
            // Set C: Aligned
            setC.push({ entry, effectivePos, rowDist, sortKey: rowDist });
        } else if (effectivePos < centerCol) {
            // Left side
            if (sameRow) {
                setA.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            } else {
                setB.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            }
        } else {
            // Right side
            if (sameRow) {
                setD.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            } else {
                setE.push({ entry, effectivePos, rowDist, sortKey: effectivePos });
            }
        }
    }

    // Sort each set
    setA.sort((a, b) => a.sortKey - b.sortKey);
    setB.sort((a, b) => a.sortKey - b.sortKey || a.rowDist - b.rowDist);
    setC.sort((a, b) => a.sortKey - b.sortKey);
    setD.sort((a, b) => a.sortKey - b.sortKey);
    setE.sort((a, b) => a.sortKey - b.sortKey || a.rowDist - b.rowDist);

    // Combine in order: [A, B, C, D, E]
    const sorted = [...setA, ...setB, ...setC, ...setD, ...setE];

    return sorted.map(item => item.entry);
}

/**
 * @brief Calculates the grid height between two rows based on channel requirements.
 *
 * This function implements the channel calculation algorithm from the routing spec.
 * It considers ALL connections that use the gap between rowAbove and rowBelow:
 *
 * 1. Exit channels: Wires originating from rowAbove
 * 2. Entry channels: Wires terminating at rowBelow
 * 3. Pass-through channels: Wires passing through to lower rows
 *
 * Channel sharing rules:
 * - Outgoing from same source: Each gets separate channel (counted by target)
 * - Incoming to same target: Share ONE channel (junctions merge)
 * - Pass-through wires to same target: Share channel with destination entry
 *
 * Formula:
 *   gridHeight = max(3, uniqueChannels + arrowClearance + buffer)
 *
 * @pre nodesData must contain nodeMap for source/target lookup
 * @pre rowAbove/rowBelow must have rowNum property
 *
 * @param {Object} rowAbove - Row above data with rowNum.
 * @param {Object} rowBelow - Row below data with rowNum.
 * @param {Object} nodesData - Full nodes data with nodeMap.
 * @param {Set|null} sectionNodeIds - Optional set of node IDs to filter. If provided,
 *                                    only connections between nodes in this set are counted.
 * @returns {number} Grid height in units (minimum 3).
 */
function calculateGridHeight(rowAbove, rowBelow, nodesData, sectionNodeIds = null) {
    const ALIGNMENT_TOLERANCE = 0.01;
    const rowAboveNum = rowAbove.rowNum;
    const rowBelowNum = rowBelow.rowNum;
    let hasBidirectional = false;

    // Track unique channels needed
    // Key insight: incoming connections to the same target share a channel
    // So we track by target ID for connections ending in this gap or passing through
    const channelTargets = new Set();

    // Iterate through nodes to find connections using this row gap
    // If sectionNodeIds is provided, only process nodes in that section
    for (const nodeId in nodesData.nodeMap) {
        // Filter to only nodes in the current section
        if (sectionNodeIds && !sectionNodeIds.has(nodeId)) continue;

        const sourceNode = nodesData.nodeMap[nodeId];

        for (const conn of sourceNode.connectionsOut) {
            const targetNode = nodesData.nodeMap[conn.to];
            if (!targetNode) continue;

            // Also ensure target is in the same section
            if (sectionNodeIds && !sectionNodeIds.has(conn.to)) continue;

            const sourceRow = sourceNode.row;
            const targetRow = targetNode.row;

            // Check if this connection uses the gap between rowAbove and rowBelow
            // The gap is used by wires going EITHER direction through it
            let usesThisGap = false;

            if (sourceRow <= rowAboveNum && targetRow >= rowBelowNum) {
                // Downward connection: source at or above rowAbove, target at or below rowBelow
                usesThisGap = true;
            } else if (sourceRow >= rowBelowNum && targetRow <= rowAboveNum) {
                // Upward connection: source at or below rowBelow, target at or above rowAbove
                usesThisGap = true;
            }

            if (usesThisGap) {
                // Check if non-aligned (needs a horizontal routing channel)
                const isNonAligned = Math.abs(sourceNode.column - targetNode.column) > ALIGNMENT_TOLERANCE;

                if (isNonAligned) {
                    // For channel counting, we group by target (incoming share channel)
                    channelTargets.add(conn.to);
                }

                if (conn.type === 'bidirectional') {
                    hasBidirectional = true;
                }
            }
        }
    }

    // Channels needed = number of unique targets with non-aligned connections
    // that use this row gap (either terminating here or passing through)
    const channelsNeeded = channelTargets.size;

    // Arrow clearance: space for arrowheads
    // - If any bidirectional: need clearance at both source and destination ends
    // - For unidirectional: only need clearance at destination (target has arrow)
    const arrowSpaceSource = hasBidirectional ? 1 : 0;
    const arrowSpaceDest = 1;
    const buffer = 1;

    return Math.max(3, channelsNeeded + arrowSpaceSource + arrowSpaceDest + buffer);
}

/**
 * @brief Builds connection routing data for a section.
 *
 * Connection Routing Algorithm:
 * 1. Collect all connections between each pair of adjacent rows
 * 2. Sort connections by target column position (left to right)
 * 3. Assign unique grid channels to each non-aligned connection
 * 4. Vertically aligned connections (source.column ≈ target.column) use straight lines
 * 5. Calculate port offsets for multiple connections from same node
 * 6. Handle both downward AND upward connections (for < operator)
 *
 * Channel Assignment:
 * - Connections to the SAME target share a horizontal channel (for merging)
 * - Connections to DIFFERENT targets get separate channels (no overlap)
 * - Channels are numbered so leftmost targets use higher channels (turn first)
 *
 * Port Spacing Rules:
 * - Outgoing ports (bottom edge): Sorted left-to-right by target column
 * - Incoming ports (top edge): Sorted left-to-right by source column
 * - Bidirectional connections use two separate ports (out and in)
 *
 * Port offset formula for n ports, port index i (0-indexed):
 *   offset = (2i - n + 1) * portSpacing / 2
 *
 * This ordering prevents wire crossings:
 * - Leftmost targets use channels closest to source (highest numbers)
 * - Rightmost targets use channels closest to destination (lowest numbers)
 * - Wires turn at different horizontal positions, avoiding overlaps
 *
 * @pre sectionLayout must contain rows array with nodes having connectionsOut
 * @pre nodesData must contain nodeMap for target node lookup
 *
 * @param {Object} sectionLayout - Layout from calculateSectionLayout with rows.
 * @param {Object} nodesData - Full nodes data with nodeMap.
 * @returns {Array} Array of route objects with: from, to, type, dashed, isStraight,
 *                  gapChannels (object mapping gap key to channel number),
 *                  sourceRow, targetRow, sourcePortOffset, targetPortOffset,
 *                  direction ('down' or 'up').
 */
function buildConnectionRoutes(sectionLayout, nodesData) {
    const routes = [];
    const ALIGNMENT_TOLERANCE = 0.01;  // Tolerance for "vertically aligned" check

    // Track port assignments per node for proper spacing
    // Port count formula: outgoing + bidirectional + min(1, incoming)
    // All incoming connections to a node share ONE port
    //
    // Structure:
    //   outgoing: [{targetCol, routeIndex}] - each gets own port
    //   incoming: [{sourceCol, routeIndex}] - ALL share one port
    //   outgoingTop: [{targetCol, routeIndex}] - each gets own port (upward)
    //   incomingBottom: [{sourceCol, routeIndex}] - ALL share one port (upward into bottom)
    const portAssignments = {};

    // =========================================================================
    // UNIFIED CHANNEL ASSIGNMENT
    //
    // Algorithm:
    // 1. Collect ALL connections from the section (both downward and upward)
    // 2. For each gap, collect all connections that PASS THROUGH it
    //    (including pass-through connections from distant rows)
    // 3. Group by target, sort by target column (rightmost first)
    // 4. Assign channels 1, 2, 3, ... so rightmost targets turn last
    // 5. Create routes with assigned channels
    //
    // This ensures all connections through a gap get unique channels,
    // regardless of which row they originate from or their direction.
    // =========================================================================

    // Step 1: Collect ALL connections from the section
    const allConnections = [];
    for (const row of sectionLayout.rows) {
        for (const node of row.nodes) {
            for (const conn of node.connectionsOut) {
                const target = nodesData.nodeMap[conn.to];
                if (target && target.row !== null && target.row !== node.row) {
                    allConnections.push({
                        source: node,
                        target: target,
                        type: conn.type,
                        dashed: conn.dashed,
                        direction: node.row < target.row ? 'down' : 'up'
                    });
                }
            }
        }
    }

    // Step 2: For each gap, collect all connections passing through
    // A connection passes through gap [rowA, rowB] if:
    //   - Downward: source.row <= rowA AND target.row >= rowB
    //   - Upward: source.row >= rowB AND target.row <= rowA
    const gapConnections = {};  // key: "rowA-rowB", value: array of connections

    for (let i = 0; i < sectionLayout.rows.length - 1; i++) {
        const rowAboveNum = sectionLayout.rows[i].rowNum;
        const rowBelowNum = sectionLayout.rows[i + 1].rowNum;
        const gapKey = `${rowAboveNum}-${rowBelowNum}`;
        gapConnections[gapKey] = [];

        for (const conn of allConnections) {
            const sourceRow = conn.source.row;
            const targetRow = conn.target.row;

            // Check if connection passes through this gap
            const passesDown = sourceRow <= rowAboveNum && targetRow >= rowBelowNum;
            const passesUp = sourceRow >= rowBelowNum && targetRow <= rowAboveNum;

            if (passesDown || passesUp) {
                // Check if non-aligned (needs a channel)
                const isAligned = Math.abs(conn.source.column - conn.target.column) <= ALIGNMENT_TOLERANCE;
                if (!isAligned) {
                    gapConnections[gapKey].push(conn);
                }
            }
        }
    }

    // Step 3: Assign channels PER-GAP
    // Each gap gets its own channel numbering (1, 2, 3, ...)
    // A connection may have different channel numbers in different gaps
    //
    // For each gap:
    // - Group connections by target
    // - Sort targets by column (rightmost first = channel 1)
    // - Assign channels within that gap
    //
    // Store: connectionGapChannels.get(conn) = { "1-2": 1, "2-3": 3, ... }
    const connectionGapChannels = new Map();  // conn -> { gapKey: channel, ... }

    for (const gapKey in gapConnections) {
        const connsInGap = gapConnections[gapKey];

        // Group connections in this gap by target
        const gapTargetGroups = {};  // target.id -> { target, connections: [] }
        for (const conn of connsInGap) {
            if (!gapTargetGroups[conn.target.id]) {
                gapTargetGroups[conn.target.id] = {
                    target: conn.target,
                    connections: []
                };
            }
            gapTargetGroups[conn.target.id].connections.push(conn);
        }

        // Sort target groups by target column (rightmost first = channel 1)
        // Secondary sort by target row (lower row = closer = turns first)
        const sortedGapGroups = Object.values(gapTargetGroups)
            .sort((a, b) => {
                if (b.target.column !== a.target.column) {
                    return b.target.column - a.target.column;  // Rightmost first
                }
                return a.target.row - b.target.row;  // For ties, closer rows first
            });

        // Assign channels for this gap: rightmost target = channel 1
        sortedGapGroups.forEach((group, index) => {
            const channel = index + 1;
            for (const conn of group.connections) {
                if (!connectionGapChannels.has(conn)) {
                    connectionGapChannels.set(conn, {});
                }
                connectionGapChannels.get(conn)[gapKey] = channel;
            }
        });
    }

    // Step 4: Create routes and track port assignments
    // Process downward connections first, then upward
    for (const conn of allConnections) {
        const isAligned = Math.abs(conn.source.column - conn.target.column) <= ALIGNMENT_TOLERANCE;
        const routeIndex = routes.length;
        const isUpward = conn.direction === 'up';

        // Initialize port assignments for source node
        if (!portAssignments[conn.source.id]) {
            portAssignments[conn.source.id] = {
                outgoing: [],           // Unidirectional outgoing (down) - each own port
                incoming: [],           // Unidirectional incoming (down) - ALL share one port
                bidirectionalOut: [],   // Bidirectional (as source, down) - each own port
                bidirectionalIn: [],    // Bidirectional (as target, down) - each own port
                outgoingTop: [],        // Upward outgoing - each own port
                incomingBottom: [],     // Upward incoming - ALL share one port
                bidirectionalOutTop: [],  // Upward bidirectional (as source) - each own port
                bidirectionalInBottom: [] // Upward bidirectional (as target) - each own port
            };
        }

        // Initialize port assignments for target node
        if (!portAssignments[conn.target.id]) {
            portAssignments[conn.target.id] = {
                outgoing: [], incoming: [], bidirectionalOut: [], bidirectionalIn: [],
                outgoingTop: [], incomingBottom: [], bidirectionalOutTop: [], bidirectionalInBottom: []
            };
        }

        // Track port assignments based on direction and type
        if (isUpward) {
            // Upward connection: source exits from TOP, target receives at BOTTOM
            if (conn.type === 'bidirectional') {
                portAssignments[conn.source.id].bidirectionalOutTop.push({
                    targetCol: conn.target.column,
                    target: conn.target,
                    source: conn.source,
                    routeIndex: routeIndex
                });
                portAssignments[conn.target.id].bidirectionalInBottom.push({
                    sourceCol: conn.source.column,
                    source: conn.source,
                    target: conn.target,
                    routeIndex: routeIndex
                });
            } else {
                portAssignments[conn.source.id].outgoingTop.push({
                    targetCol: conn.target.column,
                    target: conn.target,
                    source: conn.source,
                    routeIndex: routeIndex
                });
                portAssignments[conn.target.id].incomingBottom.push({
                    sourceCol: conn.source.column,
                    source: conn.source,
                    target: conn.target,
                    routeIndex: routeIndex
                });
            }
        } else {
            // Downward connection: source exits from BOTTOM, target receives at TOP
            if (conn.type === 'bidirectional') {
                portAssignments[conn.source.id].bidirectionalOut.push({
                    targetCol: conn.target.column,
                    target: conn.target,
                    source: conn.source,
                    routeIndex: routeIndex
                });
                portAssignments[conn.target.id].bidirectionalIn.push({
                    sourceCol: conn.source.column,
                    source: conn.source,
                    target: conn.target,
                    routeIndex: routeIndex
                });
            } else {
                portAssignments[conn.source.id].outgoing.push({
                    targetCol: conn.target.column,
                    target: conn.target,
                    source: conn.source,
                    routeIndex: routeIndex
                });
                portAssignments[conn.target.id].incoming.push({
                    sourceCol: conn.source.column,
                    source: conn.source,
                    target: conn.target,
                    routeIndex: routeIndex
                });
            }
        }

        // Create the route
        // gapChannels maps gap key to channel number for that gap
        // e.g., { "1-2": 1, "2-3": 3 } for a connection spanning multiple gaps
        routes.push({
            from: conn.source,
            to: conn.target,
            type: conn.type,
            dashed: conn.dashed,
            isStraight: isAligned,
            gapChannels: isAligned ? {} : (connectionGapChannels.get(conn) || {}),
            sourceRow: conn.source.row,
            targetRow: conn.target.row,
            sharedSourceId: conn.source.id,
            direction: conn.direction
        });
    }

    // =========================================================================
    // Calculate port offsets for each route based on port ordering
    //
    // Port count formula per edge:
    //   ports = outgoing_count + bidirectional_count + min(1, incoming_count)
    //
    // Key rules:
    // - Each outgoing connection gets its OWN port
    // - Each bidirectional connection gets its OWN port (on both source and target)
    // - ALL unidirectional incoming connections share ONE port (merge with junction dots)
    //
    // Bottom edge: outgoing + bidirectionalOut + bidirectionalInBottom + incomingBottom(shared)
    // Top edge: incoming(shared) + bidirectionalIn + bidirectionalOutTop + outgoingTop
    // =========================================================================
    const portSpacing = 12;  // Pixels between ports

    for (const nodeId in portAssignments) {
        const ports = portAssignments[nodeId];

        // =====================================================================
        // BOTTOM EDGE: Ports leaving or entering from below
        // - outgoing (down): each own port
        // - bidirectionalOut (down): each own port (source side of bidirectional)
        // - bidirectionalInBottom (up): each own port (target side of upward bidirectional)
        // - incomingBottom (up): ALL share one port (unidirectional incoming from below)
        //
        // Uses 5-set algorithm for optimal port ordering to minimize wire crossings
        // =====================================================================

        // Find the center node (the node whose ports we're calculating)
        let centerNode = null;
        if (ports.outgoing.length > 0) centerNode = ports.outgoing[0].source;
        else if (ports.bidirectionalOut.length > 0) centerNode = ports.bidirectionalOut[0].source;
        else if (ports.bidirectionalInBottom.length > 0) centerNode = ports.bidirectionalInBottom[0].target;
        else if (ports.incomingBottom.length > 0) centerNode = ports.incomingBottom[0].target;
        else if (ports.incoming.length > 0) centerNode = ports.incoming[0].target;
        else if (ports.bidirectionalIn.length > 0) centerNode = ports.bidirectionalIn[0].target;
        else if (ports.bidirectionalOutTop.length > 0) centerNode = ports.bidirectionalOutTop[0].source;
        else if (ports.outgoingTop.length > 0) centerNode = ports.outgoingTop[0].source;

        const bottomEdgePorts = [];

        // Add outgoing ports (going down) - each gets own port
        // "Other" node is the target
        for (const port of ports.outgoing) {
            bottomEdgePorts.push({
                routeIndices: [port.routeIndex],
                otherCol: port.targetCol,
                otherNode: port.target,
                type: 'sourcePortOffset',
                isShared: false
            });
        }

        // Add bidirectional outgoing (going down) - each gets own port
        for (const port of ports.bidirectionalOut) {
            bottomEdgePorts.push({
                routeIndices: [port.routeIndex],
                otherCol: port.targetCol,
                otherNode: port.target,
                type: 'sourcePortOffset',
                isShared: false
            });
        }

        // Add bidirectional incoming bottom (coming up) - each gets own port
        // "Other" node is the source
        for (const port of ports.bidirectionalInBottom) {
            bottomEdgePorts.push({
                routeIndices: [port.routeIndex],
                otherCol: port.sourceCol,
                otherNode: port.source,
                type: 'targetPortOffset',
                isShared: false
            });
        }

        // Add unidirectional incoming bottom ports (coming up) - ALL share ONE port
        if (ports.incomingBottom.length > 0) {
            const routeIndices = ports.incomingBottom.map(p => p.routeIndex);
            const avgSourceCol = ports.incomingBottom.reduce((sum, p) => sum + p.sourceCol, 0)
                / ports.incomingBottom.length;

            bottomEdgePorts.push({
                routeIndices: routeIndices,
                otherCol: avgSourceCol,
                otherNode: null,  // Shared port - no single "other" node
                type: 'targetPortOffset',
                isShared: true,
                isDifferentRow: true  // Incoming from below = different row
            });
        }

        // Sort bottom edge ports using 5-set algorithm if we have the center node
        if (centerNode && bottomEdgePorts.length > 1) {
            const sortedPorts = sortPortsForEdge(centerNode, bottomEdgePorts, sectionLayout);
            bottomEdgePorts.length = 0;
            bottomEdgePorts.push(...sortedPorts);
        } else {
            // Fallback to simple column sort
            bottomEdgePorts.sort((a, b) => a.otherCol - b.otherCol);
        }

        // Calculate offsets for all bottom edge ports
        const bottomCount = bottomEdgePorts.length;
        bottomEdgePorts.forEach((port, i) => {
            const offset = bottomCount > 1 ? (2 * i - bottomCount + 1) * portSpacing / 2 : 0;
            for (const routeIndex of port.routeIndices) {
                routes[routeIndex][port.type] = offset;
            }
        });

        // =====================================================================
        // TOP EDGE: Ports leaving or entering from above
        // - incoming (down): ALL share one port (unidirectional incoming from above)
        // - bidirectionalIn (down): each own port (target side of downward bidirectional)
        // - bidirectionalOutTop (up): each own port (source side of upward bidirectional)
        // - outgoingTop (up): each own port
        //
        // Uses 5-set algorithm for optimal port ordering to minimize wire crossings
        // =====================================================================
        const topEdgePorts = [];

        // Add unidirectional incoming ports (coming down) - ALL share ONE port
        if (ports.incoming.length > 0) {
            const routeIndices = ports.incoming.map(p => p.routeIndex);
            const avgSourceCol = ports.incoming.reduce((sum, p) => sum + p.sourceCol, 0)
                / ports.incoming.length;

            topEdgePorts.push({
                routeIndices: routeIndices,
                otherCol: avgSourceCol,
                otherNode: null,  // Shared port - no single "other" node
                type: 'targetPortOffset',
                isShared: true,
                isDifferentRow: true  // Incoming from above = different row
            });
        }

        // Add bidirectional incoming (coming down) - each gets own port
        // "Other" node is the source
        for (const port of ports.bidirectionalIn) {
            topEdgePorts.push({
                routeIndices: [port.routeIndex],
                otherCol: port.sourceCol,
                otherNode: port.source,
                type: 'targetPortOffset',
                isShared: false
            });
        }

        // Add bidirectional outgoing top (going up) - each gets own port
        // "Other" node is the target
        for (const port of ports.bidirectionalOutTop) {
            topEdgePorts.push({
                routeIndices: [port.routeIndex],
                otherCol: port.targetCol,
                otherNode: port.target,
                type: 'sourcePortOffset',
                isShared: false
            });
        }

        // Add outgoing top ports (going up) - each gets own port
        for (const port of ports.outgoingTop) {
            topEdgePorts.push({
                routeIndices: [port.routeIndex],
                otherCol: port.targetCol,
                otherNode: port.target,
                type: 'sourcePortOffset',
                isShared: false
            });
        }

        // Sort top edge ports using 5-set algorithm if we have the center node
        if (centerNode && topEdgePorts.length > 1) {
            const sortedPorts = sortPortsForEdge(centerNode, topEdgePorts, sectionLayout);
            topEdgePorts.length = 0;
            topEdgePorts.push(...sortedPorts);
        } else {
            // Fallback to simple column sort
            topEdgePorts.sort((a, b) => a.otherCol - b.otherCol);
        }

        // Calculate offsets for all top edge ports
        const topCount = topEdgePorts.length;
        topEdgePorts.forEach((port, i) => {
            const offset = topCount > 1 ? (2 * i - topCount + 1) * portSpacing / 2 : 0;
            // Apply offset to all routes using this port
            for (const routeIndex of port.routeIndices) {
                routes[routeIndex][port.type] = offset;
            }
        });
    }

    return routes;
}

/**
 * @brief Renders nodes within a section as SVG elements.
 *
 * Node height is calculated based on text content (heading + optional hint),
 * not based on available section space. This produces compact diagrams.
 *
 * Node placement uses the column positioning formula:
 *   column = (2k - 1) / (2n) for k in [1..n]
 *
 * Vertical spacing between rows accounts for:
 *   - Grid routing channels (for wire paths)
 *   - Minimum row spacing (20px)
 *   - Spacing is only added BETWEEN rows, not after the last row
 *
 * Each rendered node stores its pixel position for connection routing:
 *   node.pixelX, node.pixelY, node.pixelWidth, node.pixelHeight
 *
 * @pre sectionLayout must contain rows array with nodes and gridHeights array
 * @pre bounds.y must already account for section label offset (set in renderLayoutNode)
 * @pre style must contain font-size, hint-size, node-padding, node-min-width, node-radius
 *
 * @param {Object} sectionLayout - Layout data from calculateSectionLayout with rows and gridHeights.
 * @param {Object} bounds - Section bounds { x, y, width, height } where y is after label.
 * @param {Object} style - Style configuration with sizing and font parameters.
 * @param {string} color - Section color for node borders.
 * @returns {string} SVG markup for all nodes in the section.
 */
function renderNodesInSection(sectionLayout, bounds, style, color) {
    if (!sectionLayout || sectionLayout.rows.length === 0) return '';

    let svg = '';
    const nodePadding = parsePaddingValues(style['node-padding']);
    const nodeMinWidth = style['node-min-width'] || 120;

    // Calculate node height based on text content, not section space
    // Height = top padding + heading line + (hint line if any nodes have hints) + bottom padding
    const fontSize = style['font-size'] || 14;
    const hintSize = style['hint-size'] || 11;
    const lineSpacing = 6;  // Space between heading and hint

    // Check if any node in the section has a hint
    const hasAnyHints = sectionLayout.rows.some(row =>
        row.nodes.some(node => node.hint)
    );

    // Calculate node height: padding + heading + optional hint
    const textHeight = hasAnyHints
        ? fontSize + lineSpacing + hintSize  // heading + spacing + hint
        : fontSize;                           // heading only
    const nodeHeight = nodePadding.top + textHeight + nodePadding.bottom;

    // Calculate vertical spacing for grid routing
    const channelSpacing = 15;  // Must match renderConnectionsInSection
    const rowSpacing = 20;  // Minimum space between node rows for routing

    // Start at bounds.y (which already accounts for section label in renderLayoutNode)
    let currentY = bounds.y;

    for (let rowIndex = 0; rowIndex < sectionLayout.rows.length; rowIndex++) {
        const row = sectionLayout.rows[rowIndex];

        // Render nodes in this row
        for (const node of row.nodes) {
            const nodeWidth = nodeMinWidth;
            const nodeX = bounds.x + (node.column * bounds.width) - (nodeWidth / 2);
            const nodeY = currentY;

            // Draw node box
            svg += `<rect x="${nodeX}" y="${nodeY}" width="${nodeWidth}" height="${nodeHeight}"
                rx="${style['node-radius']}" ry="${style['node-radius']}"
                fill="#ffffff" stroke="${color}" stroke-width="${style['node-border']}"/>`;

            // Draw node name (centered)
            const textX = nodeX + nodeWidth / 2;
            const nameY = nodeY + (node.hint ? nodeHeight / 2 - 5 : nodeHeight / 2 + 5);
            const displayName = style.uppercase ? node.name.toUpperCase() : node.name;

            svg += `<text x="${textX}" y="${nameY}" class="node-text">${displayName}</text>`;

            // Draw hint if present
            if (node.hint) {
                const hintY = nodeY + nodeHeight / 2 + 12;
                svg += `<text x="${textX}" y="${hintY}" class="hint-text">${node.hint}</text>`;
            }

            // Store pixel position on node for connection routing
            node.pixelX = nodeX + nodeWidth / 2;
            node.pixelY = nodeY;
            node.pixelWidth = nodeWidth;
            node.pixelHeight = nodeHeight;
        }

        // Add spacing only BETWEEN rows (not after the last row)
        const isLastRow = rowIndex === sectionLayout.rows.length - 1;
        if (!isLastRow) {
            // Add grid spacing for next row based on routing channels needed
            if (rowIndex < sectionLayout.gridHeights.length) {
                // Grid height is in units (channels needed), multiply by channel spacing
                const gridSpace = sectionLayout.gridHeights[rowIndex] * channelSpacing;
                currentY += nodeHeight + Math.max(rowSpacing, gridSpace);
            } else {
                currentY += nodeHeight + rowSpacing;
            }
        }
    }

    return svg;
}

/**
 * @brief Converts an exit position (0-1 range) to pixel X coordinate.
 *
 * Exit positions are the vertical corridors between nodes where wires
 * can travel without intersecting nodes.
 *
 * @param {number} exitPos - Exit position as fraction (0 to 1).
 * @param {Object} bounds - Section bounds { x, width }.
 * @returns {number} Pixel X coordinate within section.
 */
function exitPositionToPixelX(exitPos, bounds) {
    return bounds.x + (exitPos * bounds.width);
}

/**
 * @brief Selects the exit position for routing through an intermediate row.
 *
 * Chooses an exit position BETWEEN the source and target columns to minimize
 * the total wire path length. The exit position should be:
 * - Within the range [min(source, target), max(source, target)]
 * - As close to the target as possible (to minimize final horizontal segment)
 *
 * If no exit positions are in range, picks the closest one to the target.
 *
 * @param {Object} source - Source node with column property.
 * @param {Object} target - Target node with column property.
 * @param {Object} rowData - Row data with exitPositions array.
 * @returns {number} Selected exit position (0 to 1).
 */
function selectExitPositionForRow(source, target, rowData) {
    const exitPositions = rowData.exitPositions || [];
    if (exitPositions.length === 0) return target.column;

    const sourceCol = source.column;
    const targetCol = target.column;
    const minCol = Math.min(sourceCol, targetCol);
    const maxCol = Math.max(sourceCol, targetCol);

    // Find exit positions between source and target
    const validExits = exitPositions.filter(e => e >= minCol && e <= maxCol);

    if (validExits.length > 0) {
        // Pick the one closest to target
        return validExits.reduce((closest, e) =>
            Math.abs(e - targetCol) < Math.abs(closest - targetCol) ? e : closest
        );
    }

    // No exits in range - pick the closest to target overall
    return exitPositions.reduce((closest, e) =>
        Math.abs(e - targetCol) < Math.abs(closest - targetCol) ? e : closest
    );
}

/**
 * @brief Checks if a column position falls in a clear corridor (between nodes).
 *
 * A clear corridor exists between adjacent nodes, before the first node,
 * or after the last node. If the target column is in a clear corridor,
 * the wire can route directly to that column without detouring to an
 * exit position.
 *
 * @param {number} col - The column position to check (0 to 1).
 * @param {Object} rowData - Row data with nodes array.
 * @param {number} margin - Minimum distance from node edges (default 0.02).
 * @returns {boolean} True if column is in a clear corridor, false if blocked.
 */
function isColumnInClearCorridor(col, rowData, margin = 0.02) {
    const nodes = rowData.nodes || [];
    if (nodes.length === 0) return true;  // No nodes = entire row is clear

    // Get sorted node columns
    const nodeColumns = nodes.map(n => n.column).sort((a, b) => a - b);

    // Check if column is before first node (with margin)
    if (col < nodeColumns[0] - margin) return true;

    // Check if column is after last node (with margin)
    if (col > nodeColumns[nodeColumns.length - 1] + margin) return true;

    // Check if column is between any two adjacent nodes
    for (let i = 0; i < nodeColumns.length - 1; i++) {
        const leftNode = nodeColumns[i];
        const rightNode = nodeColumns[i + 1];
        // Column must be sufficiently away from both node edges
        if (col > leftNode + margin && col < rightNode - margin) {
            return true;
        }
    }

    return false;  // Column is on top of or too close to a node
}

/**
 * @brief Selects optimal X position for vertical routing through an intermediate row.
 *
 * Prioritizes keeping the wire straight (vertical) as long as possible:
 * 1. If SOURCE column is in a clear corridor → use it (wire goes straight, turns later)
 * 2. Else if TARGET column is in a clear corridor → use it (wire turns early)
 * 3. Else → use nearest exit position
 *
 * This creates more direct-looking wire paths by minimizing early horizontal movement.
 *
 * @param {Object} source - Source node with column property.
 * @param {Object} target - Target node with column property.
 * @param {Object} rowData - Row data with nodes array and exitPositions.
 * @returns {number} Optimal column position for vertical routing (0 to 1).
 */
function selectOptimalRoutingColumn(source, target, rowData) {
    // Priority 1: If source column is clear, wire can go straight through
    // This minimizes early horizontal movement for a more direct path
    if (isColumnInClearCorridor(source.column, rowData)) {
        return source.column;
    }

    // Priority 2: If target column is clear, turn early to target lane
    if (isColumnInClearCorridor(target.column, rowData)) {
        return target.column;
    }

    // Priority 3: Use nearest exit position between source and target
    return selectExitPositionForRow(source, target, rowData);
}

/**
 * @brief Renders connections within a section as SVG paths.
 *
 * Renders orthogonal wire paths with the following structure:
 * - Straight lines: Direct vertical connection (no corners)
 * - Routed lines (down): Down → Horizontal → Down (two corners)
 * - Routed lines (up): Up → Horizontal → Up (two corners)
 *
 * Channel spacing ensures wires don't overlap:
 * - Channels are assigned PER-GAP (each gap has its own 1, 2, 3, ... numbering)
 * - Higher channel numbers are closer to source (turn first)
 * - Lower channel numbers are closer to destination (turn later)
 * - Channel Y position: sourceY + (gapChannel * channelSpacing) for down
 * - Channel Y position: sourceY - (gapChannel * channelSpacing) for up
 *
 * Port offsets ensure multiple connections from same node don't overlap:
 * - sourcePortOffset: Horizontal offset from node center for outgoing port
 * - targetPortOffset: Horizontal offset from node center for incoming port
 *
 * Wire merging rules:
 * - Outgoing: Each connection from a source gets its own separate wire.
 *   Wires split naturally without junction dots for a clean appearance.
 * - Incoming: Multiple wires to the same target share a horizontal channel.
 *   Each wire drops vertically to the channel, with junction dots at each
 *   source's X position. One wire drops from the channel to the target with
 *   a single arrow entering the node.
 *
 * Arrow placement:
 * - Arrows are rendered OUTSIDE nodes, pointing IN (tip at node edge, body outside)
 * - For downward connections: arrow points DOWN into the top of the target node
 * - For upward connections: arrow points UP into the bottom of the target node
 * - Bidirectional connections have arrows at both ends
 *
 * Junction dots (circles) are only placed at incoming merge points where
 * multiple wires converge before entering a single target node.
 *
 * @pre routes must be from buildConnectionRoutes with valid from/to nodes
 * @pre Each route.from and route.to must have pixelX, pixelY, pixelHeight set
 * @pre style must contain line-thickness
 *
 * @param {Array} routes - Connection routes from buildConnectionRoutes.
 * @param {Object} style - Style configuration with line-thickness.
 * @param {string} color - Connection color for paths, arrows, and junctions.
 * @param {Object} sectionLayout - Section layout with rows and exit positions (optional).
 * @param {Object} bounds - Section bounds { x, y, width, height } (optional).
 * @returns {string} SVG markup for paths, arrows, and junction dots.
 */
function renderConnectionsInSection(routes, style, color, sectionLayout = null, bounds = null) {
    let svg = '';
    const lineThickness = style['line-thickness'] || 2;
    const arrowSize = 8;
    const channelSpacing = 15;  // Pixels between horizontal routing channels
    const junctionRadius = 4;   // Radius of junction dots
    const mergeOffset = arrowSize + 6;  // Distance above target for merge junction

    // Separate routes by direction for proper merge handling
    const downwardRoutes = routes.filter(r => r.direction !== 'up');
    const upwardRoutes = routes.filter(r => r.direction === 'up');

    // Group DOWNWARD routes by target for incoming wire merging
    const routesByTargetDown = {};
    for (let i = 0; i < downwardRoutes.length; i++) {
        const route = downwardRoutes[i];
        const targetId = route.to.id;
        if (!routesByTargetDown[targetId]) {
            routesByTargetDown[targetId] = [];
        }
        routesByTargetDown[targetId].push({ route, index: i });
    }

    // Track which targets have multiple incoming downward wires
    const mergeTargetsDown = new Set();
    for (const targetId in routesByTargetDown) {
        if (routesByTargetDown[targetId].length > 1) {
            mergeTargetsDown.add(targetId);
        }
    }

    // Group UPWARD routes by target for incoming wire merging
    const routesByTargetUp = {};
    for (let i = 0; i < upwardRoutes.length; i++) {
        const route = upwardRoutes[i];
        const targetId = route.to.id;
        if (!routesByTargetUp[targetId]) {
            routesByTargetUp[targetId] = [];
        }
        routesByTargetUp[targetId].push({ route, index: i });
    }

    // Track which targets have multiple incoming upward wires
    const mergeTargetsUp = new Set();
    for (const targetId in routesByTargetUp) {
        if (routesByTargetUp[targetId].length > 1) {
            mergeTargetsUp.add(targetId);
        }
    }

    // =========================================================================
    // Render DOWNWARD connections with smart routing to avoid nodes
    // =========================================================================
    const mergeDataDown = {};  // targetId -> { channelY, sourceXPositions[], targetX }

    // Collect all node bounds for obstacle detection
    const allNodeBounds = routes.map(r => ({
        minX: r.from.pixelX - r.from.pixelWidth / 2,
        maxX: r.from.pixelX + r.from.pixelWidth / 2,
        minY: r.from.pixelY,
        maxY: r.from.pixelY + r.from.pixelHeight,
        row: r.from.row
    })).concat(routes.map(r => ({
        minX: r.to.pixelX - r.to.pixelWidth / 2,
        maxX: r.to.pixelX + r.to.pixelWidth / 2,
        minY: r.to.pixelY,
        maxY: r.to.pixelY + r.to.pixelHeight,
        row: r.to.row
    })));

    // Helper: Get the gap channel for a route's first gap
    // For downward routes: gap is sourceRow to sourceRow+1
    // For upward routes: gap is (sourceRow-1) to sourceRow
    function getGapChannel(route, direction) {
        if (route.isStraight || !route.gapChannels) return 0;

        let gapKey;
        if (direction === 'down') {
            // Downward: first gap is from source row to source row + 1
            gapKey = `${route.from.row}-${route.from.row + 1}`;
        } else {
            // Upward: first gap is from (source row - 1) to source row
            gapKey = `${route.from.row - 1}-${route.from.row}`;
        }

        return route.gapChannels[gapKey] || 1;
    }

    // =========================================================================
    // Lane Assignment Pre-pass
    // When multiple routes pass through the same exit position (vertical corridor),
    // assign horizontal lane offsets to prevent overlapping wires.
    // =========================================================================
    const laneSpacing = 8;  // Pixels between lanes at shared exit positions
    const routeLaneOffsets = new Map();  // route -> lane offset in pixels

    if (sectionLayout && bounds) {
        // Calculate exit positions for all multi-row routes
        const exitPositionGroups = {};  // "exitPos-rowNum" -> [routes]

        for (const route of routes) {
            const source = route.from;
            const target = route.to;
            const isDownward = route.direction !== 'up';
            const rowSpan = isDownward ? (target.row - source.row) : (source.row - target.row);

            // Only multi-row routes need exit position routing
            if (rowSpan <= 1) continue;
            if (route.isStraight && Math.abs(source.column - target.column) < 0.01) continue;

            // Find the adjacent row (intermediate row)
            const adjacentRowNum = isDownward ? (source.row + 1) : (source.row - 1);
            const adjacentRow = sectionLayout.rows.find(r => r.rowNum === adjacentRowNum);

            if (!adjacentRow) continue;

            // Calculate the exit position this route will use
            const exitPos = selectOptimalRoutingColumn(source, target, adjacentRow);

            // Group by exit position and row (rounded to avoid float precision issues)
            const groupKey = `${Math.round(exitPos * 1000)}-${adjacentRowNum}`;

            if (!exitPositionGroups[groupKey]) {
                exitPositionGroups[groupKey] = [];
            }
            exitPositionGroups[groupKey].push(route);
        }

        // Assign lane offsets to routes sharing the same exit position
        for (const groupKey in exitPositionGroups) {
            const groupRoutes = exitPositionGroups[groupKey];
            if (groupRoutes.length <= 1) continue;  // No conflict

            // Sort routes by target column for consistent ordering
            groupRoutes.sort((a, b) => a.to.column - b.to.column);

            // Center the lanes around the exit position
            const numRoutes = groupRoutes.length;
            const totalWidth = (numRoutes - 1) * laneSpacing;
            const startOffset = -totalWidth / 2;

            groupRoutes.forEach((route, idx) => {
                routeLaneOffsets.set(route, startOffset + idx * laneSpacing);
            });
        }
    }

    for (const route of downwardRoutes) {
        const source = route.from;
        const target = route.to;

        if (!source.pixelX || !target.pixelX) continue;

        const sourcePortOffset = route.sourcePortOffset || 0;
        const sourceX = source.pixelX + sourcePortOffset;
        const sourceY = source.pixelY + source.pixelHeight;  // Bottom of source
        const targetX = target.pixelX;

        const hasMergeJunction = mergeTargetsDown.has(target.id);
        const dashArray = route.dashed ? '5,5' : 'none';

        // Check if this connection spans multiple rows (skips intermediate rows)
        const rowSpan = target.row - source.row;
        const needsSmartRouting = rowSpan > 1;

        if (hasMergeJunction) {
            const gapChannel = getGapChannel(route, 'down');
            const channelY = sourceY + (gapChannel * channelSpacing);

            if (!mergeDataDown[target.id]) {
                mergeDataDown[target.id] = {
                    channelY: channelY,
                    sourceXPositions: [],
                    targetX: targetX,
                    target: target
                };
            }

            mergeDataDown[target.id].sourceXPositions.push(sourceX);

            svg += `<path d="M ${sourceX} ${sourceY} L ${sourceX} ${channelY}"
                fill="none" stroke="${color}" stroke-width="${lineThickness}" stroke-dasharray="${dashArray}"/>`;

        } else {
            const targetPortOffset = route.targetPortOffset || 0;
            const finalTargetX = target.pixelX + targetPortOffset;
            const targetY = target.pixelY;  // Top of target

            let pathD;

            if (route.isStraight) {
                // For straight lines spanning multiple rows, use exit positions
                if (needsSmartRouting && sectionLayout && bounds) {
                    // Use exit positions for principled routing through intermediate rows
                    // Find the adjacent row to get exit position
                    const adjacentRowNum = source.row + 1;
                    const adjacentRow = sectionLayout.rows.find(r => r.rowNum === adjacentRowNum);

                    if (adjacentRow) {
                        // Select optimal routing column (target column if clear, else exit position)
                        const exitPos = selectOptimalRoutingColumn(source, target, adjacentRow);
                        const laneOffset = routeLaneOffsets.get(route) || 0;
                        const exitX = exitPositionToPixelX(exitPos, bounds) + laneOffset;

                        // Route: source -> down to channel -> horizontal to exit -> down to target area -> horizontal to target -> down
                        const channelY1 = sourceY + channelSpacing;
                        const channelY2 = targetY - channelSpacing;

                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${channelY1}`;
                        pathD += ` L ${exitX} ${channelY1}`;
                        pathD += ` L ${exitX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    } else {
                        // Fallback: simple vertical/horizontal path
                        const midY = (sourceY + targetY) / 2;
                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${midY}`;
                        pathD += ` L ${finalTargetX} ${midY}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    }
                } else if (needsSmartRouting) {
                    // Legacy obstacle-based routing (fallback when layout not available)
                    const minRouteX = Math.min(sourceX, finalTargetX) - 5;
                    const maxRouteX = Math.max(sourceX, finalTargetX) + 5;

                    const obstacles = allNodeBounds.filter(nb =>
                        nb.row > source.row && nb.row < target.row &&
                        nb.minX < maxRouteX && nb.maxX > minRouteX
                    );

                    if (obstacles.length > 0) {
                        const obstacleMaxX = Math.max(...obstacles.map(o => o.maxX));
                        const obstacleMinX = Math.min(...obstacles.map(o => o.minX));
                        const goRight = sourceX >= (obstacleMinX + obstacleMaxX) / 2;
                        const safeX = goRight
                            ? obstacleMaxX + channelSpacing
                            : obstacleMinX - channelSpacing;

                        const channelY1 = sourceY + channelSpacing;
                        const channelY2 = targetY - channelSpacing;

                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${channelY1}`;
                        pathD += ` L ${safeX} ${channelY1}`;
                        pathD += ` L ${safeX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    } else {
                        if (Math.abs(sourceX - finalTargetX) < 1) {
                            pathD = `M ${sourceX} ${sourceY} L ${finalTargetX} ${targetY}`;
                        } else {
                            const midY = (sourceY + targetY) / 2;
                            pathD = `M ${sourceX} ${sourceY}`;
                            pathD += ` L ${sourceX} ${midY}`;
                            pathD += ` L ${finalTargetX} ${midY}`;
                            pathD += ` L ${finalTargetX} ${targetY}`;
                        }
                    }
                } else {
                    if (Math.abs(sourceX - finalTargetX) < 1) {
                        pathD = `M ${sourceX} ${sourceY} L ${finalTargetX} ${targetY}`;
                    } else {
                        const midY = (sourceY + targetY) / 2;
                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${midY}`;
                        pathD += ` L ${finalTargetX} ${midY}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    }
                }
            } else {
                // Non-aligned connection with routing channel
                const gapChannel = getGapChannel(route, 'down');
                if (needsSmartRouting && sectionLayout && bounds) {
                    // Use exit positions for principled routing
                    const channelY = sourceY + (gapChannel * channelSpacing);
                    const adjacentRowNum = source.row + 1;
                    const adjacentRow = sectionLayout.rows.find(r => r.rowNum === adjacentRowNum);

                    if (adjacentRow) {
                        // Select optimal routing column (target column if clear, else exit position)
                        const exitPos = selectOptimalRoutingColumn(source, target, adjacentRow);
                        const laneOffset = routeLaneOffsets.get(route) || 0;
                        const exitX = exitPositionToPixelX(exitPos, bounds) + laneOffset;
                        const channelY2 = targetY - channelSpacing;

                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${channelY}`;
                        pathD += ` L ${exitX} ${channelY}`;
                        pathD += ` L ${exitX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    } else {
                        // Fallback if row not found
                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${channelY}`;
                        pathD += ` L ${finalTargetX} ${channelY}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    }
                } else if (needsSmartRouting) {
                    // Legacy obstacle-based routing
                    const channelY = sourceY + (gapChannel * channelSpacing);
                    const minRouteX = Math.min(sourceX, finalTargetX) - 5;
                    const maxRouteX = Math.max(sourceX, finalTargetX) + 5;

                    const obstacles = allNodeBounds.filter(nb =>
                        nb.row > source.row && nb.row < target.row &&
                        nb.minY < channelY && nb.maxY > channelY &&
                        nb.minX < maxRouteX && nb.maxX > minRouteX
                    );

                    if (obstacles.length > 0) {
                        const obstacleMaxX = Math.max(...obstacles.map(o => o.maxX));
                        const obstacleMinX = Math.min(...obstacles.map(o => o.minX));
                        const goRight = sourceX >= (obstacleMinX + obstacleMaxX) / 2;
                        const safeX = goRight
                            ? obstacleMaxX + channelSpacing
                            : obstacleMinX - channelSpacing;
                        const channelY2 = targetY - channelSpacing;

                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${channelY}`;
                        pathD += ` L ${safeX} ${channelY}`;
                        pathD += ` L ${safeX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${channelY2}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    } else {
                        pathD = `M ${sourceX} ${sourceY}`;
                        pathD += ` L ${sourceX} ${channelY}`;
                        pathD += ` L ${finalTargetX} ${channelY}`;
                        pathD += ` L ${finalTargetX} ${targetY}`;
                    }
                } else {
                    const channelY = sourceY + (gapChannel * channelSpacing);
                    pathD = `M ${sourceX} ${sourceY}`;
                    pathD += ` L ${sourceX} ${channelY}`;
                    pathD += ` L ${finalTargetX} ${channelY}`;
                    pathD += ` L ${finalTargetX} ${targetY}`;
                }
            }

            svg += `<path d="${pathD}" fill="none" stroke="${color}"
                stroke-width="${lineThickness}" stroke-dasharray="${dashArray}"/>`;

            // Arrow pointing down into top of target
            svg += renderArrow(finalTargetX, targetY, 'down', color, arrowSize);
        }

        // Bidirectional: arrow at source pointing up into bottom
        if (route.type === 'bidirectional') {
            svg += renderArrow(sourceX, sourceY, 'up', color, arrowSize);
        }
    }

    // Render merge junctions for downward connections
    // Junction dot rule: n-1 dots for n wires merging, exclude the drop point
    for (const targetId in mergeDataDown) {
        const data = mergeDataDown[targetId];
        const { channelY, sourceXPositions, targetX, target } = data;

        const allXPositions = [...sourceXPositions, targetX];
        const minX = Math.min(...allXPositions);
        const maxX = Math.max(...allXPositions);

        // Draw the horizontal merge channel
        svg += `<path d="M ${minX} ${channelY} L ${maxX} ${channelY}"
            fill="none" stroke="${color}" stroke-width="${lineThickness}"/>`;

        // Place junction dots at n-1 positions (exclude the drop point at targetX)
        // Sort positions to find which ones need dots
        const sortedPositions = [...sourceXPositions].sort((a, b) => a - b);
        const junctionTolerance = 2;  // Pixels tolerance for "same position"

        for (const srcX of sortedPositions) {
            // Only place dot if this position is NOT the drop point (targetX)
            if (Math.abs(srcX - targetX) > junctionTolerance) {
                svg += `<circle cx="${srcX}" cy="${channelY}" r="${junctionRadius}" fill="${color}"/>`;
            }
        }

        // Draw vertical drop from channel to target
        svg += `<path d="M ${targetX} ${channelY} L ${targetX} ${target.pixelY}"
            fill="none" stroke="${color}" stroke-width="${lineThickness}"/>`;

        svg += renderArrow(targetX, target.pixelY, 'down', color, arrowSize);
    }

    // =========================================================================
    // Render UPWARD connections with INTERIOR GRID ROUTING
    //
    // Strategy: Route upward connections through the interior grid, similar to
    // downward connections but in reverse direction. This keeps all wires within
    // the section bounds and uses the same channel system.
    //
    // Path: source TOP → up to channel → horizontal → channel near target → target BOTTOM
    // =========================================================================
    const mergeDataUp = {};  // targetId -> { channelY, sourceXPositions[], targetX, targetY }

    for (const route of upwardRoutes) {
        const source = route.from;
        const target = route.to;

        if (!source.pixelX || !target.pixelX) continue;

        const sourcePortOffset = route.sourcePortOffset || 0;
        const sourceX = source.pixelX + sourcePortOffset;
        const sourceY = source.pixelY;  // Top of source (going up)

        const hasMergeJunction = mergeTargetsUp.has(target.id);
        const dashArray = route.dashed ? '5,5' : 'none';

        // Calculate target Y (bottom of target node for upward entry)
        const finalTargetY = target.pixelY + target.pixelHeight;

        // Grid channel Y should use SAME reference as downward connections
        // For Gap X-Y, both directions use: bottom_of_row_X + channel * channelSpacing
        // This ensures upward channel 2 and downward channel 2 are at SAME Y position
        const gapChannel = getGapChannel(route, 'up');

        // Find the row above source to get its bottom Y (the gap's top edge)
        const adjacentRowNum = source.row - 1;
        const adjacentRow = sectionLayout ? sectionLayout.rows.find(r => r.rowNum === adjacentRowNum) : null;
        let gapTopY = sourceY - channelSpacing;  // Fallback: estimate based on source
        if (adjacentRow && adjacentRow.nodes.length > 0) {
            // Use the bottom of the row above as the gap's top edge
            gapTopY = Math.max(...adjacentRow.nodes.map(n => n.pixelY + n.pixelHeight));
        }
        const channelY = gapTopY + (gapChannel * channelSpacing);

        // Channel Y just below target (for final approach)
        const targetChannelY = finalTargetY + channelSpacing;

        if (hasMergeJunction) {
            const targetPortOffset = route.targetPortOffset || 0;
            const finalTargetX = target.pixelX + targetPortOffset;

            // Calculate exit position for vertical routing (only for multi-row)
            let exitX = finalTargetX;
            const rowDistance = source.row - target.row;
            if (rowDistance > 1 && sectionLayout && bounds) {
                const adjacentRowNum = source.row - 1;
                const adjacentRow = sectionLayout.rows.find(r => r.rowNum === adjacentRowNum);
                if (adjacentRow && adjacentRowNum > target.row) {
                    const exitPos = selectOptimalRoutingColumn(source, target, adjacentRow);
                    const laneOffset = routeLaneOffsets.get(route) || 0;
                    exitX = exitPositionToPixelX(exitPos, bounds) + laneOffset;
                }
            }

            if (!mergeDataUp[target.id]) {
                mergeDataUp[target.id] = {
                    exitX: exitX,
                    sourceXPositions: [],
                    sourceChannelYs: [],
                    targetX: finalTargetX,
                    target: target,
                    targetY: finalTargetY,
                    targetChannelY: targetChannelY
                };
            }

            mergeDataUp[target.id].sourceXPositions.push(sourceX);
            mergeDataUp[target.id].sourceChannelYs.push(channelY);

            // Draw: source → up to channel → horizontal toward exit position
            svg += `<path d="M ${sourceX} ${sourceY} L ${sourceX} ${channelY} L ${exitX} ${channelY}"
                fill="none" stroke="${color}" stroke-width="${lineThickness}" stroke-dasharray="${dashArray}"/>`;

        } else {
            const targetPortOffset = route.targetPortOffset || 0;
            const finalTargetX = target.pixelX + targetPortOffset;

            // Check if source and target are vertically aligned
            if (Math.abs(sourceX - finalTargetX) < 1) {
                // Straight vertical line
                const pathD = `M ${sourceX} ${sourceY} L ${finalTargetX} ${finalTargetY}`;
                svg += `<path d="${pathD}" fill="none" stroke="${color}"
                    stroke-width="${lineThickness}" stroke-dasharray="${dashArray}"/>`;
            } else {
                // Interior grid routing: source → channel → exit position → target channel → target
                let pathD = `M ${sourceX} ${sourceY}`;
                pathD += ` L ${sourceX} ${channelY}`;  // Up to source channel

                // Check if there's an intermediate row between source and target
                // For adjacent rows (source.row - target.row == 1), route directly
                const rowDistance = source.row - target.row;

                if (rowDistance > 1 && sectionLayout && bounds) {
                    // Multi-row: use optimal routing column (direct if clear, else exit position)
                    const adjacentRowNum = source.row - 1;
                    const adjacentRow = sectionLayout.rows.find(r => r.rowNum === adjacentRowNum);
                    if (adjacentRow && adjacentRowNum > target.row) {
                        const exitPos = selectOptimalRoutingColumn(source, target, adjacentRow);
                        const laneOffset = routeLaneOffsets.get(route) || 0;
                        const exitX = exitPositionToPixelX(exitPos, bounds) + laneOffset;
                        pathD += ` L ${exitX} ${channelY}`;        // Horizontal to exit position
                        pathD += ` L ${exitX} ${targetChannelY}`;  // Vertical up through grid
                        pathD += ` L ${finalTargetX} ${targetChannelY}`;  // Horizontal to target
                        pathD += ` L ${finalTargetX} ${finalTargetY}`;    // Up to target
                    } else {
                        // Fallback: direct routing
                        pathD += ` L ${finalTargetX} ${channelY}`;
                        pathD += ` L ${finalTargetX} ${finalTargetY}`;
                    }
                } else {
                    // Adjacent rows or no layout: simple L-shape routing
                    pathD += ` L ${finalTargetX} ${channelY}`;
                    pathD += ` L ${finalTargetX} ${finalTargetY}`;
                }

                svg += `<path d="${pathD}" fill="none" stroke="${color}"
                    stroke-width="${lineThickness}" stroke-dasharray="${dashArray}"/>`;
            }

            // Arrow pointing UP into bottom of target
            svg += renderArrow(finalTargetX, finalTargetY, 'up', color, arrowSize);
        }

        // Bidirectional: arrow at source pointing down into top
        if (route.type === 'bidirectional') {
            svg += renderArrow(sourceX, sourceY, 'down', color, arrowSize);
        }
    }

    // Render merge junctions for upward connections (interior grid routing)
    // Junction dot rule: n-1 dots for n wires merging
    for (const targetId in mergeDataUp) {
        const data = mergeDataUp[targetId];
        const { exitX, sourceXPositions, sourceChannelYs, targetX, target, targetY, targetChannelY } = data;

        // The merge point is at the exit position (or target X if no exit position)
        const mergeX = exitX || targetX;

        // Find the min and max channel Y for vertical routing
        const minChannelY = Math.min(...sourceChannelYs);

        // Vertical segment connecting all source channels to target channel
        if (sourceChannelYs.length > 0) {
            svg += `<path d="M ${mergeX} ${minChannelY} L ${mergeX} ${targetChannelY}"
                fill="none" stroke="${color}" stroke-width="${lineThickness}"/>`;
        }

        // Place n-1 junction dots on the vertical bus
        // Sort channel Y positions and exclude the one closest to targetChannelY (the "drop point")
        const sortedChannelYs = [...sourceChannelYs].sort((a, b) => a - b);
        const junctionTolerance = 2;  // Pixels tolerance

        // Find which source channel Y is closest to targetChannelY (this is the drop point)
        let dropPointY = null;
        let minDist = Infinity;
        for (const srcChannelY of sortedChannelYs) {
            const dist = Math.abs(srcChannelY - targetChannelY);
            if (dist < minDist) {
                minDist = dist;
                dropPointY = srcChannelY;
            }
        }

        // Place dots at all positions except the drop point
        for (const srcChannelY of sortedChannelYs) {
            if (dropPointY === null || Math.abs(srcChannelY - dropPointY) > junctionTolerance) {
                svg += `<circle cx="${mergeX}" cy="${srcChannelY}" r="${junctionRadius}" fill="${color}"/>`;
            }
        }

        // Horizontal from merge point to target (if not aligned)
        if (Math.abs(mergeX - targetX) > 1) {
            svg += `<path d="M ${mergeX} ${targetChannelY} L ${targetX} ${targetChannelY}"
                fill="none" stroke="${color}" stroke-width="${lineThickness}"/>`;
        }

        // Final vertical to target bottom
        svg += `<path d="M ${targetX} ${targetChannelY} L ${targetX} ${targetY}"
            fill="none" stroke="${color}" stroke-width="${lineThickness}"/>`;

        // Arrow pointing up into bottom of target
        svg += renderArrow(targetX, targetY, 'up', color, arrowSize);
    }

    return svg;
}

/**
 * Renders an arrowhead.
 *
 * @param {number} x - Arrow tip X position.
 * @param {number} y - Arrow tip Y position.
 * @param {string} direction - 'up', 'down', 'left', 'right'.
 * @param {string} color - Arrow color.
 * @param {number} size - Arrow size.
 * @returns {string} SVG polygon for arrow.
 */
function renderArrow(x, y, direction, color, size) {
    const half = size / 2;
    let points;

    switch (direction) {
        case 'up':
            points = `${x},${y} ${x - half},${y + size} ${x + half},${y + size}`;
            break;
        case 'down':
            points = `${x},${y} ${x - half},${y - size} ${x + half},${y - size}`;
            break;
        case 'left':
            points = `${x},${y} ${x + size},${y - half} ${x + size},${y + half}`;
            break;
        case 'right':
            points = `${x},${y} ${x - size},${y - half} ${x - size},${y + half}`;
            break;
        default:
            return '';
    }

    return `<polygon points="${points}" fill="${color}"/>`;
}

/**
 * Parses padding string into numeric values (without mm conversion).
 *
 * @param {string} paddingStr - Padding string "top right bottom left".
 * @returns {Object} { top, right, bottom, left }.
 */
function parsePaddingValues(paddingStr) {
    const parts = String(paddingStr).split(' ').map(Number);

    if (parts.length === 1) {
        return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    } else if (parts.length === 2) {
        return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    } else if (parts.length === 4) {
        return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    }

    return { top: 10, right: 14, bottom: 10, left: 14 };
}

// =============================================================================
// 10. RENDERER FUNCTIONS
// =============================================================================

/**
 * Renders the diagram to SVG.
 *
 * The diagram is sized to fit its content, not a fixed page size.
 * This produces compact diagrams suitable for documents and articles.
 *
 * @param {Object} style - Style configuration.
 * @param {Object} layout - Layout tree.
 * @param {Object} nodesData - Parsed nodes and connections.
 * @returns {string} SVG markup string.
 */
function renderDiagram(style, layout, nodesData) {
    const margin = parsePadding(style['page-margin']);

    // Calculate content-based dimensions instead of fixed page size
    let contentSize = { width: 400, height: 300 };  // Default fallback
    if (layout) {
        contentSize = calculateNodeContentSize(layout, nodesData, style);
    }

    // Add margins to content size
    const width = contentSize.width;
    const height = contentSize.height;
    const totalWidth = width + margin.left + margin.right;
    const totalHeight = height + margin.top + margin.bottom;

    // Get theme colours
    const themeColors = Themes[style.theme] || Themes.default;
    let colorIndex = 0;

    // Build SVG with content-based dimensions
    let svg = `<svg xmlns="http://www.w3.org/2000/svg"
        width="${totalWidth}"
        height="${totalHeight}"
        viewBox="0 0 ${totalWidth} ${totalHeight}"
        style="background-color: transparent;">`;

    // Add defs for patterns, gradients, etc.
    svg += `<defs>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=${style.font.replace(' ', '+')}:wght@100;200;300;400;500;600;700;800;900&display=swap');
            .node-text {
                font-family: '${style.font}', sans-serif;
                font-weight: ${style['font-weight']};
                font-size: ${style['font-size']}px;
                fill: #333333;
                text-anchor: middle;
                dominant-baseline: middle;
            }
            .hint-text {
                font-family: '${style['hint-font']}', sans-serif;
                font-weight: ${style['hint-weight']};
                font-size: ${style['hint-size']}px;
                fill: #666666;
                text-anchor: middle;
                dominant-baseline: middle;
            }
            .section-label {
                font-family: '${style.font}', sans-serif;
                font-weight: ${style['font-weight']};
                font-size: ${style['font-size'] + 2}px;
                text-anchor: middle;
            }
        </style>
    </defs>`;

    // Render layout segments (this assigns pixelX/pixelY to all nodes)
    if (layout) {
        svg += renderLayoutNode(layout, margin.left, margin.top, width, height, style, themeColors, colorIndex, nodesData);

        // After all sections are rendered, render cross-section connections
        svg += renderCrossSectionConnections(nodesData, style, themeColors);
    } else {
        // No layout defined - render a placeholder message
        svg += `<text x="${totalWidth/2}" y="${totalHeight/2}"
            text-anchor="middle" class="section-label" fill="#999999">
            Define a layout to see segments
        </text>`;
    }

    // Render placeholder nodes if no nodes defined
    if (nodesData.nodes.length === 0) {
        svg += `<text x="${totalWidth/2}" y="${totalHeight/2 + 30}"
            text-anchor="middle" class="hint-text" fill="#999999">
            Add nodes to see the diagram
        </text>`;
    }

    svg += '</svg>';

    return svg;
}

/**
 * @brief Renders connections between nodes in different sections.
 *
 * Cross-section connections are identified by comparing the section property
 * of source and target nodes. These connections are rendered after all sections
 * have been positioned so that pixel coordinates are available.
 *
 * Routing strategy for cross-section connections:
 * 1. Exit from the source node's bottom (or top for upward)
 * 2. Route horizontally/vertically to avoid overlapping with section boxes
 * 3. Enter the target node's top (or bottom for upward)
 *
 * The routing uses a simple approach:
 * - Vertical exit from source
 * - Horizontal segment at a safe Y position (between sections)
 * - Vertical entry to target
 *
 * @param {Object} nodesData - Parsed nodes data with connections and nodeMap.
 * @param {Object} style - Style configuration.
 * @param {Array} themeColors - Theme color palette.
 * @returns {string} SVG markup for cross-section connection paths.
 */
function renderCrossSectionConnections(nodesData, style, themeColors) {
    let svg = '';
    const lineThickness = style['line-thickness'] || 2;
    const arrowSize = 8;
    const channelSpacing = 15;
    const portSpacing = 12;
    const junctionRadius = 4;

    // Find cross-section connections
    const crossSectionConns = [];
    for (const conn of nodesData.connections) {
        const source = nodesData.nodeMap[conn.from];
        const target = nodesData.nodeMap[conn.to];

        if (!source || !target) continue;
        if (!source.pixelX || !target.pixelX) continue;

        // Check if source and target are in different sections
        const sourceSection = source.section ? source.section.split(':').pop() : null;
        const targetSection = target.section ? target.section.split(':').pop() : null;

        if (sourceSection && targetSection && sourceSection !== targetSection) {
            crossSectionConns.push({
                source,
                target,
                type: conn.type,
                dashed: conn.dashed,
                connId: `${conn.from}-${conn.to}`
            });
        }
    }

    if (crossSectionConns.length === 0) return svg;

    // =========================================================================
    // Channel calculation: group by target (incoming share channel)
    // =========================================================================
    const targetGroups = {};
    for (const conn of crossSectionConns) {
        const targetId = conn.target.id;
        if (!targetGroups[targetId]) {
            targetGroups[targetId] = [];
        }
        targetGroups[targetId].push(conn);
    }

    // Assign channel numbers: one per unique target
    const channelAssignments = new Map();
    let channelNum = 1;
    for (const targetId in targetGroups) {
        for (const conn of targetGroups[targetId]) {
            channelAssignments.set(conn.connId, channelNum);
        }
        channelNum++;
    }

    // =========================================================================
    // Port assignment: calculate source port offsets for nodes with multiple
    // outgoing cross-section connections, and target port for shared incoming
    // =========================================================================
    const sourcePortCounts = {};
    const targetPortCounts = {};

    for (const conn of crossSectionConns) {
        const sourceId = conn.source.id;
        const targetId = conn.target.id;

        if (!sourcePortCounts[sourceId]) sourcePortCounts[sourceId] = [];
        sourcePortCounts[sourceId].push(conn);

        if (!targetPortCounts[targetId]) targetPortCounts[targetId] = [];
        targetPortCounts[targetId].push(conn);
    }

    // Calculate port offsets for sources (each outgoing gets own port)
    const sourcePortOffsets = new Map();
    for (const sourceId in sourcePortCounts) {
        const conns = sourcePortCounts[sourceId];
        // Sort by target X for left-to-right ordering
        conns.sort((a, b) => a.target.pixelX - b.target.pixelX);
        const count = conns.length;
        conns.forEach((conn, i) => {
            const offset = count > 1 ? (2 * i - count + 1) * portSpacing / 2 : 0;
            sourcePortOffsets.set(conn.connId, offset);
        });
    }

    // Calculate port offsets for targets (shared by target)
    const targetPortOffsets = new Map();
    for (const targetId in targetPortCounts) {
        const conns = targetPortCounts[targetId];
        // All incoming to same target share one port (offset 0)
        conns.forEach(conn => {
            targetPortOffsets.set(conn.connId, 0);
        });
    }

    // =========================================================================
    // Sort connections for rendering order
    // =========================================================================
    crossSectionConns.sort((a, b) => {
        const aY = Math.min(a.source.pixelY, a.target.pixelY);
        const bY = Math.min(b.source.pixelY, b.target.pixelY);
        return aY - bY;
    });

    // Track merge data for junction dots
    const mergeData = {};  // targetId -> { channelY, sourceXPositions[], targetX }

    // =========================================================================
    // Render each cross-section connection
    // =========================================================================
    for (const conn of crossSectionConns) {
        const source = conn.source;
        const target = conn.target;
        const channel = channelAssignments.get(conn.connId);

        const goingDown = source.pixelY < target.pixelY;

        const sectionIndex = Object.keys(nodesData.sections).indexOf(source.section);
        const color = themeColors[sectionIndex % themeColors.length] || themeColors[0];
        const dashArray = conn.dashed ? '5,5' : 'none';

        const sourcePortOffset = sourcePortOffsets.get(conn.connId) || 0;
        const sourceX = source.pixelX + sourcePortOffset;
        const targetX = target.pixelX;

        let sourceY, targetY, channelY;

        if (goingDown) {
            sourceY = source.pixelY + source.pixelHeight;
            targetY = target.pixelY;
            // Channel Y is midpoint plus channel offset
            channelY = (sourceY + targetY) / 2 + (channel * channelSpacing / 2);
        } else {
            sourceY = source.pixelY;
            targetY = target.pixelY + target.pixelHeight;
            channelY = (sourceY + targetY) / 2 - (channel * channelSpacing / 2);
        }

        // Check if this target has multiple incoming
        const hasMultipleIncoming = (targetPortCounts[target.id] || []).length > 1;

        if (hasMultipleIncoming) {
            // Render only source to channel, collect for merge rendering
            svg += `<path d="M ${sourceX} ${sourceY} L ${sourceX} ${channelY}"
                fill="none" stroke="${color}" stroke-width="${lineThickness}" stroke-dasharray="${dashArray}"/>`;

            if (!mergeData[target.id]) {
                mergeData[target.id] = {
                    channelY,
                    sourceXPositions: [],
                    targetX,
                    targetY,
                    goingDown,
                    color,
                    type: conn.type
                };
            }
            mergeData[target.id].sourceXPositions.push(sourceX);
        } else {
            // Single connection - render full path
            let pathD = `M ${sourceX} ${sourceY}`;
            pathD += ` L ${sourceX} ${channelY}`;
            pathD += ` L ${targetX} ${channelY}`;
            pathD += ` L ${targetX} ${targetY}`;

            svg += `<path d="${pathD}" fill="none" stroke="${color}"
                stroke-width="${lineThickness}" stroke-dasharray="${dashArray}"/>`;

            const arrowDir = goingDown ? 'down' : 'up';
            svg += renderArrow(targetX, targetY, arrowDir, color, arrowSize);
        }

        // Bidirectional: arrow at source
        if (conn.type === 'bidirectional') {
            const sourceArrowDir = goingDown ? 'up' : 'down';
            svg += renderArrow(sourceX, sourceY, sourceArrowDir, color, arrowSize);
        }
    }

    // =========================================================================
    // Render merge junctions with proper n-1 dot placement
    // =========================================================================
    for (const targetId in mergeData) {
        const data = mergeData[targetId];
        const { channelY, sourceXPositions, targetX, targetY, goingDown, color, type } = data;

        const allXPositions = [...sourceXPositions, targetX];
        const minX = Math.min(...allXPositions);
        const maxX = Math.max(...allXPositions);

        // Draw horizontal merge channel
        svg += `<path d="M ${minX} ${channelY} L ${maxX} ${channelY}"
            fill="none" stroke="${color}" stroke-width="${lineThickness}"/>`;

        // Draw vertical drop to target
        svg += `<path d="M ${targetX} ${channelY} L ${targetX} ${targetY}"
            fill="none" stroke="${color}" stroke-width="${lineThickness}"/>`;

        // Junction dots: n-1 dots, exclude drop point (targetX)
        const junctionTolerance = 2;
        const sortedPositions = [...sourceXPositions].sort((a, b) => a - b);
        for (const srcX of sortedPositions) {
            if (Math.abs(srcX - targetX) > junctionTolerance) {
                svg += `<circle cx="${srcX}" cy="${channelY}" r="${junctionRadius}" fill="${color}"/>`;
            }
        }

        // Arrow at target
        const arrowDir = goingDown ? 'down' : 'up';
        svg += renderArrow(targetX, targetY, arrowDir, color, arrowSize);
    }

    return svg;
}

/**
 * Recursively renders a layout node (segment or container).
 *
 * @param {Object} node - Layout tree node.
 * @param {number} x - X position.
 * @param {number} y - Y position.
 * @param {number} width - Available width.
 * @param {number} height - Available height.
 * @param {Object} style - Style configuration.
 * @param {Array} themeColors - Theme colour palette.
 * @param {number} colorIndex - Current colour index.
 * @param {Object} nodesData - Parsed nodes and connections data.
 * @param {string} parentName - Parent segment name for qualified lookups.
 * @returns {string} SVG markup.
 */
function renderLayoutNode(node, x, y, width, height, style, themeColors, colorIndex, nodesData, parentName = null) {
    let svg = '';
    const padding = 8;
    const gap = 10;

    if (node.type === 'segment') {
        // Get colour for this segment
        const color = themeColors[colorIndex % themeColors.length];

        // Draw segment box
        svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}"
            rx="${style['section-radius']}" ry="${style['section-radius']}"
            fill="#ffffff" stroke="${color}" stroke-width="${style['section-border']}"/>`;

        // Draw segment label (centered horizontally in the box)
        if (node.name) {
            const labelText = style.uppercase ? node.name.toUpperCase() : node.name;
            const centerX = x + width / 2;
            svg += `<text x="${centerX}" y="${y + 20}" class="section-label" fill="${color}">
                ${labelText}
            </text>`;
        }

        // Render children if any (nested segments)
        if (node.children && node.children.length > 0) {
            const innerX = x + padding;
            const innerY = y + 30;
            const innerWidth = width - padding * 2;
            const innerHeight = height - 30 - padding;

            svg += renderLayoutChildren(node.children, node.direction || 'row',
                innerX, innerY, innerWidth, innerHeight, style, themeColors, colorIndex + 1, nodesData, node.name);
        } else if (nodesData) {
            // Leaf segment - render nodes and connections
            // Try matching section: first with parent qualifier, then without
            let sectionKey = parentName ? `${parentName}:${node.name}` : node.name;
            if (!nodesData.sections[sectionKey] && parentName) {
                sectionKey = node.name;  // Fallback to unqualified name
            }

            if (nodesData.sections[sectionKey]) {
                const bounds = {
                    x: x + padding,
                    y: y + 30,
                    width: width - padding * 2,
                    height: height - 30 - padding
                };

                // Calculate layout for this section
                const sectionLayout = calculateSectionLayout(nodesData, sectionKey);

                if (sectionLayout) {
                    // Render nodes
                    svg += renderNodesInSection(sectionLayout, bounds, style, color);

                    // Build and render connections
                    const routes = buildConnectionRoutes(sectionLayout, nodesData);
                    svg += renderConnectionsInSection(routes, style, color, sectionLayout, bounds);
                }
            }
        }
    } else if (node.type === 'container') {
        // Render children
        svg += renderLayoutChildren(node.children, node.direction || 'row',
            x, y, width, height, style, themeColors, colorIndex, nodesData, parentName);
    }

    return svg;
}

/**
 * @brief Calculates the actual content size for a layout node.
 *
 * Determines width and height based on node content rather than available space.
 * This produces compact diagrams suitable for documents and journal articles.
 *
 * For leaf segments (no children):
 *   height = labelHeight + sum(nodeHeights) + gridSpacing + sectionPadding
 *   width = max(nodesPerRow * nodeWidth, minLabelWidth)
 *
 * For parent segments (with children):
 *   Row layout: width = sum(childWidths) + gaps, height = max(childHeights)
 *   Column layout: width = max(childWidths), height = sum(childHeights) + gaps
 *
 * @pre node must be a valid layout tree node (segment or container)
 * @pre nodesData must contain sections and nodeMap for content lookup
 * @pre style must contain font-size, hint-size, node-padding, node-min-width
 *
 * @param {Object} node - Layout tree node (type: 'segment' or 'container').
 * @param {Object} nodesData - Parsed nodes data with sections and nodeMap.
 * @param {Object} style - Style configuration with sizing parameters.
 * @param {string} parentName - Parent segment name for qualified section lookups.
 * @returns {Object} { width, height } in pixels.
 */
function calculateNodeContentSize(node, nodesData, style, parentName = null) {
    const padding = 8;          // Gap between nested segments
    const gap = 10;             // Gap between sibling children
    const labelHeight = 30;     // Section heading height
    const sectionPadding = 16;  // Bottom padding inside section box

    // Calculate node dimensions from style
    const fontSize = style['font-size'] || 14;
    const hintSize = style['hint-size'] || 11;
    const lineSpacing = 6;
    const nodePadding = parsePaddingValues(style['node-padding']);
    const nodeMinWidth = style['node-min-width'] || 120;
    const channelSpacing = 15;
    const rowSpacing = 20;

    // Node height based on text content
    const nodeHeightWithHint = nodePadding.top + fontSize + lineSpacing + hintSize + nodePadding.bottom;
    const nodeHeightNoHint = nodePadding.top + fontSize + nodePadding.bottom;

    if (!node) return { width: 100, height: 60 };

    if (node.type === 'segment') {
        if (node.children && node.children.length > 0) {
            // Has nested children - calculate based on children
            const childSizes = node.children.map(child =>
                calculateNodeContentSize(child, nodesData, style, node.name)
            );

            const direction = node.direction || 'row';
            let width, height;

            if (direction === 'row') {
                width = childSizes.reduce((sum, s) => sum + s.width, 0) + gap * (childSizes.length - 1);
                height = Math.max(...childSizes.map(s => s.height));
            } else {
                width = Math.max(...childSizes.map(s => s.width));
                height = childSizes.reduce((sum, s) => sum + s.height, 0) + gap * (childSizes.length - 1);
            }

            return {
                width: width + padding * 2,
                height: height + labelHeight + padding
            };
        } else {
            // Leaf segment - calculate based on nodes
            let sectionKey = parentName ? `${parentName}:${node.name}` : node.name;
            if (!nodesData.sections[sectionKey] && parentName) {
                sectionKey = node.name;
            }

            const section = nodesData.sections[sectionKey];
            if (section) {
                const sectionLayout = calculateSectionLayout(nodesData, sectionKey);
                if (sectionLayout) {
                    // Check if any node has a hint
                    const hasAnyHints = sectionLayout.rows.some(row =>
                        row.nodes.some(n => n.hint)
                    );
                    const nodeHeight = hasAnyHints ? nodeHeightWithHint : nodeHeightNoHint;

                    // Calculate total height: label + rows + grid spacing
                    let contentHeight = labelHeight;
                    for (let i = 0; i < sectionLayout.rows.length; i++) {
                        contentHeight += nodeHeight;
                        if (i < sectionLayout.gridHeights.length) {
                            const gridSpace = sectionLayout.gridHeights[i] * channelSpacing;
                            contentHeight += Math.max(rowSpacing, gridSpace);
                        } else if (i < sectionLayout.rows.length - 1) {
                            contentHeight += rowSpacing;
                        }
                    }
                    contentHeight += sectionPadding;  // Bottom padding

                    // Width: based on max nodes per row
                    const maxNodesInRow = Math.max(...sectionLayout.rows.map(r => r.nodes.length));
                    const contentWidth = Math.max(
                        maxNodesInRow * (nodeMinWidth + 20),  // Nodes with spacing
                        150  // Minimum width for label
                    );

                    return { width: contentWidth, height: contentHeight };
                }
            }

            // Default for empty sections
            return { width: 150, height: labelHeight + nodeHeightNoHint + sectionPadding };
        }
    } else if (node.type === 'container') {
        // Container - combine children
        const childSizes = node.children.map(child =>
            calculateNodeContentSize(child, nodesData, style, parentName)
        );

        const direction = node.direction || 'row';
        let width, height;

        if (direction === 'row') {
            width = childSizes.reduce((sum, s) => sum + s.width, 0) + gap * (childSizes.length - 1);
            height = Math.max(...childSizes.map(s => s.height));
        } else {
            width = Math.max(...childSizes.map(s => s.width));
            height = childSizes.reduce((sum, s) => sum + s.height, 0) + gap * (childSizes.length - 1);
        }

        return { width, height };
    }

    return { width: 100, height: 60 };
}

/**
 * @brief Renders children of a layout container with content-based sizing.
 *
 * Uses content-based sizing: each child gets exactly the size it needs,
 * not a proportional share of available space. This produces compact diagrams.
 *
 * For row layout:
 *   - Each child gets its calculated width
 *   - All children share the maximum height (for visual alignment)
 *   - Children are separated by gap (10px)
 *
 * For column layout:
 *   - Each child gets its calculated height
 *   - All children share the maximum width (for visual alignment)
 *   - Children are separated by gap (10px)
 *
 * @pre children must be an array of valid layout nodes (segment or container)
 * @pre direction must be 'row' or 'column'
 * @pre nodesData must contain sections and nodeMap for size calculation
 *
 * @param {Array} children - Child layout nodes to render.
 * @param {string} direction - Layout direction: 'row' or 'column'.
 * @param {number} x - Starting X position for first child.
 * @param {number} y - Starting Y position for first child.
 * @param {number} width - Available width (used for alignment reference).
 * @param {number} height - Available height (used for alignment reference).
 * @param {Object} style - Style configuration with sizing parameters.
 * @param {Array} themeColors - Theme color palette array.
 * @param {number} colorIndex - Current color index for cycling.
 * @param {Object} nodesData - Parsed nodes and connections data.
 * @param {string} parentName - Parent segment name for qualified section lookups.
 * @returns {string} SVG markup for all children.
 */
function renderLayoutChildren(children, direction, x, y, width, height, style, themeColors, colorIndex, nodesData, parentName) {
    let svg = '';
    const gap = 10;
    const count = children.length;

    if (count === 0) return svg;

    // Calculate content-based sizes for each child
    const childSizes = children.map(child =>
        calculateNodeContentSize(child, nodesData, style, parentName)
    );

    if (direction === 'row') {
        // Row direction: children side by side, all get the max height
        const maxHeight = Math.max(...childSizes.map(s => s.height));
        let currentX = x;

        children.forEach((child, i) => {
            const childWidth = childSizes[i].width;
            svg += renderLayoutNode(child, currentX, y, childWidth, maxHeight, style, themeColors, colorIndex + i, nodesData, parentName);
            currentX += childWidth + gap;
        });
    } else {
        // Column direction: children stacked, all get the max width
        const maxWidth = Math.max(...childSizes.map(s => s.width));
        let currentY = y;

        children.forEach((child, i) => {
            const childHeight = childSizes[i].height;
            svg += renderLayoutNode(child, x, currentY, maxWidth, childHeight, style, themeColors, colorIndex + i, nodesData, parentName);
            currentY += childHeight + gap;
        });
    }

    return svg;
}

/**
 * Gets page dimensions from style configuration.
 * 
 * @param {Object} style - Style configuration.
 * @returns {Object} { width, height } in pixels.
 */
function getPageDimensions(style) {
    // Standard page sizes in mm
    const pageSizes = {
        'A4': { width: 297, height: 210 },
        'A3': { width: 420, height: 297 },
        'letter': { width: 279, height: 216 },
        'legal': { width: 356, height: 216 }
    };
    
    let dimensions = pageSizes[style['page-size']] || pageSizes['A4'];
    
    // Handle custom size
    if (style['page-size'] === 'custom') {
        dimensions = {
            width: style['page-width'] || 297,
            height: style['page-height'] || 210
        };
    }
    
    // Handle orientation
    if (style['page-orientation'] === 'portrait') {
        dimensions = { width: dimensions.height, height: dimensions.width };
    }
    
    // Convert mm to pixels (assuming 96 DPI, 1mm ≈ 3.78px)
    const mmToPx = 3.78;
    return {
        width: Math.round(dimensions.width * mmToPx),
        height: Math.round(dimensions.height * mmToPx)
    };
}

/**
 * Parses padding string into object.
 * 
 * @param {string} paddingStr - Padding string "top right bottom left".
 * @returns {Object} { top, right, bottom, left }.
 */
function parsePadding(paddingStr) {
    const parts = String(paddingStr).split(' ').map(Number);
    const mmToPx = 3.78;
    
    if (parts.length === 1) {
        const val = parts[0] * mmToPx;
        return { top: val, right: val, bottom: val, left: val };
    } else if (parts.length === 2) {
        return { 
            top: parts[0] * mmToPx, 
            right: parts[1] * mmToPx, 
            bottom: parts[0] * mmToPx, 
            left: parts[1] * mmToPx 
        };
    } else if (parts.length === 4) {
        return { 
            top: parts[0] * mmToPx, 
            right: parts[1] * mmToPx, 
            bottom: parts[2] * mmToPx, 
            left: parts[3] * mmToPx 
        };
    }
    
    return { top: 38, right: 38, bottom: 38, left: 38 };
}

// =============================================================================
// 9. EXPORT FUNCTIONS
// =============================================================================

/**
 * Exports the current diagram as PNG.
 * Waits for fonts to load before rendering to ensure correct typography.
 */
async function exportPng() {
    const svgElement = Elements.previewCanvas.querySelector('svg');
    if (!svgElement) {
        showModal('Export Error', 'No diagram to export. Please generate a preview first.');
        return;
    }

    setStatus('Preparing PNG export...', 'info');

    // Wait for fonts to be ready
    await document.fonts.ready;

    // Clone SVG and convert font @import to embedded font-face
    const svgClone = svgElement.cloneNode(true);
    const styleElement = svgClone.querySelector('style');

    if (styleElement) {
        // Replace @import with inline font reference (fonts pre-loaded in HTML)
        let styleContent = styleElement.textContent;
        styleContent = styleContent.replace(/@import url\([^)]+\);?/g, '');
        styleElement.textContent = styleContent;
    }

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        // Keep transparent background - don't fill
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'flowschem-diagram.png';
        link.href = pngUrl;
        link.click();

        URL.revokeObjectURL(url);
        setStatus('PNG exported successfully', 'success');
    };

    img.onerror = function() {
        URL.revokeObjectURL(url);
        setStatus('PNG export failed', 'error');
        showModal('Export Error', 'Failed to render PNG. Try using a browser print to PDF instead.');
    };

    img.src = url;
}

/**
 * Exports the current diagram as PDF.
 * Note: Basic implementation - for production, use a library like jsPDF.
 */
function exportPdf() {
    showModal('Export PDF', 'PDF export requires the jsPDF library. For now, please use PNG export or print to PDF from your browser.');
}

/**
 * Exports the current input as a .flow file.
 */
function exportFlow() {
    const content = `${Elements.styleInput.value}

${Elements.layoutInput.value}

${Elements.nodesInput.value}`;
    
    downloadFile(content, 'diagram.flow', 'text/plain');
    setStatus('Flow file exported successfully', 'success');
}

/**
 * Loads a .flow file.
 * 
 * @param {File} file - The file to load.
 */
function loadFlow(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const content = e.target.result;
        
        // Split content by sections
        const styleMatch = content.match(/@style[\s\S]*?(?=@layout|@nodes|$)/);
        const layoutMatch = content.match(/@layout[\s\S]*?(?=@nodes|$)/);
        const nodesMatch = content.match(/@nodes[\s\S]*/);
        
        if (styleMatch) {
            Elements.styleInput.value = styleMatch[0].trim();
        }
        if (layoutMatch) {
            Elements.layoutInput.value = layoutMatch[0].trim();
        }
        if (nodesMatch) {
            Elements.nodesInput.value = nodesMatch[0].trim();
        }
        
        setStatus('Flow file loaded successfully', 'success', file.name);
    };
    
    reader.onerror = function() {
        showModal('Load Error', 'Failed to read the file.');
    };
    
    reader.readAsText(file);
}

// =============================================================================
// 10. MAIN GENERATION FUNCTION
// =============================================================================

/**
 * Generates the diagram preview from current inputs.
 */
function generatePreview() {
    setStatus('Generating preview...', 'info');
    Elements.btnGenerate.classList.add('generating');
    
    // Small delay for UI feedback
    setTimeout(() => {
        try {
            // Parse inputs
            const style = parseStyle(Elements.styleInput.value);
            const layout = parseLayout(Elements.layoutInput.value);
            const nodesData = parseNodes(Elements.nodesInput.value);
            
            // Store in app state
            AppState.styleConfig = style;
            AppState.layoutTree = layout;
            AppState.nodes = nodesData.nodes;
            AppState.connections = nodesData.connections;
            
            // Render diagram
            const svg = renderDiagram(style, layout, nodesData);
            
            // Display in preview
            Elements.previewPlaceholder.style.display = 'none';
            Elements.previewCanvas.style.display = 'block';
            Elements.previewCanvas.innerHTML = svg;
            
            // Enable export buttons
            Elements.btnExportPdf.disabled = false;
            Elements.btnExportPng.disabled = false;
            
            AppState.diagramGenerated = true;

            // Fit diagram to window by default
            zoomFit();

            const nodeCount = nodesData.nodes.length;
            const connCount = nodesData.connections.length;
            setStatus('Preview generated', 'success', `${nodeCount} nodes, ${connCount} connections`);
            
        } catch (error) {
            console.error('Generation error:', error);
            setStatus('Error generating preview', 'error');
            showModal('Generation Error', error.message);
        }
        
        Elements.btnGenerate.classList.remove('generating');
    }, 100);
}

// =============================================================================
// 11. ZOOM FUNCTIONS
// =============================================================================

/**
 * Updates the zoom level display.
 */
function updateZoomDisplay() {
    Elements.zoomLevel.textContent = Math.round(AppState.zoom.level * 100) + '%';
}

/**
 * Applies the current zoom level to the SVG.
 */
function applyZoom() {
    const svg = Elements.previewCanvas.querySelector('svg');
    if (!svg) return;

    svg.style.transform = `scale(${AppState.zoom.level})`;
    svg.style.transformOrigin = 'top left';
    updateZoomDisplay();
}

/**
 * Zooms in by one step.
 */
function zoomIn() {
    if (AppState.zoom.level < AppState.zoom.maxLevel) {
        AppState.zoom.level = Math.min(
            AppState.zoom.maxLevel,
            Math.round((AppState.zoom.level + AppState.zoom.step) * 10) / 10
        );
        applyZoom();
    }
}

/**
 * Zooms out by one step.
 */
function zoomOut() {
    if (AppState.zoom.level > AppState.zoom.minLevel) {
        AppState.zoom.level = Math.max(
            AppState.zoom.minLevel,
            Math.round((AppState.zoom.level - AppState.zoom.step) * 10) / 10
        );
        applyZoom();
    }
}

/**
 * Resets zoom to 100%.
 */
function zoomReset() {
    AppState.zoom.level = 1;
    applyZoom();
}

/**
 * Fits the diagram to the preview window.
 */
function zoomFit() {
    const svg = Elements.previewCanvas.querySelector('svg');
    if (!svg) return;

    // Reset transform temporarily to get actual dimensions
    svg.style.transform = 'none';

    const container = Elements.previewContainer;
    const containerWidth = container.clientWidth - 24; // Account for padding
    const containerHeight = container.clientHeight - 24;

    const svgWidth = parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
    const svgHeight = parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height;

    if (svgWidth === 0 || svgHeight === 0) return;

    // Calculate scale to fit
    const scaleX = containerWidth / svgWidth;
    const scaleY = containerHeight / svgHeight;
    const scale = Math.min(scaleX, scaleY, AppState.zoom.maxLevel);

    AppState.zoom.level = Math.max(AppState.zoom.minLevel, Math.round(scale * 100) / 100);
    applyZoom();
}

/**
 * Sets zoom to a specific level.
 *
 * @param {number} level - The zoom level (1 = 100%).
 */
function setZoom(level) {
    AppState.zoom.level = Math.max(
        AppState.zoom.minLevel,
        Math.min(AppState.zoom.maxLevel, level)
    );
    applyZoom();
}

// =============================================================================
// 12. EVENT LISTENERS
// =============================================================================

// Section collapse functionality
Elements.sectionHeaders.forEach(header => {
    header.addEventListener('click', () => {
        const targetId = header.getAttribute('data-target');
        const content = document.getElementById(targetId);
        
        if (content) {
            header.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        }
    });
});

// Button click handlers
Elements.btnGenerate.addEventListener('click', generatePreview);
Elements.btnExportPdf.addEventListener('click', exportPdf);
Elements.btnExportPng.addEventListener('click', exportPng);
Elements.btnExportFlow.addEventListener('click', exportFlow);

Elements.btnLoadFlow.addEventListener('click', () => {
    Elements.fileInput.click();
});

Elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadFlow(e.target.files[0]);
    }
});

// Zoom control handlers
Elements.btnZoomIn.addEventListener('click', zoomIn);
Elements.btnZoomOut.addEventListener('click', zoomOut);
Elements.btnZoomFit.addEventListener('click', zoomFit);
Elements.btnZoomReset.addEventListener('click', zoomReset);

// Mouse wheel zoom on preview
Elements.previewCanvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    }
}, { passive: false });

// Modal handlers
Elements.modalClose.addEventListener('click', hideModal);
Elements.modalOk.addEventListener('click', hideModal);
Elements.modalOverlay.addEventListener('click', (e) => {
    if (e.target === Elements.modalOverlay) {
        hideModal();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generatePreview();
    }
    
    // Escape to close modal
    if (e.key === 'Escape') {
        hideModal();
    }
});

// =============================================================================
// 13. INITIALISATION
// =============================================================================

setStatus('Ready', 'info', 'Ctrl+Enter to generate | Ctrl+Wheel to zoom');
