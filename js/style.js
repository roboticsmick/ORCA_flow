/**
 * ORCA Flow - Style settings and shape markup
 *
 * Purpose: Parses the `@style` pane into a checked settings object, and draws
 *          node and box outlines in the configured corner style. Every value
 *          that reaches SVG markup or CSS is checked here first, and every
 *          rejected value is reported with the default used in its place.
 *
 * Pure and DOM free, so it loads in the browser as `OrcaStyle` and in node
 * tests through require().
 *
 * Author: ORCA Flow Project
 */

(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./traces.js'));
    } else {
        root.OrcaStyle = factory(root.OrcaTraces);
    }
}(typeof self !== 'undefined' ? self : this, function (OrcaTraces) {
    'use strict';

    // =========================================================================
    // 1. SETTINGS AND LIMITS
    // =========================================================================

    /** Settings used when the `@style` pane leaves a key out. */
    const DEFAULT_STYLE = Object.freeze({
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
        'node-uniform': true,
        'node-fill': false,
        'node-text-color': '#333333',
        'hint-text-color': '#666666',
        'corner-style': 'round',
        'box-width': 'fill'
    });

    /** Values `corner-style` accepts. */
    const CORNER_STYLES = Object.freeze(['round', 'square', 'chamfer']);

    /** Values `box-width` accepts: stretch boxes in a column, or fit their content. */
    const BOX_WIDTHS = Object.freeze(['fill', 'fit']);

    /** Settings that must be one of a fixed list of words. */
    const CHOICE_KEYS = Object.freeze({ 'corner-style': CORNER_STYLES, 'box-width': BOX_WIDTHS });

    /** Settings holding a colour that reaches the SVG `<style>` block. */
    const COLOR_KEYS = Object.freeze(['node-text-color', 'hint-text-color']);

    /** Settings holding a font family name that reaches CSS and a URL. */
    const FONT_KEYS = Object.freeze(['font', 'hint-font']);

    /** Settings that must be true or false. */
    const BOOLEAN_KEYS = Object.freeze(['node-fill', 'uppercase', 'node-uniform']);

    /** Settings holding a number. Optional ones have no default. */
    const NUMERIC_KEYS = Object.freeze(
        Object.keys(DEFAULT_STYLE).filter(key => typeof DEFAULT_STYLE[key] === 'number')
            .concat(['line-spacing', 'corner-radius'])
    );

    /** Settings holding 1, 2 or 4 space-separated numbers. */
    const SPACING_KEYS = Object.freeze(['section-padding', 'node-padding', 'page-margin']);

    /** Settings read by the renderer that have no default. */
    const OPTIONAL_KEYS = Object.freeze(['line-spacing', 'corner-radius', 'line-palette',
        'page-width', 'page-height']);

    /** A font family name: letters, digits and single spaces, as Google Fonts uses. */
    const FONT_NAME = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+){0,7}$/;

    /** Most lines the `@style` pane may hold. */
    const MAX_STYLE_LINES = 1000;

    /** Largest number any numeric setting accepts. */
    const MAX_NUMBER = 10000;

    // =========================================================================
    // 2. PARSING
    // =========================================================================

    /**
     * @brief Turns one written value into a boolean, number or trimmed string.
     * @param {string} text - Value as typed, already trimmed.
     * @returns {boolean|number|string} The typed value.
     */
    function typedValue(text) {
        console.assert(typeof text === 'string', 'typedValue needs a string');
        if (text === 'true') return true;
        if (text === 'false') return false;
        if (text !== '' && !isNaN(text)) return parseFloat(text);
        return text;
    }

    /**
     * @brief Parses the `@style` pane into checked settings.
     *
     * Each `key: value` line overrides a default. Blank lines, `#` comments
     * and the `@style` header are skipped. Every value is then checked, and a
     * rejected one is reported and replaced by its default.
     *
     * @pre input is a string, or empty.
     * @param {string} input - Raw `@style` pane text.
     * @returns {Object} { style, errors } where errors lists one message per
     *                   rejected value.
     */
    function parseStyle(input) {
        const style = Object.assign({}, DEFAULT_STYLE);
        const errors = [];
        const lines = (typeof input === 'string' ? input : '').split('\n');
        console.assert(Array.isArray(lines), 'style input must split into lines');

        if (lines.length > MAX_STYLE_LINES) {
            errors.push('The @style block has ' + lines.length + ' lines. Only the first '
                + MAX_STYLE_LINES + ' are read.');
        }

        const count = Math.min(lines.length, MAX_STYLE_LINES);
        for (let i = 0; i < count; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed === '@style') continue;
            const colon = trimmed.indexOf(':');
            if (colon <= 0) {
                errors.push("Line '" + trimmed + "' is not 'key: value'. It was skipped.");
                continue;
            }
            const key = trimmed.substring(0, colon).trim();
            // WHY: a plain object lookup on `__proto__` or `constructor` reaches
            // the prototype, so a key typed by the user must be an own property.
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                errors.push("'" + key + "' is not a setting. It was skipped.");
                continue;
            }
            if (!(key in DEFAULT_STYLE) && !OPTIONAL_KEYS.includes(key)) {
                errors.push("'" + key + "' is not a setting. It was skipped.");
                continue;
            }
            style[key] = typedValue(trimmed.substring(colon + 1).trim());
        }

        checkStyle(style, errors);
        return { style: style, errors: errors };
    }

    // =========================================================================
    // 3. CHECKS
    // =========================================================================

    /**
     * @brief Reports a rejected value and restores its default.
     * @param {Object} style - Settings, corrected in place.
     * @param {Array} errors - Messages, appended to.
     * @param {string} key - Setting name.
     * @param {string} expected - What the setting accepts, as a phrase.
     */
    function reject(style, errors, key, expected) {
        console.assert(typeof key === 'string' && key.length > 0, 'reject needs a key');
        console.assert(Array.isArray(errors), 'reject needs an error list');
        const fallback = DEFAULT_STYLE[key];
        errors.push(key + " '" + style[key] + "' is not " + expected + '. '
            + (fallback === undefined ? 'It was ignored.' : 'Using ' + fallback + '.'));
        if (fallback === undefined) delete style[key];
        else style[key] = fallback;
    }

    /**
     * @brief Coerces numeric settings and rejects any out of range.
     *
     * A number written with a unit, such as `14px`, keeps its number.
     *
     * @param {Object} style - Settings, corrected in place.
     * @param {Array} errors - Messages, appended to.
     */
    function checkNumbers(style, errors) {
        console.assert(NUMERIC_KEYS.length > 0, 'numeric keys must be listed');
        console.assert(Array.isArray(errors), 'checkNumbers needs an error list');
        for (const key of NUMERIC_KEYS) {
            if (!(key in style)) continue;
            // WHY: a numeric setting written with a unit, such as `14px`, used
            // to stay a string, so sizes came out NaN or as concatenated text,
            // and any string reaches SVG markup.
            const value = typeof style[key] === 'number' ? style[key] : parseFloat(style[key]);
            if (Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER) {
                style[key] = value;
            } else {
                reject(style, errors, key, 'a number from 0 to ' + MAX_NUMBER);
            }
        }
    }

    /**
     * @brief Rejects padding and margin values that are not 1, 2 or 4 numbers.
     * @param {Object} style - Settings, corrected in place.
     * @param {Array} errors - Messages, appended to.
     */
    function checkSpacing(style, errors) {
        console.assert(SPACING_KEYS.length > 0, 'spacing keys must be listed');
        console.assert(Array.isArray(errors), 'checkSpacing needs an error list');
        for (const key of SPACING_KEYS) {
            const parts = String(style[key]).trim().split(/\s+/);
            const valid = [1, 2, 4].includes(parts.length) && parts.every(part => {
                const value = Number(part);
                return part !== '' && Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER;
            });
            if (valid) style[key] = parts.join(' ');
            else reject(style, errors, key, '1, 2 or 4 numbers from 0 to ' + MAX_NUMBER);
        }
    }

    /**
     * @brief Checks every setting that reaches markup, CSS or a URL.
     *
     * Colours must be hex, the same check `{#hex}` uses, and font names must
     * be plain words, because both are written into the SVG `<style>` block.
     *
     * @pre style holds parsed values; errors is an array.
     * @param {Object} style - Settings, corrected in place.
     * @param {Array} errors - Messages, appended to.
     */
    function checkStyle(style, errors) {
        console.assert(style !== null && typeof style === 'object', 'checkStyle needs settings');
        console.assert(Array.isArray(errors), 'checkStyle needs an error list');

        checkNumbers(style, errors);
        checkSpacing(style, errors);
        for (const key of COLOR_KEYS) {
            if (!OrcaTraces.isHexColour(style[key])) reject(style, errors, key, 'a hex color such as #ffffff');
        }
        for (const key of FONT_KEYS) {
            // WHY: `font: 123` parsed to a number, passed the name check
            // through String(), then crashed fontUrlName() on .replace.
            if (FONT_NAME.test(String(style[key]))) style[key] = String(style[key]);
            else reject(style, errors, key, 'a font name such as Roboto Mono');
        }
        for (const key of BOOLEAN_KEYS) {
            if (typeof style[key] !== 'boolean') reject(style, errors, key, 'true or false');
        }
        for (const key of Object.keys(CHOICE_KEYS)) {
            const choices = CHOICE_KEYS[key];
            if (!choices.includes(style[key])) reject(style, errors, key, 'one of ' + choices.join(', '));
        }
    }

    // =========================================================================
    // 4. MARKUP
    // =========================================================================

    /**
     * @brief Escapes text for use inside SVG markup or an attribute value.
     * @param {*} value - Value to escape.
     * @returns {string} Text with &, <, >, " and ' replaced by entities.
     */
    function escapeXml(value) {
        const text = String(value);
        console.assert(typeof text === 'string', 'escapeXml must produce a string');
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * @brief Draws a node or box outline in the configured corner style.
     *
     * `round` gives a rect with rx and ry, `square` a rect without them, and
     * `chamfer` a path cutting each corner at 45 degrees. The radius is
     * clamped to half the shorter side, so every style draws a valid shape.
     *
     * @pre box has finite x, y and non-negative width and height.
     * @pre cornerStyle is one of CORNER_STYLES.
     * @param {Object} box - { x, y, width, height } in pixels.
     * @param {number} radius - Corner radius in pixels.
     * @param {string} cornerStyle - 'round', 'square' or 'chamfer'.
     * @param {string} attrs - Fill, stroke and data attributes, already safe.
     * @returns {string} One SVG shape element.
     */
    function boxShape(box, radius, cornerStyle, attrs) {
        const { x, y, width: w, height: h } = box;
        console.assert([x, y, w, h].every(Number.isFinite) && w >= 0 && h >= 0,
            'boxShape needs a finite box');
        console.assert(CORNER_STYLES.includes(cornerStyle), 'unknown corner style ' + cornerStyle);

        const r = Math.max(0, Math.min(Number(radius) || 0, w / 2, h / 2));
        if (cornerStyle === 'chamfer') {
            const d = 'M ' + (x + r) + ' ' + y + ' L ' + (x + w - r) + ' ' + y
                + ' L ' + (x + w) + ' ' + (y + r) + ' L ' + (x + w) + ' ' + (y + h - r)
                + ' L ' + (x + w - r) + ' ' + (y + h) + ' L ' + (x + r) + ' ' + (y + h)
                + ' L ' + x + ' ' + (y + h - r) + ' L ' + x + ' ' + (y + r) + ' Z';
            return '<path d="' + d + '" ' + attrs + '/>';
        }
        const corners = cornerStyle === 'square' ? '' : ' rx="' + r + '" ry="' + r + '"';
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"'
            + corners + ' ' + attrs + '/>';
    }

    /**
     * @brief Builds the Google Fonts URL family parameter for a checked name.
     * @pre name passed the FONT_NAME check.
     * @param {string} name - Font family name.
     * @returns {string} The name with spaces as `+`.
     */
    function fontUrlName(name) {
        console.assert(FONT_NAME.test(name), 'fontUrlName needs a checked font name');
        const encoded = name.replace(/ /g, '+');
        console.assert(encoded.indexOf(' ') < 0, 'an encoded font name has no spaces');
        return encoded;
    }

    return {
        DEFAULT_STYLE: DEFAULT_STYLE,
        CORNER_STYLES: CORNER_STYLES,
        BOX_WIDTHS: BOX_WIDTHS,
        parseStyle: parseStyle,
        checkStyle: checkStyle,
        escapeXml: escapeXml,
        boxShape: boxShape,
        fontUrlName: fontUrlName
    };
}));
