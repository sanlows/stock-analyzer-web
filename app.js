'use strict';
let stocks = [];
let periods = {};
let months = {};
const feeds = {market:null,catalog:null,status:null};
const details = new Map();
const reports = new Map();
const publicSources = '<div class="caption sources">資料提供機關：金融監督管理委員會證券期貨局 · <a href="https://www.twse.com.tw/" target="_blank" rel="noopener">臺灣證券交易所</a> · <a href="https://www.tpex.org.tw/" target="_blank" rel="noopener">證券櫃檯買賣中心</a> · <a href="https://mops.twse.com.tw/" target="_blank" rel="noopener">公開資訊觀測站</a> · <a href="open-data.html">資料集與授權</a></div>';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const dateLabel = date => date ? date.replaceAll('-','/') : '資料未齊';
const stockDetail = s => details.get(s.id);
async function readFeed(path) {
  const response = await fetch('data/'+path+'.json', {cache:'no-cache'});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('資料讀取失敗');
  return response.json();
}
function loadStockResource(id,type) {
  const data = type === 'report' ? reports : details;
  if (data.has(id)) return;
  data.set(id, {loading:true});
  const path = (type === 'report' ? 'reports/' : 'stock/')+id;
  readFeed(path).then(value=>data.set(id, value || {missing:true})).catch(()=>data.set(id,{error:true})).finally(()=>{
    if ((state.stock===id && state.page===(type==='report'?'report':'stock')) || (type==='stock' && state.page==='compare' && state.selected.has(id))) render();
  });
}
async function boot() {
  render();
  const names = ['market','catalog','status'];
  const results = await Promise.allSettled(names.map(readFeed));
  names.forEach((key,i)=>{feeds[key]=results[i].status==='fulfilled' ? results[i].value : null;});
  const catalog = feeds.catalog;
  if (catalog) {
    stocks = catalog.stocks.map(stock=>({...stock,name:esc(stock.name),market:esc(stock.market),industry:esc(stock.industry)}));
    periods = Object.fromEntries(Object.keys(catalog.quarters).map(key=>[key,key.replace('Q',' Q')]));
    months = Object.fromEntries(Object.keys(catalog.months).map(key=>{
      const [year,month]=key.split('-');
      return [key,year+' 年 '+Number(month)+' 月'];
    }));
    for(const key of ['draft','applied']){
      state[key].quarter=Object.keys(periods)[0] || '';
      state[key].month=Object.keys(months)[0] || '';
    }
    state.stock=get(state.stock)?.id || stocks[0]?.id || '';
  }
  const pending = feeds.status?.pending || [];
  const status = document.getElementById('status');
  status.textContent=feeds.market?(pending.length?'部分資料待更新':'官方盤後資料'):'資料未載入';
  if(feeds.status?.checkedAt) status.title='最近檢查：'+feeds.status.checkedAt;
  render();
}

const config = [
  ['market','⌁','台股大盤'],['screen','▤','條件選股'],['stock','◫','個股研究'],['compare','◧','同業比較'],['report','▧','研究報告']
];

const defaults = {quarter:'',month:'',market:'',industry:'',yoy:'',ytd:'',pe:'',eps:'',margin:''};
const presets = {growth:{yoy:'10',ytd:'10'},value:{pe:'20'},all:{}};
const state = {
  page:'market',stock:'2330',tab:'overview',period:12,compareMode:'metrics',
  recent:[],selected:new Set(),
  draft:{...defaults,...presets.growth},applied:{...defaults,...presets.growth},
  preset:'growth',sort:'yoy',desc:true,advanced:false,resultPage:0,
  assumptions:{}
};
const main = document.getElementById('main');
const search = document.getElementById('search');
const suggest = document.getElementById('suggest');
const get = id => stocks.find(stock => stock.id === id);
const fmt = (value,digits=2) => value == null ? '—' : value.toLocaleString('zh-TW',{maximumFractionDigits:digits});
const signed = (value,digits=1) => value == null ? '—' : (value > 0 ? '+' : '') + value.toFixed(digits) + '%';
const cls = value => value > 0 ? 'positive' : value < 0 ? 'negative' : '';
const button = (label,action,extra='',value='') => '<button type="button" class="btn '+extra+'" data-act="'+action+'" data-value="'+value+'">'+label+'</button>';
const notice = (title,body,action='') => '<div class="empty"><strong>'+title+'</strong>'+body+(action ? '<div style="margin-top:12px">'+action+'</div>' : '')+'</div>';
const title = (name,description,aside='') => '<div class="header"><div><h1>'+name+'</h1><p>'+description+'</p></div>'+aside+'</div>';
const chartColors = ['#08795a','#a4592f','#5067a2','#815092','#727035'];
const stockLabel = s => s.name+' '+s.id;
function applyPeriod(s, f) {
  const [eps,margin,net,ttm,pe] = s.periods[f.quarter] || [];
  const [yoy,ytd] = s.growth[f.month] || [];
  return {...s,eps,margin,net,ttm,pe,yoy,ytd};
}

