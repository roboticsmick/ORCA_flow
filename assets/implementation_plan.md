# Connection Routing Implementation Plan

## Status Overview

| Phase | Description | Status | Completed |
|-------|-------------|--------|-----------|
| Phase 6 | Junction Dot Fix | **COMPLETE** | 2025-01-04 |
| Phase 1 | Core Data Structures | **COMPLETE** | 2025-01-04 |
| Phase 2 | Port Count Calculation | **COMPLETE** | 2025-01-04 |
| Phase 3 | Port Ordering Algorithm | **COMPLETE** | 2025-01-04 |
| Phase 4 | Channel Calculation | **COMPLETE** | 2025-01-04 |
| Phase 5 | Wire Path Generation | **COMPLETE** | 2025-01-04 |
| Phase 7 | Cross-Section Connections | **COMPLETE** | 2025-01-04 |

---

## Changelog

### 2026-01-04: Fix - Upward/Downward Channel Y Reference Collision

**Files Modified:** `js/flowschem.js`

**Issue:** Upward and downward connections with different channel numbers were rendered at the same Y position, causing visual collisions. For example, upward channel 2 and downward channel 5 appeared on the same horizontal line.

**Root Cause:** Downward and upward connections computed channel Y from opposite ends of the gap:

- Downward: `channelY = sourceY + (channel * spacing)` (from top of gap)
- Upward: `channelY = sourceY - (channel * spacing)` (from bottom of gap)

In a gap with 6 channels:

- Downward channel 6 is at gapTop + 6*S (near bottom of gap)
- Upward channel 1 is at gapBottom - 1*S (also near bottom of gap)

So different channel numbers collide visually because they're measured from opposite ends.

**Changes Made:**

1. **Fixed upward channel Y calculation (lines 2163-2176)**

   - Now computes `channelY = gapTopY + (channel * channelSpacing)`
   - Uses same reference point as downward connections (bottom of row above)
   - Finds `gapTopY` by looking up the adjacent row in sectionLayout
   - Falls back to estimate if layout not available

**Before:** Upward ch2 at gapBottom - 2*S, Downward ch5 at gapTop + 5*S → SAME Y (collision!)
**After:** Both use gapTop + channel*S → ch2 at gapTop + 2*S, ch5 at gapTop + 5*S → DIFFERENT Y

---

### 2026-01-04: Fix - Per-Gap Channel Assignment

**Files Modified:** `js/flowschem.js`

**Issue:** The unified global channel assignment caused incorrect wire rendering. Connections were assigned channel numbers globally across all gaps, but each gap has a different number of connections. When a connection was assigned channel 5 but its gap only had 2 connections, the wire was drawn well below the gap (channel Y = sourceY + 5 * channelSpacing), causing wires to pass through nodes.

**Example Problem:**
- Gap 1-2 has 2 connections: RPi > test1, T4 > test1
- Gap 2-3 has 6 connections
- RPi > test1 was assigned global channel 5 (based on target column sort across all gaps)
- But Gap 1-2 is only sized for 2 channels, so channel 5 rendered way below the gap

**Root Cause:** Global channel assignment doesn't work because gaps have different numbers of connections. Each gap needs its own channel numbering (1, 2, 3, ...) for the connections that pass through it.

**Changes Made:**

1. **Replaced global channel assignment with per-gap assignment (lines 1228-1275)**

   - For each gap, collect all connections that pass through it
   - Group by target, sort by target column (rightmost first = channel 1)
   - Assign channels 1, 2, 3, ... specific to that gap
   - Store as `gapChannels: { "1-2": 1, "2-3": 3, ... }` on each route

2. **Updated route object structure (lines 1367-1381)**

   - Changed from `gridChannel: number` to `gapChannels: { gapKey: channelNum, ... }`
   - A connection spanning multiple gaps now has different channel numbers per gap

3. **Added `getGapChannel()` helper function (lines 1863-1879)**

   - Looks up the correct channel for a route's first gap
   - For downward routes: gap key is `${sourceRow}-${sourceRow+1}`
   - For upward routes: gap key is `${sourceRow-1}-${sourceRow}`

4. **Updated all rendering code to use per-gap channels**

   - Replaced `route.gridChannel` with `getGapChannel(route, direction)`
   - Affects merge junctions, smart routing, legacy routing, and simple routing

**Algorithm Summary:**

```text
Each gap gets independent channel numbering:

Gap 1-2 (2 connections):
├─ T4 > test1    (target at 0.25) → channel 1
└─ RPi > test1   (target at 0.25) → channel 1 (same target)

Gap 2-3 (6 connections):
├─ test2 > test3  (target at 0.9) → channel 1
├─ test3 > RPi    (target at 0.5, passes through) → channel 2
├─ T4 > test1     (target at 0.25, passes through) → channel 3
├─ test1 > T3     (target at 0.5) → channel 4
├─ test1 > T2     (target at 0.3) → channel 5
└─ test1 > T1     (target at 0.1) → channel 6
```

**Key Insight:** A connection like T4 > test1 (Row 1 → Row 2) only appears in Gap 1-2 with channel 1. The same connection does NOT appear in Gap 2-3.

---

### 2026-01-04: Rewrite - Unified Gap-Based Channel Assignment

**Files Modified:** `js/flowschem.js`

**Issue:** Channels were assigned separately for downward (Pass 1) and upward (Pass 2) connections. Pass-through connections (e.g., Row 1 → Row 3) were only counted in their originating gap, not in intermediate gaps they pass through. This caused channel collisions where multiple connections in the same gap were assigned the same channel number.

**Root Cause:** The two-pass algorithm assigned channels based on connection origin, not based on which gaps connections actually pass through.

**Changes Made:**

