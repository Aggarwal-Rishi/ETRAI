"use strict";
const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath,"utf-8").split("\n").forEach(line => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^[""]|[""]$/g,"");
  });
}
const { GoogleGenAI } = require("@google/genai");
const key = process.env.GEMINI_API_KEY || "";
const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
function redact(s){ return s.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"),"[KEY]"); }
async function main(){
  if(!key||key.includes("YOUR_GEMINI_API_KEY_HERE")){console.error("PROBE: key missing/placeholder");process.exit(1);}
  console.log("PROBE: key.length="+key.length+" prefix="+key.substring(0,6)+"...");
  console.log("PROBE: model="+model);
  const ai = new GoogleGenAI({apiKey:key});
  try{
    const r = await ai.models.generateContent({model, contents:"Say PONG", config:{temperature:0}});
    console.log("PROBE T1: success. has.text="+(typeof r.text==="function"));
    if(typeof r.text==="function") console.log("PROBE T1: text()="+String(r.text()).substring(0,80));
    else console.log("PROBE T1: candidates text="+String((r.candidates||[])[0]?.content?.parts?.[0]?.text).substring(0,80));
  }catch(e){console.error("PROBE T1 FAIL:",redact(e.message||String(e)));}
  try{
    const r2 = await ai.models.generateContent({model, contents:"Return JSON {\"ok\":true}", config:{responseMimeType:"application/json",temperature:0}});
    console.log("PROBE T2: success. has.text="+(typeof r2.text==="function"));
    if(typeof r2.text==="function") console.log("PROBE T2: text()="+String(r2.text()).substring(0,200));
    else console.log("PROBE T2: candidates="+String((r2.candidates||[])[0]?.content?.parts?.[0]?.text).substring(0,200));
  }catch(e2){console.error("PROBE T2 FAIL:",redact(e2.message||String(e2)));}
}
main().catch(e=>{ console.error("PROBE outer:",redact(e.message||String(e))); process.exit(1); });
