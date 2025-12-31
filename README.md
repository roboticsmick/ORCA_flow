# ORCA_flow: Schematic-Style System Diagram Generator

## Project Overview

ORCA flow is a web-based tool for generating clean, schematic-style system diagrams with orthogonal (horizontal/vertical) wire routing. It addresses limitations in existing tools like Mermaid, which use force-directed layouts that produce messy, non-uniform diagrams unsuitable for engineering documentation.

### Core Problem

Mermaid and similar tools:
- Place nodes using physics simulation rather than grid alignment
- Draw edges as curves or direct lines rather than orthogonal paths
- Produce cluttered wire routing with overlapping connections
- Lack the clean, professional appearance of PCB schematics or engineering block diagrams

### Solution

FlowSchem provides:
- Grid-based node placement within defined segments
- Orthogonal wire routing (horizontal and vertical only)
- Uniform spacing and alignment
- Rounded corners on wire bends with radius adjustment for bundled wires
- Junction dots where wires branch (schematic style)
- Hierarchical segment layout using flexbox-style nesting
- Simple, minimal DSL for defining diagrams
- Theming system with accessibility support for colour-blind users

---

## User Interface Layout

Two-panel web interface:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────┐ ┌─────────────────────────────────────────┐ │
│ │         STYLE           │ │ [Generate] [PDF] [PNG] [Export .flow]  │ │
│ ├─────────────────────────┤ ├─────────────────────────────────────────┤ │
│ │         LAYOUT          │ │                                         │ │
│ ├─────────────────────────┤ │                                         │ │
│ │                         │ │              PREVIEW                    │ │
│ │         NODES           │ │           (SVG Render)                  │ │
│ │                         │ │                                         │ │
│ │                         │ │                                         │ │
│ │                         │ │                                         │ │
│ └─────────────────────────┘ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

Layout definition using project's own syntax:
```
[[Style]/[Layout]/[Nodes]][[[Generate preview][Export pdf][Export png][Export flow layout txt]]/[Preview]]
```

### Features
- Left panel: Three input sections for Style, Layout, and Nodes
- Right panel: Live preview with export buttons
- Export formats: PDF, PNG, and `.flow` source file
- Distribution: Hosted online and downloadable from GitHub for offline use

---

## File Format Specification

File extension: `.flow`

Markdown code fence identifier: `flow`

### Complete File Structure

```
@style
[style parameters]

@layout [segment-bracket-notation]

@nodes
[section-row definitions]
[node and connection definitions]
```

---

## Style Block Specification

The `@style` block defines visual parameters using `key: value` syntax.

### Available Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `section-radius` | Corner radius for segment boxes | `6` |
| `node-radius` | Corner radius for node boxes | `4` |
| `node-border` | Border thickness for nodes | `2` |
| `line-thickness` | Connection line thickness | `2` |
| `font` | Primary font (Google Fonts) | `Inter` |
| `font-weight` | Primary font weight | `500` |
| `font-size` | Primary font size in px | `14` |
| `hint-font` | Hint/subtitle font | `Inter` |
| `hint-weight` | Hint font weight | `300` |
| `hint-size` | Hint font size in px | `11` |
| `section-padding` | Segment padding (top right bottom left) | `16 12 16 12` |
| `node-padding` | Node padding (top right bottom left) | `8 12 8 12` |
| `flow` | Direction of data flow | `down` (or `left`, `right`) |
| `uppercase` | Convert text to uppercase | `true` or `false` |
| `theme` | Colour theme preset | `default` (see Theming section) |
| `line-theme` | Enable line style variations for accessibility | `true` or `false` |

### Export and Page Size Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `page-size` | Export page size preset | `A4`, `A3`, `letter`, `custom` |
| `page-width` | Custom page width in mm (if page-size: custom) | `297` |
| `page-height` | Custom page height in mm (if page-size: custom) | `210` |
| `page-orientation` | Page orientation | `landscape` or `portrait` |
| `page-margin` | Page margins in mm (top right bottom left) | `10 10 10 10` |

### Node Size Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `node-min-width` | Minimum node width in px | `120` |
| `node-min-height` | Minimum node height in px | `60` |
| `node-max-width` | Maximum node width in px (0 = no limit) | `200` |
| `node-uniform` | Force all nodes to same size | `true` or `false` |

**Node sizing behaviour:**
- Nodes expand automatically to fit content (heading + hint text)
- Nodes expand to accommodate connection ports if many connections exist
- If `node-uniform: true`, all nodes match the size of the largest node
- The system validates that the diagram fits within page bounds and warns if it doesn't

### Example Style Block