1. **Replaced two-pass algorithm with unified approach (lines 1164-1363)**

   - **Step 1**: Collect ALL connections from the section (both directions)
   - **Step 2**: For each gap, identify all connections that pass through it:
     - Downward: `source.row <= rowAbove AND target.row >= rowBelow`
     - Upward: `source.row >= rowBelow AND target.row <= rowAbove`
   - **Step 3**: Group connections by target (same-target connections share a channel)
   - **Step 4**: Sort by target column (rightmost first = channel 1), with secondary sort by target row (lower row first for ties)
   - **Step 5**: Assign global channel numbers that work across all gaps

2. **Removed `gapChannelsUsed` tracking**

   - No longer needed since channels are assigned globally, not per-gap with offsets

3. **Simplified route creation**

   - Single loop processes all connections
   - Direction determined by `source.row < target.row`

**Algorithm Summary:**

```text
For each gap, ALL connections passing through get unique channels:

Gap 2-3 example with 6 connections:
├─ test2 > test3  (target at 0.9) → channel 1
├─ test3 > RPi    (target at 0.5, row 1) → channel 2
├─ T4 > test1     (target at 0.25, row 2) → channel 3
├─ test1 > T3     (target at 0.5, row 3) → channel 4
├─ test1 > T2     (target at 0.3) → channel 5
└─ test1 > T1     (target at 0.1) → channel 6
```

**Channel Assignment Rules:**

- Rightmost target → lowest channel number (turns last, furthest from source)
- Leftmost target → highest channel number (turns first, closest to source)
- For same-column targets, upward targets (lower row) get priority

---

### 2026-01-04: Bug Fix - Exit Position Formula Correction

**Files Modified:** `js/flowschem.js`

**Issue:** Exit positions were calculated incorrectly, causing wires to route through wrong corridors. For Row 2 with 2 nodes (ESC Array at 0.25, test2 at 0.75), the exit positions were [0, 0.333, 0.667] instead of the expected [0, 0.5, 1.0].

**Root Cause:** The exit position formula used `e / (n+1)` instead of `e / n`, where n is the number of nodes in the row.

**Changes Made:**

1. **Fixed `calculateSectionLayout()` (line 700)**
   - Changed formula from `e / (nodeCount + 1)` to `e / nodeCount`
   - Exit positions now correctly align with node boundaries

2. **Fixed `getFloorExitPosition()` (line 740)**
   - Updated formula from `e / (n + 1)` to `e / n`

3. **Fixed `getCeilExitPosition()` (line 764)**
   - Updated formula from `e / (n + 1)` to `e / n`

**Formula Explanation:**

For n nodes with centrelines at (2k-1)/(2n) for k in [1..n]:

- Exit positions should be at e/n for e in [0..n]
- This places exits at the boundaries between nodes

**Example Fix (Row 2 with 2 nodes):**

- Node centrelines: 1/4 = 0.25 (ESC Array), 3/4 = 0.75 (test2)
- OLD exits: 0/3 = 0, 1/3 = 0.333, 2/3 = 0.667
- NEW exits: 0/2 = 0, 1/2 = 0.5, 2/2 = 1.0

The middle exit at 0.5 is now correctly positioned between ESC Array (0.25) and test2 (0.75).

---

### 2026-01-04: Bug Fix - Channel Collision Between Up/Down Connections

**Files Modified:** `js/flowschem.js`

**Issue:** Upward and downward connections through the same gap were assigned the same channel numbers independently, causing wire overlaps. For example, `ESC Array < T4` (upward) and `test2 > test3` (downward) both got channel 1 in the gap between rows 2 and 3.

**Root Cause:** PASS 1 (downward) and PASS 2 (upward) both assigned channels starting from 1, without coordinating across passes.

**Changes Made:**

1. **Added gap channel tracking (line 1165)**
   - `gapChannelsUsed` map tracks max channel used per gap
   - Key format: "rowAbove-rowBelow"

2. **Record downward channel usage (lines 1216-1219)**
   - After assigning downward channels, record count for the gap

3. **Offset upward channels (lines 1380-1397)**
   - Upward connections start from `channelOffset + 1` where offset = downward channels
   - Prevents collision with downward connections in same gap

**Example Fix:**

Gap between rows 2 and 3:

- Downward `test2 > test3`: channel 1
- Upward `ESC Array < T4`: channel 2 (offset by 1)

---

### 2026-01-04: Bug Fix - Adjacent Row Routing (No Exit Position)

**Files Modified:** `js/flowschem.js`

**Issue:** Adjacent-row upward connections (like row 3 → row 2) were incorrectly using exit position routing, adding unnecessary turns. The code was looking for `adjacentRowNum = source.row - 1`, which equals the target row for adjacent connections.

**Changes Made:**

1. **Added row distance check (lines 2217-2218, 2262)**
   - Calculate `rowDistance = source.row - target.row`
   - Only use exit position routing if `rowDistance > 1`

2. **Updated merge junction case (lines 2217-2225)**
   - Same distance check for merge junction path calculation

**Expected Behavior:**

For `ESC Array < T4` (row 3 → row 2, adjacent):

- Wire goes directly: T4 → channel → ESC Array (simple L-shape)
- No exit position turn needed

For `RPi < test3` (row 3 → row 1, multi-row):

- Wire uses exit position in row 2 for proper routing

---

### 2026-01-04: Bug Fix - Exit Position Selection for Wire Routing

**Files Modified:** `js/flowschem.js`

**Issue:** Wires were routing to incorrect exit positions, causing paths to overshoot far beyond the target before coming back. For example, a wire from T4 (column 0.70) to ESC Array (column 0.25) would go all the way to exit position 0 (far left), then travel back right to the target.

**Root Cause:** The `selectExitPositionForRow()` function was using FLOOR logic (largest exit <= target) for left-going wires, which picked an exit position to the LEFT of the target instead of BETWEEN the source and target.

**Changes Made:**

1. **Rewrote `selectExitPositionForRow()` function (lines 1799-1822)**
   - Now finds exit positions BETWEEN source and target columns
   - Picks the exit closest to the target (minimizes final horizontal segment)
   - Falls back to closest exit overall if none in range

