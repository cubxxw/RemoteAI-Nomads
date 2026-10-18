"""One-way, allowlisted import. Raw Notion Notes never enter the web database.
Usage: python3 scripts/import-data.py /absolute/path/to/research-package
Outputs stay ignored: .data/preview.sqlite, .data/seed.sql, .data/import-report.json.
"""
import csv, hashlib, json, re, sqlite3, sys, unicodedata
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
INPUT=Path(sys.argv[1]).resolve()
OUT=ROOT/'.data'; OUT.mkdir(exist_ok=True)
db=sqlite3.connect(':memory:'); db.executescript((ROOT/'migrations/0001_core.sql').read_text())
stamp='2026-10-17'
def norm(s): return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def slug(s): return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def digest(s): return hashlib.sha256(s.encode()).hexdigest()
def csvrows(name): return list(csv.DictReader((INPUT/name).open(encoding='utf-8-sig')))
def js(v): return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def put(table,**values):
    cols=list(values);db.execute(f'INSERT OR REPLACE INTO {table} ({",".join(cols)}) VALUES ({",".join("?" for _ in cols)})',list(values.values()))
def text(p,k):
    v=p.get(k,{})
    return ''.join(x.get('plain_text',x.get('text',{}).get('content','')) for x in v.get(v.get('type'),[])) if v.get('type') in ('rich_text','title') else ''
def source(url,title,kind='dataset',license=None):
    key=digest(url)[:20]
    publisher=re.sub(r'^https?://([^/]+).*',r'\1',url)
    if not db.execute('SELECT 1 FROM sources WHERE id=?',(key,)).fetchone():
        put('sources',id=key,url=url,publisher=publisher,title=title,kind=kind,license=license,accessed_at=stamp)
    return key

countries=csvrows('countries.csv'); country_map={norm(c['英文名']):c['ISO2'] for c in countries}
for c in countries:
    put('countries',id=c['ISO2'],iso2=c['ISO2'],name_zh=c['国家地区'],name_en=c['英文名'],region=c['区域'],subregion=c['次区域'],catalog_scope=c['目录口径'],currencies=js(c['货币代码'].split(' | ') if c['货币代码'] else []),timezones=js(c['IANA时区'].split(' | ') if c['IANA时区'] else []),catalog_source=c['目录来源'],checked_at=stamp)
aliases={'Republic of the Congo':'CG','North Korea':'KP','Russia':'RU','Brunei':'BN','Federated States of Micronesia':'FM','Nauru':'NR','Iran':'IR','Cape Verde':'CV','Saint Martin':'MF','Venezuela':'VE','Falkland Islands':'FK','Sahrawi Arab Democratic Republic':'EH','Pitcairn Islands':'PN','Syria':'SY','Wallis and Futuna':'WF','Vatican City':'VA','Palestine':'PS','U.S. Virgin Islands':'VI','United States':'US','Netherlands':'NL','United Kingdom':'GB','Macao':'MO','Tanzania':'TZ','Moldova':'MD','UAE':'AE','Bolivia':'BO','Bosnia & Herzegovina':'BA','Hong Kong':'HK','South Korea':'KR','Laos':'LA'}
country_map.update({norm(k):v for k,v in aliases.items()})
legacy={'Somaliland','Transnistria','South Ossetia','Ascension Island','Northern Cyprus','Tristan da Cunha','Abkhazia','Akrotiri and Dhekelia'}
notion_country={}; country_dupes=[]
for row in json.loads((INPUT/'notion-sync/countries-rows-before.json').read_text()):
    title=text(row['properties'],'Name'); parts=re.split(r'(?=[\u4e00-\u9fff])',title,maxsplit=1);en=parts[0].strip();zh=parts[1] if len(parts)>1 else en
    key=country_map.get(norm(en))
    if not key:
        if en not in legacy:raise ValueError('Unmapped country: '+title)
        key='legacy:'+slug(en)
        put('countries',id=key,name_zh=zh,name_en=en,region='其他地区',catalog_scope='历史记录中的单列地区；不分配 ISO2',catalog_source='https://www.notion.so/'+row['id'].replace('-',''),checked_at=stamp)
    if key in notion_country.values():country_dupes.append({'name':title,'country_id':key})
    notion_country[row['id']]=key
    put('notion_links',page_id=row['id'],entity_type='country',entity_id=key,last_edited_at=row['last_edited_time'],payload_hash=digest(js(row)))

