/* Hộp thoại "Đăng ký tài khoản đơn vị": hành vi giao diện (không đụng dữ liệu/API).
   - Gửi biểu mẫu → registerAccount() (index.html, giữ nguyên quy tắc kiểm tra và lệnh signUp).
   - Bám theo visualViewport để bàn phím điện thoại không che nút "Gửi yêu cầu đăng ký".
   - Hiện/ẩn mật khẩu, Esc để đóng, giữ focus trong hộp thoại, xóa lỗi của trường khi người dùng sửa. */
(function(){
  "use strict";
  const modal = document.getElementById("registerModal");
  const form = document.getElementById("registerForm");
  if(!modal || !form) return;
  const body = document.getElementById("registerBody");
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.3 10.3 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  let lastFocus = null;

  form.addEventListener("submit", event => {
    event.preventDefault();
    if(typeof registerAccount === "function") registerAccount();
  });

  // Hiện / ẩn mật khẩu
  const toggles = [...modal.querySelectorAll("[data-rg-toggle]")];
  function setPasswordVisible(button, visible){
    const input = document.getElementById(button.dataset.rgToggle);
    if(input) input.type = visible ? "text" : "password";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", visible ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    button.innerHTML = visible ? EYE_OFF : EYE;
  }
  toggles.forEach(button => {
    setPasswordVisible(button, false);
    button.addEventListener("click", () => setPasswordVisible(button, button.getAttribute("aria-pressed") !== "true"));
  });

  // Sửa trường nào thì xóa lỗi của trường đó
  modal.querySelectorAll(".rg-input").forEach(input => {
    const clear = () => {
      if(input.getAttribute("aria-invalid") !== "true") return;
      input.removeAttribute("aria-invalid");
      const error = document.getElementById(input.id + "Error");
      if(error){ error.hidden = true; error.textContent = ""; }
    };
    input.addEventListener("input", clear);
    input.addEventListener("change", clear);
  });

  // Theo dõi vùng nhìn thấy thực (trừ bàn phím ảo) khi hộp thoại mở
  const vv = window.visualViewport;
  function syncViewport(){
    if(modal.hidden) return;
    if(vv){
      modal.style.setProperty("--rg-vh", vv.height + "px");
      modal.style.setProperty("--rg-top", vv.offsetTop + "px");
      modal.classList.toggle("is-keyboard", window.innerHeight - vv.height > 120);
    }else{
      modal.style.setProperty("--rg-vh", window.innerHeight + "px");
    }
    keepFocusedFieldVisible();
  }
  function keepFocusedFieldVisible(){
    const active = document.activeElement;
    if(!active || !body.contains(active) || !active.matches("input,select")) return;
    const field = active.closest(".rg-field") || active;
    const box = body.getBoundingClientRect();
    const rect = field.getBoundingClientRect();
    if(rect.bottom > box.bottom - 8) body.scrollTop += rect.bottom - box.bottom + 12;
    else if(rect.top < box.top + 8) body.scrollTop -= box.top - rect.top + 12;
  }
  if(vv){
    vv.addEventListener("resize", syncViewport);
    vv.addEventListener("scroll", syncViewport);
  }
  window.addEventListener("resize", syncViewport);
  modal.addEventListener("focusin", () => setTimeout(keepFocusedFieldVisible, 260));

  // Esc để đóng, giữ Tab trong hộp thoại
  document.addEventListener("keydown", event => {
    if(modal.hidden) return;
    if(event.key === "Escape"){
      event.preventDefault();
      if(typeof closeRegisterModal === "function") closeRegisterModal();
      return;
    }
    if(event.key !== "Tab") return;
    const items = [...modal.querySelectorAll("button,input,select,[tabindex]:not([tabindex='-1'])")]
      .filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
    if(!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
  });

  window.ubktRegisterUi = {
    beforeOpen(){
      lastFocus = document.activeElement;
      toggles.forEach(button => setPasswordVisible(button, false));
      // đo vùng nhìn thấy ngay khi mở
      requestAnimationFrame(syncViewport);
    },
    afterClose(){
      toggles.forEach(button => setPasswordVisible(button, false));
      modal.style.removeProperty("--rg-vh");
      modal.style.removeProperty("--rg-top");
      modal.classList.remove("is-keyboard");
      if(lastFocus && document.contains(lastFocus) && lastFocus.offsetParent !== null) lastFocus.focus();
      lastFocus = null;
    }
  };
})();
