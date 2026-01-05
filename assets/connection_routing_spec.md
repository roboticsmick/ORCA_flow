# Connection Routing Specification

## 1. Core Concepts

### 1.1 Coordinate System

All horizontal positions are expressed as fractions of the section width, normalized to a common denominator for comparison.

### 1.2 Node Centreline

For `n` nodes in a row, node `k` (1-indexed) has centreline position:

```
centreline(k, n) = (2k - 1) / (2n)
```

Examples:
- 3 nodes: 1/6, 3/6, 5/6
- 4 nodes: 1/8, 3/8, 5/8, 7/8
- 2 nodes: 1/4, 3/4

### 1.3 Row Exit Positions

Exit positions are the vertical corridors between nodes where wires can travel vertically without intersecting nodes. For `n` nodes in a row, there are `n + 1` exit positions:

```
exit_position(e, n) = e / (n + 1)    for e in [0, 1, ..., n]
```

Or equivalently using node spacing:

```
exit_position(e, n) = (2e) / (2n + 2)    for e in [0, 1, ..., n]
```

Examples for 3 nodes (n=3):
- Exit positions: 0/4, 1/4, 2/4, 3/4, 4/4 = 0, 0.25, 0.5, 0.75, 1.0
- Node centrelines: 1/6, 3/6, 5/6 = 0.167, 0.5, 0.833

```
Exit:   0        1/4      2/4       3/4       1
        |         |        |         |        |
Row:   [ node1 ]    [ node2 ]    [ node3 ]
Ctr:      1/6         3/6          5/6
```

### 1.4 Horizontal Routing Channels

Channels are horizontal lanes between rows where wires travel horizontally. Each channel has a Y-coordinate calculated from the row spacing.

```
channel_y(row, channel_num, direction) =
    if direction == 'down':
        row_bottom_y + (channel_num * channel_spacing)
    if direction == 'up':
        row_top_y - (channel_num * channel_spacing)
```

---

## 2. Connection Types

### 2.1 Unidirectional Outgoing (Source Node)

- Symbol: `>`
- Wire exits source node, arrow drawn at destination node pointing INTO destination
- Multiple outgoing wires can share a node edge
- Each outgoing wire gets its own port

### 2.2 Unidirectional Incoming (Destination Node)

- Symbol: `<`
- Wire enters destination node, arrow drawn at destination node pointing INTO destination
- **All incoming wires to the same port share ONE port**
- Wires merge at a horizontal channel with junction dots
- Only ONE arrow is drawn (at the final entry point to node)

### 2.3 Bidirectional

- Symbol: `<>`
- Arrows at BOTH ends, each pointing INTO their respective nodes
- Each bidirectional connection gets its own port on each node
- Treated as "outgoing" for port counting purposes on both nodes

---

## 3. Edge Selection Rules

### 3.1 Bottom Edge (Source)

Used when target is:
- Same row (any position)
- Any lower row (row number > source row)

### 3.2 Top Edge (Source)

Used when target is:
- Any upper row (row number < source row)

### 3.3 Top Edge (Destination)

Entry point when source is:
- Any upper row

### 3.4 Bottom Edge (Destination)

Entry point when source is:
- Same row
- Any lower row (wire goes down, across, then back up)

---

## 4. Port Count Formula

### 4.1 Total Ports on an Edge

```
ports_on_edge = outgoing_count + bidirectional_count + min(1, incoming_count)
```

Where:
- `outgoing_count`: Number of unidirectional outgoing connections using this edge
- `bidirectional_count`: Number of bidirectional connections using this edge
- `incoming_count`: Number of unidirectional incoming connections using this edge
- `min(1, incoming_count)`: All incoming connections share ONE port (equals 0 if none, 1 if any)

### 4.2 Example Calculation

For node2 with connections:
- `node2 > node3` (outgoing, same row) → bottom edge, outgoing
- `node2 < node5` (incoming from node5) → bottom edge, incoming
- `node2 > node4` (outgoing, lower row) → bottom edge, outgoing
- `node2 <> node7` (bidirectional, lower row) → bottom edge, bidirectional
- `node2 < node10` (incoming from node10) → bottom edge, incoming
- `node2 > node13` (outgoing, lower row) → bottom edge, outgoing

Bottom edge ports:
- outgoing_count = 3 (node3, node4, node13)
- bidirectional_count = 1 (node7)
- incoming_count = 2 (node5, node10)

```
ports = 3 + 1 + min(1, 2) = 3 + 1 + 1 = 5 ports
```

