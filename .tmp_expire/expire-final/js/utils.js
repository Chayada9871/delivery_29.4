function login(username, password) {
  if (username === "admin" && password === "1234") {
    const user = {
      username: "admin",
      role: "admin"
    };
    localStorage.setItem("user", JSON.stringify(user));
    return { success: true, user };
  }

  return {
    success: false,
    message: "Invalid username or password"
  };
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "