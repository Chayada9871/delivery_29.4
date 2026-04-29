import { getUser } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const user = getUser();

  if (!user && !window.location.pathname.includes("login")) {
    window.location.href = "login.html";
  }
});