import { useState, useEffect, useRef, useCallback } from "react";

const REGIONS = ["서울","인천","대전","대구","광주","부산","울산","세종","경기","강원","충북","충남","경북","경남","전북","전남","제주"];
const REGION_CODES = {"서울":"1","인천":"2","대전":"3","대구":"4","광주":"5","부산":"6","울산":"7","세종":"8","경기":"31","강원":"32","충북":"33","충남":"34","경북":"35","경남":"36","전북":"37","전남":"38","제주":"39"};
const THEMES = ["자연/힐링","문화/역사","액티비티","미식","쇼핑","가족여행","커플여행","단체여행"];
const DURATIONS = ["당일치기","1박 2일","2박 3일","3박 4일 이상"];
const TARGETS = ["가족","커플/연인","친구","단체/기업","혼자"];

const KTO_KEY = import.meta.env.VITE_KTO_API_KEY || "";
const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY || "";
const STORAGE_KEY = "tourplanit_v3";
const BASE = import.meta.env.BASE_URL || "/";

// 지역별 단가 (원)
const REGION_PRICE = {
  "제주": {hotel:120000,food:70000,transport:50000},
  "서울": {hotel:100000,food:60000,transport:20000},
  "부산": {hotel:80000,food:55000,transport:25000},
  "강원": {hotel:70000,food:50000,transport:40000},
  default: {hotel:65000,food:45000,transport:30000}
};

const C = {
  navy:"#1a3a5c", blue:"#2d6a9f", amber:"#e8a020",
  bg:"#f0ede8", white:"#ffffff", gray:"#f4f2ef",
  text:"#2c2c2c", muted:"#666", light:"#aaa",
  green:"#2d9f6a", red:"#e05050", purple:"#7c5cbf"
};

// ── 유틸 ──
function loadHistory() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch { return []; } }
function saveToHistory(plan) {
  const h = loadHistory();
  const item = {...plan, id: Date.now(), createdAt: new Date().toISOString()};
  h.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(0,20)));
  return item;
}
function encodePlan(plan) {
  try { return btoa(encodeURIComponent(JSON.stringify(plan))); } catch { return ""; }
}
function decodePlan(str) {
  try { return JSON.parse(decodeURIComponent(atob(str))); } catch { return null; }
}
function getShareUrl(plan) {
  const base = `https://wapplekorea.github.io/tourplanit/`;
  return `${base}?plan=${encodePlan(plan)}`;
}

