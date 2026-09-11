import { logout } from "./api-client.js";
import { setupMobileMenu } from "./ui.js";

document.querySelectorAll(".logout").forEach((button) => button.addEventListener("click", logout));
setupMobileMenu();
