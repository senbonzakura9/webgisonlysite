/* Beytepe Quest — Frontend
   - Leaflet + OpenStreetMap tiles
   - Auth: JWT in localStorage
   - CRUD: Issues (GeoJSON)
*/
const API_BASE = ""; // same origin (served by Express)

const els = (id) => document.getElementById(id);
const show = (el, v=true) => el.classList.toggle("hidden", !v);

let token = localStorage.getItem("bq_token") || null;
let me = null;

let map, markersLayer, draftMarker = null;
let selectedIssueId = null;
let selectedIssue = null;

// "game" XP
let xp = Number(localStorage.getItem("bq_xp") || "0");
function setXP(delta){
  xp = Math.max(0, Math.min(100, xp + delta));
  localStorage.setItem("bq_xp", String(xp));
  const fill = els("xpFill");
  fill.style.width = `${xp}%`;
  els("xpText").textContent = `${xp} / 100`;
}
setXP(0);

function authHeaders(){
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function toast(targetId, kind, text){
  const box = els(targetId);
  box.textContent = text;
  box.className = "msg " + (kind === "good" ? "good" : kind === "bad" ? "bad" : "");
  box.hidden = false;
  setTimeout(() => (box.hidden = true), 5000);
}

async function api(path, opts={}){
  const res = await fetch(API_BASE + path, opts);
  const ctype = res.headers.get("content-type") || "";
  let body = null;
  if (ctype.includes("application/json")) body = await res.json();
  else body = await res.text();

  if (!res.ok){
    const msg = body?.error || body?.message || (typeof body === "string" ? body : "Request failed");
    throw new Error(msg);
  }
  return body;
}

function setWhoAmI(){
  els("whoami").textContent = me ? `${me.username} (${me.role})` : "guest";
  show(els("btnLogout"), !!me);

  show(els("authGuest"), !me);
  show(els("authAuthed"), !!me);

  if (me){
    els("meName").textContent = me.username;
    els("meRole").textContent = me.role;
  }

  show(els("adminCard"), me?.role === "admin");

  // UI constraints by role
  els("fAssign").disabled = (me?.role === "student");
}

function canEdit(issue){
  if (!me) return false;
  if (me.role === "admin") return true;
  if (me.role === "staff") return true; // staff can update status/assignment and some fields
  return issue.createdBy === me.id; // student: own only
}

function canDelete(issue){
  if (!me) return false;
  return me.role === "admin";
}

function fillForm(issue){
  selectedIssueId = issue?.id || null;
  selectedIssue = issue || null;
  els("fTitle").value = issue?.title || "";
  els("fCategory").value = issue?.category || "Other";
  els("fDesc").value = issue?.description || "";
  els("fStatus").value = issue?.status || "open";
  els("fAssign").value = issue?.assignedToUsername || "";
  els("fLat").value = issue?.lat ?? "";
  els("fLng").value = issue?.lng ?? "";

  show(els("btnDelete"), !!issue && canDelete(issue));

  // Students cannot assign reports
  els("fAssign").disabled = (me?.role === "student");
}


function clearForm(){
  selectedIssueId = null;
  fillForm(null);
  if (draftMarker){
    markersLayer.removeLayer(draftMarker);
    draftMarker = null;
  }
}

function badgeClass(status){
  return status || "open";
}

function statusLabel(s){
  const m = { open:"Open", in_progress:"In progress", resolved:"Resolved", rejected:"Rejected" };
  return m[s] || s;
}

function fmtDate(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString();
  }catch{ return iso; }
}