**Example Fix:**

For T4 (0.70) → ESC Array (0.25) with exit positions [0, 0.5, 1.0]:

- OLD: Picked exit 0 (largest <= 0.25), wire went far left then back
- NEW: Picks exit 0.5 (in range [0.25, 0.70], closest to 0.25)
- Wire now goes: T4 (0.70) → exit 0.5 → ESC Array (0.25)

---

### 2026-01-04: Bug Fix - Upward Connection Routing (Interior Grid)

**Files Modified:** `js/flowschem.js`

**Issue:** Upward connections (using `<` operator) were routed to the SIDE of the section (outside the node bounds), causing wires to leave the section boundary, travel right, go up along the side, then travel left back to the target. This was inconsistent with downward connections which use interior grid routing.

**Root Cause:** The upward connection rendering code (lines 2166-2338) intentionally used "side routing" to avoid crossing downward channels. However, this caused visually confusing wire paths that went outside the section.

**Changes Made:**

1. **Changed upward connection routing from side to interior grid (lines 2166-2283)**
   - Removed side routing variables (`sectionMinX`, `sectionMaxX`, `sideMargin`, `sideX`)
   - Now uses same interior grid channel system as downward connections
   - Wire path: source TOP → grid channel → exit position → target channel → target BOTTOM

2. **Updated channel Y calculation (line 2195)**
   - Changed from `sourceY - channelSpacing` to `sourceY - (gridChannel * channelSpacing)`
   - Uses assigned grid channel, not a fixed offset

3. **Added exit position calculation for upward connections (lines 2204-2212, 2250-2255)**
   - Uses `selectExitPositionForRow()` to find appropriate exit position
   - Adjacent row is `source.row - 1` (row above source) for upward connections
   - Enables principled vertical routing through the grid

4. **Updated merge junction rendering (lines 2285-2338)**
   - Uses `exitX` instead of `sideX` for merge point
   - Junction dots placed on interior vertical bus, not at section edge

**Expected Behavior After Fix:**

For `ESC Array < T4` (T4 → ESC Array, upward connection):

- Wire exits from TOP of T4 (source)
- Travels UP to grid channel (in gap between rows)
- Travels HORIZONTAL to exit position
- Continues UP through grid
- Enters BOTTOM of ESC Array (target)

The wire now stays within the section bounds and uses the same grid channel system as downward connections.

---

### 2026-01-04: Bug Fix - Shared Port Ordering for Different-Row Connections

**Files Modified:** `js/flowschem.js`

**Issue:** Shared incoming ports (`incomingBottom`, `incoming`) were being placed in Set A (same-row-left) or Set D (same-row-right) instead of Set B/E (different-row). This caused incoming connections from lower/upper rows to appear before outgoing connections in port order.

**Root Cause:** In `sortPortsForEdge()`, shared ports with `otherNode: null` were being classified as "same-row" by default, but they actually represent connections from different rows.

**Changes Made:**

1. **Added `isDifferentRow` flag to shared bottom edge ports (line 1540)**
   - `incomingBottom` ports now include `isDifferentRow: true`
   - These are connections coming UP from sources BELOW the target node

2. **Added `isDifferentRow` flag to shared top edge ports (line 1598)**
   - `incoming` ports now include `isDifferentRow: true`
   - These are connections coming DOWN from sources ABOVE the target node

3. **Updated `sortPortsForEdge()` to check `isDifferentRow` flag (lines 954-972)**
   - Shared ports with `isDifferentRow: true` are placed in Set B (left) or Set E (right)
   - Shared ports without the flag remain in Set A (left) or Set D (right)
   - This ensures proper ordering: [A, B, C, D, E] = [same-row-left, diff-row-left, aligned, same-row-right, diff-row-right]

**Verification:**

Example scenario:

- ESC Array (row 1, col 0.75) with:
  - Outgoing to T1 (row 3, col 0.10) → Set B (different-row, left)
  - Outgoing to T2 (row 3, col 0.30) → Set B (different-row, left)
  - Outgoing to T3 (row 3, col 0.50) → Set B (different-row, left)
  - Incoming from T4 (row 3, col 0.70) → Set B (different-row, left) - NOW CORRECT!

All ports in Set B, sorted by column: T1, T2, T3, T4 (left-to-right)
T4 is now correctly positioned as the rightmost port.

---

### 2025-01-04: Phase 7 - Cross-Section Connections (COMPLETE)

**Files Modified:** `js/flowschem.js`

**Changes Made:**

1. **Improved channel calculation for cross-section connections (lines 2514-2534)**
   - Groups connections by target (incoming share one channel)
   - Assigns unique channel per target, not per connection
   - Consistent with within-section channel sharing rules

2. **Added port offset calculation for cross-section connections (lines 2536-2575)**
   - Source nodes with multiple outgoing get proper port offsets
   - Ports sorted left-to-right by target X position
   - Target ports default to center (offset 0) for shared incoming

3. **Implemented merge handling with junction dots (lines 2661-2692)**
   - Multiple incoming connections to same target merge at horizontal channel
   - Renders horizontal merge channel and vertical drop to target
   - Junction dots placed at n-1 positions (excludes drop point)
   - Uses same junction tolerance and radius as within-section

4. **Updated rendering logic (lines 2592-2659)**
   - Separate handling for single vs. multiple incoming connections
   - Single connections render full path directly
   - Multiple incoming defer drop segment to merge rendering
   - Port offsets applied to source X positions

**Verification:**

- Connections to same target share channel - IMPLEMENTED
- Source port offsets calculated for multiple outgoing - IMPLEMENTED
- Junction dots at n-1 positions, drop point excluded - IMPLEMENTED
- Reviewed against Section 9 of `connection_routing_spec.md`

**Test Cases:**

