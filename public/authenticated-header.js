import { logout } from "./api-client.js";

document.querySelectorAll(".logout").forEach((button) => button.addEventListener("click", logout));