```
@style
section-radius: 6
node-radius: 4
node-border: 2
line-thickness: 2
font: Roboto Mono
font-weight: 500
font-size: 14
hint-font: Roboto Mono
hint-weight: 300
hint-size: 11
section-padding: 16 12 16 12
node-padding: 8 12 8 12
flow: down
uppercase: true
theme: default
line-theme: false
page-size: A4
page-orientation: landscape
page-margin: 10 10 10 10
node-min-width: 120
node-min-height: 60
node-uniform: true
```

---

## Theming and Colour System

FlowSchem includes a theming system that automatically assigns colours to sections, with accessibility support for colour-blind users.

### Built-in Themes

Themes automatically assign colours to sections in order. As more sections are added, the next colour in the palette is used.

| Theme | Description | Use Case |
|-------|-------------|----------|
| `default` | Balanced professional palette | General purpose |
| `monochrome` | Greyscale variations | Print-friendly |
| `engineering` | Blues and greys | Technical documentation |
| `warm` | Reds, oranges, yellows | Highlight-focused |
| `cool` | Blues, greens, purples | Calm, professional |
| `high-contrast` | Maximum colour differentiation | Accessibility |

### Line Theme for Accessibility

When `line-theme: true` is enabled, each section also receives a distinct line style in addition to colour. This ensures diagrams remain readable for colour-blind users.

Line style variations:
- Solid
- Dashed (long)
- Dashed (short)
- Dotted
- Dash-dot
- Dash-dot-dot

Example:
```
@style
theme: default
line-theme: true
```

This produces sections with both unique colours AND unique line styles.

### Custom Colour Palette

For full control, define a custom palette with hex colours and assign keys to sections in the layout.

#### Defining Colours

```
@style
palette:
  sensors: #3498db
  control: #e74c3c
  comms: #2ecc71
  ground: #9b59b6
```

#### Assigning Colours to Layout

Use the colour key after the section name with a colon:

```
@layout [USV[sensors:sensors][control:control]][comms:comms]/[ground:ground]
```

Or with named parent sections:

```
@layout [USV:sensors[internal][external]]/[Ground:ground]
```

#### Colour Application

When a colour key is assigned to a section:
- Section border uses the assigned colour
- Node borders within that section use the same colour
- Connection lines originating from nodes in that section use the same colour

### Combining Themes and Custom Colours

If both `theme` and `palette` are specified:
- Custom palette colours take priority for sections with assigned keys
- Theme colours fill in for sections without explicit assignments

Example:
```
@style
theme: engineering
palette:
  critical: #e74c3c
  
@layout [sensors][control:critical][output]
```