- 3 connections from different sections to same target: share 1 channel, 2 junction dots
- Source with 3 outgoing cross-section: 3 ports, sorted left-to-right by target
- Bidirectional cross-section: arrows at both ends

**No Specification Changes Required**

---

### 2025-01-04: Phase 5 - Wire Path Generation (COMPLETE)

**Files Modified:** `js/flowschem.js`

**Changes Made:**

1. **Added exit position helper functions (lines 1756-1797)**
   - `exitPositionToPixelX(exitPos, bounds)` - converts exit position (0-1) to pixel X coordinate
   - `selectExitPositionForRow(source, target, rowData)` - selects appropriate exit position for routing
   - Left-bound wires use largest exit position <= target centreline
   - Right-bound wires use smallest exit position >= target centreline

2. **Updated `renderConnectionsInSection()` function signature (line 1844)**
   - Added optional parameters: `sectionLayout` and `bounds`
   - Updated call site at line 2606 to pass these parameters

3. **Implemented exit position-based routing for straight multi-row connections (lines 1959-1987)**
   - Uses adjacent row's exit positions instead of obstacle detection
   - Selects exit position based on target direction (left/right)
   - Routes: source → channel → exit position → near-target channel → target

4. **Implemented exit position-based routing for non-aligned multi-row connections (lines 2039-2063)**
   - Same exit position selection logic as straight connections
   - Maintains grid channel for horizontal routing near source
   - Falls back to legacy obstacle detection when layout unavailable

**Verification:**

- Multi-row connections now use pre-calculated exit positions - IMPLEMENTED
- Exit position selection respects target direction - IMPLEMENTED
- Legacy fallback preserved for backwards compatibility - IMPLEMENTED
- Reviewed against Section 6 of `connection_routing_spec.md`

**Test Cases:**

- Wire from row 0 to row 2 uses exit position in row 1
- Left-bound wire uses floor exit position
- Right-bound wire uses ceil exit position
- Single-row connections unaffected (use direct routing)

**No Specification Changes Required**

---

### 2025-01-04: Phase 4 - Channel Calculation (COMPLETE)

**Files Modified:** `js/flowschem.js`

**Changes Made:**

1. **Rewrote `calculateGridHeight()` function (lines 1008-1095)**
   - Now iterates through ALL nodes in section, not just rowAbove nodes
   - Considers pass-through connections from rows above that continue to rows below
   - Handles both downward AND upward connections
   - Groups channels by target (incoming wires share one channel)

2. **Updated gap detection logic (lines 1056-1066)**
   - Downward: `sourceRow <= rowAboveNum && targetRow >= rowBelowNum`
   - Upward: `sourceRow >= rowBelowNum && targetRow <= rowAboveNum`
   - Either direction uses the same physical gap space

3. **Improved documentation (lines 1008-1033)**
   - Clarified the three types of channels: exit, entry, pass-through
   - Documented channel sharing rules
   - Updated JSDoc with correct parameter descriptions

**Verification:**

- Pass-through channels counted: wires from row 0 to row 3 now count in gaps [0-1], [1-2], [2-3] - IMPLEMENTED
- Bidirectional connections correctly mark gap - IMPLEMENTED
- Upward connections (< operator) now properly count toward channel height - IMPLEMENTED
- Reviewed against Section 7 of `connection_routing_spec.md`

**Test Cases:**

- Connection from row 0 to row 2: uses gaps [0-1] and [1-2]
- 3 connections to same target: all share 1 channel (not 3)
- Upward + downward through same gap: both counted

**No Specification Changes Required**

---

### 2025-01-04: Phase 3 - Port Ordering Algorithm (COMPLETE)

**Files Modified:** `js/flowschem.js`

**Changes Made:**

1. **Added node references to port assignment entries (lines 1122-1152, 1267-1297)**
   - Port entries now include `source` and `target` node references
   - Enables 5-set algorithm to calculate effective positions
   - Both downward and upward flow connections updated

2. **Added `sortPortsForEdge()` function (lines 934-1006)**
   - Wrapper for 5-set algorithm working with edge port entries
   - Classifies ports by "other" node position relative to center node
   - Handles shared ports (no single other node) by column position only
   - Sets: [A, B, C, D, E] = [same-row-left, diff-row-left, aligned, same-row-right, diff-row-right]
   - Uses `calculateEffectivePosition()` for multi-row connections

3. **Updated bottom edge port calculation (lines 1369-1438)**
   - Changed from `sortKey` to `otherCol`/`otherNode` properties
   - Integrated 5-set sorting via `sortPortsForEdge()`
   - Fallback to simple column sort if center node not found

4. **Updated top edge port calculation (lines 1449-1519)**
   - Same changes as bottom edge
   - Uses same `sortPortsForEdge()` function for consistency

**Verification:**

- 5-set ordering: A (same-row-left), B (diff-row-left), C (aligned), D (same-row-right), E (diff-row-right) - IMPLEMENTED
- Effective position for multi-row: uses `calculateEffectivePosition()` - IMPLEMENTED
- Shared ports sorted by average column position - IMPLEMENTED
- Reviewed against Section 5 of `connection_routing_spec.md`

**Test Cases:**

- Source with targets at columns 0.25 (left), 0.5 (aligned), 0.75 (right): ports ordered [0.25, 0.5, 0.75]
- Multi-row: target in row+2 at col 0.3 uses exit position to determine left/right classification
- Bidirectional + unidirectional mix: all properly interleaved by position

**No Specification Changes Required**

---

### 2025-01-04: Phase 2 - Port Count Calculation (COMPLETE)

**Files Modified:** `js/flowschem.js`

**Changes Made:**

1. **Extended port tracking structure (lines 996-1020, 1145-1157)**
   - Added 8 port categories per node:
     - `outgoing`, `incoming` (unidirectional downward)
     - `bidirectionalOut`, `bidirectionalIn` (bidirectional downward)
     - `outgoingTop`, `incomingBottom` (unidirectional upward)
     - `bidirectionalOutTop`, `bidirectionalInBottom` (bidirectional upward)

