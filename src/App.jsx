import { useState, useEffect, useRef, useCallback } from "react";

const REGIONS = ["서울","인천","대전","대구","광주","부산","울산","세종","경기","강원","충북","충남","경북","경남","전북","전남","제주"];
const REGION_CODES = {"서울":"1","인천":"2","대전":"3","대구":"4","광주":"5","부산":"6","울산":"7","세종":"8","경기":"31","강원":"32","충북":"33","충남":"34","경북":"35","경남":"36","전북":"37","전남":"38","제주":"39"};
const THEMES = ["자연/힐링","문화/역사","액티비티","미식","쇼핑","가족여행","커플여행","단체여행"];
const DURATIONS = ["당일치기","1박 2일","2박 3일","3박 4일 이상"];
const TARGETS = ["가족","커플/연인","친구","단체/기업","혼자"];

const KTO_KEY = import.meta.env.VITE_KTO_API_KEY || "";
const JSONBIN_KEY = import.meta.env.VITE_JSONBIN_API_KEY || "";
const JSONBIN_BIN_URL = "https://api.jsonbin.io/v3/b";
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
  // 공통 토큰만 교체해 화면마다 다른 "템플릿" 느낌이 나지 않게 한다.
  // 기능별 색은 상태를 구분할 때에만 사용하고, 기본 위계는 중립색+브랜드 블루로 유지한다.
  navy:"#191f28", blue:"#3182f6", amber:"#f59f00",
  bg:"#f7f8fa", white:"#ffffff", gray:"#f2f4f6",
  text:"#191f28", muted:"#6b7684", light:"#8b95a1",
  green:"#12b886", red:"#f04452", purple:"#7b61ff"
};