photos=json.loads((ROOT/'scripts/photos.json').read_text()) if (ROOT/'scripts/photos.json').exists() else {}
curated={
 'chiang-mai':('在咖啡馆与山林之间，安排一段专注的日常。','先看出发月份：原记录提示 2–4 月空气质量风险。'),
 'penang':('从乔治市的街巷开始，慢慢建立自己的生活半径。','雨季、交通与具体房间的工作条件需要分别核对。'),
 'da-nang':('让工作日靠近海边，把周末留给会安与山间。','出发前核对雨季；电子签入境条件与远程工作许可分别确认。'),
 'lisbon':('城市散步、海风，与一段欧洲时区的日常。','预算和住房需要重新报价；签证与税务资格单独核验。'),
 'tbilisi':('把城市生活与高加索的周末，放进同一张日历。','核对普通护照停留条件，不能沿用其他国籍的待遇。'),
 'kuala-lumpur':('以城市配套为起点，试住一个完整的工作月。','先按通勤与房间条件选街区，再核对安全和住宿报价。')}
wn=json.loads((INPUT/'raw/wherenext-city-value.json').read_text()); wn_lookup={(x['countryCode'],norm(x['name'])):x for x in wn['data']}
months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; city_names={}; costs={'notion':0,'wherenext':0,'missing':0}
city_input=json.loads((INPUT/'notion-sync/cities-rows-before.json').read_text())
for row in city_input:
    p=row['properties'];title=text(p,'Name');parts=re.split(r'(?=[\u4e00-\u9fff])',title,maxsplit=1);en=parts[0].strip();zh=parts[1] if len(parts)>1 else en
    relations=p['Country']['relation'];assert len(relations)==1,(title,relations)
    country=notion_country[relations[0]['id']]; city_slug=slug(en) or row['id']
    if db.execute('SELECT 1 FROM cities WHERE slug=?',(city_slug,)).fetchone():city_slug+='-'+slug(country)
    cid='city:'+row['id']; city_names[(country,norm(en))]=cid
    date=(p.get('Last Verified',{}).get('date') or {}).get('start',stamp)[:10]
    amount=p.get('Cost USD/Month',{}).get('number'); src=None; basis='暂无可靠月成本记录'
    urls=re.findall(r'https?://[^\s；]+',text(p,'Web Sources'))
    if amount and amount>0:
        costs['notion']+=1; basis='原 Notion 月成本基准；住宿条件及完整包含项未统一，属于估算'
        src=source(urls[0] if urls else 'https://www.notion.so/'+row['id'].replace('-',''),'原城市记录引用的来源；本轮未重新核读','legacy')
    else:
        match=wn_lookup.get((country,norm(en)))
        if match and match.get('monthlyCostEstimate',0)>0:
            amount=match['monthlyCostEstimate'];basis='WhereNext 模型估算；非当前租房报价';date=wn['meta']['updated'];costs['wherenext']+=1
            src=source('https://getwherenext.com/data/best-value-cities-2026','WhereNext Best Value Cities 2026','secondary','CC BY 4.0')
        else:amount=None;costs['missing']+=1
    pic=photos.get(city_slug,{})
    summary,caveat=curated.get(city_slug,('从预算、月份与工作条件，了解这座城市。','具体住宿、网络、停留资格需要单独核验。'))
    region=db.execute('SELECT region FROM countries WHERE id=?',(country,)).fetchone()[0]
    put('cities',id=cid,country_id=country,slug=city_slug,name_zh=zh,name_en=en,region=region,summary=summary,caveat=caveat,budget_amount=amount,budget_currency='USD',budget_basis=basis,budget_source_id=src,budget_checked_at=date if amount else None,publication_status='draft',checked_at=date,photo_url=pic.get('url'),photo_credit=pic.get('credit'),photo_source=pic.get('source'),featured_order=list(curated).index(city_slug) if city_slug in curated else 1000)
    monthsrc=source('https://www.notion.so/'+row['id'].replace('-',''),'原城市记录中的月份；未在本轮重算气象','legacy')
    best=[x['name'] for x in p.get('Best Months',{}).get('multi_select',[])];avoid=[x['name'] for x in p.get('Avoid Months',{}).get('multi_select',[])]
    for i,m in enumerate(months,1):
        status='caution' if m in avoid else 'recommended' if m in best else 'unknown'
        put('city_months',city_id=cid,month=i,suitability=status,evidence_note='继承原 Notion 月份标签；非天气预报',source_id=monthsrc,checked_at=date)
    put('notion_links',page_id=row['id'],entity_type='city',entity_id=cid,last_edited_at=row['last_edited_time'],payload_hash=digest(js(row)))