2. **Bidirectional tracking (lines 1023-1045, 1160-1182)**
   - Bidirectional connections now tracked separately from unidirectional
   - Each bidirectional gets its own port on BOTH source and target nodes
   - Unidirectional incoming still shares one port (for junction merging)

3. **Port offset calculation (lines 1214-1365)**
   - Bottom edge now includes: `outgoing + bidirectionalOut + bidirectionalInBottom + incomingBottom(shared)`
   - Top edge now includes: `incoming(shared) + bidirectionalIn + bidirectionalOutTop + outgoingTop`
   - Each bidirectional port gets its own offset
   - All unidirectional incoming share one offset (applied to all routes)

**Verification:**

- Port count formula: `outgoing + bidirectional + min(1, incoming)` - IMPLEMENTED
- Bidirectional gets own port on both nodes - IMPLEMENTED
- Unidirectional incoming shares one port - IMPLEMENTED
- Reviewed against Sections 2, 4 of `connection_routing_spec.md`

**Test Cases:**

- Node with 3 outgoing + 1 bidirectional + 2 incoming = 5 ports (3+1+1)
- Bidirectional A<>B: A gets own port, B gets own port (not shared)
- 3 unidirectional incoming to same node: all share 1 port

**No Specification Changes Required**

---

### 2025-01-04: Phase 1 - Core Data Structures (COMPLETE)

**Files Modified:** `js/flowschem.js`

**Changes Made:**

1. **Updated `calculateSectionLayout()` function (lines 638-721)**
   - Added exit positions calculation for each row: `e/(n+1)` for e in [0..n]
   - Each row now stores `exitPositions` array in layout
   - Updated JSDoc to document new exitPositions return value
   - Initialized `node.ports` object with `top` and `bottom` arrays for each node

2. **Added `getFloorExitPosition()` function (lines 723-745)**
   - Finds largest exit position <= target centreline
   - Used for routing wires to targets on the LEFT of source
   - Returns 0 (leftmost) if no valid position found

3. **Added `getCeilExitPosition()` function (lines 747-769)**
   - Finds smallest exit position >= target centreline
   - Used for routing wires to targets on the RIGHT of source
   - Returns 1.0 (rightmost) if no valid position found

4. **Added `calculateEffectivePosition()` function (lines 771-814)**
   - Calculates effective position for port ordering
   - Same/adjacent row: uses target centreline directly
   - Multi-row: calculates exit position wire will use in adjacent row
   - Enables proper left-to-right port ordering that minimizes crossings

**Verification:**

- Reviewed against Sections 1.3, 5.3 of `connection_routing_spec.md`
- Exit position formula matches: `e / (n + 1)` for e in [0, n]
- Floor/ceil functions match spec pseudocode exactly
- Effective position calculation matches spec Section 5.2

**Test Cases:**

- 3 nodes in row: exit positions = [0, 0.25, 0.5, 0.75, 1.0]
- 2 nodes in row: exit positions = [0, 0.333, 0.667, 1.0]
- 1 node in row: exit positions = [0, 0.5, 1.0]

**No Specification Changes Required**

---

### 2025-01-04: Phase 6 - Junction Dot Fix (COMPLETE)

**Files Modified:** `js/flowschem.js`

**Changes Made:**

1. **Downward junction dots (lines 1506-1537)**
   - Added comment documenting the n-1 rule
   - Added `junctionTolerance` constant (2 pixels)
   - Changed loop to exclude dots at `targetX` position (the drop point)
   - Dots now only placed where `Math.abs(srcX - targetX) > junctionTolerance`

2. **Upward junction dots (lines 1640-1689)**
   - Added comment documenting the n-1 rule
   - Moved vertical bus rendering before dot placement for clarity
   - Added logic to find the "drop point" (sourceChannelY closest to targetChannelY)
   - Dots now only placed at positions NOT matching the drop point

**Verification:**
- Reviewed against Section 8 of `connection_routing_spec.md`
- All requirements met: n-1 dots, drop point excluded
- No specification changes required

**Test Cases:**
- 2 wires merging: 1 dot drawn
- 3 wires merging: 2 dots drawn
- Single wire: 0 dots drawn

---

## Executive Summary

The current implementation has significant gaps compared to the routing specification. This document details what needs to change and provides a phased implementation plan.

---

## 1. Gap Analysis

### 1.1 Port Count Calculation

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Incoming ports | Each incoming connection gets separate port | All incoming share ONE port | **MAJOR** |
| Port formula | Counts all connections individually | `outgoing + bidirectional + min(1, incoming)` | **MAJOR** |
| Location | Lines 876-892 in `buildConnectionRoutes()` | Spec Section 4 | - |

**Current Code Issue:**
```javascript
// Line 889: Each incoming gets its own port entry
portAssignments[conn.target.id].incoming.push({
    sourceCol: conn.source.column,
    routeIndex: routeIndex
});
```

**Required Change:** Track incoming connections separately and merge them into a single shared port.

---

### 1.2 Port Ordering Algorithm

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Sort key | Simple target column position | Effective position (with exit position for multi-row) | **MAJOR** |
| Multi-row handling | No special handling | Use exit position in adjacent row | **MAJOR** |
| Set-based ordering | Not implemented | 5 sets: [A, B, C, D, E] | **MAJOR** |
| Edge grouping | Uses -1000/+1000 bias hack | Proper left/right/center ordering | **MODERATE** |
| Location | Lines 1040-1118 | Spec Section 5 | - |

**Current Code Issue:**
```javascript
// Line 1070: Arbitrary bias instead of proper ordering
sortKey: port.sourceCol - 1000,  // Bias to place on left side
```

**Required Change:** Implement the 5-set ordering algorithm with effective position calculation.

---

