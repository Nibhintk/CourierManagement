const bcrypt = require("bcryptjs");

async function hashPassword() {
  const password = "admin123"; // your admin password
  const hashed = await bcrypt.hash(password, 10);
  console.log(hashed);
}

hashPassword();
