import { useState, useEffect, useRef } from "react";

const REGIONS = ["서울","인천","대전","대구","광주","부산","울산","세종","경기","강원","충북","충남","경북","경남","전북","전남","제주"];
const REGION_CODES = {"서울":"1","인천":"2","대전":"3","대구":"4","광주":"5","부산":"6","울산":"7","세종":"8","경기":"31","강원":"32","충북":"33","충남":"34","경북":"35","경남":"36","전북":"37","전남":"38","제주":"39"};
const THEMES = ["자연/힐링","문화/역사","액티비티","미식","쇼핑","가족여행","커플여행","단체여행"];
const DURATIONS = ["당일치기","1박 2일","2박 3일","3박 4일 이상"];
const TARGETS = ["가족","커플/연인","친구","단체/기업","혼자"];

const KTO_KEY = import.meta.env.VITE_KTO_API_KEY || "";
const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY || "";
const STORAGE_KEY = "tourplanit_v2";

const C = {
  navy:"#1a3a5c", blue:"#2d6a9f", amber:"#e8a020",
  bg:"#f0ede8", white:"#ffffff", gray:"#f4f2ef",
  text:"#2c2c2c", muted:"#666", light:"#aaa",
  green:"#2d9f6a", red:"#e05050"
};

function loadHistory() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch { return []; } }
function saveToHistory(plan) {
  const h = loadHistory();
  const item = {...plan, id:Date.now(), createdAt:new Date().toISOString()};
  h.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(0,20)));
  return item;
}

const btn = (s={}) => ({border:"none",cursor:"pointer",fontFamily:"inherit",...s});
const chip = (label,active,color,onClick) => (
  <button key={label} onClick={onClick} style={btn({padding:"8px 16px",borderRadius:20,border:`2px solid ${active?color:"#ddd"}`,background:active?color:"#fff",color:active?"#fff":"#555",fontSize:13,fontWeight:active?600:400,transition:"all .15s"})}>
    {label}
  </button>
);
const tag = (label,color) => (
  <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:color+"22",color,fontWeight:600}}>{label}</span>
);
const Section = ({title,children}) => (
  <div style={{background:C.white,borderRadius:12,padding:24,marginBottom:16}}>
    <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:14,letterSpacing:1.5}}>{title}</div>
    {children}
  </div>
);

