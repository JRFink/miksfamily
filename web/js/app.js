(async function () {
  const svg = d3.select("#treeSvg");
  const g = svg.append("g");
  const linksLayer = g.append("g").attr("class", "links");
  const nodesLayer = g.append("g").attr("class", "nodes");

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const zoom = d3.zoom()
    .scaleExtent([0.05, 3])
    .on("zoom", e => g.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);

  // ── Load data ─────────────────────────────────────────────────────────────
  const data = await d3.json("./data/family.json");
  if (!data?.people?.length) { console.error("No people"); return; }

  const byId = new Map(data.people.map(p => [p.id, p]));

  // Build childrenOf from parentIds
  const childrenOf = new Map(data.people.map(p => [p.id, new Set()]));
  data.people.forEach(child =>
    (child.parentIds || []).forEach(pid => childrenOf.get(pid)?.add(child.id))
  );

  // ── Layout constants ──────────────────────────────────────────────────────
  const NODE_H      = 74;
  const NODE_MIN_W  = 180;
  const ROW_GAP_Y   = 170;
  const SIBLING_GAP = 24;
  const PARTNER_GAP = 28;
  const PAD_X       = 26;

  // ── Text / card sizing ────────────────────────────────────────────────────
  function measureText(str) {
    return Math.max(NODE_MIN_W, str.length * 8 + PAD_X * 2);
  }

  function personLabel(p) {
    if (!p) return { name: "—", years: "—", loc: "" };
    const b = p.birthYear ?? "—";
    const d = p.deathYear ? `–${p.deathYear}` : "";
    return { name: p.name || "—", years: `${b}${d}`, loc: p.currentLocation ?? "" };
  }

  function cardWidth(personId) {
    const p = byId.get(personId);
    if (!p) return NODE_MIN_W;
    const lbl = personLabel(p);
    return Math.max(NODE_MIN_W,
      measureText(lbl.name),
      measureText(lbl.years),
      measureText(lbl.loc)
    );
  }

  function unionCardWidth(aId, bId) {
    return cardWidth(aId) + PARTNER_GAP + cardWidth(bId);
  }

  // ── Generation from JSON ──────────────────────────────────────────────────
  function personGen(pid) {
    return byId.get(pid)?.generation ?? 0;
  }

  function nodeGen(node) {
    if (node.type === "union") {
      return Math.min(personGen(node.partnerIds[0]), personGen(node.partnerIds[1]));
    }
    return personGen(node.personId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function pairKey(a, b) { return a < b ? `${a}__${b}` : `${b}__${a}`; }

  function sharedChildren(aId, bId) {
    // Children listed under both partners
    const aKids = new Set(byId.get(aId)?.childIds || []);
    const bKids = new Set(byId.get(bId)?.childIds || []);
    if (aKids.size && bKids.size) return [...aKids].filter(id => bKids.has(id));
    return data.people
      .filter(ch => (ch.parentIds || []).includes(aId) && (ch.parentIds || []).includes(bId))
      .map(ch => ch.id);
  }

  // Children that belong to ONE partner only (e.g. from a previous relationship)
  // and are not already in the shared set.
  function soloChildren(partnerId, sharedSet) {
    const kids = new Set(byId.get(partnerId)?.childIds || []);
    // Also pick up any child whose parentIds list includes partnerId but no known spouse
    childrenOf.get(partnerId)?.forEach(k => kids.add(k));
    return [...kids].filter(k => !sharedSet.has(k));
  }

  function sortedKids(ids) {
    return [...(ids || [])].sort((a, b) => {
      const pa = byId.get(a), pb = byId.get(b);
      const ya = pa?.birthYear ?? 9999, yb = pb?.birthYear ?? 9999;
      if (ya !== yb) return ya - yb;
      return (pa?.name || "").localeCompare(pb?.name || "");
    });
  }

  // ── Memoized node construction ────────────────────────────────────────────
  const nodeCache = new Map();

  function makePersonNode(pid) {
    if (nodeCache.has(pid)) return nodeCache.get(pid);
    const person = byId.get(pid);
    if (!person) return null;
    const spouseId = (person.spouseIds || [])[0];
    if (spouseId && byId.has(spouseId)) {
      const unionNode = makeUnionNode(pid, spouseId);
      nodeCache.set(pid, unionNode);
      return unionNode;
    }
    const node = { type: "person", id: pid, personId: pid, children: [] };
    nodeCache.set(pid, node);
    const kids = sortedKids([...(childrenOf.get(pid) || [])]);
    node.children = kids.map(k => makePersonNode(k)).filter(Boolean);
    return node;
  }

  function makeUnionNode(aId, bId) {
    const key = pairKey(aId, bId);
    const cacheKey = `union:${key}`;
    if (nodeCache.has(cacheKey)) return nodeCache.get(cacheKey);

    const pa = byId.get(aId), pb = byId.get(bId);
    if ((pb?.birthYear ?? 9999) < (pa?.birthYear ?? 9999)) [aId, bId] = [bId, aId];

    const node = { type: "union", id: cacheKey, partnerIds: [aId, bId], children: [] };
    nodeCache.set(cacheKey, node);
    nodeCache.set(aId, node);
    nodeCache.set(bId, node);

    // Shared children (both parents)
    const sharedIds = sharedChildren(aId, bId);
    const sharedSet = new Set(sharedIds);

    // Solo children from either partner (e.g. Gianni under Kristin+Ryan)
    const soloA = soloChildren(aId, sharedSet);
    const soloB = soloChildren(bId, sharedSet);

    // Merge all, deduplicate, sort by birth year
    const allKidIds = sortedKids([...new Set([...sharedIds, ...soloA, ...soloB])]);

    node.children = allKidIds.map(k => makePersonNode(k)).filter(Boolean);
    return node;
  }

  // ── Build forest roots ────────────────────────────────────────────────────
  const seenRoots = new Set();
  const forestRoots = [];

  function addRoot(node) {
    if (!node || seenRoots.has(node.id)) return;
    seenRoots.add(node.id);
    forestRoots.push(node);
  }

  data.people.forEach(p => {
    if (p.parentIds?.length) return;
    (p.spouseIds || []).forEach(sp => {
      const spouse = byId.get(sp);
      if (!spouse || spouse.parentIds?.length) return;
      addRoot(makeUnionNode(p.id, sp));
    });
  });

  data.people.forEach(p => {
    if (p.parentIds?.length) return;
    if ((p.spouseIds || []).length) return;
    addRoot(makePersonNode(p.id));
  });

  // ── Collect all unique nodes ──────────────────────────────────────────────
  function flatten(node, acc = [], seen = new Set()) {
    if (seen.has(node.id)) return acc;
    seen.add(node.id);
    acc.push(node);
    (node.children || []).forEach(c => flatten(c, acc, seen));
    return acc;
  }
  const allNodes = forestRoots.flatMap(r => flatten(r));
  const uniqueNodes = [...new Map(allNodes.map(n => [n.id, n])).values()];

  // ── Assign Y from JSON generation field ───────────────────────────────────
  const genMin = d3.min(uniqueNodes, n => nodeGen(n));
  uniqueNodes.forEach(n => {
    n.genVal = nodeGen(n);
    n.y = (n.genVal - genMin) * ROW_GAP_Y + 80;
  });

  // ── Width computation ─────────────────────────────────────────────────────
  function computeWidths(node, seen = new Set()) {
    if (seen.has(node.id)) return;
    seen.add(node.id);

    node.ownW = node.type === "union"
      ? unionCardWidth(...node.partnerIds)
      : cardWidth(node.personId);

    const children = node.children || [];
    children.forEach(c => computeWidths(c, seen));

    if (children.length === 0) {
      node.spreadW = node.ownW;
    } else {
      const childTotal = d3.sum(children, c => c.spreadW)
                       + SIBLING_GAP * (children.length - 1);
      node.spreadW = Math.max(node.ownW, childTotal);
    }
  }
  forestRoots.forEach(r => computeWidths(r));

  // ── Top-down X placement ──────────────────────────────────────────────────
  let cursor = 60;
  forestRoots.forEach(root => {
    root.x = cursor + root.spreadW / 2;
    cursor += root.spreadW + SIBLING_GAP * 4;
    placeChildren(root);
  });

  function placeChildren(node, seen = new Set()) {
    if (seen.has(node.id)) return;
    seen.add(node.id);

    const children = node.children || [];
    if (!children.length) return;

    const totalChildW = d3.sum(children, c => c.spreadW)
                      + SIBLING_GAP * (children.length - 1);

    let childCursor = node.x - totalChildW / 2;
    children.forEach(c => {
      c.x = childCursor + c.spreadW / 2;
      childCursor += c.spreadW + SIBLING_GAP;
      placeChildren(c, seen);
    });

    node.x = (children[0].x + children[children.length - 1].x) / 2;
  }

  // ── Overlap resolution + parent re-centering ──────────────────────────────
  function resolveRowOverlaps() {
    const rows = new Map();
    uniqueNodes.forEach(n => {
      const key = n.genVal;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(n);
    });

    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, rowNodes]) => {
        rowNodes.sort((a, b) => a.x - b.x);
        for (let i = 1; i < rowNodes.length; i++) {
          const prev = rowNodes[i - 1];
          const curr = rowNodes[i];
          const need = prev.ownW / 2 + curr.ownW / 2 + SIBLING_GAP;
          const have = curr.x - prev.x;
          if (have < need) {
            const shift = need - have;
            for (let j = i; j < rowNodes.length; j++) rowNodes[j].x += shift;
          }
        }
      });
  }

  function recenterParents(node, seen = new Set()) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const children = node.children || [];
    children.forEach(c => recenterParents(c, seen));
    if (children.length > 0) {
      node.x = (children[0].x + children[children.length - 1].x) / 2;
    }
  }

  resolveRowOverlaps();
  forestRoots.forEach(r => recenterParents(r));
  resolveRowOverlaps();

  // ── DOM rendering ─────────────────────────────────────────────────────────
  function getCssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }

  function renderPersonCard(g, personId, cx, cy, w) {
    const p = byId.get(personId);
    const lbl = personLabel(p);

    g.append("rect")
      .attr("class", "person-box")
      .attr("x", cx - w / 2).attr("y", cy - NODE_H / 2)
      .attr("width", w).attr("height", NODE_H);

    if (p) {
      const dotColor = p.deathYear
        ? getCssVar("--deceased")
        : (p.birthYear ? getCssVar("--living") : getCssVar("--unknown"));
      g.append("circle")
        .attr("class", "status-dot")
        .attr("cx", cx - w / 2 + 12)
        .attr("cy", cy - NODE_H / 2 + 12)
        .attr("r", 5)
        .attr("fill", dotColor);
    }

    g.append("text").attr("class", "name")
      .attr("text-anchor", "middle").attr("x", cx).attr("y", cy - 10)
      .text(lbl.name);
    g.append("text").attr("class", "years")
      .attr("text-anchor", "middle").attr("x", cx).attr("y", cy + 8)
      .text(lbl.years);
    g.append("text").attr("class", "subtitle")
      .attr("text-anchor", "middle").attr("x", cx).attr("y", cy + 26)
      .text(lbl.loc);
  }

  function renderNode(node) {
    const g = nodesLayer.append("g").attr("class", "node");
    if (node.type === "union") {
      const [aId, bId] = node.partnerIds;
      const wA = cardWidth(aId), wB = cardWidth(bId);
      const cx = node.x, cy = node.y;
      const lCx = cx - PARTNER_GAP / 2 - wA / 2;
      const rCx = cx + PARTNER_GAP / 2 + wB / 2;
      renderPersonCard(g, aId, lCx, cy, wA);
      renderPersonCard(g, bId, rCx, cy, wB);
      g.append("line").attr("class", "marriage-line")
        .attr("x1", lCx + wA / 2).attr("y1", cy)
        .attr("x2", rCx - wB / 2).attr("y2", cy);
    } else {
      const w = cardWidth(node.personId);
      renderPersonCard(g, node.personId, node.x, node.y, w);
    }
  }

  // ── Link drawing ──────────────────────────────────────────────────────────
  function nodeBottomCenter(node) { return { x: node.x, y: node.y + NODE_H / 2 }; }
  function nodeTopCenter(node)    { return { x: node.x, y: node.y - NODE_H / 2 }; }

  function drawLinks(node, seen = new Set()) {
    if (seen.has(node.id)) return;
    seen.add(node.id);

    const children = node.children || [];
    if (!children.length) return;

    const src = nodeBottomCenter(node);

    if (children.length === 1) {
      const tgt = nodeTopCenter(children[0]);
      linksLayer.append("path").attr("class", "link")
        .attr("d", `M${src.x},${src.y} C${src.x},${(src.y + tgt.y) / 2} ${tgt.x},${(src.y + tgt.y) / 2} ${tgt.x},${tgt.y}`);
    } else {
      const midY = src.y + ROW_GAP_Y * 0.45;
      linksLayer.append("line").attr("class", "link")
        .attr("x1", src.x).attr("y1", src.y)
        .attr("x2", src.x).attr("y2", midY);
      linksLayer.append("line").attr("class", "link")
        .attr("x1", children[0].x).attr("y1", midY)
        .attr("x2", children[children.length - 1].x).attr("y2", midY);
      children.forEach(child => {
        const tgt = nodeTopCenter(child);
        linksLayer.append("line").attr("class", "link")
          .attr("x1", child.x).attr("y1", midY)
          .attr("x2", tgt.x).attr("y2", tgt.y);
      });
    }

    children.forEach(c => drawLinks(c, seen));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  uniqueNodes.forEach(n => renderNode(n));
  forestRoots.forEach(r => drawLinks(r));

  // ── Initial viewport ──────────────────────────────────────────────────────
  const MY_ID = "jeffrey-r-fink";
  const myNode = uniqueNodes.find(n =>
    n.personId === MY_ID ||
    (n.type === "union" && n.partnerIds?.includes(MY_ID))
  );

  const svgW = svg.node().clientWidth  || window.innerWidth;
  const svgH = svg.node().clientHeight || window.innerHeight;
  const totalW = (d3.max(uniqueNodes, n => n.x) ?? 0) + 300;
  const scale = Math.min(0.9, svgW / totalW);

  const initX = myNode ? -myNode.x * scale + svgW / 2 : 40;
  const initY = myNode ? -myNode.y * scale + svgH / 2 : 80;

  svg.call(zoom.transform, d3.zoomIdentity.translate(initX, initY).scale(scale));

})();