---

## 5. Port Ordering Algorithm

### 5.1 Overview

Ports are ordered LEFT to RIGHT based on the effective horizontal position of their destinations. This minimizes wire crossings.

### 5.2 Effective Position Calculation

For each connection from source node S to target node T:

#### Case 1: Target in Same Row

```
effective_position = T.centreline
```

#### Case 2: Target in Adjacent Row (S.row + 1 or S.row - 1)

```
effective_position = T.centreline
```

#### Case 3: Target Beyond Adjacent Row

The wire must use an exit position to travel vertically. Calculate the exit position the wire will use:

```
if T.centreline <= S.centreline:
    # Target is to the LEFT - use exit position to the left of target
    effective_position = floor_exit_position(T.centreline, adjacent_row)
else:
    # Target is to the RIGHT - use exit position to the right of target
    effective_position = ceil_exit_position(T.centreline, adjacent_row)
```

Where `floor_exit_position` and `ceil_exit_position` find the nearest exit position in the adjacent row that is <= or >= the target centreline.

### 5.3 Exit Position Selection Functions

```python
def floor_exit_position(target_centreline, row_node_count):
    """Find largest exit position <= target_centreline"""
    n = row_node_count
    for e in range(n, -1, -1):  # n down to 0
        exit_pos = e / (n + 1)
        if exit_pos <= target_centreline:
            return exit_pos
    return 0  # Leftmost exit

def ceil_exit_position(target_centreline, row_node_count):
    """Find smallest exit position >= target_centreline"""
    n = row_node_count
    for e in range(0, n + 1):  # 0 up to n
        exit_pos = e / (n + 1)
        if exit_pos >= target_centreline:
            return exit_pos
    return 1.0  # Rightmost exit
```

### 5.4 Sorting Algorithm

```python
def sort_connections_for_port_order(source_node, connections):
    """
    Sort connections to determine port order (left to right).

    @param source_node: The node whose ports we're ordering
    @param connections: List of connections from this node
    @return: Sorted list with leftmost destinations first
    """

    def get_sort_key(connection):
        target = connection.target
        source = source_node

        # Calculate effective position
        row_diff = abs(target.row - source.row)

        if row_diff <= 1:
            # Same row or adjacent row: use target centreline
            effective_pos = target.centreline
        else:
            # Multi-row: use exit position in adjacent row
            adjacent_row = source.row + 1 if target.row > source.row else source.row - 1
            adjacent_row_node_count = get_node_count_in_row(adjacent_row)

            if target.centreline <= source.centreline:
                effective_pos = floor_exit_position(target.centreline, adjacent_row_node_count)
            else:
                effective_pos = ceil_exit_position(target.centreline, adjacent_row_node_count)

        # Secondary sort: prefer closer rows for same effective position
        return (effective_pos, row_diff)

    return sorted(connections, key=get_sort_key)
```

### 5.5 Complete Port Order Sets

Given source node S with centreline `S.ctr`, partition connections into ordered sets:

**Set A: Left side, same row**
```
Condition: T.row == S.row AND T.centreline < S.centreline
Sort by: T.centreline ascending (leftmost first)
```

**Set B: Left side, different row**
```
Condition: T.row != S.row AND effective_position < S.centreline
Sort by: effective_position ascending, then row_distance ascending
```

**Set C: Aligned (same centreline)**
```
Condition: T.centreline == S.centreline (within tolerance)
Sort by: row_distance ascending (closest first)
```

**Set D: Right side, same row**
```
Condition: T.row == S.row AND T.centreline > S.centreline
Sort by: T.centreline ascending (leftmost of right side first)
```

**Set E: Right side, different row**
```
Condition: T.row != S.row AND effective_position > S.centreline
Sort by: effective_position ascending, then row_distance ascending
```

**Final Port Order: [A, B, C, D, E]**

This places:
1. Left same-row destinations on leftmost ports
2. Left multi-row destinations next
3. Aligned destinations in center
4. Right same-row destinations next
5. Right multi-row destinations on rightmost ports

---

## 6. Multi-Row Wire Routing

### 6.1 Wire Path for Target Beyond Adjacent Row

When a wire travels from row R to row R+N where N > 1:

```
Path segments:
1. EXIT: Vertical down from source port to channel above row R+1
2. HORIZONTAL: Travel to selected exit position in row R+1
3. VERTICAL: Drop through exit position (between nodes)
4. REPEAT: For each intermediate row until reaching target row
5. HORIZONTAL: Travel to target centreline
6. ENTRY: Vertical to target port
```