function issueToHTML(issue){
  return `
    <div class="item" data-id="${issue.id}">
      <div class="item-top">
        <div>
          <div class="item-title">${escapeHtml(issue.title)}</div>
          <div class="item-meta">
            <span class="badge ${badgeClass(issue.status)}">${statusLabel(issue.status)}</span>
            <span class="badge">${escapeHtml(issue.category)}</span>
          </div>
        </div>
        <div class="small">#${issue.id.slice(0,6)}</div>
      </div>
      <div class="item-meta" style="margin-top:6px;">
        by <strong>${escapeHtml(issue.createdByUsername || "unknown")}</strong>
        • ${fmtDate(issue.createdAt)}
        ${issue.assignedToUsername ? ` • assigned: <strong>${escapeHtml(issue.assignedToUsername)}</strong>` : ""}
      </div>
      <div class="item-meta" style="margin-top:6px;">${escapeHtml(issue.description || "")}</div>
    </div>
  `;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

async function refreshIssues(){
  const status = els("fltStatus").value;
  const category = els("fltCategory").value;
  const mine = els("fltMine").checked;

  // bbox filter from current map view
  const b = map.getBounds();
  const params = new URLSearchParams();
  params.set("minLat", b.getSouth().toFixed(6));
  params.set("minLng", b.getWest().toFixed(6));
  params.set("maxLat", b.getNorth().toFixed(6));
  params.set("maxLng", b.getEast().toFixed(6));
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (mine && me) params.set("createdBy", me.id);

  const data = await api(`/api/issues?${params.toString()}`, { headers: authHeaders() });

  // render list
  const list = els("list");
  list.innerHTML = data.items.map(issueToHTML).join("");

  // hook list clicks
  list.querySelectorAll(".item").forEach((div)=>{
    div.addEventListener("click", ()=>{
      const id = div.getAttribute("data-id");
      const issue = data.items.find(x=>x.id===id);
      if (!issue) return;
      selectIssue(issue);
    });
  });

  // render markers
  markersLayer.clearLayers();
  data.items.forEach((issue)=>{
    const m = L.marker([issue.lat, issue.lng]);
    m.bindPopup(`<b>${escapeHtml(issue.title)}</b><br>${escapeHtml(issue.category)} • ${statusLabel(issue.status)}`);
    m.on("click", ()=> selectIssue(issue));
    markersLayer.addLayer(m);
  });
}

function selectIssue(issue){
  fillForm(issue);

  // move map
  map.setView([issue.lat, issue.lng], Math.max(map.getZoom(), 16));

  // create/update draft marker to show selected item
  if (draftMarker){
    markersLayer.removeLayer(draftMarker);
    draftMarker = null;
  }
  draftMarker = L.circleMarker([issue.lat, issue.lng], { radius: 10, weight: 2 });
  draftMarker.addTo(markersLayer);

  // show permissions tip
  const editable = canEdit(issue);
  const deletable = canDelete(issue);
  const msg = (!issue)
    ? ""
    : (me?.role === "admin")
      ? "Selected report. You can edit or delete it."
      : (me?.role === "staff")
        ? "Selected report. You can update status/assignment."
        : (editable
          ? "Selected report. You can edit your own report."
          : "Selected report. You can view it, but you cannot edit it with your current role.");
  if (msg) toast("formMsg", "good", msg);
}

async function whoAmI(){
  if (!token){
    me = null;
    setWhoAmI();
    return;
  }
  try{
    me = await api("/api/auth/me", { headers: authHeaders() });
    setWhoAmI();
  }catch(e){
    token = null;
    localStorage.removeItem("bq_token");
    me = null;
    setWhoAmI();
  }
}

function setupTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      show(els("tab-login"), tab==="login");
      show(els("tab-register"), tab==="register");
    });
  });
}

async function boot(){
  // API ping
  try{
    const p = await api("/api/health");
    els("apiStatus").textContent = p.ok ? "online" : "offline";
  }catch{
    els("apiStatus").textContent = "offline";
    els("apiStatus").style.color = "#ffb3c0";
  }

  setupTabs();
  await whoAmI();

  // Leaflet map (Beytepe Campus-ish center)
  map = L.map("map", { zoomControl: true });
  const beytepe = [39.8717, 32.7333]; // approx
  map.setView(beytepe, 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // click map to create draft marker + fill lat/lng
  map.on("click", (e)=>{
    const { lat, lng } = e.latlng;
    els("fLat").value = lat.toFixed(6);
    els("fLng").value = lng.toFixed(6);

    if (draftMarker){
      markersLayer.removeLayer(draftMarker);
      draftMarker = null;
    }
    draftMarker = L.marker([lat, lng], { opacity: 0.7 });
    draftMarker.addTo(markersLayer).bindPopup("New report location").openPopup();

    // fun XP
    setXP(3);
  });

  // filters
  ["fltStatus","fltCategory","fltMine"].forEach(id=>{
    els(id).addEventListener("change", ()=> refreshIssues().catch(console.error));
  });
  map.on("moveend", ()=> refreshIssues().catch(console.error));

  // auth
  els("btnLogin").addEventListener("click", onLogin);
  els("btnRegister").addEventListener("click", onRegister);
  els("btnLogout").addEventListener("click", onLogout);

  // form actions
  els("btnSave").addEventListener("click", onSave);
  els("btnClear").addEventListener("click", ()=> clearForm());
  els("btnDelete").addEventListener("click", onDelete);

  // admin
  els("btnLoadUsers").addEventListener("click", loadUsers);

  // initial load
  await refreshIssues();
}

async function onLogin(){
  try{
    const username = els("loginUser").value.trim();
    const password = els("loginPass").value;
    const data = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ username, password })
    });
    token = data.token;
    localStorage.setItem("bq_token", token);
    await whoAmI();
    toast("authMsg","good","Logged in!");
    setXP(10);
    await refreshIssues();
  }catch(e){
    toast("authMsg","bad", e.message);
  }
}