function field(label,key,choices,placeholder='') {
  const value = state.draft[key];
  const control = choices ? '<select name="'+key+'">'+Object.entries(choices).map(([k,v]) => '<option value="'+k+'" '+(k===value?'selected':'')+'>'+v+'</option>').join('')+'</select>' :
    '<input name="'+key+'" type="number" step="any"'+(key==='pe'?' min="0"':'')+' value="'+value+'" placeholder="'+placeholder+'">';
  return '<label class="field">'+label+control+'</label>';
}
function screenRows() {
  const f = state.applied;
  const bounds = [['yoy','yoy',false],['ytd','ytd',false],['eps','eps',false],['margin','margin',false],['pe','pe',true]];
  return stocks.map(s => applyPeriod(s,f)).filter(s =>
    (!f.market || s.market===f.market) && (!f.industry || s.industry===f.industry) &&
    bounds.every(([key,filter,max]) => f[filter]==='' || (s[key]!=null && (max ? s[key] <= Number(f[filter]) :
      state.preset==='growth' && ['yoy','ytd'].includes(key) && f[filter]==='10' ? s[key] > 10 : s[key] >= Number(f[filter]))))
  ).sort((a,b) => {
    const x=a[state.sort], y=b[state.sort];
    if (x==null || y==null) return x==null ? (y==null ? 0 : 1) : -1;
    return (typeof x==='string' ? x.localeCompare(y,'zh-Hant') : x-y)*(state.desc?-1:1);
  });
}
function sortHead(label,key,num=true) {
  const current = key===state.sort;
  return '<th scope="col" class="'+(num?'num':'')+'"'+(current?' aria-sort="'+(state.desc?'descending':'ascending')+'"':'')+'><button type="button" data-act="sort" data-value="'+key+'">'+label+(current?(state.desc?' ↓':' ↑'):'')+'</button></th>';
}
function picker() {
  return '<label class="field picker">加入比較<select id="addStock"><option value="">選擇股票</option>'+stocks.filter(s=>!state.selected.has(s.id)).map(s=>'<option value="'+s.id+'">'+stockLabel(s)+'</option>').join('')+'</select></label>';
}
function chosen() {
  if (!state.selected.size) return '<span class="muted small">勾選 2–5 檔股票進行比較</span>';
  return [...state.selected].map(id => '<span class="chip">'+stockLabel(get(id))+' <button type="button" aria-label="移除 '+get(id).name+'" data-act="toggle" data-value="'+id+'">×</button></span>').join('');
}
function screen() {
  if (!feeds.catalog) return title('條件選股','依同一財報期別與營收月份篩選台股。')+'<div class="card">'+notice('選股資料尚未就緒','待市場與財報更新。')+'</div>';
  const rows = screenRows();
  const pageSize = 30;
  const lastPage = Math.max(0,Math.ceil(rows.length/pageSize)-1);
  const start = state.resultPage*pageSize;
  const visible = rows.slice(start,start+pageSize);
  const f = state.applied;
  const industries = Object.fromEntries([...new Set(stocks.map(s=>s.industry))].map(item=>[item,item]));
  const conditionLabels = {yoy:'月營收 YoY',ytd:'累計 YoY',pe:'TTM PE',eps:'單季 EPS',margin:'營益率'};
  const applied = Object.keys(conditionLabels).filter(k=>f[k]!=='').map(k=>{
    const op=k==='pe'?'≤':state.preset==='growth'&&['yoy','ytd'].includes(k)&&f[k]==='10'?'>':'≥';
    return conditionLabels[k]+' '+op+' '+f[k]+(['yoy','ytd','margin'].includes(k)?'%':'');
  });
  if(f.market) applied.unshift(f.market);
  if(f.industry) applied.unshift(f.industry);
  return title('條件選股','設定同一財報期別與營收月份，找出符合條件的台股。','<div class="date">行情基準日 <strong>'+dateLabel(feeds.catalog.asOf)+'</strong><br>股票池 '+stocks.length+' 檔</div>')+
  '<div class="stack"><form id="filterForm" class="card pad"><div class="bar preset-row"><h2>篩選條件</h2><div class="row" aria-label="篩選預設">'+
  [['growth','雙營收成長'],['value','本益比 20 倍以下'],['all','全部股票']].map(([id,label])=>button(label,'preset','preset '+(state.preset===id?'active':''),id)).join('')+
  '</div></div><div class="filters">'+field('財報季度','quarter',periods)+field('營收月份','month',months)+field('市場','market',{'':'全部市場','上市':'上市','上櫃':'上櫃'})+field('產業','industry',{'':'全部產業',...industries})+field('月營收 YoY 下限（%）','yoy',null,'不限')+
  '</div><details id="advanced" class="advanced" '+(state.advanced?'open':'')+'><summary>進階條件</summary><div class="filters">'+
  field('累計 YoY 下限（%）','ytd',null,'不限')+field('TTM PE 上限（倍）','pe',null,'不限')+field('單季 EPS 下限（元）','eps',null,'不限')+field('營益率下限（%）','margin',null,'不限')+
  '</div></details><div class="bar actions"><span id="filterHint" class="muted small">調整欄位後按「套用篩選」</span><div class="row">'+button('清除條件','reset','ghost')+'<button type="submit" class="btn primary">套用篩選 <span aria-hidden="true">→</span></button></div></div></form>'+
  '<section class="card results" aria-label="篩選結果"><div class="bar"><div><h2>篩選結果 <span class="chip">'+rows.length+' 檔</span></h2><p class="caption">'+(periods[f.quarter] || '季報未齊')+' · '+(months[f.month] || '營收未齊')+' · 季報／營收覆蓋 '+(feeds.catalog.quarters[f.quarter] || 0)+'／'+(feeds.catalog.months[f.month] || 0)+' 檔'+(applied.length?' · '+applied.join('、'):'')+'</p></div>'+button('↓ 匯出 CSV','csv','small')+'</div>'+
  (state.selected.size?'<div class="foot bar"><div class="row">'+chosen()+'</div><button type="button" class="btn '+(state.selected.size>=2?'primary':'')+'" data-act="page" data-value="compare" '+(state.selected.size<2?'disabled':'')+'>'+ (state.selected.size<2?'再選 1 檔即可比較':'前往比較（'+state.selected.size+'）')+'</button></div>':'')+
  (rows.length ? '<div class="tablewrap"><table><thead><tr><th class="check" scope="col"><span aria-label="加入比較">比較</span></th>'+sortHead('股票','id',false)+'<th scope="col">市場</th>'+sortHead('收盤價','price')+sortHead('漲跌幅','change')+sortHead('月營收 YoY','yoy')+sortHead('累計 YoY','ytd')+sortHead('單季 EPS','eps')+sortHead('TTM PE','pe')+'</tr></thead><tbody>'+
  visible.map(s=>'<tr class="'+(state.selected.has(s.id)?'picked':'')+'"><td class="check"><input type="checkbox" data-pick="'+s.id+'" aria-label="加入比較 '+s.name+'" '+(state.selected.has(s.id)?'checked':'')+'></td><td><div class="stockcell"><span class="initial" aria-hidden="true">'+s.name[0]+'</span><button type="button" class="ticker" data-act="stock" data-value="'+s.id+'">'+s.name+' <span class="code">'+s.id+'</span></button></div></td><td class="muted">'+s.market+'</td><td class="num">'+fmt(s.price)+'</td><td class="num '+cls(s.change)+'">'+signed(s.change,2)+'</td><td class="num '+cls(s.yoy)+'">'+signed(s.yoy)+'</td><td class="num '+cls(s.ytd)+'">'+signed(s.ytd)+'</td><td class="num">'+fmt(s.eps)+'</td><td class="num">'+fmt(s.pe)+(s.pe==null?'':'×')+'</td></tr>').join('')+'</tbody></table></div>' :
  notice('沒有符合條件的股票','試著降低成長門檻，或清除條件查看全部股票。',button('清除條件','reset')))+
  (lastPage?'<div class="foot bar"><span class="muted small">第 '+(start+1)+'–'+Math.min(start+pageSize,rows.length)+' 檔，共 '+rows.length+' 檔</span><div class="row">'+
  (state.resultPage?button('← 上一頁','results-page','small',state.resultPage-1):'')+
  (state.resultPage<lastPage?button('下一頁 →','results-page','small',state.resultPage+1):'')+'</div></div>':'')+'</section></div>'+publicSources;
}
function metric(label,value,source) {
  return '<div class="card metric"><span class="muted small">'+label+'</span><strong>'+value+'</strong><small>'+source+'</small></div>';
}
function trendValues(s,count) {
  return (stockDetail(s)?.months || []).slice(-count);
}
function chartBox(s) {
  const rows = trendValues(s,state.period);
  return '<div class="card pad"><div class="bar"><div><h2>月營收走勢</h2><p class="caption">億元 · 公開資訊觀測站</p></div><div class="seg">'+[12,36].map(n=>button(n+' 個月','period',n===state.period?'active':'',n)).join('')+'</div></div>'+
    (rows.length<2 ? notice('營收資料不足','目前找不到足夠的月營收。') :
    '<canvas id="trend" class="chart" role="img" aria-label="'+s.name+'月營收圖"></canvas><div id="chartNote" class="chart-note caption">移到圖上查看單月數值</div>')+'</div>';
}
function financial(s) {
  const detail = stockDetail(s);
  const rows = detail.quarters.slice().reverse();
  const monthly = detail.months.slice(-state.period).reverse();
  const structure = (label,caption,columns,items) => '<section class="card results"><div class="bar"><div><h2>'+label+'</h2><p class="caption">'+caption+'</p></div></div>'+
    (items.length ? '<div class="tablewrap"><table><thead><tr>'+columns.map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead><tbody>'+items.join('')+'</tbody></table></div>' :
    notice('目前沒有可用資料','待官方資料更新後提供。'))+'</section>';
  return '<div class="stack">'+chartBox(s)+structure('近八季財報','MOPS · 單季營收為億元，EPS 為元',['季度','營收','毛利率','營業利益率','淨利率','EPS'],
    rows.map(q=>'<tr><th scope="row">'+esc(q.quarter)+'</th><td>'+fmt(q.revenue)+'</td><td>'+signed(q.gross_margin).replace(/^\+/,'')+'</td><td>'+signed(q.operating_margin).replace(/^\+/,'')+'</td><td>'+signed(q.net_margin).replace(/^\+/,'')+'</td><td>'+fmt(q.eps)+'</td></tr>'))+
    structure('月營收','MOPS · 營收為億元',['月份','營收','月增率','年增率','累計年增率'],
    monthly.map(m=>'<tr><th scope="row">'+esc(m.month)+'</th><td>'+fmt(m.revenue)+'</td><td>'+signed(m.mom)+'</td><td>'+signed(m.yoy)+'</td><td>'+signed(m.cumulative_yoy)+'</td></tr>'))+'</div>';
}

