/* RC beam: cm, kgf, kgf/cm²; UI moments tf·m, shear tf. TW112 + 113 errata. */
const BARS={3:{d:.953,a:.7133},4:{d:1.27,a:1.267},5:{d:1.59,a:1.986},6:{d:1.91,a:2.865},7:{d:2.22,a:3.871},8:{d:2.54,a:5.067},9:{d:2.87,a:6.469},10:{d:3.22,a:8.143},11:{d:3.58,a:10.07}};
const DEFAULT={b:35,h:65,cover:4,fc:280,fy:4200,Es:2040000,agg:2,L:6,Ln:5.6,D:1.2,LL:.8,mode:'udl',Mu:30,Vu:20,dir:'positive',stir:3,legs:2,s:15,fyt:2800,sustain:.3,xi:2,defLimit:480,rows:[{face:'bottom',n:4,bar:8,offset:0},{face:'top',n:2,bar:6,offset:0}]};
function bisect(fn,lo,hi,history=[]){let fl=fn(lo),fh=fn(hi);if(!Number.isFinite(fl+fh)||fl*fh>0)throw Error('無法找到平衡中性軸，請檢查配筋');for(let i=0;i<100;i++){let m=(lo+hi)/2,f=fn(m);history.push({i,lo,hi,c:m,f,branch:fl*f<=0?'hi=m':'lo=m'});if(fl*f<=0)hi=m;else{lo=m;fl=f}}return (lo+hi)/2}
// Fraction and first moment of a circular bar lying in the rectangular block.
// Nominal bar area scales the geometric circle, retaining the source rebar table.
function displaced(r,a){const R=r.db/2,t=Math.max(-R,Math.min(R,a-r.z)),v=Math.max(0,R*R-t*t),factor=r.A/(Math.PI*R*R),Ac=(R*R*(Math.asin(t/R)+Math.PI/2)+t*Math.sqrt(v))*factor;return {Ac,Qc:r.z*Ac-2/3*v**1.5*factor}}
function analyze(p){
 const inputSnapshot=JSON.stringify(p);p={...p}; if(p.mode==='direct'){for(const k of ['L','D','LL','sustain','xi','defLimit'])p[k]=DEFAULT[k]}else{p.Mu=DEFAULT.Mu;p.Vu=DEFAULT.Vu}

 const errors=[]; const range=(k,lo,hi)=>{if(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi)errors.push(k+' 超出範圍 '+lo+'–'+hi)};
 [['b',10,200],['h',20,300],['cover',2,15],['fc',210,560],['fy',2800,5600],['Es',1900000,2100000],['agg',.5,5],['L',.5,40],['Ln',.5,40],['D',0,100],['LL',0,100],['Mu',0,10000],['Vu',0,10000],['s',2,100],['fyt',2800,4200],['legs',2,8],['sustain',0,1],['xi',1,2]].forEach(x=>range(...x));
 if(!['udl','direct'].includes(p.mode)||!['positive','negative'].includes(p.dir)||!BARS[p.stir]||![3,4,5].includes(+p.stir))errors.push('模式或箍筋號數錯誤');
 if(p.mode==='udl'&&p.Ln>p.L)errors.push('淨跨 Ln 不可大於分析跨度 L');
 if(![240,480].includes(p.defLimit)||![1,1.2,1.4,2].includes(p.xi))errors.push('撓度限制或載重期間選項無效');
 if(p.mode==='udl'&&p.dir!=='positive')errors.push('簡支均布載重模式僅適用正彎矩');
 if(!Number.isInteger(p.legs))errors.push('箍筋肢數必須為整數');
 if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>6)errors.push('需配置 1–6 排主筋');
 if(errors.length)throw Error(errors.join('；'));
 const hoop=BARS[p.stir];
 const rows=p.rows.map((r,i)=>{if(!BARS[r.bar]||!Number.isInteger(r.n)||r.n<1||r.n>30||!['top','bottom'].includes(r.face)||!Number.isFinite(r.offset)||r.offset<0||r.offset>p.h)throw Error('第 '+(i+1)+' 排鋼筋資料不合理');const db=BARS[r.bar].d,A=r.n*BARS[r.bar].a,edge=p.cover+hoop.d+db/2+r.offset,y=r.face==='top'?edge:p.h-edge,z=p.dir==='negative'?p.h-y:y,space=r.n>1?(p.b-2*(p.cover+hoop.d)-r.n*db)/(r.n-1):Infinity;if(edge>=p.h/2)throw Error('第 '+(i+1)+' 排已跨越斷面中央；請修正基準梁面與內移量');return {...r,i,db,A,y,z,space,minSpace:Math.max(2.5,db,4*p.agg/3)}});
 if(rows.some(r=>r.y-r.db/2<p.cover+hoop.d-1e-8||r.y+r.db/2>p.h-p.cover-hoop.d+1e-8||p.b-2*(p.cover+hoop.d)<r.n*r.db))throw Error('鋼筋超出箍筋內緣或梁寬不足，請調整尺寸／根數／內移量');
 const beta=Math.max(.65,Math.min(.85,.85-.05*(p.fc-280)/70));
 const forces=c=>{const a=Math.min(p.h,beta*c),Cc=.85*p.fc*p.b*a;const steels=rows.map(r=>{let eps=.003*(c-r.z)/c,fs=Math.max(-p.fy,Math.min(p.fy,p.Es*eps)),removed=displaced(r,a);return {...r,eps,fs,...removed,F:fs*r.A-.85*p.fc*removed.Ac,M:fs*r.A*r.z-.85*p.fc*removed.Qc}});return {a,Cc,steels,N:Cc+steels.reduce((s,r)=>s+r.F,0)}};
 const strengthHistory=[];const c=bisect(x=>forces(x).N,.000001,p.h*10,strengthHistory),q=forces(c),tension=q.steels.filter(r=>r.face===(p.dir==='negative'?'top':'bottom')),As=tension.reduce((s,r)=>s+r.A,0);
 if(Math.abs(q.N)>0.01)throw Error('力平衡未收斂，請檢查斷面及筋排資料');
 if(!As)throw Error('所選受拉面尚未配置主筋');
 const d=tension.reduce((s,r)=>s+r.A*r.z,0)/As,dt=Math.max(...rows.map(r=>r.z)),et=.003*(dt-c)/c,ey=p.fy/p.Es,phi=Math.max(.65,Math.min(.9,.65+.25*(et-ey)/.003));
 const Mn=-(q.Cc*q.a/2+q.steels.reduce((s,r)=>s+r.M,0))/1e5,cap=phi*Mn,Asmin=Math.max(.8*Math.sqrt(p.fc),14)/Math.min(p.fy,5600)*p.b*d;
 const self=p.b/100*p.h/100*2.4,Dtot=p.D+self,wu=Math.max(1.4*Dtot,1.2*Dtot+1.6*p.LL),Mu=p.mode==='udl'?wu*p.L*p.L/8:p.Mu,Vu=p.mode==='udl'?wu*p.L/2:p.Vu;
 const Av=p.legs*hoop.a,Avmin=Math.max(.2*Math.sqrt(p.fc),3.5)*p.b/p.fyt*p.s,lambdaS=Math.min(1,Math.sqrt(2/(1+d/25))),rho=As/(p.b*d),Vc=(Av>=Avmin?.53:Math.min(1.33,2.12*lambdaS*Math.cbrt(rho)))*Math.sqrt(p.fc)*p.b*d/1000,Vs=Av*p.fyt*d/p.s/1000,Vsreq=Math.max(0,Vu/.75-Vc),Vmax=.75*(Vc+2.12*Math.sqrt(p.fc)*p.b*d/1000),Vcap=Math.min(.75*(Vc+Vs),Vmax);
 const high=Vs>1.06*Math.sqrt(p.fc)*p.b*d/1000,smax=Math.min(high?d/4:d/2,high?30:60),widthMax=Math.min(high?d/2:d,high?30:60),legSpace=(p.b-2*p.cover-hoop.d)/(p.legs-1),sminMax=Av*p.fyt/(Math.max(.2*Math.sqrt(p.fc),3.5)*p.b),sStrength=Vsreq>0?Av*p.fyt*d/(Vsreq*1000):Infinity;
 const sorted=[...rows].sort((a,b)=>a.y-b.y),gaps=sorted.slice(1).map((r,i)=>r.y-sorted[i].y-(r.db+sorted[i].db)/2),gapMin=gaps.length?Math.min(...gaps):Infinity;
 const scopeIssues=[];if(p.Ln*100<=4*p.h)scopeIssues.push('淨跨 Ln ≤ 4h，須按深梁條件另行設計；以下數值僅供參考');if(p.h>90)scopeIssues.push('梁深 > 90 cm，側面鋼筋尚未檢核');
 const checks=[]; const check=(name,ok,value,clause)=>checks.push({name,ok,value,clause});
 check('彎矩強度',cap+1e-8>=Mu,{demand:Mu,capacity:cap,unit:'tf·m'},'22.2／21.2.2');
 check('拉力控制',et+1e-10>=ey+.003,{demand:ey+.003,capacity:et,unit:'應變'},'9.3.3.1');
 check('最小受拉鋼筋',As+1e-8>=Asmin,{demand:Asmin,capacity:As,unit:'cm²'},'9.6.1.2（不採 4/3 豁免）');
 check('剪力強度',Vcap+1e-8>=Vu,{demand:Vu,capacity:Vcap,unit:'tf'},'22.5.1／22.5.5／22.5.8');
 check('最小箍筋量',Av+1e-8>=Avmin,{demand:Avmin,capacity:Av,unit:'cm²'},'9.6.3.4（全段配置，不採豁免）');
 check('箍筋縱向間距',p.s<=smax+1e-8,{demand:p.s,capacity:smax,unit:'cm'},'表 9.7.6.2.2');
 check('箍筋橫向肢距',legSpace<=widthMax+1e-8,{demand:legSpace,capacity:widthMax,unit:'cm'},'表 9.7.6.2.2（假設等距有效肢）');
 check('主筋水平淨距',rows.every(r=>r.space+1e-8>=r.minSpace),{text:rows.map(r=>'第'+(r.i+1)+'排 '+(isFinite(r.space)?r.space.toFixed(2):'單根')+'／需求 '+r.minSpace.toFixed(2)+' cm').join('；')},'25.2.1');
 check('主筋垂直淨距',gapMin>=Math.max(2.5,4*p.agg/3)-1e-8,{text:(isFinite(gapMin)?gapMin.toFixed(2):'單排')+' cm；本工具採 ≥ max(2.5,4dagg/3)'},'25.2.2／26.4.2.1（另須上下對齊）');
 check('室內梁保護層',p.cover>=4,{demand:4,capacity:p.cover,unit:'cm'},'20.5.1.3.1（非暴露環境）');
 const Ec=12000*Math.sqrt(p.fc),n=p.Es/Ec,Ig=p.b*p.h**3/12,Mcr=2*Math.sqrt(p.fc)*Ig/(p.h/2)/1e5;
 const crackHistory=[];const kd=bisect(k=>p.b*k*k/2+rows.reduce((s,r)=>s+(r.z<k?n-1:n)*r.A*(k-r.z),0),.000001,p.h,crackHistory),Icr=p.b*kd**3/3+rows.reduce((s,r)=>s+(r.z<kd?n-1:n)*r.A*(r.z-kd)**2,0);
 const ie=M=>M<=2/3*Mcr?Ig:Math.min(Ig,Icr/(1-(2*Mcr/(3*M))**2*(1-Icr/Ig)));
 const serviceRuns=[];const def=w=>{const M=w*p.L*p.L/8,Ie=ie(M),delta=5*(w*10)*(p.L*100)**4/(384*Ec*Ie);serviceRuns.push({w,M,Ie,delta});return delta};
 const deltaD=def(Dtot),deltaDL=def(Dtot+p.LL),deltaLL=deltaDL-deltaD,deltaS=def(Dtot+p.sustain*p.LL),Asc=rows.filter(r=>r.z<kd).reduce((s,r)=>s+r.A,0),lambdaD=p.xi/(1+50*Asc/(p.b*d)),deltaLong=lambdaD*deltaS,deltaAfter=deltaLL+deltaLong;
 if(p.mode==='udl'){
 check('樓層活載即時撓度',deltaLL<=p.L*100/360,{demand:deltaLL,capacity:p.L*100/360,unit:'cm'},'表 24.2.2：L/360');
 check('附屬構材後續撓度',deltaAfter<=p.L*100/p.defLimit,{demand:deltaAfter,capacity:p.L*100/p.defLimit,unit:'cm'},'表 24.2.2：L/'+p.defLimit+'（保守計全部依時量）');}
 const IeFinal=ie((Dtot+p.LL)*p.L*p.L/8);const result={...q,scopeIssues,rows,c,beta,d,dt,et,ey,phi,Mn,cap,As,Asmin,self,Dtot,wu,Mu,Vu,Av,Avmin,lambdaS,rho,Vc,Vs,Vsreq,Vmax,Vcap,smax,widthMax,legSpace,sRecommend:Math.min(smax,sminMax,sStrength),checks,Ec,n,Ig,kd,Icr,Mcr,Ie:IeFinal,deltaD,deltaDL,deltaLL,deltaS,lambdaD,deltaLong,deltaAfter,ok:!scopeIssues.length&&checks.every(x=>x.ok),residual:q.N};result.trace=makeTrace(p,result,{strengthHistory,crackHistory,tension,high,sminMax,sStrength,sorted,gaps,gapMin,Asc,serviceRuns});result.inputSnapshot=inputSnapshot;result.appliedInputs=p;return result;
}
function suggest(p,bar){let best=null;const searchTrace={inputSnapshot:JSON.stringify(p),bar,candidates:[],stop:'完整評估1–3排、每排2–12支共33候選，以最小面積控制；同面積保留先出現候選'};suggest.lastTrace=searchTrace;const face=p.dir==='negative'?'top':'bottom',fixed=p.rows.filter(r=>r.face!==face),db=BARS[bar].d,gap=Math.max(2.5,db,4*p.agg/3);for(let layers=1;layers<=3;layers++)for(let per=2;per<=12;per++){const rows=[...fixed,...Array.from({length:layers},(_,i)=>({face,n:per,bar,offset:i*(db+gap)}))];try{const r=analyze({...p,rows});searchTrace.candidates.push({layers,per,area:layers*per*BARS[bar].a,capacity:r.cap,scope:r.scopeIssues.join('；'),checks:r.checks.filter(x=>['彎矩強度','拉力控制','最小受拉鋼筋','主筋水平淨距','主筋垂直淨距'].includes(x.name))});if(!r.scopeIssues.length&&r.checks.filter(x=>['彎矩強度','拉力控制','最小受拉鋼筋','主筋水平淨距','主筋垂直淨距'].includes(x.name)).every(x=>x.ok)){const area=layers*per*BARS[bar].a;if(!best||area<best.area)best={rows,r,area,layers,per,bar}}}catch(e){searchTrace.candidates.push({layers,per,area:layers*per*BARS[bar].a,error:e.message})}}if(best)best.searchTrace=searchTrace;return best}
function makeTrace(p,r,v){const t=[];const add=(title,formula,substitution,result,unit='',condition='',source='臺灣112年混凝土規範含113勘誤；原RC梁引擎')=>t.push({title,formula,substitution,result,unit,condition,source});
 add('本次模式及單位','cm、kgf、kgf/cm²；tf除1000，tf·m除100000',`mode=${p.mode},dir=${p.dir}；b=${p.b},h=${p.h},fc=${p.fc},fy=${p.fy},Es=${p.Es}`,p.mode,'',p.mode==='direct'?'直接Mu/Vu；L/D/LL/持續載重服務性欄位採內部預設且不作撓度判定':'均布載重模式忽略隱藏Mu/Vu輸入，以載重推算設計內力');
 r.rows.forEach(row=>add(`主筋第${row.i+1}排查表與座標`,'Ai=主筋表a欄；db=主筋表d欄；A=N Ai；edge=cover+dt+db/2+offset',`#${row.bar}：Ai=${BARS[row.bar].a},db=${row.db}；A=${row.n}×${BARS[row.bar].a}；edge=${p.cover}+${BARS[p.stir].d}+${row.db}/2+${row.offset}`,`A=${row.A} cm²；y=${row.y},z=${row.z} cm；淨距=${String(row.space)}`,'','y由梁頂起算；z由受壓面起算，負彎矩z=h-y；單根水平淨距Infinity不構成不足','原核心BARS #'+row.bar+'列，a(cm²)/d(cm)欄；非幾何πdb²/4替代公稱面積'));
 add('材料及壓力塊','β1=max(.65,min(.85,.85-.05(fc-280)/70))；a=min(h,β1c)',`max(.65,min(.85,.85-.05×(${p.fc}-280)/70))；c=${r.c}`,`β1=${r.beta}；a=${r.a}`,'cm');
 add('極限平衡實際100次求解','F(c)=Cc+ΣFi；c=(lo+hi)/2',v.strengthHistory.map(z=>`i=${z.i},lo=${z.lo},hi=${z.hi},c=${z.c},F=${z.f} kgf,更新=${z.branch}`).join('\n'),r.c,'cm','初始[.000001,10h]；固定100次；最終|殘差|≤.01kgf');
 r.steels.forEach(s=>add(`第${s.i+1}排應變與置換混凝土`,'εs=.003(c-z)/c；fs=clamp(Es εs,-fy,fy)；F=fs A-.85fc Ac；M=fs A z-.85fc Qc',`εs=.003×(${r.c}-${s.z})/${r.c}=${s.eps}；fs=clamp(${p.Es}×${s.eps},-${p.fy},${p.fy})=${s.fs}；Ac=${s.Ac},Qc=${s.Qc}`,`F=${s.F}；M=${s.M}`,'kgf／kgf·cm','圓筋相交：R=db/2,t=clamp(a-z,-R,R),v=max(0,R²-t²)，Ac=[R²(asin(t/R)+π/2)+t√v]A/(πR²)，Qc=zAc-(2/3)v^(3/2)A/(πR²)'));
 add('混凝土壓力與殘差','Cc=.85fc b a；N=Cc+ΣFi',`.85×${p.fc}×${p.b}×${r.a}；ΣFi=${r.steels.reduce((a,s)=>a+s.F,0)}`,`Cc=${r.Cc}；N=${r.residual}`,'kgf');
 add('受拉面主筋與有效深度','As=Σ受拉面Ai；d=ΣAi zi/As；dt=max(zi)',`受拉面=${p.dir==='negative'?'top':'bottom'}；ΣAi=${r.As}；ΣAi zi=${v.tension.reduce((a,s)=>a+s.A*s.z,0)}`,`d=${r.d}；dt=${r.dt}`,'cm','不把另一面少量受拉筋加入設計受拉主筋面積');
 add('應變與折減上下限','εt=.003(dt-c)/c；εy=fy/Es；φ=clamp(.65+.25(εt-εy)/.003,.65,.90)',`.003×(${r.dt}-${r.c})/${r.c}=${r.et}；εy=${r.ey}`,r.phi,'','另須εt≥εy+.003，過渡區即使強度足夠仍未通過');
 add('彎矩合力与容量','Mn=-(Cc a/2+ΣMi)/100000；φMn=φMn',`-(${r.Cc}×${r.a}/2+${r.steels.reduce((a,s)=>a+s.M,0)})/100000`,`Mn=${r.Mn}；φMn=${r.cap}`,'tf·m','實際引擎採負號，不將公式改為絕對值');
 add('最小受拉鋼筋','Asmin=max(.8√fc,14)/min(fy,5600) b d',`max(${.8*Math.sqrt(p.fc)},14)/min(${p.fy},5600)×${p.b}×${r.d}`,r.Asmin,'cm²','不採4/3豁免','9.6.1.2');
 add('梁自重與載重組合','self=(b/100)(h/100)2.4；Dtot=D+self；wu=max(1.4Dtot,1.2Dtot+1.6LL)',`${p.b}/100×${p.h}/100×2.4=${r.self}；Dtot=${p.D}+${r.self}=${r.Dtot}；候選=${1.4*r.Dtot},${1.2*r.Dtot+1.6*p.LL}`,r.wu,'tf/m',p.mode==='direct'?'內部預設計算，不加入直接Mu/Vu':'兩候選採最大值');
 add('設計內力',p.mode==='udl'?'Mu=wu L²/8；Vu=wu L/2':'Mu/Vu直接輸入',p.mode==='udl'?`${r.wu}×${p.L}²/8；${r.wu}×${p.L}/2`:`${p.Mu},${p.Vu}`,`Mu=${r.Mu}；Vu=${r.Vu}`,'tf·m／tf');
 add('箍筋表與最小量','Av=肢數Ai；Avmin=max(.2√fc,3.5)b s/fyt',`#${p.stir}表a=${BARS[p.stir].a}；Av=${p.legs}×${BARS[p.stir].a}；max(${.2*Math.sqrt(p.fc)},3.5)×${p.b}×${p.s}/${p.fyt}`,`Av=${r.Av}；Avmin=${r.Avmin}`,'cm²','全段配置，不採豁免','9.6.3.4；BARS #'+p.stir+'列a欄');
 add('剪力混凝土分支','λs=min(1,√(2/(1+d/25)))；ρ=As/(bd)；Av≥Avmin採.53，否则min(1.33,2.12λsρ^(1/3))',`λs=${r.lambdaS},ρ=${r.rho}；Av≥Avmin=${r.Av>=r.Avmin}；係數=${r.Av>=r.Avmin?.53:Math.min(1.33,2.12*r.lambdaS*Math.cbrt(r.rho))}；Vc=係數√${p.fc}×${p.b}×${r.d}/1000`,r.Vc,'tf');
 add('剪力箍筋及上限','Vs=Av fyt d/s/1000；Vsreq=max(0,Vu/.75-Vc)；Vmax=.75(Vc+2.12√fc b d/1000)',`${r.Av}×${p.fyt}×${r.d}/${p.s}/1000；Vsreq=max(0,${r.Vu}/.75-${r.Vc})`,`Vs=${r.Vs},Vsreq=${r.Vsreq},Vmax=${r.Vmax}`,'tf');
 add('剪力容量最小候選','Vcap=min(.75(Vc+Vs),Vmax)',`min(${.75*(r.Vc+r.Vs)},${r.Vmax})`,r.Vcap,'tf');
 add('高剪力與間距控制','high=Vs>1.06√fc b d/1000；smax=min(high?d/4:d/2,high?30:60)；肢距寬限=min(high?d/2:d,high?30:60)',`${r.Vs}>${1.06*Math.sqrt(p.fc)*p.b*r.d/1000}；high=${v.high}`,`smax=${r.smax}；寬限=${r.widthMax}；實際肢距=${r.legSpace}`,'cm','肢距=(b-2cover-dt)/(legs-1)；假設等距有效肢');
 add('建議箍筋間距三候選','srec=min(smax,sminMax,sStrength)',`min(${r.smax},${v.sminMax},${String(v.sStrength)})`,r.sRecommend,'cm','最小量候選=Av fyt/[max(.2√fc,3.5)b]；強度候選=Av fyt d/(Vsreq1000)，Vsreq=0取Infinity；不取整，改間距須重算');
 add('筋排垂直淨距','gap=yi+1-yi-(dbi+dbi+1)/2；需求=max(2.5,4dagg/3)',`排序y=${v.sorted.map(s=>s.y)}；各gap=${v.gaps}`,String(v.gapMin),'cm',`最低=${Math.max(2.5,4*p.agg/3)}；單排Infinity；另須上下對齊`);
 add('開裂材料與慣性矩','Ec=12000√fc；n=Es/Ec；Ig=bh³/12；Mcr=2√fc Ig/(h/2)/100000',`Ec=${r.Ec},n=${r.n},Ig=${r.Ig}`,r.Mcr,'tf·m',p.mode==='direct'?'内部预設服务性，仅供溯源；不作本次撓度判定':'常重混凝土服務性');
 add('開裂中性軸100次求解','bk²/2+Σ(壓區?n-1:n)Ai(k-zi)=0',v.crackHistory.map(z=>`i=${z.i},lo=${z.lo},hi=${z.hi},k=${z.c},F=${z.f},更新=${z.branch}`).join('\n'),r.kd,'cm');
 add('開裂慣性矩','Icr=bk³/3+Σni Ai(zi-k)²',`${p.b}×${r.kd}³/3；各筋項=${r.rows.map(s=>(s.z<r.kd?r.n-1:r.n)*s.A*(s.z-r.kd)**2)}`,r.Icr,'cm⁴','壓區ni=n-1，拉區ni=n');
 v.serviceRuns.forEach((run,i)=>add('服務載重實際計算 '+(i+1),'Ma=w L²/8；Ie=Ma≤2Mcr/3?Ig:min(Ig,Icr/[1-(2Mcr/(3Ma))²(1-Icr/Ig)])；δ=5(w×10)(L×100)^4/(384EcIe)',`w=${run.w} tf/m；Ma=${run.M}；門檻=${2*r.Mcr/3}；Ie=${run.Ie}；5×(${run.w}×10)×(${p.L}×100)^4/(384×${r.Ec}×${run.Ie})`,run.delta,'cm',p.mode==='direct'?'內部預設，不作直接模式通過判定':'D、D+L、D+持續活載分别求Ie，未共用單一慣性矩'));
 add('持續載重與依時撓度','λΔ=ξ/(1+50Asc/(bd))；δlong=λΔδsus；δafter=δLL+δlong',`Asc=${v.Asc}；${p.xi}/(1+50×${v.Asc}/(${p.b}×${r.d}))；δLL=${r.deltaDL}-${r.deltaD}`,`λΔ=${r.lambdaD},δlong=${r.deltaLong},δafter=${r.deltaAfter}`,'cm',p.mode==='direct'?'沒有本次撓度判定':'保守計全部依時量；限L/360及L/defLimit');
 r.checks.forEach(c=>add('判定 '+c.name,c.value.text||'实际與界限比較',JSON.stringify(c.value),c.ok?'通過':'未通過','', '沿用原邊界容差；不對引擎中間值取整',c.clause));
 add('適用範圍','Ln×100>4h；h≤90cm否則側面筋待核',`${p.Ln}×100>${4*p.h}；h=${p.h}`,r.scopeIssues.length?r.scopeIssues.join('；'):'所列範圍無警示','','一般矩形純彎；不含耐震梁端、軸力、扭力與錨定');return t;}

if(typeof module!=='undefined')module.exports={BARS,DEFAULT,analyze,suggest,displaced};

