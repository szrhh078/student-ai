import { auth, db, doc, setDoc, getDoc, serverTimestamp, getIdToken, watchAuth, register, login, googleLogin, logout, resetPassword } from "./auth.js";
import {
  collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, updateDoc,
  where, Timestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const state = { user: null, records: [], tasks: [], reminders: [], currentView: "overview" };
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3000); }
function errorText(e) {
  const map = {
    "auth/email-already-in-use":"That email is already registered.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/weak-password":"Use a password with at least 6 characters.",
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/popup-closed-by-user":"Google sign-in was cancelled.",
    "auth/unauthorized-domain":"Add this domain to Firebase Authentication → Settings → Authorized domains.",
    "permission-denied":"Firestore blocked this action. Check your Firestore security rules."
  };
  return map[e.code] || e.message || "Something went wrong.";
}
function showAuth(tab="login") {
  $("auth-screen").hidden=false; $("app-shell").hidden=true;
  $("auth-login").hidden=tab!=="login"; $("auth-register").hidden=tab!=="register";
  $("auth-forgot").hidden=tab!=="forgot"; $("auth-note").textContent="";
}
function showApp(user) {
  $("auth-screen").hidden=true; $("app-shell").hidden=false;
  $("user-name").textContent=user.displayName || user.email;
  $("user-email").textContent=user.email || "";
  $("user-avatar").textContent=(user.displayName || user.email || "S").slice(0,1).toUpperCase();
  $("verify-banner").hidden=user.emailVerified || user.providerData.some(p=>p.providerId==="google.com");
  $("verify-banner").querySelector("span").textContent="Please verify your email. Check your inbox, then refresh this page.";
  loadAll().catch(e=>toast(errorText(e)));
}
function switchView(view) {
  state.currentView=view;
  document.querySelectorAll(".page").forEach(p=>p.hidden=p.id!==`page-${view}`);
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("page-heading").textContent=({overview:"Your academic overview",planner:"AI study planner",tutor:"Learning assistant",tasks:"Tasks & deadlines",calendar:"Time management",reports:"Weekly activity report",settings:"Account settings"})[view] || "Smart Student AI";
  if(view==="reports") renderReport();
  if(view==="tasks") renderTasks();
  if(view==="calendar") renderReminders();
  if(view==="overview") renderOverview();
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
document.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.jump)));
$("to-register").onclick=()=>showAuth("register");
$("to-login").onclick=()=>showAuth("login");
$("to-forgot").onclick=()=>showAuth("forgot");
$("back-login").onclick=()=>showAuth("login");
$("register-form").addEventListener("submit",async e=>{
  e.preventDefault(); const btn=$("register-submit"); btn.disabled=true;
  try { await register($("reg-email").value,$("reg-password").value,$("reg-name").value); }
  catch(err){ $("auth-note").textContent=errorText(err); }
  finally{btn.disabled=false;}
});
$("login-form").addEventListener("submit",async e=>{
  e.preventDefault(); const btn=$("login-submit"); btn.disabled=true;
  try { await login($("login-email").value,$("login-password").value); }
  catch(err){ $("auth-note").textContent=errorText(err); }
  finally{btn.disabled=false;}
});
$("google-signin").onclick=async()=>{try{await googleLogin();}catch(e){$("auth-note").textContent=errorText(e);}};
$("forgot-form").addEventListener("submit",async e=>{
  e.preventDefault(); try{await resetPassword($("forgot-email").value);$("auth-note").textContent="Password reset email sent. Check your inbox.";}catch(err){$("auth-note").textContent=errorText(err);}
});
$("logout").onclick=()=>logout().catch(e=>toast(errorText(e)));
$("resend-verification").onclick=async()=>{try{const {sendEmailVerification}=await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js");await sendEmailVerification(auth.currentUser);toast("Verification email sent.");}catch(e){toast(errorText(e));}};

async function userCollection(name){return collection(db,"users",state.user.uid,name);}
async function addRecord(type,title,content,extra={}) {
  const ref=await addDoc(await userCollection("activity"),{type,title,content,createdAt:serverTimestamp(),createdAtMs:Date.now(),...extra});
  await loadRecords(); return ref;
}
async function loadRecords(){
  const q=query(await userCollection("activity"),orderBy("createdAtMs","desc"),limit(100));
  const snap=await getDocs(q); state.records=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderOverview();
}
async function loadTasks(){
  const snap=await getDocs(query(await userCollection("tasks"),orderBy("dueDate","asc")));
  state.tasks=snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function loadReminders(){
  const snap=await getDocs(query(await userCollection("reminders"),orderBy("whenMs","asc")));
  state.reminders=snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function loadAll(){await Promise.all([loadRecords(),loadTasks(),loadReminders()]);renderTasks();renderReminders();}

function markdown(text) {
  let html=escapeHTML(text);
  html=html.replace(/^### (.*)$/gm,"<h3>$1</h3>").replace(/^## (.*)$/gm,"<h2>$1</h2>").replace(/^# (.*)$/gm,"<h2>$1</h2>");
  html=html.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>").replace(/`([^`]+)`/g,"<code>$1</code>");
  html=html.replace(/^\s*[-*] (.*)$/gm,"<li>$1</li>").replace(/(?:<li>.*<\/li>\s*)+/gs,m=>`<ul>${m}</ul>`);
  html=html.replace(/\n/g,"<br>"); return html;
}
async function generate(task,prompt,outId,buttonId){
  const out=$(outId),btn=$(buttonId); btn.disabled=true; out.innerHTML='<div class="loading"><i></i> Preparing your response…</div>';
  try{
    const token=await getIdToken();
    const r=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({task,prompt})});
    const data=await r.json(); if(!r.ok)throw new Error(data.error||"AI request failed");
    out.innerHTML=markdown(data.text);
    await addRecord(task,task==="planner"?"Weekly study plan":$("topic").value.slice(0,80),data.text,{model:data.model});
    toast("Response saved to your activity.");
  }catch(e){out.textContent=e.message;toast(e.message);}
  finally{btn.disabled=false;}
}
$("planner-form").onsubmit=e=>{
  e.preventDefault();
  const prompt=`Create a ${$("plan-days").value} academic schedule. Subjects and priorities: ${$("plan-subjects").value}. Study time per day: ${$("plan-hours").value}. Upcoming deadlines: ${$("plan-deadlines").value||"None supplied"}. Fixed commitments: ${$("plan-commitments").value||"Not supplied"}. Include specific study blocks, breaks, revision, and a weekly review. Never invent class times.`;
  generate("planner",prompt,"planner-output","planner-submit");
};
$("tutor-form").onsubmit=e=>{
  e.preventDefault();
  const prompt=`Subject: ${$("tutor-subject").value}. Level: ${$("tutor-level").value}. Explain: ${$("topic").value}. Teach slowly and step by step. Include definitions, one worked example, common mistakes, three practice questions and answers.`;
  generate("tutor",prompt,"tutor-output","tutor-submit");
};

$("task-form").onsubmit=async e=>{
  e.preventDefault();
  try{
    await addDoc(await userCollection("tasks"),{title:$("task-title").value.trim(),subject:$("task-subject").value,dueDate:$("task-date").value,priority:$("task-priority").value,done:false,createdAt:serverTimestamp()});
    e.target.reset(); await loadTasks();renderTasks();toast("Task saved.");
  }catch(err){toast(errorText(err));}
};
async function renderTasks(){
  if(!state.user)return;
  const el=$("task-list");
  el.innerHTML=state.tasks.length?state.tasks.map(t=>`<div class="task-row"><label><input type="checkbox" data-task="${t.id}" ${t.done?"checked":""}><span class="${t.done?"done":""}">${escapeHTML(t.title)}</span></label><small>${escapeHTML(t.subject)} · ${escapeHTML(t.dueDate||"No due date")} · ${escapeHTML(t.priority)}</small><button class="icon-btn" data-delete-task="${t.id}" aria-label="Delete task">×</button></div>`).join(""):'<div class="empty-state">No tasks yet. Add your first assignment or deadline.</div>';
  el.querySelectorAll("[data-task]").forEach(c=>c.onchange=async()=>{await updateDoc(doc(db,"users",state.user.uid,"tasks",c.dataset.task),{done:c.checked});await loadTasks();renderTasks();});
  el.querySelectorAll("[data-delete-task]").forEach(b=>b.onclick=async()=>{await deleteDoc(doc(db,"users",state.user.uid,"tasks",b.dataset.deleteTask));await loadTasks();renderTasks();});
}
$("reminder-form").onsubmit=async e=>{
  e.preventDefault();
  const when=$("reminder-when").value;
  try{
    await addDoc(await userCollection("reminders"),{title:$("reminder-title").value.trim(),when,whenMs:new Date(when).getTime(),createdAt:serverTimestamp(),notified:false});
    e.target.reset();await loadReminders();renderReminders();toast("Reminder saved.");
  }catch(err){toast(errorText(err));}
};
function renderReminders(){
  if(!state.user)return;
  $("reminder-list").innerHTML=state.reminders.length?state.reminders.map(r=>`<div class="task-row"><div><b>${escapeHTML(r.title)}</b><small>${new Date(r.whenMs).toLocaleString()}</small></div><button class="icon-btn" data-del-rem="${r.id}">×</button></div>`).join(""):'<div class="empty-state">No reminders scheduled.</div>';
  document.querySelectorAll("[data-del-rem]").forEach(b=>b.onclick=async()=>{await deleteDoc(doc(db,"users",state.user.uid,"reminders",b.dataset.delRem));await loadReminders();renderReminders();});
}
$("enable-notifications").onclick=async()=>{
  if(!("Notification" in window)){toast("This browser does not support notifications.");return;}
  const permission=await Notification.requestPermission();
  if(permission==="granted"){toast("Notifications enabled on this device.");scheduleLocalReminders();}
  else toast("Notification permission was not granted.");
};
function scheduleLocalReminders(){
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  const now=Date.now();
  state.reminders.filter(r=>r.whenMs>now && r.whenMs-now<24*60*60*1000).forEach(r=>{
    const key=`ssai-notified-${state.user.uid}-${r.id}`;
    if(sessionStorage.getItem(key))return;
    setTimeout(()=>{new Notification("Smart Student AI reminder",{body:r.title,icon:"/icon.svg"});sessionStorage.setItem(key,"1");},Math.min(r.whenMs-now,2147480000));
  });
}
function renderOverview(){
  if(!state.user)return;
  $("stat-plans").textContent=state.records.filter(r=>r.type==="planner").length;
  $("stat-lessons").textContent=state.records.filter(r=>r.type==="tutor").length;
  $("stat-tasks").textContent=state.tasks.filter(t=>!t.done).length;
  $("recent-activity").innerHTML=state.records.slice(0,5).map(r=>`<div class="activity-row"><span class="activity-icon">${r.type==="planner"?"▦":"✧"}</span><div><b>${escapeHTML(r.title)}</b><small>${new Date(r.createdAtMs||Date.now()).toLocaleString()}</small></div><span class="pill">${escapeHTML(r.type)}</span></div>`).join("")||'<div class="empty-state">Your plans and lessons will appear here.</div>';
}
function renderReport(){
  const now=Date.now(),weekAgo=now-7*86400000;
  const records=state.records.filter(r=>(r.createdAtMs||0)>=weekAgo);
  const tasksDone=state.tasks.filter(t=>t.done).length;
  $("report-summary").innerHTML=`<div class="report-stat"><b>${records.length}</b><span>AI sessions this week</span></div><div class="report-stat"><b>${records.filter(r=>r.type==="planner").length}</b><span>Study plans</span></div><div class="report-stat"><b>${tasksDone}</b><span>Tasks completed</span></div>`;
  $("report-list").innerHTML=records.map(r=>`<div class="activity-row"><div><b>${escapeHTML(r.title)}</b><small>${new Date(r.createdAtMs).toLocaleString()}</small></div><span class="pill">${escapeHTML(r.type)}</span></div>`).join("")||'<div class="empty-state">No recorded activity in the last 7 days yet.</div>';
}
$("download-csv").onclick=()=>{
  const rows=[["Date","Activity type","Title","Content"],...state.records.filter(r=>(r.createdAtMs||0)>=Date.now()-7*86400000).map(r=>[new Date(r.createdAtMs||Date.now()).toISOString(),r.type,r.title,r.content])];
  const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  downloadFile(csv,"smart-student-weekly-report.csv","text/csv");
};
$("download-pdf").onclick=()=>window.print();
function downloadFile(content,name,type){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
$("save-profile").onclick=async()=>{
  try{await setDoc(doc(db,"users",state.user.uid),{university:$("profile-university").value,department:$("profile-department").value,semester:$("profile-semester").value,updatedAt:serverTimestamp()},{merge:true});toast("Profile saved.");}catch(e){toast(errorText(e));}
};
$("pomodoro-start").onclick=()=>{
  let seconds=25*60;const btn=$("pomodoro-start");btn.disabled=true;
  const label=$("pomodoro-clock");
  const timer=setInterval(()=>{seconds--;label.textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;if(seconds<=0){clearInterval(timer);btn.disabled=false;label.textContent="25:00";toast("Focus session complete. Take a short break!");if("Notification" in window&&Notification.permission==="granted")new Notification("Focus session complete",{body:"Take a short break."});}},1000);
};
watchAuth(user=>{state.user=user;if(user){showApp(user);}else{showAuth("login");}});
fetch("/api/health").then(r=>r.json()).then(d=>{$("ai-status").textContent=d.configured&&d.authenticated?"AI service ready":!d.authenticated?"Server authentication setup needed":"Gemini key missing";}).catch(()=>$("ai-status").textContent="Server offline");
if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
