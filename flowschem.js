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
    diagramGenerated: false
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
    sectionHeaders: document.querySelectorAll('.section-header')
};

// =============================================================================
// 3. DEFAULT STYLE CONFIGURATION
// =============================================================================

const DefaultStyle = {
    'section-radius': 6,
    'node-radius': 4,
    'node-border': 2,
    'line-thickness': 2,
    'font': 'Roboto Mono',
    'font-weight': 500,
    'font-size': 14,
    'hint-font': 'Roboto Mono',
    'hint-weight': 300,
    'hint-size': 11,
    'section-padding': '16 12 16 12',
    'node-padding': '8 12 8 12',
    'flow': 'down',
    'uppercase': true,
    'theme': 'default',
    'line-theme': false,
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
 * 
 * @param {string} input - Raw nodes input text.
 * @returns {Object} Object containing nodes and connections arrays.
 */
function parseNodes(input) {
    const result = {
        nodes: [],
        connections: [],
        sections: {}
    };
    
    if (!input || !input.trim()) {
        return result;
    }
    
    const lines = input.split('\n');
    let currentSection = null;
    let currentRow = 0;
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines, comments, and @nodes header
        if (!trimmed || trimmed.startsWith('#') || trimmed === '@nodes') {
            continue;
        }
        
        // Check for section-row header (e.g., "sensors-1")
        const sectionMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)-(\d+)$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1];
            currentRow = parseInt(sectionMatch[2]);
            
            if (!result.sections[currentSection]) {
                result.sections[currentSection] = { rows: {} };
            }
            if (!result.sections[currentSection].rows[currentRow]) {
                result.sections[currentSection].rows[currentRow] = [];
            }
            continue;
        }
        
        // Parse node definitions
        if (currentSection) {
            const parsed = parseNodeLine(trimmed, currentSection, currentRow);
            if (parsed) {
                // Add source node if new
                const sourceNode = {
                    id: parsed.sourceId,
                    name: parsed.sourceName,
                    hint: parsed.sourceHint,
                    section: currentSection,
                    row: currentRow
                };
                
                const existingSource = result.nodes.find(n => n.id === sourceNode.id);
                if (!existingSource) {
                    result.nodes.push(sourceNode);
                    result.sections[currentSection].rows[currentRow].push(sourceNode.id);
                }
                
                // Add connections and target nodes
                for (const target of parsed.targets) {
                    result.connections.push({
                        from: parsed.sourceId,
                        to: target.id,
                        type: parsed.connectionType,
                        dashed: parsed.dashed
                    });
                    
                    // Target nodes are added without section/row - resolved later
                    const existingTarget = result.nodes.find(n => n.id === target.id);
                    if (!existingTarget) {
                        result.nodes.push({
                            id: target.id,
                            name: target.name,
                            hint: target.hint,
                            section: null,
                            row: null
                        });
                    }
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
            
            return {
                sourceId: generateNodeId(source.name, section),
                sourceName: source.name,
                sourceHint: source.hint,
                targets: targets.map(t => ({
                    id: generateNodeId(t.name),
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
// 8. RENDERER FUNCTIONS
// =============================================================================

/**
 * Renders the diagram to SVG.
 * 
 * @param {Object} style - Style configuration.
 * @param {Object} layout - Layout tree.
 * @param {Object} nodesData - Parsed nodes and connections.
 * @returns {string} SVG markup string.
 */
function renderDiagram(style, layout, nodesData) {
    // Calculate page dimensions
    const pageDimensions = getPageDimensions(style);
    const margin = parsePadding(style['page-margin']);
    
    const width = pageDimensions.width - margin.left - margin.right;
    const height = pageDimensions.height - margin.top - margin.bottom;
    
    // Get theme colours
    const themeColors = Themes[style.theme] || Themes.default;
    let colorIndex = 0;
    
    // Build SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" 
        width="${pageDimensions.width}" 
        height="${pageDimensions.height}" 
        viewBox="0 0 ${pageDimensions.width} ${pageDimensions.height}"
        style="background-color: #1a1a2e;">`;
    
    // Add defs for patterns, gradients, etc.
    svg += `<defs>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=${style.font.replace(' ', '+')}:wght@300;400;500;600&display=swap');
            .node-text { 
                font-family: '${style.font}', sans-serif; 
                font-weight: ${style['font-weight']}; 
                font-size: ${style['font-size']}px; 
                fill: #ffffff;
            }
            .hint-text { 
                font-family: '${style['hint-font']}', sans-serif; 
                font-weight: ${style['hint-weight']}; 
                font-size: ${style['hint-size']}px; 
                fill: #aabbcc;
            }
            .section-label {
                font-family: '${style.font}', sans-serif;
                font-weight: 600;
                font-size: ${style['font-size'] + 2}px;
                fill: #ffffff;
            }
        </style>
    </defs>`;
    
    // Render layout segments
    if (layout) {
        svg += renderLayoutNode(layout, margin.left, margin.top, width, height, style, themeColors, colorIndex);
    } else {
        // No layout defined - render a placeholder message
        svg += `<text x="${pageDimensions.width/2}" y="${pageDimensions.height/2}" 
            text-anchor="middle" class="section-label" fill="#666688">
            Define a layout to see segments
        </text>`;
    }
    
    // Render placeholder nodes if no nodes defined
    if (nodesData.nodes.length === 0) {
        svg += `<text x="${pageDimensions.width/2}" y="${pageDimensions.height/2 + 30}" 
            text-anchor="middle" class="hint-text" fill="#666688">
            Add nodes to see the diagram
        </text>`;
    }
    
    svg += '</svg>';
    
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
 * @returns {string} SVG markup.
 */
function renderLayoutNode(node, x, y, width, height, style, themeColors, colorIndex) {
    let svg = '';
    const padding = 8;
    const gap = 10;
    
    if (node.type === 'segment') {
        // Get colour for this segment
        const color = themeColors[colorIndex % themeColors.length];
        
        // Draw segment box
        svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" 
            rx="${style['section-radius']}" ry="${style['section-radius']}"
            fill="rgba(0,0,44,0.5)" stroke="${color}" stroke-width="2"/>`;
        
        // Draw segment label
        if (node.name) {
            const labelText = style.uppercase ? node.name.toUpperCase() : node.name;
            svg += `<text x="${x + padding}" y="${y + 20}" class="section-label" fill="${color}">
                ${labelText}
            </text>`;
        }
        
        // Render children if any
        if (node.children && node.children.length > 0) {
            const innerX = x + padding;
            const innerY = y + 30;
            const innerWidth = width - padding * 2;
            const innerHeight = height - 30 - padding;
            
            svg += renderLayoutChildren(node.children, node.direction || 'row', 
                innerX, innerY, innerWidth, innerHeight, style, themeColors, colorIndex + 1);
        }
    } else if (node.type === 'container') {
        // Render children
        svg += renderLayoutChildren(node.children, node.direction || 'row',
            x, y, width, height, style, themeColors, colorIndex);
    }
    
    return svg;
}

/**
 * Renders children of a layout container.
 * 
 * @param {Array} children - Child nodes.
 * @param {string} direction - 'row' or 'column'.
 * @param {number} x - X position.
 * @param {number} y - Y position.
 * @param {number} width - Available width.
 * @param {number} height - Available height.
 * @param {Object} style - Style configuration.
 * @param {Array} themeColors - Theme colours.
 * @param {number} colorIndex - Current colour index.
 * @returns {string} SVG markup.
 */
function renderLayoutChildren(children, direction, x, y, width, height, style, themeColors, colorIndex) {
    let svg = '';
    const gap = 10;
    const count = children.length;
    
    if (count === 0) return svg;
    
    if (direction === 'row') {
        const childWidth = (width - gap * (count - 1)) / count;
        children.forEach((child, i) => {
            const childX = x + i * (childWidth + gap);
            svg += renderLayoutNode(child, childX, y, childWidth, height, style, themeColors, colorIndex + i);
        });
    } else {
        const childHeight = (height - gap * (count - 1)) / count;
        children.forEach((child, i) => {
            const childY = y + i * (childHeight + gap);
            svg += renderLayoutNode(child, x, childY, width, childHeight, style, themeColors, colorIndex + i);
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
 */
function exportPng() {
    const svgElement = Elements.previewCanvas.querySelector('svg');
    if (!svgElement) {
        showModal('Export Error', 'No diagram to export. Please generate a preview first.');
        return;
    }
    
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'flowschem-diagram.png';
        link.href = pngUrl;
        link.click();
        
        URL.revokeObjectURL(url);
        setStatus('PNG exported successfully', 'success');
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
// 11. EVENT LISTENERS
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
// 12. INITIALISATION
// =============================================================================

setStatus('Ready', 'info', 'Press Ctrl+Enter to generate');