// ── 유틸 ──
function loadHistory() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch { return []; } }
function saveToHistory(plan) {
  const h = loadHistory();
  const item = {...plan, id: Date.now(), createdAt: new Date().toISOString()};
  h.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(0,100)));
  return item;
}
function encodePlan(plan) {
  try { return btoa(encodeURIComponent(JSON.stringify(plan))); } catch { return ""; }
}
function decodePlan(str) {
  try { return JSON.parse(decodeURIComponent(atob(str))); } catch { return null; }
}
async function savePlanToCloud(plan) {
  try {
    const res = await fetch(JSONBIN_BIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_KEY,
        "X-Bin-Name": plan.productName?.slice(0,30) || "TourPlanit",
        "X-Bin-Private": "false"
      },
      body: JSON.stringify(plan)
    });
    const data = await res.json();
    return data?.metadata?.id || null;
  } catch { return null; }
}
async function loadPlanFromCloud(binId) {
  try {
    const res = await fetch(`${JSONBIN_BIN_URL}/${binId}/latest`, {
      headers: { "X-Master-Key": JSONBIN_KEY }
    });
    const data = await res.json();
    return data?.record || null;
  } catch { return null; }
}
function getShareUrl(plan) {
  const encoded = encodePlan(plan);
  return `${window.location.origin}/?share=${encoded}`;
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
      <SectionTitle>견적 초안</SectionTitle>
      <p style={{fontSize:13,color:C.muted,lineHeight:1.7,margin:"-4px 0 18px"}}>기본 단가를 바탕으로 산정한 내부 검토용 계산입니다. 실제 견적은 협력사 조건과 최종 인원에 맞춰 확인하세요.</p>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,background:"#f4f7fb",border:"1px solid #e1e8f0",borderRadius:12,padding:"14px 18px",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:13,fontWeight:600,color:C.text}}>참가 인원</span>
          <button onClick={()=>setPax(Math.max(1,pax-1))} style={btn({width:30,height:30,borderRadius:"50%",background:C.navy,color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"})}>−</button>
          <span style={{fontSize:22,fontWeight:700,color:C.navy,minWidth:36,textAlign:"center"}}>{pax}</span>
          <button onClick={()=>setPax(pax+1)} style={btn({width:30,height:30,borderRadius:"50%",background:C.navy,color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"})}>+</button>
          <span style={{fontSize:13,color:C.muted}}>명</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:"auto"}}>
          <span style={{fontSize:13,fontWeight:600,color:C.text}}>운영 기준</span>
          {[10,15,20,25,30].map(m=>(
            <button key={m} onClick={()=>setMargin(m)} style={btn({padding:"4px 10px",borderRadius:16,border:`2px solid ${margin===m?C.amber:"#ddd"}`,background:margin===m?C.amber:"#fff",color:margin===m?"#fff":"#555",fontSize:12,fontWeight:margin===m?700:400})}>{m}%</button>
          ))}
        </div>
      </div>

      <div id={printId} style={{fontFamily:"'Noto Sans KR',sans-serif"}}>
        <h1 style={{display:"none"}}>{plan.productName} — 견적서</h1>
        <div style={{overflowX:"auto",border:"1px solid #e8edf3",borderRadius:12}}>
        <table style={{width:"100%",minWidth:620,borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:C.gray}}>
              {["항목","1인 기준","총액","산정 기준"].map(h=>(
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
              <td colSpan={2} style={{padding:"11px 14px",fontWeight:700,color:C.muted}}>운영 기준 ({margin}%)</td>
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
        </div>
        <p style={{fontSize:11,color:C.light,marginTop:10}}>* 실제 견적은 현지 상황, 객실 구성, 협력사 확정 조건에 따라 달라질 수 있습니다.</p>
        <p style={{fontSize:11,color:C.light}}>* 생성일: {new Date(plan.createdAt).toLocaleDateString("ko-KR")} | TourPlanit</p>
      </div>

      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={()=>printPDF(printId, `${plan.productName}_견적서`)} style={btn({flex:1,padding:"11px",borderRadius:8,background:C.navy,color:"#fff",fontSize:13,fontWeight:600})}>견적서 PDF</button>
        <button onClick={()=>{
          const rows = items.map(i=>`${i.label}\t${i.unit.toLocaleString()}원\t${(i.unit*pax).toLocaleString()}원`).join("\n");
          const txt = `[${plan.productName}] 견적서\n참가인원: ${pax}명\n\n${rows}\n\n원가합계: ${(subtotal*pax).toLocaleString()}원\n마진(${margin}%): ${(marginAmt*pax).toLocaleString()}원\n최종 판매가(1인): ${final.toLocaleString()}원\n\n생성: TourPlanit`;
          navigator.clipboard.writeText(txt);
          alert("이메일용 견적을 복사했습니다.");
        }} style={btn({flex:1,padding:"11px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>이메일용 텍스트 복사</button>
      </div>
    </Card>
  );
}

// ── 일정표 ──
function ScheduleDoc({plan}) {
  const printId = "schedule-print";
  return (
    <Card>
      <SectionTitle>일정표 초안</SectionTitle>
      <p style={{fontSize:13,color:C.muted,lineHeight:1.7,margin:"-4px 0 18px"}}>고객 안내와 현장 운영의 공통 초안입니다. 항공·집결·수배 확정 정보는 공유 전 다시 확인하세요.</p>
      <div id={printId} style={{fontFamily:"'Noto Sans KR',sans-serif"}}>
        <div style={{borderBottom:"3px solid "+C.navy,paddingBottom:16,marginBottom:24}}>
          <div style={{fontSize:10,color:C.blue,letterSpacing:1.6,fontWeight:700,marginBottom:4}}>TOURPLANIT · ITINERARY DRAFT</div>
          <div style={{fontSize:20,fontWeight:700,color:C.navy}}>{plan.productName}</div>
          <div style={{fontSize:13,color:C.amber,fontWeight:600,marginTop:4}}>{plan.slogan}</div>
          <div style={{display:"flex",gap:8,marginTop:14,fontSize:12,color:C.muted,flexWrap:"wrap"}}>
            {[["여행 지역",plan.region],["일정",plan.duration],["여행 테마",plan.theme],["추천 대상",plan.target]].map(([label,value])=>(
              <span key={label} style={{background:"#f4f7fb",border:"1px solid #e1e8f0",borderRadius:16,padding:"5px 9px"}}>{label} · {value}</span>
            ))}
          </div>
        </div>

        {plan.schedule.map((d,i)=>(
          <div key={i} style={{marginBottom:28}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <div style={{background:C.navy,color:"#fff",padding:"6px 18px",borderRadius:24,fontSize:13,fontWeight:700}}>{d.day}</div>
              <div style={{flex:1,height:1,background:"#e0ddd8"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:10}}>
              {[["🌅 오전",d.morning,"#fff8ee","#e8a020"],["☀️ 오후",d.afternoon,"#f0f5ff","#2d6a9f"],["🌙 저녁",d.evening,"#f5f0ff","#7c5cbf"]].map(([lbl,val,bg,color])=>(
                <div key={lbl} style={{background:bg,borderRadius:10,padding:"14px 16px",borderTop:`3px solid ${color}`}}>
                  <div style={{fontSize:11,color,fontWeight:700,marginBottom:6}}>{lbl}</div>
                  <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#fffbf0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#c47f00",border:"1px solid #f5e4a0"}}>
              <strong>운영 메모</strong> · {d.tip}
            </div>
          </div>
        ))}

        <div style={{background:C.gray,borderRadius:10,padding:16,marginTop:8}}>
          <div style={{fontSize:12,fontWeight:700,color:C.navy,marginBottom:10}}>포함/불포함 사항</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16}}>
            <div>
              <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:6}}>포함 사항</div>
              {plan.included?.map((v,i)=><div key={i} style={{fontSize:12,color:C.text,marginBottom:4}}>• {v}</div>)}
            </div>
            <div>
              <div style={{fontSize:11,color:C.red,fontWeight:700,marginBottom:6}}>불포함 사항</div>
              {plan.excluded?.map((v,i)=><div key={i} style={{fontSize:12,color:C.text,marginBottom:4}}>• {v}</div>)}
            </div>
          </div>
        </div>
        <p style={{fontSize:10,color:C.light,marginTop:16,textAlign:"right"}}>생성: {new Date(plan.createdAt).toLocaleDateString("ko-KR")} | TourPlanit (한국관광공사 OpenAPI 기반)</p>
      </div>

      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={()=>printPDF(printId, `${plan.productName}_일정표`)} style={btn({flex:1,padding:"11px",borderRadius:8,background:C.navy,color:"#fff",fontSize:13,fontWeight:600})}>일정표 PDF</button>
        <button onClick={()=>{
          const txt = plan.schedule.map(d=>`[${d.day}]\n오전: ${d.morning}\n오후: ${d.afternoon}\n저녁: ${d.evening}\n💡 ${d.tip}`).join("\n\n");
          navigator.clipboard.writeText(`${plan.productName}\n${plan.slogan}\n\n${txt}`);
          alert("일정표를 복사했습니다.");
        }} style={btn({flex:1,padding:"11px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>일정표 텍스트 복사</button>
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
      <SectionTitle>카드뉴스 초안</SectionTitle>
      <p style={{fontSize:13,color:C.muted,lineHeight:1.7,margin:"-4px 0 18px"}}>상품의 핵심 메시지를 슬라이드 단위로 검토하는 홍보 초안입니다. 게시 전 문구와 가격·일정 조건을 확인하세요.</p>
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
      alert("슬라이드 저장은 브라우저의 화면 캡처 또는 이미지 저장 기능을 이용하세요.\n\n자동 이미지 다운로드는 별도 기능으로 준비합니다.");
          }} style={btn({padding:"11px",borderRadius:8,background:C.amber,color:"#fff",fontSize:13,fontWeight:600})}>현재 슬라이드 저장 안내</button>
          <button onClick={()=>{
            const url = getShareUrl(plan);
            navigator.clipboard.writeText(url);
            alert("공유 링크를 복사했습니다.");
          }} style={btn({padding:"11px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>공유 링크 복사</button>

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
      <SectionTitle>블로그 본문 초안</SectionTitle>
      {!blog ? (
        <div style={{textAlign:"center",padding:"32px 0"}}>
          <div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:10}}>블로그 초안 생성</div>
          <p style={{fontSize:14,color:C.muted,marginBottom:20,lineHeight:1.7}}>상품 정보와 일정표를 바탕으로<br/>수정 가능한 홍보 문안을 작성합니다.</p>
          <button onClick={generate} disabled={loading} style={btn({padding:"13px 32px",background:C.blue,color:"#fff",borderRadius:8,fontSize:14,fontWeight:600})}>
            {loading?"본문 작성 중...":"블로그 본문 생성"}
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
            <button onClick={()=>setEditing(!editing)} style={btn({padding:"10px 16px",borderRadius:8,border:"2px solid "+C.blue,background:"#fff",color:C.blue,fontSize:13,fontWeight:600})}>{editing?"편집 완료":"직접 편집"}</button>
            <button onClick={()=>{navigator.clipboard.writeText(blog);alert("본문을 복사했습니다.");}} style={btn({flex:1,padding:"10px",borderRadius:8,background:C.navy,color:"#fff",fontSize:13,fontWeight:600})}>전체 복사</button>
            <button onClick={()=>setBlog("")} style={btn({padding:"10px 16px",borderRadius:8,border:"2px solid #ddd",background:"#fff",color:C.muted,fontSize:13})}>다시 생성</button>
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
      <SectionTitle>카카오 채널 문구</SectionTitle>
      <p style={{fontSize:13,color:C.muted,lineHeight:1.7,margin:"-4px 0 18px"}}>카카오 채널 발송 전용 문구입니다. 연락처와 실제 판매 조건을 입력한 뒤 사용하세요.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:20}}>
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
            {copied?"복사했습니다":"카카오 메시지 복사"}
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

  const tabs = [
    {id:"overview",label:"기획 요약"},
    {id:"itinerary",label:"일정"},
    {id:"estimate",label:"견적"},
    {id:"cardnews",label:"카드뉴스"},
    {id:"blog",label:"블로그"},
    {id:"kakao",label:"채널 문구"},
  ];

  const shareUrl = getShareUrl(plan);
  const downloadTxt = () => {
    const txt = `TourPlanit 기획서\n상품명: ${plan.productName}\n슬로건: ${plan.slogan}\n\n컨셉\n${plan.concept}\n\n일정\n${plan.schedule.map(d=>`[${d.day}]\n오전: ${d.morning}\n오후: ${d.afternoon}\n저녁: ${d.evening}\n팁: ${d.tip}`).join("\n\n")}\n\n핵심포인트\n${plan.highlights?.map((h,i)=>`${i+1}. ${h}`).join("\n")}\n\n포함: ${plan.included?.join(" / ")}\n불포함: ${plan.excluded?.join(" / ")}\n\n예상가격: ${plan.estimatedPrice}\n\n생성: ${new Date(plan.createdAt).toLocaleString("ko-KR")} | TourPlanit`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"})); a.download = `${plan.productName}_기획서.txt`; a.click();
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:16,paddingBottom:20,borderBottom:"1px solid #e8edf3"}}>
        <div>
          <button onClick={onBack} style={btn({padding:"6px 0",background:"transparent",fontSize:12,color:C.muted,marginBottom:12})}>← 기획서 목록</button>
          <div style={{fontSize:11,color:C.light,fontWeight:700,letterSpacing:0.6,marginBottom:8}}>PRODUCT PLANNING DRAFT · {new Date(plan.createdAt).toLocaleDateString("ko-KR")}</div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>{tag(plan.region,C.blue)} {tag(plan.duration,C.amber)} {tag(plan.theme,C.green)} {tag(plan.target,C.purple)}</div>
          <h2 style={{fontSize:26,fontWeight:750,letterSpacing:-0.8,color:C.navy,margin:"0 0 6px"}}>
            <EditableText field="productName" value={plan.productName} style={{fontSize:26,fontWeight:750,letterSpacing:-0.8,color:C.navy}}/>
          </h2>
          <div style={{color:C.muted,fontWeight:500,fontSize:14}}>
            <EditableText field="slogan" value={plan.slogan} style={{color:C.muted,fontWeight:500,fontSize:14}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={downloadTxt} style={btn({padding:"9px 14px",background:C.navy,color:"#fff",borderRadius:8,fontSize:12,fontWeight:600})}>텍스트 내보내기</button>
          <button onClick={async()=>{
  const shareBtn = document.activeElement;
  const origText = "공유 링크 복사";
  try {
    const url = getShareUrl(plan);
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = "✅ 복사됨!";
    setTimeout(()=>{ shareBtn.textContent = origText; }, 2000);
  } catch(e) {
    alert("오류: " + e.message);
    shareBtn.textContent = origText;
  }
}} style={btn({padding:"9px 14px",border:"1px solid "+C.blue,background:"#fff",color:C.blue,borderRadius:8,fontSize:12,fontWeight:600})}>공유 링크 복사</button>
          <button onClick={()=>{ if(confirm("삭제할까요?")) onDelete(plan.id); }} style={btn({padding:"9px 12px",border:"1px solid #f4c8cc",background:"#fff8f8",borderRadius:8,fontSize:12,color:C.red})}>삭제</button>
        </div>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:"1px solid #dfe6ee",overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={btn({padding:"12px 14px",borderRadius:"8px 8px 0 0",borderBottom:tab===t.id?`3px solid ${C.blue}`:"3px solid transparent",background:tab===t.id?"#f1f7ff":"transparent",color:tab===t.id?C.blue:C.muted,fontSize:12,fontWeight:tab===t.id?700:500,whiteSpace:"nowrap",minWidth:76})}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="overview" && (
        <>
          <Card style={{borderLeft:`4px solid ${C.blue}`}}>
            <SectionTitle>상품 컨셉</SectionTitle>
            <EditableText field="concept" value={plan.concept} style={{fontSize:14,color:C.text,lineHeight:1.8}} multiline/>
          </Card>
          <Card>
            <SectionTitle>일정 초안</SectionTitle>
            <p style={{fontSize:12,color:C.muted,lineHeight:1.6,margin:"-6px 0 18px"}}>시간과 이동 동선, 운영 가능 여부를 확인한 뒤 일정표에서 보완하세요.</p>
            {plan.schedule.map((d,i)=>(
              <div key={i} style={{marginBottom:i<plan.schedule.length-1?24:0,paddingBottom:i<plan.schedule.length-1?24:0,borderBottom:i<plan.schedule.length-1?"1px solid #f0ede8":"none"}}>
                <span style={{background:C.navy,color:"#fff",padding:"5px 12px",borderRadius:6,fontSize:12,fontWeight:700,display:"inline-block",marginBottom:12}}>{d.day}</span>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:10}}>
                  {[["오전","morning","#f8fbff","#3182f6"],["오후","afternoon","#f7fbf8","#12b886"],["저녁","evening","#fbf9ff","#7b61ff"]].map(([lbl,fld,bg,color])=>(
                    <div key={lbl} style={{background:bg,borderRadius:8,padding:"12px 14px",border:`1px solid ${color}22`,borderTop:`3px solid ${color}`}}>
                      <div style={{fontSize:11,color,fontWeight:700,marginBottom:6}}>{lbl}</div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{d[fld]}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:"#fffbf0",borderRadius:6,padding:"9px 14px",fontSize:12,color:"#8c6200",border:"1px solid #f5e4a0"}}><strong>운영 메모</strong> · {d.tip}</div>
              </div>
            ))}
          </Card>
          <Card>
            <SectionTitle>핵심 포인트</SectionTitle>
            {plan.highlights?.map((h,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
                <span style={{border:`1px solid ${C.blue}`,color:C.blue,width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</span>
                <span style={{color:C.text,fontSize:14,lineHeight:1.6}}>{h}</span>
              </div>
            ))}
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:16}}>
            <Card style={{margin:0}}>
              <SectionTitle>포함 사항</SectionTitle>
              {plan.included?.map((v,i)=><div key={i} style={{fontSize:13,color:C.text,marginBottom:6,lineHeight:1.5}}>• {v}</div>)}
            </Card>
            <Card style={{margin:0}}>
              <SectionTitle>불포함 사항</SectionTitle>
              {plan.excluded?.map((v,i)=><div key={i} style={{fontSize:13,color:C.text,marginBottom:6,lineHeight:1.5}}>• {v}</div>)}
            </Card>
          </div>
          <Card>
            <SectionTitle>추천 고객</SectionTitle>
            <p style={{fontSize:14,color:C.text,lineHeight:1.7,margin:0}}>{plan.targetDesc}</p>
          </Card>
          <Card>
            <SectionTitle>홍보 문구</SectionTitle>
            {[{key:"instagram",label:"인스타그램",color:"#c13584"},{key:"blog",label:"블로그",color:"#e85d30"},{key:"kakao",label:"카카오",color:"#b57a00"}].map(({key,label,color})=>(
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
            <div style={{fontSize:11,color:"#b9d9f5",marginBottom:6,fontWeight:700,letterSpacing:0.7}}>예상 판매가</div>
            <div style={{fontSize:30,fontWeight:700,color:C.amber}}>{plan.estimatedPrice}</div>
            <div style={{fontSize:12,color:"#b9d9f5",marginTop:8}}>초안 기준입니다. 실제 원가와 인원을 확인해 조정하세요.</div>
          </div>
          {editingField && <div style={{position:"fixed",bottom:24,right:24,background:C.blue,color:"#fff",padding:"8px 16px",borderRadius:8,fontSize:12,boxShadow:"0 4px 12px rgba(0,0,0,0.2)"}}>✏️ 편집 중 — 클릭 후 다른 곳 클릭하면 저장</div>}
          <div style={{background:"#f0f7ff",border:"1.5px solid #b3d4f5",borderRadius:12,padding:"14px 18px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700,color:"#1a5fa8"}}>관광 데이터 근거</span>
              {plan.ktoSource==="kto"
                ? <span style={{fontSize:10,background:"#1a5fa8",color:"#fff",padding:"2px 8px",borderRadius:20}}>실시간 연동</span>
                : <span style={{fontSize:10,background:"#888",color:"#fff",padding:"2px 8px",borderRadius:20}}>기본 데이터</span>
              }
            </div>
            {plan.ktoSpots && plan.ktoSpots.length > 0 ? (
              <>
                <div style={{fontSize:11,color:"#5580a8",marginBottom:6}}>관광공사 지역 기반 관광지 {plan.ktoSpots.length}개를 기획 초안에 참고했습니다.</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {plan.ktoSpots.slice(0,12).map((s,i)=>(
                    <span key={i} style={{fontSize:11,background:"#fff",border:"1px solid #b3d4f5",borderRadius:6,padding:"3px 9px",color:"#1a5fa8"}}>{s.title}</span>
                  ))}
                  {plan.ktoSpots.length > 12 && <span style={{fontSize:11,color:"#5580a8",padding:"3px 6px"}}>+{plan.ktoSpots.length-12}개</span>}
                </div>
              </>
            ) : (
              <div style={{fontSize:12,color:"#5580a8"}}>{plan.region} 지역 기본 데이터 적용</div>
            )}
          </div>
          <p style={{textAlign:"center",fontSize:11,color:C.light}}>관광 데이터는 참고 근거이며, 운영 가능 여부와 최신 정보는 담당자가 확인합니다.</p>
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
    const shareId = params.get("share");
    const planStr = params.get("plan"); // 구버전 호환
    if (shareId) {
      const plan = decodePlan(shareId);
      if (plan) {
        setDetailItem({...plan, id: plan.id||Date.now(), createdAt: plan.createdAt||new Date().toISOString()});
        setPage("detail");
      } else {
        alert("기획서를 불러올 수 없습니다.");
      }
    } else if (planStr) {
      const plan = decodePlan(planStr);
      if (plan) { setDetailItem({...plan, id: plan.id||Date.now(), createdAt: plan.createdAt||new Date().toISOString()}); setPage("detail"); }
    }
  },[]);

  const refresh = () => setHistory(loadHistory());

  const fetchSpots = async () => {
    const fallbackMap = {
      "서울": "경복궁, 북촌한옥마을, 인사동, 남산서울타워, 광장시장, 홍대, 이태원",
      "부산": "해운대, 광안리, 감천문화마을, 자갈치시장, 태종대, 흰여울문화마을",
      "제주": "한라산, 성산일출봉, 협재해수욕장, 천지연폭포, 우도, 만장굴, 중문관광단지",
      "인천": "차이나타운, 월미도, 송도센트럴파크, 개항장거리, 인천상륙작전기념관",
      "강원": "설악산, 오대산, 속초해수욕장, 낙산사, 춘천닭갈비골목",
      "전남": "순천만국가정원, 보성녹차밭, 여수밤바다, 담양죽녹원",
      "경남": "통영케이블카, 남해독일마을, 하동쌍계사, 거제해금강",
    };

    try {
      const areaCode = REGION_CODES[form.region] || "1";
      const res = await fetch(
        `/api/kto-proxy?areaCode=${areaCode}&contentTypeId=12&numOfRows=20`
      );
      if (!res.ok) throw new Error("proxy error");
      const data = await res.json();
      if (data.spots && data.spots.length > 0) {
        return {
          spotsStr: data.spots.map((s) => s.title).join(", "),
          spotsArray: data.spots,
          source: "kto",
        };
      }
      throw new Error("no spots");
    } catch {
      // KTO API 실패 시 폴백
      const fallback = fallbackMap[form.region] || `${form.region} 주요 관광지, 전통시장, 역사문화유적, 자연경관, 맛집거리`;
      return { spotsStr: fallback, spotsArray: [], source: "fallback" };
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      setLoadingMsg("관광공사 데이터 수집 중...");
      const { spotsStr, spotsArray, source } = await fetchSpots();
      setLoadingMsg("AI 기획서 생성 중...");
      const dayCount = form.duration==="당일치기"?1:form.duration==="1박 2일"?2:form.duration==="2박 3일"?3:4;
      const schedEx = Array.from({length:dayCount},(_,i)=>`{"day":"Day ${i+1}","morning":"구체적오전일정","afternoon":"구체적오후일정","evening":"구체적저녁일정","tip":"실용적팁"}`).join(",");
      const prompt = `다음 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 쓰지 마세요.

조건: 지역=${form.region}, 기간=${form.duration}, 테마=${form.theme}, 타깃=${form.target}, 예산=${form.budget||"중간"}, 관광지=${spotsStr}

중요규칙:
1. JSON 외 아무것도 출력하지 마세요
2. 모든 문자열값은 한 줄로 작성 (줄바꿈 금지)
3. 특수문자 사용 금지 (따옴표, 역슬래시 등)
4. instagram/blog/kakao 값은 50자 이내로 짧게
5. schedule은 정확히 ${dayCount}개

{"productName":"상품명","slogan":"슬로건","concept":"컨셉설명","schedule":[${schedEx}],"highlights":["핵심1","핵심2","핵심3"],"included":["포함1","포함2","포함3","포함4"],"excluded":["불포함1","불포함2","불포함3"],"targetDesc":"타깃설명","estimatedPrice":"1인 XX만원대","instagram":"인스타카피 해시태그포함","blog":"블로그소개","kakao":"카카오홍보문구"}`;

      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":CLAUDE_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:4000,messages:[{role:"user",content:prompt}]})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message||"API 오류");
      const text = data.content[0].text.trim();
      const s=text.indexOf("{"),e=text.lastIndexOf("}");
      let plan;
      try {
        plan = JSON.parse(text.slice(s,e+1));
      } catch {
        // 줄바꿈·탭 제거 후 재시도
        const cleaned = text.slice(s,e+1).replace(/[\r\n\t]+/g," ").replace(/,\s*}/g,"}").replace(/,\s*]/g,"]");
        plan = JSON.parse(cleaned);
      }
      plan.region=form.region; plan.duration=form.duration; plan.theme=form.theme; plan.target=form.target;
      plan.ktoSpots=spotsArray; plan.ktoSource=source;
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
    <header style={{background:C.navy,height:56,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
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
    <article onClick={onClick} style={{background:C.white,borderRadius:12,padding:"18px 20px",cursor:"pointer",border:"1px solid #e2e8f0",transition:"all .15s",boxShadow:"0 1px 3px rgba(25,31,40,.04)"}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 24px rgba(25,31,40,.09)";e.currentTarget.style.borderColor="#b9d7ff"}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 3px rgba(25,31,40,.04)";e.currentTarget.style.borderColor="#e2e8f0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>{tag(plan.region,C.blue)} {tag(plan.duration,C.amber)} {tag(plan.theme,C.green)}</div>
          <div style={{fontSize:16,fontWeight:750,letterSpacing:-.25,color:C.navy,marginBottom:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{plan.productName}</div>
          <div style={{fontSize:13,color:C.muted,marginBottom:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{plan.slogan}</div>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",fontSize:12,color:C.muted,flexWrap:"wrap"}}><span>작성 {new Date(plan.createdAt).toLocaleDateString("ko-KR")}</span><span style={{fontWeight:700,color:C.text}}>예상 {plan.estimatedPrice}</span></div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <span style={{fontSize:12,fontWeight:700,color:C.blue}}>열기 →</span>
          <button aria-label="기획서 삭제" onClick={e=>{e.stopPropagation();if(confirm("이 기획서를 삭제할까요?"))onDelete(plan.id);}} style={btn({background:"transparent",border:"1px solid #e5e8ed",borderRadius:6,color:C.light,fontSize:14,padding:"4px 7px",lineHeight:1})}>×</button>
        </div>
      </div>
    </article>
  );

  const wrap = {maxWidth:880,margin:"0 auto",padding:"24px 16px"};

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",color:C.text}}>
      <Nav/>

      {page==="home" && (
        <>
          {/* 제품 진입점: 소개보다 바로 기획을 시작하고, 근거와 결과를 이해하게 한다. */}
          <div style={{background:`linear-gradient(135deg,${C.navy} 0%,#253a58 55%,${C.blue} 150%)`,padding:"72px 20px 64px",color:"#fff"}}>
            <div className="tourplanit-hero-grid" style={{maxWidth:880,margin:"0 auto",display:"grid",gridTemplateColumns:"minmax(0,1.25fr) minmax(260px,.75fr)",gap:32,alignItems:"end"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,color:"#b9d7ff",marginBottom:18}}>TOUR PRODUCT PLANNING WORKSPACE</div>
                <h1 style={{fontSize:40,fontWeight:750,margin:"0 0 16px",lineHeight:1.2,letterSpacing:-1.4}}>근거 있는 여행상품을<br/>빠르게 기획하세요.</h1>
                <p style={{fontSize:16,color:"rgba(255,255,255,.74)",margin:"0 0 30px",lineHeight:1.7}}>지역·기간·타깃을 정하면 관광 데이터와 AI 초안을 바탕으로 일정, 견적, 홍보 문구를 한 작업 공간에서 정리합니다.</p>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  <button onClick={()=>setPage("form")} style={btn({padding:"14px 24px",background:"#fff",color:C.navy,borderRadius:10,fontSize:15,fontWeight:750,boxShadow:"0 8px 24px rgba(0,0,0,.16)"})}>새 상품 기획하기 →</button>
                  {history.length>0&&<button onClick={()=>setPage("history")} style={btn({padding:"14px 20px",background:"transparent",color:"#fff",border:"1px solid rgba(255,255,255,.32)",borderRadius:10,fontSize:14})}>최근 기획서 {history.length}개</button>}
                </div>
              </div>
              <div style={{background:"rgba(10,18,31,.24)",border:"1px solid rgba(255,255,255,.18)",borderRadius:14,padding:20,backdropFilter:"blur(8px)"}}>
                <div style={{fontSize:12,color:"#b9d7ff",fontWeight:700,marginBottom:14}}>생성 전 확인할 것</div>
                {["여행 지역과 기간","주요 고객과 여행 테마","예산·노쇼핑 등 운영 조건"].map((item,index)=><div key={item} style={{display:"flex",gap:10,alignItems:"center",fontSize:13,color:"rgba(255,255,255,.9)",padding:"7px 0",borderTop:index?"1px solid rgba(255,255,255,.12)":"none"}}><span style={{color:"#8cc3ff",fontWeight:700}}>0{index+1}</span>{item}</div>)}
              </div>
            </div>
          </div>

          {/* 핵심 흐름과 결과물만 남긴다. 과장된 통계와 먼 로드맵은 첫 화면에서 제외한다. */}
          <div style={{...wrap,paddingTop:48,paddingBottom:42}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",marginBottom:22,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:11,color:C.blue,fontWeight:750,letterSpacing:1.2,marginBottom:8}}>ONE WORKSPACE</div>
                <h2 style={{fontSize:24,fontWeight:750,color:C.navy,margin:0,letterSpacing:-.7}}>기획부터 제안 자료까지 한 흐름으로</h2>
              </div>
              <p style={{maxWidth:330,fontSize:13,color:C.muted,lineHeight:1.65,margin:0}}>초안은 빠르게 만들고, 일정과 금액·홍보 내용은 담당자가 검토해 완성합니다.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:32}}>
              {[["01","조건 설정","지역·기간·고객·운영 조건을 정리"],["02","근거 수집","관광 데이터와 장소 정보를 기획에 반영"],["03","초안 편집","일정·견적·홍보 문구를 검토해 저장"]].map(([num,title,desc])=>(
                <div key={num} style={{background:C.white,border:"1px solid #e5e8ed",borderRadius:12,padding:18}}>
                  <div style={{fontSize:12,fontWeight:750,color:C.blue,marginBottom:18}}>{num}</div>
                  <div style={{fontSize:15,fontWeight:750,color:C.navy,marginBottom:6}}>{title}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
              {[["기획서","상품 컨셉과 운영 조건"],["일정·견적","Day별 일정과 금액 초안"],["홍보 콘텐츠","카드뉴스·블로그·채널 문구"]].map(([title,desc])=>(
                <div key={title} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,background:"#eef4ff",borderRadius:10,padding:"14px 16px"}}><div><div style={{fontSize:13,fontWeight:750,color:C.navy}}>{title}</div><div style={{fontSize:11,color:C.muted,marginTop:3}}>{desc}</div></div><span style={{color:C.blue,fontWeight:750}}>→</span></div>
              ))}
            </div>
          </div>

          <div style={{background:C.white,borderTop:"1px solid #e9edf2",borderBottom:"1px solid #e9edf2",padding:"28px 20px"}}>
            <div style={{maxWidth:880,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:20}}>
              <div><div style={{fontSize:11,color:C.muted,fontWeight:750,letterSpacing:1,marginBottom:8}}>DATA BASIS</div><div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:5}}>관광 데이터로 시작합니다</div><div style={{fontSize:12,color:C.muted,lineHeight:1.65}}>한국관광공사 관광정보를 출발점으로 활용합니다. 결과는 기획 목적에 맞는지 검토가 필요합니다.</div></div>
              <div><div style={{fontSize:11,color:C.muted,fontWeight:750,letterSpacing:1,marginBottom:8}}>AI DRAFT</div><div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:5}}>AI는 초안을 만들고, 사람은 결정합니다</div><div style={{fontSize:12,color:C.muted,lineHeight:1.65}}>자동 생성 결과는 바로 발행되지 않습니다. 필요한 부분을 편집한 뒤 저장·공유하세요.</div></div>
            </div>
          </div>

          {/* 최근 기획서 */}
          {history.length>0&&(
            <div style={wrap}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:15,fontWeight:700,color:C.navy}}>최근 기획서</div>
                <button onClick={()=>setPage("history")} style={btn({fontSize:12,color:C.blue,background:"none",padding:0})}>전체 보기 →</button>
              </div>
              <div style={{display:"grid",gap:10}}>
                {history.slice(0,3).map(h=><PlanCard key={h.id} plan={h} onClick={()=>{setDetailItem(h);setPage("detail");}} onDelete={deleteItem}/>)}
              </div>
            </div>
          )}

          {/* 하단 CTA */}
          <div style={{background:`linear-gradient(135deg,${C.navy},${C.blue})`,padding:"40px 20px",textAlign:"center",color:"#fff"}}>
            <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 12px"}}>지금 바로 시작해보세요</h2>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.65)",margin:"0 0 24px"}}>다음 상품 기획의 조건을 정리하고 초안을 시작하세요.</p>
            <button onClick={()=>setPage("form")} style={btn({padding:"14px 40px",background:C.amber,color:"#fff",borderRadius:10,fontSize:15,fontWeight:700,boxShadow:"0 4px 16px rgba(0,0,0,0.2)"})}>기획 시작하기 →</button>
          </div>
        </>
      )}

      {page==="form" && (
        <div style={wrap}>
          <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",marginBottom:24,flexWrap:"wrap"}}>
            <div><div style={{fontSize:11,color:C.blue,fontWeight:750,letterSpacing:1.2,marginBottom:8}}>NEW PRODUCT BRIEF</div><h2 style={{fontSize:26,fontWeight:750,color:C.navy,margin:"0 0 7px",letterSpacing:-.7}}>새 상품 기획</h2><p style={{color:C.muted,margin:0,fontSize:13,lineHeight:1.6}}>필수 조건부터 정리하세요. 생성된 초안은 이후 화면에서 직접 수정할 수 있습니다.</p></div>
            <div style={{fontSize:12,color:C.muted,background:C.white,border:"1px solid #e5e8ed",borderRadius:20,padding:"8px 12px"}}>필수 항목 4개</div>
          </div>
          <div style={{background:C.white,border:"1px solid #e5e8ed",borderRadius:16,padding:"24px",boxShadow:"0 1px 3px rgba(25,31,40,.03)"}}>
            {[{label:"여행 지역",hint:"어느 지역을 중심으로 상품을 만들까요?",key:"region",options:REGIONS,color:C.blue},{label:"여행 기간",hint:"대표 일정의 길이를 선택하세요.",key:"duration",options:DURATIONS,color:C.blue},{label:"여행 테마",hint:"관광지와 문구를 정하는 기준이 됩니다.",key:"theme",options:THEMES,color:C.navy},{label:"주요 고객",hint:"가장 먼저 설득할 고객을 정하세요.",key:"target",options:TARGETS,color:C.navy}].map(({label,hint,key,options,color},index)=>(
              <div key={key} style={{paddingBottom:index<3?24:0,marginBottom:index<3?24:0,borderBottom:index<3?"1px solid #edf0f3":"none"}}>
                <div style={{display:"flex",gap:10,alignItems:"baseline",marginBottom:12}}><label style={{fontSize:14,fontWeight:750,color:C.text}}>{label} <span style={{color:C.red}}>*</span></label><span style={{fontSize:12,color:C.muted}}>{hint}</span></div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{options.map(opt=>chip(opt,form[key]===opt,color,()=>setForm({...form,[key]:opt})))}</div>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,paddingTop:24,marginTop:24,borderTop:"1px solid #edf0f3"}}>
              <div><label style={{fontSize:14,fontWeight:750,color:C.text,display:"block",marginBottom:8}}>예산대 <span style={{fontSize:12,color:C.muted,fontWeight:400}}>선택</span></label><input value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} placeholder="예: 1인 20만원대"
                style={{width:"100%",padding:"12px 14px",borderRadius:9,border:"1px solid #dfe4ea",fontSize:13,outline:"none",background:C.white}}/></div>
              <div><label style={{fontSize:14,fontWeight:750,color:C.text,display:"block",marginBottom:8}}>운영 조건 <span style={{fontSize:12,color:C.muted,fontWeight:400}}>선택</span></label><textarea value={form.special} onChange={e=>setForm({...form,special:e.target.value})} placeholder="예: 노쇼핑, 노약자 포함" rows={2}
                style={{width:"100%",padding:"12px 14px",borderRadius:9,border:"1px solid #dfe4ea",fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box",background:C.white}}/></div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",background:"#eef4ff",border:"1px solid #d9e7ff",borderRadius:12,padding:"14px 16px",marginTop:16,flexWrap:"wrap"}}><span style={{fontSize:12,color:C.muted}}>AI는 초안을 생성합니다. 장소·가격·운영 조건은 저장 전 확인하세요.</span><button onClick={handleGenerate} disabled={!form.region||!form.duration||!form.theme||!form.target||loading}
            style={btn({padding:"13px 20px",borderRadius:9,fontSize:14,fontWeight:750,background:loading||!form.region||!form.duration||!form.theme||!form.target?"#b8c0cc":C.blue,color:"#fff",boxShadow:"none"})}>{loading?loadingMsg:"기획 초안 만들기 →"}</button></div>
        </div>
      )}

      {page==="history" && (
        <div style={wrap}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",marginBottom:24,gap:16,flexWrap:"wrap"}}>
            <div><div style={{fontSize:11,color:C.blue,fontWeight:750,letterSpacing:1.2,marginBottom:8}}>PLANNING ARCHIVE</div><h2 style={{fontSize:26,fontWeight:750,letterSpacing:-.7,color:C.navy,margin:"0 0 6px"}}>저장한 기획서</h2><p style={{fontSize:13,color:C.muted,margin:0}}>초안을 다시 열어 일정, 견적, 홍보 문구를 이어서 검토하세요.</p></div>
            <button onClick={()=>setPage("form")} style={btn({padding:"11px 18px",background:C.blue,color:"#fff",borderRadius:8,fontSize:13,fontWeight:700})}>새 상품 기획하기 →</button>
          </div>
          {history.length>0&&<div style={{fontSize:12,color:C.muted,marginBottom:12}}>최근 저장순 · 총 {history.length}개</div>}
          {history.length===0?(
            <div style={{textAlign:"center",padding:"72px 20px",color:C.muted,background:C.white,border:"1px dashed #cfd8e3",borderRadius:14}}>
              <div style={{fontSize:15,fontWeight:700,color:C.navy,marginBottom:8}}>저장한 기획서가 없습니다</div>
              <div style={{fontSize:13,marginBottom:20}}>지역·기간·고객 조건을 정해 첫 상품 기획을 시작하세요.</div>
              <button onClick={()=>setPage("form")} style={btn({padding:"13px 24px",background:C.navy,color:"#fff",borderRadius:9,fontSize:14,fontWeight:700})}>첫 상품 기획하기 →</button>
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