// ── 견적서 계산기 ──
function EstimateCalc({plan}) {
  const [pax, setPax] = useState(10);
  const items = [
    {label:"숙박비", unit: plan.duration==="당일치기"?0:plan.duration==="1박 2일"?60000:plan.duration==="2박 3일"?120000:180000, note:"1인 기준"},
    {label:"식사비", unit: plan.duration==="당일치기"?30000:plan.duration==="1박 2일"?60000:plan.duration==="2박 3일"?90000:120000, note:"1인 기준"},
    {label:"입장료", unit:20000, note:"주요 관광지 포함"},
    {label:"가이드비", unit:0, perGroup:Math.round(200000/(pax||1)), note:"팀 전체 분담"},
    {label:"버스/교통", unit:0, perGroup:Math.round(300000/(pax||1)), note:"팀 전체 분담"},
    {label:"기타(보험 등)", unit:5000, note:"1인 기준"},
  ];
  const total = items.reduce((s,i)=>(s+(i.unit||0)+(i.perGroup||0)),0);
  const margin = Math.round(total*0.2);
  const final = total+margin;

  return (
    <Section title="ESTIMATE — 견적 계산기">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,background:C.gray,borderRadius:8,padding:"12px 16px"}}>
        <span style={{fontSize:14,fontWeight:600,color:C.text}}>참가 인원</span>
        <button onClick={()=>setPax(Math.max(1,pax-1))} style={btn({width:28,height:28,borderRadius:"50%",background:C.navy,color:"#fff",fontSize:16})}>-</button>
        <span style={{fontSize:20,fontWeight:700,color:C.navy,minWidth:32,textAlign:"center"}}>{pax}</span>
        <button onClick={()=>setPax(pax+1)} style={btn({width:28,height:28,borderRadius:"50%",background:C.navy,color:"#fff",fontSize:16})}>+</button>
        <span style={{fontSize:13,color:C.muted}}>명</span>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead>
          <tr style={{background:C.gray}}>
            {["항목","단가(1인)","소계","비고"].map(h=>(
              <th key={h} style={{padding:"10px 12px",textAlign:"left",fontWeight:600,color:C.muted,fontSize:12}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item,i)=>{
            const perPax = (item.unit||0)+(item.perGroup||0);
            return (
              <tr key={i} style={{borderBottom:"1px solid #f0ede8"}}>
                <td style={{padding:"10px 12px",fontWeight:500,color:C.text}}>{item.label}</td>
                <td style={{padding:"10px 12px",color:C.text}}>{perPax.toLocaleString()}원</td>
                <td style={{padding:"10px 12px",color:C.text,fontWeight:600}}>{(perPax*pax).toLocaleString()}원</td>
                <td style={{padding:"10px 12px",color:C.muted,fontSize:12}}>{item.note}</td>
              </tr>
            );
          })}
          <tr style={{background:"#f8f7f4",borderBottom:"1px solid #e8e5e0"}}>
            <td colSpan={2} style={{padding:"10px 12px",fontWeight:600,color:C.muted}}>원가 합계</td>
            <td style={{padding:"10px 12px",fontWeight:700}}>{(total*pax).toLocaleString()}원</td>
            <td style={{padding:"10px 12px",fontSize:12,color:C.muted}}>—</td>
          </tr>
          <tr style={{background:"#f8f7f4",borderBottom:"1px solid #e8e5e0"}}>
            <td colSpan={2} style={{padding:"10px 12px",fontWeight:600,color:C.muted}}>운영 마진 (20%)</td>
            <td style={{padding:"10px 12px",fontWeight:700}}>{(margin*pax).toLocaleString()}원</td>
            <td style={{padding:"10px 12px",fontSize:12,color:C.muted}}>조정 가능</td>
          </tr>
          <tr style={{background:C.navy}}>
            <td colSpan={2} style={{padding:"12px 12px",fontWeight:700,color:"#fff",fontSize:14}}>최종 판매가 (1인)</td>
            <td style={{padding:"12px 12px",fontWeight:700,color:C.amber,fontSize:16}}>{final.toLocaleString()}원</td>
            <td style={{padding:"12px 12px",color:"#7eb8d4",fontSize:12}}>{pax}명 기준</td>
          </tr>
        </tbody>
      </table>
      <p style={{fontSize:11,color:C.light,marginTop:10}}>* 실제 견적은 현지 상황에 따라 달라질 수 있습니다. 참고용으로 활용하세요.</p>
    </Section>
  );
}