for r in csvrows('latest-observations.csv'):
    put('metric_definitions',id=r['指标代码'],label=r['指标'],unit=r['单位'],scope=r['解释边界'])
    put('metric_observations',id=r['记录键'],country_id=r['ISO2'],metric_id=r['指标代码'],value=float(r['数值']) if r['数值'] else None,year=int(r['数据年']) if r['数据年'] else None,missing_reason=r['缺失原因'],source_id=source(r['来源URL'],'World Bank '+r['指标'],'official'),checked_at=r['检索日期'])
for r in csvrows('ai-regions.csv'):
    label=r['官方名单状态']; status='not_listed' if '未' in label else 'conditional' if '例外' in label else 'listed'
    put('ai_availability',id=r['ISO2']+':'+r['服务'],country_id=r['ISO2'],product=r['服务'],status=status,detail=label+'。'+r['限制与证据范围'],source_id=source(r['官方来源URL'],r['服务']+'官方地域名单','official'),checked_at=r['检索日期'],tested=0)
for r in csvrows('visa-rules.csv'):
    put('visa_programs',id=r['规则ID'],country_id=r['ISO2'],name=r['方案'],kind=r['类别'],stay_text=r['停留及有效期'],amount=float(r['财务金额原币']) if r['财务金额原币'] else None,currency=r['币种'] or None,financial_basis=r['财务口径'],financial_rule=r['财务规则'],work_scope=r['工作适用范围'],passport_scope=r['护照及领区限制'],restriction=r['关键限制或冲突'],verification=r['核验状态'],source_id=source(r['官方来源URL'],r['方案']+'官方说明','official'),source_published_at=r['来源版本或更新日'] or None,effective_at=r['政策生效日'] or None,checked_at=r['检索日期'])
nt=json.loads((INPUT/'raw/nomadterminal-visa-tracker.json').read_text())
if isinstance(nt,dict):nt=nt.get('schemes',nt.get('data',nt.get('visas',[])))
for i,r in enumerate(nt):
    put('visa_observations',id='nt:'+str(i),country_id=r['iso2'],provider='Nomad Terminal',scheme=r['scheme'],provider_status=r['status'],payload=js(r),source_id=source('https://nomadterminal.com/visas/','Nomad Terminal Visa Tracker','secondary','CC BY 4.0'),checked_at=r['checked'])
wv=json.loads((INPUT/'raw/wherenext-visas.json').read_text())
for i,r in enumerate(wv['visas']):
    put('visa_observations',id='wn:'+str(i),country_id=r['countryCode'],provider='WhereNext',scheme=r['visaName'],provider_status='secondary; not independently verified',payload=js(r),source_id=source(wv['source'],'WhereNext Digital Nomad Visas','secondary','CC BY 4.0'),checked_at=r.get('verifiedAt',wv['updated']))
place_to_name={'槟城乔治市':'Penang','兰塔岛':'Koh Lanta','地拉那':'Tirana','拉斯帕尔马斯':'Las Palmas','锡亚高岛':'Siargao'}
for r in csvrows('workspace-quotes.csv'):
    en=next((v for k,v in place_to_name.items() if k in r['城市或目的地']),r['城市或目的地']);cid=city_names.get((r['ISO2'],norm(en)))
    put('workspace_quotes',id=r['样本ID'],country_id=r['ISO2'],city_id=cid,place_label=r['城市或目的地'],operator=r['运营方'],plan=r['套餐'],amount=float(r['报价']),currency=r['币种'],period=r['计价单位'],access_hours=r['办公开放权限'],network_claim=r['网络与备电说明'],restriction=r['费用与使用限制'],validity=r['报价有效期'],source_id=source(r['来源URL'],r['运营方']+'运营方公开报价','operator'),checked_at=r['检索日期'])

