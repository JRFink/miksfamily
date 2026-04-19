(async function () {

  // ── ISO 3166-1 numeric → continent ────────────────────────────────────────
  const ISO_CONTINENT = {
    // Africa
    12:"Africa",24:"Africa",72:"Africa",86:"Africa",108:"Africa",120:"Africa",
    132:"Africa",140:"Africa",174:"Africa",175:"Africa",178:"Africa",180:"Africa",
    204:"Africa",226:"Africa",231:"Africa",232:"Africa",262:"Africa",266:"Africa",
    270:"Africa",288:"Africa",324:"Africa",384:"Africa",404:"Africa",426:"Africa",
    430:"Africa",434:"Africa",450:"Africa",454:"Africa",466:"Africa",478:"Africa",
    480:"Africa",504:"Africa",508:"Africa",516:"Africa",562:"Africa",566:"Africa",
    624:"Africa",638:"Africa",646:"Africa",678:"Africa",686:"Africa",694:"Africa",
    706:"Africa",710:"Africa",716:"Africa",728:"Africa",729:"Africa",732:"Africa",
    748:"Africa",768:"Africa",788:"Africa",800:"Africa",818:"Africa",834:"Africa",
    854:"Africa",894:"Africa",
    // Asia
    4:"Asia",48:"Asia",50:"Asia",51:"Asia",64:"Asia",96:"Asia",104:"Asia",
    116:"Asia",144:"Asia",156:"Asia",158:"Asia",268:"Asia",356:"Asia",360:"Asia",
    364:"Asia",368:"Asia",376:"Asia",392:"Asia",398:"Asia",400:"Asia",408:"Asia",
    410:"Asia",414:"Asia",418:"Asia",422:"Asia",446:"Asia",458:"Asia",462:"Asia",
    496:"Asia",512:"Asia",524:"Asia",586:"Asia",608:"Asia",626:"Asia",634:"Asia",
    682:"Asia",702:"Asia",704:"Asia",760:"Asia",762:"Asia",764:"Asia",784:"Asia",
    792:"Asia",795:"Asia",860:"Asia",887:"Asia",
    // Europe
    8:"Europe",20:"Europe",40:"Europe",56:"Europe",70:"Europe",100:"Europe",
    112:"Europe",191:"Europe",196:"Europe",203:"Europe",208:"Europe",233:"Europe",
    246:"Europe",250:"Europe",276:"Europe",292:"Europe",300:"Europe",336:"Europe",
    348:"Europe",352:"Europe",372:"Europe",380:"Europe",428:"Europe",438:"Europe",
    440:"Europe",442:"Europe",470:"Europe",492:"Europe",498:"Europe",499:"Europe",
    528:"Europe",578:"Europe",616:"Europe",620:"Europe",642:"Europe",643:"Europe",
    688:"Europe",703:"Europe",705:"Europe",724:"Europe",752:"Europe",756:"Europe",
    804:"Europe",807:"Europe",826:"Europe",891:"Europe",
    // North America
    28:"North America",44:"North America",52:"North America",60:"North America",
    84:"North America",124:"North America",136:"North America",188:"North America",
    192:"North America",212:"North America",214:"North America",222:"North America",
    304:"North America",308:"North America",312:"North America",320:"North America",
    332:"North America",340:"North America",388:"North America",474:"North America",
    484:"North America",558:"North America",591:"North America",630:"North America",
    652:"North America",659:"North America",662:"North America",663:"North America",
    670:"North America",780:"North America",796:"North America",840:"North America",
    850:"North America",
    // South America
    32:"South America",68:"South America",76:"South America",152:"South America",
    170:"South America",218:"South America",238:"South America",254:"South America",
    328:"South America",600:"South America",604:"South America",740:"South America",
    858:"South America",862:"South America",
    // Oceania
    36:"Oceania",90:"Oceania",162:"Oceania",166:"Oceania",184:"Oceania",242:"Oceania",
    258:"Oceania",296:"Oceania",316:"Oceania",520:"Oceania",540:"Oceania",548:"Oceania",
    554:"Oceania",570:"Oceania",574:"Oceania",580:"Oceania",581:"Oceania",583:"Oceania",
    584:"Oceania",585:"Oceania",598:"Oceania",612:"Oceania",776:"Oceania",
    798:"Oceania",882:"Oceania",
    // Antarctica
    10:"Antarctica"
  };

  // ── Location string → continent ───────────────────────────────────────────
  const US_ABBREVS = new Set([
    'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia',
    'ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj',
    'nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt',
    'va','wa','wv','wi','wy','dc'
  ]);
  const US_STATE_NAMES = [
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
    'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
    'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
    'minnesota','mississippi','missouri','montana','nebraska','nevada',
    'new hampshire','new jersey','new mexico','new york','north carolina',
    'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
    'south carolina','south dakota','tennessee','texas','utah','vermont',
    'virginia','washington','west virginia','wisconsin','wyoming'
  ];
  const EUROPE_KEYWORDS = [
    'old country','europe','ukraine','germany','poland','ireland','italy',
    'russia','czech','slovakia','austria','hungary','france','spain','portugal',
    'sweden','norway','denmark','finland','croatia','serbia','romania','bulgaria',
    'greece','turkey','latvia','lithuania','estonia','belarus','moldova'
  ];

  function locationToContinent(loc) {
    if (!loc) return null;
    const l = loc.replace(/\*/g, '').trim().toLowerCase();
    if (!l || l === '—' || l === '-') return null;
    for (const kw of EUROPE_KEYWORDS) {
      if (l.includes(kw)) return 'Europe';
    }
    // US state abbreviation as a standalone word token
    const tokens = l.split(/[\s,]+/);
    for (const t of tokens) {
      if (US_ABBREVS.has(t)) return 'North America';
    }
    for (const name of US_STATE_NAMES) {
      if (l.includes(name)) return 'North America';
    }
    if (l.includes('united states') || l.includes(' usa') || l.includes('u.s.'))
      return 'North America';
    return null;
  }

  // ── Continent styling ─────────────────────────────────────────────────────
  const CONTINENT_STYLE = {
    'Africa':        { fill: '#e8c49a', hover: '#d4a870' },
    'Asia':          { fill: '#e8a8a8', hover: '#d48080' },
    'Europe':        { fill: '#90c8e0', hover: '#60a8cc' },
    'North America': { fill: '#a8d4a8', hover: '#78b878' },
    'South America': { fill: '#f0d080', hover: '#d8b050' },
    'Oceania':       { fill: '#c8b8e0', hover: '#a898cc' },
    'Antarctica':    { fill: '#d8d8d8', hover: '#b8b8b8' },
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let mapInitialized = false;
  let selectedContinent = null;
  let continentPaths = null;
  let mapZoom = null;
  let mapSvg = null;

  // ── Toggle ────────────────────────────────────────────────────────────────
  const treeView = document.getElementById('tree-view');
  const mapView  = document.getElementById('map-view');
  const btnTree  = document.getElementById('btn-tree');
  const btnMap   = document.getElementById('btn-map');

  btnTree.addEventListener('click', () => {
    treeView.style.display = '';
    mapView.style.display  = 'none';
    btnTree.classList.add('active');
    btnMap.classList.remove('active');
  });

  btnMap.addEventListener('click', async () => {
    treeView.style.display = 'none';
    mapView.style.display  = 'flex';
    btnMap.classList.add('active');
    btnTree.classList.remove('active');
    if (!mapInitialized) { mapInitialized = true; await initMap(); }
  });

  // ── Map init ──────────────────────────────────────────────────────────────
  async function initMap() {
    const [world, familyData] = await Promise.all([
      d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
      d3.json("./data/family.json")
    ]);

    const people = familyData?.people || [];

    // Build continent → people list
    const continentPeople = new Map();
    people.forEach(p => {
      const c = locationToContinent(p.currentLocation);
      if (!c) return;
      if (!continentPeople.has(c)) continentPeople.set(c, []);
      continentPeople.get(c).push(p);
    });

    // Build continent GeoJSON features by merging country geometries
    const continentFeatures = Object.keys(CONTINENT_STYLE).map(name => ({
      type: "Feature",
      properties: { name },
      geometry: topojson.merge(
        world,
        world.objects.countries.geometries.filter(g => ISO_CONTINENT[+g.id] === name)
      )
    })).filter(f => f.geometry);

    // ── SVG / projection ──────────────────────────────────────────────────
    const container = document.getElementById('map-canvas');
    const svgW = container.clientWidth  || window.innerWidth - 280;
    const svgH = container.clientHeight || window.innerHeight;

    mapSvg = d3.select('#mapSvg');
    const g = mapSvg.append('g');

    const projection = d3.geoNaturalEarth1()
      .scale(svgW / 6.3)
      .translate([svgW / 2, svgH / 2]);
    const path = d3.geoPath().projection(projection);

    // Graticule
    g.append('path')
      .datum(d3.geoGraticule()())
      .attr('class', 'graticule')
      .attr('d', path);

    // Sphere (ocean background)
    g.append('path')
      .datum({ type: 'Sphere' })
      .attr('class', 'map-sphere')
      .attr('d', path);

    // Zoom
    mapZoom = d3.zoom()
      .scaleExtent([1, 12])
      .on('zoom', e => g.attr('transform', e.transform));
    mapSvg.call(mapZoom).on('dblclick.zoom', null);

    // Continent paths
    continentPaths = g.selectAll('.continent')
      .data(continentFeatures)
      .join('path')
        .attr('class', 'continent')
        .attr('d', path)
        .attr('fill', d => CONTINENT_STYLE[d.properties.name].fill)
        .on('mouseover', function (_, d) {
          if (selectedContinent === d.properties.name) return;
          d3.select(this).attr('fill', CONTINENT_STYLE[d.properties.name].hover);
          if (!selectedContinent) previewSidebar(d.properties.name, continentPeople);
        })
        .on('mouseout', function (_, d) {
          if (selectedContinent === d.properties.name) return;
          d3.select(this).attr('fill', CONTINENT_STYLE[d.properties.name].fill);
          if (!selectedContinent) clearSidebar();
        })
        .on('click', function (event, d) {
          event.stopPropagation();
          selectContinent(d, path, svgW, svgH, continentPeople);
        });

    // Continent labels
    g.selectAll('.continent-label')
      .data(continentFeatures)
      .join('text')
        .attr('class', 'continent-label')
        .attr('transform', d => `translate(${path.centroid(d)})`)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .text(d => d.properties.name)
        .style('pointer-events', 'none');

    // Click ocean → back to world
    mapSvg.on('click', () => {
      if (selectedContinent) resetToWorld();
    });

    // Back button
    document.getElementById('map-back-btn').addEventListener('click', resetToWorld);

    function resetToWorld() {
      selectedContinent = null;
      continentPaths.attr('fill', d => CONTINENT_STYLE[d.properties.name].fill);
      mapSvg.transition().duration(650)
        .call(mapZoom.transform, d3.zoomIdentity);
      clearSidebar();
      document.getElementById('map-back-btn').style.display = 'none';
    }
  }

  function selectContinent(d, path, svgW, svgH, continentPeople) {
    selectedContinent = d.properties.name;

    continentPaths.attr('fill', f =>
      f.properties.name === selectedContinent
        ? CONTINENT_STYLE[f.properties.name].hover
        : CONTINENT_STYLE[f.properties.name].fill
    );

    // Zoom to continent bounds
    const [[x0, y0], [x1, y1]] = path.bounds(d);
    const scale = Math.min(8, 0.82 / Math.max((x1 - x0) / svgW, (y1 - y0) / svgH));
    const tx = svgW / 2 - scale * (x0 + x1) / 2;
    const ty = svgH / 2 - scale * (y0 + y1) / 2;
    mapSvg.transition().duration(700)
      .call(mapZoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));

    showPeopleList(d.properties.name, continentPeople);
    document.getElementById('map-back-btn').style.display = 'block';
  }

  function previewSidebar(continentName, continentPeople) {
    const count = (continentPeople.get(continentName) || []).length;
    document.getElementById('map-sidebar-title').textContent =
      `${continentName} — ${count} relative${count !== 1 ? 's' : ''}`;
  }

  function clearSidebar() {
    document.getElementById('map-sidebar-title').textContent = 'Click a continent';
    document.getElementById('map-people-list').innerHTML = '';
  }

  function showPeopleList(continentName, continentPeople) {
    const people = [...(continentPeople.get(continentName) || [])]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    document.getElementById('map-sidebar-title').textContent =
      `${continentName} (${people.length})`;

    const list = document.getElementById('map-people-list');
    list.innerHTML = '';

    if (!people.length) {
      list.innerHTML = '<li class="map-no-people">No relatives found here</li>';
      return;
    }

    people.forEach(p => {
      const li = document.createElement('li');
      li.className = 'map-person-item';
      const years = p.birthYear
        ? p.birthYear + (p.deathYear ? `–${p.deathYear}` : '')
        : '';
      li.innerHTML = `
        <span class="map-person-name">${p.name || '—'}</span>
        <span class="map-person-loc">${(p.currentLocation || '').replace(/\*/g, '')}</span>
        ${years ? `<span class="map-person-years">${years}</span>` : ''}
      `;
      list.appendChild(li);
    });
  }

})();