### 1.3 Exit Position System

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Exit position calculation | **NOT IMPLEMENTED** | `exit_position(e, n) = e / (n + 1)` | **CRITICAL** |
| Storage in layout | Not stored | Should be stored per row | **CRITICAL** |
| Usage in routing | Ad-hoc obstacle avoidance | Explicit exit position selection | **MAJOR** |
| Location | N/A | Spec Section 1.3, 5.3, 6.2 | - |

**Required Change:** Add exit position calculation to `calculateSectionLayout()` and use in routing.

---

### 1.4 Channel Calculation

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Turn channels | Not counted | Must count turns at intermediate rows | **MAJOR** |
| Pass-through wires | Not counted | Must count wires passing through row gap | **MAJOR** |
| Scope | Only adjacent row pairs | Must consider full wire paths | **MAJOR** |
| Location | Lines 728-763 `calculateGridHeight()` | Spec Section 7 | - |

**Current Code Issue:**
```javascript
// Line 738: Only checks if target is at or below next row
if (targetNode && targetNode.row >= rowBelow.rowNum) {
    // Doesn't account for wires that PASS THROUGH to lower rows
}
```

**Required Change:** Implement multi-pass channel calculation that accounts for:
1. Exit channels (wire leaving a source)
2. Entry channels (wire entering a target)
3. Pass-through channels (wire continuing to lower rows)
4. Turn channels (wire changing horizontal position)

---

### 1.5 Same-Row Connection Handling

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Edge selection | Mixed with other connections | Both nodes use BOTTOM edge | **MODERATE** |
| Routing path | Uses same logic as cross-row | Down → Across → Up pattern | **MODERATE** |
| Detection | Not explicitly identified | Should be handled as special case | **MODERATE** |
| Location | Mixed in `buildConnectionRoutes()` | Spec Section 10 | - |

**Required Change:** Add explicit same-row connection detection and routing.

---

### 1.6 Junction Dot Placement

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Dot count | Dot at every source position | `n - 1` dots (exclude drop point) | **MODERATE** |
| Placement logic | All source X positions | Exclude position directly above target | **MODERATE** |
| Location | Lines 1507-1526 | Spec Section 8 | - |

**Current Code Issue:**
```javascript
// Line 1518: Places dot at EVERY source position
for (const srcX of sourceXPositions) {
    svg += `<circle cx="${srcX}" cy="${channelY}" r="${junctionRadius}" fill="${color}"/>`;
}
```

**Required Change:** Exclude the drop point position from junction dots.

---

### 1.7 Multi-Row Wire Routing

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Vertical path | Ad-hoc obstacle detection | Use exit positions between nodes | **MAJOR** |
| Horizontal path | Goes to arbitrary "safe" position | Goes to calculated exit position | **MAJOR** |
| Path segments | Variable | Structured: exit → horizontal → drop → repeat | **MAJOR** |
| Location | Lines 1388-1491 | Spec Section 6 | - |

**Current Code Issue:**
```javascript
// Line 1408: Uses arbitrary "obstacle edge + spacing" instead of exit position
const safeX = goRight
    ? obstacleMaxX + channelSpacing
    : obstacleMinX - channelSpacing;
```

**Required Change:** Calculate and use proper exit positions for vertical routing.

---

### 1.8 Data Structures

| Aspect | Current Implementation | Specification | Gap |
|--------|----------------------|---------------|-----|
| Node structure | Missing port arrays | Should have `ports_top`, `ports_bottom` | **MODERATE** |
| Port structure | Ad-hoc tracking | Should be formal `Port` objects | **MODERATE** |
| Connection structure | Basic | Should include assigned ports | **MODERATE** |
| Row data | Only centrelines | Should include exit positions | **MODERATE** |

---

## 2. Implementation Phases

### Phase 1: Core Data Structures (Foundation)

**Objective:** Establish the data structures needed for proper routing.

**Files to modify:** `flowschem.js`

**Tasks:**

1. **Add exit position calculation to layout**
   ```javascript
   // In calculateSectionLayout(), add to each row:
   row.exitPositions = [];
   for (let e = 0; e <= row.nodeCount; e++) {
       row.exitPositions.push(e / (row.nodeCount + 1));
   }
   ```

2. **Create Port data structure**
   ```javascript
   // New helper to create port objects
   function createPort(nodeId, edge, index, connections) {
       return {
           nodeId,
           edge,        // 'top' or 'bottom'
           index,       // position index (0 = leftmost)
           offsetX: 0,  // calculated later
           connections: connections || [],
           isIncomingShared: false
       };
   }
   ```

3. **Add port arrays to nodes during layout**
   ```javascript
   // In calculateSectionLayout(), initialize:
   node.ports = {
       top: [],
       bottom: []
   };
   ```

**Estimated complexity:** Medium
**Dependencies:** None

---

### Phase 2: Port Count and Incoming Merge (Critical Fix)

**Objective:** Fix the fundamental port counting error.

**Tasks:**

1. **Create port counting function**
   ```javascript
   function calculatePortCount(node, edge, connections) {
       const edgeConns = connections.filter(c => usesEdge(c, node, edge));

       const outgoing = edgeConns.filter(c => c.from === node.id && c.type !== 'bidirectional').length;
       const bidirectional = edgeConns.filter(c => c.type === 'bidirectional').length;
       const incoming = edgeConns.filter(c => c.to === node.id && c.type !== 'bidirectional').length;

       return outgoing + bidirectional + Math.min(1, incoming);
   }
   ```

2. **Modify `buildConnectionRoutes()` to handle incoming merge**
   - Track incoming connections per node edge
   - Assign all incoming to single shared port
   - Store merge information for junction rendering

3. **Update port assignment logic**
   - Incoming connections reference shared port
   - Calculate shared port position based on average source direction

**Estimated complexity:** High
**Dependencies:** Phase 1

---

### Phase 3: Effective Position and Port Ordering (Critical Fix)

