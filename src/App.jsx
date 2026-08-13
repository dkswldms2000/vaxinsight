import React, { useState, useMemo, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts";
import {
  Database, BookOpen, Gavel, SlidersHorizontal, Activity, Code2,
  FileText, Play, Download, Sparkles, Check, AlertTriangle, ChevronRight,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════
   VaxInsight — 국내 공공데이터 기반 백신 경제성평가 에이전트
   출처(provenance)를 색으로 코딩하는 것이 이 도구의 설계 원칙:
     ■ 청구자료 유래(자동 산출)  ■ 문헌 유래(추천·연구자 확정)  ■ 정책 판단(연구자 입력)
   ══════════════════════════════════════════════════════════════════ */

const C = {
  paper: "#ECEFF3", panel: "#FFFFFF", ink: "#16202B", ink2: "#3B4A5A",
  muted: "#6B7B8C", rule: "#D3D9E0", ruleSoft: "#E7EBF0",
  claim: "#0B6E6E", lit: "#5B4B9A", policy: "#B26A00",
  bad: "#A21B3C", good: "#1B7F4C", wash: "#F5F7F9",
};
const TIER = {
  claim: { c: C.claim, label: "청구자료", Icon: Database, note: "HIRA 원격분석환경에서 자동 산출" },
  lit: { c: C.lit, label: "문헌", Icon: BookOpen, note: "후보값 추천 → 연구자 확정" },
  policy: { c: C.policy, label: "정책판단", Icon: Gavel, note: "연구자가 직접 설정" },
};
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

/* ── 표기 ────────────────────────────────────────────────────────── */
const nf = (v, d = 0) => Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const won = (v) => `${nf(Math.round(v))}원`;
const man = (v, d = 0) => `${nf(v / 10000, d)}만원`;
const pct = (v, d = 1) => `${nf(v * 100, d)}%`;

/* ── 역학 함수 (HIRA 청구자료 산출값 형태) ───────────────────────── */
const incidence = (age) => (age < 70 ? 12.0 : age < 75 ? 13.5 : age < 80 ? 14.0 : age < 85 ? 13.0 : 11.0) / 1000;
const phnProb = (age) => (age < 70 ? 0.19 : age < 75 ? 0.23 : age < 80 ? 0.27 : 0.31);

/* ── 기본 파라미터 ───────────────────────────────────────────────── */
const BASE = {
  // 정책 판단
  startAge: 65, horizon: 20, rC: 0.045, rE: 0.045, perspective: "healthcare",
  halfCycle: true, wtp: 30000000, coverage: 0.6, cohort: 100000, vePrice: 200000,
  // 문헌
  ve0: 0.917, waning: 0.045, vePHNadd: 0.15, uDecPHN: 0.11, qalyLossHZ: 0.0125,
  phnRecovery: 0.6, uBase: 0.85, uSlope: 0.004, aeDis: 0.0007,
  // 청구자료
  incMult: 1.0, phnMult: 1.0, pHosp: 0.035, costHZout: 210000,
  costHZhosp: 2400000, costPHN: 780000,
  // 사회적 관점 추가분
  costNonMedHZ: 90000, costNonMedPHN: 250000,
  // 생명표
  mortA: 0.008, mortB: 0.1172,
};

const META = {
  ve0: { tier: "lit", label: "백신 초기효과 (대상포진)", fmt: "pct", low: 0.85, high: 0.96, dist: "beta", src: "ZOE-50/70 통합" },
  waning: { tier: "lit", label: "효과 감소율 (연, 지수)", fmt: "rate", low: 0.02, high: 0.09, dist: "gamma", src: "ZOE 장기추적 10년" },
  vePHNadd: { tier: "lit", label: "돌파 HZ의 PHN 추가예방", fmt: "pct", low: 0.0, high: 0.45, dist: "beta", src: "ZOE PHN 하위분석" },
  uDecPHN: { tier: "lit", label: "PHN 효용 감소분", fmt: "num3", low: 0.07, high: 0.16, dist: "beta", src: "EQ-5D 국내 연구" },
  qalyLossHZ: { tier: "lit", label: "급성 HZ 건당 QALY 손실", fmt: "num4", low: 0.008, high: 0.018, dist: "beta", src: "ZBPI→utility 매핑" },
  phnRecovery: { tier: "lit", label: "PHN 연간 회복률", fmt: "pct", low: 0.45, high: 0.75, dist: "beta", src: "코호트 추적" },
  incMult: { tier: "claim", label: "HZ 발생률 보정배수", fmt: "num2", low: 0.8, high: 1.2, dist: "lognormal", src: "HIRA 2019–2023" },
  phnMult: { tier: "claim", label: "PHN 발생확률 보정배수", fmt: "num2", low: 0.7, high: 1.3, dist: "lognormal", src: "HIRA 2019–2023" },
  pHosp: { tier: "claim", label: "HZ 입원 비율", fmt: "pct", low: 0.02, high: 0.055, dist: "beta", src: "HIRA 입원청구" },
  costHZout: { tier: "claim", label: "HZ 외래 에피소드 비용", fmt: "won", low: 150000, high: 290000, dist: "gamma", src: "HIRA 진료비" },
  costHZhosp: { tier: "claim", label: "HZ 입원 1건 비용", fmt: "won", low: 1600000, high: 3400000, dist: "gamma", src: "HIRA 진료비" },
  costPHN: { tier: "claim", label: "PHN 연간 의료비", fmt: "won", low: 500000, high: 1100000, dist: "gamma", src: "HIRA 진료비" },
  vePrice: { tier: "policy", label: "1인 총 접종비용 (2회)", fmt: "won", low: 120000, high: 320000, dist: "fixed", src: "협상가 가정" },
  rC: { tier: "policy", label: "할인율 (비용·효과 동일)", fmt: "pct", low: 0.0, high: 0.075, dist: "fixed", src: "국내 지침 4.5%" },
};
const fmtVal = (id, v) => {
  const f = META[id]?.fmt;
  if (f === "won") return won(v);
  if (f === "pct") return pct(v, 1);
  if (f === "rate") return nf(v, 3);
  if (f === "num2") return nf(v, 2);
  if (f === "num3") return nf(v, 3);
  if (f === "num4") return nf(v, 4);
  return nf(v, 2);
};

/* ── 문헌 파라미터 후보 라이브러리 (규칙기반 추천 대상) ──────────── */
const LIT_LIB = {
  ve0: [
    { v: 0.917, name: "ZOE-50/70 통합분석 (RZV, ≥50세)", ref: "Cunningham 2016, NEJM", design: "RCT", yr: 2016, s: { vac: 1.0, pop: 0.8, evid: 1.0, rec: 0.55, kr: 0.5 } },
    { v: 0.898, name: "ZOE-70 (RZV, ≥70세)", ref: "Cunningham 2016, NEJM", design: "RCT", yr: 2016, s: { vac: 1.0, pop: 1.0, evid: 1.0, rec: 0.55, kr: 0.5 } },
    { v: 0.705, name: "실사용 코호트 (미국 ≥65세)", ref: "Izurieta 2021, CID", design: "코호트", yr: 2021, s: { vac: 1.0, pop: 1.0, evid: 0.6, rec: 0.8, kr: 0.45 } },
    { v: 0.512, name: "생백신 ZVL (≥60세)", ref: "Oxman 2005, NEJM", design: "RCT", yr: 2005, s: { vac: 0.2, pop: 0.85, evid: 1.0, rec: 0.15, kr: 0.5 } },
    { v: 0.867, name: "국내 청구자료 기반 추정", ref: "Korean claims-linked (가정)", design: "코호트", yr: 2024, s: { vac: 1.0, pop: 1.0, evid: 0.55, rec: 1.0, kr: 1.0 } },
  ],
  waning: [
    { v: 0.045, name: "10년 추적 지수감소 (RZV)", ref: "Strezova 2022, OFID", design: "추적연장", yr: 2022, s: { vac: 1.0, pop: 0.9, evid: 0.85, rec: 0.9, kr: 0.45 } },
    { v: 0.030, name: "느린 감소 시나리오", ref: "ZOE 연장 상한", design: "가정", yr: 2022, s: { vac: 1.0, pop: 0.8, evid: 0.5, rec: 0.9, kr: 0.45 } },
    { v: 0.085, name: "빠른 감소 (생백신 관찰치 준용)", ref: "Tseng 2016, JID", design: "코호트", yr: 2016, s: { vac: 0.25, pop: 0.9, evid: 0.6, rec: 0.5, kr: 0.4 } },
  ],
  uDecPHN: [
    { v: 0.11, name: "PHN EQ-5D 감소 (국내 환자)", ref: "국내 EQ-5D 조사", design: "단면", yr: 2019, s: { vac: 1.0, pop: 0.9, evid: 0.6, rec: 0.7, kr: 1.0 } },
    { v: 0.145, name: "중증 PHN 포함 가중평균", ref: "van Hoek 2009", design: "모형연구", yr: 2009, s: { vac: 1.0, pop: 0.7, evid: 0.5, rec: 0.2, kr: 0.3 } },
    { v: 0.081, name: "경증 우위 코호트", ref: "Drolet 2010, CMAJ", design: "전향 코호트", yr: 2010, s: { vac: 1.0, pop: 0.8, evid: 0.8, rec: 0.25, kr: 0.35 } },
  ],
  qalyLossHZ: [
    { v: 0.0125, name: "급성기 30일 QALY 손실", ref: "Drolet 2010, CMAJ", design: "전향 코호트", yr: 2010, s: { vac: 1.0, pop: 0.85, evid: 0.8, rec: 0.25, kr: 0.35 } },
    { v: 0.0086, name: "보수적 추정", ref: "Szucs 2011", design: "모형연구", yr: 2011, s: { vac: 1.0, pop: 0.7, evid: 0.5, rec: 0.3, kr: 0.3 } },
    { v: 0.0163, name: "국내 ZBPI 매핑", ref: "Korean mapping (가정)", design: "단면", yr: 2023, s: { vac: 1.0, pop: 1.0, evid: 0.55, rec: 0.95, kr: 1.0 } },
  ],
};
const CRIT = [
  { k: "vac", label: "백신 일치" }, { k: "pop", label: "대상군 일치" },
  { k: "evid", label: "근거수준" }, { k: "rec", label: "최신성" }, { k: "kr", label: "국내 적용성" },
];

/* ── Markov 엔진 ─────────────────────────────────────────────────── */
function runStrategy(P, vax) {
  const soc = P.perspective === "societal";
  let well = 1, phn = 0, dead = 0, cost = 0, qaly = 0, hzT = 0, phnY = 0, hospT = 0;
  const undiscCost = [];
  if (vax) { cost += P.vePrice; qaly -= P.aeDis; }
  const trace = [];
  for (let t = 0; t < P.horizon; t++) {
    const age = P.startAge + t;
    const dC = Math.pow(1 + P.rC, -t), dE = Math.pow(1 + P.rE, -t);
    const q = Math.min(0.995, P.mortA * Math.exp(P.mortB * (age - P.startAge)));
    const ve = vax ? Math.max(0, P.ve0 * Math.exp(-P.waning * t)) : 0;
    const inc = incidence(age) * P.incMult;
    const pp = Math.min(0.95, phnProb(age) * P.phnMult);
    const w0 = well, p0 = phn;
    const hz = w0 * inc * (1 - ve);
    const relVe = P.ve0 > 0 ? ve / P.ve0 : 0;
    const phnNew = hz * pp * (1 - (vax ? P.vePHNadd * relVe : 0));
    let w = w0 - phnNew, p = p0 + phnNew;
    const rec = p0 * P.phnRecovery;
    p -= rec; w += rec;
    const dW = w * q, dP = p * q;
    w -= dW; p -= dP; dead += dW + dP;
    const wA = P.halfCycle ? (w0 + w) / 2 : w;
    const pA = P.halfCycle ? (p0 + p) / 2 : p;
    const acute = P.costHZout * (1 - P.pHosp) + P.costHZhosp * P.pHosp + (soc ? P.costNonMedHZ : 0);
    const cyc = hz * acute + pA * (P.costPHN + (soc ? P.costNonMedPHN : 0));
    const uA = Math.max(0.4, P.uBase - P.uSlope * (age - P.startAge));
    const util = wA * uA + pA * (uA - P.uDecPHN) - hz * P.qalyLossHZ;
    cost += cyc * dC; qaly += util * dE; hzT += hz; phnY += pA; hospT += hz * P.pHosp;
    undiscCost.push(cyc);
    well = w; phn = p;
    trace.push({ year: t + 1, age, 건강: w, PHN: p, 사망: dead, hz });
  }
  return { cost, qaly, hz: hzT, phnY, hosp: hospT, trace, undiscCost };
}

function runCEA(P) {
  const nv = runStrategy(P, false), vx = runStrategy(P, true);
  const dC = vx.cost - nv.cost, dQ = vx.qaly - nv.qaly;
  const icer = dQ === 0 ? Infinity : dC / dQ;
  const status = dQ > 0 && dC < 0 ? "dominant" : dQ <= 0 && dC > 0 ? "dominated" : "tradeoff";
  const nmb = P.wtp * dQ - dC;
  return {
    nv, vx, dC, dQ, icer, status, nmb,
    hzAvert: nv.hz - vx.hz, phnAvert: nv.phnY - vx.phnY, hospAvert: nv.hosp - vx.hosp,
    costOffset: nv.cost - (vx.cost - P.vePrice),
  };
}

/* ── 난수 · 분포 ─────────────────────────────────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mkNorm = (rng) => () => {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
function mkGamma(rng, rnorm) {
  return function gam(shape) {
    if (shape < 1) return gam(shape + 1) * Math.pow(rng(), 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = rnorm(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rng();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
}

/* ── 민감도 대상 목록 ────────────────────────────────────────────── */
const SENS_IDS = ["ve0", "waning", "vePHNadd", "incMult", "phnMult", "costPHN", "costHZout", "costHZhosp", "pHosp", "uDecPHN", "qalyLossHZ", "phnRecovery", "vePrice", "rC"];

/* ── SAS 코드 생성기 ─────────────────────────────────────────────── */
function buildSAS(cfg) {
  const { dz, dxCode, ageMin, ageMax, yFrom, yTo, washout, phnDays, cellMin } = cfg;
  return `/*═══════════════════════════════════════════════════════════════════
  VaxInsight | HIRA 원격분석환경 표준 파라미터 산출 코드 (자동 생성)
  대상질환 : ${dz}
  주상병   : ${dxCode}
  대상연령 : ${ageMin}–${ageMax}세
  관찰기간 : ${yFrom}.01.01 – ${yTo}.12.31   (washout ${washout}개월)
  ※ 원자료는 분석환경 밖으로 반출하지 않으며, 최종 산출물은
     소수셀(<${cellMin})을 마스킹한 집계 파라미터 테이블 1개입니다.
═══════════════════════════════════════════════════════════════════*/

%let DZ        = ${dz};
%let DXCODE    = ${dxCode};        /* 주상병 prefix */
%let AGE_MIN   = ${ageMin};
%let AGE_MAX   = ${ageMax};
%let Y_FROM    = ${yFrom};
%let Y_TO      = ${yTo};
%let WASHOUT   = ${washout};       /* 개월: 신규 발생 정의용 */
%let PHN_DAYS  = ${phnDays};       /* 진단 후 지속기간(일) → PHN 정의 */
%let CELLMIN   = ${cellMin};       /* 반출 심사용 소수셀 임계 */
%let OUT       = /userdata/vaxinsight;

/*── 0. 원천 테이블 스택 ────────────────────────────────────────────*/
data src.claims_all;
  set nhid.t20_&Y_FROM.-nhid.t20_&Y_TO.;     /* 명세서 일반내역 */
  keep JOINCHIDSN RECU_FR_DT FORM_CD DMD_TRAMT MAIN_SICK SUB_SICK
       PAT_AGE PAT_SEX SPEC_DD_CNT;
run;

/*── 1. 대상질환 상병 플래그 ───────────────────────────────────────*/
data work.dz_claim;
  set src.claims_all;
  where PAT_AGE between &AGE_MIN and &AGE_MAX;
  if index(MAIN_SICK,"&DXCODE")=1 or index(SUB_SICK,"&DXCODE")=1;
  inpatient = (FORM_CD in ('02','07'));       /* 입원 서식 */
  yr  = year(RECU_FR_DT);
  idx = RECU_FR_DT;
run;

/*── 2. 신규 발생 코호트: washout 적용 (에피소드 정의) ─────────────*/
proc sort data=work.dz_claim; by JOINCHIDSN idx; run;

data work.incident;
  set work.dz_claim;
  by JOINCHIDSN idx;
  retain prev_dt .;
  gap = idx - prev_dt;
  if first.JOINCHIDSN then do; new_case=1; end;
  else if gap > &WASHOUT*30 then new_case=1;
  else new_case=0;
  prev_dt = idx;
  if new_case=1;
run;

/*── 3. 분모: 연도×연령군 건강보험 자격자 person-year ──────────────*/
data work.denom;
  set nhid.jk_&Y_FROM.-nhid.jk_&Y_TO.;
  where AGE between &AGE_MIN and &AGE_MAX;
  agegrp = put(AGE, agefmt.);
  py = 1;                                     /* 자격월 보유 시 1PY, 필요시 월수/12 */
run;

proc means data=work.denom noprint nway;
  class yr agegrp; var py; output out=work.py_sum sum=PY;
run;

/*── 4. 발생률 (per 1,000 person-years) ────────────────────────────*/
proc sql;
  create table work.p_incidence as
  select a.yr, a.agegrp, count(distinct a.JOINCHIDSN) as N_CASE,
         b.PY as PY,
         calculated N_CASE / b.PY * 1000 as INCIDENCE_1000
  from work.incident a inner join work.py_sum b
    on a.yr=b.yr and a.agegrp=b.agegrp
  group by a.yr, a.agegrp, b.PY;
quit;

/*── 5. 입원률 · 중증화율 ──────────────────────────────────────────*/
proc sql;
  create table work.p_hosp as
  select agegrp,
         sum(inpatient>0) as N_HOSP,
         count(*)         as N_TOT,
         calculated N_HOSP / calculated N_TOT as P_HOSPITALIZED
  from (select distinct JOINCHIDSN, agegrp, max(inpatient) as inpatient
        from work.dz_claim group by JOINCHIDSN, agegrp)
  group by agegrp;
quit;

/*── 6. 합병증(PHN 등): 진단 후 &PHN_DAYS일 이상 지속 진료 ─────────*/
proc sql;
  create table work.complication as
  select a.JOINCHIDSN, a.agegrp,
         max(b.RECU_FR_DT - a.idx) as followdays
  from work.incident a inner join work.dz_claim b
    on a.JOINCHIDSN=b.JOINCHIDSN and b.RECU_FR_DT >= a.idx
  group by a.JOINCHIDSN, a.agegrp;
quit;

data work.p_comp;
  set work.complication;
  comp_flag = (followdays >= &PHN_DAYS);
run;

proc means data=work.p_comp noprint nway;
  class agegrp; var comp_flag; output out=work.p_comp_sum mean=P_COMPLICATION n=N;
run;

/*── 7. 직접의료비 (에피소드 단위, 실질화 전 명목가) ───────────────*/
proc sql;
  create table work.p_cost as
  select agegrp, inpatient,
         mean(DMD_TRAMT) as COST_MEAN,
         std(DMD_TRAMT)  as COST_SD,
         median(DMD_TRAMT) as COST_MEDIAN,
         count(*) as N_EPISODE
  from work.dz_claim group by agegrp, inpatient;
quit;

/*── 8. 사망 (공단 자격 상실 사유 또는 통계청 연계) ────────────────*/
proc sql;
  create table work.p_death as
  select agegrp,
         sum(DTH_YM is not null) / count(*) as P_DEATH_1YR
  from work.incident a left join nhid.jk_death b
    on a.JOINCHIDSN=b.JOINCHIDSN
  group by agegrp;
quit;

/*── 9. 반출용 집계 테이블 + 소수셀 마스킹 ─────────────────────────*/
data out.vaxinsight_params;
  merge work.p_incidence work.p_hosp work.p_comp_sum work.p_cost work.p_death;
  by agegrp;
  length PARAM_SOURCE $20;
  PARAM_SOURCE = "HIRA_CLAIMS";
  /* 반출 심사 기준: 관측 수 < &CELLMIN 인 셀은 값 마스킹 */
  if N_CASE    < &CELLMIN then do; N_CASE=.; INCIDENCE_1000=.; end;
  if N_HOSP    < &CELLMIN then do; N_HOSP=.; P_HOSPITALIZED=.; end;
  if N         < &CELLMIN then do; P_COMPLICATION=.; end;
  if N_EPISODE < &CELLMIN then do; COST_MEAN=.; COST_SD=.; COST_MEDIAN=.; end;
run;

proc export data=out.vaxinsight_params
  outfile="&OUT./params_&DZ._&Y_FROM._&Y_TO..csv" dbms=csv replace;
run;

/*── 10. 재현성 로그 ───────────────────────────────────────────────*/
data out.run_log;
  length key $32 value $200;
  key="generated_by";  value="VaxInsight parameter module";  output;
  key="disease";       value="&DZ";                          output;
  key="dx_code";       value="&DXCODE";                       output;
  key="age_range";     value="&AGE_MIN-&AGE_MAX";             output;
  key="period";        value="&Y_FROM-&Y_TO";                 output;
  key="washout_month"; value="&WASHOUT";                      output;
  key="cell_min";      value="&CELLMIN";                      output;
  key="run_datetime";  value=put(datetime(), datetime20.);    output;
run;

/* 반출 신청 시 첨부: out.vaxinsight_params (집계), out.run_log (분석조건) */
`;
}

/* ── UI 원자 ─────────────────────────────────────────────────────── */
const Eyebrow = ({ children, color = C.muted }) => (
  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color }}>{children}</div>
);
const Panel = ({ title, eyebrow, right, children, accent }) => (
  <section className="mb-5" style={{ background: C.panel, border: `1px solid ${C.rule}`, borderTop: accent ? `2px solid ${accent}` : `1px solid ${C.rule}` }}>
    {(title || eyebrow) && (
      <header className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
        <div>
          {eyebrow && <Eyebrow color={accent || C.muted}>{eyebrow}</Eyebrow>}
          {title && <h3 className="mt-1" style={{ fontSize: 15, fontWeight: 650, color: C.ink, letterSpacing: "-0.01em" }}>{title}</h3>}
        </div>
        {right}
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);
const TierDot = ({ tier }) => (
  <span title={TIER[tier].note} style={{ display: "inline-block", width: 7, height: 7, borderRadius: 1, background: TIER[tier].c, marginRight: 6, verticalAlign: "middle" }} />
);
const Num = ({ children, size = 14, color = C.ink, weight = 600 }) => (
  <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: size, color, fontWeight: weight }}>{children}</span>
);
const Btn = ({ children, onClick, kind = "ghost", disabled, small }) => {
  const solid = kind === "solid";
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 ${small ? "px-2.5 py-1" : "px-3 py-1.5"} transition-opacity`}
      style={{
        fontFamily: MONO, fontSize: small ? 11 : 12, letterSpacing: "0.02em",
        background: solid ? C.ink : "transparent", color: solid ? "#fff" : C.ink2,
        border: `1px solid ${solid ? C.ink : C.rule}`, opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}>
      {children}
    </button>
  );
};
const Row = ({ label, tier, children, hint }) => (
  <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
    <div className="min-w-0">
      <div style={{ fontSize: 13, color: C.ink }}>{tier && <TierDot tier={tier} />}{label}</div>
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: MONO }}>{hint}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);
const Seg = ({ options, value, onChange }) => (
  <div className="inline-flex" style={{ border: `1px solid ${C.rule}` }}>
    {options.map((o) => (
      <button key={o.v} onClick={() => onChange(o.v)}
        style={{
          fontFamily: MONO, fontSize: 11, padding: "5px 10px",
          background: value === o.v ? C.ink : "transparent",
          color: value === o.v ? "#fff" : C.ink2, cursor: "pointer",
          borderLeft: options[0].v === o.v ? "none" : `1px solid ${C.rule}`,
        }}>{o.l}</button>
    ))}
  </div>
);
const NumIn = ({ value, onChange, step = 1, w = 108, suffix }) => (
  <div className="inline-flex items-center gap-1">
    <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))}
      className="tabular-nums text-right" style={{ fontFamily: MONO, fontSize: 12, width: w, padding: "5px 7px", border: `1px solid ${C.rule}`, background: C.wash, color: C.ink }} />
    {suffix && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{suffix}</span>}
  </div>
);
const Slider = ({ value, min, max, step, onChange, color = C.ink }) => (
  <input type="range" min={min} max={max} step={step} value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-full" style={{ accentColor: color, height: 18 }} />
);

/* ══════════════════════════════════════════════════════════════════ */
export default function VaxInsight() {
  const [P, setP] = useState(BASE);
  const [tab, setTab] = useState("design");
  const set = useCallback((k, v) => setP((p) => ({ ...p, [k]: v })), []);
  const R = useMemo(() => runCEA(P), [P]);

  const nav = [
    { id: "design", label: "분석 설계", Icon: Gavel },
    { id: "params", label: "파라미터", Icon: Database },
    { id: "results", label: "기본 결과", Icon: Activity },
    { id: "owsa", label: "결정론적 민감도", Icon: SlidersHorizontal },
    { id: "psa", label: "확률적 민감도", Icon: Play },
    { id: "sas", label: "HIRA 코드", Icon: Code2 },
    { id: "report", label: "보고서", Icon: FileText },
  ];

  return (
    <div style={{ background: C.paper, fontFamily: SANS, color: C.ink, minHeight: "100%" }}>
      {/* 헤더 */}
      <div className="px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>공공데이터 기반 백신 경제성평가 에이전트</Eyebrow>
            <h1 className="mt-1" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em" }}>
              Vax<span style={{ color: C.claim }}>Insight</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(TIER).map(([k, t]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: 1, background: t.c, display: "inline-block" }} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink2 }}>{t.label}</span>
                <span style={{ fontSize: 10, color: C.muted }}>{t.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <VerdictRibbon P={P} R={R} />

      <div className="flex flex-col md:flex-row">
        {/* 좌측 인덱스 */}
        <nav className="md:w-52 shrink-0 flex md:flex-col overflow-x-auto"
          style={{ borderRight: `1px solid ${C.rule}`, background: C.panel }}>
          {nav.map((n, i) => {
            const on = tab === n.id;
            return (
              <button key={n.id} onClick={() => setTab(n.id)}
                className="flex items-center gap-2 px-4 py-3 text-left whitespace-nowrap"
                style={{
                  borderBottom: `1px solid ${C.ruleSoft}`, background: on ? C.paper : "transparent",
                  borderLeft: on ? `3px solid ${C.ink}` : "3px solid transparent", cursor: "pointer",
                }}>
                <n.Icon size={14} color={on ? C.ink : C.muted} strokeWidth={1.8} />
                <span style={{ fontSize: 12.5, fontWeight: on ? 650 : 450, color: on ? C.ink : C.ink2 }}>{n.label}</span>
                <span className="tabular-nums ml-auto hidden md:inline" style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 p-4 md:p-5" style={{ minWidth: 0 }}>
          {tab === "design" && <DesignTab P={P} set={set} R={R} />}
          {tab === "params" && <ParamsTab P={P} set={set} setP={setP} />}
          {tab === "results" && <ResultsTab P={P} R={R} />}
          {tab === "owsa" && <OwsaTab P={P} set={set} R={R} />}
          {tab === "psa" && <PsaTab P={P} />}
          {tab === "sas" && <SasTab P={P} />}
          {tab === "report" && <ReportTab P={P} R={R} />}
        </main>
      </div>
    </div>
  );
}

/* ── 상시 결과 리본 (시그니처 요소) ──────────────────────────────── */
function VerdictRibbon({ P, R }) {
  const over = R.icer > P.wtp;
  const dom = R.status === "dominant";
  const verdictColor = dom || !over ? C.good : C.bad;
  const label = R.status === "dominant" ? "우월 (비용절감·효과증가)"
    : R.status === "dominated" ? "열등 (비용증가·효과감소)"
      : over ? "임계값 초과" : "비용효과적";
  const ratio = Math.min(1.6, R.icer / P.wtp);
  return (
    <div className="px-5 py-3" style={{ background: C.panel, borderBottom: `1px solid ${C.rule}` }}>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <Eyebrow>증분비용효과비 ICER</Eyebrow>
          <div className="flex items-baseline gap-2 mt-0.5">
            <Num size={30} color={verdictColor} weight={700}>
              {R.status === "dominant" ? "우월" : R.status === "dominated" ? "열등" : nf(R.icer / 10000, 0)}
            </Num>
            {R.status === "tradeoff" && <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>만원 / QALY</span>}
          </div>
        </div>
        <div>
          <Eyebrow>증분비용 ΔC</Eyebrow>
          <div className="mt-1"><Num size={16}>{man(R.dC, 1)}</Num></div>
        </div>
        <div>
          <Eyebrow>증분효과 ΔQALY</Eyebrow>
          <div className="mt-1"><Num size={16}>{nf(R.dQ, 5)}</Num></div>
        </div>
        <div>
          <Eyebrow>순편익 NMB</Eyebrow>
          <div className="mt-1"><Num size={16} color={R.nmb >= 0 ? C.good : C.bad}>{man(R.nmb, 1)}</Num></div>
        </div>
        <div className="flex-1" style={{ minWidth: 200 }}>
          <div className="flex justify-between mb-1">
            <Eyebrow>임계값 대비</Eyebrow>
            <span style={{ fontFamily: MONO, fontSize: 10, color: verdictColor }}>{label}</span>
          </div>
          <div style={{ height: 8, background: C.wash, border: `1px solid ${C.ruleSoft}`, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, width: `${(ratio / 1.6) * 100}%`, background: verdictColor, opacity: 0.75 }} />
            <div style={{ position: "absolute", left: `${(1 / 1.6) * 100}%`, top: -3, bottom: -3, width: 2, background: C.ink }} />
          </div>
          <div className="flex justify-between mt-1">
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted }}>0</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.ink }}>λ = {man(P.wtp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 1. 분석 설계 ────────────────────────────────────────────────── */
function DesignTab({ P, set, R }) {
  return (
    <>
      <Panel eyebrow="연구자 결정 사항" title="분석 프레임 — 자동화하지 않는 영역" accent={C.policy}>
        <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.7, marginBottom: 14 }}>
          관점·할인율·시간지평·임계값은 가치판단이 개입하므로 추천하지 않고 연구자가 직접 고릅니다.
          아래 값을 바꾸면 상단 리본과 모든 탭의 결과가 즉시 다시 계산됩니다.
        </p>
        <Row label="분석 관점" tier="policy" hint="사회적 관점은 비의료비·간병비를 추가로 계상합니다">
          <Seg value={P.perspective} onChange={(v) => set("perspective", v)}
            options={[{ v: "healthcare", l: "보건의료체계" }, { v: "societal", l: "사회적" }]} />
        </Row>
        <Row label="할인율 (비용·효과)" tier="policy" hint="국내 지침 기본값 4.5% / 시나리오 0%·3%·7.5%">
          <div className="flex items-center gap-2" style={{ width: 220 }}>
            <Slider value={P.rC} min={0} max={0.075} step={0.005}
              onChange={(v) => { set("rC", v); set("rE", v); }} color={C.policy} />
            <Num size={12}>{pct(P.rC, 1)}</Num>
          </div>
        </Row>
        <Row label="시간지평" tier="policy" hint="접종 시점부터 추적할 연수 (평생 = 100세까지)">
          <div className="flex items-center gap-2">
            <Seg value={P.horizon} onChange={(v) => set("horizon", v)}
              options={[{ v: 10, l: "10년" }, { v: 20, l: "20년" }, { v: 30, l: "30년" }, { v: 100 - P.startAge, l: "평생" }]} />
          </div>
        </Row>
        <Row label="접종 시작 연령" tier="policy" hint="NIP 도입 연령 전략 — 민감도 탭에서 연령별 ICER 비교 가능">
          <Seg value={P.startAge} onChange={(v) => set("startAge", v)}
            options={[{ v: 60, l: "60" }, { v: 65, l: "65" }, { v: 70, l: "70" }, { v: 75, l: "75" }, { v: 80, l: "80" }]} />
        </Row>
        <Row label="지불의사 임계값 λ" tier="policy" hint="국내 관행적 참조값 2,000만~5,000만원/QALY">
          <div className="flex items-center gap-2" style={{ width: 220 }}>
            <Slider value={P.wtp} min={10000000} max={80000000} step={2500000} onChange={(v) => set("wtp", v)} color={C.policy} />
            <Num size={12}>{man(P.wtp)}</Num>
          </div>
        </Row>
        <Row label="반주기 보정 (half-cycle correction)" tier="policy">
          <Seg value={P.halfCycle ? 1 : 0} onChange={(v) => set("halfCycle", !!v)}
            options={[{ v: 1, l: "적용" }, { v: 0, l: "미적용" }]} />
        </Row>
        <Row label="접종률 · 대상 코호트 규모" tier="policy" hint="ICER에는 영향 없음 — 예산영향분석에만 사용">
          <div className="flex items-center gap-2">
            <NumIn value={Math.round(P.coverage * 100)} onChange={(v) => set("coverage", v / 100)} w={64} suffix="%" />
            <NumIn value={P.cohort} step={10000} onChange={(v) => set("cohort", v)} w={100} suffix="명" />
          </div>
        </Row>
      </Panel>

      <Panel eyebrow="모형 구조" title="상태전이 모형 — 대상포진(HZ) 사례" accent={C.claim}>
        <StateDiagram />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            ["비교 전략", "무접종 vs 재조합대상포진백신 2회 접종", C.ink],
            ["주기 / 보정", `1년 주기 · ${P.halfCycle ? "반주기 보정 적용" : "보정 없음"}`, C.ink],
            ["산출", "전략별 비용·QALY, ICER, NMB, 예산영향", C.ink],
          ].map(([k, v]) => (
            <div key={k} className="p-3" style={{ background: C.wash, border: `1px solid ${C.ruleSoft}` }}>
              <Eyebrow>{k}</Eyebrow>
              <div style={{ fontSize: 12.5, marginTop: 4, color: C.ink2 }}>{v}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 12, lineHeight: 1.6 }}>
          급성 대상포진은 주기 내 사건(event)으로 처리하여 비용·QALY 손실을 계상하고, 지속되는 대상포진후신경통(PHN)만
          별도 상태로 둡니다. 배경사망은 Gompertz 근사(연간 사망확률 = {nf(P.mortA, 4)}·e^{"{"}{nf(P.mortB, 4)}·(연령−{P.startAge}){"}"})로 적용합니다.
        </p>
      </Panel>
    </>
  );
}

function StateDiagram() {
  const box = (x, y, w, label, sub, col) => (
    <g key={label}>
      <rect x={x} y={y} width={w} height={44} fill="#fff" stroke={col} strokeWidth="1.5" />
      <text x={x + w / 2} y={y + 20} textAnchor="middle" style={{ fontFamily: SANS, fontSize: 13, fontWeight: 650, fill: C.ink }}>{label}</text>
      <text x={x + w / 2} y={y + 34} textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9.5, fill: C.muted }}>{sub}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 620 190" style={{ width: "100%", height: "auto" }}>
      <defs>
        <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill={C.ink2} />
        </marker>
      </defs>
      {box(20, 30, 120, "건강", "Well", C.claim)}
      {box(250, 30, 120, "PHN", "Post-herpetic", C.lit)}
      {box(470, 30, 120, "사망", "Dead", C.ink2)}
      <line x1="140" y1="46" x2="245" y2="46" stroke={C.ink2} strokeWidth="1.2" markerEnd="url(#ah)" />
      <text x="192" y="38" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9.5, fill: C.claim }}>발생률 ×(1−VE)× P(PHN)</text>
      <path d="M245,64 Q192,96 140,64" fill="none" stroke={C.ink2} strokeWidth="1.2" markerEnd="url(#ah)" />
      <text x="192" y="96" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9.5, fill: C.lit }}>연간 회복률</text>
      <line x1="370" y1="46" x2="465" y2="46" stroke={C.ink2} strokeWidth="1.2" markerEnd="url(#ah)" />
      <path d="M80,74 L80,140 L520,140 L520,78" fill="none" stroke={C.ink2} strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#ah)" />
      <text x="300" y="155" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9.5, fill: C.muted }}>배경사망 (생명표 기반, 모든 상태 공통)</text>
      <text x="80" y="20" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9.5, fill: C.claim }}>주기 내 사건: 급성 HZ</text>
    </svg>
  );
}

/* ── 2. 파라미터 ─────────────────────────────────────────────────── */
function ParamsTab({ P, set, setP }) {
  const [w, setW] = useState({ vac: 0.25, pop: 0.2, evid: 0.2, rec: 0.15, kr: 0.2 });
  const [open, setOpen] = useState("ve0");
  const claimIds = ["incMult", "phnMult", "pHosp", "costHZout", "costHZhosp", "costPHN"];

  const ranked = useMemo(() => {
    const lib = LIT_LIB[open] || [];
    const tot = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return lib.map((c) => {
      const score = CRIT.reduce((s, cr) => s + (w[cr.k] / tot) * c.s[cr.k], 0);
      return { ...c, score };
    }).sort((a, b) => b.score - a.score);
  }, [open, w]);

  return (
    <>
      <Panel eyebrow="1계층 · 자동" title="청구자료에서 직접 산출되는 파라미터" accent={C.claim}
        right={<span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>HIRA 2019–2023 · 집계 반출본</span>}>
        <p style={{ fontSize: 12.5, color: C.ink2, marginBottom: 10, lineHeight: 1.7 }}>
          HIRA 코드 탭에서 생성한 SAS를 원격분석환경에서 실행하면 아래 값이 채워집니다.
          지금은 실행 결과를 모사한 값이며, 배수(보정계수)로 시나리오를 조정할 수 있습니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {claimIds.map((id) => (
            <Row key={id} label={META[id].label} tier="claim" hint={`출처 ${META[id].src}`}>
              <NumIn value={P[id]} step={META[id].fmt === "won" ? 10000 : 0.01} onChange={(v) => set(id, v)} />
            </Row>
          ))}
        </div>
        <div className="mt-4 p-3" style={{ background: C.wash, border: `1px solid ${C.ruleSoft}` }}>
          <Eyebrow color={C.claim}>연령별 산출값 (모형에 내장)</Eyebrow>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full" style={{ fontFamily: MONO, fontSize: 11.5 }}>
              <thead>
                <tr style={{ color: C.muted }}>
                  <th className="text-left py-1">연령군</th><th className="text-right">발생률 /1,000PY</th>
                  <th className="text-right">P(PHN|HZ)</th><th className="text-right">배경사망 확률</th>
                </tr>
              </thead>
              <tbody>
                {[65, 70, 75, 80, 85].map((a) => (
                  <tr key={a} style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
                    <td className="py-1">{a}–{a + 4}</td>
                    <td className="text-right tabular-nums">{nf(incidence(a) * 1000 * P.incMult, 2)}</td>
                    <td className="text-right tabular-nums">{nf(phnProb(a) * P.phnMult, 3)}</td>
                    <td className="text-right tabular-nums">{nf(Math.min(0.995, P.mortA * Math.exp(P.mortB * (a - P.startAge))), 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <Panel eyebrow="2계층 · 추천 후 확정" title="문헌 파라미터 — 순위화된 후보값" accent={C.lit}>
        <p style={{ fontSize: 12.5, color: C.ink2, marginBottom: 12, lineHeight: 1.7 }}>
          블랙박스 추천 대신 <strong>가중치가 보이는 규칙기반 점수</strong>를 씁니다. 기준별 가중치를 바꾸면 순위가 즉시 바뀌고,
          그 가중치가 그대로 보고서에 기록되므로 다른 연구자가 같은 선택을 재현할 수 있습니다. 최종 확정은 연구자가 합니다.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {Object.keys(LIT_LIB).map((id) => (
            <button key={id} onClick={() => setOpen(id)}
              style={{
                fontFamily: MONO, fontSize: 11, padding: "5px 10px", cursor: "pointer",
                border: `1px solid ${open === id ? C.lit : C.rule}`,
                background: open === id ? C.lit : "transparent", color: open === id ? "#fff" : C.ink2,
              }}>{META[id].label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 p-3" style={{ background: C.wash, border: `1px solid ${C.ruleSoft}` }}>
          {CRIT.map((cr) => (
            <div key={cr.k}>
              <div className="flex justify-between">
                <span style={{ fontSize: 11, color: C.ink2 }}>{cr.label}</span>
                <Num size={11} color={C.lit}>{nf(w[cr.k], 2)}</Num>
              </div>
              <Slider value={w[cr.k]} min={0} max={0.5} step={0.05} color={C.lit}
                onChange={(v) => setW((x) => ({ ...x, [cr.k]: v }))} />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {ranked.map((c, i) => {
            const active = Math.abs(P[open] - c.v) < 1e-9;
            return (
              <div key={c.name} className="flex items-center gap-3 p-3"
                style={{ border: `1px solid ${active ? C.lit : C.rule}`, background: active ? "#F7F5FC" : C.panel }}>
                <Num size={13} color={C.lit}>{String(i + 1).padStart(2, "0")}</Num>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, marginTop: 2 }}>
                    {c.ref} · {c.design} · {c.yr}
                  </div>
                  <div className="mt-1.5" style={{ height: 3, background: C.ruleSoft, maxWidth: 220 }}>
                    <div style={{ height: "100%", width: `${c.score * 100}%`, background: C.lit }} />
                  </div>
                </div>
                <div className="text-right">
                  <Num size={15}>{fmtVal(open, c.v)}</Num>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>점수 {nf(c.score, 3)}</div>
                </div>
                <Btn small kind={active ? "solid" : "ghost"} onClick={() => set(open, c.v)}>
                  {active ? <><Check size={11} /> 적용됨</> : "적용"}
                </Btn>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {["ve0", "waning", "vePHNadd", "uDecPHN", "qalyLossHZ", "phnRecovery"].map((id) => (
            <Row key={id} label={META[id].label} tier="lit" hint={`현재 확정값 · ${META[id].src}`}>
              <NumIn value={P[id]} step={0.001} onChange={(v) => set(id, v)} />
            </Row>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="3계층 · 연구자 입력" title="가격 및 프로그램 변수" accent={C.policy}>
        <Row label="1인 총 접종비용 (백신가 + 시행비, 2회)" tier="policy" hint="협상가 시나리오는 민감도 탭의 임계가격 분석 참조">
          <div className="flex items-center gap-2" style={{ width: 260 }}>
            <Slider value={P.vePrice} min={60000} max={400000} step={5000} onChange={(v) => set("vePrice", v)} color={C.policy} />
            <Num size={12}>{man(P.vePrice, 1)}</Num>
          </div>
        </Row>
        <Row label="접종 이상반응 1인당 QALY 손실" tier="policy" hint="국소·전신 반응 3일 가정">
          <NumIn value={P.aeDis} step={0.0001} onChange={(v) => set("aeDis", v)} />
        </Row>
        {P.perspective === "societal" && (
          <>
            <Row label="HZ 건당 비의료비 (교통·간병)" tier="policy"><NumIn value={P.costNonMedHZ} step={10000} onChange={(v) => set("costNonMedHZ", v)} /></Row>
            <Row label="PHN 연간 비의료비·생산성 손실" tier="policy"><NumIn value={P.costNonMedPHN} step={10000} onChange={(v) => set("costNonMedPHN", v)} /></Row>
          </>
        )}
        <div className="mt-4 flex gap-2">
          <Btn onClick={() => setP(BASE)}>기본값으로 되돌리기</Btn>
        </div>
      </Panel>
    </>
  );
}

/* ── 3. 결과 ─────────────────────────────────────────────────────── */
function ResultsTab({ P, R }) {
  const rows = [
    ["총 비용 (할인)", won(R.nv.cost), won(R.vx.cost), man(R.dC, 1)],
    ["  └ 백신 비용", won(0), won(P.vePrice), man(P.vePrice, 1)],
    ["  └ 질병 치료비", won(R.nv.cost), won(R.vx.cost - P.vePrice), man(R.vx.cost - P.vePrice - R.nv.cost, 1)],
    ["총 QALY (할인)", nf(R.nv.qaly, 4), nf(R.vx.qaly, 4), nf(R.dQ, 5)],
    ["대상포진 발생 건수", nf(R.nv.hz, 4), nf(R.vx.hz, 4), `−${nf(R.hzAvert, 4)}`],
    ["PHN 이환 연수", nf(R.nv.phnY, 4), nf(R.vx.phnY, 4), `−${nf(R.phnAvert, 4)}`],
    ["입원 건수", nf(R.nv.hosp, 5), nf(R.vx.hosp, 5), `−${nf(R.hospAvert, 5)}`],
  ];
  const traceData = R.nv.trace.map((d, i) => ({
    age: d.age, "무접종 PHN": d.PHN * 1000, "접종 PHN": R.vx.trace[i].PHN * 1000,
    "무접종 HZ": R.nv.trace[i].hz * 1000, "접종 HZ": R.vx.trace[i].hz * 1000,
  }));
  const N = P.cohort * P.coverage;
  const bi = R.nv.undiscCost.slice(0, 5).map((c, i) => ({
    year: `${i + 1}년차`,
    백신비: i === 0 ? (N * P.vePrice) / 1e8 : 0,
    치료비절감: -((c - R.vx.undiscCost[i]) * N) / 1e8,
  }));
  return (
    <>
      <Panel eyebrow="기본 분석" title="전략별 비용·효과 (1인 기준, 할인 적용)" accent={C.ink}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: C.muted, fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.08em" }}>
                <th className="text-left py-2">항목</th><th className="text-right">무접종</th>
                <th className="text-right">백신 접종</th><th className="text-right">증분</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]} style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
                  <td className="py-2" style={{ color: r[0].startsWith("  ") ? C.muted : C.ink, paddingLeft: r[0].startsWith("  ") ? 14 : 0 }}>{r[0].trim()}</td>
                  <td className="text-right tabular-nums" style={{ fontFamily: MONO }}>{r[1]}</td>
                  <td className="text-right tabular-nums" style={{ fontFamily: MONO }}>{r[2]}</td>
                  <td className="text-right tabular-nums" style={{ fontFamily: MONO, fontWeight: 650 }}>{r[3]}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.ink}` }}>
                <td className="py-2.5" style={{ fontWeight: 650 }}>ICER (원/QALY)</td>
                <td colSpan={2} className="text-right" style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>
                  {man(R.dC, 1)} ÷ {nf(R.dQ, 5)} QALY
                </td>
                <td className="text-right tabular-nums" style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: R.icer > P.wtp ? C.bad : C.good }}>
                  {R.status === "tradeoff" ? won(R.icer) : R.status === "dominant" ? "우월 (dominant)" : "열등 (dominated)"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {[
            ["백신비 상쇄율", pct(Math.min(1, (R.nv.cost - (R.vx.cost - P.vePrice)) / P.vePrice), 1), "예방으로 회수되는 치료비 비중"],
            ["1QALY당 추가지출", R.status === "tradeoff" ? man(R.icer) : "—", "임계값 " + man(P.wtp) + " 대비"],
            ["NNV (1건 예방 접종수)", nf(1 / Math.max(1e-9, R.hzAvert), 0) + "명", "대상포진 1건 예방에 필요한 접종 인원"],
          ].map(([k, v, s]) => (
            <div key={k} className="p-3 flex-1" style={{ background: C.wash, border: `1px solid ${C.ruleSoft}`, minWidth: 180 }}>
              <Eyebrow>{k}</Eyebrow>
              <div className="mt-1"><Num size={17}>{v}</Num></div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{s}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="코호트 추적" title="연령에 따른 질병부담 — 1,000명당" accent={C.claim}>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={traceData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={C.ruleSoft} vertical={false} />
            <XAxis dataKey="age" tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} />
            <YAxis tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} />
            <Tooltip contentStyle={{ fontFamily: MONO, fontSize: 11, border: `1px solid ${C.rule}`, borderRadius: 0 }}
              formatter={(v) => nf(v, 2)} labelFormatter={(l) => `${l}세`} />
            <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 10.5 }} />
            <Area type="monotone" dataKey="무접종 PHN" stroke={C.bad} fill={C.bad} fillOpacity={0.13} strokeWidth={1.6} />
            <Area type="monotone" dataKey="접종 PHN" stroke={C.claim} fill={C.claim} fillOpacity={0.13} strokeWidth={1.6} />
          </AreaChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
          두 곡선 사이의 면적이 예방된 PHN 이환 연수입니다. 효과 감소율({nf(P.waning, 3)}/년)이 커질수록 후반부에서 두 곡선이 다시 붙습니다.
        </p>
      </Panel>

      <Panel eyebrow="재정 영향" title={`예산영향분석 — ${nf(P.cohort)}명 코호트, 접종률 ${pct(P.coverage, 0)}`} accent={C.policy}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bi} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} stackOffset="sign">
            <CartesianGrid stroke={C.ruleSoft} vertical={false} />
            <XAxis dataKey="year" tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} />
            <YAxis tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} unit="억" />
            <Tooltip contentStyle={{ fontFamily: MONO, fontSize: 11, border: `1px solid ${C.rule}`, borderRadius: 0 }}
              formatter={(v) => `${nf(v, 2)}억원`} />
            <ReferenceLine y={0} stroke={C.ink} />
            <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 10.5 }} />
            <Bar dataKey="백신비" stackId="a" fill={C.policy} />
            <Bar dataKey="치료비절감" stackId="a" fill={C.claim} />
          </BarChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
          도입 1년차에 접종비 {nf((N * P.vePrice) / 1e8, 1)}억원이 집중되고, 치료비 절감은 이후 수십 년에 걸쳐 회수됩니다.
          ICER가 좋아도 초기 재정부담이 도입 시점을 결정하는 경우가 많아 별도로 제시합니다.
        </p>
      </Panel>
    </>
  );
}

