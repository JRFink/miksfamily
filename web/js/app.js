(async function () {
  const svg = d3.select("#treeSvg");
  const g = svg.append("g"); // zoom root
  const linksLayer = g.append("g").attr("class", "links");
  const nodesLayer = g.append("g").attr("class", "nodes");

  const width = () => svg.node()?.clientWidth ?? window.innerWidth;
  const height = () => svg.node()?.clientHeight ?? window.innerHeight;

  // Zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.2, 3])
    .on("zoom", (event) => g.attr("transform", event.transform));
  svg.call(zoom).on("dblclick.zoom", null);

  // ---- Load data ----
  const data = await d3.json("./data/family.json");
  if (!data?.people?.length) {
    console.error("family.json has no people");
    return;
  }

  // Lookup by id
  const byId = new Map();
  data.people.forEach(p => byId.set(p.id, p));

  // childrenOf from parentIds
  const childrenOf = new Map();
  data.people.forEach(p => childrenOf.set(p.id, new Set()));
  data.people.forEach(child => {
    (child.parentIds || []).forEach(pid => {
      if (childrenOf.has(pid)) childrenOf.get(pid).add(child.id);
    });
  });

  // Optional sibling ordering
  function sortChildren(ids) {
  return [...(ids || [])].sort((a, b) => {
    const pa = byId.get(a);
    const pb = byId.get(b);

    const ba = pa?.birthYear ?? 9999;
    const bb = pb?.birthYear ?? 9999;

    if (ba !== bb) return ba - bb;

    return (pa?.name || "").localeCompare(pb?.name || "");
  });
}

  // ---- Unions ----
  function pairKey(a, b) {
    return a < b ? `${a}__${b}` : `${b}__${a}`;
  }

  function sharedChildren(aId, bId) {
    const a = byId.get(aId);
    const b = byId.get(bId);

    // 1) If both partners have childIds lists, use intersection.
    const aKids = new Set(a?.childIds || []);
    const bKids = new Set(b?.childIds || []);
    if (aKids.size && bKids.size) {
      return [...aKids].filter(id => bKids.has(id));
    }

    // 2) Fallback: scan all people by parentIds (what you had before)
    return data.people
      .filter(ch => (ch.parentIds || []).includes(aId) && (ch.parentIds || []).includes(bId))
      .map(ch => ch.id);
  }

  const unionsByKey = new Map();
  data.people.forEach(p => {
    (p.spouseIds || []).forEach(sp => {
      if (!byId.has(sp)) return;
      const key = pairKey(p.id, sp);
      if (!unionsByKey.has(key)) {
        unionsByKey.set(key, {
          id: `union:${key}`,
          type: "union",
          partnerIds: key.split("__"),
          childrenIds: sharedChildren(p.id, sp)
        });
      }
    });
  });

  // ---- Generation map (compute EARLY because union selection may use it) ----
  const MY_ID = "jeffrey-r-fink";

  function computeGenerations() {
    const gen = new Map();
    if (!byId.has(MY_ID)) return gen;

    gen.set(MY_ID, 0);

    // ancestors
    let q = [MY_ID];
    while (q.length) {
      const id = q.shift();
      const g0 = gen.get(id);
      const person = byId.get(id);
      (person?.parentIds || []).forEach(pid => {
        if (!gen.has(pid)) {
          gen.set(pid, g0 - 1);
          q.push(pid);
        }
      });
    }

    // descendants
    q = [MY_ID];
    while (q.length) {
      const id = q.shift();
      const g0 = gen.get(id);
      const kids = [...(childrenOf.get(id) || [])];
      kids.forEach(cid => {
        if (!gen.has(cid)) {
          gen.set(cid, g0 + 1);
          q.push(cid);
        }
      });
    }

    return gen;
  }

  const generations = computeGenerations();

  // ---- Convert to hierarchy ----
  // Key idea: if a person has a spouse AND they share children,
  // we represent those children under a UNION node so both partners are shown.
  function makeHierarchyForPerson(pid) {
    const person = byId.get(pid);
    if (!person) return null;

    const spouseId = (person.spouseIds || [])[0];
    const kids = sortChildren(childrenOf.get(pid));

    if (spouseId && byId.has(spouseId)) {

      const shared = new Set(sharedChildren(pid, spouseId));

      const unionChildren = kids.filter(k => shared.has(k));
      const soloChildren = kids.filter(k => !shared.has(k));

      const key = pairKey(pid, spouseId);

      const unionNode = {
        id: `union:${key}`,
        type: "union",
        partnerIds: key.split("__"),
        children: unionChildren.map(makeHierarchyForPerson).filter(Boolean)
      };

      // If there are no solo children, return the union normally
      if (soloChildren.length === 0) {
        return unionNode;
      }

      // Otherwise create a wrapper node so solo children still appear
      return {
        id: `wrapper:${pid}`,
        type: "person",
        person,
        children: [
          unionNode,
          ...soloChildren.map(makeHierarchyForPerson)
        ]
      };
    }
    

    // No spouse: render as a person node with children
    const kidsSort = sortChildren(childrenOf.get(pid));
    return {
      id: pid,
      type: "person",
      person,
      children: kidsSort.map(makeHierarchyForPerson).filter(Boolean)
    };
  }

  // Choose forest roots:
  // use unions where neither partner has parents (true top couples),
  // plus any lone people who have no parents and no spouse.
  const unionRoots = [...unionsByKey.values()].filter(u => {
    const [a, b] = u.partnerIds;
    const pa = byId.get(a), pb = byId.get(b);
    const aRoot = !pa?.parentIds || pa.parentIds.length === 0;
    const bRoot = !pb?.parentIds || pb.parentIds.length === 0;
    return aRoot && bRoot;
  });

  const loneRoots = data.people.filter(p => {
    const isRoot = !p.parentIds || p.parentIds.length === 0;
    const hasSpouse = (p.spouseIds || []).length > 0;
    return isRoot && !hasSpouse;
  });

  function makeHierarchyForUnion(union) {
    return {
      id: union.id,
      type: "union",
      partnerIds: union.partnerIds,
      children: (union.childrenIds || []).map(makeHierarchyForPerson).filter(Boolean)
    };
  }

  // ---- Layout config ----
  const baseNodeHeight = 74;
  const minNodeWidth = 180;
  const levelGapY = 170;       // vertical gap between generations
  const baseSepX = 40;         // tree spacing baseline
  const partnerGap = 28;

  function getCssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }

  function anchorPoint(node, which) {
    const x = node.x;
    const h = node._h ?? baseNodeHeight;
    if (which === "top") return { x, y: node.y - h / 2 };
    if (which === "bottom") return { x, y: node.y + h / 2 };
    return { x, y: node.y };
  }

  function diagonal(link) {
    const s = anchorPoint(link.source, "bottom");
    const t = anchorPoint(link.target, "top");
    const mx = (s.x + t.x) / 2;
    return `M ${s.x},${s.y} C ${mx},${s.y} ${mx},${t.y} ${t.x},${t.y}`;
  }

  // --- Build ONE combined root so multiple top couples sit on the same "top row"
  const forestChildren = [
    ...unionRoots.map(u => makeHierarchyForUnion(u)),
    ...loneRoots.map(r => makeHierarchyForPerson(r.id)).filter(Boolean)
  ];

  const superRoot = d3.hierarchy(
    { id: "__root__", type: "root", children: forestChildren },
    d => d.children
  );

  // --- Measure + resize helpers
  function measureTextWidth(textEl) {
    // Safe even before fonts fully load; good enough for dynamic boxes.
    try {
      return textEl.node().getComputedTextLength();
    } catch {
      return (textEl.text() || "").length * 10;
    }
  }

  function resizePersonNode(nodeG, d) {
    const padX = 26;
    const nameW = measureTextWidth(nodeG.select("text.name"));
    const yearsW = measureTextWidth(nodeG.select("text.years"));
    const subW  = measureTextWidth(nodeG.select("text.subtitle"));
    const w = Math.max(minNodeWidth, nameW + padX, yearsW + padX, subW + padX);
    const h = baseNodeHeight;

    d._w = w;
    d._h = h;

    nodeG.select("rect.person-box")
      .attr("x", -w / 2)
      .attr("y", -h / 2)
      .attr("width", w)
      .attr("height", h);

    nodeG.select("circle.status-dot")
      .attr("cx", -w / 2 + 12)
      .attr("cy", -h / 2 + 12);
  }

  function resizeUnionNode(nodeG, d) {
    const padX = 26;
    const leftG = nodeG.select("g.partner-left");
    const rightG = nodeG.select("g.partner-right");

    const lNameW = measureTextWidth(leftG.select("text.name"));
    const lYearsW = measureTextWidth(leftG.select("text.years"));
    const lSubW = measureTextWidth(leftG.select("text.subtitle"));
    const wL = Math.max(minNodeWidth, lNameW + padX, lYearsW + padX, lSubW + padX);

    const rNameW = measureTextWidth(rightG.select("text.name"));
    const rYearsW = measureTextWidth(rightG.select("text.years"));
    const rSubW = measureTextWidth(rightG.select("text.subtitle"));
    const wR = Math.max(minNodeWidth, rNameW + padX, rYearsW + padX, rSubW + padX);

    const h = baseNodeHeight;
    const offsetL = (wL / 2) + (partnerGap / 2);
    const offsetR = (wR / 2) + (partnerGap / 2);

    // Store union bounding box (used by collision)
    d._w = wL + wR + partnerGap;
    d._h = h;

    // Place partner groups so the union center sits between them
    leftG.attr("transform", `translate(${-offsetL},0)`);
    rightG.attr("transform", `translate(${offsetR},0)`);

    leftG.select("rect.partner-box")
      .attr("x", -wL / 2).attr("y", -h / 2)
      .attr("width", wL).attr("height", h);

    rightG.select("rect.partner-box")
      .attr("x", -wR / 2).attr("y", -h / 2)
      .attr("width", wR).attr("height", h);

    nodeG.select("line.marriage-line")
      .attr("x1", -offsetL)
      .attr("x2", offsetR)
      .attr("y1", 0)
      .attr("y2", 0);
  }

  function birthOrderIndex(node) {
    if (node.data.type === "union") {
      const [aId] = node.data.partnerIds;
      const p = byId.get(aId);
      return p?.birthYear ?? 9999;
    }

    const p = byId.get(node.data.id);
    return p?.birthYear ?? 9999;
  }

  // ---- Render ----
  function update() {
    // 1) Run a standard tree layout once (for x ordering)
    const layout = d3.tree()
      .nodeSize([40, baseNodeHeight + 120])   // small initial horizontal spacing
      .separation(() => 0.6);                 // don't over-separate siblings
    layout(superRoot);
    superRoot.each(d => {
    if (d.parent) {
      d.x = d.parent.x + d.x * 0.6;
    }
  });

    // 2) Apply generation-based Y so ancestors are always at the top
    const all = superRoot.descendants().filter(d => d.data.type !== "root");

    function genOfPersonId(pid) {
      const p = byId.get(pid);
      const tagged = p?.generation;
      if (typeof tagged === "number") return tagged;
      return generations.get(pid) ?? 0;
    }

    const gens = all.map(d => {
      if (d.data.type === "union") {
        const [aId, bId] = d.data.partnerIds;
        return Math.min(genOfPersonId(aId), genOfPersonId(bId));
      }
      return genOfPersonId(d.data.id);
    });

    const minGen = d3.min(gens) ?? 0;

    // Normalize x so it starts near left margin
    const minX = d3.min(all, d => d.x) ?? 0;

    all.forEach((d, i) => {
      const g0 = gens[i];

      d.x = d.x - minX + 90;

      // Snap to generation row (top ancestors have smaller y)
      d.y = (g0 - minGen) * levelGapY + 80;

      // Hard-pin Y so forces can never move nodes between rows
      d.fy = d.y;
    });

    // 3) Dedup nodes by id, BUT reconcile X by averaging all occurrences
    const buckets = new Map(); // id -> { reps: [], sumX, minY }
      for (const n of all) {
        const id = n.data.id;
        if (!buckets.has(id)) buckets.set(id, { reps: [], sumX: 0, minY: Infinity });
        const b = buckets.get(id);
        b.reps.push(n);
        b.sumX += n.x;
        b.minY = Math.min(b.minY, n.y);
      }

    const nodeById = new Map();
    for (const [id, b] of buckets.entries()) {
      // choose the rep with the smallest Y (top-most), but set its x to the average
      const rep = b.reps.reduce((best, cur) => (cur.y < best.y ? cur : best), b.reps[0]);
      const avgX = b.sumX / b.reps.length;

      // IMPORTANT: apply avgX to all occurrences, so links/forces agree
      b.reps.forEach(n => { n.x = avgX; });

      nodeById.set(id, rep);
    }

    const allNodes = [...nodeById.values()];

    // 4) Dedup links
    const rawLinks = superRoot.links()
      .filter(l => l.source.data.type !== "root" && l.target.data.type !== "root");

    const linkByKey = new Map();
    for (const l of rawLinks) {
      const sid = l.source.data.id;
      const tid = l.target.data.id;

      const s = nodeById.get(sid);
      const t = nodeById.get(tid);
      if (!s || !t) continue;

      const key = `${sid}=>${tid}`;
      const length = Math.abs((t.y ?? 0) - (s.y ?? 0));

      const prev = linkByKey.get(key);
      if (!prev || length < prev._len) {
        linkByKey.set(key, { source: s, target: t, _len: length });
      }
    }
    const allLinks = [...linkByKey.values()].map(({ source, target }) => ({ source, target }));

    // ----------------------------
    // IMPORTANT CHANGE:
    // Build/resize nodes BEFORE sim so d._w/d._h exist for collide().
    // ----------------------------

    // NODES (enter/update)
    const nodeSel = nodesLayer.selectAll("g.node").data(allNodes, d => d.data.id);

    const nodeEnter = nodeSel.enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x},${d.y})`);

    // Build node contents only on enter
    nodeEnter.each(function(d) {
      const nodeG = d3.select(this);

      if (d.data.type === "union") {
        let [aId, bId] = d.data.partnerIds;
        let a = byId.get(aId);
        let b = byId.get(bId);

        const aBirth = a?.birthYear ?? 9999;
        const bBirth = b?.birthYear ?? 9999;

        if (bBirth < aBirth) {
          [aId, bId] = [bId, aId];
          [a, b] = [b, a];
        }

        nodeG.append("line").attr("class", "marriage-line");

        // left partner group
        const left = nodeG.append("g").attr("class", "partner-left");
        left.append("rect").attr("class", "partner-box");
        left.append("text").attr("class", "name").attr("text-anchor", "middle").attr("y", -10).text(a?.name ?? "—");
        left.append("text").attr("class", "years").attr("text-anchor", "middle").attr("y", 8).text(() => {
          const bY = a?.birthYear ?? "—";
          const dY = a?.deathYear ? `–${a.deathYear}` : "";
          return `${bY}${dY}`;
        });
        left.append("text").attr("class", "subtitle").attr("text-anchor", "middle").attr("y", 26).text(a?.currentLocation ?? "");

        // right partner group
        const right = nodeG.append("g").attr("class", "partner-right");
        right.append("rect").attr("class", "partner-box");
        right.append("text").attr("class", "name").attr("text-anchor", "middle").attr("y", -10).text(b?.name ?? "—");
        right.append("text").attr("class", "years").attr("text-anchor", "middle").attr("y", 8).text(() => {
          const bY = b?.birthYear ?? "—";
          const dY = b?.deathYear ? `–${b.deathYear}` : "";
          return `${bY}${dY}`;
        });
        right.append("text").attr("class", "subtitle").attr("text-anchor", "middle").attr("y", 26).text(b?.currentLocation ?? "");

      } else {
        // person node
        nodeG.append("rect").attr("class", "person-box");

        nodeG.append("circle")
          .attr("class", "status-dot")
          .attr("r", 5)
          .attr("fill", () => {
            const p = d.data.person;
            if (p.deathYear) return getCssVar("--deceased");
            if (p.birthYear) return getCssVar("--living");
            return getCssVar("--unknown");
          });

        nodeG.append("text")
          .attr("class", "name")
          .attr("text-anchor", "middle")
          .attr("y", -10)
          .text(d.data.person.name);

        nodeG.append("text")
          .attr("class", "years")
          .attr("text-anchor", "middle")
          .attr("y", 8)
          .text(() => {
            const p = d.data.person;
            const b = p.birthYear ?? "—";
            const dd = p.deathYear ? `–${p.deathYear}` : "";
            return `${b}${dd}`;
          });

        nodeG.append("text")
          .attr("class", "subtitle")
          .attr("text-anchor", "middle")
          .attr("y", 26)
          .text(d.data.person.currentLocation ?? "");
      }
    });

    // Merge selection so we can resize BOTH enter and update nodes
    const nodeMerge = nodeSel.merge(nodeEnter);
    const COLLIDE_PAD = 18;

    // Resize every node on every update (critical for correct collide radius)
    nodeMerge.each(function(d) {
      const nodeG = d3.select(this);
      if (d.data.type === "union") resizeUnionNode(nodeG, d);
      else resizePersonNode(nodeG, d);
    });

    // Remove exited nodes
    nodeSel.exit().remove();

    // 5) FORCE RELAXATION (X only) AFTER sizing so collision uses real widths
    const sim = d3.forceSimulation(allNodes)
    .force("link", d3.forceLink(allLinks)
      .id(d => d.data.id)
      .distance(50)        // tighter vertical components
      .strength(0.35)      // stronger pull together
    )
    .force("x", d3.forceX(d => d.parent ? d.parent.x : d.x).strength(0.15)) // stronger return to origin
    .force("center", d3.forceX(0).strength(0.15))   // global gravity inward
    .force("collide", d3.forceCollide(d => {
      const w = d._w ?? minNodeWidth;
      // width-based radius is what you actually want for horizontal box overlap
      return (w / 2) + COLLIDE_PAD;
    }).iterations(6))
    .stop();

    for (let i = 0; i < 140; i++) sim.tick();

    // Optional: after sim, shift so everything is comfortably on-screen from the left
    const minAfter = d3.min(allNodes, n => n.x) ?? 0;
    const shift = 90 - minAfter;
    allNodes.forEach(n => { n.x += shift; });

    // --- FINAL PASS: enforce no overlap within each generation row (same y) ---
    const ROW_GAP = 24; // extra horizontal spacing between boxes
    const rows = d3.group(allNodes, d => d.y);

    for (const [, rowNodes] of rows) {

      rowNodes.sort((a, b) => {
        const ba = birthOrderIndex(a);
        const bb = birthOrderIndex(b);
        if (ba !== bb) return ba - bb;
        return (a.data.id || "").localeCompare(b.data.id || "");
      });

      let cursor = 90;

      for (const n of rowNodes) {
        const w = n._w ?? minNodeWidth;
        n.x = cursor + w / 2;
        cursor += w + ROW_GAP;
      }

    }

    // 6) LINKS (after sim so they match final positions)
    const linkSel = linksLayer.selectAll("path.link")
      .data(allLinks, d => `${d.source.data.id}=>${d.target.data.id}`);

    linkSel.enter()
      .append("path")
      .attr("class", "link")
      .merge(linkSel)
      .attr("d", diagonal);

    linkSel.exit().remove();

    // 7) Apply final node transforms
    nodeMerge.attr("transform", d => `translate(${d.x},${d.y})`);
  }
 

  update();
  svg.call(zoom.transform, d3.zoomIdentity.translate(40, 80).scale(0.9));

  window.addEventListener("resize", () => update());
})();