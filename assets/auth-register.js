/* Hành vi hiển thị riêng cho hộp thoại đăng ký.
   Luồng dữ liệu, validation, submit, focus trap và mật khẩu do auth-experience.js quản lý. */
(function(){
  "use strict";
  const modal = document.getElementById("registerModal");
  const body = document.getElementById("registerBody");
  if(!modal || !body) return;

  const vv = window.visualViewport;

  function keepFocusedFieldVisible(){
    const active = document.activeElement;
    if(!active || !body.contains(active) || !active.matches("input,select")) return;
    const field = active.closest(".rg-field") || active;
    const bodyBox = body.getBoundingClientRect();
    const fieldBox = field.getBoundingClientRect();
    if(fieldBox.bottom > bodyBox.bottom - 8) body.scrollTop += fieldBox.bottom - bodyBox.bottom + 12;
    else if(fieldBox.top < bodyBox.top + 8) body.scrollTop -= bodyBox.top - fieldBox.top + 12;
  }

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

  if(vv){
    vv.addEventListener("resize", syncViewport);
    vv.addEventListener("scroll", syncViewport);
  }
  window.addEventListener("resize", syncViewport);
  modal.addEventListener("focusin", () => setTimeout(keepFocusedFieldVisible, 260));

  window.ubktRegisterUi = {
    beforeOpen(){
      body.scrollTop = 0;
      requestAnimationFrame(syncViewport);
    },
    afterClose(){
      modal.style.removeProperty("--rg-vh");
      modal.style.removeProperty("--rg-top");
      modal.classList.remove("is-keyboard");
    }
  };
})();