async function onRegister(){
  try{
    const username = els("regUser").value.trim();
    const password = els("regPass").value;
    const role = els("regRole").value;
    const data = await api("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ username, password, role })
    });
    token = data.token;
    localStorage.setItem("bq_token", token);
    await whoAmI();
    toast("authMsg","good","Account created!");
    setXP(15);
    await refreshIssues();
  }catch(e){
    toast("authMsg","bad", e.message);
  }
}

async function onLogout(){
  token = null;
  localStorage.removeItem("bq_token");
  me = null;
  setWhoAmI();
  toast("authMsg","good","Logged out.");
  await refreshIssues();
}

function readForm(){
  const title = els("fTitle").value.trim();
  const category = els("fCategory").value;
  const description = els("fDesc").value.trim();
  const status = els("fStatus").value;
  const lat = Number(els("fLat").value);
  const lng = Number(els("fLng").value);

  const payload = { title, category, description, status, lat, lng };

  // Students are not allowed to assign reports
  if (me?.role !== "student"){
    payload.assignedTo = els("fAssign").value.trim();
  }

  return payload;
}

async function onSave(){
  try{
    if (!me) throw new Error("Please login first.");

    const payload = readForm();
    if (!payload.title) throw new Error("Title is required.");
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng))
      throw new Error("Please click the map to set a location.");

    const method = selectedIssueId ? "PATCH" : "POST";
    const path = selectedIssueId ? `/api/issues/${selectedIssueId}` : "/api/issues";

    const saved = await api(path, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    toast("formMsg","good", selectedIssueId ? "Updated!" : "Created!");
    setXP(selectedIssueId ? 6 : 12);
    clearForm();
    await refreshIssues();

    // focus on saved item
    if (saved?.lat && saved?.lng) map.setView([saved.lat, saved.lng], Math.max(map.getZoom(), 16));
  }catch(e){
    toast("formMsg","bad", e.message);
  }
}

async function onDelete(){
  try{
    if (!me) throw new Error("Please login first.");
    if (!selectedIssueId || !selectedIssue) throw new Error("No selected report to delete.");
    if (!canDelete(selectedIssue)) throw new Error("You are not allowed to delete this report.");
    if (!confirm("Delete this report?")) return;

    await api(`/api/issues/${selectedIssueId}`, {
      method: "DELETE",
      headers: authHeaders()
    });

    toast("formMsg","good","Deleted!");
    setXP(8);
    clearForm();
    await refreshIssues();
  }catch(e){
    toast("formMsg","bad", e.message);
  }
}

async function loadUsers(){
  try{
    const data = await api("/api/users", { headers: authHeaders() });
    const box = els("usersList");
    box.innerHTML = data.items.map(u => `
      <div class="item" style="cursor:default;">
        <div class="item-top">
          <div>
            <div class="item-title">${escapeHtml(u.username)}</div>
            <div class="item-meta"><span class="badge">${escapeHtml(u.role)}</span> <span class="badge">id:${u.id.slice(0,8)}</span></div>
          </div>
        </div>
      </div>
    `).join("");
  }catch(e){
    toast("formMsg","bad", e.message);
  }
}

boot().catch((e)=> console.error(e));