editorials=[
 ('chiang-mai-vs-penang','comparison','清迈还是槟城，冬天住一个月怎么选','先比较月份、生活成本基准与工位证据，再核对个人停留资格。',['两城都有明确的冬季推荐月份。原表成本只能用来初筛，住宿品质和包含项未统一，不应把差价当作可保证的节省。','槟城有运营方工位报价可查；清迈的工位在本数据包中缺少同口径报价。这是证据缺口，不能据此说清迈没有工位。','如果行程进入二至四月，先重新核查清迈空气质量。确定城市之前，预约可取消住宿并完成一次真实视频会议测试。'],['chiang-mai','penang']),
 ('chiang-mai-vs-da-nang','comparison','清迈与岘港，先看月份，再看预算','同一座城市，出发月份往往比榜单名次更重要。',['这组比较不提供全年赢家。先查看两城月份标签，再考虑是否需要海边生活。','成本数字来自不同旧资料，不能直接替代同入住日期、同房型的报价。签证入境与可否远程工作仍需分别核对。'],['chiang-mai','da-nang']),
 ('first-month','guide','第一站，先住一周，再决定一个月','用一个完整的工作周，检验这个地方是否适合你。',['先订 5–7 晚可取消住宿。将抵达、熟悉街区和第一个工作日分开安排。','在真实会议时段测试上传与延迟，留意噪音，也试试手机热点。买一次工位日票，确认电话间、晚间进入和备用电力。','记录房费之外的清洁费、水电、押金、交通和工位支出。完成一个完整工作日后，再谈月租。'],[])]
for key,kind,title,summary,body,slugs in editorials:
    put('editorial_pages',id=key,slug=key,kind=kind,title=title,summary=summary,body_json=js(body),status='draft',updated_at=stamp)
    for i,s in enumerate(slugs):
        cid=db.execute('SELECT id FROM cities WHERE slug=?',(s,)).fetchone()[0]
        put('editorial_cities',page_id=key,city_id=cid,position=i)
tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
report={t:db.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in tables}
report['import_runs']=1
report.update(standard_countries=250,country_duplicate_links=country_dupes,budget_sources=costs,private_notes_exported=0,foreign_key_errors=db.execute('PRAGMA foreign_key_check').fetchall(),integrity=db.execute('PRAGMA integrity_check').fetchone()[0])
assert not report['foreign_key_errors'];assert report['cities']==len(city_input);assert report['ai_availability']==750
files=['countries.csv','latest-observations.csv','ai-regions.csv','visa-rules.csv','workspace-quotes.csv','notion-sync/countries-rows-before.json','notion-sync/cities-rows-before.json']
hashes={f:hashlib.sha256((INPUT/f).read_bytes()).hexdigest() for f in files}
put('import_runs',id='initial-'+digest(js(hashes))[:16],started_at=stamp,input_hashes=js(hashes),summary=js(report))
db.commit();target=sqlite3.connect(OUT/'preview.sqlite');db.backup(target);target.close()
inserts=[s for s in db.iterdump() if s.startswith('INSERT INTO')]
# FK parents must precede children. Preserve existing rows on repeat import; later updates use reviewed patches.
order=['countries','sources','cities','city_months','metric_definitions','metric_observations','ai_availability','visa_programs','visa_observations','workspace_quotes','editorial_pages','editorial_cities','notion_links','import_runs','content_documents']
lines=[]
for table in order:
    lines += [s.replace('INSERT INTO','INSERT OR IGNORE INTO',1) for s in inserts if s.startswith('INSERT INTO "'+table+'"')]
(OUT/'seed.sql').write_text('\n'.join(lines)+'\n')
(OUT/'import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