### 6.2 Exit Position Selection for Multi-Row

```python
def select_exit_position(source, target, intermediate_row):
    """
    Select the exit position to use when passing through intermediate_row.

    Goal: Minimize horizontal travel while avoiding node intersections.

    @param source: Source node
    @param target: Target node
    @param intermediate_row: Row number being passed through
    @return: Exit position (0 to 1)
    """
    n = get_node_count_in_row(intermediate_row)

    # Calculate all exit positions for this row
    exit_positions = [e / (n + 1) for e in range(n + 1)]

    # Find the exit position closest to target that's on the correct side
    if target.centreline <= source.centreline:
        # Going left: use exit position <= target.centreline
        valid_exits = [e for e in exit_positions if e <= target.centreline]
        return max(valid_exits) if valid_exits else 0
    else:
        # Going right: use exit position >= target.centreline
        valid_exits = [e for e in exit_positions if e >= target.centreline]
        return min(valid_exits) if valid_exits else 1.0
```

### 6.3 Avoiding Node Intersections

A wire must NEVER pass through a node. When travelling vertically:

```python
def can_drop_at_position(x_position, row):
    """Check if vertical drop at x_position would intersect any node in row."""
    for node in get_nodes_in_row(row):
        node_left = node.centreline - node.half_width
        node_right = node.centreline + node.half_width
        if node_left < x_position < node_right:
            return False  # Would intersect node
    return True
```

If a wire cannot drop directly, it must route to an exit position first.

---

## 7. Channel Calculation

### 7.1 Channels Per Row Gap

The number of channels between row R and row R+1 depends on:

1. **Direct connections**: Wires from row R to row R+1
2. **Pass-through wires**: Wires that originated above row R and pass through to rows below R+1
3. **Turn channels**: Wires that turn horizontally between these rows to align with exit positions

```python
def calculate_channels_between_rows(row_above, row_below, all_connections):
    """
    Calculate the number of routing channels needed between two rows.

    @param row_above: Upper row number
    @param row_below: Lower row number (should be row_above + 1)
    @param all_connections: All connections in the section
    @return: Number of channels needed
    """
    channels_needed = set()  # Use set to track unique channels

    for conn in all_connections:
        source_row = conn.source.row
        target_row = conn.target.row

        # Check if this connection uses the gap between row_above and row_below
        if source_row <= row_above and target_row >= row_below:
            # This wire passes through or terminates in this gap

            if source_row == row_above:
                # Wire originates here - needs exit channel
                channels_needed.add(('exit', conn.id))

            if target_row == row_below:
                # Wire terminates here - needs entry channel
                channels_needed.add(('entry', conn.id))
            elif target_row > row_below:
                # Wire passes through - needs pass-through channel
                channels_needed.add(('pass', conn.id))

                # Check if wire needs to turn to align with exit position
                if needs_turn_at_row(conn, row_below):
                    channels_needed.add(('turn', conn.id))

    # Group by target for channel sharing (incoming wires share)
    # This is handled separately in the routing phase

    return len(channels_needed)
```

### 7.2 Channel Sharing Rules

- **Outgoing from same source**: Each gets separate channel
- **Incoming to same target**: Share ONE channel (merge with junctions)
- **Pass-through wires**: Each gets separate channel unless going to same target

### 7.3 Minimum Channel Count

```
min_channels = max(3, calculated_channels)
```

Always reserve at least 3 channels for readability:
- Channel 1: Entry/exit clearance
- Channel 2: Primary routing
- Channel 3: Buffer space

---

## 8. Junction Dot Rules

### 8.1 When to Draw Junction Dots

Junction dots indicate where wires merge (electrically connect in schematic convention).

**Draw junction dots when:**
- Multiple wires connect to the SAME incoming port
- The wires merge at a horizontal channel before entering the port

**Do NOT draw junction dots when:**
- Wires cross without connecting (schematic "hop" convention)
- Single wire to a port
- Outgoing wires splitting from a single port

### 8.2 Junction Dot Count

For `n` wires merging into a single port:

```
junction_dots = n - 1
```

Examples:
- 2 wires merging: 1 junction dot
- 3 wires merging: 2 junction dots
- 4 wires merging: 3 junction dots

### 8.3 Junction Dot Placement