**Objective:** Implement the 5-set port ordering algorithm.

**Tasks:**

1. **Create exit position helper functions**
   ```javascript
   function getFloorExitPosition(targetCentreline, rowNodeCount) {
       for (let e = rowNodeCount; e >= 0; e--) {
           const exitPos = e / (rowNodeCount + 1);
           if (exitPos <= targetCentreline) return exitPos;
       }
       return 0;
   }

   function getCeilExitPosition(targetCentreline, rowNodeCount) {
       for (let e = 0; e <= rowNodeCount; e++) {
           const exitPos = e / (rowNodeCount + 1);
           if (exitPos >= targetCentreline) return exitPos;
       }
       return 1.0;
   }
   ```

2. **Create effective position calculator**
   ```javascript
   function calculateEffectivePosition(source, target, sectionLayout) {
       const rowDiff = Math.abs(target.row - source.row);

       if (rowDiff <= 1) {
           return target.column;  // Same or adjacent row
       }

       // Multi-row: calculate exit position in adjacent row
       const adjacentRowIndex = target.row > source.row
           ? source.row  // Row index (0-based) of row below source
           : source.row - 2;  // Row index of row above source

       const adjacentRow = sectionLayout.rows[adjacentRowIndex];
       const nodeCount = adjacentRow ? adjacentRow.nodeCount : 1;

       if (target.column <= source.column) {
           return getFloorExitPosition(target.column, nodeCount);
       } else {
           return getCeilExitPosition(target.column, nodeCount);
       }
   }
   ```

3. **Implement 5-set sorting**
   ```javascript
   function sortConnectionsForPortOrder(source, connections, sectionLayout) {
       const TOLERANCE = 0.01;

       // Partition into sets
       const setA = [];  // Same row, left
       const setB = [];  // Different row, left
       const setC = [];  // Aligned
       const setD = [];  // Same row, right
       const setE = [];  // Different row, right

       for (const conn of connections) {
           const target = conn.target;
           const effectivePos = calculateEffectivePosition(source, target, sectionLayout);
           const sameRow = target.row === source.row;

           if (Math.abs(effectivePos - source.column) <= TOLERANCE) {
               setC.push({ conn, effectivePos, rowDist: Math.abs(target.row - source.row) });
           } else if (effectivePos < source.column) {
               if (sameRow) {
                   setA.push({ conn, effectivePos });
               } else {
                   setB.push({ conn, effectivePos, rowDist: Math.abs(target.row - source.row) });
               }
           } else {
               if (sameRow) {
                   setD.push({ conn, effectivePos });
               } else {
                   setE.push({ conn, effectivePos, rowDist: Math.abs(target.row - source.row) });
               }
           }
       }

       // Sort each set
       setA.sort((a, b) => a.effectivePos - b.effectivePos);
       setB.sort((a, b) => a.effectivePos - b.effectivePos || a.rowDist - b.rowDist);
       setC.sort((a, b) => a.rowDist - b.rowDist);
       setD.sort((a, b) => a.effectivePos - b.effectivePos);
       setE.sort((a, b) => a.effectivePos - b.effectivePos || a.rowDist - b.rowDist);

       // Combine: [A, B, C, D, E]
       return [...setA, ...setB, ...setC, ...setD, ...setE].map(item => item.conn);
   }
   ```

4. **Replace current port sorting logic** (lines 1047-1118)

**Estimated complexity:** High
**Dependencies:** Phase 1

---

### Phase 4: Channel Calculation Overhaul

**Objective:** Properly calculate channels including pass-through and turn channels.

**Tasks:**

1. **Create comprehensive channel calculator**
   ```javascript
   function calculateChannelsBetweenRows(rowAboveIndex, sectionLayout, allConnections) {
       const channelTypes = new Map();  // conn.id -> channel type

       for (const conn of allConnections) {
           const sourceRow = conn.source.row;
           const targetRow = conn.target.row;
           const rowAbove = rowAboveIndex + 1;  // 1-indexed
           const rowBelow = rowAboveIndex + 2;

           // Check if connection uses this gap
           if (sourceRow <= rowAbove && targetRow >= rowBelow) {
               if (sourceRow === rowAbove) {
                   channelTypes.set(`${conn.id}_exit`, 'exit');
               }
               if (targetRow === rowBelow) {
                   channelTypes.set(`${conn.id}_entry`, 'entry');
               } else if (targetRow > rowBelow) {
                   channelTypes.set(`${conn.id}_pass`, 'pass');

                   // Check if wire turns at this row
                   if (needsTurnAtRow(conn, rowBelow, sectionLayout)) {
                       channelTypes.set(`${conn.id}_turn`, 'turn');
                   }
               }
           }
       }

       return Math.max(3, channelTypes.size);
   }
   ```

2. **Implement turn detection**
   ```javascript
   function needsTurnAtRow(conn, rowNum, sectionLayout) {
       // Wire needs to turn if exit position changes between rows
       const currentExitPos = getExitPositionForRow(conn, rowNum - 1, sectionLayout);
       const nextExitPos = getExitPositionForRow(conn, rowNum, sectionLayout);
       return Math.abs(currentExitPos - nextExitPos) > 0.01;
   }
   ```

3. **Replace `calculateGridHeight()` function**

**Estimated complexity:** High
**Dependencies:** Phases 1-3

---

### Phase 5: Wire Path Generation

**Objective:** Generate proper wire paths using exit positions.

**Tasks:**

