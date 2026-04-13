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

  const childrenOf = new Map(data.people.map(p => [p.id, new Set()]));
  data.people.forEach(child =>
    (child.parentIds || []).forEach(pid => childrenOf.get(pid)?.add(child.id))
  );

  // ── Layout constants ──────────────────────────────────────────────────────
  const NODE_H      = 74;
  const NODE_MIN_W  = 160;
  const ROW_GAP_Y   = 170;
  const SIBLING_GAP = 32;
  const PARTNER_GAP = 24;
  const PAD_X       = 28;
  const CH_W        = 8.5;

  // ── Card sizing ───────────────────────────────────────────────────────────
  function personLabel(p) {
    if (!p) return { name: "—", years: "—", loc: "" };
    const b = p.birthYear ? String(p.birthYear) : "—";
    const d = p.deathYear ? `–${p.deathYear}` : "";
    return { name: p.name || "—", years: `${b}${d}`, loc: p.currentLocation ?? "" };
  }

  function estimateTextW(str) {
    return (str?.length ?? 0) * CH_W;
  }

  function cardWidth(personId) {
    const p = byId.get(personId);
    const lbl = personLabel(p);
    const textW = Math.max(
      estimateTextW(lbl.name),
      estimateTextW(lbl.years),
      estimateTextW(lbl.loc)
    );
    return Math.max(NODE_MIN_W, textW + PAD_X * 2);
  }

  function unionCardWidth(aId, bId) {
    return cardWidth(aId) + PARTNER_GAP + cardWidth(bId);
  }

  function nodeHalfWidth(node) {
    if (node.type === "union") {
      const [aId, bId] = node.partnerIds;
      return unionCardWidth(aId, bId) / 2;
    }
    return cardWidth(node.personId) / 2;
  }

  // ── Generation from JSON ──────────────────────────────────────────────────
  function personGen(pid) { return byId.get(pid)?.generation ?? 0; }
  function nodeGen(node) {
    if (node.type === "union")
      return Math.min(personGen(node.partnerIds[0]), personGen(node.partnerIds[1]));
    return personGen(node.personId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function pairKey(a, b) { return a < b ? `${a}__${b}` : `${b}__${a}`; }

  function sharedChildren(aId, bId) {
    const aKids = new Set(byId.get(aId)?.childIds || []);
    const bKids = new Set(byId.get(bId)?.childIds || []);
    if (aKids.size && bKids.size) return [...aKids].filter(id => bKids.has(id));
    return data.people
      .filter(ch => (ch.parentIds || []).includes(aId) && (ch.parentIds || []).includes(bId))
      .map(ch => ch.id);
  }

  function soloChildren(partnerId, sharedSet) {
    const kids = new Set(byId.get(partnerId)?.childIds || []);
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
      const u = makeUnionNode(pid, spouseId);
      nodeCache.set(pid, u);
      return u;
    }
    const node = { type: "person", id: pid, personId: pid, children: [], secondaryChildren: [] };
    nodeCache.set(pid, node);
    const kids = sortedKids([...(childrenOf.get(pid) || [])]);
    kids.map(k => makePersonNode(k)).filter(Boolean).forEach(c => {
      if (!c._parent) { c._parent = node.id; node.children.push(c); }
      else { node.secondaryChildren.push(c); }
    });
    return node;
  }

  function makeUnionNode(aId, bId) {
    const key = pairKey(aId, bId);
    const cacheKey = `union:${key}`;
    if (nodeCache.has(cacheKey)) return nodeCache.get(cacheKey);

    const pa = byId.get(aId), pb = byId.get(bId);
    if ((pb?.birthYear ?? 9999) < (pa?.birthYear ?? 9999)) [aId, bId] = [bId, aId];

    const node = { type: "union", id: cacheKey, partnerIds: [aId, bId], children: [], secondaryChildren: [] };
    nodeCache.set(cacheKey, node);
    nodeCache.set(aId, node);
    nodeCache.set(bId, node);

    const sharedIds = sharedChildren(aId, bId);
    const sharedSet = new Set(sharedIds);
    const allKidIds = sortedKids([...new Set([
      ...sharedIds,
      ...soloChildren(aId, sharedSet),
      ...soloChildren(bId, sharedSet)
    ])]);
    allKidIds.map(k => makePersonNode(k)).filter(Boolean).forEach(c => {
      if (!c._parent) { c._parent = node.id; node.children.push(c); }
      else { node.secondaryChildren.push(c); }
    });
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

  // ── Collect unique nodes ──────────────────────────────────────────────────
  function flatten(node, acc = [], seen = new Set()) {
    if (seen.has(node.id)) return acc;
    seen.add(node.id);
    acc.push(node);
    (node.children || []).forEach(c => flatten(c, acc, seen));
    return acc;
  }
  const allNodes    = forestRoots.flatMap(r => flatten(r));
  const uniqueNodes = [...new Map(allNodes.map(n => [n.id, n])).values()];

  // ── Y from JSON generation ────────────────────────────────────────────────
  const genMin = d3.min(uniqueNodes, n => nodeGen(n));
  uniqueNodes.forEach(n => {
    n.genVal = nodeGen(n);
    n.y      = (n.genVal - genMin) * ROW_GAP_Y + 80;
  });

  // ── Width computation ─────────────────────────────────────────────────────
  function computeWidths(node, seen = new Set()) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    node.ownW = nodeHalfWidth(node) * 2;
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
    const totalW = d3.sum(children, c => c.spreadW)
                 + SIBLING_GAP * (children.length - 1);
    let cur = node.x - totalW / 2;
    children.forEach(c => {
      c.x = cur + c.spreadW / 2;
      cur += c.spreadW + SIBLING_GAP;
      placeChildren(c, seen);
    });
    const anchors = children.map(c => childAnchorX(node, c));
    node.x = (anchors[0] + anchors[anchors.length - 1]) / 2;
  }

  // ── Overlap resolution ────────────────────────────────────────────────────
  function resolveRowOverlaps() {
    const rows = new Map();
    uniqueNodes.forEach(n => {
      if (!rows.has(n.genVal)) rows.set(n.genVal, []);
      rows.get(n.genVal).push(n);
    });
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, rowNodes]) => {
        rowNodes.sort((a, b) => a.x - b.x);
        for (let i = 1; i < rowNodes.length; i++) {
          const prev = rowNodes[i - 1];
          const curr = rowNodes[i];
          const minDist = nodeHalfWidth(prev) + SIBLING_GAP + nodeHalfWidth(curr);
          const actual  = curr.x - prev.x;
          if (actual < minDist) {
            const shift = minDist - actual;
            for (let j = i; j < rowNodes.length; j++) rowNodes[j].x += shift;
          }
        }
      });
  }

  // Returns the x position of the specific partner card within a union that is
  // the biological child of parentNode, or the node's center x if not a union.
  function partnerCardX(unionNode, partnerId) {
    const [aId, bId] = unionNode.partnerIds;
    const wA = cardWidth(aId), wB = cardWidth(bId);
    if (partnerId === aId) return unionNode.x - PARTNER_GAP / 2 - wA / 2;
    if (partnerId === bId) return unionNode.x + PARTNER_GAP / 2 + wB / 2;
    return unionNode.x;
  }

  function childAnchorX(parentNode, childNode) {
    if (childNode.type !== "union") return childNode.x;
    const parentPersonIds = new Set(
      parentNode.type === "union" ? parentNode.partnerIds : [parentNode.personId]
    );
    for (const partnerId of childNode.partnerIds) {
      const person = byId.get(partnerId);
      if ((person?.parentIds || []).some(pid => parentPersonIds.has(pid))) {
        return partnerCardX(childNode, partnerId);
      }
    }
    return childNode.x; // fallback: center of union
  }

  function recenterParents(node, seen = new Set()) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const children = node.children || [];
    children.forEach(c => recenterParents(c, seen));
    if (children.length > 0) {
      const anchors = children.map(c => childAnchorX(node, c));
      node.x = (anchors[0] + anchors[anchors.length - 1]) / 2;
    }
  }

  resolveRowOverlaps();
  forestRoots.forEach(r => recenterParents(r));
  resolveRowOverlaps();

  // ── DOM rendering ─────────────────────────────────────────────────────────
  function getCssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }

  const cardWidthCache = new Map();
  function getCardWidth(personId) {
    if (!cardWidthCache.has(personId)) cardWidthCache.set(personId, cardWidth(personId));
    return cardWidthCache.get(personId);
  }

  function renderPersonCard(grp, personId, cx, cy, w) {
    const p   = byId.get(personId);
    const lbl = personLabel(p);

    const rect = grp.append("rect")
      .attr("class", "person-box")
      .attr("x", cx - w / 2).attr("y", cy - NODE_H / 2)
      .attr("width", w).attr("height", NODE_H);

    if (p) {
      const dotColor = p.deathYear
        ? getCssVar("--deceased")
        : (p.birthYear ? getCssVar("--living") : getCssVar("--unknown"));
      grp.append("circle")
        .attr("class", "status-dot")
        .attr("cx", cx - w / 2 + 12)
        .attr("cy", cy - NODE_H / 2 + 12)
        .attr("r", 5)
        .attr("fill", dotColor);
    }

    const tName  = grp.append("text").attr("class", "name")
      .attr("text-anchor", "middle").attr("x", cx).attr("y", cy - 10)
      .text(lbl.name);
    const tYears = grp.append("text").attr("class", "years")
      .attr("text-anchor", "middle").attr("x", cx).attr("y", cy + 8)
      .text(lbl.years);
    const tLoc   = grp.append("text").attr("class", "subtitle")
      .attr("text-anchor", "middle").attr("x", cx).attr("y", cy + 26)
      .text(lbl.loc);

    grp.node().__rectEl   = rect.node();
    grp.node().__textEls  = [tName.node(), tYears.node(), tLoc.node()];
    grp.node().__cx       = cx;
    grp.node().__personId = personId;
  }

  function renderNode(node) {
    const grp = nodesLayer.append("g").attr("class", "node");
    if (node.type === "union") {
      const [aId, bId] = node.partnerIds;
      const wA = getCardWidth(aId), wB = getCardWidth(bId);
      const cx = node.x, cy = node.y;
      const lCx = cx - PARTNER_GAP / 2 - wA / 2;
      const rCx = cx + PARTNER_GAP / 2 + wB / 2;
      renderPersonCard(grp, aId, lCx, cy, wA);
      renderPersonCard(grp, bId, rCx, cy, wB);
      grp.append("line").attr("class", "marriage-line")
        .attr("x1", lCx + wA / 2).attr("y1", cy)
        .attr("x2", rCx - wB / 2).attr("y2", cy);
    } else {
      const w = getCardWidth(node.personId);
      renderPersonCard(grp, node.personId, node.x, node.y, w);
    }
  }

  // ── Link drawing ──────────────────────────────────────────────────────────
  function nodeBottomCenter(node) { return { x: node.x, y: node.y + NODE_H / 2 }; }
  function nodeTopCenter(node)    { return { x: node.x, y: node.y - NODE_H / 2 }; }

  function drawLinks(node, seen = new Set()) {
    if (seen.has(node.id)) return;
    seen.add(node.id);

    // Draw solid lines to secondary (cross-family) children — no recursion needed
    (node.secondaryChildren || []).forEach(c => {
      const src = nodeBottomCenter(node);
      const tgt = nodeTopCenter(c);
      linksLayer.append("path").attr("class", "link")
        .attr("d", `M${src.x},${src.y} C${src.x},${(src.y + tgt.y) / 2} ${tgt.x},${(src.y + tgt.y) / 2} ${tgt.x},${tgt.y}`);
    });

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

  // ── Post-render pass: fix card widths + set initial viewport ─────────────
  // Both operations are deferred to requestAnimationFrame so the browser has
  // fully painted and svg.node().clientWidth returns real pixel dimensions.
  requestAnimationFrame(() => {

    // 1) Expand any card whose estimated width was too narrow
    let anyChanged = false;
    nodesLayer.selectAll("g.node").each(function () {
      Array.from(this.children).forEach(child => {
        if (!child.__rectEl) return;
        const rectEl  = child.__rectEl;
        const textEls = child.__textEls || [];
        const cx      = child.__cx;

        let maxTextW = 0;
        textEls.forEach(tel => {
          try { maxTextW = Math.max(maxTextW, tel.getComputedTextLength()); } catch (e) {}
        });

        const needed  = Math.max(NODE_MIN_W, maxTextW + PAD_X * 2);
        const current = parseFloat(rectEl.getAttribute("width"));

        if (needed > current + 2) {
          anyChanged = true;
          cardWidthCache.set(child.__personId, needed);
          rectEl.setAttribute("x", cx - needed / 2);
          rectEl.setAttribute("width", needed);
          const dot = child.querySelector("circle.status-dot");
          if (dot) dot.setAttribute("cx", cx - needed / 2 + 12);
        }
      });
    });

    if (anyChanged) {
      uniqueNodes.forEach(n => { n.ownW = nodeHalfWidth(n) * 2; });
      resolveRowOverlaps();
      forestRoots.forEach(r => recenterParents(r));
      resolveRowOverlaps();
    }

    // 2) Set initial viewport now that the SVG has real dimensions
    // Focus on the Rosemary & John Anthony Miks branch at a readable scale
    const FOCUS_IDS = ["rosemary-miks", "john-anthony-miks"];
    const focusNode = uniqueNodes.find(n =>
      (n.type === "union" && n.partnerIds?.some(id => FOCUS_IDS.includes(id))) ||
      FOCUS_IDS.includes(n.personId)
    );

    // Use the SVG element's actual rendered size
    const svgEl  = svg.node();
    const svgW   = svgEl.clientWidth  || svgEl.getBoundingClientRect().width  || window.innerWidth;
    const svgH   = svgEl.clientHeight || svgEl.getBoundingClientRect().height || window.innerHeight;
    const isMobile = svgW < 768;

    const scale = isMobile ? 0.55 : 0.85;
    const targetNode = focusNode || uniqueNodes[0];
    const initX = targetNode ? -targetNode.x * scale + svgW / 2 : svgW / 2;
    const initY = targetNode ? -targetNode.y * scale + svgH / 2 : svgH / 2;

    svg.call(zoom.transform, d3.zoomIdentity.translate(initX, initY).scale(scale));
  });

})();
