(async function () {
  const svg = d3.select("#treeSvg");
  const g = svg.append("g");           // zoom root
  const linksLayer = g.append("g");    // edges
  const nodesLayer = g.append("g");    // nodes
  const marriagesLayer = g.append("g");// marriage lines (between partners)
  const parentConnectorLayer = g.append("g").attr("class", "parent-connectors"); 

  const width = () => svg.node().clientWidth;
  const height = () => svg.node().clientHeight;

  // Zoom behavior (wheel/pinch/drag)
  const zoom = d3.zoom()
    .scaleExtent([0.2, 3])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
  svg.call(zoom).on("dblclick.zoom", null); // disable dblclick zoom to keep double-click for expand/collapse

  // Data
  const data = await d3.json("./data/family.json");
  // Expect: { people: Person[] }
  // Person: { id, name, birthYear?, deathYear?, photo?, notes?, parentIds?:[], spouseIds?:[], order?:number }

  // Build lookup maps
  const byId = new Map();
  data.people.forEach(p => byId.set(p.id, p));

  // Build children map from parent relationships
  const childrenOf = new Map(); // id -> Set(childrenIds)
  data.people.forEach(p => { childrenOf.set(p.id, new Set()); });

  data.people.forEach(child => {
    (child.parentIds || []).forEach(pid => {
      if (childrenOf.has(pid)) childrenOf.get(pid).add(child.id);
    });
  });

  // Roots = people who have no parentIds (or empty)
  const roots = data.people.filter(p => !p.parentIds || p.parentIds.length === 0);

  // Optionally order siblings (using 'order' field if present)
  function sortChildren(ids){
    return [...ids].sort((a,b) => {
      const pa = byId.get(a), pb = byId.get(b);
      const oa = pa?.order ?? 0, ob = pb?.order ?? 0;
      if (oa !== ob) return oa - ob;
      return (pa?.name || "").localeCompare(pb?.name || "");
    });
  }

  // Construct hierarchical trees per root
  function makeTree(rootId){
    const rootPerson = byId.get(rootId);
    const toHierarchy = (pid) => {
      const person = byId.get(pid);
      const kids = sortChildren(childrenOf.get(pid));
      return {
        id: person.id,
        person,
        children: kids.map(toHierarchy)
      };
    };
    return toHierarchy(rootPerson.id);
  }

  const forests = roots.map(r => d3.hierarchy(makeTree(r.id), d => d.children));

  // Collapsible: store _children
  forests.forEach(root => {
    root.each(d => { if (d.children && d.children.length > 0) { d._children = d.children; } });
    // Start collapsed except top 2 levels
    root.children = root._children;
    if (root.children) {
      root.children.forEach(c => {
        c.children = c._children;
        if (c.children) c.children.forEach(gc => { gc.children = null; });
      });
    }
  });

  const MY_ID = "jeffrey-r-fink";
  function computeGenerations() {
  const gen = new Map();
  gen.set(MY_ID, 0);

  // BFS for ancestors (negative direction)
  let queue = [MY_ID];
  while (queue.length > 0) {
    const id = queue.shift();
    const g = gen.get(id);
    const person = byId.get(id);

    (person.parentIds || []).forEach(pid => {
      if (!gen.has(pid)) {
        gen.set(pid, g - 1);
        queue.push(pid);
      }
    });
  }

  // BFS for descendants (positive direction)
  queue = [MY_ID];
  while (queue.length > 0) {
    const id = queue.shift();
    const g = gen.get(id);

    const kids = [...childrenOf.get(id)];
    kids.forEach(cid => {
      if (!gen.has(cid)) {
        gen.set(cid, g + 1);
        queue.push(cid);
      }
    });
  }

  return gen;
}

const generations = computeGenerations();

  // Layout config
  const nodeWidth = 180;
  const nodeHeight = 64;
  const nodeSepX = 32;
  const nodeSepY = 90;

  // Render everything
  function update() {
    // Compute layout for each root, and place trees vertically one after another
    const renderedTrees = [];
    let yOffset = 40;

    forests.forEach(root => {
      const layout = d3.tree()
        .nodeSize([nodeWidth + nodeSepX, nodeHeight + nodeSepY]);

      layout(root);

      // shift to avoid overlap with previous tree
      const minX = d3.min(root.descendants(), d => d.x);
      const maxX = d3.max(root.descendants(), d => d.x);
      const spanX = maxX - minX;

      root.each(d => {
        const gid = generations.get(d.data.id) ?? 0;
        d.x = d.x - minX + 40;        // left padding
        d.y = gid * (nodeHeight + nodeSepY) + yOffset;
      });

      yOffset += (root.height + 1) * (nodeHeight + nodeSepY) + 140;
      renderedTrees.push(root);
    });

    // Collect links across all trees
    const allLinks = renderedTrees.flatMap(root => root.links());

    // LINKS (parent-child)
    const linkSel = linksLayer.selectAll("path.link").data(allLinks, d => d.target.data.id);
    linkSel.enter()
      .append("path")
      .attr("class", "link")
      .attr("d", diagonal)
      .merge(linkSel)
      .transition().duration(350)
      .attr("d", diagonal);
    linkSel.exit().remove();

    // NODES
    const allNodes = renderedTrees.flatMap(root => root.descendants());
    drawParentConnectors(allNodes);
    const nodeSel = nodesLayer.selectAll("g.node").data(allNodes, d => d.data.id);

    const nodeEnter = nodeSel.enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .on("click", (e, d) => {
        // toggle collapse on double-click behavior; single-click shows details
        if (e.detail === 2) {
          toggle(d); update(); return;
        }
        showDetails(d);
        highlightNode(d);
      });

    // Node box
    nodeEnter.append("rect")
      .attr("x", -nodeWidth/2).attr("y", -nodeHeight/2)
      .attr("width", nodeWidth).attr("height", nodeHeight);

    // Status dot (living/deceased/unknown)
    nodeEnter.append("circle")
      .attr("class", "status-dot")
      .attr("r", 5)
      .attr("cx", -nodeWidth/2 + 12)
      .attr("cy", -nodeHeight/2 + 12)
      .attr("fill", d => {
        const p = d.data.person;
        if (p.deathYear) return getCssVar("--deceased");
        if (p.birthYear) return getCssVar("--living");
        return getCssVar("--unknown");
      });

    // Name
    nodeEnter.append("text")
      .attr("class", "name")
      .attr("text-anchor", "middle")
      .attr("y", -6)
      .text(d => d.data.person.name);

    // Years
    nodeEnter.append("text")
      .attr("class", "years")
      .attr("text-anchor", "middle")
      .attr("y", 12)
      .text(d => {
        const p = d.data.person;
        const b = p.birthYear ?? "—";
        const dd = p.deathYear ? `–${p.deathYear}` : "";
        return `${b}${dd}`;
      });

    // Subtitle (optional, e.g., place/occupation)
    nodeEnter.append("text")
      .attr("class", "subtitle")
      .attr("text-anchor", "middle")
      .attr("y", 28)
      .text(d => d.data.person.subtitle ?? "");

    // Update existing
    nodeSel.merge(nodeEnter)
      .transition().duration(350)
      .attr("transform", d => `translate(${d.x},${d.y})`);

    nodeSel.exit().remove();

    // MARRIAGE LINES (lightweight: draw a short dashed line between spouses at the same depth if nearby)
    const marriageLines = [];
    data.people.forEach(p => {
      (p.spouseIds || []).forEach(sp => {
        // Avoid duplicates by ordering pair
        if (p.id < sp) {
          const a = allNodes.find(n => n.data.id === p.id);
          const b = allNodes.find(n => n.data.id === sp);
          if (a && b && a.depth === b.depth) {
            marriageLines.push({ a, b, key: `${p.id}-${sp}` });
          }
        }
      });
    });

    const marriageSel = marriagesLayer.selectAll("path.marriage").data(marriageLines, d => d.key);
    marriageSel.enter()
      .append("path")
      .attr("class", "link marriage")
      .classed("marriage", true)
      .attr("d", d => shortLine(d.a, d.b))
      .merge(marriageSel)
      .transition().duration(350)
      .attr("d", d => shortLine(d.a, d.b));
    marriageSel.exit().remove();
    const allNodesAgain = renderedTrees.flatMap(root => root.descendants()); 
  }

  function diagonal(link){
    // Smooth vertical elbow
    const sx = link.source.x, sy = link.source.y;
    const tx = link.target.x, ty = link.target.y;
    const mx = (sx + tx) / 2;
    return `M ${sx},${sy} C ${mx},${sy} ${mx},${ty} ${tx},${ty}`;
  }

  function drawParentConnectors(allNodes) {
    const connectors = [];

    allNodes.forEach(child => {
      const parents = (child.data.person.parentIds || [])
        .map(id => allNodes.find(n => n.data.id === id))
        .filter(Boolean);

      if (parents.length < 2) return;

      const midX = d3.mean(parents, p => p.x);
      const joinY = parents[0].y + nodeHeight / 2;
      const childY = child.y - nodeHeight / 2;

      // from parents to join
      parents.forEach(p => {
        connectors.push({
          x1: p.x,
          y1: p.y + nodeHeight / 2,
          x2: midX,
          y2: joinY
        });
      });

      // down to child
      connectors.push({
        x1: midX,
        y1: joinY,
        x2: midX,
        y2: childY
      });

      connectors.push({
        x1: midX,
        y1: childY,
        x2: child.x,
        y2: childY
      });
    });

    const sel = parentConnectorLayer
      .selectAll("line")
      .data(connectors);

    sel.enter()
      .append("line")
      .attr("stroke", "#2e7d32")
      .attr("stroke-width", 3)
      .merge(sel)
      .attr("x1", d => d.x1)
      .attr("y1", d => d.y1)
      .attr("x2", d => d.x2)
      .attr("y2", d => d.y2);

    sel.exit().remove();
  }

  function shortLine(a, b){
    // Little dashed line between spouse node boxes (center to center)
    return `M ${a.x},${a.y} L ${b.x},${b.y}`;
  }

  function toggle(d){
    if (d.children) { d._children = d.children; d.children = null; }
    else { d.children = d._children; d._children = null; }
  }

  function getCssVar(n){
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }

  // ---- Details panel ----
  const el = {
    photo: document.getElementById("personPhoto"),
    name: document.getElementById("personName"),
    years: document.getElementById("personYears"),
    notes: document.getElementById("personNotes"),
    parents: document.getElementById("personParents"),
    spouses: document.getElementById("personSpouses"),
    children: document.getElementById("personChildren")
  };

  function personLabel(id){
    const p = byId.get(id); return p ? p.name : "—";
  }

  function listNames(ids){
    if (!ids || ids.length === 0) return "—";
    return ids.map(personLabel).join(", ");
  }

  function childrenOfPerson(pid){
    return sortChildren(childrenOf.get(pid));
  }

  function showDetails(d){
    const p = d.data.person;
    el.name.textContent = p.name;
    const yrs = p.birthYear ? `${p.birthYear}` : "";
    el.years.textContent = p.deathYear ? `${yrs} – ${p.deathYear}` : yrs || "—";
    el.notes.textContent = p.notes || "";
    el.parents.textContent = listNames(p.parentIds);
    el.spouses.textContent = listNames(p.spouseIds);
    el.children.textContent = listNames(childrenOfPerson(p.id));

    const photoSrc = p.photo ? `./photos/${p.photo}` : "";
    el.photo.src = photoSrc;
    el.photo.alt = p.photo ? `${p.name}'s photo` : "";
  }

  // ---- Search and highlight ----
  let highlighted = null;
  function highlightNode(d){
    if (highlighted) highlighted.classed("highlight", false);
    const sel = nodesLayer.selectAll("g.node").filter(n => n.data.id === d.data.id);
    sel.classed("highlight", true);
    highlighted = sel;

    // Smoothly pan/zoom to the node
    const t = d3.zoomTransform(svg.node());
    const scale = t.k;
    const cx = width()/2, cy = height()/2;
    const targetX = d.x, targetY = d.y;
    const translate = [cx - targetX*scale, cy - targetY*scale];
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  }

  function resetView(){
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(40, 40).scale(0.85));
    nodesLayer.selectAll("g.node").classed("highlight", false);
    highlighted = null;
  }

  // document.getElementById("resetBtn").addEventListener("click", resetView);

  // document.getElementById("searchBtn").addEventListener("click", () => {
  //   const q = document.getElementById("searchInput").value.trim().toLowerCase();
  //   if (!q) return;
  //   const node = nodesLayer.selectAll("g.node").filter(d => (d.data.person.name || "").toLowerCase().includes(q)).data()[0];
  //   if (node) {
  //     // Expand path to this node
  //     expandPathTo(node);
  //     update();
  //     // we need a tiny delay for layout to settle
  //     setTimeout(() => {
  //       highlightNode(node);
  //       showDetails(node);
  //     }, 20);
  //   }
  // });

  // document.getElementById("collapseAllBtn").addEventListener("click", () => {
  //   forests.forEach(root => {
  //     root.each(d => { if (d.children) { d._children = d.children; d.children = null; } });
  //     // Keep top level expanded
  //     root.children = root._children;
  //   });
  //   update();
  // });

  // document.getElementById("expandAllBtn").addEventListener("click", () => {
  //   forests.forEach(root => {
  //     root.each(d => { if (d._children) { d.children = d._children; d._children = null; } });
  //   });
  //   update();
  // });

  function expandPathTo(target){
    // climb to the root and expand children along the way
    let d = target;
    while (d.parent){
      if (d.parent._children) { d.parent.children = d.parent._children; d.parent._children = null; }
      d = d.parent;
    }
  }

  // Initial render + view
  update();
  // resetView();

  // Center single-person trees (no parent/child links)
if (forests.length === 1 && forests[0].descendants().length === 1) {
  const lone = forests[0].descendants()[0];
  lone.x = width() / 2;
  lone.y = height() / 2;

  const node = nodesLayer.selectAll("g.node").data([lone]);
  const nodeEnter = node.enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", `translate(${lone.x},${lone.y})`)
    .on("click", () => showDetails({ data: { person: lone.data.person } }));

  nodeEnter.append("rect")
    .attr("x", -90)
    .attr("y", -40)
    .attr("width", 180)
    .attr("height", 80)
    .attr("rx", 25)
    .attr("ry", 25)
    .attr("fill", "#c3e6cb")
    .attr("stroke", "#2e7d32")
    .attr("stroke-width", 2);

  nodeEnter.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em")
    .attr("font-size", "20px")
    .attr("fill", "#1b5e20")
    .text(lone.data.person.name);
}

  // Resize handling
  window.addEventListener("resize", () => {
    // No specific action needed; SVG is responsive. We could recompute layout if desired.
  });
})();


