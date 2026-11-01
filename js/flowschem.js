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

/** Style keys that hold a number, so a parsed value must become one. */
const NumericStyleKeys = new Set(
    Object.keys(DefaultStyle).filter(key => typeof DefaultStyle[key] === 'number')
        .concat(['line-spacing', 'corner-radius'])
);

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
    ],
    // Kelly's 22 colours of maximum contrast, less white, for wires.
    kelly: [
        '#222222', '#f3c300', '#875692', '#f38400', '#a1caf1', '#be0032',
        '#c2b280', '#848482', '#008856', '#e68fac', '#0067a5', '#f99379',
        '#604e97', '#f6a600', '#b3446c', '#dcd300', '#882d17', '#8db600',
        '#654522', '#e25822', '#2b3d26'
    ],
    // Okabe and Ito, distinct under the common forms of colour blindness.
    'okabe-ito': [
        '#e69f00', '#56b4e9', '#009e73', '#f0e442',
        '#0072b2', '#d55e00', '#cc79a7', '#000000'
    ]
};

/** Per-wire colours for the current render, or null when wires take box colours. */
let ActiveTraceColours = null;

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

            // WHY: a numeric setting written with a unit, such as `14px`, used
            // to stay a string, so sizes came out NaN or as concatenated text,
            // and any string reaches SVG markup. A numeric key keeps only its
            // number, or the default when there is none.
            if (NumericStyleKeys.has(key) && typeof value !== 'number') {
                const number = parseFloat(value);
                value = Number.isFinite(number) ? number : DefaultStyle[key];
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

/** Largest number of layout tree nodes walked when collecting the layout scope. */
const MAX_LAYOUT_NODES = 4096;

/**
 * @brief Collects the section keys and container names the layout places.
 *
 * A nodes block only owns nodes when the layout actually places it. A block
 * the layout never mentions, such as a trailing block holding only links
 * between stacks, declares nothing and its names are pure references.
 *
 * Walked with an explicit stack rather than by recursion, per P10 rule 1.
 *
 * @param {Object} layoutTree - Parsed layout tree, may be null.
 * @returns {Object} { sections: Set<string>, containers: Set<string> }.
 */
function collectLayoutScope(layoutTree) {
    const sections = new Set();
    const containers = new Set();
    if (!layoutTree) return { sections: sections, containers: containers };

    const stack = [{ node: layoutTree, parent: null }];
    let guard = 0;
    while (stack.length > 0 && guard < MAX_LAYOUT_NODES) {
        guard++;
        const item = stack.pop();
        const node = item.node;
        if (!node) continue;

        const hasChildren = node.children && node.children.length > 0;

        if (node.type === 'segment' && !hasChildren) {
            // Leaf. Both key forms are accepted because renderLayoutNode falls
            // back to the bare name when the qualified key has no block.
            if (item.parent) sections.add(item.parent + ':' + node.name);
            sections.add(node.name);
            continue;
        }
        if (node.type === 'segment') containers.add(node.name);

        const childParent = node.type === 'segment' ? node.name : item.parent;
        if (hasChildren) {
            for (const child of node.children) stack.push({ node: child, parent: childParent });
        }
    }
    console.assert(guard < MAX_LAYOUT_NODES, 'layout scope walk hit its bound');
    return { sections: sections, containers: containers };
}

/**
 * @brief Splits one endpoint into its optional section qualifier, name and hint.
 *
 * Accepted forms are `Name`, `Name/hint`, `section:Name` and
 * `section:Name/hint`. The qualifier names the section the node lives in, which
 * is how an endpoint reaches out of the block it is written in.
 *
 * Any form may end in `{#hex}`, the colour of the wire to this target. It is
 * kept only when OrcaTraces.isHexColour() accepts it, so nothing else reaches
 * SVG markup.
 *
 * @param {string} str - Raw endpoint text.
 * @returns {Object} { qualifier, name, hint, colour, colourError }.
 */
function parseEndpoint(str) {
    let trimmed = (str || '').trim();
    let colour = null;
    let colourError = null;
    const brace = trimmed.match(/\{([^}]*)\}\s*$/);
    if (brace) {
        trimmed = trimmed.slice(0, brace.index).trim();
        const value = brace[1].trim();
        if (OrcaTraces.isHexColour(value)) {
            colour = value;
        } else {
            colourError = "Wire colour '{" + value + "}' on '" + trimmed
                + "' is not a hex colour such as {#e6194b}.";
        }
    }
    const colon = trimmed.indexOf(':');
    const qualifier = colon > 0 ? trimmed.slice(0, colon).trim() : null;
    const rest = colon > 0 ? trimmed.slice(colon + 1).trim() : trimmed;
    const parts = rest.split('/');
    return {
        qualifier: qualifier,
        name: parts[0].trim(),
        hint: parts.length > 1 ? parts[1].trim() : null,
        colour: colour,
        colourError: colourError
    };
}

/**
 * @brief Resolves a link endpoint to a node id or a section name.
 *
 * Used for endpoints that may reach out of their own block, which is every
 * endpoint of a bidirectional line and every endpoint carrying a qualifier.
 * Directional lines keep their original block-local behaviour and never come
 * here, so existing diagrams resolve exactly as before.
 *
 * Order is qualifier first, then the local block, then a unique match anywhere
 * the layout places. An ambiguous bare name is reported rather than guessed.
 *
 * @pre ctx.declaredIn must be indexed over nodes that have a placed section.
 *
 * @param {Object} endpoint - From parseEndpoint().
 * @param {string} localKey - Section key of the block the line is written in.
 * @param {Object} ctx - { scope, declaredIn, scopeKnown }.
 * @returns {Object} { kind: 'node'|'section'|'error', id, sectionKey, message }.
 */
function resolveLinkEndpoint(endpoint, localKey, ctx) {
    console.assert(endpoint && typeof endpoint.name === 'string', 'endpoint must be parsed');
    console.assert(typeof localKey === 'string', 'localKey must be a section key');

    const base = generateNodeId(endpoint.name);
    const declared = ctx.declaredIn.get(base);

    if (endpoint.qualifier) {
        const key = endpoint.qualifier;
        if (!ctx.scope.sections.has(key)) {
            return { kind: 'error', message: "Unknown section '" + key + "' in '" + key + ':' + endpoint.name + "'." };
        }
        if (!declared || !declared.has(key)) {
            return { kind: 'error', message: "Section '" + key + "' has no node '" + endpoint.name + "'." };
        }
        return { kind: 'node', id: generateNodeId(endpoint.name, key), sectionKey: key };
    }

    // No layout yet, so nothing can be placed. Keep the old local behaviour
    // rather than reporting every endpoint while the user is still typing.
    if (!ctx.scopeKnown) {
        return { kind: 'node', id: generateNodeId(endpoint.name, localKey), sectionKey: localKey };
    }

    if (declared && declared.has(localKey)) {
        return { kind: 'node', id: generateNodeId(endpoint.name, localKey), sectionKey: localKey };
    }

    const candidates = declared ? Array.from(declared).sort() : [];
    const isSection = ctx.scope.containers.has(endpoint.name) || ctx.scope.sections.has(endpoint.name);

    if (isSection && candidates.length > 0) {
        return { kind: 'error', message: "'" + endpoint.name + "' is both a section and a node in " + candidates.join(', ')
            + ". Qualify the node as " + candidates[0] + ':' + endpoint.name + "." };
    }
    if (isSection) return { kind: 'section', id: endpoint.name };
    if (candidates.length === 1) {
        return { kind: 'node', id: generateNodeId(endpoint.name, candidates[0]), sectionKey: candidates[0] };
    }
    if (candidates.length > 1) {
        return { kind: 'error', message: "'" + endpoint.name + "' is ambiguous: " + candidates.join(', ')
            + ". Write " + candidates[0] + ':' + endpoint.name + "." };
    }
    return { kind: 'error', message: "Unknown endpoint '" + endpoint.name + "' in block '" + localKey + "'." };
}

/**
 * Parses the nodes block from input text.
 * Supports section-qualified names like "USV:sensors-1" for disambiguation.
 *
 * Directional lines (`>`, `<`, `->`, `<-`) declare and connect inside one
 * block, exactly as before. Bidirectional lines (`<>`, `<->`) and any endpoint
 * written `section:Name` link nodes that already exist and may reach into
 * another section, so they are resolved in a second pass once every block has
 * been read and every node has a section.
 *
 * @param {string} input - Raw nodes input text.
 * @param {Object} layoutTree - Parsed layout, so a block that the layout never
 *                              places is known to declare nothing. May be null.
 * @returns {Object} Object containing nodes, connections, sections and errors.
 */
