(async function () {

  // ── ISO 3166-1 numeric → continent ────────────────────────────────────────
  const ISO_CONTINENT = {
    12:"Africa",24:"Africa",72:"Africa",86:"Africa",108:"Africa",120:"Africa",
    132:"Africa",140:"Africa",148:"Africa",174:"Africa",175:"Africa",178:"Africa",
    180:"Africa",204:"Africa",226:"Africa",231:"Africa",232:"Africa",262:"Africa",
    266:"Africa",270:"Africa",288:"Africa",324:"Africa",384:"Africa",404:"Africa",
    426:"Africa",430:"Africa",434:"Africa",450:"Africa",454:"Africa",466:"Africa",
    478:"Africa",480:"Africa",504:"Africa",508:"Africa",516:"Africa",562:"Africa",
    566:"Africa",624:"Africa",638:"Africa",646:"Africa",678:"Africa",686:"Africa",
    694:"Africa",706:"Africa",710:"Africa",716:"Africa",728:"Africa",729:"Africa",
    732:"Africa",748:"Africa",768:"Africa",788:"Africa",800:"Africa",818:"Africa",
    834:"Africa",854:"Africa",894:"Africa",
    4:"Asia",48:"Asia",50:"Asia",51:"Asia",64:"Asia",96:"Asia",104:"Asia",
    116:"Asia",144:"Asia",156:"Asia",158:"Asia",268:"Asia",356:"Asia",360:"Asia",
    364:"Asia",368:"Asia",376:"Asia",392:"Asia",398:"Asia",400:"Asia",408:"Asia",
    410:"Asia",414:"Asia",418:"Asia",422:"Asia",446:"Asia",458:"Asia",462:"Asia",
    496:"Asia",512:"Asia",524:"Asia",586:"Asia",608:"Asia",626:"Asia",634:"Asia",
    682:"Asia",702:"Asia",704:"Asia",760:"Asia",762:"Asia",764:"Asia",784:"Asia",
    792:"Asia",795:"Asia",860:"Asia",887:"Asia",
    8:"Europe",20:"Europe",40:"Europe",56:"Europe",70:"Europe",100:"Europe",
    112:"Europe",191:"Europe",196:"Europe",203:"Europe",208:"Europe",233:"Europe",
    246:"Europe",250:"Europe",276:"Europe",292:"Europe",300:"Europe",336:"Europe",
    348:"Europe",352:"Europe",372:"Europe",380:"Europe",428:"Europe",438:"Europe",
    440:"Europe",442:"Europe",470:"Europe",492:"Europe",498:"Europe",499:"Europe",
    528:"Europe",578:"Europe",616:"Europe",620:"Europe",642:"Europe",643:"Europe",
    688:"Europe",703:"Europe",705:"Europe",724:"Europe",752:"Europe",756:"Europe",
    804:"Europe",807:"Europe",826:"Europe",891:"Europe",
    28:"North America",44:"North America",52:"North America",60:"North America",
    84:"North America",124:"North America",136:"North America",188:"North America",
    192:"North America",212:"North America",214:"North America",222:"North America",
    304:"North America",308:"North America",312:"North America",320:"North America",
    332:"North America",340:"North America",388:"North America",474:"North America",
    484:"North America",558:"North America",591:"North America",630:"North America",
    652:"North America",659:"North America",662:"North America",663:"North America",
    670:"North America",780:"North America",796:"North America",840:"North America",
    850:"North America",
    32:"South America",68:"South America",76:"South America",152:"South America",
    170:"South America",218:"South America",238:"South America",254:"South America",
    328:"South America",600:"South America",604:"South America",740:"South America",
    858:"South America",862:"South America",
    36:"Oceania",90:"Oceania",162:"Oceania",166:"Oceania",184:"Oceania",242:"Oceania",
    258:"Oceania",296:"Oceania",316:"Oceania",520:"Oceania",540:"Oceania",548:"Oceania",
    554:"Oceania",570:"Oceania",574:"Oceania",580:"Oceania",581:"Oceania",583:"Oceania",
    584:"Oceania",585:"Oceania",598:"Oceania",612:"Oceania",776:"Oceania",
    798:"Oceania",882:"Oceania",
    10:"Antarctica"
  };

  // ── Location → continent ──────────────────────────────────────────────────
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
    for (const kw of EUROPE_KEYWORDS) { if (l.includes(kw)) return 'Europe'; }
    const tokens = l.split(/[\s,]+/);
    for (const t of tokens) { if (US_ABBREVS.has(t)) return 'North America'; }
    for (const name of US_STATE_NAMES) { if (l.includes(name)) return 'North America'; }
    if (l.includes('united states') || l.includes(' usa') || l.includes('u.s.')) return 'North America';
    return null;
  }

  // ── Geocoding ─────────────────────────────────────────────────────────────
  const STATE_COORDS = {
    AL:[32.81,-86.79],AK:[61.37,-152.40],AZ:[33.73,-111.43],AR:[34.97,-92.37],
    CA:[36.12,-119.68],CO:[39.06,-105.31],CT:[41.60,-72.76],DE:[39.32,-75.51],
    FL:[27.77,-81.69],GA:[33.04,-83.64],HI:[21.09,-157.50],ID:[44.24,-114.48],
    IL:[40.35,-88.99],IN:[39.85,-86.26],IA:[42.01,-93.21],KS:[38.53,-96.73],
    KY:[37.67,-84.67],LA:[31.17,-91.87],ME:[44.69,-69.38],MD:[39.06,-76.80],
    MA:[42.23,-71.53],MI:[43.33,-84.54],MN:[45.69,-93.90],MS:[32.74,-89.68],
    MO:[38.46,-92.29],MT:[46.92,-110.45],NE:[41.13,-98.27],NV:[38.31,-117.06],
    NH:[43.45,-71.56],NJ:[40.30,-74.52],NM:[34.84,-106.25],NY:[42.17,-74.95],
    NC:[35.63,-79.81],ND:[47.53,-99.78],OH:[40.39,-82.76],OK:[35.57,-96.93],
    OR:[44.57,-122.07],PA:[40.59,-77.21],RI:[41.68,-71.51],SC:[33.86,-80.95],
    SD:[44.30,-99.44],TN:[35.75,-86.69],TX:[31.05,-97.56],UT:[40.15,-111.86],
    VT:[44.05,-72.71],VA:[37.77,-78.17],WA:[47.40,-121.49],WV:[38.49,-80.95],
    WI:[44.27,-89.62],WY:[42.76,-107.30],DC:[38.90,-77.03]
  };
  const STATE_NAME_TO_ABBREV = {
    alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',
    colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',
    hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',
    kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',
    michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',
    nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ',
    'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',
    ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI',
    'south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',
    utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',
    wisconsin:'WI',wyoming:'WY'
  };
  // City lookup: lowercase "city, st" or "city st" → [lat, lng]
  const CITY_COORDS = {
    'lakewood, co':[39.7047,-105.0814],'lakewood co':[39.7047,-105.0814],
    'denver, co':[39.7392,-104.9903],'denver co':[39.7392,-104.9903],
    'littleton, co':[39.6136,-105.0166],'littleton co':[39.6136,-105.0166],
    'hayden, co':[40.4930,-107.2575],'hayden co':[40.4930,-107.2575],
    'wheat ridge, co':[39.7661,-105.0772],'wheat ridge co':[39.7661,-105.0772],
    'aurora, co':[39.7294,-104.8319],'aurora co':[39.7294,-104.8319],
    'boulder, co':[40.0150,-105.2705],'boulder co':[40.0150,-105.2705],
    'fort collins, co':[40.5853,-105.0844],'fort collins co':[40.5853,-105.0844],
    'colorado springs, co':[38.8339,-104.8214],'colorado springs co':[38.8339,-104.8214],
    'arvada, co':[39.8028,-105.0875],'arvada co':[39.8028,-105.0875],
    'highlands ranch, co':[39.5480,-104.9697],'highlands ranch co':[39.5480,-104.9697],
    'parker, co':[39.5186,-104.7613],'parker co':[39.5186,-104.7613],
    'castle rock, co':[39.3722,-104.8561],'castle rock co':[39.3722,-104.8561],
    'smyrna, ga':[33.8840,-84.5144],'smyrna ga':[33.8840,-84.5144],
    'atlanta, ga':[33.7490,-84.3880],'atlanta ga':[33.7490,-84.3880],
    'chicago, il':[41.8781,-87.6298],'chicago il':[41.8781,-87.6298],
    'detroit, mi':[42.3314,-83.0458],'detroit mi':[42.3314,-83.0458],
    'minneapolis, mn':[44.9778,-93.2650],'minneapolis mn':[44.9778,-93.2650],
    'richmond, va':[37.5407,-77.4360],'richmond va':[37.5407,-77.4360],
  };

  function geocodeLocation(loc) {
    if (!loc) return null;
    const l = loc.replace(/\*/g, '').trim().toLowerCase();
    if (!l || l === '—' || l === '-') return null;
    if (CITY_COORDS[l]) return CITY_COORDS[l];
    // Find state abbreviation (2-letter token matching a state code)
    const tokens = l.split(/[\s,]+/).filter(Boolean);
    let stateAbbrev = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const up = tokens[i].toUpperCase();
      if (STATE_COORDS[up]) { stateAbbrev = up; break; }
    }
    if (stateAbbrev) {
      const stIdx = tokens.lastIndexOf(stateAbbrev.toLowerCase());
      const cityStr = tokens.slice(0, stIdx).join(' ');
      if (cityStr) {
        const key1 = `${cityStr}, ${stateAbbrev.toLowerCase()}`;
        const key2 = `${cityStr} ${stateAbbrev.toLowerCase()}`;
        if (CITY_COORDS[key1]) return CITY_COORDS[key1];
        if (CITY_COORDS[key2]) return CITY_COORDS[key2];
      }
      return STATE_COORDS[stateAbbrev];
    }
    // Try full state name
    for (const [name, abbrev] of Object.entries(STATE_NAME_TO_ABBREV)) {
      if (l.includes(name)) return STATE_COORDS[abbrev];
    }
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

  // ── Module-level state ────────────────────────────────────────────────────
  let mapInitialized       = false;
  let selectedContinent    = null;
  let continentPaths       = null;
  let mapZoom              = null;
  let mapSvg               = null;
  let geoG                 = null;
  let geoProjection        = null;
  let geoPath              = null;
  let statesGroup          = null;
  let usStatesCache        = null;
  let linesOverlay         = null;
  let scrollHandler        = null;
  let allPeople            = [];        // full family list, loaded once
  let continentPeopleMap   = null;      // Map<continent, person[]>
  let activeContPeople     = [];        // people shown for the current continent

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

    allPeople = familyData?.people || [];
    const continentPeople = new Map();
    allPeople.forEach(p => {
      const c = locationToContinent(p.currentLocation);
      if (!c) return;
      if (!continentPeople.has(c)) continentPeople.set(c, []);
      continentPeople.get(c).push(p);
    });
    continentPeopleMap = continentPeople;

    const continentFeatures = Object.keys(CONTINENT_STYLE).map(name => ({
      type: "Feature",
      properties: { name },
      geometry: topojson.merge(
        world,
        world.objects.countries.geometries.filter(g => ISO_CONTINENT[+g.id] === name)
      )
    })).filter(f => f.geometry);

    // Apply mobile layout via JS — more reliable than CSS media queries alone
    const isMobile = window.innerWidth < 900;
    const mapViewEl  = document.getElementById('map-view');
    const container  = document.getElementById('map-canvas');
    const sidebarEl2 = document.getElementById('map-sidebar');
    if (isMobile) {
      mapViewEl.style.flexDirection  = 'row';
      container.style.order          = '';
      container.style.width          = '67%';
      container.style.height         = '100%';
      container.style.flex           = '1';
      sidebarEl2.style.order         = '';
      sidebarEl2.style.width         = '33%';
      sidebarEl2.style.minWidth      = 'unset';
      sidebarEl2.style.height        = '100%';
      sidebarEl2.style.flex          = '0 0 33%';
      sidebarEl2.style.borderRight   = '2px solid #d8c7a5';
      sidebarEl2.style.borderTop     = 'none';
    }

    // Force a layout flush so clientWidth/clientHeight are accurate
    void container.getBoundingClientRect();
    const svgW = container.clientWidth  || (isMobile ? window.innerWidth * 0.67 : window.innerWidth - 280);
    const svgH = container.clientHeight || window.innerHeight;

    mapSvg = d3.select('#mapSvg');
    geoG   = mapSvg.append('g');

    geoProjection = d3.geoNaturalEarth1()
      .scale(svgW / 6.3)
      .translate([svgW / 2, svgH / 2]);
    geoPath = d3.geoPath().projection(geoProjection);

    geoG.append('path').datum(d3.geoGraticule()()).attr('class', 'graticule').attr('d', geoPath);
    geoG.append('path').datum({ type: 'Sphere' }).attr('class', 'map-sphere').attr('d', geoPath);

    mapZoom = d3.zoom()
      .scaleExtent([1, isMobile ? 60 : 12])
      .on('zoom', e => { geoG.attr('transform', e.transform); updateLines(); });
    mapSvg.call(mapZoom).on('dblclick.zoom', null);

    // Lines overlay SVG — sits over the entire #map-view, pointer-events:none
    linesOverlay = d3.select('#map-view').append('svg')
      .attr('id', 'lines-overlay');

    // ── Search ──────────────────────────────────────────────────────────────
    document.getElementById('map-search').addEventListener('input', function () {
      const q = this.value.trim().toLowerCase();
      if (q) {
        const qTokens = q.split(/\s+/).filter(Boolean);
        const results = allPeople
          .filter(p => {
            if (!p.name) return false;
            const nameWords = p.name.toLowerCase().split(/\s+/);
            return qTokens.every(qt => nameWords.some(w => w.startsWith(qt)));
          })
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderPeopleList(results, `"${this.value.trim()}" — ${results.length} found`);
      } else if (selectedContinent && continentPeopleMap) {
        const contPeople = [...(continentPeopleMap.get(selectedContinent) || [])]
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderPeopleList(contPeople, `${selectedContinent} (${contPeople.length})`);
      } else {
        clearSidebar();
      }
    });

    continentPaths = geoG.selectAll('.continent')
      .data(continentFeatures)
      .join('path')
        .attr('class', 'continent')
        .attr('d', geoPath)
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
        .on('click', async function (event, d) {
          event.stopPropagation();
          selectContinent(d, svgW, svgH, continentPeople);
          if (d.properties.name === 'North America') await showUSStates();
        });

    geoG.selectAll('.continent-label')
      .data(continentFeatures)
      .join('text')
        .attr('class', 'continent-label')
        .attr('transform', d => `translate(${geoPath.centroid(d)})`)
        .attr('text-anchor', 'middle').attr('dy', '0.35em')
        .text(d => d.properties.name)
        .style('pointer-events', 'none');

    mapSvg.on('click', () => { if (selectedContinent) resetToWorld(); });
    document.getElementById('map-back-btn').addEventListener('click', resetToWorld);
  }

  // ── US state borders ──────────────────────────────────────────────────────
  async function showUSStates() {
    if (!usStatesCache) {
      usStatesCache = await d3.json(
        "https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json"
      );
    }
    if (statesGroup) statesGroup.remove();
    statesGroup = geoG.append('g').attr('class', 'states-layer');
    statesGroup.selectAll('.us-state-border')
      .data(usStatesCache.features)
      .join('path').attr('class', 'us-state-border').attr('d', geoPath);
  }

  function hideUSStates() {
    if (statesGroup) { statesGroup.remove(); statesGroup = null; }
  }

  // ── Continent selection / reset ───────────────────────────────────────────
  function selectContinent(d, svgW, svgH, continentPeople) {
    selectedContinent = d.properties.name;
    continentPaths.attr('fill', f =>
      f.properties.name === selectedContinent
        ? CONTINENT_STYLE[f.properties.name].hover
        : CONTINENT_STYLE[f.properties.name].fill
    );
    const [[x0, y0], [x1, y1]] = geoPath.bounds(d);
    const scale = Math.min(8, 0.82 / Math.max((x1 - x0) / svgW, (y1 - y0) / svgH));
    const tx = svgW / 2 - scale * (x0 + x1) / 2;
    const ty = svgH / 2 - scale * (y0 + y1) / 2;
    mapSvg.transition().duration(700)
      .call(mapZoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    showPeopleList(d.properties.name, continentPeople);
    document.getElementById('map-back-btn').style.display = 'block';
  }

  function resetToWorld() {
    selectedContinent = null;
    activeContPeople = [];
    hideUSStates();
    clearLines();
    continentPaths.attr('fill', d => CONTINENT_STYLE[d.properties.name].fill);
    mapSvg.transition().duration(650).call(mapZoom.transform, d3.zoomIdentity);
    clearSidebar();
    document.getElementById('map-search').value = '';
    document.getElementById('map-back-btn').style.display = 'none';
  }

  // ── Connection lines ──────────────────────────────────────────────────────
  function updateLines() {
    if (!linesOverlay) return;
    linesOverlay.selectAll('*').remove();

    const mapViewEl  = document.getElementById('map-view');
    const sidebarEl  = document.getElementById('map-sidebar');
    const mapViewRect  = mapViewEl.getBoundingClientRect();
    const sidebarRect  = sidebarEl.getBoundingClientRect();
    const canvasLeft   = sidebarEl.offsetWidth; // offset of map canvas within map-view
    const transform    = d3.zoomTransform(mapSvg.node());

    document.querySelectorAll('.map-person-item[data-location]').forEach(item => {
      const loc = item.dataset.location;
      if (!loc) return;
      const coords = geocodeLocation(loc);
      if (!coords) return;

      const [lat, lng] = coords;
      const projPt = geoProjection([lng, lat]);
      if (!projPt) return;
      const [mapX, mapY] = transform.apply(projPt);

      const itemRect = item.getBoundingClientRect();
      // Skip items scrolled out of the sidebar viewport
      if (itemRect.bottom < sidebarRect.top || itemRect.top > sidebarRect.bottom) return;

      const srcX = sidebarEl.offsetWidth;
      const srcY = itemRect.top + itemRect.height / 2 - mapViewRect.top;
      const tgtX = canvasLeft + mapX;
      const tgtY = mapY;

      // Line
      linesOverlay.append('line')
        .attr('x1', srcX).attr('y1', srcY)
        .attr('x2', tgtX).attr('y2', tgtY)
        .attr('class', 'location-line');

      // Dot at map endpoint
      linesOverlay.append('circle')
        .attr('cx', tgtX).attr('cy', tgtY).attr('r', 4)
        .attr('class', 'location-dot');
    });
  }

  function clearLines() {
    if (linesOverlay) linesOverlay.selectAll('*').remove();
    if (scrollHandler) {
      document.getElementById('map-sidebar').removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
  }

  // ── Sidebar helpers ───────────────────────────────────────────────────────
  function previewSidebar(continentName, continentPeople) {
    const count = (continentPeople.get(continentName) || []).length;
    document.getElementById('map-sidebar-title').textContent =
      `${continentName} — ${count} relative${count !== 1 ? 's' : ''}`;
  }

  function clearSidebar() {
    clearLines();
    document.getElementById('map-sidebar-title').textContent = 'Click a continent';
    document.getElementById('map-people-list').innerHTML = '';
  }

  function showPeopleList(continentName, continentPeople) {
    activeContPeople = [...(continentPeople.get(continentName) || [])]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderPeopleList(activeContPeople, `${continentName} (${activeContPeople.length})`);
  }

  function renderPeopleList(people, title) {
    clearLines();
    document.getElementById('map-sidebar-title').textContent = title;
    const list = document.getElementById('map-people-list');
    list.innerHTML = '';
    if (!people.length) {
      list.innerHTML = '<li class="map-no-people">No relatives found here</li>';
      return;
    }
    people.forEach(p => {
      const li = document.createElement('li');
      li.className = 'map-person-item';
      const loc = (p.currentLocation || '').replace(/\*/g, '').trim();
      li.dataset.location = loc;
      const years = p.birthYear ? p.birthYear + (p.deathYear ? `–${p.deathYear}` : '') : '';
      li.innerHTML = `
        <span class="map-person-name">${p.name || '—'}</span>
        <span class="map-person-loc">${loc}</span>
        ${years ? `<span class="map-person-years">${years}</span>` : ''}
      `;
      list.appendChild(li);
    });

    scrollHandler = () => updateLines();
    document.getElementById('map-sidebar').addEventListener('scroll', scrollHandler);
    setTimeout(updateLines, 750);
  }

})();