function valuation(s) {
  const byMonth = new Map(trendValues(s,36).map(row=>[row.month,row.revenue]));
  const recent = Object.keys(months).slice(0,12).map(month=>byMonth.get(month));
  const assumptions=state.assumptions[s.id] || {revenue:recent.length===12 && recent.every(Number.isFinite) ? +recent.reduce((sum,value)=>sum+value,0).toFixed(2) : '',
    growth:'',net:'',shares:'',pe:''};
  const inputs=[['revenue','基期年營收（億元）'],['growth','營收成長率（%）'],['net','歸母淨利率（%）'],['shares','流通股數（億股）'],['pe','本益比（倍）']];
  return '<div class="stack"><div class="card pad"><div class="bar"><h2>自訂估值</h2><span class="chip">使用者假設</span></div><p class="caption">若有連續 12 個月營收，先帶入基期年營收。歸母淨利率、股數、成長率和本益比由你輸入。</p><div class="filters actions">'+
  inputs.map(([key,label])=>'<label class="field">'+label+'<input type="number" step="any" data-valuation="'+key+'" value="'+assumptions[key]+'"></label>').join('')+
  '</div></div><div class="metrics"><div class="card metric"><span class="muted small">推估 EPS</span><strong id="valEps">—</strong><small>元／股</small></div><div class="card metric"><span class="muted small">試算目標價</span><strong id="valPrice">—</strong><small>元／股</small></div><div class="card metric"><span class="muted small">相對收盤價</span><strong id="valDelta">—</strong><small>比較基準 '+fmt(s.price)+' 元</small></div></div><div class="callout">推估 EPS＝年營收 ×（1＋成長率）× 歸母淨利率 ÷ 股數。目標價＝推估 EPS × 本益比。</div></div>';
}
function updateVal(persist=false) {
  const params = [...main.querySelectorAll('[data-valuation]')];
  if (!params.length) return;
  const values = Object.fromEntries(params.map(input=>[input.dataset.valuation,input.value]));
  if (persist) state.assumptions[state.stock] = values;
  const {revenue,growth,net,shares,pe} = Object.fromEntries(Object.entries(values).map(([k,v])=>[k,Number(v)]));
  const valid = Object.values(values).every(v=>v!=='') && revenue>0 && growth>=-100 && Math.abs(net)<=100 && shares>0 && pe>0;
  const eps = valid ? revenue*(1+growth/100)*(net/100)/shares : null;
  const price = eps!=null && eps>0 ? eps*pe : null;
  document.getElementById('valEps').textContent=fmt(eps);
  document.getElementById('valPrice').textContent=fmt(price);
  document.getElementById('valDelta').textContent=signed(price==null||!get(state.stock).price?null:(price/get(state.stock).price-1)*100);
}
function stockPage() {
  const s=get(state.stock);
  if(!s) return title('個股研究','輸入股票代號或公司名稱')+'<div class="card">'+notice('尚未載入股票資料','請稍後再查。')+'</div>';
  const d=stockDetail(s);
  const latest=applyPeriod(s,{quarter:Object.keys(periods)[0],month:Object.keys(months)[0]});
  const tabs=[['overview','摘要'],['financial','財務與圖表'],['valuation','估值試算']];
  const panel = state.tab==='valuation' ? valuation(s) : !d || d.loading ? '<div class="card">'+notice('正在載入個股資料','')+'</div>' :
    d.error || d.missing ? '<div class="card">'+notice('暫無個股資料','請稍後再查。')+'</div>' :
    state.tab==='financial' ? financial(s) :
    '<div class="stack"><div class="metrics">'+metric('收盤價',fmt(s.price),dateLabel(feeds.catalog.asOf)+' · '+signed(s.change,2))+
    metric('月營收 YoY',signed(latest.yoy),Object.values(months)[0] || '資料未齊')+
    metric('單季 EPS',fmt(latest.eps),Object.values(periods)[0] || '資料未齊')+
    metric('TTM 本益比',fmt(latest.pe),'連續四季 EPS')+
    '</div>'+chartBox(s)+'</div>';
  return '<div class="row" style="margin-bottom:8px">'+button('← 返回條件選股','page','ghost small','screen')+'</div>'+
    title(s.name+' '+s.id,s.market+' · '+s.industry,'<div class="row">'+
      button(state.selected.has(s.id)?'✓ 已加入比較':'＋ 加入比較','toggle','',s.id)+button('閱讀已發佈報告','page','primary','report')+'</div>')+
    '<div class="tabs" aria-label="個股研究分頁">'+tabs.map(([id,label])=>'<button type="button" data-act="tab" data-value="'+id+'" aria-pressed="'+(state.tab===id)+'" class="'+(state.tab===id?'active':'')+'">'+label+'</button>').join('')+'</div>'+panel+publicSources;
}
function comparisonSeries(){
  const chosen = [...state.selected].map(get);
  const series = chosen.map((s,i)=>({color:chartColors[i], stock:s, points:new Map(trendValues(s,12).filter(v=>v.revenue>0).map(v=>[v.month,v.revenue]))}))
    .filter(s=>s.points.size>=2);
  const keys = [...(series[0]?.points.keys() || [])].filter(k=>series.every(s=>s.points.has(k))).sort();
  return {keys,series:series.map(s=>({...s,values:keys.map(k=>s.points.get(k)/s.points.get(keys[0])*100)}))};
}