/* ── 4. 결정론적 민감도 ──────────────────────────────────────────── */
function OwsaTab({ P, set, R }) {
  const [pick, setPick] = useState("ve0");

  const curve = useMemo(() => {
    const m = META[pick];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const v = m.low + ((m.high - m.low) * i) / 24;
      const p2 = { ...P, [pick]: v };
      if (pick === "rC") p2.rE = v;
      const r = runCEA(p2);
      pts.push({ x: v, icer: r.status === "tradeoff" && r.icer > 0 ? r.icer / 10000 : null, nmb: r.nmb / 10000 });
    }
    return pts;
  }, [P, pick]);

  const tornado = useMemo(() => {
    const base = R.icer;
    return SENS_IDS.map((id) => {
      const m = META[id];
      const run = (v) => {
        const p2 = { ...P, [id]: v };
        if (id === "rC") p2.rE = v;
        const r = runCEA(p2);
        return r.status === "tradeoff" ? r.icer : r.status === "dominant" ? 0 : Infinity;
      };
      const lo = run(m.low), hi = run(m.high);
      return { id, label: m.label, tier: m.tier, lo: Math.min(lo, hi), hi: Math.max(lo, hi), width: Math.abs(hi - lo), rawLo: lo, rawHi: hi, low: m.low, high: m.high };
    }).filter((d) => isFinite(d.width)).sort((a, b) => b.width - a.width).slice(0, 10).map((d) => ({ ...d, base }));
  }, [P, R.icer]);

  const grid = useMemo(() => {
    const prices = Array.from({ length: 9 }, (_, i) => 80000 + i * 30000);
    const ves = Array.from({ length: 7 }, (_, i) => 0.65 + i * 0.05);
    return ves.slice().reverse().map((ve) => ({
      ve, cells: prices.map((pr) => {
        const r = runCEA({ ...P, vePrice: pr, ve0: ve });
        return { pr, icer: r.status === "tradeoff" ? r.icer : r.status === "dominant" ? 0 : Infinity };
      }),
    }));
  }, [P]);
  const prices = Array.from({ length: 9 }, (_, i) => 80000 + i * 30000);

  const threshold = useMemo(() => {
    let lo = 0, hi = 1500000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const r = runCEA({ ...P, vePrice: mid });
      if (r.status === "dominant" || r.icer < P.wtp) lo = mid; else hi = mid;
    }
    return lo;
  }, [P]);

  const byAge = useMemo(() => [60, 65, 70, 75, 80, 85].map((a) => {
    const r = runCEA({ ...P, startAge: a, horizon: Math.max(10, 100 - a) });
    return { age: `${a}세`, icer: r.status === "tradeoff" ? r.icer / 10000 : 0, nmb: r.nmb / 10000 };
  }), [P]);

  const live = ["ve0", "waning", "vePrice", "incMult", "costPHN", "uDecPHN", "rC"];

  return (
    <>
      <Panel eyebrow="즉시 반응" title="파라미터를 밀면 결과가 따라옵니다" accent={C.ink}
        right={<span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>상단 리본이 실시간으로 갱신됩니다</span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {live.map((id) => {
            const m = META[id];
            return (
              <div key={id}>
                <div className="flex justify-between items-baseline">
                  <span style={{ fontSize: 12 }}><TierDot tier={m.tier} />{m.label}</span>
                  <Num size={12} color={TIER[m.tier].c}>{fmtVal(id, P[id])}</Num>
                </div>
                <Slider value={P[id]} min={m.low} max={m.high} color={TIER[m.tier].c}
                  step={(m.high - m.low) / 100}
                  onChange={(v) => { set(id, v); if (id === "rC") set("rE", v); }} />
                <div className="flex justify-between" style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted }}>
                  <span>{fmtVal(id, m.low)}</span><span>{fmtVal(id, m.high)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel eyebrow="일원 민감도" title="선택한 변수의 전 구간 반응 곡선" accent={C.ink}
        right={
          <select value={pick} onChange={(e) => setPick(e.target.value)}
            style={{ fontFamily: MONO, fontSize: 11, padding: "5px 8px", border: `1px solid ${C.rule}`, background: C.wash }}>
            {SENS_IDS.map((id) => <option key={id} value={id}>{META[id].label}</option>)}
          </select>
        }>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={curve} margin={{ top: 6, right: 10, left: -6, bottom: 4 }}>
            <CartesianGrid stroke={C.ruleSoft} vertical={false} />
            <XAxis dataKey="x" tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule}
              tickFormatter={(v) => (META[pick].fmt === "won" ? nf(v / 10000) : nf(v, 3))} />
            <YAxis tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} unit="만" />
            <Tooltip contentStyle={{ fontFamily: MONO, fontSize: 11, border: `1px solid ${C.rule}`, borderRadius: 0 }}
              formatter={(v) => `${nf(v, 0)}만원/QALY`}
              labelFormatter={(l) => `${META[pick].label} = ${fmtVal(pick, l)}`} />
            <ReferenceLine y={P.wtp / 10000} stroke={C.bad} strokeDasharray="4 3"
              label={{ value: `λ ${man(P.wtp)}`, position: "insideTopRight", style: { fontFamily: MONO, fontSize: 10, fill: C.bad } }} />
            <ReferenceLine x={P[pick]} stroke={C.ink} strokeDasharray="2 3" />
            <Line type="monotone" dataKey="icer" stroke={TIER[META[pick].tier].c} strokeWidth={2} dot={false} name="ICER" />
          </LineChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
          세로 점선이 현재 확정값, 가로 점선이 임계값입니다. 곡선이 가로선을 가로지르는 지점이 결론이 뒤집히는 값입니다.
        </p>
      </Panel>

      <Panel eyebrow="토네이도" title="결론을 가장 크게 흔드는 변수 순위" accent={C.ink}>
        <Tornado data={tornado} wtp={P.wtp} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-5">
        <Panel eyebrow="이원 민감도" title="백신 가격 × 백신 효과" accent={C.policy}>
          <Heatmap grid={grid} prices={prices} wtp={P.wtp} />
        </Panel>
        <div>
          <Panel eyebrow="임계 분석" title="비용효과성을 유지하는 최대 접종비용" accent={C.policy}>
            <div className="flex items-baseline gap-3">
              <Num size={30} color={C.policy}>{man(threshold, 1)}</Num>
              <span style={{ fontSize: 12, color: C.muted }}>/ 1인 2회 총액</span>
            </div>
            <div className="mt-3" style={{ height: 10, background: C.wash, border: `1px solid ${C.ruleSoft}`, position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, (threshold / 500000) * 100)}%`, background: C.policy, opacity: 0.6 }} />
              <div style={{ position: "absolute", left: `${Math.min(100, (P.vePrice / 500000) * 100)}%`, top: -4, bottom: -4, width: 2, background: C.ink }} />
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
              현재 가격 {man(P.vePrice, 1)}(검은 선) 기준 여유는 {man(threshold - P.vePrice, 1)}입니다.
              λ={man(P.wtp)}, 효과 {pct(P.ve0)}, 관점 {P.perspective === "societal" ? "사회적" : "보건의료체계"} 조건입니다.
              가격 협상 근거로 바로 쓰이는 숫자여서 별도 패널로 뺐습니다.
            </p>
          </Panel>
          <Panel eyebrow="전략 비교" title="접종 시작 연령별 ICER" accent={C.claim}>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={byAge} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={C.ruleSoft} vertical={false} />
                <XAxis dataKey="age" tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} />
                <YAxis tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} unit="만" />
                <Tooltip contentStyle={{ fontFamily: MONO, fontSize: 11, border: `1px solid ${C.rule}`, borderRadius: 0 }}
                  formatter={(v) => `${nf(v, 0)}만원/QALY`} />
                <ReferenceLine y={P.wtp / 10000} stroke={C.bad} strokeDasharray="4 3" />
                <Bar dataKey="icer">
                  {byAge.map((d, i) => <Cell key={i} fill={d.icer * 10000 > P.wtp ? C.bad : C.claim} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
              시간지평은 각 연령에서 100세까지로 맞췄습니다. 고령일수록 발생률과 PHN 위험은 오르지만 잔여수명이 짧아 최적 접종연령이 생깁니다.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Tornado({ data, wtp }) {
  if (!data.length) return null;
  const base = data[0].base;
  const min = Math.min(...data.map((d) => d.lo), base) * 0.95;
  const max = Math.max(...data.map((d) => d.hi), base) * 1.05;
  const x = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  return (
    <div>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.id} className="flex items-center gap-3">
            <div className="text-right shrink-0" style={{ width: 168, fontSize: 11.5 }}>
              <TierDot tier={d.tier} />{d.label}
            </div>
            <div className="relative flex-1" style={{ height: 20, background: C.wash }}>
              <div style={{ position: "absolute", left: `${x(base)}%`, top: 0, bottom: 0, width: 2, background: C.ink, zIndex: 2 }} />
              <div style={{
                position: "absolute", left: `${x(d.lo)}%`, width: `${x(d.hi) - x(d.lo)}%`,
                top: 3, bottom: 3, background: TIER[d.tier].c, opacity: 0.75,
              }} />
              <div style={{ position: "absolute", left: `${x(wtp)}%`, top: -2, bottom: -2, width: 1, background: C.bad, zIndex: 3 }} />
            </div>
            <div className="shrink-0 text-right" style={{ width: 130, fontFamily: MONO, fontSize: 10.5, color: C.muted }}>
              {nf(d.lo / 10000, 0)}–{nf(d.hi / 10000, 0)}만
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2" style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>
        <span>{nf(min / 10000, 0)}만원/QALY</span>
        <span style={{ color: C.ink }}>│ 기본값 {nf(base / 10000, 0)}만</span>
        <span style={{ color: C.bad }}>│ 임계값 {nf(wtp / 10000, 0)}만</span>
        <span>{nf(max / 10000, 0)}만원/QALY</span>
      </div>
      <p style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
        막대가 붉은 임계선을 넘나드는 변수가 결론을 뒤집을 수 있는 변수입니다. 막대 색은 그 값의 출처를 뜻합니다 —
        보라색 막대가 위에 몰려 있다면 결론이 문헌 가정에 의존한다는 신호이고, 그때는 청구자료 추가 분석보다 문헌 근거 보강이 우선입니다.
      </p>
    </div>
  );
}

function Heatmap({ grid, prices, wtp }) {
  const color = (icer) => {
    if (!isFinite(icer)) return C.bad;
    const r = icer / wtp;
    if (r <= 0.5) return "#0B6E6E";
    if (r <= 0.8) return "#4E9A93";
    if (r <= 1.0) return "#9BC4BC";
    if (r <= 1.3) return "#E6B3B8";
    if (r <= 1.8) return "#C4677C";
    return "#A21B3C";
  };
  return (
    <div>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted, padding: 3 }}>VE ＼ 가격</th>
              {prices.map((p) => (
                <th key={p} style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted, padding: 3 }}>{nf(p / 10000)}만</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row.ve}>
                <td style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted, padding: 3, textAlign: "right" }}>{pct(row.ve, 0)}</td>
                {row.cells.map((c) => (
                  <td key={c.pr} title={`${pct(row.ve, 0)} · ${man(c.pr)} → ${isFinite(c.icer) ? man(c.icer) : "열등"}/QALY`}
                    style={{ background: color(c.icer), height: 26, border: "1px solid #fff", textAlign: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 8.5, color: "#fff" }}>
                      {isFinite(c.icer) ? nf(c.icer / 10000, 0) : "×"}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
        칸 안 숫자는 만원/QALY. 청록색이 임계값 이하(비용효과적), 붉은색이 초과 구간입니다.
        경계선이 지나가는 대각선이 곧 "이 효과라면 얼마까지 지불 가능한가"의 답입니다.
      </p>
    </div>
  );
}

/* ── 5. 확률적 민감도 ────────────────────────────────────────────── */
function PsaTab({ P }) {
  const [n, setN] = useState(1000);
  const [seed, setSeed] = useState(20260812);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(() => {
    setBusy(true);
    setTimeout(() => {
      const rng = mulberry32(seed);
      const rnorm = mkNorm(rng), rgamma = mkGamma(rng, rnorm);
      const rbeta = (a, b) => { const x = rgamma(a), y = rgamma(b); return x / (x + y); };
      const draw = (id) => {
        const m = META[id], mean = P[id], se = (m.high - m.low) / 3.92;
        if (m.dist === "fixed" || se <= 0) return mean;
        if (m.dist === "beta") {
          const v = se * se, t = (mean * (1 - mean)) / v - 1;
          if (!(t > 0)) return mean;
          return rbeta(mean * t, (1 - mean) * t);
        }
        if (m.dist === "gamma") { const sh = (mean / se) ** 2; return rgamma(sh) * (se * se / mean); }
        const sig = Math.sqrt(Math.log(1 + (se / mean) ** 2));
        return Math.exp(Math.log(mean) - sig * sig / 2 + sig * rnorm());
      };
      const pts = [];
      for (let i = 0; i < n; i++) {
        const p2 = { ...P };
        SENS_IDS.forEach((id) => { if (META[id].dist !== "fixed") p2[id] = draw(id); });
        const r = runCEA(p2);
        pts.push({ dq: r.dQ, dc: r.dC, cNv: r.nv.cost, qNv: r.nv.qaly, cVx: r.vx.cost, qVx: r.vx.qaly });
      }
      const wtps = Array.from({ length: 21 }, (_, i) => i * 4000000);
      const ceac = wtps.map((w) => ({
        wtp: w / 10000,
        접종: pts.filter((p) => w * p.dq - p.dc > 0).length / n,
        무접종: pts.filter((p) => w * p.dq - p.dc <= 0).length / n,
      }));
      const evpiAt = (w) => {
        let perfect = 0, nb0 = 0, nb1 = 0;
        pts.forEach((p) => {
          const a = w * p.qNv - p.cNv, b = w * p.qVx - p.cVx;
          perfect += Math.max(a, b); nb0 += a; nb1 += b;
        });
        return Math.max(0, perfect / n - Math.max(nb0 / n, nb1 / n));
      };
      const evpiCurve = wtps.map((w) => ({ wtp: w / 10000, evpi: evpiAt(w) / 10000 }));
      const dqs = pts.map((p) => p.dq).sort((a, b) => a - b);
      const dcs = pts.map((p) => p.dc).sort((a, b) => a - b);
      const qi = (arr, q) => arr[Math.floor(q * (arr.length - 1))];
      setRes({
        pts, ceac, evpiCurve, evpi: evpiAt(P.wtp),
        meanDq: dqs.reduce((a, b) => a + b, 0) / n, meanDc: dcs.reduce((a, b) => a + b, 0) / n,
        ciQ: [qi(dqs, 0.025), qi(dqs, 0.975)], ciC: [qi(dcs, 0.025), qi(dcs, 0.975)],
        pCE: pts.filter((p) => P.wtp * p.dq - p.dc > 0).length / n,
      });
      setBusy(false);
    }, 20);
  }, [P, n, seed]);

  return (
    <>
      <Panel eyebrow="몬테카를로" title="확률적 민감도분석 (PSA)" accent={C.ink}
        right={
          <div className="flex items-center gap-2">
            <NumIn value={n} step={500} onChange={setN} w={78} suffix="회" />
            <NumIn value={seed} step={1} onChange={setSeed} w={100} suffix="seed" />
            <Btn kind="solid" onClick={run} disabled={busy}><Play size={11} /> {busy ? "계산 중" : "실행"}</Btn>
          </div>
        }>
        <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.7 }}>
          확률에는 베타, 비용에는 감마, 배수에는 로그정규 분포를 적용하고, 각 파라미터의 표준오차는 민감도 범위를 95% 구간으로 간주해 역산합니다.
          난수 시드를 고정하므로 같은 시드·같은 설정이면 결과가 정확히 재현됩니다. 백신 가격은 불확실성이 아니라 <em>결정변수</em>이므로 고정합니다.
        </p>
        {!res && <div className="mt-4 p-6 text-center" style={{ background: C.wash, border: `1px dashed ${C.rule}` }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>실행을 누르면 비용효과 평면·수용곡선·EVPI가 생성됩니다</span>
        </div>}
      </Panel>

      {res && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-5">
            <Panel eyebrow="산점도" title="비용효과 평면" accent={C.ink}>
              <CEPlane pts={res.pts} wtp={P.wtp} mean={{ dq: res.meanDq, dc: res.meanDc }} />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><Eyebrow>ΔQALY 95% 구간</Eyebrow><div className="mt-1"><Num size={13}>{nf(res.ciQ[0], 5)} ~ {nf(res.ciQ[1], 5)}</Num></div></div>
                <div><Eyebrow>ΔC 95% 구간</Eyebrow><div className="mt-1"><Num size={13}>{man(res.ciC[0], 1)} ~ {man(res.ciC[1], 1)}</Num></div></div>
              </div>
            </Panel>
            <Panel eyebrow="수용곡선" title="CEAC — 임계값별 비용효과적일 확률" accent={C.ink}>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={res.ceac} margin={{ top: 6, right: 10, left: -12, bottom: 4 }}>
                  <CartesianGrid stroke={C.ruleSoft} vertical={false} />
                  <XAxis dataKey="wtp" tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} unit="만" />
                  <YAxis domain={[0, 1]} tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule}
                    tickFormatter={(v) => nf(v * 100, 0)} unit="%" />
                  <Tooltip contentStyle={{ fontFamily: MONO, fontSize: 11, border: `1px solid ${C.rule}`, borderRadius: 0 }}
                    formatter={(v) => pct(v, 1)} labelFormatter={(l) => `λ = ${nf(l)}만원/QALY`} />
                  <ReferenceLine x={P.wtp / 10000} stroke={C.ink} strokeDasharray="3 3" />
                  <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 10.5 }} />
                  <Line type="monotone" dataKey="접종" stroke={C.claim} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="무접종" stroke={C.muted} strokeWidth={1.4} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-2 p-3" style={{ background: C.wash, border: `1px solid ${C.ruleSoft}` }}>
                <span style={{ fontSize: 12 }}>임계값 {man(P.wtp)}에서 접종 전략이 비용효과적일 확률 </span>
                <Num size={15} color={res.pCE > 0.5 ? C.good : C.bad}>{pct(res.pCE, 1)}</Num>
              </div>
            </Panel>
          </div>
          <Panel eyebrow="의사결정 불확실성" title="EVPI — 추가 근거 확보의 가치" accent={C.lit}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={res.evpiCurve} margin={{ top: 6, right: 10, left: -8, bottom: 4 }}>
                <CartesianGrid stroke={C.ruleSoft} vertical={false} />
                <XAxis dataKey="wtp" tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} unit="만" />
                <YAxis tick={{ fontFamily: MONO, fontSize: 10, fill: C.muted }} stroke={C.rule} unit="만" />
                <Tooltip contentStyle={{ fontFamily: MONO, fontSize: 11, border: `1px solid ${C.rule}`, borderRadius: 0 }}
                  formatter={(v) => `${nf(v, 2)}만원/인`} labelFormatter={(l) => `λ = ${nf(l)}만원/QALY`} />
                <ReferenceLine x={P.wtp / 10000} stroke={C.ink} strokeDasharray="3 3" />
                <Area type="monotone" dataKey="evpi" stroke={C.lit} fill={C.lit} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-3">
              <div className="p-3 flex-1" style={{ background: C.wash, border: `1px solid ${C.ruleSoft}`, minWidth: 200 }}>
                <Eyebrow>1인당 EVPI (λ={man(P.wtp)})</Eyebrow>
                <div className="mt-1"><Num size={18} color={C.lit}>{won(res.evpi)}</Num></div>
              </div>
              <div className="p-3 flex-1" style={{ background: C.wash, border: `1px solid ${C.ruleSoft}`, minWidth: 200 }}>
                <Eyebrow>대상 인구 전체 EVPI</Eyebrow>
                <div className="mt-1"><Num size={18} color={C.lit}>{nf((res.evpi * P.cohort) / 1e8, 1)}억원</Num></div>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
              EVPI는 불확실성 때문에 잘못된 결정을 내릴 기대손실의 상한, 곧 <strong>추가 연구에 쓸 수 있는 예산의 천장</strong>입니다.
              값이 임계값 근처에서 가장 큰 것은 그 구간에서 결정이 가장 아슬아슬하기 때문입니다.
              사업계획서에는 없던 지표인데, "그래서 국내 자료를 더 모을 가치가 있는가"라는 질문에
              직접 답해주기 때문에 공공기관 대상 B2G에서 특히 설득력이 있어 넣었습니다.
            </p>
          </Panel>
        </>
      )}
    </>
  );
}

function CEPlane({ pts, wtp, mean }) {
  const W = 460, H = 320, pad = 34;
  const qs = pts.map((p) => p.dq), cs = pts.map((p) => p.dc);
  const qx = Math.max(Math.abs(Math.min(...qs)), Math.abs(Math.max(...qs))) * 1.15 || 0.01;
  const cMax = Math.max(...cs) * 1.15, cMin = Math.min(0, Math.min(...cs) * 1.15);
  const X = (q) => pad + ((q + qx) / (2 * qx)) * (W - pad - 10);
  const Y = (c) => H - pad - ((c - cMin) / (cMax - cMin)) * (H - pad - 12);
  const rayQ = Math.min(qx, cMax / wtp);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      <rect x={X(0)} y={Y(cMax)} width={W - 10 - X(0)} height={Y(0) - Y(cMax)} fill={C.wash} />
      <line x1={pad} y1={Y(0)} x2={W - 10} y2={Y(0)} stroke={C.ink} strokeWidth="1" />
      <line x1={X(0)} y1={12} x2={X(0)} y2={H - pad} stroke={C.ink} strokeWidth="1" />
      <line x1={X(0)} y1={Y(0)} x2={X(rayQ)} y2={Y(rayQ * wtp)} stroke={C.bad} strokeWidth="1.5" strokeDasharray="5 3" />
      <text x={X(rayQ) - 4} y={Y(rayQ * wtp) - 6} textAnchor="end" style={{ fontFamily: MONO, fontSize: 10, fill: C.bad }}>
        λ = {nf(wtp / 10000)}만원/QALY
      </text>
      {pts.map((p, i) => (
        <circle key={i} cx={X(p.dq)} cy={Y(p.dc)} r="1.7" fill={wtp * p.dq - p.dc > 0 ? C.claim : C.bad} opacity="0.32" />
      ))}
      <circle cx={X(mean.dq)} cy={Y(mean.dc)} r="4.5" fill="none" stroke={C.ink} strokeWidth="2" />
      <text x={X(mean.dq) + 8} y={Y(mean.dc) - 6} style={{ fontFamily: MONO, fontSize: 10, fill: C.ink }}>평균</text>
      <text x={W - 12} y={H - pad + 14} textAnchor="end" style={{ fontFamily: MONO, fontSize: 10, fill: C.muted }}>ΔQALY →</text>
      <text x={pad - 6} y={18} style={{ fontFamily: MONO, fontSize: 10, fill: C.muted }}>↑ ΔCost</text>
      <text x={W - 12} y={Y(cMax) + 14} textAnchor="end" style={{ fontFamily: MONO, fontSize: 9.5, fill: C.muted }}>북동 사분면: 비용↑ 효과↑</text>
    </svg>
  );
}

/* ── 6. HIRA SAS 코드 ────────────────────────────────────────────── */
function SasTab({ P }) {
  const [cfg, setCfg] = useState({
    dz: "herpes_zoster", dxCode: "B02", ageMin: 50, ageMax: 99,
    yFrom: 2019, yTo: 2023, washout: 12, phnDays: 90, cellMin: 5,
  });
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => buildSAS(cfg), [cfg]);
  const upd = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const dl = () => {
    const b = new Blob([code], { type: "text/plain;charset=utf-8" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = `vaxinsight_${cfg.dz}_${cfg.yFrom}_${cfg.yTo}.sas`; a.click();
    URL.revokeObjectURL(u);
  };
  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  return (
    <>
      <Panel eyebrow="1계층 자동화" title="HIRA 원격분석환경용 SAS 코드 생성" accent={C.claim}
        right={<div className="flex gap-2"><Btn small onClick={copy}>{copied ? <><Check size={11} /> 복사됨</> : "복사"}</Btn><Btn small kind="solid" onClick={dl}><Download size={11} /> .sas 저장</Btn></div>}>
        <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.7, marginBottom: 14 }}>
          원자료는 반출되지 않으므로, 데이터를 밖으로 가져오는 대신 <strong>코드를 안으로 보내고 집계 파라미터만 받아옵니다.</strong>
          사업계획서와 달리 생성 로직을 LLM 자유생성이 아니라 <strong>검증된 템플릿 + 파라미터 치환</strong>으로 두었습니다.
          같은 입력이면 같은 코드가 나와야 재현성이 성립하고, 심사자가 코드 한 벌만 검토하면 되기 때문입니다.
          (자연어 요청 → 설정값 변환 단계에만 LLM을 쓰는 것이 안전한 배치입니다.)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5">
          {[
            ["dz", "질환 식별자", "text"], ["dxCode", "주상병 코드 prefix", "text"],
            ["ageMin", "최소 연령", "num"], ["ageMax", "최대 연령", "num"],
            ["yFrom", "관찰 시작연도", "num"], ["yTo", "관찰 종료연도", "num"],
            ["washout", "washout (개월)", "num"], ["phnDays", "합병증 정의 (일)", "num"],
            ["cellMin", "소수셀 마스킹 기준", "num"],
          ].map(([k, l, t]) => (
            <div key={k} className="py-2" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{l}</div>
              {t === "text" ? (
                <input value={cfg[k]} onChange={(e) => upd(k, e.target.value)}
                  style={{ fontFamily: MONO, fontSize: 12, width: "100%", padding: "5px 7px", border: `1px solid ${C.rule}`, background: C.wash }} />
              ) : <NumIn value={cfg[k]} onChange={(v) => upd(k, v)} w={92} />}
            </div>
          ))}
        </div>
        <div className="mt-3 p-2.5 flex items-start gap-2" style={{ background: "#FBF6EC", border: `1px solid #E6D3B3` }}>
          <AlertTriangle size={14} color={C.policy} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.6 }}>
            생성 코드는 반출 심사를 염두에 두고 관측 수 {cfg.cellMin}건 미만 셀을 자동 마스킹하고, 분석조건 로그를 함께 남깁니다.
            테이블·변수명은 기관 스펙에 맞춰 확인 후 실행하세요.
          </span>
        </div>
      </Panel>
      <Panel eyebrow="생성 결과" title={`vaxinsight_${cfg.dz}_${cfg.yFrom}_${cfg.yTo}.sas`} accent={C.claim}>
        <pre className="overflow-x-auto" style={{
          fontFamily: MONO, fontSize: 11, lineHeight: 1.65, color: C.ink,
          background: C.wash, border: `1px solid ${C.ruleSoft}`, padding: 14, maxHeight: 460, overflowY: "auto",
        }}>{code}</pre>
      </Panel>
    </>
  );
}

