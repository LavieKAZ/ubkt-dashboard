/*
 * Đăng nhập / đăng ký / khôi phục mật khẩu / Google — UBKT Dashboard.
 *
 * Nguyên tắc an toàn:
 *  - Phân quyền luôn đọc từ bảng user_profiles (RLS) sau khi đăng nhập; không tin vai trò do trình duyệt gửi,
 *    không dùng user_metadata để phân quyền, không cấp quyền theo tên miền email.
 *  - Không ghi mật khẩu, access token hay liên kết khôi phục ra console/log/localStorage.
 *  - Chuyển hướng chỉ về chính tên miền đang chạy (location.origin + pathname); tham số ?next chỉ nhận
 *    tên trang .html nội bộ (chặn open redirect).
 *  - Thông báo trung lập để không lộ email nào đã tồn tại (quên mật khẩu, sai mật khẩu).
 *
 * File này dùng chung phạm vi toàn cục với script chính trong index.html
 * (getSupabaseClient, fetchCurrentProfile, currentProfile, currentUser, applyAccessControl, ...).
 */
(function(){
  "use strict";

  const APP_ROLES = ["admin", "ubkt", "vpdu", "unit"];
  const ACCOUNT_ALIASES = Object.freeze({ admin: "ubkt@tanmy.hcm", ubkt: "ubkt@tanmy.hcm" });
  const PENDING_KEY = "ubkt.auth.pending";           // chỉ lưu loại luồng + trang quay lại, không lưu bí mật
  const FORGOT_COOLDOWN_MS = 60 * 1000;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const SAFE_NEXT_RE = /^(?:\.\/)?[a-z0-9][a-z0-9-]*\.html(?:\?[^\s#\\]*)?(?:#[^\s\\]*)?$/i;
  const NEUTRAL_RESET_MESSAGE = "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.";
  const CONTACT_TEXT = "Cần hỗ trợ, vui lòng liên hệ quản trị viên hệ thống hoặc Ủy ban Kiểm tra Đảng ủy phường.";

  const EYE_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.3 10.3 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  let loginBusy = false;
  let manualSignOut = false;
  let sessionWatcherAttached = false;
  let lastForgotRequestAt = 0;
  let forgotTimer = null;
  let activeModal = null;
  let lastFocusBeforeModal = null;
  let registerBusy = false;

  const $ = id => document.getElementById(id);

  /* ---------- Tiện ích ---------- */

  function authError(message){
    const error = new Error(message);
    error.ubktFriendly = true;
    return error;
  }

  function normalizeEmail(value){
    return String(value || "").trim().toLowerCase();
  }

  function authRedirectUrl(){
    // Luôn quay về chính trang đang chạy (Preview hoặc production) — không nhận URL từ query string.
    return location.origin + location.pathname;
  }

  function sanitizeReturnTarget(value){
    if(!value) return "";
    const target = String(value).trim();
    if(target.length > 300 || !SAFE_NEXT_RE.test(target)) return "";
    if(/^(?:\.\/)?index\.html(?:[?#]|$)/i.test(target)) return "";
    return target.replace(/^\.\//, "");
  }

  function getLoginReturnTarget(){
    return sanitizeReturnTarget(new URLSearchParams(location.search).get("next"));
  }

  function writePending(kind){
    try{
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind, next: getLoginReturnTarget(), at: Date.now() }));
    }catch(_){ /* trình duyệt chặn storage: vẫn đăng nhập được, chỉ mất trang quay lại */ }
  }

  function takePending(){
    try{
      const raw = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      if(!raw) return null;
      const data = JSON.parse(raw);
      if(!data || Date.now() - Number(data.at || 0) > 30 * 60 * 1000) return null;
      return { kind: String(data.kind || ""), next: sanitizeReturnTarget(data.next) };
    }catch(_){
      return null;
    }
  }

  function cleanAuthUrl(){
    // Xóa token / mã lỗi khỏi thanh địa chỉ và lịch sử; giữ lại ?next hợp lệ.
    const params = new URLSearchParams(location.search);
    ["error", "error_code", "error_description", "code", "type", "sb"].forEach(key => params.delete(key));
    const next = sanitizeReturnTarget(params.get("next"));
    params.delete("next");
    if(next) params.set("next", next);
    const query = params.toString();
    history.replaceState(history.state, "", location.pathname + (query ? "?" + query : ""));
  }

  function setBusy(button, busy, label){
    if(!button) return;
    const labelEl = button.querySelector("[data-label]");
    if(busy){
      if(labelEl && !button.dataset.idleLabel) button.dataset.idleLabel = labelEl.textContent;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      if(label && labelEl) labelEl.textContent = label;
    }else{
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if(labelEl && button.dataset.idleLabel) labelEl.textContent = button.dataset.idleLabel;
      delete button.dataset.idleLabel;
    }
  }

  function showMessage(el, message, tone){
    if(!el) return;
    if(!message){
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = message;
    el.classList.toggle("is-info", tone === "info");
    el.hidden = false;
  }

  function markInvalid(input, invalid){
    if(!input) return;
    if(invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function isAppActive(){
    return !!$("appScreen")?.classList.contains("active");
  }

  async function safeSignOut(){
    manualSignOut = true;
    try{
      await getSupabaseClient()?.auth.signOut();
    }catch(error){
      console.warn("Không thể kết thúc phiên đăng nhập", error?.name || "");
    }finally{
      manualSignOut = false;
      databaseReady = false;
    }
  }

  /* ---------- Thông báo lỗi tiếng Việt (không lộ chi tiết kỹ thuật) ---------- */

  function friendlyAuthError(error){
    if(error?.ubktFriendly) return error.message;
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    const status = Number(error?.status || 0);
    if(code === "invalid_credentials" || message.includes("invalid login credentials")){
      return "Email/tài khoản hoặc mật khẩu không đúng.";
    }
    if(code === "email_not_confirmed" || message.includes("email not confirmed")){
      return "Tài khoản chưa được kích hoạt. Vui lòng chờ Admin/UBKT phê duyệt hoặc liên hệ quản trị viên.";
    }
    if(code === "user_banned" || message.includes("banned")){
      return "Tài khoản đang tạm ngưng. Vui lòng liên hệ quản trị viên.";
    }
    if(status === 429 || code.includes("rate_limit") || message.includes("rate limit")){
      return "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.";
    }
    if(code === "user_already_exists" || code === "email_exists" || message.includes("already registered")){
      return "Email này đã có tài khoản. Vui lòng đăng nhập, hoặc chọn “Quên mật khẩu?” nếu không nhớ mật khẩu.";
    }
    if(message.includes("provider is not enabled") || message.includes("unsupported provider")){
      return "Đăng nhập Google chưa được bật trên hệ thống. Vui lòng đăng nhập bằng email và mật khẩu, hoặc liên hệ quản trị viên.";
    }
    if(code === "same_password"){
      return "Mật khẩu mới phải khác mật khẩu đang dùng.";
    }
    if(code === "weak_password" || message.includes("weak password") || message.includes("password should")){
      return "Mật khẩu chưa đạt yêu cầu bảo mật. Vui lòng dùng mật khẩu dài hơn, có cả chữ và số.";
    }
    if(code === "session_not_found" || code === "session_expired" || message.includes("auth session missing")){
      return "Phiên xác thực đã hết hạn. Vui lòng thực hiện lại.";
    }
    if(error?.name === "AuthRetryableFetchError" || message.includes("failed to fetch") || message.includes("network")){
      return "Chưa kết nối được máy chủ đăng nhập. Vui lòng kiểm tra mạng và thử lại.";
    }
    return "Không thực hiện được yêu cầu. Vui lòng thử lại sau.";
  }

  /* ---------- Kiểm tra mật khẩu ---------- */

  function passwordChecks(password, confirm){
    return [
      { key: "length", label: "Tối thiểu 8 ký tự", ok: password.length >= 8 && password.length <= 72 },
      { key: "letter", label: "Có chữ cái", ok: /\p{L}/u.test(password) },
      { key: "digit", label: "Có chữ số", ok: /\d/.test(password) },
      { key: "match", label: "Hai mật khẩu khớp nhau", ok: password.length > 0 && password === confirm }
    ];
  }

  function passwordProblem(password, confirm){
    if(!password) return "Vui lòng nhập mật khẩu.";
    if(password.length > 72) return "Mật khẩu tối đa 72 ký tự.";
    if(password.length < 8) return "Mật khẩu cần tối thiểu 8 ký tự.";
    if(!/\p{L}/u.test(password) || !/\d/.test(password)) return "Mật khẩu cần có cả chữ cái và chữ số.";
    if(password !== confirm) return "Hai lần nhập mật khẩu chưa khớp.";
    return "";
  }

  function renderPasswordRules(list){
    if(!list) return;
    const password = $(list.dataset.passwordRules)?.value || "";
    const confirm = $(list.dataset.passwordConfirm)?.value || "";
    list.innerHTML = passwordChecks(password, confirm)
      .map(rule => `<li data-ok="${rule.ok}">${rule.label}<span class="sr-only">${rule.ok ? " — đạt" : " — chưa đạt"}</span></li>`)
      .join("");
  }

  function setupPasswordUi(root){
    root.querySelectorAll("[data-toggle-password]").forEach(button => {
      if(button.dataset.ready) return;
      button.dataset.ready = "1";
      button.innerHTML = EYE_ON;
      button.addEventListener("click", () => {
        const input = $(button.dataset.togglePassword);
        if(!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.setAttribute("aria-pressed", String(show));
        button.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
        button.innerHTML = show ? EYE_OFF : EYE_ON;
      });
    });
    root.querySelectorAll("[data-password-rules]").forEach(list => {
      renderPasswordRules(list);
      [list.dataset.passwordRules, list.dataset.passwordConfirm].forEach(id => {
        $(id)?.addEventListener("input", () => renderPasswordRules(list));
      });
    });
  }

  function hidePasswords(root){
    root.querySelectorAll("[data-toggle-password]").forEach(button => {
      const input = $(button.dataset.togglePassword);
      if(input) input.type = "password";
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "Hiện mật khẩu");
      button.innerHTML = EYE_ON;
    });
  }

  /* ---------- Chuyển màn hình trong thẻ đăng nhập ---------- */

  function showAuthView(view, options = {}){
    const card = $("authCard");
    if(!card) return;
    card.querySelectorAll("[data-auth-view]").forEach(el => { el.hidden = el.dataset.authView !== view; });
    if(view === "loading" && options.text) $("authLoadingText").textContent = options.text;
    if(view !== "login") showMessage($("authNotice"), "");
    if(options.focus !== false){
      const target = view === "login" && !options.focusTitle
        ? $("loginUser")
        : card.querySelector(`[data-auth-view="${view}"] .ax-title`);
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    }
  }

  function showNotice(message, tone){
    const el = $("authNotice");
    if(!el) return;
    el.textContent = message;
    el.classList.toggle("is-warning", tone === "warning");
    el.classList.toggle("is-danger", tone === "danger");
    el.hidden = !message;
  }

  function setLoginMessage(message, tone){
    showMessage($("loginErr"), message, tone);
  }

  function clearLoginMessage(){
    showMessage($("loginErr"), "");
  }

  function showAccountStatus(profile, fallbackEmail){
    const status = profile?.approval_status || "";
    const unit = canonicalUnitValue(profile?.requested_unit) || canonicalUnitValue(profile?.unit_name) || "Chưa cung cấp";
    let tone = "danger";
    let title = "Tài khoản chưa được phép sử dụng hệ thống";
    let text = "Tài khoản của bạn hiện chưa có quyền truy cập.";
    let badge = "Chưa được cấp quyền";
    if(status === "pending"){
      tone = "pending";
      title = "Tài khoản đang chờ phê duyệt";
      text = "Yêu cầu cấp tài khoản đã được ghi nhận. Admin/UBKT sẽ kiểm tra và kích hoạt; bạn có thể đăng nhập ngay sau khi được duyệt.";
      badge = "Chờ phê duyệt";
    }else if(status === "rejected"){
      title = "Yêu cầu cấp tài khoản chưa được chấp thuận";
      text = profile?.review_note ? `Lý do: ${profile.review_note}` : "Yêu cầu cấp tài khoản của bạn chưa được chấp thuận.";
      badge = "Không được duyệt";
    }else if(status === "suspended" || (status === "approved" && profile?.is_active !== true)){
      title = "Tài khoản đang tạm ngưng";
      text = profile?.review_note ? `Ghi chú: ${profile.review_note}` : "Quyền truy cập của tài khoản đang tạm ngưng.";
      badge = "Tạm ngưng";
    }
    $("authStatusIcon").dataset.tone = tone;
    $("authStatusTitle").textContent = title;
    $("authStatusText").textContent = text;
    $("authStatusEmail").textContent = profile?.email || fallbackEmail || "—";
    $("authStatusUnit").textContent = unit;
    const badgeEl = $("authStatusBadge");
    badgeEl.textContent = badge;
    badgeEl.dataset.tone = tone;
    $("authStatusContact").textContent = CONTACT_TEXT;
    showAuthView("status");
  }

  /* ---------- Hồ sơ → quyết định vào hệ thống ---------- */

  function profileAccessState(profile){
    if(!profile?.id) return "missing";
    if(profile.approval_status === "approved" && profile.is_active === true){
      if(!APP_ROLES.includes(profile.role)) return "blocked";
      if(profile.role === "unit" && !canonicalUnitValue(profile.unit_name)) return "no-unit";
      return "ok";
    }
    if(profile.approval_status === "pending" && !profile.reviewed_at){
      return canonicalUnitValue(profile.requested_unit) ? "pending" : "incomplete";
    }
    if(profile.approval_status === "pending") return "pending";
    return "blocked";
  }

  async function enterAppWithProfile(profile, context){
    currentProfile = profile;
    lastAccessProfileRefreshAt = Date.now();
    databaseReady = true;
    const adminLike = isAdminUser();
    currentUser = {
      id: profile.id,
      username: context.username || profile.email,
      email: profile.email || context.email,
      name: profile.full_name || profile.unit_name || context.username || profile.email,
      role: adminLike ? "Quản trị hệ thống" : `Đơn vị · ${canonicalUnitValue(profile.unit_name)}`,
      unit: canonicalUnitValue(profile.unit_name),
      permissions: adminLike ? ["all"] : ["tasks"]
    };
    clearLoginMessage();
    attachSessionWatcher();

    const returnTarget = sanitizeReturnTarget(context.next) || getLoginReturnTarget();
    if(returnTarget){
      location.href = returnTarget;
      return;
    }
    $("loginPass").value = "";
    hidePasswords($("loginScreen"));
    showAuthView("login", { focus: false });
    $("loginScreen").classList.remove("active");
    $("appScreen").classList.add("active");
    document.body.classList.add("ubkt-initial-loading");
    applyAccessControl();
    window.scrollTo(0, 0);
    if(isSupabaseConfigured()){
      // Gửi truy vấn trước, rồi vẽ khung chờ nhẹ (Dashboard / Tab Nhiệm vụ) trong lúc chờ dữ liệu
      const loading = loadFromDatabase();
      try{
        if(typeof renderDashboardOverview === "function") renderDashboardOverview();
        if(typeof window.paintTaskGridSkeleton === "function") window.paintTaskGridSkeleton();
      }catch(error){ console.warn("Chưa vẽ được khung chờ", error?.name || ""); }
      let loaded = false;
      try{ loaded = await loading; }
      finally{ document.body.classList.remove("ubkt-initial-loading"); }
      if(!loaded || !(Array.isArray(tasks) && tasks.length)) render();
    }else{
      updateDbStatus("CSDL: chưa cấu hình", "db-offline");
      render();
    }
    if(typeof revealInit === "function") revealInit();
  }

  async function routeAuthenticatedProfile(profile, context){
    const state = profileAccessState(profile);
    if(state === "ok"){
      await enterAppWithProfile(profile, context);
      return;
    }
    if(state === "incomplete"){
      // Đăng nhập Google lần đầu: giữ phiên để gửi thông tin đăng ký cho chính tài khoản này.
      currentProfile = null;
      $("completeEmail").value = profile.email || context.email || "";
      $("completeFullName").value = profile.full_name || context.fullName || "";
      $("completeUnit").value = "";
      $("completePosition").value = "";
      showMessage($("completeMessage"), "");
      showAuthView("complete");
      return;
    }
    await safeSignOut();
    currentProfile = null;
    if(state === "no-unit"){
      showAuthView("login", { focus: false });
      setLoginMessage("Tài khoản chưa được gán đơn vị hợp lệ. Vui lòng liên hệ Admin để cập nhật quyền.");
      return;
    }
    if(state === "missing"){
      showAuthView("login", { focus: false });
      setLoginMessage("Không tìm thấy hồ sơ tài khoản. " + CONTACT_TEXT);
      return;
    }
    showAccountStatus(profile, context.email);
  }

  /* ---------- Đăng nhập bằng email / tài khoản ---------- */

  function resolveLoginEmail(username){
    // Giữ nguyên quy tắc cũ: email dùng trực tiếp; alias admin/ubkt; tên ngắn → @tanmy.vn
    return username.includes("@")
      ? username
      : (ACCOUNT_ALIASES[username.toLowerCase()] || username + "@tanmy.vn");
  }

  async function login(){
    if(loginBusy) return;
    const userInput = $("loginUser");
    const passInput = $("loginPass");
    const username = userInput.value.trim();
    const password = passInput.value.trim();   // giữ hành vi cũ (mật khẩu được trim)
    markInvalid(userInput, !username);
    markInvalid(passInput, !!username && !password);
    if(!username){
      setLoginMessage("Vui lòng nhập email hoặc tài khoản.");
      userInput.focus();
      return;
    }
    if(!password){
      setLoginMessage("Vui lòng nhập mật khẩu.");
      passInput.focus();
      return;
    }
    const cfg = getSupabaseConfig();
    if(cfg.authMode !== "supabase" || !isSupabaseConfigured()){
      setLoginMessage("Đăng nhập an toàn chưa được cấu hình. Vui lòng liên hệ quản trị hệ thống.");
      return;
    }

    loginBusy = true;
    const button = $("loginSubmit");
    setBusy(button, true, "Đang đăng nhập…");
    $("googleSignInButton").disabled = true;
    clearLoginMessage();
    showMessage($("authNotice"), "");
    const email = resolveLoginEmail(username);
    let signedIn = false;
    try{
      const authData = await signInWithSupabase(email, password);
      signedIn = true;
      const profile = await fetchCurrentProfile(authData.user?.id);
      await routeAuthenticatedProfile(profile, { username, email, source: "password" });
    }catch(error){
      console.warn("Đăng nhập không thành công", error?.code || error?.name || "");
      if(signedIn && !isAppActive()) await safeSignOut();
      showAuthView("login", { focus: false });
      setLoginMessage(friendlyAuthError(error));
      updateDbStatus("CSDL: chờ đăng nhập", "db-offline");
    }finally{
      loginBusy = false;
      setBusy(button, false);
      $("googleSignInButton").disabled = false;
    }
  }

  /* ---------- Google ---------- */

  async function signInWithGoogle(){
    if(loginBusy) return;
    const client = getSupabaseClient();
    if(!client){
      setLoginMessage("Hệ thống chưa kết nối máy chủ đăng nhập. Vui lòng liên hệ quản trị hệ thống.");
      return;
    }
    loginBusy = true;
    const button = $("googleSignInButton");
    setBusy(button, true, "Đang chuyển tới Google…");
    $("loginSubmit").disabled = true;
    clearLoginMessage();
    writePending("oauth");
    try{
      // Lấy URL đăng nhập từ Supabase nhưng chưa chuyển trang, để kiểm tra trước nhà cung cấp Google đã bật chưa.
      // Nếu chưa bật, Supabase trả về trang lỗi JSON thô thay vì màn hình chọn tài khoản Google.
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authRedirectUrl(),
          queryParams: { prompt: "select_account" },
          skipBrowserRedirect: true
        }
      });
      if(error) throw error;
      if(!data?.url) throw authError("Không tạo được liên kết đăng nhập Google. Vui lòng thử lại.");
      const enabled = await googleProviderEnabled();
      if(enabled === false){
        throw authError("Đăng nhập Google chưa được bật trên hệ thống. Vui lòng đăng nhập bằng email và mật khẩu, hoặc liên hệ quản trị viên.");
      }
      // Chuyển hướng cùng tab tới Google (luồng chuẩn của Supabase); giữ trạng thái bận cho tới khi rời trang.
      window.location.assign(data.url);
    }catch(error){
      takePending();
      console.warn("Không mở được đăng nhập Google", error?.code || error?.name || "");
      setLoginMessage(friendlyAuthError(error));
      loginBusy = false;
      setBusy(button, false);
      $("loginSubmit").disabled = false;
    }
  }

  /* Đọc cấu hình công khai của Supabase Auth (/auth/v1/settings — chỉ cần publishable key).
     true/false nếu đọc được; null nếu không xác định (khi đó vẫn để Supabase xử lý như cũ). */
  let googleProviderCache = null;
  async function googleProviderEnabled(){
    if(googleProviderCache !== null) return googleProviderCache;
    const cfg = getSupabaseConfig();
    if(!cfg?.url || !cfg?.anonKey || typeof fetch !== "function") return null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
    try{
      const response = await fetch(`${String(cfg.url).replace(/\/+$/, "")}/auth/v1/settings`, {
        headers: { apikey: cfg.anonKey },
        signal: controller?.signal,
        credentials: "omit",
        cache: "no-store"
      });
      if(!response.ok) return null;
      const settings = await response.json();
      if(typeof settings?.external?.google !== "boolean") return null;
      googleProviderCache = settings.external.google;
      if(!googleProviderCache) setTimeout(() => { googleProviderCache = null; }, 60000); // cho phép thử lại sau khi quản trị bật
      return googleProviderCache;
    }catch(_){
      return null;
    }finally{
      if(timer) clearTimeout(timer);
    }
  }

  async function handleSessionReturn(kind, pending){
    const client = getSupabaseClient();
    showAuthView("loading", { text: kind === "recovery" ? "Đang kiểm tra liên kết đặt lại mật khẩu…" : "Đang hoàn tất đăng nhập…" });
    let session = null;
    try{
      const { data } = await client.auth.getSession();
      session = data?.session || null;
    }catch(error){
      console.warn("Không đọc được phiên xác thực", error?.name || "");
    }
    cleanAuthUrl();

    if(!session){
      showAuthView("login", { focus: false });
      showNotice(kind === "recovery"
        ? "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng chọn “Quên mật khẩu?” để nhận liên kết mới."
        : "Không hoàn tất được đăng nhập. Vui lòng thử lại.", "danger");
      return;
    }

    if(kind === "recovery"){
      $("resetEmail").textContent = session.user?.email || "";
      ["resetPassword", "resetPasswordConfirm"].forEach(id => { $(id).value = ""; });
      renderPasswordRules($("resetRules"));
      showMessage($("resetMessage"), "");
      showAuthView("reset");
      return;
    }

    if(kind === "email-link"){
      // Liên kết xác nhận email: không tự vào hệ thống từ liên kết; chỉ báo trạng thái rồi yêu cầu đăng nhập.
      let profile = null;
      try{ profile = await fetchCurrentProfile(session.user.id); }catch(_){ profile = null; }
      await safeSignOut();
      const state = profileAccessState(profile);
      if(state === "pending" || state === "blocked"){
        showAccountStatus(profile, session.user.email);
      }else{
        showAuthView("login", { focus: false });
        if(session.user.email) $("loginUser").value = session.user.email;
        showNotice("Email đã được xác nhận. Vui lòng đăng nhập để tiếp tục.");
      }
      return;
    }

    if(kind === "untrusted"){
      // Token xuất hiện trên URL mà không phải do người dùng vừa bấm đăng nhập trên trình duyệt này → bỏ.
      await safeSignOut();
      showAuthView("login", { focus: false });
      return;
    }

    try{
      databaseReady = true;
      const profile = await fetchCurrentProfile(session.user.id);
      await routeAuthenticatedProfile(profile, {
        username: session.user.email,
        email: session.user.email,
        fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || "",
        next: pending?.next || "",
        source: kind
      });
    }catch(error){
      console.warn("Không tải được hồ sơ tài khoản", error?.code || error?.name || "");
      await safeSignOut();
      showAuthView("login", { focus: false });
      setLoginMessage("Không tải được hồ sơ tài khoản. Vui lòng thử lại hoặc liên hệ quản trị viên.");
    }
  }

  /* ---------- Hoàn tất đăng ký (Google lần đầu) ---------- */

  function isMissingRpc(error){
    return error?.code === "PGRST202" || /could not find the function/i.test(String(error?.message || ""));
  }

  async function submitCompleteRegistration(){
    const button = $("completeSubmit");
    if(button.disabled) return;
    const nameInput = $("completeFullName");
    const unitInput = $("completeUnit");
    const fullName = nameInput.value.trim().replace(/\s+/g, " ");
    const unit = canonicalUnitValue(unitInput.value);
    const position = $("completePosition").value.trim().replace(/\s+/g, " ");
    markInvalid(nameInput, fullName.length < 2);
    markInvalid(unitInput, !unit);
    if(fullName.length < 2){ showMessage($("completeMessage"), "Vui lòng nhập họ và tên."); nameInput.focus(); return; }
    if(!unit){ showMessage($("completeMessage"), "Vui lòng chọn đơn vị trong danh mục."); unitInput.focus(); return; }

    const client = getSupabaseClient();
    setBusy(button, true, "Đang gửi…");
    showMessage($("completeMessage"), "");
    try{
      const { data: sessionData } = await client.auth.getSession();
      const user = sessionData?.session?.user;
      if(!user) throw authError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập Google lại.");
      let { error } = await client.rpc("submit_unit_registration", {
        p_full_name: fullName,
        p_requested_unit: unit,
        p_position_title: position || null,
        p_phone: null
      });
      if(error && isMissingRpc(error)){
        // Migration chưa áp: dùng quyền cập nhật thông tin liên hệ sẵn có (chỉ họ tên + đơn vị đề nghị).
        ({ error } = await client.from("user_profiles")
          .update({ full_name: fullName, requested_unit: unit })
          .eq("id", user.id)
          .select("id")
          .single());
      }
      if(error){
        if(["22023", "42501", "P0002"].includes(error.code)) throw authError(error.message);
        throw error;
      }
      const email = user.email;
      await safeSignOut();
      showAccountStatus({ email, requested_unit: unit, approval_status: "pending" }, email);
    }catch(error){
      console.warn("Gửi thông tin đăng ký không thành công", error?.code || error?.name || "");
      showMessage($("completeMessage"), friendlyAuthError(error));
    }finally{
      setBusy(button, false);
    }
  }

  async function cancelAuthFlow(){
    await safeSignOut();
    ["resetPassword", "resetPasswordConfirm"].forEach(id => { const el = $(id); if(el) el.value = ""; });
    hidePasswords($("loginScreen"));
    showAuthView("login");
  }

  /* ---------- Đặt mật khẩu mới ---------- */

  async function submitResetPassword(){
    const button = $("resetSubmit");
    if(button.disabled) return;
    const passwordInput = $("resetPassword");
    const confirmInput = $("resetPasswordConfirm");
    const problem = passwordProblem(passwordInput.value, confirmInput.value);
    markInvalid(passwordInput, !!problem && problem !== "Hai lần nhập mật khẩu chưa khớp.");
    markInvalid(confirmInput, problem === "Hai lần nhập mật khẩu chưa khớp.");
    if(problem){
      showMessage($("resetMessage"), problem);
      return;
    }
    setBusy(button, true, "Đang cập nhật…");
    showMessage($("resetMessage"), "");
    try{
      const client = getSupabaseClient();
      const { error } = await client.auth.updateUser({ password: passwordInput.value });
      if(error) throw error;
      const email = $("resetEmail").textContent;
      passwordInput.value = "";
      confirmInput.value = "";
      await safeSignOut();
      hidePasswords($("loginScreen"));
      showAuthView("login", { focus: false });
      if(email) $("loginUser").value = email;
      showNotice("Đã cập nhật mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.");
      $("loginPass").focus();
    }catch(error){
      console.warn("Cập nhật mật khẩu không thành công", error?.code || error?.name || "");
      showMessage($("resetMessage"), friendlyAuthError(error));
    }finally{
      setBusy(button, false);
    }
  }

  /* ---------- Hộp thoại ---------- */

  function focusableIn(root){
    return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
  }

  function openModal(id, focusId){
    const modal = $(id);
    if(!modal) return;
    if(activeModal && activeModal !== modal) closeModal(activeModal.id);
    lastFocusBeforeModal = document.activeElement;
    modal.hidden = false;
    activeModal = modal;
    if(typeof lockScroll === "function") lockScroll();
    requestAnimationFrame(() => $(focusId)?.focus());
  }

  function closeModal(id){
    const modal = $(id);
    if(!modal || modal.hidden) return;
    modal.hidden = true;
    if(activeModal === modal) activeModal = null;
    if(typeof unlockScroll === "function") unlockScroll();
    if(lastFocusBeforeModal && document.contains(lastFocusBeforeModal)) lastFocusBeforeModal.focus();
    lastFocusBeforeModal = null;
  }

  document.addEventListener("keydown", event => {
    if(!activeModal) return;
    if(event.key === "Escape"){
      event.preventDefault();
      if(activeModal.id === "registerModal"){
        if(!registerBusy) closeRegisterModal();
      }
      else if(activeModal.id === "forgotPasswordModal") closeForgotPasswordModal();
      return;
    }
    if(event.key !== "Tab") return;
    const items = focusableIn(activeModal);
    if(!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
  });

  /* ---------- Đăng ký tài khoản đơn vị ---------- */

  const REGISTER_FIELD_IDS = ["registerFullName", "registerEmail", "registerUnit", "registerPassword", "registerPasswordConfirm"];

  function setRegisterFieldError(id, message){
    const input = $(id);
    const error = $(id + "Error");
    markInvalid(input, !!message);
    if(error){
      error.textContent = message || "";
      error.hidden = !message;
    }
  }

  function clearRegisterFieldErrors(){
    REGISTER_FIELD_IDS.forEach(id => setRegisterFieldError(id, ""));
  }

  function setRegisterView(view){
    const success = view === "success";
    $("registerFields").hidden = success;
    $("registerSuccess").hidden = !success;
    $("registerSubmitButton").hidden = success;
    $("registerCancelButton").hidden = success;
    $("registerDoneButton").hidden = !success;
  }

  function setRegisterBusy(busy){
    registerBusy = busy;
    setBusy($("registerSubmitButton"), busy, "Đang gửi…");
    $("registerCloseButton").disabled = busy;
    $("registerCancelButton").disabled = busy;
    $("registerForm").setAttribute("aria-busy", String(busy));
  }

  function resetRegisterForm(){
    $("registerForm").reset();
    setRegisterView("form");
    clearRegisterFieldErrors();
    showMessage($("registerMessage"), "");
    hidePasswords($("registerModal"));
    renderPasswordRules($("registerRules"));
    setRegisterBusy(false);
  }

  function openRegisterModal(){
    if(typeof populateOrganizationUnitSelects === "function") populateOrganizationUnitSelects();
    resetRegisterForm();
    openModal("registerModal", "registerFullName");
    window.ubktRegisterUi?.beforeOpen?.();
  }

  function closeRegisterModal(){
    if(registerBusy) return;
    const done = !$("registerSuccess").hidden;
    closeModal("registerModal");
    window.ubktRegisterUi?.afterClose?.();
    resetRegisterForm();
    if(done) showAuthView("login");
  }

  async function registerAccount(){
    if(registerBusy) return;
    const fields = {
      name: $("registerFullName"),
      email: $("registerEmail"),
      unit: $("registerUnit"),
      password: $("registerPassword"),
      confirm: $("registerPasswordConfirm")
    };
    const fullName = fields.name.value.trim().replace(/\s+/g, " ");
    const email = normalizeEmail(fields.email.value);
    const unit = canonicalUnitValue(fields.unit.value);
    const phone = $("registerPhone").value.trim().replace(/\s+/g, " ");
    const position = $("registerPosition").value.trim().replace(/\s+/g, " ");
    const password = fields.password.value;
    const confirm = fields.confirm.value;
    fields.email.value = email;
    clearRegisterFieldErrors();
    showMessage($("registerMessage"), "");

    let problem = "";
    let focusEl = null;
    if(fullName.length < 2){ problem = "Vui lòng nhập họ và tên."; focusEl = fields.name; }
    else if(!EMAIL_RE.test(email)){ problem = "Vui lòng nhập email công vụ hợp lệ."; focusEl = fields.email; }
    else if(!unit || !ORGANIZATION_UNITS.some(item => item.value === unit)){ problem = "Vui lòng chọn đơn vị trong danh mục."; focusEl = fields.unit; }
    else{
      problem = passwordProblem(password, confirm);
      focusEl = problem === "Hai lần nhập mật khẩu chưa khớp." ? fields.confirm : fields.password;
    }
    if(problem){
      setRegisterFieldError(focusEl.id, problem);
      focusEl?.focus();
      return;
    }

    const client = getSupabaseClient();
    if(!client){
      showMessage($("registerMessage"), "Hệ thống chưa kết nối máy chủ đăng nhập. Vui lòng liên hệ quản trị hệ thống.");
      return;
    }
    setRegisterBusy(true);
    try{
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          // Chỉ là thông tin hiển thị để Admin duyệt; vai trò luôn do máy chủ đặt = unit/pending.
          data: { full_name: fullName, phone: phone || null, requested_unit: unit, position_title: position || null },
          emailRedirectTo: authRedirectUrl()
        }
      });
      if(error) throw error;
      if(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){
        throw authError("Email này đã có tài khoản. Vui lòng đăng nhập, hoặc chọn “Quên mật khẩu?” nếu không nhớ mật khẩu.");
      }
      if(data?.session) await safeSignOut();   // không tự đăng nhập khi chưa được duyệt
      fields.password.value = "";
      fields.confirm.value = "";
      $("registerSuccessEmail").textContent = email;
      $("registerSuccessUnit").textContent = unit;
      setRegisterView("success");
      $("registerBody").scrollTop = 0;
      requestAnimationFrame(() => $("registerSuccessTitle").focus());
    }catch(error){
      console.warn("Đăng ký tài khoản không thành công", error?.code || error?.name || "");
      const message = friendlyAuthError(error);
      if(/đã có tài khoản/i.test(message)){
        setRegisterFieldError("registerEmail", message);
        fields.email.focus();
      }else{
        showMessage($("registerMessage"), message);
        $("registerBody").scrollTop = 0;
      }
    }finally{
      setRegisterBusy(false);
    }
  }

  /* ---------- Quên mật khẩu ---------- */

  function updateForgotCooldown(){
    const button = $("forgotSubmit");
    const remaining = Math.ceil((lastForgotRequestAt + FORGOT_COOLDOWN_MS - Date.now()) / 1000);
    const labelEl = button.querySelector("[data-label]");
    if(remaining > 0){
      button.disabled = true;
      labelEl.textContent = `Gửi lại sau ${remaining} giây`;
      return true;
    }
    clearInterval(forgotTimer);
    forgotTimer = null;
    button.disabled = false;
    labelEl.textContent = "Gửi hướng dẫn";
    return false;
  }

  function openForgotPasswordModal(){
    const loginValue = $("loginUser").value.trim();
    const emailInput = $("forgotEmail");
    if(!emailInput.value && loginValue.includes("@")) emailInput.value = normalizeEmail(loginValue);
    markInvalid(emailInput, false);
    showMessage($("forgotMessage"), "");
    updateForgotCooldown();
    openModal("forgotPasswordModal", "forgotEmail");
  }

  function closeForgotPasswordModal(){
    closeModal("forgotPasswordModal");
  }

  async function requestPasswordReset(){
    const button = $("forgotSubmit");
    if(button.disabled || button.getAttribute("aria-busy") === "true") return;
    const emailInput = $("forgotEmail");
    const email = normalizeEmail(emailInput.value);
    emailInput.value = email;
    if(!EMAIL_RE.test(email)){
      markInvalid(emailInput, true);
      showMessage($("forgotMessage"), "Vui lòng nhập email hợp lệ.");
      emailInput.focus();
      return;
    }
    markInvalid(emailInput, false);
    if(updateForgotCooldown()) return;
    const client = getSupabaseClient();
    if(!client){
      showMessage($("forgotMessage"), "Hệ thống chưa kết nối máy chủ đăng nhập. Vui lòng liên hệ quản trị hệ thống.");
      return;
    }
    setBusy(button, true, "Đang gửi…");
    showMessage($("forgotMessage"), "");
    let message = NEUTRAL_RESET_MESSAGE;
    let tone = "info";
    try{
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
      if(error) throw error;
    }catch(error){
      console.warn("Yêu cầu đặt lại mật khẩu không thành công", error?.code || error?.name || "");
      const friendly = friendlyAuthError(error);
      // Chỉ báo lỗi mạng / giới hạn tần suất; mọi trường hợp khác vẫn trả thông báo trung lập.
      if(/kết nối|quá nhiều lần/.test(friendly)){ message = friendly; tone = "error"; }
    }finally{
      setBusy(button, false);
    }
    showMessage($("forgotMessage"), message, tone);
    if(tone === "info"){
      lastForgotRequestAt = Date.now();
      updateForgotCooldown();
      clearInterval(forgotTimer);
      forgotTimer = setInterval(updateForgotCooldown, 1000);
    }
  }

  /* ---------- Hết phiên / đăng xuất ---------- */

  function attachSessionWatcher(){
    if(sessionWatcherAttached) return;
    const client = getSupabaseClient();
    if(!client) return;
    sessionWatcherAttached = true;
    client.auth.onAuthStateChange(event => {
      if(event !== "SIGNED_OUT" || manualSignOut) return;
      // Không gọi Supabase trực tiếp trong callback (tránh khóa phiên) — xử lý ở vòng sự kiện sau.
      setTimeout(async () => {
        if(manualSignOut || !isAppActive()) return;
        await window.logout();
        setLoginMessage("Phiên đăng nhập đã hết hạn hoặc tài khoản đã đăng xuất ở nơi khác. Vui lòng đăng nhập lại.", "info");
      }, 0);
    });
  }

  const originalLogout = window.logout;
  window.logout = async function(){
    manualSignOut = true;
    try{
      await originalLogout.apply(this, arguments);
    }finally{
      manualSignOut = false;
    }
    loginBusy = false;
    hidePasswords($("loginScreen"));
    clearLoginMessage();
    showAuthView("login", { focus: false });
  };

  /* ---------- Khởi động ---------- */

  function detectAuthReturn(){
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(location.search);
    const errorCode = hash.get("error_code") || query.get("error_code") || "";
    const error = hash.get("error") || query.get("error") || "";
    if(error || errorCode) return { kind: "error", error, errorCode };
    if(hash.has("access_token")){
      const type = hash.get("type") || "";
      if(type === "recovery") return { kind: "recovery" };
      if(type === "signup" || type === "email_change" || type === "invite" || type === "magiclink") return { kind: "email-link" };
      return { kind: "oauth" };
    }
    return null;
  }

  async function boot(){
    setupPasswordUi(document);
    $("loginForm")?.addEventListener("submit", event => { event.preventDefault(); login(); });
    $("registerForm")?.addEventListener("submit", event => { event.preventDefault(); registerAccount(); });
    $("forgotPasswordForm")?.addEventListener("submit", event => { event.preventDefault(); requestPasswordReset(); });
    $("resetPasswordForm")?.addEventListener("submit", event => { event.preventDefault(); submitResetPassword(); });
    $("completeRegistrationForm")?.addEventListener("submit", event => { event.preventDefault(); submitCompleteRegistration(); });
    ["loginUser", "loginPass"].forEach(id => $(id)?.addEventListener("input", () => {
      clearLoginMessage();
      markInvalid($(id), false);
    }));
    $("registerModal")?.querySelectorAll(".rg-input").forEach(input => {
      const clear = () => {
        if(input.getAttribute("aria-invalid") === "true") setRegisterFieldError(input.id, "");
      };
      input.addEventListener("input", clear);
      input.addEventListener("change", clear);
    });
    ["registerModal", "forgotPasswordModal"].forEach(id => {
      $(id)?.addEventListener("mousedown", event => {
        if(event.target !== event.currentTarget) return;
        if(id === "registerModal") closeRegisterModal(); else closeForgotPasswordModal();
      });
    });
    // Quay lại trang bằng nút Back sau khi đã chuyển sang Google → mở khóa nút.
    window.addEventListener("pageshow", event => {
      if(!event.persisted) return;
      loginBusy = false;
      setBusy($("googleSignInButton"), false);
      setBusy($("loginSubmit"), false);
    });

    const ret = detectAuthReturn();
    if(!ret) return;
    if(!isSupabaseConfigured()){ cleanAuthUrl(); return; }
    const pending = takePending();

    if(ret.kind === "error"){
      // Dọn mã lỗi khỏi URL rồi báo lỗi thân thiện (không hiển thị nội dung lỗi thô).
      cleanAuthUrl();
      const code = String(ret.errorCode || ret.error).toLowerCase();
      let message = "Không hoàn tất được xác thực. Vui lòng thử lại.";
      if(code.includes("otp_expired") || code.includes("expired")){
        message = "Liên kết đã hết hạn hoặc đã được sử dụng. Vui lòng yêu cầu gửi lại.";
      }else if(code === "access_denied" && pending?.kind === "oauth"){
        message = "Bạn đã hủy đăng nhập Google.";
      }
      showNotice(message, "danger");
      return;
    }
    if(ret.kind === "oauth" && pending?.kind !== "oauth"){
      await handleSessionReturn("untrusted", null);
      return;
    }
    await handleSessionReturn(ret.kind, pending);
  }

  // Xuất các hàm dùng trong onclick của index.html và các script khác.
  Object.assign(window, {
    login,
    signInWithGoogle,
    setLoginMessage,
    clearLoginMessage,
    friendlyAuthError,
    getLoginReturnTarget,
    openRegisterModal,
    closeRegisterModal,
    registerAccount,
    openForgotPasswordModal,
    closeForgotPasswordModal,
    requestPasswordReset,
    showAuthView,
    cancelAuthFlow
  });

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