// ── 카드뉴스 캐러셀 ──
function CardNews({plan}) {
  const [slide, setSlide] = useState(0);
  const canvasRef = useRef(null);

  const slides = [
    {bg:"#1a3a5c", accent:"#e8a020", title:plan.productName, sub:plan.slogan, body:"", type:"cover"},
    {bg:"#2d6a9f", accent:"#fff", title:"여행 컨셉", sub:"", body:plan.concept, type:"text"},
    ...plan.schedule.map((d,i)=>({bg: i%2===0?"#f0ede8":"#fff8ee", accent:"#1a3a5c", title:d.day, sub:"", body:`🌅 ${d.morning}\n☀️ ${d.afternoon}\n🌙 ${d.evening}`, type:"schedule"})),
    {bg:"#e8a020", accent:"#1a3a5c", title:"핵심 포인트", sub:"", body:plan.highlights.map((h,i)=>`${i+1}. ${h}`).join("\n"), type:"text"},
    {bg:"#1a3a5c", accent:"#e8a020", title:plan.estimatedPrice, sub:"예상 가격대", body:`${plan.targetDesc}\n\n📞 지금 바로 문의하세요`, type:"cta"},
  ];
  const total = slides.length;
  const s = slides[slide];

  const downloadSlide = () => {
    const el = document.getElementById("card-slide-preview");
    if (!el) return;
    import("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js").then(()=>{
      window.html2canvas(el,{scale:2}).then(canvas=>{
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${plan.productName}_slide${slide+1}.png`;
        a.click();
      });
    });
  };

  return (
    <Section title="CARD NEWS — 카드뉴스 캐러셀">
      <div style={{position:"relative"}}>
        {/* 슬라이드 미리보기 */}
        <div id="card-slide-preview" style={{background:s.bg,borderRadius:16,padding:40,minHeight:360,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",position:"relative",overflow:"hidden"}}>
          {/* 배경 장식 */}
          <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:s.accent,opacity:0.08}}/>
          <div style={{position:"absolute",bottom:-60,left:-60,width:200,height:200,borderRadius:"50%",background:s.accent,opacity:0.06}}/>
          {/* 슬라이드 번호 */}
          <div style={{position:"absolute",top:16,right:16,fontSize:11,color:s.accent,opacity:0.6,fontWeight:600}}>{slide+1}/{total}</div>
          {/* 로고 */}
          <div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",fontSize:10,color:s.accent,opacity:0.5,letterSpacing:2}}>TOURPLANIT</div>

          {s.type==="cover" && (
            <>
              <div style={{fontSize:13,color:s.accent,marginBottom:12,letterSpacing:2,opacity:0.8}}>TRAVEL PRODUCT</div>
              <div style={{fontSize:26,fontWeight:700,color:s.accent,lineHeight:1.4,marginBottom:16,maxWidth:400}}>{s.title}</div>
              <div style={{fontSize:15,color:s.accent,opacity:0.85}}>{s.sub}</div>
            </>
          )}
          {s.type==="text" && (
            <>
              <div style={{fontSize:18,fontWeight:700,color:s.accent,marginBottom:20}}>{s.title}</div>
              <div style={{fontSize:14,color:s.accent,lineHeight:1.8,maxWidth:460,opacity:0.9,whiteSpace:"pre-wrap"}}>{s.body}</div>
            </>
          )}
          {s.type==="schedule" && (
            <>
              <div style={{fontSize:22,fontWeight:700,color:s.accent,marginBottom:20}}>{s.title}</div>
              <div style={{textAlign:"left",maxWidth:400}}>
                {s.body.split("\n").map((line,i)=>(
                  <div key={i} style={{fontSize:13,color:s.accent,lineHeight:1.8,padding:"6px 0",borderBottom:"1px solid "+s.accent+"22"}}>{line}</div>
                ))}
              </div>
            </>
          )}
          {s.type==="cta" && (
            <>
              <div style={{fontSize:14,color:s.accent,marginBottom:8,opacity:0.8}}>{s.sub}</div>
              <div style={{fontSize:32,fontWeight:700,color:s.accent,marginBottom:20}}>{s.title}</div>
              <div style={{fontSize:13,color:s.accent,lineHeight:1.8,whiteSpace:"pre-wrap",opacity:0.85}}>{s.body}</div>
            </>
          )}
        </div>

        {/* 네비게이션 */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16}}>
          <button onClick={()=>setSlide(Math.max(0,slide-1))} disabled={slide===0}
            style={btn({padding:"8px 16px",borderRadius:8,background:slide===0?"#eee":C.navy,color:slide===0?C.muted:"#fff",fontSize:13})}>← 이전</button>
          <div style={{display:"flex",gap:6}}>
            {slides.map((_,i)=>(
              <div key={i} onClick={()=>setSlide(i)} style={{width:8,height:8,borderRadius:"50%",background:i===slide?C.navy:"#ddd",cursor:"pointer",transition:"all .15s"}}/>
            ))}
          </div>
          <button onClick={()=>setSlide(Math.min(total-1,slide+1))} disabled={slide===total-1}
            style={btn({padding:"8px 16px",borderRadius:8,background:slide===total-1?"#eee":C.navy,color:slide===total-1?C.muted:"#fff",fontSize:13})}>다음 →</button>
        </div>

        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={downloadSlide} style={btn({flex:1,padding:"10px",borderRadius:8,background:C.amber,color:"#fff",fontSize:13,fontWeight:600})}>📥 이 슬라이드 저장</button>
          <button onClick={()=>{
            slides.forEach((_,i)=>{ setTimeout(()=>{ setSlide(i); setTimeout(downloadSlide,300); },i*700); });
          }} style={btn({flex:1,padding:"10px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>📦 전체 저장</button>
        </div>
      </div>
    </Section>
  );
}

// ── 블로그 본문 ──
function BlogContent({plan, claudeKey}) {
  const [blog, setBlog] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/claude/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":claudeKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:1500,
          messages:[{role:"user",content:`다음 여행 상품을 소개하는 네이버 블로그 포스트를 작성해줘.
상품명: ${plan.productName}
슬로건: ${plan.slogan}
지역: ${plan.region} / 기간: ${plan.duration} / 테마: ${plan.theme}
컨셉: ${plan.concept}
일정: ${plan.schedule.map(d=>d.day+": "+d.morning+", "+d.afternoon+", "+d.evening).join(" / ")}
핵심포인트: ${plan.highlights.join(", ")}
가격: ${plan.estimatedPrice}

조건:
- 700자 내외
- 감성적이고 여행 욕구를 자극하는 문체
- 소제목 2~3개 포함 (## 형식)
- 마지막에 CTA 문구 포함
- 마크다운 없이 순수 텍스트`}]
        })
      });
      const data = await res.json();
      setBlog(data.content[0].text);
    } catch(e) { alert("생성 오류: "+e.message); }
    finally { setLoading(false); }
  };

  return (
    <Section title="BLOG — 블로그 본문">
      {!blog ? (
        <div style={{textAlign:"center",padding:"24px 0"}}>
          <p style={{fontSize:14,color:C.muted,marginBottom:16}}>AI가 네이버 블로그용 본문을 자동으로 작성해드립니다.</p>
          <button onClick={generate} disabled={loading} style={btn({padding:"12px 28px",background:C.blue,color:"#fff",borderRadius:8,fontSize:14,fontWeight:600})}>
            {loading?"✍️ 작성 중...":"✍️ 블로그 본문 생성"}
          </button>
        </div>
      ) : (
        <>
          <div style={{background:C.gray,borderRadius:8,padding:20,fontSize:14,lineHeight:1.9,color:C.text,whiteSpace:"pre-wrap",marginBottom:12}}>{blog}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{ navigator.clipboard.writeText(blog); alert("복사됐습니다!"); }}
              style={btn({flex:1,padding:"10px",borderRadius:8,border:"2px solid "+C.navy,background:"#fff",color:C.navy,fontSize:13,fontWeight:600})}>📋 복사</button>
            <button onClick={()=>{ setBlog(""); }}
              style={btn({padding:"10px 16px",borderRadius:8,border:"2px solid #ddd",background:"#fff",color:C.muted,fontSize:13})}>다시 생성</button>
          </div>
        </>
      )}
    </Section>
  );
}

// ── 카카오 메시지 ──
function KakaoMessage({plan}) {
  const [copied, setCopied] = useState(false);
  const msg = `[${plan.productName}]
${plan.slogan}

📍 지역: ${plan.region}
🗓 기간: ${plan.duration}
🎯 테마: ${plan.theme}
💰 가격: ${plan.estimatedPrice}

✅ 포함: ${plan.included?.slice(0,2).join(", ")}
❌ 불포함: ${plan.excluded?.slice(0,2).join(", ")}

🌟 ${plan.highlights?.[0]}

📞 지금 바로 문의하세요!
🔗 [예약 링크]`;

  const copy = () => { navigator.clipboard.writeText(msg); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  return (
    <Section title="KAKAO — 카카오채널 메시지">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        {/* 미리보기 */}
        <div>
          <div style={{fontSize:12,color:C.muted,marginBottom:8,fontWeight:600}}>미리보기</div>
          <div style={{background:"#fee500",borderRadius:16,padding:"0 0 16px",overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,0.1)",maxWidth:280}}>
            <div style={{background:"#f7d400",padding:"12px 16px",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🗺️</div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>TourPlanit</div>
                <div style={{fontSize:10,color:"#555"}}>공식채널</div>
              </div>
            </div>
            <div style={{margin:"12px 12px 0",background:"#fff",borderRadius:12,padding:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1a1a1a",marginBottom:8}}>{plan.productName}</div>
              <div style={{fontSize:11,color:"#555",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{msg.split("\n").slice(1,7).join("\n")}</div>
              <div style={{marginTop:10,background:"#fee500",borderRadius:8,padding:"8px 0",textAlign:"center",fontSize:12,fontWeight:700,color:"#1a1a1a"}}>자세히 보기</div>
            </div>
          </div>
        </div>
        {/* 텍스트 */}
        <div>
          <div style={{fontSize:12,color:C.muted,marginBottom:8,fontWeight:600}}>전송 텍스트</div>
          <div style={{background:C.gray,borderRadius:8,padding:14,fontSize:12,lineHeight:1.8,color:C.text,whiteSpace:"pre-wrap",marginBottom:12,minHeight:180}}>{msg}</div>
          <button onClick={copy} style={btn({width:"100%",padding:"10px",borderRadius:8,background:copied?"#2d9f6a":"#fee500",color:copied?"#fff":"#1a1a1a",fontSize:13,fontWeight:700,transition:"all .2s"})}>
            {copied?"✅ 복사됐습니다!":"📋 카카오 메시지 복사"}
          </button>
        </div>
      </div>
    </Section>
  );
}

// ── 기획서 상세 ──
function PlanDetail({plan, onBack, onDelete}) {
  const [tab, setTab] = useState("overview");
  const tabs = [
    {id:"overview",label:"기획서"},
    {id:"estimate",label:"견적서"},
    {id:"cardnews",label:"카드뉴스"},
    {id:"blog",label:"블로그"},
    {id:"kakao",label:"카카오"},
  ];

  const downloadTxt = () => {
    const txt = `TourPlanit 기획서\n상품명: ${plan.productName}\n슬로건: ${plan.slogan}\n\n컨셉\n${plan.concept}\n\n일정\n${plan.schedule.map(d=>`[${d.day}]\n오전: ${d.morning}\n오후: ${d.afternoon}\n저녁: ${d.evening}\n팁: ${d.tip}`).join("\n\n")}\n\n핵심 포인트\n${plan.highlights.map((h,i)=>`${i+1}. ${h}`).join("\n")}\n\n포함: ${plan.included.join(" / ")}\n불포함: ${plan.excluded.join(" / ")}\n\n예상 가격: ${plan.estimatedPrice}\n\n마케팅 카피\n[인스타] ${plan.instagram||""}\n[블로그] ${plan.blog||""}\n[카카오] ${plan.kakao||""}\n\n생성: ${new Date(plan.createdAt).toLocaleString("ko-KR")} | TourPlanit`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"}));
    a.download = `${plan.productName}_기획서.txt`;
    a.click();
  };

  return (
    <div>
      {/* 헤더 */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <button onClick={onBack} style={btn({padding:"6px 14px",border:"2px solid #ddd",borderRadius:8,background:"#fff",fontSize:12,color:C.muted,marginBottom:12})}>← 목록으로</button>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            {tag(plan.region,C.blue)} {tag(plan.duration,C.amber)} {tag(plan.theme,"#5a9f6a")} {tag(plan.target,"#9f5a9f")}
          </div>
          <h2 style={{fontSize:22,fontWeight:700,color:C.navy,margin:"0 0 4px"}}>{plan.productName}</h2>
          <p style={{color:C.amber,fontWeight:600,margin:0,fontSize:14}}>{plan.slogan}</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={downloadTxt} style={btn({padding:"9px 16px",background:C.navy,color:"#fff",borderRadius:8,fontSize:12,fontWeight:600})}>📥 TXT</button>
          <button onClick={()=>{ navigator.clipboard.writeText(`${plan.productName}\n${plan.slogan}\n\n${plan.concept}`); alert("복사!"); }} style={btn({padding:"9px 16px",border:"2px solid #ddd",background:"#fff",borderRadius:8,fontSize:12})}>🔗 복사</button>
          <button onClick={()=>{ if(confirm("삭제할까요?")) onDelete(plan.id); }} style={btn({padding:"9px 14px",border:"2px solid #fdd",background:"#fff8f8",borderRadius:8,fontSize:12,color:C.red})}>🗑</button>
        </div>
      </div>

      {/* 탭 */}
      <div style={{display:"flex",gap:4,marginBottom:24,background:"#fff",borderRadius:10,padding:4,border:"1px solid #e8e5e0",flexWrap:"wrap"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={btn({flex:1,padding:"9px 8px",borderRadius:7,background:tab===t.id?C.navy:"transparent",color:tab===t.id?"#fff":C.muted,fontSize:13,fontWeight:tab===t.id?600:400,transition:"all .15s",minWidth:60})}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 기획서 탭 */}
      {tab==="overview" && (
        <>
          <Section title="CONCEPT">
            <p style={{color:C.text,lineHeight:1.8,margin:0,fontSize:14}}>{plan.concept}</p>
          </Section>

          <Section title="SCHEDULE">
            {plan.schedule.map((d,i)=>(
              <div key={i} style={{marginBottom:i<plan.schedule.length-1?24:0,paddingBottom:i<plan.schedule.length-1?24:0,borderBottom:i<plan.schedule.length-1?"1px solid #f0ede8":"none"}}>
                <span style={{background:C.navy,color:"#fff",padding:"4px 14px",borderRadius:20,fontSize:12,fontWeight:700,display:"inline-block",marginBottom:12}}>{d.day}</span>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  {[["🌅 오전",d.morning],["☀️ 오후",d.afternoon],["🌙 저녁",d.evening]].map(([lbl,val])=>(
                    <div key={lbl} style={{background:C.gray,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:11,color:C.light,marginBottom:4}}>{lbl}</div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:"#fffbf0",borderRadius:6,padding:"8px 14px",fontSize:12,color:C.amber}}>💡 {d.tip}</div>
              </div>
            ))}
          </Section>

          <Section title="HIGHLIGHTS">
            {plan.highlights.map((h,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
                <span style={{background:C.amber,color:"#fff",width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</span>
                <span style={{color:C.text,fontSize:14,lineHeight:1.6}}>{h}</span>
              </div>
            ))}
          </Section>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div style={{background:C.white,borderRadius:12,padding:20}}>
              <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:12,letterSpacing:1}}>✅ 포함</div>
              {plan.included.map((v,i)=><div key={i} style={{fontSize:13,color:C.text,marginBottom:6,lineHeight:1.5}}>• {v}</div>)}
            </div>
            <div style={{background:C.white,borderRadius:12,padding:20}}>
              <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:12,letterSpacing:1}}>❌ 불포함</div>
              {plan.excluded.map((v,i)=><div key={i} style={{fontSize:13,color:C.text,marginBottom:6,lineHeight:1.5}}>• {v}</div>)}
            </div>
          </div>

          <Section title="TARGET">
            <p style={{fontSize:14,color:C.text,lineHeight:1.7,margin:0}}>{plan.targetDesc}</p>
          </Section>

          <Section title="MARKETING COPY">
            {[
              {key:"instagram",label:"📸 인스타그램",color:"#c13584"},
              {key:"blog",label:"📝 블로그 소개",color:"#ff6b35"},
              {key:"kakao",label:"💬 카카오채널",color:"#f7b731"}
            ].map(({key,label,color})=>(
              <div key={key} style={{background:C.gray,borderRadius:8,padding:16,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:700,color}}>{label}</span>
                  <button onClick={()=>{navigator.clipboard.writeText(plan[key]||"");alert("복사!");}} style={btn({fontSize:11,color:C.light,border:"1px solid #ddd",borderRadius:4,padding:"3px 10px",background:"#fff"})}>복사</button>
                </div>
                <p style={{fontSize:13,color:C.text,lineHeight:1.7,margin:0}}>{plan[key]||"—"}</p>
              </div>
            ))}
          </Section>

          <div style={{background:C.navy,borderRadius:12,padding:24,textAlign:"center",color:"#fff",marginBottom:16}}>
            <div style={{fontSize:11,color:"#7eb8d4",marginBottom:6,letterSpacing:1}}>ESTIMATED PRICE</div>
            <div style={{fontSize:28,fontWeight:700,color:C.amber}}>{plan.estimatedPrice}</div>
          </div>
          <p style={{textAlign:"center",fontSize:11,color:C.light}}>한국관광공사 OpenAPI 데이터 기반 · TourPlanit 자동 생성 · {new Date(plan.createdAt).toLocaleString("ko-KR")}</p>
        </>
      )}

      {tab==="estimate" && <EstimateCalc plan={plan}/>}
      {tab==="cardnews" && <CardNews plan={plan}/>}
      {tab==="blog" && <BlogContent plan={plan} claudeKey={CLAUDE_KEY}/>}
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
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(loadHistory());
  const [detailItem, setDetailItem] = useState(null);

  const refresh = () => setHistory(loadHistory());

  const fetchSpots = async () => {
    try {
      const params = new URLSearchParams({serviceKey:KTO_KEY,numOfRows:"10",pageNo:"1",MobileOS:"ETC",MobileApp:"TourPlanit",_type:"json",listYN:"Y",arrange:"A",areaCode:REGION_CODES[form.region]||"1",contentTypeId:"12"});
      const res = await fetch(`/api/kto/B551011/KorService1/areaBasedList1?${params}`);
      const text = await res.text();
      try { const d=JSON.parse(text); return (d?.response?.body?.items?.item||[]).slice(0,8).map(s=>s.title).join(", "); }
      catch { return `${form.region} 주요 관광지`; }
    } catch { return `${form.region} 주요 관광지`; }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      setLoadingMsg("관광공사 데이터 수집 중...");
      const spots = await fetchSpots();
      setLoadingMsg("AI 기획서 생성 중...");
      const dayCount = form.duration==="당일치기"?1:form.duration==="1박 2일"?2:form.duration==="2박 3일"?3:4;
      const schedEx = Array.from({length:dayCount},(_,i)=>`{"day":"Day ${i+1}","morning":"오전일정","afternoon":"오후일정","evening":"저녁일정","tip":"팁"}`).join(",");
      const prompt = `여행 상품 기획 전문가로서 아래 조건으로 기획서를 JSON으로 작성해줘.
지역:${form.region} 기간:${form.duration}(${dayCount}일) 테마:${form.theme} 타깃:${form.target} 예산:${form.budget||"중간"} 특이사항:${form.special||"없음"} 관광지:${spots}

반드시 아래 JSON 형식만 출력. 다른 텍스트 절대 금지. 문자열 내 줄바꿈 금지.
{"productName":"상품명","slogan":"슬로건","concept":"컨셉 2문장","schedule":[${schedEx}],"highlights":["포인트1","포인트2","포인트3"],"included":["포함1","포함2","포함3","포함4"],"excluded":["불포함1","불포함2","불포함3"],"targetDesc":"타깃 1문장","estimatedPrice":"1인 XX만원대","instagram":"인스타카피 #해시태그","blog":"블로그소개 150자","kakao":"카카오홍보 50자"}`;

      const res = await fetch("/api/claude/v1/messages",{
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
      refresh();
      setResult(saved);
      setDetailItem(saved);
      setPage("detail");
    } catch(e) { alert("오류: "+e.message); }
    finally { setLoading(false); setLoadingMsg(""); }
  };

  const deleteItem = (id) => {
    const next = history.filter(h=>h.id!==id);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
    refresh();
    setPage("history");
  };

  const Nav = () => (
    <header style={{background:C.navy,height:56,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",position:"sticky",top:0,zIndex:100}}>
      <div onClick={()=>setPage("home")} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
        <span style={{fontSize:18,color:"#fff",fontWeight:700}}>🗺️ TourPlanit</span>
        <span style={{fontSize:10,color:"#7eb8d4",background:"rgba(255,255,255,0.1)",padding:"2px 8px",borderRadius:20}}>투어플래닛</span>
      </div>
      <div style={{display:"flex",gap:4}}>
        {[["새 기획서","form"],["기획서 목록","history"]].map(([label,pg])=>(
          <button key={pg} onClick={()=>setPage(pg)} style={btn({padding:"7px 14px",borderRadius:6,background:page===pg?"rgba(255,255,255,0.15)":"transparent",color:page===pg?"#fff":"#7eb8d4",fontSize:13})}>
            {label}
          </button>
        ))}
      </div>
    </header>
  );

  const PlanCard = ({plan,onClick,onDelete}) => (
    <div onClick={onClick} style={{background:C.white,borderRadius:12,padding:20,cursor:"pointer",border:"1px solid #e8e5e0",transition:"box-shadow .15s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.08)"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>{tag(plan.region,C.blue)} {tag(plan.duration,C.amber)} {tag(plan.theme,"#5a9f6a")}</div>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>{plan.productName}</div>
          <div style={{fontSize:13,color:C.amber,fontWeight:600,marginBottom:6}}>{plan.slogan}</div>
          <div style={{fontSize:12,color:C.muted}}>{new Date(plan.createdAt).toLocaleDateString("ko-KR")} · {plan.estimatedPrice}</div>
        </div>
        <button onClick={e=>{e.stopPropagation();if(confirm("삭제할까요?"))onDelete(plan.id);}} style={btn({background:"none",color:"#ccc",fontSize:20,padding:"0 4px"})}>×</button>
      </div>
    </div>
  );

  const wrap = {maxWidth:860,margin:"0 auto",padding:"32px 24px"};

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",color:C.text}}>
      <Nav/>

      {page==="home" && (
        <>
          <div style={{background:`linear-gradient(135deg,${C.navy} 0%,${C.blue} 100%)`,padding:"64px 24px",textAlign:"center",color:"#fff"}}>
            <p style={{fontSize:11,color:"#7eb8d4",marginBottom:12,letterSpacing:2}}>TOUR PRODUCT PLANNER</p>
            <h1 style={{fontSize:34,fontWeight:700,margin:"0 0 14px",lineHeight:1.3}}>관광 상품 기획서를<br/>30초 만에 완성하세요</h1>
            <p style={{fontSize:14,color:"#b8d4e8",margin:"0 0 32px"}}>기획서 · 견적서 · 카드뉴스 · 블로그 · 카카오 메시지 자동 생성</p>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setPage("form")} style={btn({padding:"13px 32px",background:C.amber,color:"#fff",borderRadius:8,fontSize:15,fontWeight:700})}>기획 시작하기 →</button>
              {history.length>0&&<button onClick={()=>setPage("history")} style={btn({padding:"13px 24px",background:"rgba(255,255,255,0.12)",color:"#fff",border:"1px solid rgba(255,255,255,0.25)",borderRadius:8,fontSize:13})}>저장된 기획서 {history.length}개</button>}
            </div>
          </div>
          <div style={wrap}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:40}}>
              {[["📋","기획서","AI 상품 기획 자동 생성"],["💰","견적서","인원별 가격 계산"],["🖼️","카드뉴스","SNS 캐러셀 생성"],["✍️","블로그","블로그 본문 자동 작성"],["💬","카카오","채널 메시지 생성"]].map(([icon,title,desc])=>(
                <div key={title} style={{background:C.white,borderRadius:12,padding:"20px 14px",textAlign:"center"}}>
                  <div style={{fontSize:28,marginBottom:8}}>{icon}</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:4}}>{title}</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>{desc}</div>
                </div>
              ))}
            </div>
            {history.length>0&&(
              <>
                <div style={{fontSize:15,fontWeight:700,color:C.navy,marginBottom:14}}>최근 기획서</div>
                <div style={{display:"grid",gap:10}}>
                  {history.slice(0,3).map(h=>(
                    <PlanCard key={h.id} plan={h} onClick={()=>{setDetailItem(h);setPage("detail");}} onDelete={deleteItem}/>
                  ))}
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
          {[
            {label:"지역 선택",key:"region",options:REGIONS,color:C.blue},
            {label:"여행 기간",key:"duration",options:DURATIONS,color:C.blue},
            {label:"여행 테마",key:"theme",options:THEMES,color:C.amber},
            {label:"타깃 고객",key:"target",options:TARGETS,color:C.amber}
          ].map(({label,key,options,color})=>(
            <div key={key} style={{marginBottom:24}}>
              <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:10}}>{label} <span style={{color:C.red}}>*</span></label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{options.map(opt=>chip(opt,form[key]===opt,color,()=>setForm({...form,[key]:opt})))}</div>
            </div>
          ))}
          <div style={{marginBottom:20}}>
            <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>예산대 <span style={{color:C.muted,fontWeight:400}}>(선택)</span></label>
            <input value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} placeholder="예) 1인 20만원대, 단체 100만원 이하"
              style={{width:"100%",padding:"11px 14px",borderRadius:8,border:"2px solid #e0ddd8",fontSize:13,outline:"none",boxSizing:"border-box",background:C.white}}/>
          </div>
          <div style={{marginBottom:32}}>
            <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>특이사항 <span style={{color:C.muted,fontWeight:400}}>(선택)</span></label>
            <textarea value={form.special} onChange={e=>setForm({...form,special:e.target.value})} placeholder="예) 노쇼핑 원칙, 노약자 포함, 외국인 동반 등" rows={3}
              style={{width:"100%",padding:"11px 14px",borderRadius:8,border:"2px solid #e0ddd8",fontSize:13,outline:"none",resize:"none",boxSizing:"border-box",background:C.white}}/>
          </div>
          <button onClick={handleGenerate} disabled={!form.region||!form.duration||!form.theme||!form.target||loading}
            style={btn({width:"100%",padding:"15px",borderRadius:8,fontSize:15,fontWeight:700,background:loading||!form.region||!form.duration||!form.theme||!form.target?C.muted:C.navy,color:"#fff"})}>
            {loading?`⏳ ${loadingMsg}`:"✨ 기획서 자동 생성"}
          </button>
        </div>
      )}

      {page==="history" && (
        <div style={wrap}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{fontSize:20,fontWeight:700,color:C.navy,margin:0}}>기획서 목록 <span style={{fontSize:13,color:C.muted,fontWeight:400}}>({history.length}개)</span></h2>
            <button onClick={()=>setPage("form")} style={btn({padding:"9px 18px",background:C.amber,color:"#fff",borderRadius:8,fontSize:13,fontWeight:600})}>+ 새 기획서</button>
          </div>
          {history.length===0?(
            <div style={{textAlign:"center",padding:"80px 0",color:C.muted}}>
              <div style={{fontSize:48,marginBottom:16}}>📋</div>
              <div style={{fontSize:15,marginBottom:16}}>저장된 기획서가 없어요</div>
              <button onClick={()=>setPage("form")} style={btn({padding:"12px 28px",background:C.navy,color:"#fff",borderRadius:8,fontSize:14})}>첫 기획서 만들기</button>
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