function compare() {
  const selected = [...state.selected].map(get);
  const {keys,series}=comparisonSeries();
  const f=state.applied;
  const rows=[['市場','market'],['產業','industry'],['收盤價（元）','price'],['月營收 YoY','yoy','pct'],['累計營收 YoY','ytd','pct'],['單季 EPS（元）','eps'],['營益率','margin','pct'],['TTM PE（倍）','pe']];
  const table= '<div class="card results"><div class="bar"><div><h2>財務指標</h2><p class="caption">'+(periods[f.quarter]||'季報未齊')+' · '+(months[f.month]||'營收未齊')+' · 收盤 '+dateLabel(feeds.catalog?.asOf)+'</p></div></div><div class="tablewrap"><table><thead><tr><th>比較指標</th>'+
    selected.map(s=>'<th scope="col" class="num"><button data-act="stock" data-value="'+s.id+'">'+stockLabel(s)+' ↗</button></th>').join('')+'</tr></thead><tbody>'+
    rows.map(([label,key,style])=>'<tr><th scope="row">'+label+'</th>'+selected.map(s=>{
      const value=applyPeriod(s,f)[key];
      return '<td class="num">'+(typeof value==='string'?value:style==='pct'?signed(value):fmt(value))+'</td>';
    }).join('')+'</tr>').join('')+'</tbody></table></div></div>';
  const chart='<div class="card pad"><div class="bar"><div><h2>月營收相對走勢</h2><p class="caption">最近 12 個月 · 共同首月＝100</p></div></div>'+
    (series.length>=2 && keys.length>=2?'<canvas id="comparisonTrend" class="chart" role="img" aria-label="多家公司月營收相對走勢圖"></canvas><div class="legend">'+series.map(s=>'<span style="--swatch:'+s.color+'">'+s.stock.name+'</span>').join('')+'</div>':notice('比較資料不足','請選擇至少兩檔有共同月份營收資料的股票。'))+
    (series.length<selected.length?'<p class="caption">部分股票缺少足夠的共同月份資料。</p>':'')+'</div>';
  return title('同業比較','將 2–5 檔股票放在同一期別，並排檢查差異。')+'<div class="stack"><section class="card pad"><div class="bar"><div><h2>比較清單</h2><div class="row actions">'+chosen()+'</div></div>'+picker()+'</div></section>'+
    (selected.length<2?'<div class="card">'+notice('請選擇至少兩檔股票','從上方加入，或回選股結果勾選股票。',button('前往條件選股','page','primary','screen'))+'</div>':
      '<div class="row">'+button('財務指標','compare-mode','preset '+(state.compareMode==='metrics'?'active':''),'metrics')+button('營收走勢','compare-mode','preset '+(state.compareMode==='trend'?'active':''),'trend')+'</div>'+(state.compareMode==='metrics'?table:chart))+'</div>';
}
function report() {
  const s = get(state.stock);
  const content = s && reports.get(s.id);
  const stockChoices = stocks.map(v=>'<option value="'+v.id+'" '+(v.id===s?.id?'selected':'')+'>'+stockLabel(v)+'</option>').join('');
  const body = !s ? notice('尚未載入股票資料','請稍後再查詢。') : !content || content.loading ? notice('正在查詢報告','') :
    content.error ? notice('報告暫時無法讀取','請稍後再試。') : content.missing ? notice('尚無已發佈報告',s.name+' 目前沒有公開報告。') :
    '<div class="card pad report"><div class="bar"><div><h2>'+s.name+'｜'+esc(content.title)+'</h2><p class="caption">發佈 '+esc(content.publishedAt)+' · 資料基準 '+esc(content.asOf)+'</p></div>'+
    button('↓ 下載報告','download-report','small')+'</div><div class="report-text">'+formatReport(content.content)+'</div></div>';
  return title('研究報告','查看已發佈的研究報告。')+'<div class="stack">'+
    (s ? '<section class="card pad"><div class="bar"><label class="field picker">股票<select id="reportStock">'+stockChoices+'</select></label>'+button('查看個股','stock','',s.id)+'</div></section>' : '')+
    '<div>' + body + '</div></div>';
}
function formatReport(content) {
  const blocks = String(content).replaceAll('\r','').split(/\n\s*\n/);
  return blocks.map(block=>{
    const lines = block.split('\n');
    if (lines.every(line=>line.startsWith('|'))) return '<pre>'+esc(block)+'</pre>';
    if (lines.every(line=>/^[-*] /.test(line))) {
      return '<ul>'+lines.map(line=>'<li>'+esc(line.slice(2))+'</li>').join('')+'</ul>';
    }
    return lines.map(line=>{
      const heading = /^#{1,6} (.+)$/.exec(line);
      return heading ? '<h3>'+esc(heading[1])+'</h3>' : esc(line);
    }).join('<br>');
  }).map(block=>'<div class="report-block">'+block+'</div>').join('');
}

