export function login(username, password) {
  if (username === "admin" && password === "1234") {
    localStorage.setItem("user", JSON.stringify({
      username,
      role: "admin"
    }));
    return true;
  }
  return false;
}

export function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

export function getUser() {
  return JSON.parse(localStorage.getItem("user"));
}