function parseNodes(input, layoutTree) {
    const result = {
        nodes: [],
        connections: [],
        sections: {},
        nodeMap: {},  // Quick lookup by ID
        errors: []
    };

    if (!input || !input.trim()) {
        return result;
    }

    const scope = collectLayoutScope(layoutTree);
    // Lines that may reach out of their own block, resolved after pass one.
    const pendingLinks = [];

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
            if (parsed) reportColourErrors(parsed, result.errors);

            if (parsed && needsLinkResolution(parsed)) {
                // Reaches out of this block. Nothing is declared here, so the
                // line contributes no nodes and no rows; pass two wires it up.
                pendingLinks.push({ sectionKey: sectionKey, parsed: parsed });
            } else if (parsed) {
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
                        dashed: parsed.dashed,
                        colour: target.colour
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

    resolvePendingLinks(result, pendingLinks, scope);

    // Trace colouring and gutter pieces both key a wire by this index.
    result.connections.forEach((conn, index) => { conn.index = index; });

    return result;
}

/**
 * @brief Reports wire colours that are not hex, or that sit on a source.
 *
 * A colour belongs to the wire into one target, so on the left of a line it
 * has no single wire to name.
 *
 * @param {Object} parsed - Output of parseNodeLine().
 * @param {Array} errors - Parse errors, appended to.
 * @returns {void}
 */
function reportColourErrors(parsed, errors) {
    const source = parsed.sourceRaw;
    if (source.colour || source.colourError) {
        errors.push("A wire colour goes after a target, not after '" + source.name + "'.");
    }
    for (const target of parsed.targetsRaw) {
        if (target.colourError) errors.push(target.colourError);
    }
}

/**
 * @brief Reports whether a parsed line must be resolved across blocks.
 *
 * A bidirectional line states a link between things that already exist rather
 * than declaring them, and a qualified endpoint names its section outright.
 * Either way the endpoints are references, not declarations.
 *
 * @param {Object} parsed - Output of parseNodeLine().
 * @returns {boolean} True when the line is handled by resolvePendingLinks().
 */
function needsLinkResolution(parsed) {
    console.assert(parsed && parsed.sourceRaw, 'parsed line must carry raw endpoints');
    if (parsed.connectionType === 'bidirectional') return true;
    if (parsed.sourceRaw.qualifier) return true;
    const targets = parsed.targetsRaw || [];
    for (const target of targets) {
        if (target.qualifier) return true;
    }
    return false;
}

/**
 * @brief Wires up the lines that reach out of their own block.
 *
 * Runs after every block has been read, so a link may name a node declared
 * later in the input. An endpoint that cannot be resolved is recorded in
 * result.errors rather than dropped, which is what used to hide the fact that
 * no cross-section wire resolved at all.
 *
 * @pre Every node that the layout places must already have its section set.
 *
 * @param {Object} result - Parse result, mutated in place.
 * @param {Array} pendingLinks - [{ sectionKey, parsed }] collected in pass one.
 * @param {Object} scope - Output of collectLayoutScope().
 * @returns {void}
 */
function resolvePendingLinks(result, pendingLinks, scope) {
    console.assert(Array.isArray(pendingLinks), 'pendingLinks must be an array');
    console.assert(result && result.nodeMap, 'result must be a parse result');
    if (pendingLinks.length === 0) return;

    // Index the placed nodes by bare name, so a reference can find the one
    // section that declares it, or report the several that do.
    const declaredIn = new Map();
    for (const node of result.nodes) {
        if (!node.section || !scope.sections.has(node.section)) continue;
        const base = generateNodeId(node.name);
        if (!declaredIn.has(base)) declaredIn.set(base, new Set());
        declaredIn.get(base).add(node.section);
    }

    const ctx = { scope: scope, declaredIn: declaredIn, scopeKnown: scope.sections.size > 0 };
    const seenErrors = new Set();

    /**
     * @brief Records one resolution failure, without repeating it.
     * @param {string} message - Human readable reason.
     * @returns {void}
     */
    function report(message) {
        if (seenErrors.has(message)) return;
        seenErrors.add(message);
        result.errors.push(message);
    }

    for (const link of pendingLinks) {
        const from = resolveLinkEndpoint(link.parsed.sourceRaw, link.sectionKey, ctx);
        if (from.kind === 'error') {
            report(from.message);
            continue;
        }

        for (const rawTarget of link.parsed.targetsRaw) {
            const to = resolveLinkEndpoint(rawTarget, link.sectionKey, ctx);
            if (to.kind === 'error') {
                report(to.message);
                continue;
            }

            const connection = {
                from: from.id,
                to: to.id,
                type: link.parsed.connectionType || 'to',
                dashed: link.parsed.dashed,
                colour: rawTarget.colour,
                fromKind: from.kind,
                toKind: to.kind
            };
            result.connections.push(connection);

            if (from.kind === 'node' && result.nodeMap[from.id]) {
                result.nodeMap[from.id].connectionsOut.push(connection);
            }
            if (to.kind === 'node' && result.nodeMap[to.id]) {
                result.nodeMap[to.id].connectionsIn.push(connection);
            }
        }
    }
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

            const source = parseEndpoint(sourceStr);
            const targets = targetStr.split(',').map(t => parseEndpoint(t.trim()));

            // Use section-qualified IDs for consistency (same section for all within a section block)
            return {
                sourceId: generateNodeId(source.name, section),
                sourceName: source.name,
                sourceHint: source.hint,
                sourceRaw: source,
                targets: targets.map(t => ({
                    id: generateNodeId(t.name, section),
                    name: t.name,
                    hint: t.hint,
                    colour: t.colour
                })),
                targetsRaw: targets,
                connectionType: type,
                dashed: dashed
            };
        }
    }

    // Standalone node (no connection)
    const node = parseEndpoint(line);
    return {
        sourceId: generateNodeId(node.name, section),
        sourceName: node.name,
        sourceHint: node.hint,
        sourceRaw: node,
        targets: [],
        targetsRaw: [],
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
 * Row spacing is not decided here. The router works out how many channels
 * each gap needs, and every gap in the diagram then takes the largest of
 * those, so the rows line up across the whole page.
 *
 * @pre nodesData must contain sections[sectionKey] with nodes
 * @pre Each section must have at least one node
 *
 * @param {Object} nodesData - Parsed nodes data with sections and nodeMap.
 * @param {string} sectionKey - The section name to calculate layout for.
 * @returns {Object} Layout object with:
 *   - rows: Array of { rowNum, nodes, nodeCount } where each node has a column
 *   - maxColumns: Largest node count in any row
 *   Returns null if section not found or empty.
 */
function calculateSectionLayout(nodesData, sectionKey) {
    const section = nodesData.sections[sectionKey];
    if (!section) return null;

    const layout = {
        rows: [],
        maxColumns: 0
    };

    // Build row data with nodes
    for (let rowNum = 1; rowNum <= section.maxRow; rowNum++) {
        const nodeIds = section.rows[rowNum] || [];
        const rowNodes = nodeIds.map(id => nodesData.nodeMap[id]).filter(n => n);

        // Calculate column positions: (2k-1)/(2n) for k=1 to n
        const nodeCount = rowNodes.length;
        rowNodes.forEach((node, index) => {
            node.column = nodeCount > 0 ? (2 * (index + 1) - 1) / (2 * nodeCount) : 0.5;
        });

        // Routing corridors are derived from real node footprints by the
        // router, so no fractional exit positions are needed here.
        layout.rows.push({
            rowNum,
            nodes: rowNodes,
            nodeCount: rowNodes.length
        });

        layout.maxColumns = Math.max(layout.maxColumns, nodeCount);
    }

    return layout;
}

// =============================================================================
// 6b. SECTION PLANNING (orthogonal channel router)
//
// Node X positions, row heights and every wire path come from one plan per
// section, produced by js/router.js. The plan is built in a local coordinate
// space whose origin is the left edge of the section content, so the same plan
// serves both the sizing pass and the render pass. Sizing runs first and warms
// the cache, which is what keeps the reserved height and the drawn wires in
// step.
// =============================================================================

/** Plans built during the current render, keyed by section. Cleared per run. */
const SectionPlanCache = {};

/** Gap height shared by every section of the current diagram. */
let ActiveGapHeight = 0;

/** Extra width allowed per node so corridors between them stay routable. */
const NODE_COLUMN_SPACING = 20;

/** Smallest section content width, enough to hold the section label. */
const MIN_SECTION_WIDTH = 150;

/** Vertical padding below the last row inside a section box. */
const SECTION_BOTTOM_PADDING = 16;

/** Height of the section heading strip. */
const SECTION_LABEL_HEIGHT = 30;

/** Inset from a segment box edge to its contents, and a floor for a gutter. */
const LAYOUT_PADDING = 8;

/** Separation between sibling boxes, and a floor for a gutter. */
const LAYOUT_GUTTER = 10;

/** The plan the last render was emitted from, for the debug harness. */
let LastDiagramPlan = null;

/** Gutter plans built during the current render, keyed by level box id. */
const GutterPlanCache = {};

/** Level tree and per-level net pieces for the current diagram. */
let ActiveLevels = null;

/** Boundary port X per level id and net key, in that level's content space. */
let BoundaryHints = {};

/** Most size, place and join rounds the plan phase takes to settle. */
const MAX_JOIN_PASSES = 4;

/**
 * @brief Clears the plan cache so a fresh render replans every section.
 * @returns {void}
 */
function resetSectionPlans() {
    for (const key in SectionPlanCache) {
        delete SectionPlanCache[key];
    }
    for (const key in GutterPlanCache) {
        delete GutterPlanCache[key];
    }
}

/**
 * @brief Computes the height of one node box from the style and its contents.
 *
 * Every node in a section shares a height so the rows stay level, so the hint
 * line is reserved whenever any node in the section carries one.
 *
 * @param {Object} sectionLayout - Layout with rows of nodes.
 * @param {Object} style - Style configuration.
 * @returns {number} Node height in pixels.
 */
function nodeHeightForSection(sectionLayout, style) {
    const fontSize = style['font-size'] || 14;
    const hintSize = style['hint-size'] || 11;
    const lineSpacing = 6;
    const padding = parsePaddingValues(style['node-padding']);

    const hasAnyHints = sectionLayout.rows.some(row => row.nodes.some(n => n.hint));
    const textHeight = hasAnyHints ? fontSize + lineSpacing + hintSize : fontSize;

    return padding.top + textHeight + padding.bottom;
}

/**
 * @brief Builds, or returns from cache, the routing plan for one section.
 *
 * The plan fixes the content width, the node X positions, the uniform gap
 * height and every wire path. Callers translate the result into page
 * coordinates; nothing here depends on where the section ends up.
 *
 * @pre nodesData.sections[sectionKey] must exist.
 *
 * @param {Object} nodesData - Parsed nodes data with sections and nodeMap.
 * @param {string} sectionKey - Section to plan.
 * @param {Object} style - Style configuration.
 * @param {number} uniformGapHeight - Gap height shared by the whole diagram, or
 *                                    0 to use this section's own requirement.
 * @returns {Object|null} Plan bundle, or null when the section is empty.
 */
function getSectionPlan(nodesData, sectionKey, style, uniformGapHeight = 0) {
    const cacheKey = sectionKey + '|' + uniformGapHeight;
    if (SectionPlanCache[cacheKey]) return SectionPlanCache[cacheKey];

    const sectionLayout = calculateSectionLayout(nodesData, sectionKey);
    if (!sectionLayout || sectionLayout.rows.length === 0) return null;

    const nodeMinWidth = style['node-min-width'] || 120;
    const nodeHeight = nodeHeightForSection(sectionLayout, style);

    const maxNodesInRow = Math.max(...sectionLayout.rows.map(r => r.nodes.length), 1);
    let contentWidth = Math.max(
        maxNodesInRow * (nodeMinWidth + NODE_COLUMN_SPACING),
        MIN_SECTION_WIDTH
    );

    const leaf = ActiveLevels ? ActiveLevels.tree.bySection[sectionKey] : null;
    const levelId = leaf ? leaf.id : null;

    /**
     * @brief Places nodes in section-local space for a given content width.
     * @param {number} width - Content width to lay the rows out across.
     * @returns {Array} Rows in the shape planSection() expects.
     */
    function layoutRowsAt(width) {
        return sectionLayout.rows.map(row => ({
            nodes: row.nodes.map(node => {
                node.pixelWidth = nodeMinWidth;
                node.pixelHeight = nodeHeight;
                node.localX = node.column * width;
                return { id: node.id, width: nodeMinWidth, centreX: node.localX };
            })
        }));
    }

    // Collect every connection whose two ends live in this section.
    const sectionIds = new Set();
    for (const row of sectionLayout.rows) {
        for (const node of row.nodes) sectionIds.add(node.id);
    }

    const connections = [];
    let connIndex = 0;
    for (const row of sectionLayout.rows) {
        for (const node of row.nodes) {
            for (const conn of node.connectionsOut) {
                if (!sectionIds.has(conn.to)) continue;
                connections.push({
                    id: 'c' + (connIndex++),
                    from: node.id,
                    to: conn.to,
                    type: conn.type,
                    dashed: conn.dashed,
                    traceIndex: conn.index
                });
            }
        }
    }

    const geometry = {
        nodeHeight: nodeHeight,
        hTrackPitch: style['line-spacing'] || 15,
        clearance: 10,
        portPitch: 12,
        portInset: 8,
        arrowClearance: 12,
        cornerRadius: style['corner-radius'] !== undefined ? style['corner-radius'] : 4
    };

    /**
     * @brief Plans the section at one width with boundary ports at given Xs.
     *
     * A wire leaving the section for another box is routed to a boundary row
     * like any other net, so it shares the section's tracks and corridors.
     *
     * @param {number} width - Content width.
     * @param {Object} hints - Net key to fixed boundary port X, may be empty.
     * @returns {Object} { plan, framed } with framed from frameBoundaryRows().
     */
    function planAt(width, hints) {
        const framed = frameBoundaryRows(levelId, layoutRowsAt(width), width, hints);
        const outside = boundaryConnections(levelId, framed.ids, id => sectionIds.has(id));
        const plan = OrcaRouter.planSection({
            rows: framed.rows,
            connections: connections.concat(outside),
            bounds: { minX: 0, maxX: width },
            geometry: geometry
        });
        return { plan: plan, framed: framed };
    }

    const hints = (levelId && BoundaryHints[levelId]) || {};

    // WHY: the default column pitch is node width plus 20, while a node blocks
    // its width plus twice the 10px clearance. The two are equal, so every
    // corridor between nodes came out zero wide, every crossing collapsed onto
    // the section edge and pass-through wires landed on top of each other.
    // The router reports the width its corridors need, so widen and replan
    // until they fit.
    const MAX_WIDTH_PASSES = 4;
    let planned = null;
    let plannedWidth = contentWidth;
    for (let pass = 0; pass < MAX_WIDTH_PASSES; pass++) {
        planned = planAt(contentWidth, hints);
        plannedWidth = contentWidth;
        if (planned.plan.requiredContentWidth <= contentWidth + 0.5) break;
        contentWidth = Math.ceil(planned.plan.requiredContentWidth);
    }

    // WHY: the last pass can widen without planning again, which left the
    // wires routed at the old width while the nodes moved to the new one.
    if (plannedWidth !== contentWidth) planned = planAt(contentWidth, hints);

    // Keep node.localX in step with the width the final plan was built at.
    layoutRowsAt(contentWidth);

    const plan = planned.plan;
    const framed = planned.framed;
    const rowCount = framed.rows.length;
    console.assert(framed.firstContentRow + sectionLayout.rows.length <= rowCount,
        'node rows must fit inside the framed rows');

    /**
     * @brief True for a gap that runs along a boundary row.
     * @param {number} g - Gap index.
     * @returns {boolean} Whether the gap borders the box edge.
     */
    function isBoundaryGap(g) {
        return (framed.hasTop && g === 0) || (framed.hasBottom && g === rowCount - 2);
    }

    // Only the gaps between node rows share the diagram's uniform pitch. A
    // boundary gap holds just the wires leaving the box, so it is sized alone.
    let innerTracks = 0;
    plan.gapTrackCounts.forEach((tracks, g) => {
        if (!isBoundaryGap(g)) innerTracks = Math.max(innerTracks, tracks);
    });
    const ownGapHeight = OrcaRouter.gapHeightForTracks(innerTracks, plan.geometry);
    const gapHeight = Math.max(uniformGapHeight, ownGapHeight);

    // A same-row wire in the last row routes through a gap below it, so the
    // section reserves that trailing gap when the plan uses one.
    const rowOffsets = [];
    const rowHeights = [];
    const gapHeights = [];
    let cursorY = 0;
    for (let r = 0; r < rowCount; r++) {
        const isBoundaryRow = (framed.hasTop && r === 0) || (framed.hasBottom && r === rowCount - 1);
        rowOffsets.push(cursorY);
        rowHeights.push(isBoundaryRow ? 0 : nodeHeight);
        cursorY += rowHeights[r];
        if (r < plan.gapTrackCounts.length) {
            const gap = isBoundaryGap(r)
                ? OrcaRouter.gapHeightForTracks(plan.gapTrackCounts[r], plan.geometry)
                : gapHeight;
            gapHeights.push(gap);
            cursorY += gap;
        }
    }
    const contentHeight = cursorY;
    console.assert(rowHeights.length === rowCount && gapHeights.length === plan.gapTrackCounts.length,
        'every plan row and gap must have a reserved size');

    // A bottom boundary row sits on the box edge, so the gap above it takes
    // the place of the bottom padding.
    const bottomPadding = framed.hasBottom ? 0 : SECTION_BOTTOM_PADDING;

    const bundle = {
        sectionKey: sectionKey,
        levelId: levelId,
        sectionLayout: sectionLayout,
        plan: plan,
        contentWidth: contentWidth,
        nodeHeight: nodeHeight,
        gapHeight: gapHeight,
        gapHeights: gapHeights,
        rowOffsets: rowOffsets,
        rowHeights: rowHeights,
        firstContentRow: framed.firstContentRow,
        hasBoundary: framed.hasTop || framed.hasBottom,
        contentHeight: contentHeight,
        totalHeight: SECTION_LABEL_HEIGHT + contentHeight + bottomPadding,
        // Routes the section again at its sized width once the level above
        // has fixed the boundary port Xs. The rows keep their shape, so the
        // reserved geometry still applies.
        replan: newHints => planAt(contentWidth, newHints).plan
    };

    SectionPlanCache[cacheKey] = bundle;
    return bundle;
}

/**
 * @brief Splits every connection into the pieces each routing level must draw.
 *
 * A connection whose endpoints sit in one section is left alone, because
 * planSection() already routes it. Everything else is decomposed against the
 * layout tree, which yields one piece per container boundary the wire crosses.
 *
 * This is the plan phase's first step and needs no geometry, so it runs before
 * anything is sized or placed.
 *
 * @pre nodesData must have been parsed with the same layout tree.
 *
 * @param {Object} layoutTree - Parsed layout tree, may be null.
 * @param {Object} nodesData - Parsed nodes data.
 * @returns {Object} { tree, byLevel, errors } where byLevel maps a box id to
 *                   the pieces that level routes.
 */
function planLevels(layoutTree, nodesData) {
    const sectionKeys = Object.keys(nodesData.sections);
    const tree = OrcaLevels.buildLevelTree(layoutTree, sectionKeys);
    const byLevel = {};
    const errors = [];

    if (!tree.root) return { tree: tree, byLevel: byLevel, errors: errors };

    /**
     * @brief Describes one connection end the way decomposeNet expects.
     * @param {string} id - Node id, or section name for a section endpoint.
     * @param {string} kind - 'section' when the end is a box, else a node.
     * @returns {Object|null} Endpoint descriptor, or null when unresolvable.
     */
    function endpointFor(id, kind) {
        if (kind === 'section') return { kind: 'section', id: id };
        const node = nodesData.nodeMap[id];
        if (!node || !node.section) return null;
        return { kind: 'node', id: id, sectionKey: node.section };
    }

    nodesData.connections.forEach((conn, connIndex) => {
        const from = endpointFor(conn.from, conn.fromKind);
        const to = endpointFor(conn.to, conn.toKind);
        if (!from || !to) return;

        // Both ends in one section is the ordinary case and is already routed.
        if (from.kind === 'node' && to.kind === 'node'
            && from.sectionKey === to.sectionKey) {
            return;
        }

        const result = OrcaLevels.decomposeNet(from, to, tree);
        if (result.error) {
            errors.push(result.error);
            return;
        }
        for (const piece of result.pieces) {
            if (!byLevel[piece.levelId]) byLevel[piece.levelId] = [];
            byLevel[piece.levelId].push({
                // One key per connection, shared by all of its pieces, which
                // is how a port on one side of a box edge finds the other.
                key: 'n' + connIndex,
                connection: conn,
                from: piece.from,
                to: piece.to,
                pieceCount: result.pieces.length
            });
        }
    });

    // Net keys per level, so asking whether a wire carries on inside a box
    // is a lookup rather than a scan.
    const keysByLevel = {};
    for (const levelId in byLevel) {
        keysByLevel[levelId] = new Set(byLevel[levelId].map(piece => piece.key));
    }

    const levels = { tree: tree, byLevel: byLevel, keysByLevel: keysByLevel, errors: errors, sides: {} };
    levels.sides = planBoundarySides(levels);
    return levels;
}

/**
 * @brief Picks the edge, top or bottom, each wire uses to cross each box edge.
 *
 * This is topology only. The router sends a wire out of the bottom of a row
 * and into the top of a lower one, and runs a same-row wire under its row, so
 * the edge follows from row indices alone and needs no geometry. That is what
 * lets every level reserve its boundary rows before anything is sized.
 *
 * The parent level decides, so levels are visited parents first. Walked with
 * an explicit stack rather than by recursion, per P10 rule 1.
 *
 * @param {Object} levels - { tree, byLevel } from planLevels().
 * @returns {Object} Map of level id to a map of net key to 'top' or 'bottom'.
 */
function planBoundarySides(levels) {
    const sides = {};
    const tree = levels.tree;
    if (!tree.root) return sides;
    console.assert(tree.boxes[tree.root.id] === tree.root, 'the root must be in the tree');

    const stack = [tree.root];
    let guard = 0;

    while (stack.length > 0 && guard < MAX_LAYOUT_NODES) {
        guard++;
        const box = stack.pop();
        for (const child of box.children) stack.push(child);
        if (box.kind !== 'container') continue;

        const own = sides[box.id] || {};
        const contentRows = box.direction === 'column' ? box.children.length : 1;
        const rowOf = {};
        box.children.forEach((child, i) => {
            rowOf[child.id] = box.direction === 'column' ? i : 0;
        });

        /**
         * @brief Router row of one piece end, with boundaries outside the rows.
         * @param {Object} end - Piece end { kind, id }.
         * @param {string} key - Net key of the piece.
         * @returns {number|undefined} Row index, or undefined if unplaced.
         */
        function endRow(end, key) {
            if (end.kind === 'boundary') return own[key] === 'top' ? -1 : contentRows;
            return rowOf[end.id];
        }

        for (const piece of levels.byLevel[box.id] || []) {
            const fromRow = endRow(piece.from, piece.key);
            const toRow = endRow(piece.to, piece.key);
            if (fromRow === undefined || toRow === undefined) continue;

            // The same rule OrcaRouter's decomposeNet applies to row indices.
            let fromEdge = 'bottom';
            let toEdge = 'bottom';
            if (fromRow < toRow) toEdge = 'top';
            if (fromRow > toRow) fromEdge = 'top';

            for (const [end, edge] of [[piece.from, fromEdge], [piece.to, toEdge]]) {
                if (end.kind !== 'box') continue;
                if (!sides[end.id]) sides[end.id] = {};
                sides[end.id][piece.key] = edge;
            }
        }
    }

    console.assert(guard < MAX_LAYOUT_NODES, 'boundary side walk hit its bound');
    return sides;
}

/**
 * @brief Lists the nets that leave a level through its top and bottom edges.
 *
 * @param {string|null} levelId - Level box id, or null when there is none.
 * @returns {Object} { top, bottom }, each an array of net keys.
 */
function boundaryKeys(levelId) {
    console.assert(levelId === null || typeof levelId === 'string', 'levelId must be a box id');
    const keys = { top: [], bottom: [] };
    if (!ActiveLevels || !levelId) return keys;

    const own = ActiveLevels.sides[levelId] || {};
    for (const piece of ActiveLevels.byLevel[levelId] || []) {
        if (piece.from.kind !== 'boundary' && piece.to.kind !== 'boundary') continue;
        keys[own[piece.key] === 'top' ? 'top' : 'bottom'].push(piece.key);
    }
    return keys;
}

/**
 * @brief Frames a level's rows with the boundary rows its nets leave through.
 *
 * A boundary row has zero height and sits first or last. Once the level above
 * has fixed where each wire crosses the box edge, the row holds one zero-width
 * node per wire at exactly that X, and assignPorts() puts the port there with
 * no new router code. Before that, one node spans the row and the ports fan
 * out along it, which is close enough to size the box by.
 *
 * @param {string|null} levelId - Level box id.
 * @param {Array} contentRows - The level's own rows, in planSection() shape.
 * @param {number} width - Content width of the level.
 * @param {Object} hints - Map of net key to fixed port X, may be empty.
 * @returns {Object} { rows, ids, firstContentRow, hasTop, hasBottom } where
 *                   ids maps a net key to its boundary node id.
 */
function frameBoundaryRows(levelId, contentRows, width, hints) {
    console.assert(Array.isArray(contentRows), 'contentRows must be an array');
    console.assert(width > 0, 'a level needs a positive width');

    const keys = boundaryKeys(levelId);
    const ids = {};

    /**
     * @brief Builds one boundary row for one edge.
     * @param {string} side - 'top' or 'bottom'.
     * @param {Array} netKeys - Nets crossing that edge.
     * @returns {Object} A row in planSection() shape.
     */
    function boundaryRow(side, netKeys) {
        // A net the level above has placed is pinned on its own. Only the
        // rest share one spanning node, so one missing hint cannot unpin the
        // whole edge.
        const nodes = [];
        let spanning = false;
        for (const key of netKeys) {
            if (typeof hints[key] === 'number') {
                ids[key] = 'bnd:' + key;
                nodes.push({ id: 'bnd:' + key, boundary: true, centreX: hints[key], width: 0 });
            } else {
                ids[key] = 'bnd:' + side;
                spanning = true;
            }
        }
        if (spanning) {
            nodes.push({ id: 'bnd:' + side, boundary: true, centreX: width / 2, width: width });
        }
        return { nodes: nodes };
    }

    const rows = [];
    if (keys.top.length > 0) rows.push(boundaryRow('top', keys.top));
    for (const row of contentRows) rows.push(row);
    if (keys.bottom.length > 0) rows.push(boundaryRow('bottom', keys.bottom));

    return {
        rows: rows,
        ids: ids,
        firstContentRow: keys.top.length > 0 ? 1 : 0,
        hasTop: keys.top.length > 0,
        hasBottom: keys.bottom.length > 0
    };
}

/**
 * @brief True when a wire reaching a child box carries on inside it.
 * @param {Object} end - Piece end { kind, id }.
 * @param {string} key - Net key.
 * @returns {boolean} Whether the child routes a piece of the same net.
 */
function continuesInside(end, key) {
    if (end.kind !== 'box' || !ActiveLevels) return false;
    const keys = ActiveLevels.keysByLevel[end.id];
    return !!keys && keys.has(key);
}

/**
 * @brief Turns the pieces one level routes into planSection() connections.
 *
 * A wire that reaches a child box and carries on inside it is marked at that
 * end, so it keeps its own port, never joins a merge bus and takes no arrow.
 *
 * @param {string|null} levelId - Level box id.
 * @param {Object} ids - Net key to boundary node id, from frameBoundaryRows().
 * @param {Function} accept - Returns true for a piece end id this level holds.
 * @returns {Array} Connections keyed by net key.
 */
function boundaryConnections(levelId, ids, accept) {
    console.assert(ids && typeof accept === 'function', 'boundaryConnections needs ids and a filter');
    if (!ActiveLevels || !levelId) return [];

    /**
     * @brief Resolves one piece end to a node id in this level's rows.
     * @param {Object} end - Piece end { kind, id }.
     * @param {string} key - Net key.
     * @returns {string|null} Node id, or null when the level does not hold it.
     */
    function endId(end, key) {
        if (end.kind === 'boundary') return ids[key] || null;
        return accept(end.id) ? end.id : null;
    }

    const connections = [];
    for (const piece of ActiveLevels.byLevel[levelId] || []) {
        const from = endId(piece.from, piece.key);
        const to = endId(piece.to, piece.key);
        if (!from || !to) continue;

        connections.push({
            id: piece.key,
            from: from,
            to: to,
            type: piece.connection.type,
            dashed: !!piece.connection.dashed,
            traceIndex: piece.connection.index,
            continuesFrom: continuesInside(piece.from, piece.key),
            continuesTo: continuesInside(piece.to, piece.key)
        });
    }
    return connections;
}

/**
 * @brief Checks a replanned level still fits the room its box reserved.
 *
 * @param {Object} plan - Result of planSection().
 * @param {Array} gapHeights - Reserved height of each gap.
 * @param {number} width - Reserved content width, or Infinity to skip.
 * @returns {boolean} True when every gap and the width suffice.
 */
function planFits(plan, gapHeights, width) {
    console.assert(plan && Array.isArray(plan.gapTrackCounts), 'planFits needs a plan');
    if (plan.requiredContentWidth > width + 0.5) return false;
    if (plan.gapTrackCounts.length > gapHeights.length) return false;
    return plan.gapTrackCounts.every((tracks, g) =>
        tracks === 0
        || OrcaRouter.gapHeightForTracks(tracks, plan.geometry) <= gapHeights[g] + 0.5);
}

/**
 * @brief Builds the geometry settings one gutter level routes with.
 *
 * @param {Object} style - Style configuration.
 * @returns {Object} Geometry for planSection() and emitSection().
 */
function gutterGeometry(style) {
    return {
        // Row thickness varies box by box at a gutter level, so emitSection()
        // is given the heights directly and this value is never used.
        nodeHeight: 0,
        hTrackPitch: style['line-spacing'] || 15,
        clearance: 10,
        portPitch: 12,
        portInset: 8,
        arrowClearance: 12,
        cornerRadius: style['corner-radius'] !== undefined ? style['corner-radius'] : 4
    };
}

/**
 * @brief Plans one container level, and with it the gutters it has to carry.
 *
 * A container routes among its child boxes exactly as a section routes among
 * its nodes, so the same planSection() does both. A row container gives the
 * router one row of boxes and a channel below it; a column container gives it
 * one box per row and the gaps between them.
 *
 * The result also owns the container's own size, because a gutter has to be as
 * wide as the tracks it carries. The sizing pass and the placement pass both
 * read it, which is what stops them drifting apart.
 *
 * @pre childSizes must come from calculateNodeContentSize() for these children.
 *
 * @param {Object} node - Layout tree node for the container.
 * @param {Array} childSizes - { width, height } of each child, in order.
 * @param {Object} style - Style configuration.
 * @returns {Object} Layout and plan for this level, described field by field
 *                   in the object literal below.
 */
function getGutterPlan(node, childSizes, style) {
    console.assert(childSizes.length > 0, 'a container must have children');

    const levelBox = ActiveLevels ? ActiveLevels.tree.byNode.get(node) : null;
    const cacheKey = levelBox ? levelBox.id : null;
    if (cacheKey && GutterPlanCache[cacheKey]) return GutterPlanCache[cacheKey];

    const direction = node.direction || 'row';
    const geometry = gutterGeometry(style);
    const childIds = childSizes.map((_, i) => levelBox ? levelBox.children[i].id : 'child' + i);
    const childIndex = {};
    childIds.forEach((id, i) => { childIndex[id] = i; });

    // A wire that skips a row has to pass beside the boxes between, and a
    // column of boxes fills the level's width, so the room has to be reserved.
    // A boundary sits outside every row, above the first or below the last.
    let sideChannel = 0;
    if (direction === 'column' && cacheKey) {
        const sides = ActiveLevels.sides[cacheKey] || {};
        let skipping = 0;

        /**
         * @brief Column row of one piece end.
         * @param {Object} end - Piece end { kind, id }.
         * @param {string} key - Net key.
         * @returns {number} Row index, with boundaries outside the column.
         */
        function rowOfEnd(end, key) {
            if (end.kind === 'boundary') return sides[key] === 'top' ? -1 : childSizes.length;
            return childIndex[end.id];
        }

        for (const piece of ActiveLevels.byLevel[cacheKey] || []) {
            const a = rowOfEnd(piece.from, piece.key);
            const b = rowOfEnd(piece.to, piece.key);
            if (a !== undefined && b !== undefined && Math.abs(a - b) > 1) skipping++;
        }
        if (skipping > 0) {
            // WHY: the corridor is the channel less one clearance, and it has
            // to hold one pitch more than its tracks. Sized at two clearances
            // plus the tracks it came out 4px short, below one usable track,
            // so every crossing fell back to the left channel at a squeezed
            // pitch.
            sideChannel = geometry.clearance + (skipping + 1) * OrcaRouter.DEFAULT_GEOMETRY.vTrackPitch;
        }
    }

    const childOffsets = [];
    const childWidths = [];
    const contentRowHeights = [];
    let contentRows = [];
    let contentWidth = 0;

    if (direction === 'row') {
        const boxes = [];
        let cursor = sideChannel;

        childSizes.forEach((size, i) => {
            childOffsets.push(cursor);
            childWidths.push(size.width);
            boxes.push({ id: childIds[i], centreX: cursor + size.width / 2, width: size.width });
            cursor += size.width + LAYOUT_GUTTER;
        });

        contentRows = [{ nodes: boxes }];
        contentRowHeights.push(Math.max(...childSizes.map(s => s.height)));
        contentWidth = cursor - LAYOUT_GUTTER + sideChannel;
    } else {
        const columnWidth = Math.max(...childSizes.map(s => s.width));

        contentRows = childSizes.map((size, i) => {
            childOffsets.push(sideChannel);
            childWidths.push(columnWidth);
            contentRowHeights.push(size.height);
            return {
                nodes: [{ id: childIds[i], centreX: sideChannel + columnWidth / 2, width: columnWidth }]
            };
        });
        contentWidth = columnWidth + sideChannel * 2;
    }

    /**
     * @brief Plans the level with its boundary ports at the given Xs.
     * @param {Object} hints - Net key to fixed boundary port X, may be empty.
     * @returns {Object} { plan, framed }, where plan is null with no nets.
     */
    function planWith(hints) {
        const framed = frameBoundaryRows(cacheKey, contentRows, contentWidth, hints);
        const connections = boundaryConnections(cacheKey, framed.ids,
            id => childIndex[id] !== undefined);
        if (connections.length === 0) return { plan: null, framed: framed };

        const plan = OrcaRouter.planSection({
            rows: framed.rows,
            connections: connections,
            bounds: { minX: 0, maxX: contentWidth },
            geometry: geometry
        });
        return { plan: plan, framed: framed };
    }

    const planned = planWith((cacheKey && BoundaryHints[cacheKey]) || {});
    const plan = planned.plan;
    const framed = planned.framed;
    const rowCount = framed.rows.length;

    const rowHeights = [];
    for (let r = 0; r < rowCount; r++) {
        const c = r - framed.firstContentRow;
        rowHeights.push(c >= 0 && c < contentRows.length ? contentRowHeights[c] : 0);
    }

    // One gap below every row but the last, plus a trailing one when a wire
    // between two boxes of the same row has to run under them.
    const gapCount = plan && plan.hasTrailingGap ? rowCount : rowCount - 1;
    const gapHeights = [];
    for (let g = 0; g < gapCount; g++) {
        const tracks = plan && plan.gapTrackCounts ? (plan.gapTrackCounts[g] || 0) : 0;
        const needed = tracks > 0 ? OrcaRouter.gapHeightForTracks(tracks, geometry) : 0;
        gapHeights.push(Math.max(LAYOUT_GUTTER, needed));
    }

    // Row tops and the level's own height come out of the same walk, so the
    // height reserved is exactly the height the boxes and wires occupy.
    const rowOffsets = [];
    let cursorY = 0;
    for (let i = 0; i < rowCount; i++) {
        rowOffsets.push(cursorY);
        cursorY += rowHeights[i] + (gapHeights[i] || 0);
    }

    const bundle = {
        levelId: cacheKey,
        direction: direction,
        sideChannel: sideChannel,
        childOffsets: childOffsets,
        childWidths: childWidths,
        rowOffsets: rowOffsets,
        rowHeights: rowHeights,
        gapHeights: gapHeights,
        firstContentRow: framed.firstContentRow,
        hasBoundary: framed.hasTop || framed.hasBottom,
        contentWidth: contentWidth,
        contentHeight: cursorY,
        geometry: geometry,
        plan: plan,
        // Routes the level again once the level above has fixed its boundary
        // port Xs. The rows keep their shape, so the reserved room applies.
        replan: hints => planWith(hints).plan
    };

    if (cacheKey) GutterPlanCache[cacheKey] = bundle;
    return bundle;
}

/**
 * @brief Finds the gap height that every section in the diagram should use.
 *
 * Rows line up across the whole page only when every gap is the same height,
 * so the densest gap anywhere sets the pitch for all of them.
 *
 * @param {Object} layoutTree - Parsed layout tree.
 * @param {Object} nodesData - Parsed nodes data.
 * @param {Object} style - Style configuration.
 * @returns {number} Uniform gap height in pixels.
 */
function calculateUniformGapHeight(layoutTree, nodesData, style) {
    let tallest = 0;

    /**
     * @brief Visits one layout node, recording the gap height it needs.
     * @param {Object} node - Layout tree node.
     * @param {string} parentName - Enclosing segment name, for section lookup.
     * @returns {void}
     */
    function visit(node, parentName) {
        if (!node) return;

        if (node.children && node.children.length > 0) {
            const childParent = node.type === 'segment' ? node.name : parentName;
            for (const child of node.children) visit(child, childParent);
            return;
        }

        if (node.type !== 'segment') return;

        let sectionKey = parentName ? parentName + ':' + node.name : node.name;
        if (!nodesData.sections[sectionKey] && parentName) sectionKey = node.name;
        if (!nodesData.sections[sectionKey]) return;

        const bundle = getSectionPlan(nodesData, sectionKey, style, 0);
        if (bundle) tallest = Math.max(tallest, bundle.gapHeight);
    }

    visit(layoutTree, null);
    return tallest;
}

// =============================================================================
// 7. SECTION RENDERING
// =============================================================================

/**
 * @brief Renders one section's nodes and wires from its plan.
 *
 * The plan is built in section-local coordinates, so everything is translated
 * by a single offset here. Content narrower than its box is centred, which
 * keeps node columns lining up between sections of the same content width.
 *
 * @pre bundle must come from getSectionPlan().
 *
 * @param {Object} bundle - Plan bundle for the section.
 * @param {Object} bounds - Section content box { x, y, width, height }.
 * @param {Object} edges - Page Y { top, bottom } of the section box edges.
 * @param {Object} style - Style configuration.
 * @param {string} color - Stroke colour for this section.
 * @returns {string} SVG markup for the section's nodes and wires.
 */
function renderSection(bundle, bounds, edges, style, color) {
    const { sectionLayout, plan, nodeHeight } = bundle;
    console.assert(bundle.rowOffsets.length === plan.rows.length, 'one offset per plan row');
    const offsetX = sectionOriginX(bundle, bounds);

    // Plan rows include any boundary rows; node rows start after the top one.
    const planRowTops = bundle.rowOffsets.map(offset => bounds.y + offset);
    const rowTops = sectionLayout.rows.map((_, i) => planRowTops[bundle.firstContentRow + i]);

    const emitted = OrcaRouter.emitSection(plan, planRowTops, bundle.rowHeights);
    stretchBoundaryEnds(emitted, plan, edges);

    // Record the no-overlap check so the headless harness can assert on the
    // real render rather than only on fixtures. Both checks are quadratic in
    // the segment count, so they stay off unless a harness asks for them by
    // setting window.ORCA_VERIFY before generating.
    if (typeof window !== 'undefined' && window.ORCA_VERIFY) {
        if (!window.OrcaCheck) window.OrcaCheck = { sections: [] };
        const nodeBoxes = [];
        sectionLayout.rows.forEach((row, i) => {
            for (const node of row.nodes) {
                nodeBoxes.push({
                    id: node.id,
                    x0: node.localX - node.pixelWidth / 2,
                    y0: rowTops[i],
                    x1: node.localX + node.pixelWidth / 2,
                    y1: rowTops[i] + nodeHeight
                });
            }
        });
        window.OrcaCheck.sections.push({
            section: bundle.sectionKey,
            nets: plan.nets.length,
            tracksPerGap: plan.gapTrackCounts,
            overlaps: OrcaRouter.findOverlaps(emitted.segments, 1.0).length,
            nodeHits: OrcaRouter.findNodeCollisions(emitted.segments, nodeBoxes, 1.0).length
        });
        recordJoinEnds(emitted, plan, offsetX, () => false);
    }

    const lineThickness = style['line-thickness'] || 2;
    const cornerRadius = plan.geometry.cornerRadius;
    const arrowSize = 8;
    const junctionRadius = 4;

    const colourOf = wireColourLookup(plan, color);
    let svg = '<g transform="translate(' + offsetX + ',0)">';

    for (const line of emitted.polylines) {
        const d = OrcaRouter.pathData(line.points, cornerRadius);
        svg += '<path d="' + d + '" fill="none" stroke="' + colourOf(line.netId) + '"'
            + ' stroke-width="' + lineThickness + '"'
            + ' stroke-linecap="round" stroke-linejoin="round"'
            + (line.dashed ? ' stroke-dasharray="5,5"' : '') + '/>';
    }

    for (const dot of emitted.junctions) {
        svg += '<circle cx="' + dot.x + '" cy="' + dot.y + '" r="' + junctionRadius
            + '" fill="' + colourOf('bus:' + dot.busKey) + '"/>';
    }

    for (const arrow of emitted.arrows) {
        svg += renderArrow(arrow.x, arrow.y, arrow.direction, colourOf(arrow.netId), arrowSize);
    }

    svg += '</g>';

    svg += renderSectionNodes(sectionLayout, rowTops, offsetX, nodeHeight, style, color);
    return svg;
}

/**
 * @brief Draws the node boxes of a section.
 *
 * @param {Object} sectionLayout - Layout with rows of nodes.
 * @param {Array} rowTops - Pixel Y of each row's top edge.
 * @param {number} offsetX - Translation from section-local X to page X.
 * @param {number} nodeHeight - Shared node height.
 * @param {Object} style - Style configuration.
 * @param {string} color - Stroke colour.
 * @returns {string} SVG markup for the boxes and their text.
 */
function renderSectionNodes(sectionLayout, rowTops, offsetX, nodeHeight, style, color) {
    let svg = '';
    const fontSize = style['font-size'] || 14;

    sectionLayout.rows.forEach((row, rowIndex) => {
        const top = rowTops[rowIndex];

        for (const node of row.nodes) {
            const width = node.pixelWidth;
            const left = offsetX + node.localX - width / 2;

            svg += '<rect x="' + left + '" y="' + top + '" width="' + width
                + '" height="' + nodeHeight + '"'
                + ' rx="' + style['node-radius'] + '" ry="' + style['node-radius'] + '"'
                + ' fill="#ffffff" stroke="' + color + '"'
                + ' stroke-width="' + style['node-border'] + '"/>';

            const textX = offsetX + node.localX;
            const nameY = top + (node.hint ? nodeHeight / 2 - 5 : nodeHeight / 2 + fontSize / 2 - 1);
            const displayName = style.uppercase ? node.name.toUpperCase() : node.name;

            svg += '<text x="' + textX + '" y="' + nameY + '" class="node-text">'
                + displayName + '</text>';

            if (node.hint) {
                svg += '<text x="' + textX + '" y="' + (top + nodeHeight / 2 + 12)
                    + '" class="hint-text">' + node.hint + '</text>';
            }
        }
    });

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
 * @brief Plans the whole diagram, before anything is drawn.
 *
 * The passes run in the one order that has no circular dependency. Nets are
 * decomposed first because that needs no geometry, then every leaf section is
 * planned, then the page is sized from those plans, then every box is placed.
 * Emission comes afterwards, because a boundary port sits on a box edge and
 * its X is an input to the plans on both sides of it.
 *
 * @param {Object} style - Style configuration.
 * @param {Object} layout - Parsed layout tree, may be null.
 * @param {Object} nodesData - Parsed nodes and connections.
 * @returns {Object} { margin, contentSize, levels, placement, themeColors }.
 */
function planDiagram(style, layout, nodesData) {
    console.assert(style && nodesData, 'planDiagram needs a style and parsed nodes');

    resetSectionPlans();
    if (typeof window !== 'undefined' && window.ORCA_VERIFY) window.OrcaCheck = { sections: [] };

    const margin = parsePadding(style['page-margin']);
    const themeColors = Themes[style.theme] || Themes.default;

    // Pass 1. Split every net that crosses a box edge into per-level pieces.
    // The gutter planner reads these, and sizing reads the gutter plans, so
    // this has to be in place before anything is measured.
    const levels = planLevels(layout, nodesData);
    ActiveLevels = levels;

    // Passes 2 to 5 repeat until the boxes agree. Sizing is bottom-up and a
    // boundary port's X is decided top-down, so each round sizes with the
    // port Xs the previous round's join fixed. The first round uses ports
    // spread along each edge, which is usually close enough to fit at once.
    BoundaryHints = {};
    let contentSize = { width: 400, height: 300 };
    let placement = null;
    let fitted = true;

    for (let pass = 0; pass < MAX_JOIN_PASSES; pass++) {
        if (pass > 0) resetSectionPlans();

        // Pass 2. Plan every leaf section. The densest row gap in the diagram
        // sets the pitch for all of them, which is what lines the rows up.
        ActiveGapHeight = layout ? calculateUniformGapHeight(layout, nodesData, style) : 0;

        // Pass 3. Size the page from those plans rather than from a paper size.
        if (layout) contentSize = calculateNodeContentSize(layout, nodesData, style);

        // Pass 4. Place every box, which fixes where each boundary port sits.
        placement = placeLayout(layout, { x: margin.left, y: margin.top },
            contentSize, style, themeColors, nodesData);
        if (!placement) break;

        // Pass 5. Walk down from the root and route every level to the port
        // Xs its parent chose, so the pieces of one wire meet. When the result
        // still fits the room reserved for it, the plan is final.
        const joined = joinBoundaries(placement);
        fitted = joined.fits;
        if (joined.fits) break;
        BoundaryHints = joined.hints;
    }

    // The wires still join when the rounds run out, but some level is routed
    // into less room than it needs, so say so rather than draw it silently.
    if (placement && !fitted) {
        if (typeof window !== 'undefined' && window.ORCA_VERIFY) window.OrcaCheck.unfitted = true;
        levels.errors.push('Some wires between boxes need more room than the layout settled on, '
            + 'so they may sit close together.');
    }

    return {
        margin: margin,
        contentSize: contentSize,
        levels: levels,
        placement: placement,
        themeColors: themeColors
    };
}

/**
 * @brief Picks the palette `line-theme` names, or null for box colours.
 *
 * `true` and `box` keep wires in their box colour, which is the default.
 * `custom` reads the hex colours listed in `line-palette`.
 *
 * @param {Object} style - Style configuration.
 * @param {Array} errors - Parse errors, appended to.
 * @returns {Array|null} Palette, or null when wires take box colours.
 */
function lineThemePalette(style, errors) {
    const name = String(style['line-theme']).trim();
    if (name === 'true' || name === 'box') return null;

    if (name === 'custom') {
        const listed = String(style['line-palette'] || '').split(',').map(c => c.trim());
        const palette = listed.filter(c => OrcaTraces.isHexColour(c));
        for (const bad of listed.filter(c => c && !OrcaTraces.isHexColour(c))) {
            errors.push("line-palette entry '" + bad + "' is not a hex colour such as #e6194b.");
        }
        if (palette.length > 0) return palette;
        errors.push('line-theme: custom needs line-palette with at least one hex colour.');
        return null;
    }

    if (Themes[name]) return Themes[name];
    errors.push("line-theme '" + name + "' is not one of box, custom, "
        + Object.keys(Themes).join(', ') + '.');
    return null;
}

/**
 * @brief Colours every connection by trace for the opt-in `line-theme`.
 *
 * Runs after planning, so it reads the merge buses every level chose and
 * changes no geometry. Members of one bus become one trace.
 *
 * @param {Object} style - Style configuration.
 * @param {Object} placement - { order } from placeLayout(), may be null.
 * @param {Object} nodesData - Parsed nodes; errors are appended to it.
 * @returns {Array|null} Colour per connection index, or null for box colours.
 */
function planTraceColours(style, placement, nodesData) {
    const palette = lineThemePalette(style, nodesData.errors);
    const overrides = {};
    for (const conn of nodesData.connections) {
        if (conn.colour) overrides[conn.index] = conn.colour;
    }
    if (!palette && Object.keys(overrides).length === 0) return null;

    const links = [];
    for (const box of (placement && placement.order) || []) {
        const plans = [box.bundle && box.bundle.plan, box.gutter && box.gutter.plan];
        for (const plan of plans) {
            if (!plan) continue;
            for (const key in plan.buses) {
                const members = plan.buses[key].members;
                for (let i = 1; i < members.length; i++) {
                    links.push([members[0].traceIndex, members[i].traceIndex]);
                }
            }
        }
    }

    const traces = OrcaTraces.groupTraces(nodesData.connections.length, links);
    // An override alone colours its own trace and leaves the rest in a
    // neutral stroke, since there is no box colour to fall back on per trace.
    const result = OrcaTraces.assignColours(traces, palette || [null], overrides);
    for (const conflict of result.conflicts) {
        nodesData.errors.push('Wires sharing one bus asked for ' + conflict.kept + ' and '
            + conflict.dropped + '. Kept ' + conflict.kept + '.');
    }
    return result.colours;
}

/**
 * @brief Builds the per-wire colour lookup for one plan.
 * @param {Object} plan - Result of planSection().
 * @param {string} fallback - Colour for a wire with no trace colour.
 * @returns {Function} (netId) -> colour, where netId may be 'bus:<key>'.
 */
function wireColourLookup(plan, fallback) {
    if (!ActiveTraceColours) return () => fallback;
    const byNet = {};
    for (const net of plan.nets) {
        const colour = ActiveTraceColours[net.traceIndex];
        if (colour) byNet[net.id] = colour;
    }
    const traceOf = {};
    for (const net of plan.nets) traceOf[net.id] = net.traceIndex;
    const verify = typeof window !== 'undefined' && window.ORCA_VERIFY;

    return netId => {
        let id = netId;
        if (typeof netId === 'string' && netId.startsWith('bus:')) {
            const bus = plan.buses[netId.slice(4)];
            id = bus ? bus.members[0].id : null;
        }
        const colour = byNet[id] || fallback;
        // The harness asserts every drawn part of one trace has one colour.
        if (verify && traceOf[id] !== undefined) {
            if (!window.OrcaCheck.traceColours) window.OrcaCheck.traceColours = [];
            window.OrcaCheck.traceColours.push([traceOf[id], colour]);
        }
        return colour;
    };
}

/**
 * @brief Renders the diagram to SVG from its plan.
 *
 * The diagram is sized to fit its content, not a fixed page size, which keeps
 * it compact enough for a document or an article.
 *
 * @param {Object} style - Style configuration.
 * @param {Object} layout - Layout tree.
 * @param {Object} nodesData - Parsed nodes and connections.
 * @returns {string} SVG markup string.
 */
function renderDiagram(style, layout, nodesData) {
    const plan = planDiagram(style, layout, nodesData);
    LastDiagramPlan = plan;
    ActiveTraceColours = planTraceColours(style, plan.placement, nodesData);

    const margin = plan.margin;
    const themeColors = plan.themeColors;
    const width = plan.contentSize.width;
    const height = plan.contentSize.height;
    const totalWidth = width + margin.left + margin.right;
    const totalHeight = height + margin.top + margin.bottom;

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

    // Emit the placed boxes. Every wire, inside a section or across boxes,
    // is drawn by the level that routes it.
    if (plan.placement) {
        svg += emitPlacement(plan.placement, style, themeColors);
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
    // The same three values the placement pass uses. Written once, because a
    // sizing pass and a placement pass that disagree leave wires outside the
    // box they belong to.
    const padding = LAYOUT_PADDING;
    const labelHeight = SECTION_LABEL_HEIGHT;
    const sectionPadding = SECTION_BOTTOM_PADDING;

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
            // Nested children. The gutter plan owns the size, because a gutter
            // has to be as wide as the tracks it carries.
            const childSizes = node.children.map(child =>
                calculateNodeContentSize(child, nodesData, style, node.name)
            );
            const gutter = getGutterPlan(node, childSizes, style);

            return {
                width: gutter.contentWidth + padding * 2,
                height: gutter.contentHeight + labelHeight + padding
            };
        } else {
            // Leaf segment - calculate based on nodes
            let sectionKey = parentName ? `${parentName}:${node.name}` : node.name;
            if (!nodesData.sections[sectionKey] && parentName) {
                sectionKey = node.name;
            }

            const section = nodesData.sections[sectionKey];
            if (section) {
                // The plan owns the content size, so the height reserved here
                // is exactly the height the wires will occupy.
                const bundle = getSectionPlan(nodesData, sectionKey, style, ActiveGapHeight);
                if (bundle) {
                    return { width: bundle.contentWidth, height: bundle.totalHeight };
                }
            }

            // Default for empty sections
            return { width: 150, height: labelHeight + nodeHeightNoHint + sectionPadding };
        }
    } else if (node.type === 'container') {
        const childSizes = node.children.map(child =>
            calculateNodeContentSize(child, nodesData, style, parentName)
        );
        const gutter = getGutterPlan(node, childSizes, style);

        return { width: gutter.contentWidth, height: gutter.contentHeight };
    }

    return { width: 100, height: 60 };
}

/**
 * @brief Creates an unplaced box record for one layout tree node.
 *
 * @param {Object} node - Layout tree node.
 * @param {number} x - Page X of the box's left edge.
 * @param {number} y - Page Y of the box's top edge.
 * @param {number} width - Box width in pixels.
 * @param {number} height - Box height in pixels.
 * @returns {Object} A placed box, with its contents still to be filled in.
 */
function newPlacedBox(node, x, y, width, height) {
    console.assert(node && node.type, 'a layout node must carry a type');
    console.assert(width >= 0 && height >= 0, 'a box cannot have negative size');

    return {
        type: node.type,
        name: node.name || null,
        level: ActiveLevels ? (ActiveLevels.tree.byNode.get(node) || null) : null,
        direction: node.direction || 'row',
        x: x,
        y: y,
        width: width,
        height: height,
        color: null,
        sectionKey: null,
        bundle: null,
        bounds: null,
        gutter: null,
        children: []
    };
}

/**
 * @brief Attaches the section plan a leaf segment draws from.
 *
 * The section key is resolved the way the parser writes it, preferring the
 * parent-qualified form and falling back to the bare name.
 *
 * @param {Object} box - Placed box to fill in.
 * @param {Object} node - Layout tree node for that box.
 * @param {Object} inner - Content rectangle { x, y, width, height }.
 * @param {Object} style - Style configuration.
 * @param {Object} nodesData - Parsed nodes and connections data.
 * @param {string} parentName - Enclosing segment name, or null.
 * @returns {void}
 */
function attachSectionPlan(box, node, inner, style, nodesData, parentName) {
    console.assert(box.type === 'segment', 'only a segment owns a section');
    console.assert(nodesData && nodesData.sections, 'nodesData must be parsed');

    let sectionKey = parentName ? parentName + ':' + node.name : node.name;
    if (!nodesData.sections[sectionKey] && parentName) sectionKey = node.name;
    if (!nodesData.sections[sectionKey]) return;

    const bundle = getSectionPlan(nodesData, sectionKey, style, ActiveGapHeight);
    if (!bundle) return;

    box.sectionKey = sectionKey;
    box.bounds = inner;
    box.bundle = bundle;
}

/**
 * @brief Lays a container's children out along its direction.
 *
 * Every position comes from the container's gutter plan, which the sizing pass
 * read too. One plan serving both is what stops the space reserved for a
 * gutter and the space given to it from drifting apart.
 *
 * @pre The layout node must be the one that owns these children.
 *
 * @param {Object} node - Layout tree node for the container.
 * @param {Array} children - Child layout nodes.
 * @param {Object} inner - Content rectangle to lay out within.
 * @param {Object} style - Style configuration.
 * @param {number} colorIndex - Colour index of the first child.
 * @param {Object} nodesData - Parsed nodes and connections data.
 * @param {string} parentName - Enclosing segment name, or null.
 * @returns {Object} { items, gutter } where items are stack entries
 *                   { node, box, colorIndex, parentName } in drawing order.
 */
function placeLayoutChildren(node, children, inner, style, colorIndex, nodesData, parentName) {
    console.assert(children.length > 0, 'placeLayoutChildren needs children');

    const sizes = children.map(child =>
        calculateNodeContentSize(child, nodesData, style, parentName)
    );
    const gutter = getGutterPlan(node, sizes, style);
    const placed = [];

    children.forEach((child, i) => {
        const rowIdx = gutter.firstContentRow + (gutter.direction === 'row' ? 0 : i);
        placed.push({
            node: child,
            box: newPlacedBox(child,
                inner.x + gutter.childOffsets[i],
                inner.y + gutter.rowOffsets[rowIdx],
                gutter.childWidths[i],
                gutter.rowHeights[rowIdx]),
            colorIndex: colorIndex + i,
            parentName: parentName
        });
    });

    return { items: placed, gutter: gutter };
}

/**
 * @brief Places every box on the page without emitting any SVG.
 *
 * This is the plan phase's placement pass. Nothing may be drawn until it has
 * finished, because a boundary port sits on a box edge and its X is an input
 * to the plans on both sides of the gutter it crosses.
 *
 * Walked with an explicit stack rather than by recursion, per P10 rule 1.
 * Children are pushed in reverse so the stack pops them in drawing order,
 * which makes `order` a depth-first pre-order: every box after the box it
 * sits inside.
 *
 * @pre ActiveGapHeight must already hold the diagram's uniform gap height.
 *
 * @param {Object} layoutTree - Parsed layout tree, may be null.
 * @param {Object} origin - Page position { x, y } of the root box.
 * @param {Object} size - Root box size { width, height }.
 * @param {Object} style - Style configuration.
 * @param {Array} themeColors - Theme colour palette.
 * @param {Object} nodesData - Parsed nodes and connections data.
 * @returns {Object|null} { root, order }, or null when there is no layout.
 */
function placeLayout(layoutTree, origin, size, style, themeColors, nodesData) {
    if (!layoutTree) return null;
    console.assert(themeColors && themeColors.length > 0, 'a theme needs colours');
    console.assert(size.width > 0 && size.height > 0, 'the page needs a size');

    const root = newPlacedBox(layoutTree, origin.x, origin.y, size.width, size.height);
    const order = [];
    const stack = [{ node: layoutTree, box: root, colorIndex: 0, parentName: null }];
    let guard = 0;

    while (stack.length > 0 && guard < MAX_LAYOUT_NODES) {
        guard++;
        const item = stack.pop();
        const node = item.node;
        const box = item.box;
        order.push(box);

        let inner = { x: box.x, y: box.y, width: box.width, height: box.height };
        let childColorIndex = item.colorIndex;
        let childParentName = item.parentName;

        if (node.type === 'segment') {
            box.color = themeColors[item.colorIndex % themeColors.length];
            inner = {
                x: box.x + LAYOUT_PADDING,
                y: box.y + SECTION_LABEL_HEIGHT,
                width: box.width - LAYOUT_PADDING * 2,
                height: box.height - SECTION_LABEL_HEIGHT - LAYOUT_PADDING
            };
            childColorIndex = item.colorIndex + 1;
            childParentName = node.name;
        }

        const children = node.children || [];
        if (children.length > 0) {
            const laid = placeLayoutChildren(node, children, inner, style,
                childColorIndex, nodesData, childParentName);
            box.children = laid.items.map(entry => entry.box);
            box.gutter = laid.gutter;
            box.bounds = inner;
            for (let i = laid.items.length - 1; i >= 0; i--) stack.push(laid.items[i]);
            continue;
        }

        if (node.type === 'segment' && nodesData) {
            attachSectionPlan(box, node, inner, style, nodesData, item.parentName);
        }
    }

    console.assert(guard < MAX_LAYOUT_NODES, 'layout placement hit its bound');
    return { root: root, order: order };
}

/**
 * @brief Page X of the origin a placed box's plan is drawn from.
 *
 * A section narrower than its box is centred in it, exactly as renderSection()
 * draws it, and a container's gutter starts at its content edge.
 *
 * @param {Object} box - Placed box with bounds set.
 * @returns {number} Page X of local X zero.
 */
function planOriginX(box) {
    console.assert(box.bounds, 'a planned box must have content bounds');
    if (box.bundle) return sectionOriginX(box.bundle, box.bounds);
    return box.bounds.x;
}

/**
 * @brief Page X of a section's local X zero, centred in its content box.
 *
 * The one place this is computed. The join walk and renderSection() must
 * agree on it exactly, or every wire crossing the section's edge breaks.
 *
 * @param {Object} bundle - Section plan bundle.
 * @param {Object} bounds - Section content box { x, width }.
 * @returns {number} Page X.
 */
function sectionOriginX(bundle, bounds) {
    console.assert(bundle.contentWidth > 0, 'a section needs a width');
    return bounds.x + Math.max(0, (bounds.width - bundle.contentWidth) / 2);
}

/**
 * @brief Routes every level to the boundary port Xs its parent chose.
 *
 * Boxes are visited parents first, which is the order placement records them
 * in. Each container's final plan fixes where every wire meets each child
 * box's edge, and that X, in the child's own space, is what the child routes
 * to when its turn comes. Box sizes are not touched, so the result is joined
 * whether or not it fits; the caller sizes again when it does not.
 *
 * @pre placement must come from placeLayout() in this round.
 *
 * @param {Object} placement - { root, order } from placeLayout().
 * @returns {Object} { hints, fits } where hints is the port X per level and
 *                   net, and fits is false if any level outgrew its room.
 */
function joinBoundaries(placement) {
    console.assert(placement && Array.isArray(placement.order), 'joinBoundaries needs a placement');

    const hints = {};
    let fits = true;

    for (const box of placement.order) {
        if (!box.level) continue;
        const own = hints[box.level.id] || {};

        if (box.bundle && box.bundle.hasBoundary) {
            const plan = box.bundle.replan(own);
            fits = fits && planFits(plan, box.bundle.gapHeights, box.bundle.contentWidth);
            box.bundle = Object.assign({}, box.bundle, { plan: plan });
            continue;
        }

        if (!box.gutter || !box.gutter.plan) continue;
        if (box.gutter.hasBoundary) {
            const plan = box.gutter.replan(own);
            fits = fits && planFits(plan, box.gutter.gapHeights, Infinity);
            box.gutter = Object.assign({}, box.gutter, { plan: plan });
        }

        // Hand each wire's crossing point down to the child box it enters.
        const childById = {};
        for (const child of box.children) {
            if (child.level) childById[child.level.id] = child;
        }
        const origin = planOriginX(box);
        for (const net of box.gutter.plan.nets) {
            for (const [nodeId, x] of [[net.from, net.sourceX], [net.to, net.targetX]]) {
                const child = childById[nodeId];
                if (!child || !child.bounds) continue;
                if (!hints[nodeId]) hints[nodeId] = {};
                hints[nodeId][net.id] = origin + x - planOriginX(child);
            }
        }
    }

    return { hints: hints, fits: fits };
}

/**
 * @brief Stretches wires that end on a boundary row out to the box edge.
 *
 * A boundary row sits on the inside of the box's label strip or padding, so
 * the wire stops short of the edge where the level above picks it up. Only
 * the end stub moves, and it is vertical, so the path keeps its shape.
 *
 * @param {Object} emitted - Result of OrcaRouter.emitSection(), mutated.
 * @param {Object} plan - The plan it was emitted from.
 * @param {Object} edges - Page Y { top, bottom } of the box edges.
 * @returns {void}
 */
function stretchBoundaryEnds(emitted, plan, edges) {
    console.assert(edges && typeof edges.top === 'number', 'edges must give a top');

    const byId = {};
    for (const net of plan.nets) byId[net.id] = net;

    for (const line of emitted.polylines) {
        const net = byId[line.netId];
        if (!net) continue;
        if (net.source.boundary) {
            line.points[0].y = net.sourceRow === 0 ? edges.top : edges.bottom;
        }
        if (net.target.boundary) {
            line.points[line.points.length - 1].y = net.targetRow === 0 ? edges.top : edges.bottom;
        }
    }

    // Rebuild the checked segments from the stretched paths.
    emitted.segments = [];
    for (const line of emitted.polylines) {
        for (let i = 0; i + 1 < line.points.length; i++) {
            const a = line.points[i];
            const b = line.points[i + 1];
            emitted.segments.push({
                netId: line.netId,
                orientation: Math.abs(a.y - b.y) < 1e-6 ? 'h' : 'v',
                x1: a.x, y1: a.y, x2: b.x, y2: b.y,
                dashed: line.dashed
            });
        }
    }
}

/**
 * @brief Records where a level's wires meet box edges, for the join check.
 *
 * Every wire that ends on a boundary row has to meet a wire the level above
 * ends on that box's edge, at the same point. Only the harness asks.
 *
 * @param {Object} emitted - Emitted, stretched geometry in local X.
 * @param {Object} plan - The plan it was emitted from.
 * @param {number} originX - Page X of local X zero.
 * @param {Function} continues - Returns true for a node id whose wire carries
 *                               on inside that box.
 * @returns {void}
 */
function recordJoinEnds(emitted, plan, originX, continues) {
    if (typeof window === 'undefined' || !window.ORCA_VERIFY || !window.OrcaCheck) return;
    if (!window.OrcaCheck.joinEnds) window.OrcaCheck.joinEnds = { boundary: [], box: [] };

    const byId = {};
    for (const net of plan.nets) byId[net.id] = net;

    for (const line of emitted.polylines) {
        const net = byId[line.netId];
        if (!net) continue;
        const first = line.points[0];
        const last = line.points[line.points.length - 1];
        for (const [node, point] of [[net.source, first], [net.target, last]]) {
            const end = { key: net.id, x: originX + point.x, y: point.y };
            if (node.boundary) window.OrcaCheck.joinEnds.boundary.push(end);
            else if (continues(node.id, net.id)) window.OrcaCheck.joinEnds.box.push(end);
        }
    }
}

/**
 * @brief Counts boundary ends with no partner across the box edge.
 * @returns {void}
 */
function checkJoins() {
    if (typeof window === 'undefined' || !window.ORCA_VERIFY || !window.OrcaCheck) return;
    const ends = window.OrcaCheck.joinEnds || { boundary: [], box: [] };

    /**
     * @brief Counts entries of one list with no match in the other.
     * @param {Array} list - Ends to look up.
     * @param {Array} other - Ends to match against.
     * @returns {number} Unmatched count.
     */
    function unmatched(list, other) {
        return list.filter(a => !other.some(b =>
            b.key === a.key && Math.abs(b.x - a.x) < 1 && Math.abs(b.y - a.y) < 1)).length;
    }

    window.OrcaCheck.joins = {
        ends: ends.boundary.length,
        unjoined: unmatched(ends.boundary, ends.box) + unmatched(ends.box, ends.boundary)
    };
}

/**
 * @brief Escapes text for use inside SVG markup or an attribute value.
 * @param {*} value - Value to escape.
 * @returns {string} Text with &, <, >, " and ' replaced by entities.
 */
function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @brief Emits the SVG for a placement, boxes first and contents after.
 *
 * This is the whole emit phase for the box tree. It reads the placement and
 * decides nothing, so every position it draws was fixed by the plan phase.
 *
 * @pre placement must come from placeLayout().
 *
 * @param {Object} placement - { root, order } from placeLayout().
 * @param {Object} style - Style configuration.
 * @param {Array} themeColors - Theme colour palette.
 * @returns {string} SVG markup for every segment box, label and section.
 */
function emitPlacement(placement, style, themeColors) {
    if (!placement) return '';
    console.assert(Array.isArray(placement.order), 'a placement must carry an order');

    let svg = '';
    let labels = '';

    for (const box of placement.order) {
        if (box.type !== 'segment') continue;

        svg += `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"
            rx="${style['section-radius']}" ry="${style['section-radius']}"
            fill="#ffffff" stroke="${box.color}" stroke-width="${style['section-border']}"/>`;

        // A wire entering through the top edge passes the label, so labels go
        // on last over a backing that breaks the wire rather than the text.
        // The width is estimated, because nothing here can measure text.
        if (box.name) {
            const labelText = style.uppercase ? box.name.toUpperCase() : box.name;
            const centerX = box.x + box.width / 2;
            // WHY: a style value is any string the user typed, and this one
            // lands in markup, so it must be a number before it gets there.
            const fontSize = Number(style['font-size']);
            const labelSize = (Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14) + 2;
            const backing = labelText.length * labelSize * 0.62 + 12;
            labels += `<rect x="${centerX - backing / 2}" y="${box.y + 6}" width="${backing}"
                height="${labelSize + 4}" fill="#ffffff"/>`;
            labels += `<text x="${centerX}" y="${box.y + 20}" class="section-label" fill="${box.color}">
                ${escapeXml(labelText)}
            </text>`;
        }

        if (box.bundle) {
            const edges = { top: box.y, bottom: box.y + box.height };
            svg += renderSection(box.bundle, box.bounds, edges, style, box.color);
        }
    }

    // Gutters go on last so a wire between two boxes is not hidden under the
    // box drawn after it.
    for (const box of placement.order) {
        if (box.gutter) svg += renderGutter(box, style, themeColors);
    }

    checkJoins();
    return svg + labels;
}

/**
 * @brief Draws the wires one container level routes between its child boxes.
 *
 * The boxes themselves are drawn by the placement walk. This adds only the
 * gutter traffic, which is the wiring that used to have nowhere to go.
 *
 * @pre box.gutter must come from getGutterPlan() and box.bounds must be set.
 *
 * @param {Object} box - Placed container box.
 * @param {Object} style - Style configuration.
 * @param {Array} themeColors - Theme colour palette.
 * @returns {string} SVG markup for this level's wires.
 */
function renderGutter(box, style, themeColors) {
    const gutter = box.gutter;
    if (!gutter.plan) return '';
    console.assert(box.bounds, 'a routed container must have content bounds');

    const rowTops = gutter.rowOffsets.map(offset => box.bounds.y + offset);
    const emitted = OrcaRouter.emitSection(gutter.plan, rowTops, gutter.rowHeights);
    stretchBoundaryEnds(emitted, gutter.plan, { top: box.y, bottom: box.y + box.height });

    const color = box.color || themeColors[0];
    const lineThickness = style['line-thickness'] || 2;
    const cornerRadius = gutter.geometry.cornerRadius;

    if (typeof window !== 'undefined' && window.ORCA_VERIFY) {
        if (!window.OrcaCheck) window.OrcaCheck = { sections: [] };
        if (!window.OrcaCheck.gutters) window.OrcaCheck.gutters = [];

        // Every child box is an obstacle, so a gutter wire crossing one is the
        // same defect as a section wire crossing a node.
        const boxOutlines = box.children.map(child => ({
            id: child.name || 'anon',
            x0: child.x - box.bounds.x,
            y0: child.y,
            x1: child.x - box.bounds.x + child.width,
            y1: child.y + child.height
        }));

        window.OrcaCheck.gutters.push({
            level: box.name || 'anon',
            nets: gutter.plan.nets.length,
            tracksPerGap: gutter.plan.gapTrackCounts,
            overlaps: OrcaRouter.findOverlaps(emitted.segments, 1.0).length,
            boxHits: OrcaRouter.findNodeCollisions(emitted.segments, boxOutlines, 1.0).length
        });

        // A wire ending on a child box carries on inside it when that child
        // routes a piece of the same net.
        recordJoinEnds(emitted, gutter.plan, box.bounds.x,
            (nodeId, key) => continuesInside({ kind: 'box', id: nodeId }, key));
    }

    const colourOf = wireColourLookup(gutter.plan, color);
    let svg = '<g transform="translate(' + box.bounds.x + ',0)">';

    for (const line of emitted.polylines) {
        svg += '<path d="' + OrcaRouter.pathData(line.points, cornerRadius) + '"'
            + ' fill="none" stroke="' + colourOf(line.netId) + '"'
            + ' stroke-width="' + lineThickness + '"'
            + ' stroke-linecap="round" stroke-linejoin="round"'
            + (line.dashed ? ' stroke-dasharray="5,5"' : '') + '/>';
    }

    for (const dot of emitted.junctions) {
        svg += '<circle cx="' + dot.x + '" cy="' + dot.y + '" r="4" fill="'
            + colourOf('bus:' + dot.busKey) + '"/>';
    }

    for (const arrow of emitted.arrows) {
        svg += renderArrow(arrow.x, arrow.y, arrow.direction, colourOf(arrow.netId), 8);
    }

    svg += '</g>';
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
            const nodesData = parseNodes(Elements.nodesInput.value, layout);
            
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
            const detail = `${nodeCount} nodes, ${connCount} connections`;

            // An endpoint that cannot be resolved used to vanish without a
            // word, which is how every cross-section wire stayed missing.
            if (typeof window !== 'undefined' && window.ORCA_VERIFY) {
                const levels = LastDiagramPlan.levels;
                window.OrcaDebug = {
                    errors: nodesData.errors,
                    levelErrors: levels.errors,
                    levels: Object.keys(levels.byLevel).map(id => ({
                        level: levels.tree.boxes[id] === levels.tree.root
                            ? 'root'
                            : (levels.tree.boxes[id].name || 'anon'),
                        kind: levels.tree.boxes[id].kind,
                        pieces: levels.byLevel[id].length
                    }))
                };
            }
            const levelErrors = LastDiagramPlan ? LastDiagramPlan.levels.errors : [];
            if (nodesData.errors.length > 0) {
                setStatus('Preview generated with unresolved links', 'error',
                    `${detail}, ${nodesData.errors.length} unresolved`);
                showModal('Unresolved connections', nodesData.errors.concat(levelErrors).join('\n'));
            } else if (levelErrors.length > 0) {
                setStatus('Preview generated with routing warnings', 'error', detail);
                showModal('Routing warnings', levelErrors.join('\n'));
            } else {
                setStatus('Preview generated', 'success', detail);
            }
            
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