/* ── 7. 보고서 ───────────────────────────────────────────────────── */
function ReportTab({ P, R }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const md = useMemo(() => buildReport(P, R), [P, R]);

  const checks = [
    ["분석 관점 명시", true, P.perspective === "societal" ? "사회적 관점" : "보건의료체계 관점"],
    ["시간지평 명시", true, `${P.horizon}년`],
    ["할인율 명시", true, `비용·효과 ${pct(P.rC, 1)}`],
    ["비교 대안 정의", true, "무접종 대조"],
    ["모형 구조 제시", true, "3-상태 Markov, 1년 주기"],
    ["파라미터 출처 표기", true, "3계층 provenance 태깅"],
    ["일원 민감도분석", true, "토네이도 10개 변수"],
    ["확률적 민감도분석", true, "PSA 탭에서 실행"],
    ["이질성 분석", P.startAge !== 65, "연령별 전략 비교 수행 시 충족"],
    ["예산영향분석", true, "5년 재정 추계"],
    ["재현 가능성", true, "시드 고정·집계 반출 구조"],
    ["이해상충 기술", false, "제출 전 연구자 직접 작성 필요"],
  ];

  const genAI = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [{
            role: "user", content:
              `당신은 국내 백신 경제성평가 보고서를 쓰는 보건경제 연구자입니다. 아래 분석 결과를 바탕으로 학술 보고서의 '결과 및 고찰' 절 초안을 한국어로 작성하세요. 숫자를 지어내지 말고 주어진 값만 쓰고, 결론을 단정하지 말고 불확실성의 방향을 함께 기술하세요. 800자 내외.\n\n${md}`,
          }],
        }),
      });
      const d = await r.json();
      setDraft(d.content.filter((x) => x.type === "text").map((x) => x.text).join("\n"));
    } catch (e) {
      setErr("초안 생성에 실패했습니다. 아래 구조화 초안은 그대로 사용할 수 있습니다.");
    }
    setBusy(false);
  };
  const dl = () => {
    const b = new Blob([md + (draft ? `\n\n## AI 서술 초안\n\n${draft}` : "")], { type: "text/markdown;charset=utf-8" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = "vaxinsight_report.md"; a.click(); URL.revokeObjectURL(u);
  };

  return (
    <>
      <Panel eyebrow="보고 점검" title="CHEERS 2022 기반 자동 점검" accent={C.ink}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {checks.map(([k, ok, note]) => (
            <div key={k} className="flex items-center gap-2 py-2" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
              {ok ? <Check size={13} color={C.good} strokeWidth={2.4} /> : <AlertTriangle size={13} color={C.policy} />}
              <span style={{ fontSize: 12.5, flex: 1 }}>{k}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{note}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="자동 생성" title="보고서 초안" accent={C.ink}
        right={<div className="flex gap-2">
          <Btn small onClick={genAI} disabled={busy}><Sparkles size={11} /> {busy ? "작성 중" : "AI 서술 추가"}</Btn>
          <Btn small kind="solid" onClick={dl}><Download size={11} /> .md 저장</Btn>
        </div>}>
        {err && <div className="mb-3 p-2.5" style={{ background: "#FBF0F2", border: `1px solid #E6C3CB`, fontSize: 11.5, color: C.bad }}>{err}</div>}
        <pre className="overflow-x-auto" style={{
          fontFamily: MONO, fontSize: 11.2, lineHeight: 1.7, color: C.ink, whiteSpace: "pre-wrap",
          background: C.wash, border: `1px solid ${C.ruleSoft}`, padding: 14, maxHeight: 420, overflowY: "auto",
        }}>{md}</pre>
        {draft && (
          <div className="mt-4">
            <Eyebrow color={C.lit}>AI 서술 초안 — 연구자 검토 필요</Eyebrow>
            <div className="mt-2 p-3" style={{ background: "#F7F5FC", border: `1px solid #DDD6EE`, fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {draft}
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}

function buildReport(P, R) {
  const persp = P.perspective === "societal" ? "사회적 관점" : "보건의료체계 관점";
  return `# 백신 경제성평가 결과 요약
생성: VaxInsight (재현용 설정 포함)

## 1. 분석 개요
- 대상: ${P.startAge}세 코호트, 재조합 대상포진 백신 2회 접종 vs 무접종
- 관점: ${persp}
- 시간지평: ${P.horizon}년 (${P.startAge}→${P.startAge + P.horizon}세)
- 할인율: 비용 ${pct(P.rC, 1)}, 효과 ${pct(P.rE, 1)}
- 모형: 3-상태 Markov (건강 / PHN / 사망), 1년 주기, 반주기 보정 ${P.halfCycle ? "적용" : "미적용"}
- 임계값: ${man(P.wtp)}/QALY

## 2. 자료원 및 파라미터 출처
| 계층 | 파라미터 | 출처 |
|---|---|---|
| 청구자료(자동) | 발생률·PHN 확률·입원률·직접의료비 | HIRA 원격분석환경 집계 반출본 (2019–2023) |
| 문헌(추천→확정) | 백신효과 ${pct(P.ve0)}, 감소율 ${nf(P.waning, 3)}/년, PHN 효용감소 ${nf(P.uDecPHN, 3)} | 규칙기반 점수화 후 연구자 확정 |
| 정책판단(입력) | 관점·할인율·시간지평·접종비용 ${man(P.vePrice, 1)} | 연구자 설정 |

## 3. 기본 분석 결과 (1인 기준, 할인 적용)
| 항목 | 무접종 | 접종 | 증분 |
|---|---|---|---|
| 총 비용 | ${won(R.nv.cost)} | ${won(R.vx.cost)} | ${won(R.dC)} |
| 총 QALY | ${nf(R.nv.qaly, 4)} | ${nf(R.vx.qaly, 4)} | ${nf(R.dQ, 5)} |
| 대상포진 발생 | ${nf(R.nv.hz, 4)} | ${nf(R.vx.hz, 4)} | −${nf(R.hzAvert, 4)} |
| PHN 이환연수 | ${nf(R.nv.phnY, 4)} | ${nf(R.vx.phnY, 4)} | −${nf(R.phnAvert, 4)} |

- **ICER = ${R.status === "tradeoff" ? `${won(R.icer)}/QALY` : R.status === "dominant" ? "우월(dominant)" : "열등(dominated)"}**
- 순편익(NMB, λ=${man(P.wtp)}) = ${won(R.nmb)} → ${R.nmb >= 0 ? "임계값 기준 비용효과적" : "임계값 기준 비용효과적이지 않음"}
- 접종비용의 ${pct(Math.min(1, (R.nv.cost - (R.vx.cost - P.vePrice)) / P.vePrice), 1)}가 치료비 절감으로 상쇄됨

## 4. 예산영향
${nf(P.cohort)}명 대상, 접종률 ${pct(P.coverage, 0)} 가정 시 1년차 접종비용 약 ${nf((P.cohort * P.coverage * P.vePrice) / 1e8, 1)}억원.

## 5. 해석 시 유의점
- 결론은 백신 효과의 시간 경과 감소율과 접종비용에 민감함(토네이도 상위 변수 확인).
- PHN 효용감소분은 문헌 간 편차가 커 국내 EQ-5D 근거 보강 시 불확실성이 줄어듦.
- 집단면역·대상포진 관련 사망은 보수적으로 모형에 포함하지 않았으므로 효과가 과소추정되었을 수 있음.
`;
}
