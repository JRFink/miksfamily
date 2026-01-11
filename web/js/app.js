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
      const pa = byId.get(a), pb = byId.get(b);
      const oa = pa?.order ?? 0, ob = pb?.order ?? 0;
      if (oa !== ob) return oa - ob;
      return (pa?.name || "").localeCompare(pb?.name || "");
    });
  }

  // ---- Unions ----
  function pairKey(a, b) {
    return a < b ? `${a}__${b}` : `${b}__${a}`;
  }

  function sharedChildren(aId, bId) {
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
    if (spouseId && byId.has(spouseId)) {
      const key = pairKey(pid, spouseId);
      const union = unionsByKey.get(key);
      if (union && union.childrenIds && union.childrenIds.length > 0) {
        return {
          id: union.id,
          type: "union",
          partnerIds: union.partnerIds,
          children: union.childrenIds.map(makeHierarchyForPerson).filter(Boolean)
        };
      }
    }

    const kids = sortChildren(childrenOf.get(pid));
    return {
      id: pid,
      type: "person",
      person,
      children: kids.map(makeHierarchyForPerson).filter(Boolean)
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

  const forests = [
    ...unionRoots.map(u => d3.hierarchy(makeHierarchyForUnion(u), d => d.children)),
    ...loneRoots.map(r => d3.hierarchy(makeHierarchyForPerson(r.id), d => d.children))
  ];

  // ---- Layout config ----
  const nodeWidth = 180;
  const nodeHeight = 74;
  const nodeSepX = 40;
  const nodeSepY = 110;

  const partnerGap = 28;

  function anchorPoint(node, which) {
    // node.x/node.y are the CENTER of the node-group
    // For people and unions we treat "top" and "bottom" as +/- nodeHeight/2
    const x = node.x;

    if (which === "top") return { x, y: node.y - nodeHeight / 2 };
    if (which === "bottom") return { x, y: node.y + nodeHeight / 2 };

    return { x, y: node.y };
  }

  function diagonal(link) {
    const s = anchorPoint(link.source, "bottom");
    const t = anchorPoint(link.target, "top");

    const mx = (s.x + t.x) / 2;
    return `M ${s.x},${s.y} C ${mx},${s.y} ${mx},${t.y} ${t.x},${t.y}`;
  }

  function getCssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }

  // ---- Render ----
  function update() {
    const renderedTrees = [];
    let yOffset = 60;

    forests.forEach(root => {
      const layout = d3.tree().nodeSize([nodeWidth + nodeSepX, nodeHeight + nodeSepY]);
      layout(root);

      const minX = d3.min(root.descendants(), d => d.x) ?? 0;

      root.each(d => {
        let gid = 0;

        if (d.data.type === "union") {
          const [aId, bId] = d.data.partnerIds;
          const ga = generations.get(aId);
          const gb = generations.get(bId);
          gid = Math.min(ga ?? 0, gb ?? 0);
        } else {
          gid = generations.get(d.data.id) ?? 0;
        }

        d.x = d.x - minX + 60;
        d.y = gid * (nodeHeight + nodeSepY) + yOffset;
      });

      yOffset += (root.height + 2) * (nodeHeight + nodeSepY) + 140;
      renderedTrees.push(root);
    });

    // Flatten
    const rawNodes = renderedTrees.flatMap(r => r.descendants());
    const rawLinks = renderedTrees.flatMap(r => r.links());

    // 1) Dedup nodes by id, keeping the "top-most" copy (smallest y)
    const nodeById = new Map();
    for (const n of rawNodes) {
      const id = n.data.id;
      const prev = nodeById.get(id);
      if (!prev || n.y < prev.y) nodeById.set(id, n);
    }
    const allNodes = [...nodeById.values()];

    // 2) Dedup links by source=>target, and only keep links whose endpoints survive
    // Also prefer the shorter link if duplicates exist.
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

    // LINKS
    const linkSel = linksLayer.selectAll("path.link").data(allLinks, d => `${d.source.data.id}=>${d.target.data.id}`);
    linkSel.enter()
      .append("path")
      .attr("class", "link")
      .attr("d", diagonal)
      .merge(linkSel)
      .transition().duration(250)
      .attr("d", diagonal);
    linkSel.exit().remove();

    // NODES
    const nodeSel = nodesLayer.selectAll("g.node").data(allNodes, d => d.data.id);

    const nodeEnter = nodeSel.enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x},${d.y})`);

    nodeEnter.each(function(d) {
      const nodeG = d3.select(this);

      if (d.data.type === "union") {
        const [aId, bId] = d.data.partnerIds;
        const a = byId.get(aId);
        const b = byId.get(bId);

        const half = nodeWidth / 2;
        const offset = half + partnerGap / 2;

        // marriage line
        nodeG.append("line")
          .attr("class", "marriage-line")
          .attr("x1", -offset)
          .attr("y1", 0)
          .attr("x2", offset)
          .attr("y2", 0);

        // left partner
        const left = nodeG.append("g").attr("transform", `translate(${-offset},0)`);
        left.append("rect")
          .attr("x", -half).attr("y", -nodeHeight/2)
          .attr("width", nodeWidth).attr("height", nodeHeight);
        left.append("text")
          .attr("class", "name")
          .attr("text-anchor", "middle")
          .attr("y", -10)
          .text(a?.name ?? "—");
        left.append("text")
          .attr("class", "years")
          .attr("text-anchor", "middle")
          .attr("y", 8)
          .text(() => {
            const bY = a?.birthYear ?? "—";
            const dY = a?.deathYear ? `–${a.deathYear}` : "";
            return `${bY}${dY}`;
          });
        left.append("text")
          .attr("class", "subtitle")
          .attr("text-anchor", "middle")
          .attr("y", 26)
          .text(a?.currentLocation ?? "");

        // right partner
        const right = nodeG.append("g").attr("transform", `translate(${offset},0)`);
        right.append("rect")
          .attr("x", -half).attr("y", -nodeHeight/2)
          .attr("width", nodeWidth).attr("height", nodeHeight);
        right.append("text")
          .attr("class", "name")
          .attr("text-anchor", "middle")
          .attr("y", -10)
          .text(b?.name ?? "—");
        right.append("text")
          .attr("class", "years")
          .attr("text-anchor", "middle")
          .attr("y", 8)
          .text(() => {
            const bY = b?.birthYear ?? "—";
            const dY = b?.deathYear ? `–${b.deathYear}` : "";
            return `${bY}${dY}`;
          });
        right.append("text")
          .attr("class", "subtitle")
          .attr("text-anchor", "middle")
          .attr("y", 26)
          .text(b?.currentLocation ?? "");

      } else {
        // person node
        nodeG.append("rect")
          .attr("x", -nodeWidth/2).attr("y", -nodeHeight/2)
          .attr("width", nodeWidth).attr("height", nodeHeight);

        nodeG.append("circle")
          .attr("class", "status-dot")
          .attr("r", 5)
          .attr("cx", -nodeWidth/2 + 12)
          .attr("cy", -nodeHeight/2 + 12)
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

    nodeSel.merge(nodeEnter)
      .transition().duration(250)
      .attr("transform", d => `translate(${d.x},${d.y})`);

    nodeSel.exit().remove();
  }

  update();
  svg.call(zoom.transform, d3.zoomIdentity.translate(40, 80).scale(0.9));

  window.addEventListener("resize", () => update());
})();