```python
def place_junction_dots(incoming_wires, merge_channel_y, target_port_x):
    """
    Place junction dots where incoming wires merge.

    @param incoming_wires: List of wires merging into one port
    @param merge_channel_y: Y-coordinate of the merge channel
    @param target_port_x: X-coordinate of the target port
    @return: List of (x, y) positions for junction dots
    """
    if len(incoming_wires) <= 1:
        return []  # No junctions needed

    # Sort wires by their X position where they meet the channel
    wire_x_positions = sorted([wire.channel_x for wire in incoming_wires])

    # Place junction at each wire position EXCEPT the last one
    # (last wire doesn't need a dot - it's where the vertical drop occurs)
    junctions = []

    # The vertical drop to target happens at target_port_x
    # Place dots at wire positions that are NOT the drop point
    for x in wire_x_positions:
        if abs(x - target_port_x) > tolerance:
            junctions.append((x, merge_channel_y))

    return junctions
```

### 8.4 Visual Example

```
3 wires to same target:

    Wire1        Wire2        Wire3
      │            │            │
      │            │            │
      └─────●──────●────────────┤  ← Channel with 2 junction dots
                                │
                                ▼
                          [ TARGET ]
```

The rightmost wire (Wire3) doesn't get a dot because it's at the drop point.

---

## 9. Cross-Section Connections

### 9.1 Section Boundary Handling

When connections span different sections:

1. **Identify boundary crossing**: Source and target are in different sections
2. **Route to section edge**: Wire travels to nearest edge of source section
3. **Cross section gap**: Wire travels through inter-section space
4. **Enter target section**: Wire enters from nearest edge of target section
5. **Route to target**: Normal routing within target section

### 9.2 Inter-Section Channels

The space between sections has its own channel allocation:

```python
def calculate_inter_section_channels(section_a, section_b, cross_connections):
    """
    Calculate channels needed between two sections.

    @param section_a: First section
    @param section_b: Second section
    @param cross_connections: Connections between the sections
    @return: Number of inter-section channels
    """
    # Each cross-section connection needs its own channel
    # unless multiple wires share a target (incoming merge)

    targets = {}
    for conn in cross_connections:
        target_id = conn.target.id
        if target_id not in targets:
            targets[target_id] = []
        targets[target_id].append(conn)

    # One channel per unique target
    return len(targets)
```

### 9.3 Section Edge Ports

Each section has virtual "edge ports" for cross-section connections:

- **Top edge**: For connections to sections above
- **Bottom edge**: For connections to sections below
- **Left edge**: For connections to sections on the left
- **Right edge**: For connections to sections on the right

Port ordering on section edges follows the same left-to-right principle.

---

## 10. Same-Row Connection Routing

### 10.1 Basic Path

When source and target are in the same row:

```
Source → Down to channel → Horizontal → Down/Up to target → Target

    [SOURCE]              [TARGET]
        │                     ▲
        │                     │
        └────────────────────┘  ← Channel below the row
```

### 10.2 Direction Determination

```python
def route_same_row_connection(source, target):
    """
    Route a connection between nodes in the same row.

    @param source: Source node
    @param target: Target node
    @return: Path segments
    """
    # Both nodes use bottom edge for same-row connections
    source_edge = 'bottom'
    target_edge = 'bottom'

    # Channel is below the row
    channel_y = row_bottom + channel_offset

    path = [
        ('vertical', source.port_x, source.bottom, channel_y),  # Down from source
        ('horizontal', source.port_x, target.port_x, channel_y),  # Across
        ('vertical', target.port_x, channel_y, target.bottom),  # Up to target
    ]

    return path
```

### 10.3 Port Assignment for Same-Row

On the source node's bottom edge:
- Same-row targets to the LEFT get leftmost ports
- Same-row targets to the RIGHT get rightmost ports

On the target node's bottom edge:
- Incoming same-row connections share one port with other incoming connections

---

## 11. Upward Connection Routing

### 11.1 When Connections Go Up

If target row < source row, the connection goes upward:

```
    [TARGET]  ← Row 1
        ▲
        │
        └────────┐
                 │  ← Channel between rows
        ┌────────┘
        │
    [SOURCE]  ← Row 2
```

### 11.2 Routing Strategy

Option A: **Side routing** (current implementation)
- Exit from source TOP
- Route to section edge
- Travel vertically along edge
- Re-enter at target level
- Route to target

Option B: **Exit position routing** (recommended)
- Use exit positions between nodes (same as downward)
- More consistent with downward routing

### 11.3 Recommended Approach

Apply the same exit position logic but in reverse:

```python
def route_upward_connection(source, target):
    """
    Route connection from lower row to upper row.
    """
    # Source uses TOP edge
    source_edge = 'top'
    # Target uses BOTTOM edge (receiving from below)
    target_edge = 'bottom'

    # Channel is above source row
    channel_y = source.top - channel_offset

    # Multi-row: use exit positions
    if abs(source.row - target.row) > 1:
        exit_pos = select_exit_position(source, target, source.row - 1)
        # Route through exit position
```

---

## 12. Complete Example

### 12.1 Setup

```
Row 1 (3 nodes):  [node1]     [node2]      [node3]
                   1/6         3/6          5/6

Row 2 (2 nodes):       [node4]        [node5]
                        1/4            3/4

Row 3 (4 nodes):  [n6]   [n7]    [n8]    [n9]
                  1/8    3/8     5/8     7/8
```

### 12.2 Connections from node2

```
node2 > node3    # Same row, right
node2 < node5    # Row 2, right (incoming)
node2 > node4    # Row 2, left (outgoing)
node2 <> node7   # Row 3, left (bidirectional)
```

### 12.3 Port Calculation for node2 Bottom Edge

| Connection | Type | Direction | Counts as |
|------------|------|-----------|-----------|
| node2 > node3 | outgoing | right | outgoing: 1 |
| node2 < node5 | incoming | right | incoming: 1 |
| node2 > node4 | outgoing | left | outgoing: 1 |
| node2 <> node7 | bidirectional | left | bidirectional: 1 |

```
ports = 2 (outgoing) + 1 (bidirectional) + min(1, 1 incoming) = 4 ports
```

### 12.4 Port Order Calculation

Normalize to common denominator (24):
- node2: 3/6 = 12/24
- node3: 5/6 = 20/24 (same row, RIGHT)
- node4: 1/4 = 6/24 (row 2, LEFT)
- node5: 3/4 = 18/24 (row 2, RIGHT, incoming)
- node7: 3/8 = 9/24 (row 3, LEFT)

Effective positions:
- node3: 20/24 (same row, use centreline)
- node4: 6/24 (adjacent row, use centreline)
- node5: 18/24 (adjacent row, incoming - shares port)
- node7: 6/24 (multi-row, left of source, use exit position ≈ 1/3 = 8/24)

Sorted order (left to right):
1. node4 (6/24) - outgoing
2. node7 (8/24 effective) - bidirectional
3. node5 (18/24) - incoming (shares port with other incoming)
4. node3 (20/24) - outgoing

```
node2 bottom edge:
 ─────┬────┬────┬────┬─────
      │    │    │    │
     n4   n7  n5/in  n3
```

---

## 13. Implementation Checklist

### 13.1 Data Structures Needed

```python
class Node:
    id: str
    name: str
    section: str
    row: int
    centreline: float  # 0 to 1
    pixel_x: float
    pixel_y: float
    width: float
    height: float
    ports_top: List[Port]
    ports_bottom: List[Port]

class Port:
    node_id: str
    edge: str  # 'top' or 'bottom'
    position: int  # index from left (0-indexed)
    offset_x: float  # pixel offset from node centre
    connections: List[Connection]
    is_incoming_shared: bool

class Connection:
    source_node: Node
    target_node: Node
    type: str  # 'to', 'from', 'bidirectional'
    dashed: bool
    source_port: Port
    target_port: Port
    path: List[PathSegment]

class PathSegment:
    type: str  # 'vertical', 'horizontal'
    start: (float, float)
    end: (float, float)
    channel: int  # for horizontal segments
```

### 13.2 Algorithm Order

1. Parse all nodes and assign centreline positions
2. Parse all connections
3. For each node, collect connections using each edge
4. Calculate port counts per edge
5. Sort connections for port ordering
6. Assign port positions (pixel offsets)
7. Calculate channel counts between all row pairs
8. Build wire paths using assigned ports and channels
9. Identify junction points
10. Render SVG

---

## 14. Edge Cases

### 14.1 Single Node in Row

- Centreline: 1/2
- Exit positions: 0, 1 (left and right of node)
- All connections go through these two exit positions

### 14.2 All Connections to Same Target

- All wires merge into single port
- Junction dots at n-1 positions
- One arrow at target

### 14.3 Bidirectional to Same-Row Node

- Uses bottom edge on both nodes
- Arrows point into both nodes
- Channel below row

### 14.4 Very Deep Multi-Row

- Wire passes through many rows
- Uses exit positions at each row
- May need to change exit position at intermediate rows
- Each turn adds to channel count for that row gap

### 14.5 No Connections on Edge

- 0 ports on that edge
- No port spacing calculation needed