1. **Create wire path builder**
   ```javascript
   function buildWirePath(source, target, sectionLayout, assignedChannels) {
       const path = [];
       const sourceRow = source.row;
       const targetRow = target.row;

       if (sourceRow === targetRow) {
           // Same-row routing
           return buildSameRowPath(source, target);
       }

       const goingDown = targetRow > sourceRow;
       let currentRow = sourceRow;
       let currentX = source.pixelX + source.portOffset;
       let currentY = goingDown ? source.pixelY + source.pixelHeight : source.pixelY;

       while (currentRow !== targetRow) {
           const nextRow = goingDown ? currentRow + 1 : currentRow - 1;
           const channel = assignedChannels.get(`${source.id}_${target.id}_${currentRow}`);

           // Get exit position for this segment
           const exitPos = getExitPositionForRow(
               { source, target },
               currentRow,
               sectionLayout
           );
           const exitX = convertToPixelX(exitPos, sectionLayout);

           // Add path segments
           path.push({ type: 'vertical', from: currentY, to: channelY });

           if (Math.abs(currentX - exitX) > 1) {
               path.push({ type: 'horizontal', from: currentX, to: exitX, y: channelY });
               currentX = exitX;
           }

           currentRow = nextRow;
       }

       // Final segment to target
       path.push({ type: 'vertical', from: currentY, to: target.pixelY });

       return path;
   }
   ```

2. **Replace current path rendering in `renderConnectionsInSection()`**

3. **Handle same-row connections separately**
   ```javascript
   function buildSameRowPath(source, target) {
       // Both use bottom edge
       // Path: down → horizontal → up
       const channelY = source.pixelY + source.pixelHeight + channelSpacing;

       return [
           { type: 'vertical', x: source.pixelX, from: source.bottom, to: channelY },
           { type: 'horizontal', y: channelY, from: source.pixelX, to: target.pixelX },
           { type: 'vertical', x: target.pixelX, from: channelY, to: target.bottom }
       ];
   }
   ```

**Estimated complexity:** Very High
**Dependencies:** Phases 1-4

---

### Phase 6: Junction Dot Refinement

**Objective:** Fix junction dot count and placement.

**Tasks:**

1. **Fix junction dot count**
   ```javascript
   function renderJunctionDots(sourceXPositions, channelY, targetX, color, radius) {
       let svg = '';

       // Sort positions
       const sortedPositions = [...sourceXPositions].sort((a, b) => a - b);

       // Place dots at n-1 positions (exclude the one closest to target drop point)
       for (const x of sortedPositions) {
           // Skip if this is the drop point (directly above target)
           if (Math.abs(x - targetX) > 1) {
               svg += `<circle cx="${x}" cy="${channelY}" r="${radius}" fill="${color}"/>`;
           }
       }

       return svg;
   }
   ```

2. **Update merge rendering logic** (around line 1507)

**Estimated complexity:** Low
**Dependencies:** None (can be done in parallel)

---

### Phase 7: Cross-Section Connections

**Objective:** Properly handle connections between different sections.

**Tasks:**

1. **Identify cross-section connections early**
   - During parsing, flag connections that span sections
   - Calculate inter-section routing channels

2. **Add section edge ports**
   - Virtual ports on section boundaries
   - Order by destination direction

3. **Route through section gap**
   - Exit to section edge
   - Cross inter-section space
   - Enter target section

**Estimated complexity:** Medium
**Dependencies:** Phases 1-5

---

## 3. Implementation Order

```
Phase 1 (Foundation)     ─────────────────────────────────────►
                                    │
Phase 6 (Junction Fix)   ──────────►│  (parallel, independent)
                                    │
Phase 2 (Port Count)     ───────────┴─────────────────────────►
                                              │
Phase 3 (Port Order)     ─────────────────────┴───────────────►
                                                      │
Phase 4 (Channels)       ─────────────────────────────┴───────►
                                                          │
Phase 5 (Wire Paths)     ─────────────────────────────────┴───►
                                                              │
Phase 7 (Cross-Section)  ─────────────────────────────────────┴►
```

---

## 4. Testing Strategy

### 4.1 Unit Test Cases

Each phase should be verified with these test scenarios:

1. **Single node in row** - exit positions at 0 and 1
2. **Two nodes, one connection** - basic routing
3. **Three nodes, multiple connections** - port ordering
4. **Multi-row spanning** - exit position usage
5. **Same-row connection** - bottom edge routing
6. **Multiple incoming to one target** - junction merging
7. **Bidirectional connections** - dual arrows
8. **Mixed connection types** - complex scenarios

### 4.2 Visual Test Cases

Update the demo in README.md to include:

```
@nodes
test-1
A > B, C, D

test-2
B > E
C > E
D > E

test-3
E > F

test-4
F
```

This tests:
- One source to multiple targets (splitting)
- Multiple sources to one target (merging with junctions)
- Multi-row spanning
- Port ordering

---

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing diagrams | High | Keep old code path, add feature flag |
| Performance degradation | Medium | Profile before/after, optimize hot paths |
| Complex debugging | Medium | Add verbose logging mode |
| Incomplete edge cases | Medium | Comprehensive test suite |

---

## 6. Estimated Effort

| Phase | Effort | Duration |
|-------|--------|----------|
| Phase 1 | Medium | 2-3 hours |
| Phase 2 | High | 4-6 hours |
| Phase 3 | High | 4-6 hours |
| Phase 4 | High | 4-6 hours |
| Phase 5 | Very High | 6-8 hours |
| Phase 6 | Low | 1 hour |
| Phase 7 | Medium | 3-4 hours |
| **Total** | - | **24-34 hours** |

---

## 7. Files to Modify

| File | Changes |
|------|---------|
| `js/flowschem.js` | Major refactoring of routing logic |
| `assets/connection_routing_spec.md` | Reference (no changes) |
| `README.md` | Update demo examples after implementation |

---

## 8. Success Criteria

The implementation is complete when:

1. All test cases pass visual inspection
2. Port counts match the formula: `outgoing + bidirectional + min(1, incoming)`
3. Ports are ordered left-to-right by effective position
4. Multi-row wires use exit positions (never cross nodes)
5. Junction dots = n-1 for n incoming wires
6. Same-row connections use bottom edge on both nodes
7. Channels are correctly calculated including pass-through and turns
8. No wire crossings occur (except at explicit junctions)