Result:
- `sensors`: First colour from engineering theme
- `control`: Custom red (#e74c3c)
- `output`: Second colour from engineering theme

---

## Layout Block Specification

The `@layout` block defines the hierarchical segment structure using bracket notation.

### Syntax Rules

| Pattern | Meaning | CSS Equivalent |
|---------|---------|----------------|
| `[a][b]` | Horizontal segments (side by side) | `flex-direction: row` |
| `[a]/[b]` | Vertical segments (stacked) | `flex-direction: column` |
| `[Name[a][b]]` | Named parent containing children | Nested flex container |
| `[section:colour_key]` | Section with assigned colour | Uses palette colour |

### Examples

**Two horizontal segments:**
```
@layout [sensors][processing]
```
```
┌──────────────┬──────────────┐
│   sensors    │  processing  │
└──────────────┴──────────────┘
```

**Two vertical segments:**
```
@layout [sensors]/[processing]
```
```
┌──────────────┐
│   sensors    │
├──────────────┤
│  processing  │
└──────────────┘
```

**Complex nested layout:**
```
@layout [USV[usv_sensors]/[usv_control]][ROV[rov_sensors]/[rov_control]]/[ground]
```
```
┌─────────────────────────────┬─────────────────────────────┐
│            USV              │            ROV              │
│ ┌─────────────────────────┐ │ ┌─────────────────────────┐ │
│ │       usv_sensors       │ │ │       rov_sensors       │ │
│ ├─────────────────────────┤ │ ├─────────────────────────┤ │
│ │       usv_control       │ │ │       rov_control       │ │
│ └─────────────────────────┘ │ └─────────────────────────┘ │
├─────────────────────────────┴─────────────────────────────┤
│                          ground                           │
└───────────────────────────────────────────────────────────┘
```

---

## Nodes Block Specification

The `@nodes` block defines nodes and their connections using a row-based syntax.

### Row Header Syntax

```
segment_name-row_number
```

Example: `sensors-1` means row 1 within the "sensors" segment.

### Node Definition Syntax

```
NodeName [connection] TargetNode
```

**Critical rule:** The first node (left side) is placed on the current row. The second node (right side) is placed elsewhere and resolved during the connection routing phase.

### Connection Symbols

| Symbol | Meaning | Visual |
|--------|---------|--------|
| `>` | Solid arrow, flows to target | `A ───> B` |
| `<` | Solid arrow, flows from target | `A <─── B` |
| `<>` | Solid bidirectional | `A <──> B` |
| `->` | Dashed arrow, flows to target | `A ┈┈┈> B` |
| `<-` | Dashed arrow, flows from target | `A <┈┈┈ B` |
| `<->` | Dashed bidirectional | `A <┈┈> B` |

### Node Label Syntax

| Pattern | Result |
|---------|--------|
| `NodeName` | Heading only |
| `NodeName/hint` | Heading with hint text below |

### Multiple Targets

Use comma separation for multiple targets from the same source:

```
Teensy > GPS, IMU, Pressure
```

### Standalone Nodes

A line with no connection symbol creates a standalone node:

```
sensors-1
Status LED
Power Indicator
```

### Section-to-Section Connections

Sections can be treated as nodes for high-level connections. This is useful for showing data flow between major subsystems without detailing internal nodes.

Use the section name directly in the nodes block:

```
@nodes
system-1
MCU <> Sensors
MCU <> Actuators
AUV < Payload
```

This creates connections between section boxes rather than individual nodes within them. The wire routes from the section boundary box itself.

Section-to-section connections are particularly useful for:
- Overview diagrams showing subsystem relationships
- Indicating data flow direction between major components
- Connecting external systems (like Payload) to internal sections

### Complete Nodes Example

```
@nodes
sensors-1
Jetson/Nvidia Orin <> Teensy/PJRC 4.1
Jetson <> Xbee/Digi 900MHz

sensors-2
Teensy > GPS/u-blox NEO-M8N, IMU/BNO085, Pressure/MS5611
Xbee <> Ground Station

control-1
Jetson > Motor Driver/ODrive 3.6

control-2
Motor Driver > Thruster L, Thruster R

ground-1
Ground Station/Base PC > Dashboard, Logger

# Section-level connection
system-1
USV <> Ground
ROV <> USV
```

**Resulting node placement:**
- sensors row 1: Jetson (with two connections out)
- sensors row 2: Teensy, Xbee
- sensors row 3 (implicit): GPS, IMU, Pressure, Ground Station
- control row 1: Jetson (same node, different segment reference)
- control row 2: Motor Driver
- control row 3 (implicit): Thruster L, Thruster R
- ground row 1: Ground Station
- ground row 2 (implicit): Dashboard, Logger
- Section-level: USV connects to Ground, ROV connects to USV

---

## Parsing Logic

### Two-Pass Parser

**Pass 1: Node Collection**
1. Parse `@style` into configuration object (including theme and palette)
2. Parse `@layout` into segment tree structure with colour assignments
3. For each row in `@nodes`:
   - Extract section name and row number from header
   - Collect unique first-position nodes for that row
   - Identify section-to-section connections (where node name matches a section name)
   - Store connection definitions for pass 2

**Pass 2: Connection Resolution**
1. Build node position map (segment, row, horizontal position)
2. Apply theme colours to sections without explicit palette assignments
3. If `line-theme: true`, assign line styles to each section
4. For each connection:
   - Look up source node position (or section boundary if section-to-section)
   - Look up target node position (or section boundary if section-to-section)
   - Determine wire routing based on relative positions
   - Apply appropriate colour and line style

### Node Placement Rules

1. First node on a line is placed on the current row
2. If the same first node appears on multiple lines, it's one node with multiple connections
3. Target nodes (right side) are placed on their own defined rows
4. If a node only appears as a target (never as first node), raise an error
5. If a node name matches a section name, treat it as a section-to-section connection

---

## Rendering Specification

### SVG Output

The renderer produces SVG with:
- `<rect>` elements for segment boxes and node boxes
- `<text>` elements for labels and hints
- `<path>` elements for orthogonal wire routes
- `<circle>` elements for junction dots
- Stroke colours and dash patterns based on theme/palette and line-theme settings

### Wire Routing Algorithm

1. Wires travel only horizontally or vertically
2. Use channel-based routing between rows to prevent overlap
3. When multiple wires turn at the same corner, adjust radius (inner wire = smaller radius)
4. Add junction dots where one wire branches to multiple targets
5. Wires exiting a segment travel through inter-segment channels
6. Section-to-section wires connect to the section boundary box edges

### Node Rendering

```
┌────────────────────────┐
│      HEADING TEXT      │  ← font, font-weight, font-size
├────────────────────────┤
│       hint text        │  ← hint-font, hint-weight, hint-size
└────────────────────────┘
```

### Colour and Line Style Application

- Section borders: Theme or palette colour
- Node borders: Inherit from parent section
- Connection lines: Colour from source node's section
- Line style: If `line-theme: true`, apply section's assigned line pattern

---

## Complete Example File

```
@style
section-radius: 8
node-radius: 6
node-border: 2
line-thickness: 2
font: Roboto Mono
font-weight: 500
font-size: 14
hint-font: Roboto Mono
hint-weight: 300
hint-size: 11
section-padding: 20 16 20 16
node-padding: 10 14 10 14
flow: down
uppercase: true
theme: engineering
line-theme: true

@layout [USV[sensors][control]][ROV[rov_sensors][rov_control]]/[ground]

@nodes
sensors-1
Jetson/Nvidia Orin <> Teensy/PJRC 4.1
Jetson <> Xbee/Digi XBee3

sensors-2
Teensy > GPS/u-blox NEO-M8N, IMU/BNO085, Pressure/MS5611
Xbee <> Ground Station

control-1
Jetson > ODrive/v3.6

control-2
ODrive > Thruster L, Thruster R

rov_sensors-1
RPi/Raspberry Pi 4B <> Teensy/PJRC 4.1

rov_sensors-2
Teensy > Depth/Bar30, Leak/Sensor, Temp/DS18B20

rov_control-1
RPi > ESC Array/4x BlueRobotics

rov_control-2
ESC Array > T1, T2, T3, T4

ground-1
Ground Station/Desktop PC > Dashboard/React, Logger/SQLite, Map/Leaflet
Xbee <> Ground Station

# Section-level connections
overview-1
USV <> ROV
USV <> ground
```

---

## Custom Palette Example

```
@style
section-radius: 6
node-radius: 4
line-thickness: 2
font: Inter
theme: default
line-theme: true
palette:
  nav: #2980b9
  power: #c0392b
  comms: #27ae60
  payload: #8e44ad

@layout [Navigation:nav][Power:power]/[Communications:comms][Payload:payload]

@nodes
Navigation-1
GPS/u-blox > MCU
IMU/BNO085 > MCU

Power-1
Battery/4S LiPo > BMS
BMS > 5V Rail, 12V Rail

Communications-1
MCU <> Radio/LoRa
Radio <> Ground

Payload-1
Camera/RPi Cam > Companion/RPi
Companion > MCU

# Section connections showing data flow
system-1
Navigation > Payload
Power > Navigation, Communications, Payload
```

---

## Technology Recommendations

### Frontend
- **Framework:** React or vanilla JavaScript with SVG
- **Styling:** CSS Flexbox for panel layout, SVG for diagram
- **Fonts:** Google Fonts integration

### Export
- **PNG:** Canvas API or html2canvas
- **PDF:** jsPDF or similar library
- **Source:** Plain text `.flow` file download

### Offline Distribution
- Single HTML file with embedded CSS/JS, or
- Simple npm package that runs local server

---

## Future Enhancement: Markdown Integration

Enable embedding in markdown files using fenced code blocks:

```markdown
# System Architecture

​```flow
@style
node-radius: 6
flow: down
theme: engineering

@layout [sensors]/[processing]

@nodes
sensors-1
GPS, IMU

processing-1
sensors > MCU
​```
```

### Implementation Options

1. **GitHub Action:** Pre-render `.flow` blocks to SVG on commit
2. **Custom Plugin:** For static site generators (Hugo, Jekyll, Docusaurus)
3. **JavaScript Library:** Client-side rendering for live documentation sites

---

## Summary

FlowSchem provides engineers with a simple DSL for creating professional schematic-style system diagrams. The syntax prioritises minimal typing while maintaining clarity:

- **Style:** Key-value configuration for visual parameters and theming
- **Layout:** Bracket notation for hierarchical segments `[A[B][C]]/[D]` with optional colour keys
- **Nodes:** Row-based definitions with inline connections using `>` `<` `<>` symbols
- **Sections as Nodes:** Connect entire sections for high-level diagrams
- **Theming:** Built-in colour themes with automatic assignment, plus custom palettes
- **Accessibility:** `line-theme` option for colour-blind friendly diagrams
- **Output:** Clean SVG with orthogonal wire routing, exportable to PDF/PNG

The tool solves the specific problem of creating neat, grid-aligned system diagrams that existing tools like Mermaid cannot produce.

---

## Demo

```sh
cd /media/logic/USamsung/ORCA_flow
python3 -m http.server 8000
# Open browser to http://localhost:8000
```
