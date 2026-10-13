// Multi year outlook. All projected values come from projections.json.
(function () {
  const LABEL = { GDP_GROWTH:'Real growth', INFLATION:'Inflation', UNEMPLOYMENT:'Unemployment', DEBT_GDP:'Debt to GDP', FISCAL_BAL:'Fiscal balance', CURRENT_ACC:'Current account' };
  const EXPORTERS = new Set(['AUS','BRA','CAN','IDN','RUS','SAU','ZAF']);
  let data, loading, fanChart, outlookChart;
  const esc = value => window.A?.escapeText ? A.escapeText(String(value)) : String(value);
  const countryName = iso => iso === 'G20_MEDIAN' ? 'G20 median' : iso === 'OECD' ? 'OECD aggregate' : G20.find(c => c.iso3 === iso)?.name || iso;
  const projection = (iso, key, year) => data?.projections.find(r => r.iso3 === iso && r.indicator === key && r.year === year);
  const latest = (iso, key) => window.G20Data?.getLatest(iso, key)?.value;

  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) loading = fetch('projections.json', { cache:'no-store' }).then(r => {
      if (!r.ok) throw new Error(`Projection data returned ${r.status}`);
      return r.json();
    }).then(result => (data = result));
    return loading;
  }

  window.renderProjections = () => `<div class="page-body projections-page"><div id="projections-root" class="loading-spinner"><div class="spinner"></div><span>Loading projection results…</span></div></div>`;

  function interval(r) { return `${r.point.toFixed(1)}% <small>${r.p10.toFixed(1)} to ${r.p90.toFixed(1)}</small>`; }
  function movement(iso, key, r) {
    const base = latest(iso, key); if (!Number.isFinite(base)) return '';
    const delta = r.point - base;
    return `<span class="projection-arrow ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}</span>`;
  }
  function callouts() {
    const countries = G20.filter(c => c.iso3 !== 'EUU');
    const growth = countries.map(c => ({ c, r:projection(c.iso3,'GDP_GROWTH',2027) })).filter(x => x.r);
    const inflation = countries.map(c => ({ c, r:projection(c.iso3,'INFLATION',2027) })).filter(x => x.r);
    const debt = countries.map(c => ({ c, r:projection(c.iso3,'DEBT_GDP',2027), actual:latest(c.iso3,'DEBT_GDP') })).filter(x => x.r && Number.isFinite(x.actual));
    const fastest = growth.sort((a,b) => b.r.point - a.r.point)[0];
    const hottest = inflation.sort((a,b) => b.r.p90 - a.r.p90)[0];
    const rising = debt.sort((a,b) => (b.r.point-b.actual)-(a.r.point-a.actual))[0];
    const widest = growth.sort((a,b) => (b.r.p90-b.r.p10)-(a.r.p90-a.r.p10))[0];
    return [
      `<b>${esc(fastest.c.name)}</b> leads 2027 growth at ${fastest.r.point.toFixed(1)}%.`,
      `<b>${esc(hottest.c.name)}</b> has the highest upper inflation risk at ${hottest.r.p90.toFixed(1)}%.`,
      `<b>${esc(rising.c.name)}</b> has the largest projected debt rise at ${(rising.r.point-rising.actual).toFixed(1)} points.`,
      `<b>${esc(widest.c.name)}</b> has the widest 2027 growth range at ${(widest.r.p90-widest.r.p10).toFixed(1)} points.`,
    ];
  }
  function outlookTable() {
    const entities = [...G20.filter(c => c.iso3 !== 'EUU').map(c => c.iso3), 'G20_MEDIAN', 'OECD'];
    return `<div class="table-scroll"><table class="rank-table outlook-table"><thead><tr><th>Economy</th>${data.indicators.map(k => `<th>${LABEL[k]}<small>2026 / 2027 projection</small></th>`).join('')}</tr></thead><tbody>${entities.map(iso => `<tr><td><b>${esc(countryName(iso))}</b></td>${data.indicators.map(key => {
      const a = projection(iso,key,2026), b = projection(iso,key,2027);
      if (!a || !b) return '<td><span class="muted">Not published</span></td>';
      return `<td><span class="projection-cell">${interval(a)} ${iso.length === 3 ? movement(iso,key,a) : ''}</span><span class="projection-cell">${interval(b)} ${iso.length === 3 ? movement(iso,key,b) : ''}</span></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function selectors() {
    return `<div class="projection-controls"><label>Country<select id="projection-country" onchange="refreshProjectionDetail()">${G20.filter(c=>c.iso3!=='EUU').map(c=>`<option value="${c.iso3}" ${c.iso3==='IND'?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Indicator<select id="projection-indicator" onchange="refreshProjectionDetail()">${data.indicators.map(k=>`<option value="${k}">${LABEL[k]}</option>`).join('')}</select></label><label>League year<select id="projection-year" onchange="refreshProjectionDetail()">${data.horizons.map(h=>`<option>${data.projectionOriginYear+h}</option>`).join('')}</select></label></div>`;
  }
  const slider = (id,label,max,step,unit) => `<label class="scenario-slider"><span>${label}<output id="${id}-out">0${unit}</output></span><input id="${id}" type="range" min="0" max="${max}" step="${step}" value="0" oninput="refreshProjectionDetail()"></label>`;

  window.mountProjections = async function () {
    const root = document.getElementById('projections-root'); if (!root) return;
    try {
      await load();
      root.className = '';
      root.innerHTML = `<section class="outlook-hero"><div class="hero__eyebrow"><span class="tag"><span class="dot"></span>Model projection</span><span>Vintage ${data.dataVintage}</span></div><h1>2026 to 2027 Outlook</h1><p>Central projections and empirical 80% ranges for 19 G20 countries. The European Union is a G20 member but is not modelled or included in the median.</p><div class="outlook-callouts">${callouts().map(c=>`<div>${c}</div>`).join('')}</div></section><section class="panel mb-20"><div class="panel__head"><div><span class="panel__title">Two year outlook</span><span class="panel__sub">Central estimate and 80% range</span></div><span class="panel__meta">Projection vintage ${data.dataVintage}</span></div>${outlookTable()}</section><section class="panel mb-20"><div class="panel__head"><div><span class="panel__title">Real growth in 2026 and 2027</span><span class="panel__sub">Central projection by country</span></div></div><div class="projection-chart"><canvas id="outlook-chart"></canvas></div></section><div class="sec-head"><div class="sec-head__title">Five year projection detail <span class="sec-head__sub">fan chart, scenario and backtest</span></div></div>${selectors()}<div class="projection-detail"><section class="panel"><div class="panel__head"><div><span class="panel__title" id="fan-title">Projection fan chart</span><span class="panel__sub">Solid actuals, dashed projection</span></div></div><div class="projection-chart fan"><canvas id="projection-fan"></canvas></div></section><section class="panel"><div class="panel__head"><div><span class="panel__title">How reliable is this?</span><span class="panel__sub">Rolling origin backtest</span></div></div><div class="panel__body" id="projection-reliability"></div></section></div><section class="panel scenario-panel" id="scenario-panel"><div class="panel__head"><div><span class="panel__title">Illustrative scenarios</span><span class="panel__sub">Visible assumptions applied to the baseline</span></div><span class="tag">Not forecasts</span></div><div class="panel__body scenario-grid">${slider('shock-slowdown','Global slowdown',3,.25,' pp')}${slider('shock-commodity','Energy price shock',2,.25,'')}${slider('shock-rates','Rates increase',300,25,' bp')}${slider('shock-ai','AI productivity upside',2,.25,' pp')}</div><div class="projection-note">Every coefficient is an illustrative assumption. Full coefficients and sources are in About.</div></section><section class="panel mb-20"><div class="panel__head"><div><span class="panel__title">G20 league table</span><span class="panel__sub">Scenario result and change from baseline</span></div></div><div id="projection-league"></div></section><div class="methodology">No LLM produces a projected number. <a href="#about">Read the projection methodology</a>.</div>`;
      renderOutlookChart(); refreshDetail();
    } catch (error) { root.className='loading-spinner'; root.innerHTML=`<span>Projection data could not be loaded. ${esc(error.message)}</span>`; }
  };

  function renderOutlookChart() {
    const canvas=document.getElementById('outlook-chart'); if(!canvas||!window.Chart)return;
    const cs=G20.filter(c=>c.iso3!=='EUU');
    outlookChart?.destroy();
    outlookChart=new Chart(canvas,{type:'bar',data:{labels:cs.map(c=>c.name),datasets:[2026,2027].map((year,i)=>({label:`${year} projection`,data:cs.map(c=>projection(c.iso3,'GDP_GROWTH',year)?.point),backgroundColor:i?'rgba(185,28,28,.78)':'rgba(15,23,42,.78)',borderRadius:2}))},options:{responsive:true,maintainAspectRatio:false,plugins:{datalabels:{display:false}},scales:{x:{ticks:{maxRotation:70,minRotation:45}},y:{title:{display:true,text:'%'}}}}});
  }
  function shocks() {
    return { slowdown:+document.getElementById('shock-slowdown')?.value||0, commodity:+document.getElementById('shock-commodity')?.value||0, rates:+document.getElementById('shock-rates')?.value||0, ai:+document.getElementById('shock-ai')?.value||0 };
  }
  function scenario(base,iso) {
    const s=shocks(), trade=latest(iso,'TRADE_GDP'), openness=Number.isFinite(trade)?Math.max(.5,Math.min(1.5,trade/60)):1, exporter=EXPORTERS.has(iso), ready=.5;
    return {...base,GDP_GROWTH:base.GDP_GROWTH-s.slowdown*openness+s.commodity*(exporter?.15:-.15)+s.ai*ready,INFLATION:base.INFLATION+s.commodity*(exporter?.15:.6),UNEMPLOYMENT:base.UNEMPLOYMENT+s.slowdown*.35-s.ai*ready*.15,DEBT_GDP:base.DEBT_GDP+s.rates/100*base.DEBT_GDP/100,FISCAL_BAL:base.FISCAL_BAL-s.rates/100*base.DEBT_GDP/100,CURRENT_ACC:base.CURRENT_ACC+s.commodity*(exporter?.25:-.25)};
  }
  function refreshDetail() {
    const iso=document.getElementById('projection-country')?.value||'IND', key=document.getElementById('projection-indicator')?.value||'GDP_GROWTH', year=+(document.getElementById('projection-year')?.value||2026);
    [['shock-slowdown',' pp'],['shock-commodity',''],['shock-rates',' bp'],['shock-ai',' pp']].forEach(([id,unit])=>{const el=document.getElementById(id),out=document.getElementById(`${id}-out`);if(el&&out)out.textContent=`${el.value}${unit}`;});
    renderFan(iso,key); renderReliability(key,year-data.projectionOriginYear); renderLeague(key,year);
  }
  window.refreshProjectionDetail=()=>data&&refreshDetail();
  function renderFan(iso,key) {
    const canvas=document.getElementById('projection-fan');if(!canvas||!window.Chart)return;
    const history=window.G20Data.getSeries(iso,key,2015),future=data.projections.filter(r=>r.iso3===iso&&r.indicator===key).sort((a,b)=>a.year-b.year),join=history.at(-1)?.value,blank=Array(Math.max(0,history.length-1)).fill(null),series=values=>[...blank,join,...values];
    fanChart?.destroy();
    fanChart=new Chart(canvas,{type:'line',data:{labels:[...history.map(x=>x.year),...future.map(x=>x.year)],datasets:[{label:'Actual',data:[...history.map(x=>x.value),...Array(future.length).fill(null)],borderColor:'#0f172a',borderWidth:2,pointRadius:1},{label:'80% lower',data:series(future.map(r=>r.p10)),borderColor:'transparent',pointRadius:0},{label:'80% range',data:series(future.map(r=>r.p90)),borderColor:'transparent',backgroundColor:'rgba(185,28,28,.10)',fill:'-1',pointRadius:0},{label:'50% lower',data:series(future.map(r=>r.p25)),borderColor:'transparent',pointRadius:0},{label:'50% range',data:series(future.map(r=>r.p75)),borderColor:'transparent',backgroundColor:'rgba(185,28,28,.20)',fill:'-1',pointRadius:0},{label:'Projection',data:series(future.map(r=>r.point)),borderColor:'#b91c1c',borderDash:[6,4],borderWidth:2,pointRadius:2}]},options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{datalabels:{display:false},title:{display:true,text:`Forecast starts ${data.projectionOriginYear+1}`}}}});
    document.getElementById('fan-title').textContent=`${countryName(iso)} ${LABEL[key]}`;
  }
  function renderReliability(key,horizon) {
    const b=data.backtest.find(x=>x.indicator===key&&x.horizon===horizon)||data.backtest.find(x=>x.indicator===key&&x.horizon===1), copy=b.noSkill?'The statistical alternatives did not beat carrying the last value forward. This page therefore shows the baseline.':`The selected method reduced mean absolute error by ${b.skillPct.toFixed(1)}% against carrying the last value forward.`;
    document.getElementById('projection-reliability').innerHTML=`<div class="reliability-score ${b.noSkill?'baseline':'skill'}">${b.noSkill?'Baseline only':'Measured skill'}</div><p>${copy}</p><dl><div><dt>Typical error</dt><dd>${b.mae.toFixed(2)} points</dd></div><div><dt>Naive error</dt><dd>${b.naiveMae.toFixed(2)} points</dd></div><div><dt>80% coverage</dt><dd>${b.coverage80.toFixed(1)}%</dd></div><div><dt>Method</dt><dd>${esc(b.shippedMethod)}</dd></div></dl><p class="muted">Includes the 2020 and 2022 shocks. Results without them are in About.</p>`;
  }
  function renderLeague(key,year) {
    const rows=G20.filter(c=>c.iso3!=='EUU').map(c=>{const r=projection(c.iso3,key,year);if(!r)return null;const base=Object.fromEntries(data.indicators.map(k=>[k,projection(c.iso3,k,year)?.point]));const value=scenario(base,c.iso3)[key];return{c,r,value,delta:value-r.point};}).filter(Boolean).sort((a,b)=>b.value-a.value);
    document.getElementById('projection-league').innerHTML=`<div class="table-scroll"><table class="rank-table"><thead><tr><th>Rank</th><th>Economy</th><th>${year} projection</th><th>80% range</th><th>Scenario change</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.c.name)}</td><td><b>${x.value.toFixed(1)}%</b></td><td>${x.r.p10.toFixed(1)} to ${x.r.p90.toFixed(1)}%</td><td>${x.delta>=0?'+':''}${x.delta.toFixed(1)} points</td></tr>`).join('')}</tbody></table></div>`;
  }

  window.loadProjectionData=load;
  window.projectionContext=function(question) {
    if(!data)return '';
    const q=String(question||'').toLowerCase(),country=G20.find(c=>q.includes(c.name.toLowerCase())||q.includes(c.iso3.toLowerCase())),iso=country?.iso3||'G20_MEDIAN';
    const years=[...String(question).matchAll(/20(?:2[6-9]|3[0-5])/g)].map(m=>+m[0]);
    const selectedYears=years.length?years:data.horizons.map(h=>data.projectionOriginYear+h).slice(0,2);
    const lines=[`Statistical projections for ${countryName(iso)}, vintage ${data.dataVintage}:`];
    for(const key of data.indicators)for(const year of selectedYears){const r=projection(iso,key,year);if(!r)continue;const b=data.backtest.find(x=>x.indicator===key&&x.horizon===r.horizon);lines.push(`${LABEL[key]} ${year}: ${r.point.toFixed(2)}%, 80% range ${r.p10.toFixed(2)}% to ${r.p90.toFixed(2)}%, method ${r.method}, backtest MAE ${b.mae.toFixed(2)} points, ${b.status}.`);}
    return lines.join('\n');
  };
  window.generateProjectionInsight=function(question){
    if(!data)return null;const q=String(question||'').toLowerCase();if(!/project|forecast|outlook|uncertain|range/.test(q))return null;
    const country=G20.find(c=>q.includes(c.name.toLowerCase())||q.includes(c.iso3.toLowerCase()));if(!country)return null;
    const year=+(q.match(/20(?:2[6-9]|3[0-5])/)?.[0]||2027),keys=Object.keys(LABEL),key=keys.find(k=>q.includes(LABEL[k].toLowerCase().split(' ')[0]))||'GDP_GROWTH',r=projection(country.iso3,key,year);if(!r)return null;
    const b=data.backtest.find(x=>x.indicator===key&&x.horizon===r.horizon);
    return `<b>${esc(country.name)} ${esc(LABEL[key])} in ${year}</b><p>The central projection is ${r.point.toFixed(1)}%, with an 80% range from ${r.p10.toFixed(1)}% to ${r.p90.toFixed(1)}%. The projection vintage is ${data.dataVintage}.</p><p>${b.noSkill?'The model showed no out of sample skill, so the displayed value uses the naive last value baseline.':`The selected method improved mean absolute error by ${b.skillPct.toFixed(1)}% against the naive baseline.`} Typical backtest error was ${b.mae.toFixed(2)} percentage points.</p>`;
  };
  window.mountProjectionMethodology=async function(){
    const target=document.getElementById('projection-methodology');if(!target)return;
    try{await load();const avgCoverage=key=>data.backtest.filter(r=>r.indicator===key).reduce((s,r)=>s+r.coverage80,0)/5;
      target.innerHTML=`<div class="sec-head"><div class="sec-head__title">Projection methodology <span class="sec-head__sub">plain English first, technical detail second</span></div></div><div class="panel mb-20"><div class="panel__body" style="padding:20px"><p style="line-height:1.7">Six indicators are projected directly from the historical panel. Each candidate is tested against carrying the latest value forward. When no candidate wins out of sample, the dashboard says so and shows that baseline. Debt then follows an accounting identity using growth, fiscal balance and an assumed 3% interest rate. No LLM creates any projected number.</p><details style="margin-top:16px"><summary><b>Technical detail</b></summary><div style="padding-top:14px;line-height:1.65"><p>Training window: ${esc(data.trainingWindow)}. Inputs: ${esc(data.features.join(', '))}. ${esc(data.missingData)}</p><p>${esc(data.uncertainty)}</p><div class="table-scroll"><table class="rank-table"><thead><tr><th>Indicator</th><th>Horizon</th><th>Shipped method</th><th>MAE</th><th>Naive MAE</th><th>Skill</th><th>80% coverage</th><th>Without 2020 and 2022</th></tr></thead><tbody>${data.backtest.map(r=>`<tr><td>${LABEL[r.indicator]}</td><td>${r.horizon} year</td><td>${esc(r.indicator==='DEBT_GDP'?'debt dynamics identity':r.shippedMethod)}${r.noSkill?' · no skill':''}</td><td>${r.mae.toFixed(2)}</td><td>${r.naiveMae.toFixed(2)}</td><td>${r.skillPct.toFixed(1)}%</td><td>${r.coverage80.toFixed(1)}%</td><td>${r.excludingShocks.skillPct.toFixed(1)}% skill</td></tr>`).join('')}</tbody></table></div><p>Scenario assumptions: slowdown changes growth by the shock scaled to trade openness and raises unemployment by 0.35 times the shock. An energy shock changes importer inflation by 0.60 points, growth by 0.15 points and the current account by 0.25 points, with the growth and current account signs reversed for exporters. A rates increase applies the rate change to the debt ratio. AI upside scales to AI readiness. These are assumptions, not estimates.</p><p>OECD growth uses the OECD Economic Outlook where published, vintage ${data.dataVintage}. An IMF comparison was not added because DataMapper blocks reliable automated access.</p><p>Limits: ${esc(data.limits.join('; '))}.</p><p>Reproduce with <code>node sync/train-projections.js</code>. The monthly refresh reruns the trainer and archives a dated vintage.</p></div></details></div></div><div class="methodology">Across horizons, measured 80% coverage averages ${data.indicators.map(k=>`${LABEL[k]} ${avgCoverage(k).toFixed(1)}%`).join(', ')}.</div>`;
    }catch(error){target.innerHTML=`<div class="panel"><div class="panel__body">Projection methodology could not be loaded: ${esc(error.message)}</div></div>`;}
  };
  window.mountProjectionSummary=async function(iso) {
    const target=document.getElementById(iso?'country-projection-outlook':'overview-projection-outlook');if(!target)return;
    try{await load();const entity=iso||'G20_MEDIAN',rows=[2026,2027,2028].map(y=>projection(entity,'GDP_GROWTH',y)).filter(Boolean),vals=rows.map(r=>r.point),lo=Math.min(...vals),hi=Math.max(...vals);target.innerHTML=`<a href="#projections" class="projection-mini-link"><span><b>${iso?'2026 to 2028 outlook':'G20 median growth 2026 / 2027 (projected)'}</b><small>Projection vintage ${data.dataVintage}</small></span><span>${rows.map(r=>`${r.year} ${r.point.toFixed(1)}%`).join(' · ')}</span><svg viewBox="0 0 120 34" aria-hidden="true"><polyline points="${rows.map((r,i)=>`${i*55+5},${29-(r.point-lo)/(hi-lo||1)*23}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/></svg></a>`;}catch(_){target.remove();}
  };
})();