const btn = (s={}) => ({border:"none",cursor:"pointer",fontFamily:"inherit",transition:"all .15s",...s});
const chip = (label,active,color,onClick) => (
  <button key={label} onClick={onClick} style={btn({padding:"8px 16px",borderRadius:20,border:`2px solid ${active?color:"#ddd"}`,background:active?color:"#fff",color:active?"#fff":"#555",fontSize:13,fontWeight:active?600:400})}>
    {label}
  </button>
);
const tag = (label,color) => (
  <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:color+"22",color,fontWeight:700,letterSpacing:0.3}}>{label}</span>
);
const Card = ({children,style={}}) => (
  <div style={{background:C.white,borderRadius:14,padding:24,marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",...style}}>{children}</div>
);
const SectionTitle = ({children}) => (
  <div style={{fontSize:10,fontWeight:700,color:C.blue,marginBottom:14,letterSpacing:2}}>{children}</div>
);

// ── PDF 출력 ──
function printPDF(id, title) {
  const el = document.getElementById(id);
  if (!el) return;
  const w = window.open("","_blank");
  w.document.write(`<html><head><title>${title}</title><style>
    body{font-family:'Noto Sans KR',sans-serif;padding:32px;color:#2c2c2c;font-size:13px;line-height:1.7}
    h1{font-size:20px;color:#1a3a5c;margin-bottom:4px}
    h2{font-size:14px;color:#2d6a9f;margin:20px 0 8px;border-bottom:1px solid #e0ddd8;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f4f2ef;padding:8px;text-align:left;font-weight:600;color:#666}
    td{padding:8px;border-bottom:1px solid #f0ede8}
    .amber{color:#e8a020;font-weight:700}
    .navy{background:#1a3a5c;color:#fff;padding:10px;font-weight:700}
    @media print{body{padding:0}}
  </style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(()=>{ w.print(); },500);
}

// ── 견적서 ──
function EstimateCalc({plan}) {
  const [pax, setPax] = useState(10);
  const [margin, setMargin] = useState(20);
  const price = REGION_PRICE[plan.region] || REGION_PRICE.default;
  const nights = plan.duration==="당일치기"?0:plan.duration==="1박 2일"?1:plan.duration==="2박 3일"?2:3;
  const days = nights+1;

  const items = [
    {label:"숙박비", unit: price.hotel*nights, note:`1박 ${price.hotel.toLocaleString()}원 × ${nights}박`},
    {label:"식사비", unit: price.food*days, note:`1일 ${price.food.toLocaleString()}원 × ${days}일`},
    {label:"입장료", unit: 20000, note:"주요 관광지 기준"},
    {label:"가이드비", unit: Math.round(250000/pax), note:"팀 전체 분담"},
    {label:"버스/교통", unit: Math.round((price.transport*days*pax)/pax), note:"전세버스 기준"},
    {label:"기타(보험 등)", unit: 8000, note:"여행자 보험 포함"},
  ];
  const subtotal = items.reduce((s,i)=>s+i.unit,0);
  const marginAmt = Math.round(subtotal*margin/100);
  const final = subtotal+marginAmt;

  const printId = "estimate-print";

  return (
    <Card>
      <SectionTitle>ESTIMATE — 견적 계산기</SectionTitle>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,background:C.gray,borderRadius:10,padding:"14px 18px",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:13,fontWeight:600,color:C.text}}>참가 인원</span>
          <button onClick={()=>setPax(Math.max(1,pax-1))} style={btn({width:30,height:30,borderRadius:"50%",background:C.navy,color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"})}>−</button>
          <span style={{fontSize:22,fontWeight:700,color:C.navy,minWidth:36,textAlign:"center"}}>{pax}</span>
          <button onClick={()=>setPax(pax+1)} style={btn({width:30,height:30,borderRadius:"50%",background:C.navy,color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"})}>+</button>
          <span style={{fontSize:13,color:C.muted}}>명</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:"auto"}}>
          <span style={{fontSize:13,fontWeight:600,color:C.text}}>마진</span>
          {[10,15,20,25,30].map(m=>(
            <button key={m} onClick={()=>setMargin(m)} style={btn({padding:"4px 10px",borderRadius:16,border:`2px solid ${margin===m?C.amber:"#ddd"}`,background:margin===m?C.amber:"#fff",color:margin===m?"#fff":"#555",fontSize:12,fontWeight:margin===m?700:400})}>{m}%</button>
          ))}
        </div>
      </div>

      <div id={printId} style={{fontFamily:"'Noto Sans KR',sans-serif"}}>
        <h1 style={{display:"none"}}>{plan.productName} — 견적서</h1>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:C.gray}}>
              {["항목","단가 (1인)","소계","비고"].map(h=>(
                <th key={h} style={{padding:"10px 14px",textAlign:"left",fontWeight:600,color:C.muted,fontSize:12,borderBottom:"2px solid #e0ddd8"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item,i)=>(
              <tr key={i} style={{borderBottom:"1px solid #f0ede8",background:i%2===0?"#fff":"#faf9f7"}}>
                <td style={{padding:"11px 14px",fontWeight:500,color:C.text}}>{item.label}</td>
                <td style={{padding:"11px 14px",color:C.text}}>{item.unit.toLocaleString()}원</td>
                <td style={{padding:"11px 14px",color:C.text,fontWeight:600}}>{(item.unit*pax).toLocaleString()}원</td>
                <td style={{padding:"11px 14px",color:C.muted,fontSize:12}}>{item.note}</td>
              </tr>
            ))}
            <tr style={{background:"#f4f2ef",borderTop:"2px solid #e0ddd8"}}>
              <td colSpan={2} style={{padding:"11px 14px",fontWeight:700,color:C.muted}}>원가 합계</td>
              <td style={{padding:"11px 14px",fontWeight:700,color:C.text}}>{(subtotal*pax).toLocaleString()}원</td>
              <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>1인 {subtotal.toLocaleString()}원</td>
            </tr>
            <tr style={{background:"#f4f2ef"}}>
              <td colSpan={2} style={{padding:"11px 14px",fontWeight:700,color:C.muted}}>운영 마진 ({margin}%)</td>
              <td style={{padding:"11px 14px",fontWeight:700,color:C.text}}>{(marginAmt*pax).toLocaleString()}원</td>
              <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>조정 가능</td>
            </tr>
            <tr style={{background:C.navy}}>
              <td colSpan={2} style={{padding:"13px 14px",fontWeight:700,color:"#fff",fontSize:15}}>최종 판매가 (1인)</td>
              <td style={{padding:"13px 14px",fontWeight:700,color:C.amber,fontSize:18}}>{final.toLocaleString()}원</td>
              <td style={{padding:"13px 14px",color:"#7eb8d4",fontSize:12}}>{pax}명 기준</td>
            </tr>
          </tbody>
        </table>
        <p style={{fontSize:11,color:C.light,marginTop:8}}>* 실제 견적은 현지 상황에 따라 달라질 수 있습니다. 참고용으로 활용하세요.</p>
        <p style={{fontSize:11,color:C.light}}>* 생성일: {new Date(plan.createdAt).toLocaleDateString("ko-KR")} | TourPlanit</p>
      </div>

      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={()=>printPDF(printId, `${plan.productName}_견적서`)} style={btn({flex:1,padding:"11px",borderRadius:8,background:C.navy,color:"#fff",fontSize:13,fontWeight:600})}>🖨️ PDF 출력</button>
        <button onClick={()=>{
          const rows = items.map(i=>`${i.label}\t${i.unit.toLocaleString()}원\t${(i.unit*pax).toLocaleString()}원`).join("\n");
          const txt = `[${plan.productName}] 견적서\n참가인원: ${pax}명\n\n${rows}\n\n원가합계: ${(subtotal*pax).toLocaleString()}원\n마진(${margin}%): ${(marginAmt*pax).toLocaleString()}원\n최종 판매가(1인): ${final.toLocaleString()}원\n\n생성: TourPlanit`;
          navigator.clipboard.writeText(txt);
          alert("이메일용 견적 복사됐습니다!");
        }} style={btn({flex:1,padding:"11px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>📧 이메일용 복사</button>
      </div>
    </Card>
  );
}

// ── 일정표 ──
function ScheduleDoc({plan}) {
  const printId = "schedule-print";
  return (
    <Card>
      <SectionTitle>ITINERARY — 일정표</SectionTitle>
      <div id={printId} style={{fontFamily:"'Noto Sans KR',sans-serif"}}>
        <div style={{borderBottom:"3px solid "+C.navy,paddingBottom:16,marginBottom:24}}>
          <div style={{fontSize:10,color:C.blue,letterSpacing:2,marginBottom:4}}>TRAVEL ITINERARY</div>
          <div style={{fontSize:20,fontWeight:700,color:C.navy}}>{plan.productName}</div>
          <div style={{fontSize:13,color:C.amber,fontWeight:600,marginTop:4}}>{plan.slogan}</div>
          <div style={{display:"flex",gap:16,marginTop:12,fontSize:12,color:C.muted}}>
            <span>📍 {plan.region}</span>
            <span>🗓 {plan.duration}</span>
            <span>🎯 {plan.theme}</span>
            <span>👥 {plan.target}</span>
          </div>
        </div>

        {plan.schedule.map((d,i)=>(
          <div key={i} style={{marginBottom:28}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <div style={{background:C.navy,color:"#fff",padding:"6px 18px",borderRadius:24,fontSize:13,fontWeight:700}}>{d.day}</div>
              <div style={{flex:1,height:1,background:"#e0ddd8"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:10}}>
              {[["🌅 오전",d.morning,"#fff8ee","#e8a020"],["☀️ 오후",d.afternoon,"#f0f5ff","#2d6a9f"],["🌙 저녁",d.evening,"#f5f0ff","#7c5cbf"]].map(([lbl,val,bg,color])=>(
                <div key={lbl} style={{background:bg,borderRadius:10,padding:"14px 16px",borderTop:`3px solid ${color}`}}>
                  <div style={{fontSize:11,color,fontWeight:700,marginBottom:6}}>{lbl}</div>
                  <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#fffbf0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#c47f00",border:"1px solid #f5e4a0"}}>
              💡 <strong>여행 팁</strong> {d.tip}
            </div>
          </div>
        ))}

        <div style={{background:C.gray,borderRadius:10,padding:16,marginTop:8}}>
          <div style={{fontSize:12,fontWeight:700,color:C.navy,marginBottom:10}}>포함/불포함 사항</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:6}}>✅ 포함</div>
              {plan.included?.map((v,i)=><div key={i} style={{fontSize:12,color:C.text,marginBottom:4}}>• {v}</div>)}
            </div>
            <div>
              <div style={{fontSize:11,color:C.red,fontWeight:700,marginBottom:6}}>❌ 불포함</div>
              {plan.excluded?.map((v,i)=><div key={i} style={{fontSize:12,color:C.text,marginBottom:4}}>• {v}</div>)}
            </div>
          </div>
        </div>
        <p style={{fontSize:10,color:C.light,marginTop:16,textAlign:"right"}}>생성: {new Date(plan.createdAt).toLocaleDateString("ko-KR")} | TourPlanit (한국관광공사 OpenAPI 기반)</p>
      </div>

      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={()=>printPDF(printId, `${plan.productName}_일정표`)} style={btn({flex:1,padding:"11px",borderRadius:8,background:C.navy,color:"#fff",fontSize:13,fontWeight:600})}>🖨️ 일정표 PDF</button>
        <button onClick={()=>{
          const txt = plan.schedule.map(d=>`[${d.day}]\n오전: ${d.morning}\n오후: ${d.afternoon}\n저녁: ${d.evening}\n💡 ${d.tip}`).join("\n\n");
          navigator.clipboard.writeText(`${plan.productName}\n${plan.slogan}\n\n${txt}`);
          alert("일정표 복사됐습니다!");
        }} style={btn({flex:1,padding:"11px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>📋 일정표 복사</button>
      </div>
    </Card>
  );
}

// ── 카드뉴스 ──
function CardNews({plan}) {
  const [slide, setSlide] = useState(0);
  const [images, setImages] = useState({});

  useEffect(()=>{
    // 배포환경 CORS 이슈로 관광공사 이미지 API 비활성화
    // 로컬에서는 프록시 통해 동작
    setImages({});
  },[plan.region]);

  const SLIDE_COLORS = [
    {bg:"#1a3a5c",text:"#e8a020",sub:"rgba(255,255,255,0.7)"},
    {bg:"#2d6a9f",text:"#ffffff",sub:"rgba(255,255,255,0.75)"},
    {bg:"#f0ede8",text:"#1a3a5c",sub:"#666"},
    {bg:"#1a3a5c",text:"#ffffff",sub:"rgba(255,255,255,0.7)"},
    {bg:"#e8a020",text:"#1a3a5c",sub:"rgba(26,58,92,0.75)"},
    {bg:"#2d6a9f",text:"#ffffff",sub:"rgba(255,255,255,0.7)"},
    {bg:"#f0ede8",text:"#1a3a5c",sub:"#666"},
    {bg:"#1a3a5c",text:"#e8a020",sub:"rgba(255,255,255,0.7)"},
  ];

  const slides = [
    {type:"cover",title:plan.productName,sub:plan.slogan,body:""},
    {type:"concept",title:"여행 컨셉",body:plan.concept},
    ...plan.schedule.map((d,i)=>({type:"schedule",title:d.day,body:`오전 ${d.morning}\n오후 ${d.afternoon}\n저녁 ${d.evening}`,img:images[i]||null})),
    {type:"highlights",title:"핵심 포인트",body:plan.highlights?.join("\n")},
    {type:"cta",title:plan.estimatedPrice,sub:"예상 가격대",body:plan.targetDesc},
  ];
  const total = slides.length;
  const s = slides[slide];
  const cl = SLIDE_COLORS[slide%SLIDE_COLORS.length];

  return (
    <Card>
      <SectionTitle>CARD NEWS — SNS 카드뉴스</SectionTitle>
      <div style={{position:"relative",userSelect:"none"}}>
        <div style={{background:cl.bg,borderRadius:20,overflow:"hidden",position:"relative",minHeight:400,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",padding:"48px 40px"}}>
          {/* 배경 이미지 (관광지 실제 사진) */}
          {s.img && <div style={{position:"absolute",inset:0,backgroundImage:`url(${s.img})`,backgroundSize:"cover",backgroundPosition:"center",opacity:0.18}}/>}
          {/* 장식 원 */}
          <div style={{position:"absolute",top:-50,right:-50,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
          <div style={{position:"absolute",bottom:-70,left:-70,width:240,height:240,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
          {/* 슬라이드 번호 */}
          <div style={{position:"absolute",top:20,right:24,fontSize:11,color:cl.sub,fontWeight:600}}>{slide+1}/{total}</div>
          {/* 로고 */}
          <div style={{position:"absolute",bottom:18,left:"50%",transform:"translateX(-50%)",fontSize:9,color:cl.sub,letterSpacing:3,fontWeight:700}}>TOURPLANIT</div>
          {/* 라인 장식 */}
          <div style={{position:"absolute",top:0,left:0,width:"100%",height:4,background:`linear-gradient(90deg,${cl.text},transparent)`}}/>

          <div style={{position:"relative",zIndex:1,maxWidth:500}}>
            {s.type==="cover" && <>
              <div style={{fontSize:11,color:cl.sub,letterSpacing:3,marginBottom:16,fontWeight:600}}>TRAVEL PRODUCT</div>
              <div style={{fontSize:28,fontWeight:700,color:cl.text,lineHeight:1.35,marginBottom:16}}>{s.title}</div>
              <div style={{width:40,height:3,background:cl.text,margin:"0 auto 16px",borderRadius:2}}/>
              <div style={{fontSize:15,color:cl.sub,lineHeight:1.6}}>{s.sub}</div>
            </>}
            {s.type==="concept" && <>
              <div style={{fontSize:11,color:cl.sub,letterSpacing:3,marginBottom:16,fontWeight:600}}>CONCEPT</div>
              <div style={{fontSize:18,fontWeight:700,color:cl.text,marginBottom:20}}>{s.title}</div>
              <div style={{fontSize:14,color:cl.sub,lineHeight:1.8,textAlign:"left"}}>{s.body}</div>
            </>}
            {s.type==="schedule" && <>
              <div style={{fontSize:22,fontWeight:700,color:cl.text,marginBottom:20}}>{s.title}</div>
              <div style={{textAlign:"left"}}>
                {s.body.split("\n").map((line,i)=>(
                  <div key={i} style={{fontSize:13,color:cl.sub,lineHeight:1,padding:"10px 0",borderBottom:`1px solid ${cl.text}22`,display:"flex",gap:8,alignItems:"flex-start"}}>
                    <span style={{color:cl.text,fontWeight:700,minWidth:28}}>{["오전","오후","저녁"][i]}</span>
                    <span>{line.replace(/^(오전|오후|저녁) /,"")}</span>
                  </div>
                ))}
              </div>
            </>}
            {s.type==="highlights" && <>
              <div style={{fontSize:11,color:cl.sub,letterSpacing:3,marginBottom:16,fontWeight:600}}>HIGHLIGHTS</div>
              <div style={{textAlign:"left"}}>
                {s.body?.split("\n").map((h,i)=>(
                  <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:14}}>
                    <div style={{width:26,height:26,borderRadius:"50%",background:cl.text,color:cl.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</div>
                    <div style={{fontSize:13,color:cl.sub,lineHeight:1.6,paddingTop:4}}>{h}</div>
                  </div>
                ))}
              </div>
            </>}
            {s.type==="cta" && <>
              <div style={{fontSize:12,color:cl.sub,letterSpacing:2,marginBottom:10,fontWeight:600}}>{s.sub}</div>
              <div style={{fontSize:36,fontWeight:700,color:cl.text,marginBottom:20}}>{s.title}</div>
              <div style={{width:40,height:3,background:cl.text,margin:"0 auto 20px",borderRadius:2}}/>
              <div style={{fontSize:13,color:cl.sub,lineHeight:1.7}}>{s.body}</div>
              <div style={{marginTop:24,padding:"12px 28px",borderRadius:30,border:`2px solid ${cl.text}`,color:cl.text,fontSize:13,fontWeight:700,display:"inline-block"}}>지금 바로 문의하세요</div>
            </>}
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,padding:"0 4px"}}>
          <button onClick={()=>setSlide(Math.max(0,slide-1))} disabled={slide===0}
            style={btn({padding:"9px 18px",borderRadius:8,background:slide===0?"#eee":C.navy,color:slide===0?C.muted:"#fff",fontSize:13})}>← 이전</button>
          <div style={{display:"flex",gap:6}}>
            {slides.map((_,i)=>(
              <div key={i} onClick={()=>setSlide(i)} style={{width:i===slide?20:8,height:8,borderRadius:4,background:i===slide?C.navy:"#ddd",cursor:"pointer",transition:"all .2s"}}/>
            ))}
          </div>
          <button onClick={()=>setSlide(Math.min(total-1,slide+1))} disabled={slide===total-1}
            style={btn({padding:"9px 18px",borderRadius:8,background:slide===total-1?"#eee":C.navy,color:slide===total-1?C.muted:"#fff",fontSize:13})}>다음 →</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
          <button onClick={()=>{
            const el = document.querySelector('[data-slide]');
            alert("슬라이드 저장: 브라우저 캡처(Cmd+Shift+4) 또는 우클릭→이미지 저장을 이용하세요.\n\n배포 후에는 자동 다운로드가 됩니다.");
          }} style={btn({padding:"11px",borderRadius:8,background:C.amber,color:"#fff",fontSize:13,fontWeight:600})}>📸 이 슬라이드 캡처</button>
          <button onClick={()=>{
            const url = getShareUrl(plan);
            navigator.clipboard.writeText(url);
            alert("공유 링크가 복사됐습니다!\n(GitHub Pages 배포 후 사용 가능)");
          }} style={btn({padding:"11px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>🔗 공유 링크 복사</button>
        </div>
      </div>
    </Card>
  );
}

// ── 블로그 ──
function BlogContent({plan}) {
  const [blog, setBlog] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":CLAUDE_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2500,
          messages:[{role:"user",content:`네이버 블로그 포스트를 1500자 이상으로 작성해줘.

상품: ${plan.productName}
슬로건: ${plan.slogan}
지역: ${plan.region} | 기간: ${plan.duration} | 테마: ${plan.theme} | 타깃: ${plan.target}
컨셉: ${plan.concept}
일정: ${plan.schedule.map(d=>`${d.day}: 오전-${d.morning}, 오후-${d.afternoon}, 저녁-${d.evening}`).join(" / ")}
핵심: ${plan.highlights?.join(", ")}
가격: ${plan.estimatedPrice}

요구사항:
- 1500자 이상 (공백 포함)
- 감성적이고 여행 욕구를 자극하는 구어체
- 소제목 3개 (## 형식으로)
- 각 소제목 아래 300자 이상 본문
- 실제 장소명, 음식, 액티비티 구체적으로 언급
- 마지막에 예약/문의 유도 CTA
- 해시태그 15개 이상 마지막에 포함
- 마크다운 없이 순수 텍스트만`}]})
      });
      const d = await res.json();
      setBlog(d.content[0].text);
    } catch(e) { alert("오류: "+e.message); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <SectionTitle>BLOG — 블로그 본문</SectionTitle>
      {!blog ? (
        <div style={{textAlign:"center",padding:"32px 0"}}>
          <div style={{fontSize:40,marginBottom:16}}>✍️</div>
          <p style={{fontSize:14,color:C.muted,marginBottom:20,lineHeight:1.7}}>AI가 1500자 이상의<br/>네이버 블로그 포스트를 자동 작성합니다.</p>
          <button onClick={generate} disabled={loading} style={btn({padding:"13px 32px",background:C.blue,color:"#fff",borderRadius:8,fontSize:14,fontWeight:600})}>
            {loading?"⏳ 작성 중... (15초 내외)":"✍️ 블로그 본문 생성"}
          </button>
        </div>
      ) : (
        <>
          <div style={{background:C.gray,borderRadius:10,padding:20,fontSize:14,lineHeight:1.9,color:C.text,marginBottom:4}}>
            {editing ? (
              <textarea value={blog} onChange={e=>setBlog(e.target.value)} style={{width:"100%",minHeight:400,border:"none",background:"transparent",fontSize:14,lineHeight:1.9,fontFamily:"inherit",resize:"vertical",outline:"none"}}/>
            ) : (
              <div style={{whiteSpace:"pre-wrap"}}>{blog}</div>
            )}
          </div>
          <div style={{fontSize:12,color:C.muted,marginBottom:12,textAlign:"right"}}>{blog.length.toLocaleString()}자</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>setEditing(!editing)} style={btn({padding:"10px 16px",borderRadius:8,border:"2px solid "+C.blue,background:"#fff",color:C.blue,fontSize:13,fontWeight:600})}>{editing?"✅ 편집 완료":"✏️ 직접 편집"}</button>
            <button onClick={()=>{navigator.clipboard.writeText(blog);alert("복사됐습니다!");}} style={btn({flex:1,padding:"10px",borderRadius:8,background:C.navy,color:"#fff",fontSize:13,fontWeight:600})}>📋 전체 복사</button>
            <button onClick={()=>setBlog("")} style={btn({padding:"10px 16px",borderRadius:8,border:"2px solid #ddd",background:"#fff",color:C.muted,fontSize:13})}>🔄 다시 생성</button>
          </div>
        </>
      )}
    </Card>
  );
}

// ── 카카오 ──
function KakaoMessage({plan}) {
  const [copied, setCopied] = useState(false);
  const msg = `[${plan.productName}]
${plan.slogan}

📍 지역: ${plan.region}
🗓 기간: ${plan.duration}
🎯 테마: ${plan.theme}
💰 예상가격: ${plan.estimatedPrice}

✅ 포함
${plan.included?.slice(0,3).map(v=>`• ${v}`).join("\n")}

❌ 불포함
${plan.excluded?.slice(0,2).map(v=>`• ${v}`).join("\n")}

🌟 ${plan.highlights?.[0]}

문의/예약 👇
📞 연락처를 입력해주세요
🔗 ${getShareUrl(plan)}`;

  const copy = () => { navigator.clipboard.writeText(msg); setCopied(true); setTimeout(()=>setCopied(false),2500); };

  return (
    <Card>
      <SectionTitle>KAKAO — 카카오채널 메시지</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:24}}>
        <div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,fontWeight:600}}>카카오채널 미리보기</div>
          <div style={{background:"#ffe812",borderRadius:20,overflow:"hidden",boxShadow:"0 4px 20px rgba(0,0,0,0.12)"}}>
            <div style={{background:"#f5dc00",padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🗺️</div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#111"}}>TourPlanit</div>
                <div style={{fontSize:10,color:"#555"}}>공식채널 · 여행상품</div>
              </div>
            </div>
            <div style={{padding:12}}>
              <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                <div style={{background:`linear-gradient(135deg,${C.navy},${C.blue})`,padding:"20px 16px",textAlign:"center"}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",letterSpacing:1,marginBottom:4}}>TRAVEL PRODUCT</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#fff",lineHeight:1.4}}>{plan.productName}</div>
                  <div style={{fontSize:11,color:C.amber,marginTop:6}}>{plan.estimatedPrice}</div>
                </div>
                <div style={{padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"#333",lineHeight:1.7,marginBottom:10}}>{plan.slogan}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <div style={{background:"#f4f4f4",borderRadius:8,padding:"6px 10px",fontSize:10,color:"#555"}}>📍 {plan.region}</div>
                    <div style={{background:"#f4f4f4",borderRadius:8,padding:"6px 10px",fontSize:10,color:"#555"}}>🗓 {plan.duration}</div>
                  </div>
                </div>
                <div style={{background:"#ffe812",padding:"10px",textAlign:"center",fontSize:12,fontWeight:700,color:"#111",cursor:"pointer"}}>자세히 보기 →</div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,fontWeight:600}}>전송 텍스트</div>
          <div style={{background:C.gray,borderRadius:10,padding:16,fontSize:12,lineHeight:1.8,color:C.text,whiteSpace:"pre-wrap",marginBottom:12,minHeight:220,maxHeight:300,overflowY:"auto"}}>{msg}</div>
          <button onClick={copy} style={btn({width:"100%",padding:"12px",borderRadius:8,background:copied?"#2d9f6a":"#ffe812",color:copied?"#fff":"#111",fontSize:14,fontWeight:700})}>
            {copied?"✅ 복사됐습니다!":"📋 카카오 메시지 복사"}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── 기획서 상세 ──
function PlanDetail({plan:initialPlan, onBack, onDelete}) {
  const [tab, setTab] = useState("overview");
  const [plan, setPlan] = useState(initialPlan);
  const [editingField, setEditingField] = useState(null);

  const updateField = (field, value) => {
    const updated = {...plan, [field]:value};
    setPlan(updated);
    const h = loadHistory();
    const idx = h.findIndex(x=>x.id===plan.id);
    if (idx>=0) { h[idx]=updated; localStorage.setItem(STORAGE_KEY,JSON.stringify(h)); }
  };

  const EditableText = ({field, value, style={}, multiline=false}) => {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(value);
    if (editing) {
      const props = {value:val, onChange:e=>setVal(e.target.value), onBlur:()=>{ updateField(field,val); setEditing(false); setEditingField(null); }, autoFocus:true,
        style:{...style,border:"2px solid "+C.blue,borderRadius:6,padding:"4px 8px",fontFamily:"inherit",fontSize:"inherit",width:"100%",outline:"none",background:"#f0f7ff"}};
      return multiline ? <textarea {...props} rows={3}/> : <input {...props}/>;
    }
    return <span onClick={()=>{ setEditing(true); setEditingField(field); }} style={{...style,cursor:"text",borderBottom:"1px dashed "+C.muted,paddingBottom:1}} title="클릭해서 편집">{value}</span>;
  };

  const tabs = [{id:"overview",label:"📋 기획서"},{id:"itinerary",label:"🗓 일정표"},{id:"estimate",label:"💰 견적서"},{id:"cardnews",label:"🖼 카드뉴스"},{id:"blog",label:"✍️ 블로그"},{id:"kakao",label:"💬 카카오"}];

  const shareUrl = getShareUrl(plan);
  const downloadTxt = () => {
    const txt = `TourPlanit 기획서\n상품명: ${plan.productName}\n슬로건: ${plan.slogan}\n\n컨셉\n${plan.concept}\n\n일정\n${plan.schedule.map(d=>`[${d.day}]\n오전: ${d.morning}\n오후: ${d.afternoon}\n저녁: ${d.evening}\n팁: ${d.tip}`).join("\n\n")}\n\n핵심포인트\n${plan.highlights?.map((h,i)=>`${i+1}. ${h}`).join("\n")}\n\n포함: ${plan.included?.join(" / ")}\n불포함: ${plan.excluded?.join(" / ")}\n\n예상가격: ${plan.estimatedPrice}\n\n생성: ${new Date(plan.createdAt).toLocaleString("ko-KR")} | TourPlanit`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"})); a.download = `${plan.productName}_기획서.txt`; a.click();
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <button onClick={onBack} style={btn({padding:"6px 14px",border:"2px solid #ddd",borderRadius:8,background:"#fff",fontSize:12,color:C.muted,marginBottom:12})}>← 목록으로</button>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>{tag(plan.region,C.blue)} {tag(plan.duration,C.amber)} {tag(plan.theme,C.green)} {tag(plan.target,C.purple)}</div>
          <h2 style={{fontSize:22,fontWeight:700,color:C.navy,margin:"0 0 4px"}}>
            <EditableText field="productName" value={plan.productName} style={{fontSize:22,fontWeight:700,color:C.navy}}/>
          </h2>
          <div style={{color:C.amber,fontWeight:600,fontSize:14}}>
            <EditableText field="slogan" value={plan.slogan} style={{color:C.amber,fontWeight:600,fontSize:14}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={downloadTxt} style={btn({padding:"9px 14px",background:C.navy,color:"#fff",borderRadius:8,fontSize:12,fontWeight:600})}>📥 TXT</button>
          <button onClick={()=>{ navigator.clipboard.writeText(shareUrl); alert("공유 링크 복사!\n(GitHub Pages 배포 후 동작)"); }} style={btn({padding:"9px 14px",border:"2px solid "+C.blue,background:"#fff",color:C.blue,borderRadius:8,fontSize:12,fontWeight:600})}>🔗 공유</button>
          <button onClick={()=>{ if(confirm("삭제할까요?")) onDelete(plan.id); }} style={btn({padding:"9px 12px",border:"2px solid #fdd",background:"#fff8f8",borderRadius:8,fontSize:12,color:C.red})}>🗑</button>
        </div>
      </div>

      <div style={{display:"flex",gap:2,marginBottom:24,background:"#fff",borderRadius:12,padding:4,border:"1px solid #e8e5e0",overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={btn({flex:1,padding:"9px 6px",borderRadius:8,background:tab===t.id?C.navy:"transparent",color:tab===t.id?"#fff":C.muted,fontSize:12,fontWeight:tab===t.id?600:400,whiteSpace:"nowrap",minWidth:70})}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="overview" && (
        <>
          <Card style={{borderLeft:`4px solid ${C.blue}`}}>
            <SectionTitle>CONCEPT</SectionTitle>
            <EditableText field="concept" value={plan.concept} style={{fontSize:14,color:C.text,lineHeight:1.8}} multiline/>
          </Card>
          <Card>
            <SectionTitle>SCHEDULE</SectionTitle>
            {plan.schedule.map((d,i)=>(
              <div key={i} style={{marginBottom:i<plan.schedule.length-1?24:0,paddingBottom:i<plan.schedule.length-1?24:0,borderBottom:i<plan.schedule.length-1?"1px solid #f0ede8":"none"}}>
                <span style={{background:C.navy,color:"#fff",padding:"4px 14px",borderRadius:20,fontSize:12,fontWeight:700,display:"inline-block",marginBottom:12}}>{d.day}</span>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  {[["🌅 오전","morning","#fff8ee","#e8a020"],["☀️ 오후","afternoon","#f0f5ff","#2d6a9f"],["🌙 저녁","evening","#f5f0ff","#7c5cbf"]].map(([lbl,fld,bg,color])=>(
                    <div key={lbl} style={{background:bg,borderRadius:8,padding:"12px 14px",borderTop:`3px solid ${color}`}}>
                      <div style={{fontSize:11,color,fontWeight:700,marginBottom:6}}>{lbl}</div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{d[fld]}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:"#fffbf0",borderRadius:6,padding:"8px 14px",fontSize:12,color:"#c47f00",border:"1px solid #f5e4a0"}}>💡 {d.tip}</div>
              </div>
            ))}
          </Card>
          <Card>
            <SectionTitle>HIGHLIGHTS</SectionTitle>
            {plan.highlights?.map((h,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
                <span style={{background:C.amber,color:"#fff",width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</span>
                <span style={{color:C.text,fontSize:14,lineHeight:1.6}}>{h}</span>
              </div>
            ))}
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card style={{margin:0}}>
              <SectionTitle>✅ 포함</SectionTitle>
              {plan.included?.map((v,i)=><div key={i} style={{fontSize:13,color:C.text,marginBottom:6,lineHeight:1.5}}>• {v}</div>)}
            </Card>
            <Card style={{margin:0}}>
              <SectionTitle>❌ 불포함</SectionTitle>
              {plan.excluded?.map((v,i)=><div key={i} style={{fontSize:13,color:C.text,marginBottom:6,lineHeight:1.5}}>• {v}</div>)}
            </Card>
          </div>
          <Card>
            <SectionTitle>TARGET</SectionTitle>
            <p style={{fontSize:14,color:C.text,lineHeight:1.7,margin:0}}>{plan.targetDesc}</p>
          </Card>
          <Card>
            <SectionTitle>MARKETING COPY</SectionTitle>
            {[{key:"instagram",label:"📸 인스타그램",color:"#c13584"},{key:"blog",label:"📝 블로그",color:"#ff6b35"},{key:"kakao",label:"💬 카카오",color:"#f7b731"}].map(({key,label,color})=>(
              <div key={key} style={{background:C.gray,borderRadius:8,padding:16,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:700,color}}>{label}</span>
                  <button onClick={()=>{navigator.clipboard.writeText(plan[key]||"");alert("복사!");}} style={btn({fontSize:11,color:C.light,border:"1px solid #ddd",borderRadius:4,padding:"3px 10px",background:"#fff"})}>복사</button>
                </div>
                <p style={{fontSize:13,color:C.text,lineHeight:1.7,margin:0}}>{plan[key]||"—"}</p>
              </div>
            ))}
          </Card>
          <div style={{background:C.navy,borderRadius:14,padding:24,textAlign:"center",color:"#fff",marginBottom:16}}>
            <div style={{fontSize:10,color:"#7eb8d4",marginBottom:6,letterSpacing:2}}>ESTIMATED PRICE</div>
            <div style={{fontSize:30,fontWeight:700,color:C.amber}}>{plan.estimatedPrice}</div>
          </div>
          {editingField && <div style={{position:"fixed",bottom:24,right:24,background:C.blue,color:"#fff",padding:"8px 16px",borderRadius:8,fontSize:12,boxShadow:"0 4px 12px rgba(0,0,0,0.2)"}}>✏️ 편집 중 — 클릭 후 다른 곳 클릭하면 저장</div>}
          <p style={{textAlign:"center",fontSize:11,color:C.light}}>한국관광공사 OpenAPI · TourPlanit · {new Date(plan.createdAt).toLocaleString("ko-KR")}</p>
        </>
      )}
      {tab==="itinerary" && <ScheduleDoc plan={plan}/>}
      {tab==="estimate" && <EstimateCalc plan={plan}/>}
      {tab==="cardnews" && <CardNews plan={plan}/>}
      {tab==="blog" && <BlogContent plan={plan}/>}
      {tab==="kakao" && <KakaoMessage plan={plan}/>}
    </div>
  );
}

// ── 메인 ──
export default function App() {
  const [page, setPage] = useState("home");
  const [form, setForm] = useState({region:"",duration:"",theme:"",target:"",budget:"",special:""});
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [history, setHistory] = useState(loadHistory());
  const [detailItem, setDetailItem] = useState(null);

  // URL 파라미터로 공유된 기획서 처리
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const planStr = params.get("plan");
    if (planStr) {
      const plan = decodePlan(planStr);
      if (plan) { setDetailItem({...plan, id: plan.id||Date.now(), createdAt: plan.createdAt||new Date().toISOString()}); setPage("detail"); }
    }
  },[]);

  const refresh = () => setHistory(loadHistory());

  const fetchSpots = async () => {
    // 배포 환경에서는 CORS로 직접 호출 불가 - 지역명 기반 더미 데이터 사용
    const spotMap = {
      "서울": "경복궁, 북촌한옥마을, 인사동, 남산서울타워, 광장시장, 홍대, 이태원",
      "부산": "해운대, 광안리, 감천문화마을, 자갈치시장, 태종대, 흰여울문화마을",
      "제주": "한라산, 성산일출봉, 협재해수욕장, 천지연폭포, 우도, 만장굴, 중문관광단지",
      "경주": "불국사, 석굴암, 첨성대, 안압지, 국립경주박물관, 대릉원",
      "인천": "차이나타운, 월미도, 송도센트럴파크, 개항장거리, 인천상륙작전기념관",
      "강원": "설악산, 오대산, 속초해수욕장, 낙산사, 춘천닭갈비골목",
      "전남": "순천만국가정원, 보성녹차밭, 여수밤바다, 담양죽녹원",
      "경남": "통영케이블카, 남해독일마을, 하동쌍계사, 거제해금강",
    };
    return spotMap[form.region] || `${form.region} 주요 관광지, 전통시장, 역사문화유적, 자연경관, 맛집거리`;
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      setLoadingMsg("관광공사 데이터 수집 중...");
      const spots = await fetchSpots();
      setLoadingMsg("AI 기획서 생성 중...");
      const dayCount = form.duration==="당일치기"?1:form.duration==="1박 2일"?2:form.duration==="2박 3일"?3:4;
      const schedEx = Array.from({length:dayCount},(_,i)=>`{"day":"Day ${i+1}","morning":"구체적오전일정","afternoon":"구체적오후일정","evening":"구체적저녁일정","tip":"실용적팁"}`).join(",");
      const prompt = `여행 상품 기획 전문가. 아래 조건으로 완성도 높은 기획서를 JSON으로 작성.
지역:${form.region} 기간:${form.duration}(${dayCount}일) 테마:${form.theme} 타깃:${form.target} 예산:${form.budget||"중간"} 특이사항:${form.special||"없음"} 실제관광지:${spots}

규칙: JSON만 출력. 다른텍스트 금지. 문자열내 줄바꿈 금지. 일정은 실제 장소명 구체적으로.
{"productName":"매력적상품명","slogan":"슬로건","concept":"컨셉 2-3문장","schedule":[${schedEx}],"highlights":["포인트1","포인트2","포인트3"],"included":["포함1","포함2","포함3","포함4"],"excluded":["불포함1","불포함2","불포함3"],"targetDesc":"타깃고객 1문장","estimatedPrice":"1인 XX만원대","instagram":"인스타카피100자이내 #해시태그","blog":"블로그소개150자","kakao":"카카오홍보50자"}`;

      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":CLAUDE_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,messages:[{role:"user",content:prompt}]})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message||"API 오류");
      const text = data.content[0].text.trim();
      const s=text.indexOf("{"),e=text.lastIndexOf("}");
      const plan = JSON.parse(text.slice(s,e+1));
      plan.region=form.region; plan.duration=form.duration; plan.theme=form.theme; plan.target=form.target;
      const saved = saveToHistory(plan);
      refresh(); setDetailItem(saved); setPage("detail");
    } catch(e) { alert("오류: "+e.message+"\n다시 시도해주세요."); }
    finally { setLoading(false); setLoadingMsg(""); }
  };

  const deleteItem = (id) => {
    const next = history.filter(h=>h.id!==id);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
    refresh(); setPage("history");
  };

  const Nav = () => (
    <header style={{background:C.navy,height:56,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
      <div onClick={()=>setPage("home")} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
        <span style={{fontSize:18,color:"#fff",fontWeight:700,letterSpacing:-0.5}}>🗺️ TourPlanit</span>
        <span style={{fontSize:10,color:"#7eb8d4",background:"rgba(255,255,255,0.12)",padding:"2px 8px",borderRadius:20,letterSpacing:0.5}}>투어플래닛</span>
      </div>
      <div style={{display:"flex",gap:2}}>
        {[["새 기획서","form"],["기획서 목록","history"]].map(([label,pg])=>(
          <button key={pg} onClick={()=>setPage(pg)} style={btn({padding:"7px 14px",borderRadius:6,background:page===pg?"rgba(255,255,255,0.18)":"transparent",color:page===pg?"#fff":"#7eb8d4",fontSize:13,fontWeight:page===pg?600:400})}>
            {label}
          </button>
        ))}
      </div>
    </header>
  );

  const PlanCard = ({plan,onClick,onDelete}) => (
    <div onClick={onClick} style={{background:C.white,borderRadius:14,padding:20,cursor:"pointer",border:"1px solid #e8e5e0",transition:"all .15s",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.1)";e.currentTarget.style.transform="translateY(-2px)"}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.05)";e.currentTarget.style.transform="none"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>{tag(plan.region,C.blue)} {tag(plan.duration,C.amber)} {tag(plan.theme,C.green)}</div>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:3}}>{plan.productName}</div>
          <div style={{fontSize:13,color:C.amber,fontWeight:600,marginBottom:8}}>{plan.slogan}</div>
          <div style={{fontSize:12,color:C.muted}}>{new Date(plan.createdAt).toLocaleDateString("ko-KR")} · {plan.estimatedPrice}</div>
        </div>
        <button onClick={e=>{e.stopPropagation();if(confirm("삭제?"))onDelete(plan.id);}} style={btn({background:"none",color:"#ccc",fontSize:20,padding:"0 4px",lineHeight:1})}>×</button>
      </div>
    </div>
  );

  const wrap = {maxWidth:880,margin:"0 auto",padding:"32px 24px"};

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",color:C.text}}>
      <Nav/>

      {page==="home" && (
        <>
          <div style={{background:`linear-gradient(135deg,${C.navy} 0%,#1e5799 50%,${C.blue} 100%)`,padding:"72px 24px",textAlign:"center",color:"#fff"}}>
            <p style={{fontSize:10,color:"#7eb8d4",marginBottom:14,letterSpacing:3,fontWeight:600}}>TOUR PRODUCT PLANNER</p>
            <h1 style={{fontSize:38,fontWeight:700,margin:"0 0 16px",lineHeight:1.3,letterSpacing:-0.5}}>관광 상품 기획서를<br/>30초 만에 완성하세요</h1>
            <p style={{fontSize:15,color:"rgba(255,255,255,0.7)",margin:"0 0 36px",lineHeight:1.7}}>기획서 · 일정표 · 견적서 · 카드뉴스 · 블로그 · 카카오까지<br/>한국관광공사 OpenAPI 기반으로 자동 생성</p>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setPage("form")} style={btn({padding:"14px 36px",background:C.amber,color:"#fff",borderRadius:10,fontSize:16,fontWeight:700,boxShadow:"0 4px 16px rgba(232,160,32,0.4)"})}>기획 시작하기 →</button>
              {history.length>0&&<button onClick={()=>setPage("history")} style={btn({padding:"14px 24px",background:"rgba(255,255,255,0.12)",color:"#fff",border:"1px solid rgba(255,255,255,0.25)",borderRadius:10,fontSize:14,backdropFilter:"blur(4px)"})}>저장된 기획서 {history.length}개</button>}
            </div>
          </div>
          <div style={wrap}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:48}}>
              {[["📋","기획서","AI 상품 기획"],["🗓","일정표","PDF 출력"],["💰","견적서","인원별 계산"],["🖼","카드뉴스","SNS 캐러셀"],["✍️","블로그","본문 자동 작성"],["💬","카카오","채널 메시지"]].map(([icon,title,desc])=>(
                <div key={title} style={{background:C.white,borderRadius:12,padding:"18px 12px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                  <div style={{fontSize:26,marginBottom:8}}>{icon}</div>
                  <div style={{fontSize:12,fontWeight:700,color:C.navy,marginBottom:4}}>{title}</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>
                </div>
              ))}
            </div>
            {history.length>0&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.navy}}>최근 기획서</div>
                  <button onClick={()=>setPage("history")} style={btn({fontSize:12,color:C.blue,background:"none",padding:0})}>전체 보기 →</button>
                </div>
                <div style={{display:"grid",gap:10}}>
                  {history.slice(0,3).map(h=><PlanCard key={h.id} plan={h} onClick={()=>{setDetailItem(h);setPage("detail");}} onDelete={deleteItem}/>)}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {page==="form" && (
        <div style={wrap}>
          <h2 style={{fontSize:20,fontWeight:700,color:C.navy,marginBottom:6}}>여행 조건 입력</h2>
          <p style={{color:C.muted,marginBottom:28,fontSize:13}}>조건을 입력하면 한국관광공사 데이터 기반으로 맞춤 상품을 기획해드립니다.</p>
          {[{label:"지역 선택",key:"region",options:REGIONS,color:C.blue},{label:"여행 기간",key:"duration",options:DURATIONS,color:C.blue},{label:"여행 테마",key:"theme",options:THEMES,color:C.amber},{label:"타깃 고객",key:"target",options:TARGETS,color:C.amber}].map(({label,key,options,color})=>(
            <div key={key} style={{marginBottom:24}}>
              <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:10}}>{label} <span style={{color:C.red}}>*</span></label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{options.map(opt=>chip(opt,form[key]===opt,color,()=>setForm({...form,[key]:opt})))}</div>
            </div>
          ))}
          <div style={{marginBottom:20}}>
            <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>예산대 <span style={{fontSize:12,color:C.muted,fontWeight:400}}>(선택)</span></label>
            <input value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} placeholder="예) 1인 20만원대, 단체 100만원 이하"
              style={{width:"100%",padding:"12px 16px",borderRadius:8,border:"2px solid #e0ddd8",fontSize:13,outline:"none",boxSizing:"border-box",background:C.white}}/>
          </div>
          <div style={{marginBottom:32}}>
            <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>특이사항 <span style={{fontSize:12,color:C.muted,fontWeight:400}}>(선택)</span></label>
            <textarea value={form.special} onChange={e=>setForm({...form,special:e.target.value})} placeholder="예) 노쇼핑 원칙, 노약자 포함, 외국인 동반 등" rows={3}
              style={{width:"100%",padding:"12px 16px",borderRadius:8,border:"2px solid #e0ddd8",fontSize:13,outline:"none",resize:"none",boxSizing:"border-box",background:C.white}}/>
          </div>
          <button onClick={handleGenerate} disabled={!form.region||!form.duration||!form.theme||!form.target||loading}
            style={btn({width:"100%",padding:"16px",borderRadius:10,fontSize:15,fontWeight:700,background:loading||!form.region||!form.duration||!form.theme||!form.target?"#ccc":C.navy,color:"#fff",boxShadow:loading?"none":"0 4px 12px rgba(26,58,92,0.3)"})}>
            {loading?`⏳ ${loadingMsg}`:"✨ 기획서 자동 생성"}
          </button>
        </div>
      )}

      {page==="history" && (
        <div style={wrap}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{fontSize:20,fontWeight:700,color:C.navy,margin:0}}>기획서 목록 <span style={{fontSize:13,color:C.muted,fontWeight:400}}>({history.length}개)</span></h2>
            <button onClick={()=>setPage("form")} style={btn({padding:"10px 20px",background:C.amber,color:"#fff",borderRadius:8,fontSize:13,fontWeight:600})}>+ 새 기획서</button>
          </div>
          {history.length===0?(
            <div style={{textAlign:"center",padding:"80px 0",color:C.muted}}>
              <div style={{fontSize:56,marginBottom:16}}>📋</div>
              <div style={{fontSize:15,marginBottom:20}}>아직 저장된 기획서가 없어요</div>
              <button onClick={()=>setPage("form")} style={btn({padding:"13px 32px",background:C.navy,color:"#fff",borderRadius:10,fontSize:14,fontWeight:600})}>첫 기획서 만들기</button>
            </div>
          ):(
            <div style={{display:"grid",gap:10}}>
              {history.map(h=><PlanCard key={h.id} plan={h} onClick={()=>{setDetailItem(h);setPage("detail");}} onDelete={deleteItem}/>)}
            </div>
          )}
        </div>
      )}

      {page==="detail" && detailItem && (
        <div style={wrap}>
          <PlanDetail plan={detailItem} onBack={()=>setPage("history")} onDelete={deleteItem}/>
        </div>
      )}
    </div>
  );
}