const marketData = {length:12,chips:'listed'};
const marketLabels = {strongBull:'強勢多頭',bull:'一般多頭',strongBear:'強勢空頭',bear:'一般空頭',flat:'整理趨勢',unknown:'資料未齊'};

function indexDirection(bar) {
  if (!bar || ![bar.close,bar.ma10,bar.ma20].every(Number.isFinite)) return 'unknown';
  if (bar.close > bar.ma10 && bar.ma10 > bar.ma20) return 'bull';
  if (bar.close < bar.ma10 && bar.ma10 < bar.ma20) return 'bear';
  return 'flat';
}
function marketDirection(weighted, otc) {
  if (weighted === 'unknown' || otc === 'unknown') return 'unknown';
  if (weighted === 'bull') return otc === 'bull' ? 'strongBull' : 'bull';
  if (weighted === 'bear') return otc === 'bear' ? 'strongBear' : 'bear';
  return 'flat';
}
const indexNames = ['加權指數','上櫃指數'];
const directionText = {bull:'多頭排列',bear:'空頭排列',flat:'未達多空條件',unknown:'資料不足'};
function getMarketSeries() {
  return ['listed','otc'].map(market=>feeds.market.indices[market].filter(bar=>bar.date<=feeds.market.asOf));
}
function indexCard(bars,index) {
  const last = bars.at(-1);
  const delta = last.close - bars.at(-2).close;
  const move = (delta / bars.at(-2).close)*100;
  const direction = indexDirection(last);
  return '<article class="card pad market-index"><div class="bar"><h2>'+indexNames[index]+'</h2><span class="regime '+direction+'">'+directionText[direction]+'</span></div>'+
    '<div class="quote">'+fmt(last.close)+' <small>點</small> <span class="'+cls(move)+'">'+signed(move,2)+'</span></div>'+
    '<div class="legend" aria-label="圖例"><span style="--swatch:#b13a3a">收紅</span><span style="--swatch:#137255">收黑</span><span style="--swatch:#aa621c">十日線</span><span style="--swatch:#5869bc">月線（20 日）</span></div>'+
    '<canvas id="index-'+index+'" class="chart candles" role="img" aria-label="'+indexNames[index]+'日 K、十日線與月線"></canvas>'+
    '<div class="index-reading small muted" id="indexRead-'+index+'"></div></article>';
}
function changeNumber(value,digits=2) {
  return '<span class="'+cls(value)+'">'+(value>0?'+':'')+fmt(value,digits)+'</span>';
}
function chipTables() {
  const selected = feeds.market.chips[marketData.chips];
  const official = marketData.chips==='listed'
    ? [null,'https://www.twse.com.tw/zh/trading/foreign/bfi82u.html']
    : ['https://www.tpex.org.tw/zh-tw/market-infomation.html',null];
  const tables = [
    ['融資融券','融資為億元 · 融券為張',['融資餘額','融資日增減','融券餘額','融券日增減'],selected.margin, v => [fmt(v[0]),changeNumber(v[1]),fmt(v[2],0),changeNumber(v[3],0)]],
    ['三大法人買賣超','新台幣億元',['外資及陸資','投信','自營商','合計'],selected.org,v=>v.map(n=>changeNumber(n))]
  ];
  return '<div class="bar"><div><h2>近五日籌碼</h2><p class="caption">各欄以官方已公告日期為準</p></div><div class="seg" aria-label="籌碼市場">'+
    button('上市','chip-market',marketData.chips==='listed'?'active':'','listed')+
    button('上櫃','chip-market',marketData.chips==='otc'?'active':'','otc')+'</div></div>'+
    '<div class="market-grid">'+tables.map(([name,note,columns,rows,format],i)=>
      (rows.length===0 && official[i] ? '<section class="card pad"><h2>'+name+'</h2><p class="caption">公開站提供官方查詢入口。</p><p><a href="'+official[i]+'" target="_blank" rel="noopener">前往官方報表 ↗</a></p></section>' :
      '<section class="card results"><div class="bar"><div><h2>'+name+'</h2><p class="caption">'+note+' · 最新 '+dateLabel(rows[0]?.date)+'</p></div></div><div class="tablewrap chip-table"><table><thead><tr><th scope="col">日期</th>'+
      columns.map(label=>'<th scope="col" class="num">'+label+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(row=>'<tr><th scope="row">'+dateLabel(row.date)+'</th>'+format(row.values).map(value=>'<td class="num">'+value+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
      (rows.length<5?'<p class="caption pad">目前僅有 '+rows.length+' 個已驗證交易日。</p>':'')+'</section>')
    ).join('')+'</div>';
}
function market() {
  if(!feeds.market) return title('台股大盤','盤後行情與籌碼')+
    '<div class="card">'+notice('大盤資料尚未就緒','待雙市場資料更新並通過驗證。')+'</div>';
  const series = getMarketSeries();
  const signals = series.map(bars => indexDirection(bars.at(-1)));
  const signal = marketDirection(...signals);
  const reason = signal === 'strongBull' ? '兩個指數的收盤價都高於十日線，十日線也都高於月線。' :
    signal === 'strongBear' ? '兩個指數的收盤價都低於十日線，十日線也都低於月線。' :
    signal === 'bull' ? '加權指數達多頭條件，上櫃未達多頭條件。' :
    signal === 'bear' ? '加權指數達空頭條件，上櫃未達空頭條件。' :
    signal === 'flat' ? '加權指數的收盤價與均線排列未達多頭或空頭條件。' : '需要兩個指數的同日收盤價與均線。';
  return title('台股大盤','上市與上櫃指數、均線排列與近五日籌碼。','<div class="date">判定交易日 <strong>'+dateLabel(feeds.market.asOf)+'</strong></div>')+
    '<div class="stack"><section class="card pad market-regime"><div class="muted small">大盤趨勢</div><div class="row actions"><strong class="regime-title '+signal+'">'+marketLabels[signal]+'</strong><span class="chip">加權 '+directionText[signals[0]]+'</span><span class="chip">上櫃 '+directionText[signals[1]]+'</span></div><p class="caption">'+reason+'</p>'+
    '<details class="advanced"><summary>查看趨勢判定規則</summary><p class="caption">十日線和月線分別為最近 10、20 個交易日的收盤平均。多頭要求收盤價高於十日線，且十日線高於月線。空頭要求收盤價低於十日線，且十日線低於月線。兩指數同向達標為強勢，只有加權達標為一般。加權未達標為整理。</p></details></section>'+
    '<div class="bar"><h2>指數日 K</h2><div class="seg" aria-label="圖表期間">'+[[12,'近一年'],[6,'近半年'],[3,'近三個月']].map(([n,label])=>button(label,'market-range',marketData.length===n?'active':'',n)).join('')+'</div></div>'+
    '<div class="market-grid index-grid">'+series.map(indexCard).join('')+'</div>'+chipTables()+
    '<section class="card pad"><div class="bar"><h2>龍蝦趨勢</h2><span class="chip">規則待確認</span></div></section>'+publicSources+'</div>';
}

function renderIndexChart(canvas,bars,index) {
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const ratio = devicePixelRatio || 1;
  const width = box.width;
  const height = box.height;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio,ratio);
  const start = new Date(bars.at(-1).date+'T00:00:00Z');
  start.setUTCMonth(start.getUTCMonth()-marketData.length);
  const visible = bars.filter(bar=>bar.date > start.toISOString().slice(0,10) && bar.ma20!=null);
  const low = Math.min(...visible.map(v=>Math.min(v.low,v.ma10,v.ma20)));
  const high = Math.max(...visible.map(v=>Math.max(v.high,v.ma10,v.ma20)));
  const margin = (high-low)*.075;
  const left = 52, right = 10, top = 12, bottom = height-25;
  const stride = (width-left-right)/visible.length;
  const x = i => left+(i+.5)*stride;
  const y = v => bottom-(bottom-top)*(v-low+margin)/(high-low+margin*2);
  const reading = document.getElementById('indexRead-'+index);
  function describe(bar) {
    reading.textContent = bar.date+' · 開 '+fmt(bar.open)+' · 高 '+fmt(bar.high)+' · 低 '+fmt(bar.low)+' · 收 '+fmt(bar.close)+
      ' · 十日線 '+fmt(bar.ma10)+' · 月線 '+fmt(bar.ma20);
  }
  function draw(active) {
    ctx.clearRect(0,0,width,height);
    ctx.font='11px system-ui, sans-serif';
    ctx.textAlign='right';
    for(let i=0;i<=4;i++){
      const val=low-margin+(high-low+margin*2)*(i/4), py=y(val);
      ctx.strokeStyle='#e3eae3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(width-right,py);ctx.stroke();
      ctx.fillStyle='#52665d';ctx.fillText(fmt(val,index?1:0),left-6,py+4);
    }
    visible.forEach((bar,i)=>{
      const px=x(i), color=bar.close>=bar.open?'#b13a3a':'#137255';
      const body=Math.max(.85,stride*.66);
      ctx.strokeStyle=color;ctx.lineWidth=Math.min(.85,stride*.65);
      ctx.beginPath();ctx.moveTo(px,y(bar.high));ctx.lineTo(px,y(bar.low));ctx.stroke();
      ctx.fillStyle=color;ctx.fillRect(px-body/2,Math.min(y(bar.open),y(bar.close)),body,Math.max(.9,Math.abs(y(bar.open)-y(bar.close))));
    });
    for(const [key,color] of [['ma10','#aa621c'],['ma20','#5869bc']]){
      ctx.beginPath();
      visible.forEach((bar,i)=>i===0?ctx.moveTo(x(i),y(bar[key])):ctx.lineTo(x(i),y(bar[key])));
      ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();
    }
    const steps = width<420 ? 3 : 5;
    for(let i=0;i<=steps;i++){
      const j=Math.round(i*(visible.length-1)/steps);
      ctx.fillStyle='#52665d';ctx.textAlign=i===0?'left':i===steps?'right':'center';
      ctx.fillText(visible[j].date.replaceAll('-','/').slice(2),x(j),height-6);
    }
    if (active != null) {
      ctx.setLineDash([3,3]);ctx.strokeStyle='#587067';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x(active),top);ctx.lineTo(x(active),bottom);ctx.stroke();ctx.setLineDash([]);
    }
    describe(visible[active ?? visible.length-1]);
  }
  draw(null);
  canvas.onpointermove = event => draw(Math.max(0,Math.min(visible.length-1,Math.floor((event.clientX-canvas.getBoundingClientRect().left-left)/stride))));
  canvas.onpointerleave = () => draw(null);
}
function render() {
  if(state.page==='stock' && get(state.stock)) loadStockResource(state.stock,'stock');
  if(state.page==='report' && get(state.stock)) loadStockResource(state.stock,'report');
  if(state.page==='compare' && state.compareMode==='trend') state.selected.forEach(id=>loadStockResource(id,'stock'));
  document.getElementById('nav').innerHTML=config.map(([id,icon,label])=>'<button type="button" data-act="page" data-value="'+id+'" '+(state.page===id?'aria-current="page"':'')+'><span class="nav-icon" aria-hidden="true">'+icon+'</span>'+label+
    (id==='compare'&&state.selected.size?'<span class="nav-count">'+state.selected.size+'</span>':'')+'</button>').join('');
  document.getElementById('recent').innerHTML=state.recent.map(id=>'<button type="button" data-act="stock" data-value="'+id+'"><span class="code">'+id+'</span>'+get(id).name+'</button>').join('');
  document.getElementById('recent').parentElement.hidden=!state.recent.length;
  main.innerHTML=({market,screen,stock:stockPage,compare,report})[state.page]();
  updateVal();
  drawCharts();
}
function plot(canvas,series,dates,indexed=false) {
  const count=dates.length;
  const box=canvas.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const ratio=window.devicePixelRatio||1;
  canvas.width=box.width*ratio;
  canvas.height=box.height*ratio;
  const ctx=canvas.getContext('2d');
  ctx.scale(ratio,ratio);
  const width=box.width,height=box.height;
  const numbers=series.flatMap(v=>v.values);
  const low=Math.min(...numbers), high=Math.max(...numbers);
  const rawMin=low-Math.max(Math.abs(low)*.07,1), rawMax=high+Math.max(Math.abs(high)*.03,1);
  const unit=10**Math.floor(Math.log10((rawMax-rawMin)/4));
  const step=Math.ceil((rawMax-rawMin)/4/unit)*unit;
  const min=Math.floor(rawMin/step)*step,max=min+step*5;
  const left=49,right=13,top=13,bottom=height-32;
  const x=i=>left+(width-left-right)*i/(count-1);
  const y=v=>bottom-(bottom-top)*(v-min)/(max-min);
  ctx.font='11px system-ui, sans-serif';
  for(let i=0;i<=5;i++){
    const label=min+i*step, py=y(label);
    ctx.strokeStyle='#e4eae4';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(width-right,py);ctx.stroke();
    ctx.fillStyle='#52665d';ctx.textAlign='right';ctx.fillText(fmt(label,1),left-7,py+4);
  }
  const ticks=width<450?3:6;
  for(let i=0;i<=ticks;i++){
    const index=Math.round(i*(count-1)/ticks);
    ctx.fillStyle='#52665d';ctx.textAlign=i===0?'left':i===ticks?'right':'center';
    ctx.fillText(dates[index].replace('-','/'),x(index),height-10);
  }
  series.forEach(({values,color},idx)=>{
    if (!indexed && idx===0) {
      const fill=ctx.createLinearGradient(0,top,0,bottom);
      fill.addColorStop(0,'#d0e8d8');fill.addColorStop(1,'#f4faf5');
      ctx.beginPath();ctx.moveTo(x(0),bottom);
      values.forEach((v,i)=>ctx.lineTo(x(i),y(v)));
      ctx.lineTo(x(count-1),bottom);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    }
    ctx.beginPath();values.forEach((v,i)=>i===0?ctx.moveTo(x(i),y(v)):ctx.lineTo(x(i),y(v)));
    ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.stroke();
    ctx.beginPath();ctx.arc(x(count-1),y(values.at(-1)),3.6,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();
  });
  const note=document.getElementById('chartNote');
  if (!indexed&&note){
    canvas.onpointermove=e=>{
      const index=Math.max(0,Math.min(count-1,Math.round((e.clientX-canvas.getBoundingClientRect().left-left)/(width-left-right)*(count-1))));
      note.textContent=dates[index]+' · '+fmt(series[0].values[index],1)+' 億元';
    };
    canvas.onpointerleave=()=>{note.textContent='移到圖上查看單月數值';};
  }
}
function drawCharts() {
  const indices = indexNames.map((_,i)=>document.getElementById('index-'+i));
  if(indices[0]) getMarketSeries().forEach((bars,i)=>renderIndexChart(indices[i],bars,i));
  const one=document.getElementById('trend');
  if(one){
    const rows=trendValues(get(state.stock),state.period);
    plot(one,[{values:rows.map(v=>v.revenue),color:chartColors[0]}],rows.map(v=>v.month));
  }
  const multi=document.getElementById('comparisonTrend');
  if(multi){
    const {keys,series}=comparisonSeries();
    plot(multi,series,keys,true);
  }
}

function openStock(id,page='stock'){
  if(!get(id)) return;
  state.stock=id;state.tab='overview';state.page=page;
  state.recent=[id,...state.recent.filter(x=>x!==id)].slice(0,4);
  suggest.hidden=true;search.value='';
  render();window.scrollTo(0,0);
}
let toastTimeout;
function toast(message) {
  const box=document.getElementById('toast');
  box.textContent=message;box.hidden=false;
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>{box.hidden=true;},2700);
}
function toggle(id){
  const active = document.activeElement;
  const table = main.querySelector('.tablewrap');
  const offset = table?.scrollLeft ?? 0;
  if(state.selected.has(id)) state.selected.delete(id);
  else if(state.selected.size>=5){toast('最多可比較 5 檔股票');return false;}
  else state.selected.add(id);
  render();
  const nextTable = main.querySelector('.tablewrap');
  if (nextTable) nextTable.scrollLeft = offset;
  if (active?.dataset.pick === id) main.querySelector('[data-pick="'+id+'"]')?.focus({preventScroll:true});
  if (active?.id === 'addStock') document.getElementById('addStock')?.focus({preventScroll:true});
  return true;
}
function download(name,content,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');
  link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCsv(){
  const rows=screenRows();
  if(!rows.length){toast('目前沒有可匯出的股票');return;}
  const f=state.applied;
  const headers=['代號','公司','市場','季報','營收月份','收盤日','收盤價','月營收YoY%','累計YoY%','單季EPS','TTM PE','資料類型'];
  const body=rows.map(s=>[s.id,s.name,s.market,f.quarter,f.month,feeds.catalog.asOf,s.price,s.yoy,s.ytd,s.eps,s.pe,'TWSE／TPEx／MOPS']);
  download('台股選股.csv','\uFEFF'+[headers,...body].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');
}

function choosePreset(preset) {
  state.draft={...defaults,quarter:state.draft.quarter,month:state.draft.month,...presets[preset]};
  state.applied={...state.draft};state.preset=preset;state.resultPage=0;
  render();
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-act]');
  if(!event.target.closest('.searchbox')) suggest.hidden=true;
  if(!el||el.disabled) return;
  const {act,value}=el.dataset;
  const s=get(state.stock);
  switch(act){
    case 'market-range': marketData.length=Number(value);render();break;
    case 'chip-market': marketData.chips=value;render();break;
    case 'page': state.page=value;render();window.scrollTo(0,0);break;
    case 'stock': openStock(value);break;
    case 'preset': choosePreset(value);break;
    case 'reset': choosePreset('all');break;
    case 'sort': state.desc=state.sort===value?!state.desc:value!=='id';state.sort=value;state.resultPage=0;render();break;
    case 'results-page':
      state.resultPage=Number(value);
      render();
      main.querySelector('.results').scrollIntoView({block:'start'});
      break;
    case 'toggle': toggle(value);break;
    case 'csv': exportCsv();break;
    case 'tab': state.tab=value;render();break;
    case 'period': state.period=Number(value);render();break;
    case 'compare-mode': state.compareMode=value;render();break;
    case 'download-report': {
      const item = s && reports.get(s.id);
      if(item?.content) download(s.id+'-研究報告.md',item.content,'text/markdown;charset=utf-8');
      break;
    }
  }
});
document.addEventListener('input',event=>{
  if(event.target.closest('#filterForm')&&event.target.name){
    state.draft[event.target.name]=event.target.value;
    document.getElementById('filterHint').textContent='有尚未套用的篩選變更';
  }
  if(event.target.matches('[data-valuation]')) updateVal(true);
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.matches('[data-pick]')&&!toggle(el.dataset.pick)) el.checked=false;
  if(el.id==='addStock'&&el.value){if(!toggle(el.value))el.value='';}
  if(el.id==='reportStock') openStock(el.value,'report');
});
document.addEventListener('toggle',event=>{
  if(event.target.id==='advanced') state.advanced=event.target.open;
},true);
document.addEventListener('submit',event=>{
  if(event.target.id!=='filterForm') return;
  event.preventDefault();
  state.draft=Object.fromEntries(new FormData(event.target));
  state.applied={...state.draft};state.preset='';state.resultPage=0;
  render();
});
function matches(){
  const query=search.value.trim();
  return query ? stocks.filter(s=>s.id.includes(query)||s.name.includes(query)).slice(0,12) : [];
}
search.addEventListener('input',()=>{
  const list=matches();
  suggest.hidden=!search.value.trim();
  suggest.innerHTML=list.length ? list.map(s=>button(stockLabel(s)+'　'+s.market,'stock','ghost',s.id)).join('') :
    '<div class="caption" style="padding:6px 8px">沒有符合的公司</div>';
});
search.addEventListener('keydown',event=>{
  if(event.key==='Enter'){const items=matches();if(items.length===1)openStock(items[0].id);else if(items.length>1)suggest.querySelector('button')?.focus();}
  if(event.key==='ArrowDown'&&!suggest.hidden){event.preventDefault();suggest.querySelector('button')?.focus();}
  if(event.key==='Escape')suggest.hidden=true;
});
suggest.addEventListener('keydown',event=>{
  const action=event.target.closest('button');
  if(event.key==='Escape'){suggest.hidden=true;search.focus();}
  if(event.key==='ArrowDown'&&action){event.preventDefault();action.nextElementSibling?.focus();}
  if(event.key==='ArrowUp'&&action){event.preventDefault();(action.previousElementSibling||search).focus();}
});
document.addEventListener('keydown',event=>{
  if(event.key==='/'&&!event.target.matches('input,textarea,select')&&!event.ctrlKey&&!event.metaKey){event.preventDefault();search.focus();}
});
window.addEventListener('resize',drawCharts);
boot();
